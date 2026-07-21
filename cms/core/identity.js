import { MONTHS } from "./constants.js";

function transform(value, name) {
  const text = String(value ?? "").trim();
  if (!name) return text;
  if (name === "month-number") {
    const position = MONTHS.indexOf(text);
    if (position < 0) throw new Error("Não foi possível calcular a identidade: mês inválido.");
    return String(position + 1).padStart(2, "0");
  }
  if (name === "slug") return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  throw new Error(`Transformação de identidade não reconhecida: ${name}.`);
}

export function buildRecordId(config, values) {
  const parts = config.identity.parts.map((part) => transform(values[part.field], part.transform));
  return [config.identity.prefix, ...parts].filter(Boolean).join("-");
}
