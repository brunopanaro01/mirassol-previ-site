import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { readRecords, writeRecords } from "../../cms/core/adapters.js";
import { normalizeAndValidateRecords, applyRecordOperation } from "../../cms/core/records.js";
import { sha256 } from "../../cms/core/revision.js";
import { writeJsonAtomically } from "./atomic-writer.mjs";
import { loadModuleConfig, resolveDataFile } from "./config-loader.mjs";
import { parseCmsRequest } from "./request-parser.mjs";
import { serializeData } from "./serializer.mjs";

function validateData(config, data) {
  return normalizeAndValidateRecords(config, readRecords(config, data));
}

export async function processCmsIssue(body, overrides = {}) {
  const request = parseCmsRequest(body);
  const config = overrides.config ?? loadModuleConfig(request.module);
  if (config.key !== request.module) throw new Error("A solicitação não corresponde ao módulo carregado.");
  if (!config.operations.includes(request.operation)) throw new Error("A operação não é permitida neste módulo.");
  const dataFile = overrides.dataFile ?? resolveDataFile(config);
  const originalText = readFileSync(dataFile, "utf8");
  if (await sha256(originalText) !== request.baseRevision) {
    throw new Error("Os dados foram alterados desde a abertura do formulário. Recarregue o painel e faça uma nova solicitação.");
  }
  const originalData = JSON.parse(originalText);
  const originalRecords = validateData(config, originalData);
  const nextRecords = applyRecordOperation(config, originalRecords, request);
  if (isDeepStrictEqual(originalRecords, nextRecords)) throw new Error("A solicitação não produz nenhuma alteração nos dados.");
  const nextData = writeRecords(config, structuredClone(originalData), nextRecords);
  validateData(config, nextData);
  const serialized = serializeData(config, nextData, originalText);
  const reparsed = JSON.parse(serialized);
  validateData(config, reparsed);
  writeJsonAtomically(dataFile, serialized, (persisted) => validateData(config, persisted));
  return { ...request, dataFile: config.data.file, moduleName: config.name };
}
