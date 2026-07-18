import { appendFileSync } from "node:fs";

export function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${String(value).replace(/[\r\n]+/g, " ")}\n`);
}
