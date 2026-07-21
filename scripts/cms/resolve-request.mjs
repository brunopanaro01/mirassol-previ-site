import { parseCmsRequest } from "./request-parser.mjs";
import { loadModuleConfig } from "./config-loader.mjs";
import { setOutput } from "./github-output.mjs";

const request = parseCmsRequest(process.env.ISSUE_BODY);
const config = loadModuleConfig(request.module);
setOutput("module", config.key);
setOutput("data_file", config.data.file);
console.log(`Solicitação reconhecida para o módulo ${config.key}.`);
