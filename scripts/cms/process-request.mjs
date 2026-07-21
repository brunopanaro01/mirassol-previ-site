import { processCmsIssue } from "./processor.mjs";
import { setOutput } from "./github-output.mjs";

const result = await processCmsIssue(process.env.ISSUE_BODY);
setOutput("module", result.module);
setOutput("operation", result.operation);
setOutput("record_id", result.recordId || "novo-registro");
setOutput("justification", result.justification);
setOutput("data_file", result.dataFile);
console.log(`${result.operation} validado para ${result.module}/${result.recordId || "novo-registro"}.`);
