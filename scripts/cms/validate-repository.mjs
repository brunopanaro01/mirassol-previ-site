import { readFileSync } from "node:fs";
import { readRecords } from "../../cms/core/adapters.js";
import { normalizeAndValidateRecords } from "../../cms/core/records.js";
import { listModuleConfigs, resolveDataFile } from "./config-loader.mjs";

for (const config of listModuleConfigs()) {
  const data = JSON.parse(readFileSync(resolveDataFile(config), "utf8"));
  const records = normalizeAndValidateRecords(config, readRecords(config, data));
  console.log(`${config.key}: ${records.length} registro(s) válido(s).`);
}
