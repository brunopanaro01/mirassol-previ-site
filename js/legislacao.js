import { supabase } from "../admin/components/supabase-client.js";

const STORAGE_BUCKET = "legislation-documents";

const CATEGORIES = [
  "Lei",
  "Lei Complementar",
  "Decreto",
  "Portaria",
  "Resolução",
  "Instrução Normativa",
  "Outro ato normativo"
];

const CATEGORY_LABELS = {
  Lei: "Leis",
  "Lei Complementar": "Leis Complementares",
  Decreto: "Decretos",
  Portaria: "Portarias",
  Resolução: "Resoluções",
  "Instrução Normativa": "Instruções Normativas",
  "Outro ato normativo": "Outros atos normativos"
};

const TYPE_NAMES = {
  law: "Lei",
  complementary_law: "Lei Complementar",
  decree: "Decreto",
  ordinance: "Portaria",
  resolution: "Resolução",
  normative_instruction: "Instrução Normativa",
  other: "Outro ato normativo"
};

const STATUS_LABELS = {
  in_force: "Em vigor",
  revoked: "Revogado",
  amended: "Alterado",
  suspended: "Suspenso",
  without_effect: "Sem efeito"
};

class LegislationRepository {
  async list() {
    const { data, error } = await supabase.rpc(
      "legislation_list_published"
    );

    if (error) {
      throw new Error(
        `Não foi possível carregar a legislação: ${error.message}`
      );
    }

    if (!Array.isArray(data)) {
      throw new TypeError(
        "A API de legislação retornou um formato inválido."
      );
    }

    return data.map(normalizeRecord).filter(Boolean);
  }
}

const normalizeText = (value) => String(value ?? "").trim();

const normalizeForSearch = (value) =>
  normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

function formatPublicationDate(value) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return "";
  }

  const match = normalizedValue.match(
    /^(\d{4})-(\d{2})-(\d{2})/
  );

  if (!match) {
    return normalizedValue;
  }

  const [, year, month, day] = match;

  return `${day}/${month}/${year}`;
}

function buildDocumentUrl(record) {
  const externalUrl = normalizeText(record.external_url);

  if (externalUrl) {
    return externalUrl;
  }

  const filePath = normalizeText(record.file_path);

  if (!filePath) {
    return "";
  }

  const { data } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(filePath);

  return normalizeText(data?.publicUrl);
}

function normalizeRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const tipo =
    normalizeText(record.type_name) ||
    TYPE_NAMES[normalizeText(record.type_code)];

  const numero = normalizeText(record.number);
  const ano = Number(record.year);
  const data = formatPublicationDate(
    record.publication_date
  );

  const ementa = normalizeText(record.summary);
  const situacao =
    STATUS_LABELS[normalizeText(record.status)] ||
    normalizeText(record.status);

  const arquivo = buildDocumentUrl(record);

  if (
    !CATEGORIES.includes(tipo) ||
    !numero ||
    !Number.isInteger(ano) ||
    !ementa
  ) {
    console.warn(
      "Registro de legislação ignorado por estar incompleto:",
      record
    );

    return null;
  }

  return {
    tipo,
    numero,
    ano,
    data,
    ementa,
    situacao,
    arquivo
  };
}

function isSafeDocumentUrl(value) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value, window.location.origin);

    const isLocalDevelopment =
      url.hostname === "127.0.0.1" ||
      url.hostname === "localhost";

    return url.protocol === "https:" ||
      (url.protocol === "http:" && isLocalDevelopment);
  } catch {
    return false;
  }
}

class LegislationCatalog {
  constructor(repository) {
    this.repository = repository;
    this.records = [];
    this.query = '';
    this.filter = 'all';
    this.catalog = document.getElementById('legislation-catalog');
    this.loading = document.getElementById('loading-state');
    this.error = document.getElementById('error-state');
    this.count = document.getElementById('results-count');
    this.countLabel = document.getElementById('results-label');
    this.expandButton = document.getElementById('expand-all');
  }

  async initialize() {
    this.bindEvents();

    try {
      this.records = await this.repository.list();
      this.loading.hidden = true;
      this.render();
    } catch (error) {
      console.error(error);
      this.loading.hidden = true;
      this.error.textContent = 'Não foi possível carregar os atos normativos. Tente novamente mais tarde.';
      this.error.hidden = false;
      this.updateCount(0);
    }
  }

  bindEvents() {
    document.getElementById('legislation-search').addEventListener('input', (event) => {
      this.query = normalizeForSearch(event.target.value);
      this.render();
    });

    document.getElementById('quick-filters').addEventListener('click', (event) => {
      const button = event.target.closest('[data-filter]');
      if (!button) return;

      this.filter = button.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach((item) => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      this.render();
    });

    this.expandButton.addEventListener('click', () => {
      const triggers = [...this.catalog.querySelectorAll('.accordion-trigger')];
      const shouldExpand = triggers.some((trigger) => trigger.getAttribute('aria-expanded') === 'false');
      triggers.forEach((trigger) => this.setAccordionState(trigger, shouldExpand));
      this.expandButton.textContent = shouldExpand ? 'Recolher tudo' : 'Expandir tudo';
    });
  }

  getFilteredRecords() {
    return this.records.filter((record) => {
      const [filterKind, filterValue] = this.filter.split(':');
      const matchesFilter = this.filter === 'all'
        || (filterKind === 'type' && record.tipo === filterValue)
        || (filterKind === 'status' && normalizeForSearch(record.situacao) === normalizeForSearch(filterValue));

      if (!matchesFilter) return false;
      if (!this.query) return true;

      return normalizeForSearch([
        record.tipo,
        CATEGORY_LABELS[record.tipo],
        record.numero,
        record.ano,
        record.data,
        record.ementa,
        record.situacao
      ].join(' ')).includes(this.query);
    });
  }

  render() {
    const records = this.getFilteredRecords();
    this.catalog.replaceChildren();
    this.updateCount(records.length);

    if (!records.length) {
      if (!this.records.length && !this.query && this.filter === 'all') {
        CATEGORIES.forEach((category) => {
          this.catalog.appendChild(this.createCategory(category, new Map()));
        });
        this.expandButton.disabled = false;
        return;
      }

      const message = document.createElement('div');
      message.className = 'empty-message';
      message.textContent = 'Nenhum ato normativo corresponde à pesquisa ou ao filtro selecionado.';
      this.catalog.appendChild(message);
      this.expandButton.disabled = true;
      return;
    }

    this.expandButton.disabled = false;
    const grouped = this.groupRecords(records);

    CATEGORIES.forEach((category) => {
      const categoryRecords = grouped.get(category);
      if (!categoryRecords) return;
      this.catalog.appendChild(this.createCategory(category, categoryRecords));
    });
  }

  groupRecords(records) {
    const grouped = new Map();

    records.forEach((record) => {
      if (!grouped.has(record.tipo)) grouped.set(record.tipo, new Map());
      const years = grouped.get(record.tipo);
      if (!years.has(record.ano)) years.set(record.ano, []);
      years.get(record.ano).push(record);
    });

    grouped.forEach((years) => {
      years.forEach((items) => items.sort((a, b) => b.numero.localeCompare(a.numero, 'pt-BR', { numeric: true })));
    });

    return grouped;
  }

  createCategory(category, years) {
    const total = [...years.values()].reduce((sum, records) => sum + records.length, 0);
    const section = document.createElement('section');
    section.className = 'accordion';

    const trigger = this.createAccordionTrigger(
      CATEGORY_LABELS[category],
      `${total} ${total === 1 ? 'documento' : 'documentos'}`,
      true
    );
    const panel = document.createElement('div');
    panel.className = 'accordion-panel';
    panel.id = trigger.getAttribute('aria-controls');

    if (!years.size) {
      const empty = document.createElement('div');
      empty.className = 'empty-message';
      empty.textContent = `Nenhum documento da categoria ${CATEGORY_LABELS[category]} foi cadastrado até o momento.`;
      panel.appendChild(empty);
    }

    [...years.entries()]
      .sort(([yearA], [yearB]) => yearB - yearA)
      .forEach(([year, records], index) => {
        panel.appendChild(this.createYear(year, records, index === 0));
      });

    trigger.addEventListener('click', () => this.toggleAccordion(trigger));
    section.append(trigger, panel);
    return section;
  }

  createYear(year, records, expanded) {
    const section = document.createElement('section');
    section.className = 'year-group';
    const trigger = this.createAccordionTrigger(
      String(year),
      `${records.length} ${records.length === 1 ? 'documento' : 'documentos'}`,
      expanded,
      'year-trigger'
    );
    const panel = document.createElement('div');
    panel.className = 'accordion-panel year-panel';
    panel.id = trigger.getAttribute('aria-controls');
    panel.hidden = !expanded;

    const grid = document.createElement('div');
    grid.className = 'documents-grid';
    records.forEach((record) => grid.appendChild(this.createDocumentCard(record)));
    panel.appendChild(grid);

    trigger.addEventListener('click', () => this.toggleAccordion(trigger));
    section.append(trigger, panel);
    return section;
  }

  createAccordionTrigger(title, meta, expanded, extraClass = '') {
    const button = document.createElement('button');
    const panelId = `accordion-${crypto.randomUUID()}`;
    button.type = 'button';
    button.className = `accordion-trigger ${extraClass}`.trim();
    button.setAttribute('aria-expanded', String(expanded));
    button.setAttribute('aria-controls', panelId);

    const text = document.createElement('span');
    text.className = 'trigger-text';
    const titleElement = document.createElement('span');
    titleElement.textContent = title;
    const metaElement = document.createElement('span');
    metaElement.className = 'accordion-count';
    metaElement.textContent = meta;
    text.append(titleElement, metaElement);

    const chevron = document.createElement('span');
    chevron.className = 'chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '⌄';
    button.append(text, chevron);
    return button;
  }

  createDocumentCard(record) {
    const article = document.createElement('article');
    article.className = 'document-card';

    const title = document.createElement('h4');
    title.textContent = `${record.tipo.toLocaleUpperCase('pt-BR')} Nº ${record.numero}`;

    const data = document.createElement('dl');
    data.className = 'document-data';
    this.appendData(data, 'Data:', record.data || 'Não informada');
    this.appendData(data, 'Ementa:', record.ementa);

    const statusTerm = document.createElement('dt');
    statusTerm.textContent = 'Situação:';
    const statusDescription = document.createElement('dd');
    const status = document.createElement('span');
    status.className = `status-badge ${normalizeForSearch(record.situacao) === 'revogado' ? 'revogado' : ''}`.trim();
    status.textContent = record.situacao || 'Não informada';
    statusDescription.appendChild(status);
    data.append(statusTerm, statusDescription);

    article.append(title, data);

    if (isSafeDocumentUrl(record.arquivo)) {
      const link = document.createElement('a');
      link.className = 'document-link';
      link.href = record.arquivo;
      link.target = '_blank';
      link.rel = 'noopener';
      link.setAttribute('aria-label', `Visualizar PDF: ${record.tipo} nº ${record.numero}`);
      link.textContent = 'Abrir documento ↗';
      article.appendChild(link);
    } else {
      const unavailable = document.createElement('span');
      unavailable.className = 'muted';
      unavailable.textContent = 'Documento indisponível.';
      article.appendChild(unavailable);
    }

    return article;
  }

  appendData(list, label, value) {
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value;
    list.append(term, description);
  }

  toggleAccordion(trigger) {
    this.setAccordionState(trigger, trigger.getAttribute('aria-expanded') !== 'true');
  }

  setAccordionState(trigger, expanded) {
    trigger.setAttribute('aria-expanded', String(expanded));
    const panel = document.getElementById(trigger.getAttribute('aria-controls'));
    if (panel) panel.hidden = !expanded;
  }

  updateCount(total) {
    this.count.textContent = String(total);
    this.countLabel.textContent = total === 1 ? 'documento encontrado' : 'documentos encontrados';
  }
}

function initializePortalChrome() {
  document.getElementById('footer-year').textContent = new Date().getFullYear();

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      observer.unobserve(entry.target);
    });
  }, { threshold: .12 });
  document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));

  const hamburger = document.querySelector('.hamb');
  const menu = document.getElementById('menu');
  hamburger?.addEventListener('click', () => {
    const open = menu.classList.toggle('show');
    hamburger.setAttribute('aria-expanded', String(open));
  });

  document.querySelectorAll('.has-sub > button').forEach((button) => {
    button.addEventListener('click', () => {
      const container = button.closest('.has-sub');
      const open = container.classList.toggle('open');
      button.setAttribute('aria-expanded', String(open));
    });
  });
}

initializePortalChrome();
new LegislationCatalog(new LegislationRepository()).initialize();
