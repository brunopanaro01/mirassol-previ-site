import { safeHttps } from "./url-utils.js";

const FALLBACK_URL = "./publicacoes.json";
const STORAGE_BUCKET = "publication-documents";

const CATEGORY_LABELS = Object.freeze({
  progestao_certificate: "Certificação Pró-Gestão",
  governance_report: "Relatórios de Governança",
  guidance_booklet: "Cartilhas orientativas",
  capacity_plan: "Planos de Ação de Capacitação",
  ethics_code: "Código de Ética",
  posic: "POSIC",
  action_plan: "Plano de Ação",
  action_plan_monitoring: "Acompanhamento do Plano de Ação",
  certificate: "Certidões",
  other: "Outras publicações"
});

let supabaseClient = null;
let snapshot = null;

function text(value) {
  return String(value ?? "").trim();
}

function formatDate(value) {
  if (!value) return "";
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return text(value);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function documentUrl(record) {
  const external = safeHttps(record.external_url);
  if (external) return external;
  if (!record.file_path || !supabaseClient) return "";
  const { data } = supabaseClient.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(record.file_path);
  return safeHttps(data?.publicUrl);
}

function drivePreview(url) {
  if (!url.includes("drive.google.com/file/d/")) return url;
  return url.replace(/\/view(?:\?.*)?$/, "/preview");
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function badge(label, extraClass = "") {
  return element("span", `badge ${extraClass}`.trim(), label);
}

function openDocument(record) {
  const url = documentUrl(record);
  if (!url) return;
  const dialog = document.querySelector("#document-dialog");
  const title = dialog.querySelector("#dialog-title");
  const frame = dialog.querySelector("#document-frame");
  const external = dialog.querySelector("#dialog-external");
  title.textContent = record.title;
  frame.src = drivePreview(url);
  external.href = url;
  dialog.showModal();
}

function statusBadge(record) {
  if (record.category === "certificate" && record.valid_until) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(`${record.valid_until}T12:00:00`);
    const days = Math.ceil((expiry - today) / 86400000);
    if (days < 0) return badge("Vencida", "expired");
    if (days <= 30) return badge("Próxima do vencimento", "expiring");
    return badge("Vigente", "valid");
  }
  if (record.status === "current") return badge("Vigente", "current");
  return badge("Histórico");
}

function documentCard(record) {
  const card = element("article", "card");
  card.append(element("h3", "", record.title));
  if (record.description) card.append(element("p", "", record.description));
  const meta = element("div", "card-meta");
  meta.append(statusBadge(record));
  if (record.reference_year) meta.append(badge(String(record.reference_year)));
  if (record.version_label) meta.append(badge(`Versão ${record.version_label}`));
  if (record.valid_until) meta.append(badge(`Validade: ${formatDate(record.valid_until)}`));
  card.append(meta);
  const url = documentUrl(record);
  if (url) {
    const actions = element("div", "actions");
    const view = element("button", "button button-primary", "Visualizar no portal");
    view.type = "button";
    view.addEventListener("click", () => openDocument(record));
    const external = element("a", "button", "Abrir em nova aba ↗");
    external.href = url;
    external.target = "_blank";
    external.rel = "noopener";
    actions.append(view, external);
    card.append(actions);
  }
  return card;
}

function publishedDocuments(category) {
  return (snapshot.documents ?? [])
    .filter((record) => record.is_published && record.category === category)
    .filter((record) => category !== "guidance_booklet" || record.status === "current")
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "current" ? -1 : 1;
      return Number(b.reference_year ?? 0) - Number(a.reference_year ?? 0)
        || Number(a.display_order ?? 0) - Number(b.display_order ?? 0);
    });
}

function renderDocumentGroup(targetId, categories, emptyMessage) {
  const target = document.querySelector(targetId);
  target.replaceChildren();
  let count = 0;
  categories.forEach((category) => {
    const records = publishedDocuments(category);
    if (!records.length) return;
    const group = element("section", "publication-group");
    group.append(element("h3", "", CATEGORY_LABELS[category] ?? category));
    const grid = element("div", "grid grid-3");
    records.forEach((record) => grid.append(documentCard(record)));
    group.append(grid);
    target.append(group);
    count += records.length;
  });
  if (!count) target.append(element("div", "empty", emptyMessage));
}

function renderCertifications() {
  renderDocumentGroup(
    "#certification-publications",
    ["progestao_certificate"],
    "Nenhum certificado institucional foi publicado."
  );
  renderDocumentGroup(
    "#certificates-list",
    ["certificate"],
    "Nenhuma certidão foi publicada."
  );
}

function renderPublications() {
  renderDocumentGroup(
    "#governance-publications",
    ["governance_report", "ethics_code", "posic", "other"],
    "Nenhuma publicação de governança foi cadastrada."
  );
  renderDocumentGroup(
    "#education-publications",
    ["guidance_booklet", "capacity_plan"],
    "Nenhuma publicação de educação previdenciária foi cadastrada."
  );
  renderDocumentGroup(
    "#planning-publications",
    ["action_plan", "action_plan_monitoring"],
    "Nenhum documento de planejamento foi cadastrado."
  );
}

function memberCard(record) {
  const card = element("article", "member");
  const image = document.createElement("img");
  image.src = text(record.image_path) || "semfoto.jpeg";
  image.alt = `Foto de ${record.name}`;
  image.loading = "lazy";
  const info = element("div");
  info.append(element("strong", "", record.name), element("span", "", record.role));
  card.append(image, info);
  return card;
}

function meetingItem(record) {
  const item = element("article", "meeting");
  item.append(element("strong", "", `${formatDate(record.meeting_date)} — ${record.meeting_type}`));
  if (record.agenda) item.append(element("p", "", record.agenda));
  if (record.expected_result) item.append(element("p", "", `Resultado previsto: ${record.expected_result}`));
  return item;
}

function renderAgenda(container, bodyCode) {
  const meetings = (snapshot.meetings ?? [])
    .filter((record) => record.is_published && record.body_code === bodyCode)
    .sort((a, b) => String(a.meeting_date).localeCompare(String(b.meeting_date)));
  if (!meetings.length) {
    container.append(element("div", "empty", "Agenda ainda não publicada."));
    return;
  }
  const years = [...new Set(meetings.map((record) => Number(record.year)))].sort((a, b) => b - a);
  const buttons = element("div", "year-buttons");
  const list = element("div", "meeting-list");
  function selectYear(year) {
    buttons.querySelectorAll("button").forEach((button) => button.classList.toggle("active", Number(button.dataset.year) === year));
    list.replaceChildren(...meetings.filter((record) => Number(record.year) === year).map(meetingItem));
  }
  years.forEach((year) => {
    const button = element("button", "year-button", String(year));
    button.type = "button";
    button.dataset.year = String(year);
    button.addEventListener("click", () => selectYear(year));
    buttons.append(button);
  });
  container.append(buttons, list);
  selectYear(years[0]);
}

function collegiateBlock(body) {
  const details = element("details", "card collegiate");
  if (body.code === "conselho") details.open = true;
  const summary = element("summary", "", body.name);
  const content = element("div", "collegiate-content");
  const head = element("div", "collegiate-head");
  const info = element("div");
  info.append(
    element("p", "", `Periodicidade prevista: ${body.periodicity}.`),
    element("p", "", body.last_updated ? `Última atualização: ${formatDate(body.last_updated)}.` : "")
  );
  const officialUrl = safeHttps(body.official_url);
  if (officialUrl) {
    const official = element("a", "button", "Consultar portal oficial ↗");
    official.href = officialUrl;
    official.target = "_blank";
    official.rel = "noopener";
    head.append(info, official);
  } else {
    head.append(info);
  }
  content.append(head);
  if (body.status === "pending") {
    content.append(element("div", "empty", "O Conselho Fiscal ainda não está formalmente constituído. A composição, os atos e o calendário serão disponibilizados após sua instituição e publicação oficial."));
  } else {
    content.append(element("h3", "", "Composição"));
    const members = (snapshot.members ?? [])
      .filter((record) => record.is_active && record.body_code === body.code)
      .sort((a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0));
    const memberGrid = element("div", "members");
    members.forEach((record) => memberGrid.append(memberCard(record)));
    content.append(members.length ? memberGrid : element("div", "empty", "Composição ainda não publicada."));
    const agenda = element("section", "agenda");
    agenda.append(element("h3", "", "Agenda de reuniões"));
    renderAgenda(agenda, body.code);
    content.append(agenda);
  }
  details.append(summary, content);
  return details;
}

function renderCollegiates() {
  const target = document.querySelector("#collegiate-list");
  target.replaceChildren();
  (snapshot.bodies ?? [])
    .sort((a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0))
    .forEach((body) => target.append(collegiateBlock(body)));
}

function youtubeId(value) {
  try {
    const url = new URL(value);
    if (url.hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (url.pathname.startsWith("/live/")) return url.pathname.split("/")[2] ?? "";
    return url.searchParams.get("v") ?? "";
  } catch {
    return "";
  }
}

function audienceCard(record) {
  const card = element("article", "card video-card");
  const media = element("div");
  const placeholder = element("button", "video-placeholder");
  placeholder.type = "button";
  placeholder.append(element("span", "", "▶ Assistir no portal"));
  const id = youtubeId(record.youtube_url);
  placeholder.addEventListener("click", () => {
    if (!id) return;
    const iframe = element("iframe", "video-frame");
    iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1`;
    iframe.title = record.title;
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    placeholder.replaceWith(iframe);
  });
  media.append(placeholder);
  const info = element("div");
  info.append(element("h3", "", record.title));
  if (record.event_date) info.append(element("p", "", `Data: ${formatDate(record.event_date)}`));
  if (record.description) info.append(element("p", "", record.description));
  const actions = element("div", "actions");
  const youtube = element("a", "button", "Assistir no YouTube ↗");
  youtube.href = safeHttps(record.youtube_url);
  youtube.target = "_blank";
  youtube.rel = "noopener";
  actions.append(youtube);
  info.append(actions);
  card.append(media, info);
  return card;
}

function renderAudiences() {
  const target = document.querySelector("#audience-list");
  const records = (snapshot.audiences ?? [])
    .filter((record) => record.is_published)
    .sort((a, b) => Number(b.year) - Number(a.year));
  target.replaceChildren(...records.map(audienceCard));
  if (!records.length) target.append(element("div", "empty", "Nenhuma audiência pública foi publicada."));
}

async function fallbackSnapshot() {
  const response = await fetch(FALLBACK_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Falha ao carregar ${FALLBACK_URL}.`);
  return response.json();
}

async function loadSnapshot() {
  const fallback = await fallbackSnapshot();
  try {
    const module = await import("../admin/components/supabase-client.js");
    supabaseClient = module.supabase;
    const { data, error } = await supabaseClient.rpc("publications_public_snapshot");
    if (error) throw error;
    if (!data || typeof data !== "object") throw new TypeError("Resposta inválida do módulo de Publicações.");
    return { ...fallback, ...data };
  } catch (error) {
    console.info("Publicações carregadas da fonte de contingência.", error);
    return fallback;
  }
}

function configureNavigation() {
  const hamburger = document.querySelector(".hamb");
  const menu = document.querySelector("#menu");
  hamburger?.addEventListener("click", () => {
    const open = menu.classList.toggle("show");
    hamburger.setAttribute("aria-expanded", String(open));
  });
  document.querySelectorAll(".has-sub > button").forEach((button) => {
    button.addEventListener("click", () => {
      const parent = button.closest(".has-sub");
      const open = parent.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
    });
  });
}

function configureDialog() {
  const dialog = document.querySelector("#document-dialog");
  const close = dialog.querySelector("#dialog-close");
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    dialog.querySelector("#document-frame").src = "about:blank";
  });
}

async function initialize() {
  configureNavigation();
  configureDialog();
  document.querySelector("#year").textContent = new Date().getFullYear();
  try {
    snapshot = await loadSnapshot();
    renderCertifications();
    renderPublications();
    renderCollegiates();
    renderAudiences();
    document.querySelector("#publication-status").textContent = `Informações atualizadas em ${formatDate(snapshot.meta?.updated_at)}.`;
  } catch (error) {
    console.error(error);
    document.querySelector("#publication-status").textContent = "Não foi possível carregar as publicações neste momento.";
  }
}

initialize();
