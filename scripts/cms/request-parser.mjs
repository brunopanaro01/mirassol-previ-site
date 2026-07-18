import { CONFIRMATION_TEXT, ISSUE_LABELS } from "../../cms/core/constants.js";

const LABELS = Object.values(ISSUE_LABELS);
const OPERATIONS = new Set(["create", "update", "delete"]);

function fail(message) { throw new Error(message); }

export function parseIssueForm(body) {
  const source = String(body ?? "");
  if (!source || source.length > 30_000) fail("O formulário está vazio ou excede o tamanho permitido.");
  const fields = {};
  const pattern = /^###\s+([^\r\n]+)\r?\n\r?\n([\s\S]*?)(?=\r?\n###\s+|$)/gm;
  for (const match of source.matchAll(pattern)) {
    const label = match[1].trim();
    if (!LABELS.includes(label)) fail(`Campo não reconhecido no formulário: ${label}.`);
    if (Object.hasOwn(fields, label)) fail(`Campo duplicado no formulário: ${label}.`);
    const value = match[2].trim();
    fields[label] = value === "_No response_" ? "" : value;
  }
  for (const label of LABELS) if (!Object.hasOwn(fields, label)) fail(`Campo ausente no formulário: ${label}.`);
  return fields;
}

export function parseCmsRequest(body) {
  const fields = parseIssueForm(body);
  const operation = fields[ISSUE_LABELS.operation];
  if (!OPERATIONS.has(operation)) fail("A operação não foi reconhecida.");
  const module = fields[ISSUE_LABELS.module];
  if (!/^[a-z][a-z0-9-]{1,49}$/.test(module)) fail("O módulo informado é inválido.");
  const recordId = fields[ISSUE_LABELS.recordId];
  if (operation !== "create" && !recordId) fail("O identificador é obrigatório para editar ou excluir.");
  if (recordId && !/^[A-Za-z0-9][A-Za-z0-9._-]{2,119}$/.test(recordId)) fail("O identificador possui formato inválido.");
  const baseRevision = fields[ISSUE_LABELS.baseRevision];
  if (!/^[a-f0-9]{64}$/.test(baseRevision)) fail("A revisão base é inválida.");
  let values;
  try { values = JSON.parse(fields[ISSUE_LABELS.payload]); } catch { fail("Os dados estruturados não contêm JSON válido."); }
  if (!values || typeof values !== "object" || Array.isArray(values)) fail("Os dados estruturados devem formar um objeto.");
  if (operation === "delete" && Object.keys(values).length) fail("Uma exclusão não pode enviar campos para alteração.");
  const justification = fields[ISSUE_LABELS.justification].trim();
  if (justification.length < 10 || justification.length > 500 || /[<>]/.test(justification)) {
    fail("A justificativa deve conter entre 10 e 500 caracteres e não pode conter HTML.");
  }
  const escaped = CONFIRMATION_TEXT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!(new RegExp(`^- \\[x\\] ${escaped}$`, "im")).test(fields[ISSUE_LABELS.confirmation])) {
    fail("A confirmação administrativa obrigatória não foi marcada.");
  }
  return { module, operation, recordId, baseRevision, values, justification };
}
