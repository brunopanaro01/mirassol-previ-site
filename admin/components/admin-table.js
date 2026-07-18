import { createButton } from "./ui.js";

function textCell(column, record) {
  const cell = document.createElement("td");
  cell.dataset.label = column.label;
  cell.textContent = String(record[column.key] ?? "");
  if (column.code) {
    const code = document.createElement("code");
    code.textContent = cell.textContent || "Não informado";
    cell.replaceChildren(code);
  }
  return cell;
}

function linkCell(column, record, duplicateCounts) {
  const cell = document.createElement("td");
  cell.dataset.label = column.label;
  const value = String(record[column.key] ?? "");

  if (!column.isSafeUrl(value)) {
    cell.textContent = "URL inválida";
    return cell;
  }

  const link = document.createElement("a");
  link.href = value;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = column.linkLabel ?? "Abrir";
  cell.append(link);

  const count = duplicateCounts.get(`${column.key}\0${value}`) ?? 0;
  if (column.warnDuplicates && count > 1) {
    const warning = document.createElement("span");
    warning.className = "duplicate";
    warning.textContent = `Link repetido em ${count} registros`;
    cell.append(warning);
  }
  return cell;
}

export class AdminTable {
  constructor({ body, empty, columns, actions, onAction }) {
    this.body = body;
    this.empty = empty;
    this.columns = columns;
    this.actions = actions;
    this.onAction = onAction;
  }

  render(records) {
    const duplicateCounts = new Map();
    for (const column of this.columns.filter((item) => item.warnDuplicates)) {
      for (const record of records) {
        const value = String(record[column.key] ?? "");
        const countKey = `${column.key}\0${value}`;
        duplicateCounts.set(countKey, (duplicateCounts.get(countKey) ?? 0) + 1);
      }
    }

    this.body.replaceChildren();
    this.empty.hidden = records.length > 0;

    for (const record of records) {
      const row = document.createElement("tr");
      for (const column of this.columns) {
        row.append(column.isSafeUrl
          ? linkCell(column, record, duplicateCounts)
          : textCell(column, record));
      }

      const actionsCell = document.createElement("td");
      actionsCell.dataset.label = "Ações";
      actionsCell.className = "actions";
      for (const action of this.actions) {
        actionsCell.append(createButton(
          action.label,
          action.variant,
          () => this.onAction(action.operation, record)
        ));
      }
      row.append(actionsCell);
      this.body.append(row);
    }
  }
}
