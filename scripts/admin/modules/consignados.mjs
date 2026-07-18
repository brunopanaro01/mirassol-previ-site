import { fail, requireCheckedConfirmation, validateText } from "../core.mjs";

export const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const OPERATIONS = new Set(["Cadastrar", "Editar", "Excluir"]);
const CONFIRMATION =
  "Confirmo que revisei os dados e que o documento não contém informação pessoal ou sigilosa.";

function validateYear(value) {
  const year = String(value ?? "").trim();
  if (!/^20\d{2}$/.test(year)) fail("O ano deve estar entre 2000 e 2099.");
  return year;
}

function validateMonth(value) {
  const month = String(value ?? "").trim();
  if (!MONTHS.includes(month)) fail("Selecione um mês válido.");
  return month;
}

function validateId(value) {
  const id = String(value ?? "").trim();
  if (!/^cons-20\d{2}-(0[1-9]|1[0-2])$/.test(id)) {
    fail("O identificador informado é inválido.");
  }
  return id;
}

function validateDescription(value) {
  return validateText(value, { label: "A descrição", min: 5, max: 200 });
}

function validateDriveUrl(value) {
  let url;
  try {
    url = new URL(String(value ?? "").trim());
  } catch {
    fail("A URL do documento é inválida.");
  }

  const path = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{10,})(?:\/|$)/);
  if (url.protocol !== "https:" || url.hostname !== "drive.google.com" || !path) {
    fail("Use um link HTTPS de arquivo do Google Drive com identificador válido.");
  }
  if (url.username || url.password || url.port) fail("A URL do documento contém componentes não permitidos.");
  return url.toString();
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
  if (!data || typeof data !== "object" || Array.isArray(data)) fail("O JSON deve conter um objeto.");
  if (typeof data.observacoes !== "string" || !data.observacoes.trim()) {
    fail("O campo observacoes é obrigatório.");
  }
  if (!data.relatorios || typeof data.relatorios !== "object" || Array.isArray(data.relatorios)) {
    fail("O campo relatorios deve ser um objeto organizado por ano.");
  }

  const ids = new Set();
  for (const [yearKey, reports] of Object.entries(data.relatorios)) {
    const year = validateYear(yearKey);
    if (!Array.isArray(reports)) fail(`O ano ${year} não contém uma lista de relatórios.`);

    for (const report of reports) {
      if (!report || typeof report !== "object" || Array.isArray(report)) {
        fail(`O ano ${year} contém um registro inválido.`);
      }
      const id = validateId(report.id);
      const month = validateMonth(report.mes);
      validateDescription(report.descricao);
      validateDriveUrl(report.url);
      if (id !== buildId(year, month)) fail(`O identificador ${id} não corresponde a ${month}/${year}.`);
      if (ids.has(id)) fail(`Identificador duplicado no JSON: ${id}.`);
      ids.add(id);
    }
  }
}

function validateRequest(fields) {
  if (!OPERATIONS.has(fields["Operação"])) fail("A operação não foi reconhecida.");
  validateText(fields["Justificativa administrativa"], {
    label: "A justificativa administrativa",
    min: 10,
    max: 500
  });
  requireCheckedConfirmation(fields["Confirmação"], CONFIRMATION);
}

function valuesForWrite(fields) {
  const year = validateYear(fields["Ano"]);
  const month = validateMonth(fields["Mês"]);
  return {
    year,
    month,
    description: validateDescription(fields["Descrição"]),
    url: validateDriveUrl(fields["URL do documento"]),
    id: buildId(year, month)
  };
}

function applyOperation(data, fields) {
  const operation = fields["Operação"];
  const justification = fields["Justificativa administrativa"].trim();

  if (operation === "Excluir") {
    const id = validateId(fields["Identificador"]);
    const found = findById(data, id);
    if (!found) fail(`O registro ${id} não foi encontrado.`);
    data.relatorios[found.year].splice(found.index, 1);
    if (data.relatorios[found.year].length === 0) delete data.relatorios[found.year];
    return { operation, recordId: id, justification };
  }

  const values = valuesForWrite(fields);
  if (operation === "Cadastrar") {
    if (findById(data, values.id)) {
      fail(`Já existe um relatório para ${values.month}/${values.year}. Use Editar.`);
    }
    data.relatorios[values.year] ??= [];
    data.relatorios[values.year].push({
      mes: values.month,
      descricao: values.description,
      url: values.url,
      id: values.id
    });
  } else {
    const currentId = validateId(fields["Identificador"]);
    const found = findById(data, currentId);
    if (!found) fail(`O registro ${currentId} não foi encontrado.`);
    if (values.id !== currentId) {
      fail("Ano e mês não podem ser alterados na edição; cadastre outro registro se necessário.");
    }
    found.report.descricao = values.description;
    found.report.url = values.url;
  }

  for (const reports of Object.values(data.relatorios)) {
    reports.sort((a, b) => MONTHS.indexOf(a.mes) - MONTHS.indexOf(b.mes));
  }
  data.relatorios = Object.fromEntries(
    Object.entries(data.relatorios).sort(([a], [b]) => Number(a) - Number(b))
  );
  return { operation, recordId: values.id, justification };
}

export function serializeConsignados(data, originalText = "") {
  const eol = originalText.includes("\r\n") ? "\r\n" : "\n";
  const lines = [
    "{",
    `  \"observacoes\": ${JSON.stringify(data.observacoes)},`,
    "  \"relatorios\": {"
  ];
  const years = Object.entries(data.relatorios);

  years.forEach(([year, reports], yearIndex) => {
    lines.push(`    ${JSON.stringify(year)}: [`);
    reports.forEach((report, reportIndex) => {
      const record = `{ \"mes\": ${JSON.stringify(report.mes)}, \"descricao\": ${JSON.stringify(report.descricao)}, \"url\": ${JSON.stringify(report.url)}, \"id\": ${JSON.stringify(report.id)} }`;
      lines.push(`      ${record}${reportIndex < reports.length - 1 ? "," : ""}`);
    });
    lines.push(`    ]${yearIndex < years.length - 1 ? "," : ""}`);
  });
  lines.push("  }", "}");
  return `${lines.join(eol)}${eol}`;
}

export const consignadosConfig = {
  key: "consignados",
  dataFile: "consignados.json",
  issueLabels: [
    "Operação",
    "Identificador",
    "Ano",
    "Mês",
    "Descrição",
    "URL do documento",
    "Justificativa administrativa",
    "Confirmação"
  ],
  validateRequest,
  validateData,
  applyOperation,
  serialize: serializeConsignados
};
