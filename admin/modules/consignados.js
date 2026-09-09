import { supabase } from "../components/supabase-client.js";

const BUCKET = "consignment-reports";
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MONTHS = Object.freeze([
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
]);

let reports = [];

function setStatus(message, type = "") {
  const element = document.querySelector("#consignments-status");
  if (!element) return;
  element.textContent = message;
  element.className = `form-status ${type}`.trim();
}

function createCell(label, value) {
  const cell = document.createElement("td");
  cell.dataset.label = label;
  cell.textContent = value ?? "—";
  return cell;
}

function actionButton(label, action, id, danger = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `button button-small ${danger ? "button-danger" : "button-secondary"}`;
  button.textContent = label;
  button.dataset.action = action;
  button.dataset.id = id;
  return button;
}

function slugify(value) {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 70);
}

function filePublicUrl(path) {
  if (!path) return "";
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

function reportUrl(report) {
  return report.external_url || filePublicUrl(report.file_path);
}

function renderReports() {
  const body = document.querySelector("#consignments-records");
  const empty = document.querySelector("#consignments-empty");
  const year = document.querySelector("#consignments-year-filter")?.value ?? "";
  const visible = reports.filter(
    (report) => !year || String(report.reference_year) === year
  );

  body.replaceChildren();
  empty.hidden = visible.length > 0;

  visible.forEach((report) => {
    const row = document.createElement("tr");
    row.append(
      createCell("Ano", report.reference_year),
      createCell("Mês", MONTHS[report.reference_month - 1]),
      createCell("Descrição", report.description),
      createCell("Origem", report.file_path ? "PDF no SIGPREVI" : "Link externo"),
      createCell("Portal", report.is_published ? "Publicado" : "Rascunho")
    );

    const actions = document.createElement("td");
    actions.dataset.label = "Ações";
    actions.className = "table-actions";
    actions.append(
      actionButton("Abrir", "open", report.id),
      actionButton("Editar", "edit", report.id),
      actionButton(
        report.is_published ? "Despublicar" : "Publicar",
        "toggle",
        report.id
      )
    );

    if (!report.is_published) {
      actions.append(actionButton("Arquivar", "archive", report.id, true));
    }

    row.append(actions);
    body.append(row);
  });
}

function updateYearFilter() {
  const filter = document.querySelector("#consignments-year-filter");
  const selected = filter.value;
  const years = [...new Set(reports.map((report) => report.reference_year))]
    .sort((a, b) => b - a);

  filter.replaceChildren(new Option("Todos os anos", ""));
  years.forEach((year) => filter.add(new Option(String(year), String(year))));
  filter.value = years.includes(Number(selected)) ? selected : "";
}

async function loadReports(message = "Carregando relatórios...") {
  setStatus(message);
  const { data, error } = await supabase.rpc("consignments_admin_snapshot");
  if (error) throw error;
  reports = Array.isArray(data?.reports) ? data.reports : [];
  updateYearFilter();
  renderReports();
  setStatus(`${reports.length} relatório(s) cadastrado(s).`);
}

function openDialog(report = null) {
  const dialog = document.querySelector("#consignments-dialog");
  const form = dialog.querySelector("form");
  const heading = dialog.querySelector("h2");
  const current = dialog.querySelector(".current-file");

  form.reset();
  form.elements.record_id.value = report?.id ?? "";
  form.elements.reference_year.value = report?.reference_year ?? new Date().getFullYear();
  form.elements.reference_month.value = report?.reference_month ?? new Date().getMonth() + 1;
  form.elements.description.value = report?.description ?? "";
  form.elements.external_url.value = report?.external_url ?? "";
  form.dataset.currentFile = report?.file_path ?? "";
  heading.textContent = report ? "Editar relatório" : "Cadastrar relatório";
  current.textContent = report?.file_path
    ? "PDF atual armazenado no SIGPREVI. Envie outro apenas para substituí-lo."
    : "";
  dialog.showModal();
}

function validatePdf(file) {
  if (!file) return;
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Selecione um arquivo PDF.");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("O PDF deve ter no máximo 20 MB.");
  }
}

async function uploadPdf(file, year, month, description) {
  validatePdf(file);
  const fileName = `${slugify(description) || "relatorio"}-${crypto.randomUUID().slice(0, 8)}.pdf`;
  const path = `${year}/${String(month).padStart(2, "0")}/${fileName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: "application/pdf",
    upsert: false
  });
  if (error) throw error;
  return path;
}

async function saveReport(form) {
  const id = form.elements.record_id.value || null;
  const year = Number(form.elements.reference_year.value);
  const month = Number(form.elements.reference_month.value);
  const description = form.elements.description.value.trim();
  const externalUrl = form.elements.external_url.value.trim();
  const file = form.elements.pdf_file.files[0];
  const previousPath = form.dataset.currentFile || "";

  if (!file && !externalUrl && !previousPath) {
    throw new Error("Envie um PDF ou informe um link HTTPS.");
  }

  let uploadedPath = "";
  let filePath = file ? "" : previousPath;

  try {
    if (file) {
      uploadedPath = await uploadPdf(file, year, month, description);
      filePath = uploadedPath;
    }

    const savedPath = externalUrl ? "" : filePath;
    const { error } = await supabase.rpc("consignments_admin_save_report", {
      p_id: id,
      p_payload: {
        reference_year: year,
        reference_month: month,
        description,
        file_path: savedPath || null,
        external_url: externalUrl || null
      }
    });
    if (error) throw error;
  } catch (error) {
    if (uploadedPath) {
      await supabase.storage.from(BUCKET).remove([uploadedPath]);
    }
    throw error;
  }

  const savedPath = externalUrl ? "" : filePath;
  if (previousPath && previousPath !== savedPath) {
    const { error } = await supabase.storage.from(BUCKET).remove([previousPath]);
    if (error) {
      console.warn("O cadastro foi salvo, mas o PDF substituído não pôde ser removido.", error);
    }
  }
}

async function togglePublication(report) {
  const action = report.is_published ? "despublicar" : "publicar";
  if (!window.confirm(`Deseja ${action} o relatório de ${MONTHS[report.reference_month - 1]}/${report.reference_year}?`)) {
    return;
  }
  const { error } = await supabase.rpc(
    "consignments_admin_set_report_publication",
    { p_id: report.id, p_publish: !report.is_published }
  );
  if (error) throw error;
  await loadReports("Atualizando publicação...");
}

async function archiveReport(report) {
  if (!window.confirm("Arquivar este relatório? Ele será preservado no histórico do banco.")) {
    return;
  }
  const { error } = await supabase.rpc("consignments_admin_archive_report", {
    p_id: report.id
  });
  if (error) throw error;
  await loadReports("Arquivando relatório...");
}

function bindEvents() {
  const dialog = document.querySelector("#consignments-dialog");
  const form = dialog.querySelector("form");

  document.querySelector("#consignments-create-button").addEventListener("click", () => openDialog());
  document.querySelector("#consignments-year-filter").addEventListener("change", renderReports);
  dialog.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => dialog.close());
  });

  form.elements.pdf_file.addEventListener("change", () => {
    if (form.elements.pdf_file.files.length) form.elements.external_url.value = "";
  });
  form.elements.external_url.addEventListener("input", () => {
    if (form.elements.external_url.value.trim()) form.elements.pdf_file.value = "";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await saveReport(form);
      dialog.close();
      await loadReports("Salvando relatório...");
    } catch (error) {
      console.error(error);
      setStatus(error.message ?? "Não foi possível salvar o relatório.", "error");
    } finally {
      submit.disabled = false;
    }
  });

  document.querySelector("#consignments-records").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const report = reports.find((item) => item.id === button.dataset.id);
    if (!report) return;
    try {
      if (button.dataset.action === "open") {
        window.open(reportUrl(report), "_blank", "noopener");
      } else if (button.dataset.action === "edit") {
        openDialog(report);
      } else if (button.dataset.action === "toggle") {
        await togglePublication(report);
      } else if (button.dataset.action === "archive") {
        await archiveReport(report);
      }
    } catch (error) {
      console.error(error);
      setStatus(error.message ?? "Não foi possível concluir a operação.", "error");
    }
  });
}

function moduleMarkup() {
  const monthOptions = MONTHS.map(
    (month, index) => `<option value="${index + 1}">${month}</option>`
  ).join("");

  return `
    <div class="module-heading">
      <div>
        <p class="eyebrow">Módulo administrativo</p>
        <h1>Relatórios de consignados</h1>
        <p class="page-description">Cadastre, revise e publique os relatórios mensais exibidos no portal.</p>
      </div>
      <a class="button button-secondary button-auto admin-portal-link" href="../consignado.html" target="_blank" rel="noopener">Ver página pública</a>
    </div>
    <div class="publication-panel-heading">
      <div class="form-field">
        <label for="consignments-year-filter">Filtrar ano</label>
        <select id="consignments-year-filter"><option value="">Todos os anos</option></select>
      </div>
      <button id="consignments-create-button" class="button button-primary button-auto" type="button">Cadastrar relatório</button>
    </div>
    <p id="consignments-status" class="form-status" role="status" aria-live="polite">Carregando módulo...</p>
    <section class="data-card">
      <div class="table-wrapper">
        <table>
          <thead><tr><th>Ano</th><th>Mês</th><th>Descrição</th><th>Origem</th><th>Portal</th><th>Ações</th></tr></thead>
          <tbody id="consignments-records"></tbody>
        </table>
      </div>
      <p id="consignments-empty" class="empty-state" hidden>Nenhum relatório encontrado.</p>
    </section>
    <dialog id="consignments-dialog" class="document-dialog">
      <form method="dialog" class="document-form">
        <div class="dialog-heading">
          <div><p class="eyebrow">Consignados</p><h2>Cadastrar relatório</h2></div>
          <button type="button" class="dialog-close" data-close-dialog aria-label="Fechar">×</button>
        </div>
        <input type="hidden" name="record_id">
        <div class="document-form-grid">
          <div class="form-field"><label>Ano</label><input name="reference_year" type="number" min="2024" max="2200" required></div>
          <div class="form-field"><label>Mês</label><select name="reference_month" required>${monthOptions}</select></div>
          <div class="form-field form-field-wide"><label>Descrição</label><textarea name="description" minlength="5" maxlength="200" required></textarea></div>
          <div class="form-field form-field-wide"><label>Enviar PDF (máx. 20 MB)</label><input name="pdf_file" type="file" accept="application/pdf,.pdf"></div>
          <div class="form-field form-field-wide"><label>Ou link HTTPS / Google Drive</label><input name="external_url" type="url" pattern="https://.*" placeholder="https://..."></div>
          <p class="current-file form-field-wide"></p>
        </div>
        <div class="dialog-actions">
          <button type="button" class="button button-secondary" data-close-dialog>Cancelar</button>
          <button type="submit" class="button button-primary button-auto">Salvar</button>
        </div>
      </form>
    </dialog>`;
}

export async function initializeConsignmentsModule() {
  document.querySelector("#dashboard-view").hidden = true;
  const moduleView = document.querySelector("#module-view");
  moduleView.hidden = false;
  document.querySelectorAll(".sidebar-link").forEach((link) => link.classList.remove("active"));
  document.querySelector("#consignments-link")?.classList.add("active");
  moduleView.innerHTML = moduleMarkup();
  bindEvents();
  await loadReports();
}
