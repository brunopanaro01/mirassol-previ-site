import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { validateModuleConfig } from "../../cms/core/config.js";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const CONFIG_DIRECTORY = resolve(ROOT, "_data/cms/modules");
const KEY = /^[a-z][a-z0-9-]{1,49}$/;

export function repositoryRoot() { return ROOT; }

export function loadModuleConfig(moduleKey) {
  if (!KEY.test(moduleKey ?? "")) throw new Error("A chave do módulo é inválida.");
  const file = resolve(CONFIG_DIRECTORY, `${moduleKey}.json`);
  if (!file.startsWith(`${CONFIG_DIRECTORY}/`)) throw new Error("Caminho de configuração fora do diretório permitido.");
  const config = validateModuleConfig(JSON.parse(readFileSync(file, "utf8")));
  if (config.key !== moduleKey) throw new Error("A chave do arquivo diverge da chave interna do módulo.");
  return config;
}

export function listModuleConfigs() {
  return readdirSync(CONFIG_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => loadModuleConfig(entry.name.slice(0, -5)));
}

export function resolveDataFile(config) {
  const file = resolve(ROOT, config.data.file);
  if (!file.startsWith(`${ROOT}/`)) throw new Error("Arquivo de dados fora do repositório.");
  return file;
}
