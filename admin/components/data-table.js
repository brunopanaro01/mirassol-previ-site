import { isSafeLink } from "../../cms/core/validators.js";

function button(label, className, handler) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `btn btn-small ${className}`;
  element.textContent = label;
  element.addEventListener("click", handler);
  return element;
}

function cell(column, record, config, duplicateCounts) {
  const element = document.createElement("td");
  const field = config.fields.find((item) => item.key === column.field);
  element.dataset.label = column.label ?? field?.label ?? column.field;
  const value = String(record[column.field] ?? "");
  if (column.format === "link") {
    if (!isSafeLink(value, field)) { element.textContent = "URL inválida"; return element; }
    const link = document.createElement("a");
    link.href = value;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = column.linkLabel ?? "Abrir";
    element.append(link);
    if (column.warnDuplicates && (duplicateCounts.get(`${column.field}\0${value}`) ?? 0) > 1) {
      const warning = document.createElement("span");
      warning.className = "duplicate";
      warning.textContent = `Valor repetido em ${duplicateCounts.get(`${column.field}\0${value}`)} registros`;
      element.append(warning);
    }
  } else if (column.format === "code") {
    const code = document.createElement("code");
    code.textContent = value || "Não informado";
    element.append(code);
  } else element.textContent = value;
  return element;
}

export function renderTable({ config, records, head, body, empty, onEdit, onDelete }) {
  const columns = config.ui.columns;
  const duplicateCounts = new Map();
  for (const column of columns.filter((item) => item.warnDuplicates)) {
    for (const record of records) {
      const key = `${column.field}\0${record[column.field] ?? ""}`;
      duplicateCounts.set(key, (duplicateCounts.get(key) ?? 0) + 1);
    }
  }
  const header = document.createElement("tr");
  for (const column of columns) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = column.label ?? config.fields.find((field) => field.key === column.field)?.label ?? column.field;
    header.append(th);
  }
  const actions = document.createElement("th");
  actions.scope = "col";
  actions.textContent = "Ações";
  header.append(actions);
  head.replaceChildren(header);
  body.replaceChildren();
  empty.hidden = records.length > 0;
  for (const record of records) {
    const row = document.createElement("tr");
    for (const column of columns) row.append(cell(column, record, config, duplicateCounts));
    const actionCell = document.createElement("td");
    actionCell.dataset.label = "Ações";
    actionCell.className = "actions";
    if (config.operations.includes("update")) actionCell.append(button("Editar", "btn-secondary", () => onEdit(record)));
    if (config.operations.includes("delete")) actionCell.append(button("Excluir", "btn-danger", () => onDelete(record)));
    row.append(actionCell);
    body.append(row);
  }
}
