import { CMS_SCHEMA_VERSION } from "./constants.js";

const KEY = /^[a-z][a-z0-9-]{1,49}$/;
const SAFE_FILE = /^(?!.*(?:^|\/)\.\.?(?:\/|$))[A-Za-z0-9._/-]+\.json$/;
const SAFE_PAGE = /^(?!.*(?:^|\/)\.\.?(?:\/|$))[A-Za-z0-9._/-]+\.html$/;
const ADAPTERS = new Set(["array", "grouped", "matrix"]);
const FIELD_TYPES = new Set(["text", "textarea", "url", "number", "select", "date"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function unique(values, label) {
  assert(new Set(values).size === values.length, `${label} contém valores duplicados.`);
}

export function validateModuleConfig(config) {
  assert(config && typeof config === "object" && !Array.isArray(config), "A configuração deve ser um objeto.");
  assert(config.schemaVersion === CMS_SCHEMA_VERSION, `schemaVersion deve ser ${CMS_SCHEMA_VERSION}.`);
  assert(KEY.test(config.key ?? ""), "A chave do módulo é inválida.");
  assert(typeof config.name === "string" && config.name.trim(), "O nome do módulo é obrigatório.");
  assert(config.data && SAFE_FILE.test(config.data.file ?? ""), "O arquivo de dados é inválido ou inseguro.");
  assert(SAFE_PAGE.test(config.data.publicPage ?? ""), "A página pública é inválida ou insegura.");
  assert(ADAPTERS.has(config.data.adapter), "O adaptador informado não existe.");
  assert(Array.isArray(config.data.collectionPath), "collectionPath deve ser uma lista.");
  assert(config.data.collectionPath.every((part) => KEY.test(part)), "collectionPath contém segmento inválido.");
  assert(Array.isArray(config.data.groups), "groups deve ser uma lista.");
  if (config.data.adapter === "array") assert(config.data.groups.length === 0, "O adaptador array não aceita groups.");
  if (["grouped", "matrix"].includes(config.data.adapter)) assert(config.data.groups.length > 0, "O adaptador agrupado precisa de groups.");
  assert(Array.isArray(config.fields) && config.fields.length > 0, "O módulo deve declarar campos.");

  const keys = config.fields.map((field) => field.key);
  unique(keys, "A lista de campos");
  for (const field of config.fields) {
    assert(KEY.test(field.key ?? ""), `Campo com chave inválida: ${field.key}.`);
    assert(typeof field.label === "string" && field.label.trim(), `O campo ${field.key} precisa de rótulo.`);
    assert(FIELD_TYPES.has(field.type), `Tipo inválido no campo ${field.key}.`);
    assert(Array.isArray(field.validators ?? []), `Validadores de ${field.key} devem formar uma lista.`);
    for (const validator of field.validators ?? []) {
      assert(["text", "no-html", "enum", "integer", "https-url", "google-drive-file", "pattern"].includes(validator.name),
        `Validador inválido em ${field.key}: ${validator.name}.`);
    }
    if (field.options) unique(field.options, `As opções de ${field.key}`);
    if (field.optionsRange) {
      assert(Number.isInteger(field.optionsRange.min) && Number.isInteger(field.optionsRange.max), `optionsRange de ${field.key} deve usar inteiros.`);
      assert(field.optionsRange.max >= field.optionsRange.min && field.optionsRange.max - field.optionsRange.min <= 500,
        `optionsRange de ${field.key} é inválido ou excessivo.`);
    }
  }
  for (const group of config.data.groups) assert(keys.includes(group), `Grupo desconhecido: ${group}.`);
  if (config.data.adapter === "matrix") assert(keys.includes(config.data.valueField ?? "valor"), "O campo de valor da matriz não foi declarado.");

  assert(config.identity && keys.includes(config.identity.field ?? "id") === false,
    "O campo de identidade é calculado e não deve ser repetido em fields.");
  assert(KEY.test(config.identity.field ?? ""), "O campo de identidade é inválido.");
  assert(Array.isArray(config.identity.parts) && config.identity.parts.length > 0, "A identidade precisa declarar parts.");
  for (const part of config.identity.parts) assert(keys.includes(part.field), `Parte de identidade desconhecida: ${part.field}.`);
  assert(Array.isArray(config.operations) && config.operations.length > 0, "O módulo deve permitir operações.");
  assert(config.operations.every((operation) => ["create", "update", "delete"].includes(operation)), "Operação inválida.");
  unique(config.operations, "As operações");
  const knownFields = new Set([...keys, config.identity.field]);
  for (const key of [...(config.ui?.search ?? []), ...(config.ui?.filters ?? [])]) {
    assert(knownFields.has(key), `A interface referencia um campo desconhecido: ${key}.`);
  }
  for (const column of config.ui?.columns ?? []) assert(knownFields.has(column.field), `Coluna desconhecida: ${column.field}.`);
  for (const rule of [...(config.ui?.sort ?? []), ...(config.data?.sort ?? [])]) {
    assert(knownFields.has(rule.field), `Ordenação com campo desconhecido: ${rule.field}.`);
    assert(["asc", "desc"].includes(rule.direction), `Direção de ordenação inválida em ${rule.field}.`);
    assert([undefined, "text", "number", "month"].includes(rule.type), `Tipo de ordenação inválido em ${rule.field}.`);
  }
  return config;
}

export function fieldMap(config) {
  return new Map(config.fields.map((field) => [field.key, field]));
}

export function resolveOptions(field) {
  if (Array.isArray(field.options)) return field.options.map(String);
  if (field.optionsRange) {
    const { min, max } = field.optionsRange;
    return Array.from({ length: max - min + 1 }, (_, index) => String(min + index));
  }
  return [];
}
