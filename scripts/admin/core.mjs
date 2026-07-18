import {
  appendFileSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { dirname, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

export function fail(message) {
  throw new Error(message);
}

/**
 * Converte o Markdown gerado por um GitHub Issue Form em campos nomeados.
 * Títulos duplicados ou desconhecidos são recusados para que o corpo da issue
 * seja sempre tratado como entrada não confiável.
 */
export function parseIssueForm(body, allowedLabels) {
  const source = String(body ?? "");
  if (!source || source.length > 20_000) {
    fail("O formulário está vazio ou excede o tamanho permitido.");
  }

  const allowed = new Set(allowedLabels);
  const fields = {};
  const pattern = /^###\s+([^\r\n]+)\r?\n\r?\n([\s\S]*?)(?=\r?\n###\s+|$)/gm;

  for (const match of source.matchAll(pattern)) {
    const label = match[1].trim();
    if (!allowed.has(label)) fail(`Campo não reconhecido no formulário: ${label}.`);
    if (Object.hasOwn(fields, label)) fail(`Campo duplicado no formulário: ${label}.`);

    const value = match[2].trim();
    fields[label] = value === "_No response_" ? "" : value;
  }

  for (const label of allowed) {
    if (!Object.hasOwn(fields, label)) fail(`Campo ausente no formulário: ${label}.`);
  }

  return fields;
}

export function requireCheckedConfirmation(value, expectedLabel) {
  const escaped = expectedLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`^- \\[x\\] ${escaped}$`, "im").test(String(value ?? "").trim())) {
    fail("A confirmação administrativa obrigatória não foi marcada.");
  }
}

export function validateText(value, { label, min = 1, max = 500, html = false }) {
  const text = String(value ?? "").trim();
  if (text.length < min || text.length > max) {
    fail(`${label} deve conter entre ${min} e ${max} caracteres.`);
  }
  if (!html && /[<>]/.test(text)) fail(`${label} não pode conter marcação HTML.`);
  return text;
}

export function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  const safeValue = String(value).replace(/[\r\n]+/g, " ");
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${safeValue}\n`);
}

function writeJsonAtomically(file, serialized, validateData) {
  const target = resolve(file);
  const temporary = resolve(dirname(target), `.${target.split("/").at(-1)}.${process.pid}.tmp`);

  try {
    writeFileSync(temporary, serialized, { encoding: "utf8", flag: "wx" });
    const persisted = JSON.parse(readFileSync(temporary, "utf8"));
    validateData(persisted);
    renameSync(temporary, target);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // O temporário pode não ter sido criado ou já ter sido renomeado.
    }
    throw error;
  }
}

export function processIssue({ body, config }) {
  const fields = parseIssueForm(body, config.issueLabels);
  config.validateRequest(fields);

  const originalText = readFileSync(config.dataFile, "utf8");
  const originalData = JSON.parse(originalText);
  config.validateData(originalData);

  const data = structuredClone(originalData);
  const result = config.applyOperation(data, fields);
  config.validateData(data);

  if (isDeepStrictEqual(originalData, data)) {
    fail("A solicitação não produz nenhuma alteração nos dados.");
  }

  const serialized = config.serialize(data, originalText);
  const reparsed = JSON.parse(serialized);
  config.validateData(reparsed);
  if (!isDeepStrictEqual(reparsed, data)) fail("A serialização alterou os dados inesperadamente.");

  writeJsonAtomically(config.dataFile, serialized, config.validateData);
  return result;
}
