import { MONTHS } from "./constants.js";
import { buildRecordId } from "./identity.js";
import { validateValues } from "./validators.js";

function compareValue(a, b, rule) {
  let left = a[rule.field] ?? "";
  let right = b[rule.field] ?? "";
  if (rule.type === "number") { left = Number(left); right = Number(right); }
  if (rule.type === "month") { left = MONTHS.indexOf(left); right = MONTHS.indexOf(right); }
  const result = typeof left === "number" ? left - right : String(left).localeCompare(String(right), "pt-BR");
  return rule.direction === "desc" ? -result : result;
}

export function normalizeAndValidateRecords(config, records) {
  const ids = new Set();
  return records.map((record) => {
    const values = validateValues(config, Object.fromEntries(
      Object.entries(record).filter(([key]) => key !== config.identity.field)
    ));
    const expectedId = buildRecordId(config, values);
    const suppliedId = String(record[config.identity.field] ?? "").trim();
    if (suppliedId !== expectedId) throw new Error(`O identificador ${suppliedId || "ausente"} deveria ser ${expectedId}.`);
    if (ids.has(suppliedId)) throw new Error(`Identificador duplicado: ${suppliedId}.`);
    ids.add(suppliedId);
    return { ...values, [config.identity.field]: suppliedId };
  });
}

export function sortRecords(config, records, rules = config.data?.sort ?? config.ui?.sort ?? []) {
  return [...records].sort((a, b) => {
    for (const rule of rules) {
      const result = compareValue(a, b, rule);
      if (result) return result;
    }
    return String(a[config.identity.field]).localeCompare(String(b[config.identity.field]), "pt-BR");
  });
}

export function applyRecordOperation(config, records, request) {
  const idField = config.identity.field;
  const index = records.findIndex((record) => record[idField] === request.recordId);
  if (request.operation === "delete") {
    if (index < 0) throw new Error(`O registro ${request.recordId} não foi encontrado.`);
    return records.toSpliced(index, 1);
  }

  if (request.operation === "create") {
    const values = validateValues(config, request.values);
    const nextId = buildRecordId(config, values);
    if (records.some((record) => record[idField] === nextId)) throw new Error(`Já existe o registro ${nextId}.`);
    return sortRecords(config, [...records, { ...values, [idField]: nextId }]);
  }
  if (index < 0) throw new Error(`O registro ${request.recordId} não foi encontrado.`);
  const values = validateValues(config, request.values);
  const nextId = buildRecordId(config, values);
  for (const field of config.identity.immutable ?? []) {
    if (String(records[index][field]) !== String(values[field])) throw new Error(`${field} não pode ser alterado na edição.`);
  }
  if (nextId !== request.recordId) throw new Error("A edição não pode alterar o identificador do registro.");
  const updated = [...records];
  updated[index] = { ...values, [idField]: nextId };
  return sortRecords(config, updated);
}
