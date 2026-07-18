import { readRecords } from "../../cms/core/adapters.js";
import { normalizeAndValidateRecords, sortRecords } from "../../cms/core/records.js";
import { sha256 } from "../../cms/core/revision.js";
import { normalizeSearch } from "../components/ui.js";
import { DynamicForm } from "../components/dynamic-form.js";
import { renderTable } from "../components/data-table.js";
import { loadModuleConfig, loadModuleManifest } from "./config-loader.js";
import { buildRequestUrl } from "./request-builder.js";

function element(id) { return document.getElementById(id); }
function status(message, error = false) {
  element("status").textContent = message;
  element("status").classList.toggle("error", error);
}

function confirmDelete(config, record) {
  const id = record[config.identity.field];
  return window.confirm(`Deseja abrir uma solicitação para excluir o registro ${id}?\n\nA exclusão só ocorrerá após revisão e mesclagem do Pull Request.`);
}

export async function startCms() {
  const moduleKey = new URLSearchParams(location.search).get("module");
  if (!moduleKey) {
    const modules = await loadModuleManifest();
    element("module-picker").hidden = false;
    element("workspace").hidden = true;
    const list = element("module-list");
    for (const module of modules) {
      const link = document.createElement("a");
      link.className = "module-card";
      link.href = `?module=${encodeURIComponent(module.key)}`;
      const title = document.createElement("strong");
      title.textContent = module.name;
      const description = document.createElement("span");
      description.textContent = module.description;
      link.append(title, description);
      list.append(link);
    }
    return;
  }

  const config = await loadModuleConfig(moduleKey);
  document.title = `Administração — ${config.name} — Mirassol-Previ`;
  element("module-name").textContent = config.name;
  element("page-title").textContent = `Gerenciar ${config.name.toLocaleLowerCase("pt-BR")}`;
  element("public-page").href = `../${config.data.publicPage}`;
  element("json-file").textContent = config.data.file;

  const response = await fetch(`../${config.data.file}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Falha ao carregar ${config.data.file} (HTTP ${response.status}).`);
  const source = await response.text();
  const baseRevision = await sha256(source);
  let records = sortRecords(
    config,
    normalizeAndValidateRecords(config, readRecords(config, JSON.parse(source))),
    config.ui?.sort ?? []
  );

  const form = new DynamicForm({
    dialog: element("record-dialog"), form: element("record-form"), fields: element("form-fields"),
    title: element("dialog-title"), error: element("form-error"),
    onSubmit: (request) => window.open(buildRequestUrl(config, { ...request, baseRevision }).toString(), "_blank", "noopener,noreferrer")
  });

  const filters = new Map();
  for (const fieldKey of config.ui.filters ?? []) {
    const field = config.fields.find((item) => item.key === fieldKey);
    const wrapper = document.createElement("div");
    wrapper.className = "field";
    const label = document.createElement("label");
    label.textContent = field.label;
    const select = document.createElement("select");
    select.setAttribute("aria-label", `Filtrar por ${field.label}`);
    const all = document.createElement("option");
    all.value = "";
    all.textContent = `Todos — ${field.label}`;
    select.append(all);
    for (const value of [...new Set(records.map((record) => String(record[fieldKey])))].sort((a, b) => b.localeCompare(a, "pt-BR", { numeric: true }))) {
      const option = document.createElement("option"); option.value = value; option.textContent = value; select.append(option);
    }
    select.addEventListener("change", render);
    wrapper.append(label, select);
    element("dynamic-filters").append(wrapper);
    filters.set(fieldKey, select);
  }

  function openDelete(record) {
    if (!confirmDelete(config, record)) return;
    window.open(buildRequestUrl(config, {
      operation: "delete", recordId: record[config.identity.field], values: {}, baseRevision
    }).toString(), "_blank", "noopener,noreferrer");
  }
  function render() {
    const term = normalizeSearch(element("search-filter").value);
    const filtered = records.filter((record) => {
      const matchFilters = [...filters].every(([key, select]) => !select.value || String(record[key]) === select.value);
      const text = normalizeSearch((config.ui.search ?? []).map((key) => record[key]).join(" "));
      return matchFilters && (!term || text.includes(term));
    });
    renderTable({ config, records: filtered, head: element("records-head"), body: element("records-body"), empty: element("empty"),
      onEdit: (record) => form.open(config, "update", record), onDelete: openDelete });
    element("summary").textContent = `${filtered.length} de ${records.length} registro(s) exibido(s).`;
  }
  element("search-filter").addEventListener("input", render);
  element("create-button").hidden = !config.operations.includes("create");
  element("create-button").addEventListener("click", () => form.open(config, "create"));
  render();
  status("Dados carregados e validados com sucesso.");
}
