import { resolveOptions } from "./config.js";

function fail(message) { throw new Error(message); }

function validateRule(value, field, rule) {
  const text = String(value ?? "").trim();
  switch (rule.name) {
    case "text":
      if (text.length < (rule.min ?? 1) || text.length > (rule.max ?? 500)) {
        fail(`${field.label} deve conter entre ${rule.min ?? 1} e ${rule.max ?? 500} caracteres.`);
      }
      return text;
    case "no-html":
      if (/[<>]/.test(text)) fail(`${field.label} não pode conter marcação HTML.`);
      return text;
    case "enum":
      if (!resolveOptions(field).includes(text)) fail(`Selecione um valor válido para ${field.label}.`);
      return text;
    case "integer": {
      if (!/^-?\d+$/.test(text)) fail(`${field.label} deve ser um número inteiro.`);
      const number = Number(text);
      if (number < (rule.min ?? -Infinity) || number > (rule.max ?? Infinity)) {
        fail(`${field.label} deve estar entre ${rule.min} e ${rule.max}.`);
      }
      return text;
    }
    case "https-url":
    case "google-drive-file": {
      if (text.length > 2048) fail(`${field.label} excede o tamanho máximo de URL.`);
      let url;
      try { url = new URL(text); } catch { fail(`${field.label} contém uma URL inválida.`); }
      if (url.protocol !== "https:" || url.username || url.password || url.port) {
        fail(`${field.label} deve usar HTTPS e não pode conter credenciais ou porta.`);
      }
      if (rule.name === "google-drive-file" && (
        url.hostname !== "drive.google.com"
        || !/^\/file\/d\/[A-Za-z0-9_-]{10,}(?:\/|$)/.test(url.pathname)
      )) fail(`${field.label} deve ser um link de arquivo do Google Drive.`);
      return url.toString();
    }
    case "pattern":
      if (!(new RegExp(rule.value, rule.flags ?? "")).test(text)) fail(`${field.label} possui formato inválido.`);
      return text;
    default:
      fail(`Validador não reconhecido: ${rule.name}.`);
  }
}

export function validateValues(config, values, { partial = false } = {}) {
  if (!values || typeof values !== "object" || Array.isArray(values)) fail("Os dados devem formar um objeto.");
  const fields = new Map(config.fields.map((field) => [field.key, field]));
  const unknown = Object.keys(values).filter((key) => !fields.has(key));
  if (unknown.length) fail(`Campos não reconhecidos: ${unknown.join(", ")}.`);

  const result = {};
  for (const field of config.fields) {
    if (partial && !Object.hasOwn(values, field.key)) continue;
    let value = String(values[field.key] ?? "").trim();
    if (value.length > 5000) fail(`${field.label} excede o tamanho máximo permitido.`);
    if (!value && field.required) fail(`${field.label} é obrigatório.`);
    if (!value) { result[field.key] = ""; continue; }
    for (const rule of field.validators ?? []) value = validateRule(value, field, rule);
    result[field.key] = value;
  }
  return result;
}

export function isSafeLink(value, field) {
  try {
    let current = String(value ?? "");
    for (const rule of field?.validators ?? []) {
      if (["https-url", "google-drive-file"].includes(rule.name)) current = validateRule(current, field, rule);
    }
    return Boolean(current);
  } catch { return false; }
}
