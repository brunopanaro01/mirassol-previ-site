import { processIssue, setOutput } from "./admin/core.mjs";
import { consignadosConfig } from "./admin/modules/consignados.mjs";

// O nome do módulo vem do workflow, não da issue. O registro explícito impede
// importação de caminhos arbitrários fornecidos por usuários.
const modules = new Map([[consignadosConfig.key, consignadosConfig]]);
const moduleName = process.env.ADMIN_MODULE ?? "";
const config = modules.get(moduleName);

if (!config) throw new Error(`Módulo administrativo não reconhecido: ${moduleName}.`);

const result = processIssue({ body: process.env.ISSUE_BODY, config });
setOutput("operation", result.operation);
setOutput("record_id", result.recordId);
setOutput("justification", result.justification);
console.log(`${result.operation} validado para ${result.recordId}.`);
