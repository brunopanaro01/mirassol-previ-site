import { supabase } from "../components/supabase-client.js";

const BUCKET = "publication-documents";
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const CATEGORIES = Object.freeze({
  progestao_certificate: "Certificado Pró-Gestão",
  governance_report: "Relatório de governança",
  guidance_booklet: "Cartilha orientativa",
  capacity_plan: "Plano de ação de capacitação",
  ethics_code: "Código de Ética",
  posic: "POSIC",
  action_plan: "Plano de ação",
  action_plan_monitoring: "Avaliação do plano de ação",
  certificate: "Certidão / certificado",
  other: "Outro documento"
});

const BODY_LABELS = Object.freeze({
  conselho: "Conselho Previdenciário",
  fiscal: "Conselho Fiscal",
  comite: "Comitê de Investimentos"
});

let snapshot = {
  documents: [], bodies: [], members: [], meetings: [], audiences: []
};

function setStatus(message, type = "") {
  const element = document.querySelector("#publications-status");
  if (!element) return;
  element.textContent = message;
  element.className = `form-status ${type}`.trim();
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
}

function slugify(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    .slice(0, 90);
}

function publicId(prefix, label) {
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${prefix}-${slugify(label) || "registro"}-${suffix}`;
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

function fillSelect(select, options, placeholder) {
  select.replaceChildren(new Option(placeholder, ""));
  options.forEach(([value, label]) => select.add(new Option(label, value)));
}

async function loadSnapshot(message = "Carregando publicações...") {
  setStatus(message);
  const { data, error } = await supabase.rpc("publications_admin_snapshot");
  if (error) throw error;
  snapshot = { ...snapshot, ...(data ?? {}) };
  renderAll();
  setStatus("Conteúdo atualizado.");
}

function renderDocuments() {
  const body = document.querySelector("#publication-document-records");
  const empty = document.querySelector("#publication-document-empty");
  const category = document.querySelector("#publication-category-filter")?.value ?? "";
  const records = snapshot.documents.filter((item) => !category || item.category === category);
  body.replaceChildren();
  empty.hidden = records.length > 0;
  records.forEach((record) => {
    const row = document.createElement("tr");
    row.append(
      createCell("Categoria", CATEGORIES[record.category] ?? record.category),
      createCell("Título", record.title),
      createCell("Ano", record.reference_year),
      createCell("Versão", record.status === "current" ? "Atual" : "Histórico"),
      createCell("Portal", record.is_published ? "Publicado" : "Rascunho")
    );
    const actions = document.createElement("td");
    actions.dataset.label = "Ações";
    actions.className = "table-actions";
    actions.append(
      actionButton("Editar", "edit-document", record.id),
      actionButton(record.is_published ? "Despublicar" : "Publicar", "toggle-document", record.id)
    );
    if (!record.is_published) actions.append(actionButton("Excluir", "delete-document", record.id, true));
    row.append(actions);
    body.append(row);
  });
}

function renderBodies() {
  const cards = document.querySelector("#publication-body-cards");
  cards.replaceChildren();
  snapshot.bodies.forEach((bodyRecord) => {
    const article = document.createElement("article");
    article.className = "publication-body-card";
    const title = document.createElement("strong");
    title.textContent = bodyRecord.name;
    const detail = document.createElement("span");
    detail.textContent = `${bodyRecord.periodicity} · ${bodyRecord.status === "pending" ? "não constituído" : "ativo"} · revisão ${formatDate(bodyRecord.last_reviewed_on)}`;
    const button = actionButton("Configurar", "edit-body", bodyRecord.code);
    article.append(title, detail, button);
    cards.append(article);
  });
}

function renderMembers() {
  const body = document.querySelector("#publication-member-records");
  const empty = document.querySelector("#publication-member-empty");
  body.replaceChildren();
  empty.hidden = snapshot.members.length > 0;
  snapshot.members.forEach((record) => {
    const row = document.createElement("tr");
    row.append(
      createCell("Colegiado", BODY_LABELS[record.body_code]),
      createCell("Nome", record.name),
      createCell("Função", record.role),
      createCell("Situação", record.is_active ? "Composição atual" : "Histórico")
    );
    const actions = document.createElement("td");
    actions.dataset.label = "Ações";
    actions.className = "table-actions";
    actions.append(actionButton("Editar", "edit-member", record.id));
    row.append(actions);
    body.append(row);
  });
}

function renderMeetings() {
  const body = document.querySelector("#publication-meeting-records");
  const empty = document.querySelector("#publication-meeting-empty");
  body.replaceChildren();
  empty.hidden = snapshot.meetings.length > 0;
  snapshot.meetings.forEach((record) => {
    const row = document.createElement("tr");
    row.append(
      createCell("Colegiado", BODY_LABELS[record.body_code]),
      createCell("Data", formatDate(record.meeting_date)),
      createCell("Tipo", record.meeting_type),
      createCell("Pauta", record.agenda),
      createCell("Portal", record.is_published ? "Publicado" : "Rascunho")
    );
    const actions = document.createElement("td");
    actions.dataset.label = "Ações";
    actions.className = "table-actions";
    actions.append(actionButton("Editar", "edit-meeting", record.id));
    if (!record.is_published) actions.append(actionButton("Excluir", "delete-meeting", record.id, true));
    row.append(actions);
    body.append(row);
  });
}

function renderAudiences() {
  const body = document.querySelector("#publication-audience-records");
  const empty = document.querySelector("#publication-audience-empty");
  body.replaceChildren();
  empty.hidden = snapshot.audiences.length > 0;
  snapshot.audiences.forEach((record) => {
    const row = document.createElement("tr");
    row.append(
      createCell("Ano", record.reference_year),
      createCell("Título", record.title),
      createCell("Data", formatDate(record.event_date)),
      createCell("Portal", record.is_published ? "Publicado" : "Rascunho")
    );
    const actions = document.createElement("td");
    actions.dataset.label = "Ações";
    actions.className = "table-actions";
    actions.append(actionButton("Editar", "edit-audience", record.id));
    if (!record.is_published) actions.append(actionButton("Excluir", "delete-audience", record.id, true));
    row.append(actions);
    body.append(row);
  });
}

function renderAll() {
  renderDocuments();
  renderBodies();
  renderMembers();
  renderMeetings();
  renderAudiences();
}

function switchTab(tabName) {
  document.querySelectorAll("[data-publication-tab]").forEach((button) => {
    const active = button.dataset.publicationTab === tabName;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-publication-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.publicationPanel !== tabName;
  });
}

function openDialog(kind, record = null) {
  const dialog = document.querySelector(`#${kind}-dialog`);
  const form = dialog.querySelector("form");
  form.reset();
  form.elements.record_id.value = record?.id ?? "";
  dialog.querySelector("h2").textContent = record ? "Editar registro" : "Cadastrar registro";

  if (kind === "document") {
    form.elements.category.value = record?.category ?? "";
    form.elements.title.value = record?.title ?? "";
    form.elements.description.value = record?.description ?? "";
    form.elements.reference_year.value = record?.reference_year ?? "";
    form.elements.publication_date.value = record?.publication_date ?? "";
    form.elements.version_label.value = record?.version_label ?? "";
    form.elements.status.value = record?.status ?? "current";
    form.elements.issued_at.value = record?.issued_at ?? "";
    form.elements.valid_until.value = record?.valid_until ?? "";
    form.elements.display_order.value = record?.display_order ?? 10;
    form.elements.external_url.value = record?.external_url ?? "";
    form.dataset.currentFile = record?.file_path ?? "";
    form.dataset.currentUrl = record?.external_url ?? "";
    dialog.querySelector(".current-file").textContent = record
      ? `Fonte atual: ${record.file_path || record.external_url}`
      : "Escolha um PDF ou informe um link HTTPS.";
  } else if (kind === "member") {
    form.elements.body_code.value = record?.body_code ?? "conselho";
    form.elements.name.value = record?.name ?? "";
    form.elements.role.value = record?.role ?? "";
    form.elements.image_path.value = record?.image_path ?? "";
    form.elements.start_date.value = record?.start_date ?? "";
    form.elements.end_date.value = record?.end_date ?? "";
    form.elements.display_order.value = record?.display_order ?? 10;
    form.elements.is_active.checked = record?.is_active ?? true;
  } else if (kind === "meeting") {
    form.elements.body_code.value = record?.body_code ?? "conselho";
    form.elements.meeting_date.value = record?.meeting_date ?? "";
    form.elements.meeting_type.value = record?.meeting_type ?? "Ordinária";
    form.elements.agenda.value = record?.agenda ?? "";
    form.elements.expected_result.value = record?.expected_result ?? "";
    form.elements.is_published.checked = record?.is_published ?? false;
  } else if (kind === "audience") {
    form.elements.reference_year.value = record?.reference_year ?? new Date().getFullYear();
    form.elements.title.value = record?.title ?? "";
    form.elements.event_date.value = record?.event_date ?? "";
    form.elements.description.value = record?.description ?? "";
    form.elements.youtube_url.value = record?.youtube_url ?? "";
    form.elements.is_published.checked = record?.is_published ?? false;
  } else if (kind === "body") {
    form.elements.body_code.value = record.code;
    form.elements.body_name.value = record.name;
    form.elements.body_status.value = record.status;
    form.elements.official_url.value = record.official_url ?? "";
    form.elements.last_reviewed_on.value = record.last_reviewed_on ?? "";
  }
  dialog.showModal();
}

function closeDialog(form) {
  form.closest("dialog").close();
}

async function uploadDocument(file, category, year) {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Selecione um arquivo PDF.");
  }
  if (file.size > MAX_FILE_SIZE) throw new Error("O PDF deve ter no máximo 20 MB.");
  const safeName = slugify(file.name.replace(/\.pdf$/i, "")) || "documento";
  const path = `${category}/${year}/${safeName}-${crypto.randomUUID().slice(0, 8)}.pdf`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600", contentType: "application/pdf", upsert: false
  });
  if (error) throw error;
  return path;
}

async function submitDocument(form) {
  const id = form.elements.record_id.value || null;
  const category = form.elements.category.value;
  const file = form.elements.pdf_file.files[0];
  const enteredUrl = form.elements.external_url.value.trim();
  if (file && enteredUrl) throw new Error("Use somente uma fonte: PDF ou link externo.");
  let filePath = form.dataset.currentFile || null;
  let externalUrl = form.dataset.currentUrl || null;
  if (file) {
    filePath = await uploadDocument(file, category, form.elements.reference_year.value || new Date().getFullYear());
    externalUrl = null;
  } else if (enteredUrl) {
    filePath = null;
    externalUrl = enteredUrl;
  }
  if (!filePath && !externalUrl) throw new Error("Anexe um PDF ou informe um link HTTPS.");
  const title = form.elements.title.value.trim();
  const payload = {
    public_id: recordPublicId(id, "document", title), category, title,
    description: form.elements.description.value.trim(),
    reference_year: form.elements.reference_year.value,
    publication_date: form.elements.publication_date.value,
    version_label: form.elements.version_label.value.trim(),
    status: form.elements.status.value, file_path: filePath,
    external_url: externalUrl, issued_at: form.elements.issued_at.value,
    valid_until: form.elements.valid_until.value,
    display_order: form.elements.display_order.value
  };
  const { error } = await supabase.rpc("publications_admin_save_document", { p_id: id, p_payload: payload });
  if (error) throw error;
  const previousPath = form.dataset.currentFile || "";
  if (previousPath && previousPath !== filePath) {
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([previousPath]);
    if (storageError) console.warn("O registro foi salvo, mas o PDF substituído não pôde ser removido.", storageError);
  }
}

function recordPublicId(id, prefix, label) {
  if (!id) return publicId(prefix, label);
  const collections = [...snapshot.documents, ...snapshot.members, ...snapshot.meetings, ...snapshot.audiences];
  return collections.find((item) => item.id === id)?.public_id ?? publicId(prefix, label);
}

async function submitSimple(kind, form) {
  const id = form.elements.record_id?.value || null;
  let rpc;
  let payload;
  if (kind === "member") {
    rpc = "publications_admin_save_member";
    payload = {
      public_id: recordPublicId(id, "membro", form.elements.name.value),
      body_code: form.elements.body_code.value, name: form.elements.name.value.trim(),
      role: form.elements.role.value.trim(), image_path: form.elements.image_path.value.trim(),
      start_date: form.elements.start_date.value, end_date: form.elements.end_date.value,
      display_order: form.elements.display_order.value, is_active: form.elements.is_active.checked
    };
  } else if (kind === "meeting") {
    rpc = "publications_admin_save_meeting";
    payload = {
      public_id: recordPublicId(id, "reuniao", form.elements.meeting_date.value),
      body_code: form.elements.body_code.value, meeting_date: form.elements.meeting_date.value,
      meeting_type: form.elements.meeting_type.value, agenda: form.elements.agenda.value.trim(),
      expected_result: form.elements.expected_result.value.trim(), is_published: form.elements.is_published.checked
    };
  } else {
    rpc = "publications_admin_save_audience";
    payload = {
      public_id: recordPublicId(id, "audiencia", form.elements.reference_year.value),
      reference_year: form.elements.reference_year.value, title: form.elements.title.value.trim(),
      event_date: form.elements.event_date.value, description: form.elements.description.value.trim(),
      youtube_url: form.elements.youtube_url.value.trim(), is_published: form.elements.is_published.checked
    };
  }
  const { error } = await supabase.rpc(rpc, { p_id: id, p_payload: payload });
  if (error) throw error;
}

async function submitBody(form) {
  const { error } = await supabase.rpc("publications_admin_update_body", {
    p_code: form.elements.body_code.value,
    p_status: form.elements.body_status.value,
    p_official_url: form.elements.official_url.value.trim() || null,
    p_last_reviewed_on: form.elements.last_reviewed_on.value || null
  });
  if (error) throw error;
}

async function deleteRecord(entity, id) {
  if (!window.confirm("Excluir este rascunho? A operação não poderá ser desfeita.")) return;
  const filePath = entity === "document"
    ? snapshot.documents.find((item) => item.id === id)?.file_path
    : null;
  const { error } = await supabase.rpc("publications_admin_delete", { p_entity: entity, p_id: id });
  if (error) throw error;
  if (filePath) {
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([filePath]);
    if (storageError) console.warn("O rascunho foi excluído, mas o PDF não pôde ser removido.", storageError);
  }
  await loadSnapshot("Atualizando listagem...");
}

function bindEvents() {
  document.querySelector("#publication-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-publication-tab]");
    if (button) switchTab(button.dataset.publicationTab);
  });
  document.querySelector("#publication-category-filter").addEventListener("change", renderDocuments);
  document.querySelectorAll("[data-create-kind]").forEach((button) => {
    button.addEventListener("click", () => openDialog(button.dataset.createKind));
  });
  document.querySelectorAll(".document-dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target.matches("[data-close-dialog]")) dialog.close();
    });
  });
  const documentForm = document.querySelector('#document-dialog form');
  documentForm.elements.pdf_file.addEventListener("change", () => {
    if (documentForm.elements.pdf_file.files.length) documentForm.elements.external_url.value = "";
  });
  documentForm.elements.external_url.addEventListener("input", () => {
    if (documentForm.elements.external_url.value.trim()) documentForm.elements.pdf_file.value = "";
  });

  document.querySelector("#module-view").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.dataset.id;
    const find = (items) => items.find((item) => item.id === id || item.code === id);
    try {
      if (button.dataset.action === "edit-document") openDialog("document", find(snapshot.documents));
      if (button.dataset.action === "edit-member") openDialog("member", find(snapshot.members));
      if (button.dataset.action === "edit-meeting") openDialog("meeting", find(snapshot.meetings));
      if (button.dataset.action === "edit-audience") openDialog("audience", find(snapshot.audiences));
      if (button.dataset.action === "edit-body") openDialog("body", find(snapshot.bodies));
      if (button.dataset.action === "delete-document") await deleteRecord("document", id);
      if (button.dataset.action === "delete-meeting") await deleteRecord("meeting", id);
      if (button.dataset.action === "delete-audience") await deleteRecord("audience", id);
      if (button.dataset.action === "toggle-document") {
        const record = find(snapshot.documents);
        const verb = record.is_published ? "despublicar" : "publicar";
        if (window.confirm(`Deseja ${verb} este documento?`)) {
          const { error } = await supabase.rpc("publications_admin_set_document_publication", { p_id: id, p_publish: !record.is_published });
          if (error) throw error;
          await loadSnapshot("Atualizando publicação...");
        }
      }
    } catch (error) {
      console.error(error);
      setStatus(error.message ?? "Não foi possível concluir a operação.", "error");
    }
  });

  document.querySelectorAll("dialog form[data-kind]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        const kind = form.dataset.kind;
        if (kind === "document") await submitDocument(form);
        else if (kind === "body") await submitBody(form);
        else await submitSimple(kind, form);
        closeDialog(form);
        await loadSnapshot("Salvando alterações...");
      } catch (error) {
        console.error(error);
        setStatus(error.message ?? "Não foi possível salvar o registro.", "error");
      } finally {
        submit.disabled = false;
      }
    });
  });
}

function dialogMarkup() {
  const bodyOptions = Object.entries(BODY_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  const categoryOptions = Object.entries(CATEGORIES).map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  return `
    <dialog id="document-dialog" class="document-dialog"><form method="dialog" class="document-form" data-kind="document">
      <div class="dialog-heading"><div><p class="eyebrow">Publicações</p><h2>Cadastrar documento</h2></div><button type="button" class="dialog-close" data-close-dialog aria-label="Fechar">×</button></div>
      <input type="hidden" name="record_id"><div class="document-form-grid">
        <div class="form-field"><label>Categoria</label><select name="category" required><option value="">Selecione</option>${categoryOptions}</select></div>
        <div class="form-field"><label>Ano de referência</label><input name="reference_year" type="number" min="2000" max="2200"></div>
        <div class="form-field form-field-wide"><label>Título</label><input name="title" required minlength="3"></div>
        <div class="form-field form-field-wide"><label>Descrição</label><textarea name="description"></textarea></div>
        <div class="form-field"><label>Data de publicação</label><input name="publication_date" type="date"></div>
        <div class="form-field"><label>Versão / identificação</label><input name="version_label"></div>
        <div class="form-field"><label>Situação da versão</label><select name="status"><option value="current">Atual</option><option value="historical">Histórico</option></select></div>
        <div class="form-field"><label>Ordem</label><input name="display_order" type="number" value="10"></div>
        <div class="form-field"><label>Emissão</label><input name="issued_at" type="date"></div>
        <div class="form-field"><label>Validade</label><input name="valid_until" type="date"></div>
        <div class="form-field form-field-wide"><label>Enviar PDF (máx. 20 MB)</label><input name="pdf_file" type="file" accept="application/pdf,.pdf"></div>
        <div class="form-field form-field-wide"><label>Ou link HTTPS / Google Drive</label><input name="external_url" type="url" pattern="https://.*" placeholder="https://..."></div>
        <p class="current-file form-field-wide"></p>
      </div><div class="dialog-actions"><button type="button" class="button button-secondary" data-close-dialog>Cancelar</button><button type="submit" class="button button-primary button-auto">Salvar</button></div>
    </form></dialog>
    <dialog id="member-dialog" class="document-dialog"><form method="dialog" class="document-form" data-kind="member">
      <div class="dialog-heading"><div><p class="eyebrow">Composição</p><h2>Cadastrar membro</h2></div><button type="button" class="dialog-close" data-close-dialog aria-label="Fechar">×</button></div>
      <input type="hidden" name="record_id"><div class="document-form-grid">
        <div class="form-field"><label>Colegiado</label><select name="body_code" required>${bodyOptions}</select></div><div class="form-field"><label>Ordem</label><input name="display_order" type="number" value="10"></div>
        <div class="form-field"><label>Nome</label><input name="name" required></div><div class="form-field"><label>Função</label><input name="role" required></div>
        <div class="form-field form-field-wide"><label>Imagem no site (caminho existente)</label><input name="image_path" placeholder="imagens/nome.jpg"></div>
        <div class="form-field"><label>Início</label><input name="start_date" type="date"></div><div class="form-field"><label>Término</label><input name="end_date" type="date"></div>
        <label class="checkbox-field form-field-wide"><input name="is_active" type="checkbox" checked> Exibir na composição atual</label>
      </div><div class="dialog-actions"><button type="button" class="button button-secondary" data-close-dialog>Cancelar</button><button type="submit" class="button button-primary button-auto">Salvar</button></div>
    </form></dialog>
    <dialog id="meeting-dialog" class="document-dialog"><form method="dialog" class="document-form" data-kind="meeting">
      <div class="dialog-heading"><div><p class="eyebrow">Agenda</p><h2>Cadastrar reunião</h2></div><button type="button" class="dialog-close" data-close-dialog aria-label="Fechar">×</button></div>
      <input type="hidden" name="record_id"><div class="document-form-grid">
        <div class="form-field"><label>Colegiado</label><select name="body_code" required>${bodyOptions}</select></div><div class="form-field"><label>Data</label><input name="meeting_date" type="date" required></div>
        <div class="form-field"><label>Tipo</label><select name="meeting_type"><option>Ordinária</option><option>Extraordinária</option></select></div><label class="checkbox-field"><input name="is_published" type="checkbox"> Publicar no portal</label>
        <div class="form-field form-field-wide"><label>Pauta</label><textarea name="agenda" required></textarea></div><div class="form-field form-field-wide"><label>Resultado esperado</label><textarea name="expected_result"></textarea></div>
      </div><div class="dialog-actions"><button type="button" class="button button-secondary" data-close-dialog>Cancelar</button><button type="submit" class="button button-primary button-auto">Salvar</button></div>
    </form></dialog>
    <dialog id="audience-dialog" class="document-dialog"><form method="dialog" class="document-form" data-kind="audience">
      <div class="dialog-heading"><div><p class="eyebrow">Audiências</p><h2>Cadastrar audiência</h2></div><button type="button" class="dialog-close" data-close-dialog aria-label="Fechar">×</button></div>
      <input type="hidden" name="record_id"><div class="document-form-grid">
        <div class="form-field"><label>Ano de referência</label><input name="reference_year" type="number" min="2000" max="2200" required></div><div class="form-field"><label>Data da audiência</label><input name="event_date" type="date"></div>
        <div class="form-field form-field-wide"><label>Título</label><input name="title" required></div><div class="form-field form-field-wide"><label>Descrição</label><textarea name="description"></textarea></div>
        <div class="form-field form-field-wide"><label>Link do YouTube</label><input name="youtube_url" type="url" pattern="https://(www\.)?(youtube\.com|youtu\.be)/.*" required></div><label class="checkbox-field form-field-wide"><input name="is_published" type="checkbox"> Publicar no portal</label>
      </div><div class="dialog-actions"><button type="button" class="button button-secondary" data-close-dialog>Cancelar</button><button type="submit" class="button button-primary button-auto">Salvar</button></div>
    </form></dialog>
    <dialog id="body-dialog" class="document-dialog"><form method="dialog" class="document-form" data-kind="body">
      <div class="dialog-heading"><div><p class="eyebrow">Colegiado</p><h2>Configurar colegiado</h2></div><button type="button" class="dialog-close" data-close-dialog aria-label="Fechar">×</button></div>
      <input type="hidden" name="body_code"><div class="document-form-grid">
        <div class="form-field form-field-wide"><label>Nome</label><input name="body_name" readonly></div><div class="form-field"><label>Situação</label><select name="body_status"><option value="active">Ativo</option><option value="pending">Não constituído</option></select></div><div class="form-field"><label>Última revisão</label><input name="last_reviewed_on" type="date" required></div>
        <div class="form-field form-field-wide"><label>Link oficial na Transparência externa</label><input name="official_url" type="url" pattern="https://.*"></div>
      </div><div class="dialog-actions"><button type="button" class="button button-secondary" data-close-dialog>Cancelar</button><button type="submit" class="button button-primary button-auto">Salvar</button></div>
    </form></dialog>`;
}

export async function initializePublicationsModule() {
  document.querySelector("#dashboard-view").hidden = true;
  const moduleView = document.querySelector("#module-view");
  moduleView.hidden = false;
  document.querySelectorAll(".sidebar-link").forEach((link) => link.classList.remove("active"));
  document.querySelector('#publications-link')?.classList.add("active");
  moduleView.innerHTML = `
    <div class="module-heading"><div><p class="eyebrow">Módulo administrativo</p><h1>Publicações do portal</h1><p class="page-description">Gerencie documentos, composição dos colegiados, agenda de reuniões e audiências públicas em um único local.</p></div><a class="button button-secondary button-auto admin-portal-link" href="../transparencia.html" target="_blank" rel="noopener">Ver Transparência</a></div>
    <div id="publication-tabs" class="publication-tabs" role="tablist">
      <button type="button" class="active" data-publication-tab="documents" role="tab" aria-selected="true">Documentos</button><button type="button" data-publication-tab="members" role="tab" aria-selected="false">Composição</button><button type="button" data-publication-tab="meetings" role="tab" aria-selected="false">Agenda</button><button type="button" data-publication-tab="audiences" role="tab" aria-selected="false">Audiências</button>
    </div>
    <p id="publications-status" class="form-status" role="status" aria-live="polite">Carregando módulo...</p>
    <section data-publication-panel="documents"><div class="publication-panel-heading"><div class="form-field"><label for="publication-category-filter">Filtrar categoria</label><select id="publication-category-filter"></select></div><button class="button button-primary button-auto" type="button" data-create-kind="document">Cadastrar documento</button></div><section class="data-card"><div class="table-wrapper"><table><thead><tr><th>Categoria</th><th>Título</th><th>Ano</th><th>Versão</th><th>Portal</th><th>Ações</th></tr></thead><tbody id="publication-document-records"></tbody></table></div><p id="publication-document-empty" class="empty-state" hidden>Nenhum documento encontrado.</p></section></section>
    <section data-publication-panel="members" hidden><div id="publication-body-cards" class="publication-body-grid"></div><div class="publication-panel-heading"><h2>Composição e histórico</h2><button class="button button-primary button-auto" type="button" data-create-kind="member">Cadastrar membro</button></div><section class="data-card"><div class="table-wrapper"><table><thead><tr><th>Colegiado</th><th>Nome</th><th>Função</th><th>Situação</th><th>Ações</th></tr></thead><tbody id="publication-member-records"></tbody></table></div><p id="publication-member-empty" class="empty-state" hidden>Nenhum membro encontrado.</p></section></section>
    <section data-publication-panel="meetings" hidden><div class="publication-panel-heading"><h2>Agenda de reuniões por ano</h2><button class="button button-primary button-auto" type="button" data-create-kind="meeting">Cadastrar reunião</button></div><section class="data-card"><div class="table-wrapper"><table><thead><tr><th>Colegiado</th><th>Data</th><th>Tipo</th><th>Pauta</th><th>Portal</th><th>Ações</th></tr></thead><tbody id="publication-meeting-records"></tbody></table></div><p id="publication-meeting-empty" class="empty-state" hidden>Nenhuma reunião encontrada.</p></section></section>
    <section data-publication-panel="audiences" hidden><div class="publication-panel-heading"><h2>Audiências públicas</h2><button class="button button-primary button-auto" type="button" data-create-kind="audience">Cadastrar audiência</button></div><section class="data-card"><div class="table-wrapper"><table><thead><tr><th>Ano</th><th>Título</th><th>Data</th><th>Portal</th><th>Ações</th></tr></thead><tbody id="publication-audience-records"></tbody></table></div><p id="publication-audience-empty" class="empty-state" hidden>Nenhuma audiência encontrada.</p></section></section>
    ${dialogMarkup()}`;
  fillSelect(document.querySelector("#publication-category-filter"), Object.entries(CATEGORIES), "Todas as categorias");
  bindEvents();
  await loadSnapshot();
}
