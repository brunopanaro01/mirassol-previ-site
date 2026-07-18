import { AdminTable } from "./admin-table.js";
import { normalizeSearch, setStatus } from "./ui.js";

export function buildIssueUrl(config, operation, record) {
  const url = new URL(config.issueFormUrl);
  url.searchParams.set("title", config.issueTitle(operation, record));
  url.searchParams.set(config.issueFields.operation, operation);

  for (const [field, recordKey] of Object.entries(config.issueFields.record ?? {})) {
    if (record?.[recordKey]) url.searchParams.set(field, record[recordKey]);
  }
  return url;
}

function fillOptions(select, values) {
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
}

export async function startAdminApp(config) {
  const elements = {
    body: document.getElementById("records-body"),
    empty: document.getElementById("empty"),
    status: document.getElementById("status"),
    summary: document.getElementById("summary"),
    group: document.getElementById("group-filter"),
    search: document.getElementById("search-filter"),
    create: document.getElementById("create-link")
  };
  const table = new AdminTable({
    body: elements.body,
    empty: elements.empty,
    columns: config.columns,
    actions: config.actions,
    onAction: (operation, record) => window.open(
      buildIssueUrl(config, operation, record).toString(),
      "_blank",
      "noopener,noreferrer"
    )
  });
  let records = [];

  function render() {
    const selectedGroup = elements.group.value;
    const term = normalizeSearch(elements.search.value.trim());
    const filtered = records.filter((record) => {
      const matchesGroup = !selectedGroup || String(record[config.group.key]) === selectedGroup;
      const searchable = normalizeSearch(config.searchKeys.map((key) => record[key]).join(" "));
      return matchesGroup && (!term || searchable.includes(term));
    });
    table.render(filtered);
    elements.summary.textContent = `${filtered.length} de ${records.length} registro(s) exibido(s).`;
  }

  elements.create.href = buildIssueUrl(config, "Cadastrar").toString();
  elements.group.previousElementSibling.textContent = config.group.label;
  elements.group.firstElementChild.textContent = `Todos os ${config.group.plural.toLocaleLowerCase("pt-BR")}`;
  elements.group.addEventListener("change", render);
  elements.search.addEventListener("input", render);

  try {
    const response = await fetch(config.dataUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    records = config.toRecords(await response.json());
    fillOptions(elements.group, config.group.values(records));
    render();
    setStatus(elements.status, "Dados carregados com sucesso.");
  } catch (error) {
    console.error(`Falha ao carregar ${config.dataUrl}:`, error);
    setStatus(elements.status, `Não foi possível carregar ${config.dataLabel}.`, true);
  }
}
