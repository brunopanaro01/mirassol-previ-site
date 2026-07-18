import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const DATA_FILE = "consignados.json";
const ALLOWED_OPERATIONS = new Set(["Cadastrar", "Editar", "Excluir"]);
const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro"
];

function fail(message) {
  throw new Error(message);
}

function parseIssueForm(body) {
  const fields = {};
  const pattern = /^###\s+(.+)\r?\n\r?\n([\s\S]*?)(?=\r?\n###\s+|$)/gm;

  for (const match of body.matchAll(pattern)) {
    const value = match[2].trim();
    fields[match[1].trim()] = value === "_No response_" ? "" : value;
  }

  return fields;
}

function validateYear(value) {
  const year = String(value ?? "").trim();
  if (!/^20\d{2}$/.test(year)) {
    fail("O ano deve ter quatro dígitos e estar entre 2000 e 2099.");
  }
  return year;
}

function validateMonth(value) {
  const month = String(value ?? "").trim();
  if (!MONTHS.includes(month)) {
    fail("Selecione um mês válido.");
  }
  return month;
}

function validateDescription(value) {
  const description = String(value ?? "").trim();
  if (description.length < 5 || description.length > 200) {
    fail("A descrição deve conter entre 5 e 200 caracteres.");
  }
  if (/[<>]/.test(description)) {
    fail("A descrição não pode conter marcação HTML.");
  }
  return description;
}

function validateUrl(value) {
  let url;
  try {
    url = new URL(String(value ?? "").trim());
  } catch {
    fail("A URL do documento é inválida.");
  }

  if (url.protocol !== "https:" || url.hostname !== "drive.google.com") {
    fail("Use somente um link HTTPS do domínio drive.google.com.");
  }
  if (!url.pathname.startsWith("/file/d/")) {
    fail("Use um link de arquivo do Google Drive no formato /file/d/...");
  }
  return url.toString();
}

function validateId(value) {
  const id = String(value ?? "").trim();
  if (!/^cons-20\d{2}-(0[1-9]|1[0-2])$/.test(id)) {
    fail("O identificador informado é inválido.");
  }
  return id;
}

function buildId(year, month) {
  return `cons-${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, "0")}`;
}

function findById(data, id) {
  for (const [year, reports] of Object.entries(data.relatorios)) {
    const index = reports.findIndex((report) => report.id === id);
    if (index >= 0) return { year, index, report: reports[index] };
  }
  return null;
}

function validateData(data) {
  if (!data || typeof data !== "object" || !data.relatorios || typeof data.relatorios !== "object") {
    fail("consignados.json não possui a estrutura esperada.");
  }

  const ids = new Set();
  for (const reports of Object.values(data.relatorios)) {
    if (!Array.isArray(reports)) fail("Um dos anos não contém uma lista de relatórios.");

    for (const report of reports) {
      const id = validateId(report.id);
      if (ids.has(id)) fail(`Identificador duplicado no JSON: ${id}.`);
      ids.add(id);
    }
  }
}

function sortData(data) {
  const entries = Object.entries(data.relatorios)
    .filter(([, reports]) => reports.length > 0)
    .sort(([yearA], [yearB]) => Number(yearA) - Number(yearB));

  for (const [, reports] of entries) {
    reports.sort(
      (a, b) => MONTHS.indexOf(a.mes) - MONTHS.indexOf(b.mes)
    );
  }

  data.relatorios = Object.fromEntries(entries);
}

function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${String(value).replace(/[\r\n]+/g, " ")}\n`);
}

const fields = parseIssueForm(process.env.ISSUE_BODY ?? "");
const operation = fields["Operação"];

if (!ALLOWED_OPERATIONS.has(operation)) {
  fail("A operação não foi reconhecida.");
}

const data = JSON.parse(readFileSync(DATA_FILE, "utf8"));
validateData(data);

let affectedId;

if (operation === "Excluir") {
  const id = validateId(fields["Identificador"]);
  const found = findById(data, id);
  if (!found) fail(`O registro ${id} não foi encontrado.`);

  data.relatorios[found.year].splice(found.index, 1);
  affectedId = id;
} else {
  const year = validateYear(fields["Ano"]);
  const month = validateMonth(fields["Mês"]);
  const description = validateDescription(fields["Descrição"]);
  const url = validateUrl(fields["URL do documento"]);
  const targetId = buildId(year, month);

  if (operation === "Cadastrar") {
    if (findById(data, targetId)) {
      fail(`Já existe um relatório para ${month}/${year}. Use a operação Editar.`);
    }

    data.relatorios[year] ??= [];
    data.relatorios[year].push({
      id: targetId,
      mes: month,
      descricao: description,
      url
    });
    affectedId = targetId;
  } else {
    const currentId = validateId(fields["Identificador"]);
    const found = findById(data, currentId);
    if (!found) fail(`O registro ${currentId} não foi encontrado.`);

    const collision = findById(data, targetId);
    if (collision && collision.report.id !== currentId) {
      fail(`Já existe outro relatório para ${month}/${year}.`);
    }

    data.relatorios[found.year].splice(found.index, 1);
    data.relatorios[year] ??= [];
    data.relatorios[year].push({
      id: targetId,
      mes: month,
      descricao: description,
      url
    });
    affectedId = targetId;
  }
}

sortData(data);
validateData(data);
writeFileSync(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");

setOutput("operation", operation);
setOutput("record_id", affectedId);
setOutput("summary", `${operation} concluído para ${affectedId}`);
console.log(`${operation} concluído para ${affectedId}.`);
