"use strict";

const DATA_URL = "../consignados.json";
const ISSUE_FORM_URL =
  "https://github.com/brunopanaro01/mirassol-previ-site/issues/new?template=gerenciar-consignado.yml";

const MONTH_ORDER = new Map([
  ["Janeiro", 1],
  ["Fevereiro", 2],
  ["Março", 3],
  ["Abril", 4],
  ["Maio", 5],
  ["Junho", 6],
  ["Julho", 7],
  ["Agosto", 8],
  ["Setembro", 9],
  ["Outubro", 10],
  ["Novembro", 11],
  ["Dezembro", 12]
]);

const elements = {
  body: document.getElementById("reports-body"),
  empty: document.getElementById("empty"),
  status: document.getElementById("status"),
  summary: document.getElementById("summary"),
  year: document.getElementById("year-filter"),
  search: document.getElementById("search-filter"),
  create: document.getElementById("create-link")
};

let reports = [];

function isSafeDocumentUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "drive.google.com";
  } catch {
    return false;
  }
}

function flattenReports(data) {
  const result = [];

  for (const [year, items] of Object.entries(data?.relatorios ?? {})) {
    if (!Array.isArray(items)) continue;

    for (const item of items) {
      result.push({
        year,
        id: String(item?.id ?? ""),
        mes: String(item?.mes ?? ""),
        descricao: String(item?.descricao ?? ""),
        url: String(item?.url ?? "")
      });
    }
  }

  return result.sort((a, b) => {
    const byYear = Number(b.year) - Number(a.year);
    if (byYear !== 0) return byYear;
    return (MONTH_ORDER.get(a.mes) ?? 99) - (MONTH_ORDER.get(b.mes) ?? 99);
  });
}

function fillYearFilter() {
  const years = [...new Set(reports.map((item) => item.year))]
    .sort((a, b) => Number(b) - Number(a));

  for (const year of years) {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = year;
    elements.year.append(option);
  }
}

function copyIdentifier(id) {
  if (!id) return;

  navigator.clipboard?.writeText(id).then(
    () => {
      elements.status.textContent =
        `Identificador ${id} copiado. Cole-o no formulário do GitHub.`;
      elements.status.classList.remove("error");
    },
    () => {
      window.prompt("Copie o identificador abaixo:", id);
    }
  );
}

function openRequest(operation, report) {
  if (report?.id) copyIdentifier(report.id);

  const title = report
    ? `${operation} relatório ${report.id}`
    : "Cadastrar relatório de consignados";

  const url = new URL(ISSUE_FORM_URL);
  url.searchParams.set("title", title);
  window.open(url.toString(), "_blank", "noopener,noreferrer");
}

function actionButton(label, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `btn btn-small ${className}`;
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function createCell(text) {
  const cell = document.createElement("td");
  cell.textContent = text;
  return cell;
}

function render() {
  const selectedYear = elements.year.value;
  const term = elements.search.value.trim().toLocaleLowerCase("pt-BR");
  const urlCounts = new Map();

  for (const report of reports) {
    urlCounts.set(report.url, (urlCounts.get(report.url) ?? 0) + 1);
  }

  const filtered = reports.filter((report) => {
    const matchesYear = !selectedYear || report.year === selectedYear;
    const searchable = [report.id, report.mes, report.descricao]
      .join(" ")
      .toLocaleLowerCase("pt-BR");
    return matchesYear && (!term || searchable.includes(term));
  });

  elements.body.replaceChildren();
  elements.empty.hidden = filtered.length > 0;

  for (const report of filtered) {
    const row = document.createElement("tr");
    row.append(
      createCell(report.year),
      createCell(report.mes),
      createCell(report.descricao)
    );

    const idCell = document.createElement("td");
    const code = document.createElement("code");
    code.textContent = report.id || "Sem identificador";
    idCell.append(code);
    row.append(idCell);

    const linkCell = document.createElement("td");
    if (isSafeDocumentUrl(report.url)) {
      const link = document.createElement("a");
      link.href = report.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Abrir documento";
      linkCell.append(link);

      if ((urlCounts.get(report.url) ?? 0) > 1) {
        const warning = document.createElement("span");
        warning.className = "duplicate";
        warning.textContent = `Link repetido em ${urlCounts.get(report.url)} registros`;
        linkCell.append(warning);
      }
    } else {
      linkCell.textContent = "URL inválida";
    }
    row.append(linkCell);

    const actionsCell = document.createElement("td");
    actionsCell.className = "actions";
    actionsCell.append(
      actionButton("Editar", "btn-secondary", () => openRequest("Editar", report)),
      actionButton("Excluir", "btn-danger", () => openRequest("Excluir", report))
    );
    row.append(actionsCell);
    elements.body.append(row);
  }

  elements.summary.textContent =
    `${filtered.length} de ${reports.length} registro(s) exibido(s).`;
}

async function loadReports() {
  elements.create.href = ISSUE_FORM_URL;
  elements.create.addEventListener("click", (event) => {
    event.preventDefault();
    openRequest("Cadastrar");
  });

  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    reports = flattenReports(data);
    fillYearFilter();
    render();

    elements.status.textContent = "Dados carregados com sucesso.";
    elements.status.classList.remove("error");
  } catch (error) {
    console.error("Falha ao carregar consignados.json:", error);
    elements.status.textContent =
      "Não foi possível carregar os registros. Verifique o arquivo consignados.json.";
    elements.status.classList.add("error");
  }
}

elements.year.addEventListener("change", render);
elements.search.addEventListener("input", render);
loadReports();
