import { validateModuleConfig } from "../../cms/core/config.js";

const MODULE_KEY = /^[a-z][a-z0-9-]{1,49}$/;

export async function loadModuleConfig(moduleKey) {
  if (!MODULE_KEY.test(moduleKey ?? "")) throw new Error("Módulo inválido ou não informado.");
  const modules = await loadModuleManifest();
  const config = modules.find((module) => module.key === moduleKey);
  if (!config) throw new Error("O módulo solicitado não está registrado no catálogo publicado.");
  if (config.key !== moduleKey) throw new Error("A chave solicitada não corresponde à configuração carregada.");
  return config;
}

export async function loadModuleManifest() {
  const response = await fetch("./config/modules.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`O catálogo de módulos não pôde ser carregado (HTTP ${response.status}).`);
  const modules = await response.json();
  return Object.values(modules).map(validateModuleConfig).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
