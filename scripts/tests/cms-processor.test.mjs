import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CONFIRMATION_TEXT, ISSUE_LABELS } from "../../cms/core/constants.js";
import { sha256 } from "../../cms/core/revision.js";
import { loadModuleConfig } from "../cms/config-loader.mjs";
import { processCmsIssue } from "../cms/processor.mjs";

const sourceFile = new URL("../../consignados.json", import.meta.url);
const config = loadModuleConfig("consignados");

function issue(fields) {
  return Object.entries(fields).map(([label, value]) =>
    `### ${label}\n\n${value === "" ? "_No response_" : value}`).join("\n\n");
}

async function context(overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), "cms-test-"));
  const dataFile = join(directory, "consignados.json");
  const source = readFileSync(sourceFile, "utf8");
  writeFileSync(dataFile, source);
  const values = {
    ano: "2026", mes: "Junho", descricao: "Relatório de consignados - Jun/2026",
    url: "https://drive.google.com/file/d/1ValidDriveIdentifier123/view"
  };
  const fields = {
    [ISSUE_LABELS.module]: "consignados",
    [ISSUE_LABELS.operation]: "create",
    [ISSUE_LABELS.recordId]: "",
    [ISSUE_LABELS.baseRevision]: await sha256(source),
    [ISSUE_LABELS.payload]: JSON.stringify(values),
    [ISSUE_LABELS.justification]: "Publicação mensal revisada pelo setor responsável.",
    [ISSUE_LABELS.confirmation]: `- [x] ${CONFIRMATION_TEXT}`,
    ...overrides
  };
  return { directory, dataFile, fields, before: source };
}

async function run(overrides) {
  const current = await context(overrides);
  try {
    const result = await processCmsIssue(issue(current.fields), { config, dataFile: current.dataFile });
    return { result, text: readFileSync(current.dataFile, "utf8"), data: JSON.parse(readFileSync(current.dataFile, "utf8")) };
  } finally { rmSync(current.directory, { recursive: true, force: true }); }
}

async function rejects(overrides, pattern) {
  const current = await context(overrides);
  try {
    await assert.rejects(() => processCmsIssue(issue(current.fields), { config, dataFile: current.dataFile }), pattern);
    assert.equal(readFileSync(current.dataFile, "utf8"), current.before, "falhas não podem alterar o arquivo");
  } finally { rmSync(current.directory, { recursive: true, force: true }); }
}

test("processador cadastra, edita e exclui com escrita atômica", async () => {
  const created = await run();
  assert.equal(created.result.dataFile, "consignados.json");
  assert.equal(created.data.relatorios["2026"].at(-1).id, "cons-2026-06");
  assert.match(created.text, /\{ "mes": "Junho"/);

  const editedValues = { ano: "2026", mes: "Maio", descricao: "Relatório — versão \"final\" com acentuação",
    url: "https://drive.google.com/file/d/1AnotherValidDriveId99/view" };
  const edited = await run({ [ISSUE_LABELS.operation]: "update", [ISSUE_LABELS.recordId]: "cons-2026-05",
    [ISSUE_LABELS.payload]: JSON.stringify(editedValues) });
  assert.equal(edited.data.relatorios["2026"].at(-1).descricao, editedValues.descricao);

  const deleted = await run({ [ISSUE_LABELS.operation]: "delete", [ISSUE_LABELS.recordId]: "cons-2026-05",
    [ISSUE_LABELS.payload]: "{}" });
  assert.equal(deleted.data.relatorios["2026"].some((record) => record.id === "cons-2026-05"), false);
});

test("processador recusa revisão obsoleta, IDs e solicitações sem mudança", async () => {
  await rejects({ [ISSUE_LABELS.baseRevision]: "0".repeat(64) }, /alterados desde/);
  await rejects({ [ISSUE_LABELS.operation]: "delete", [ISSUE_LABELS.recordId]: "cons-2099-12", [ISSUE_LABELS.payload]: "{}" }, /não foi encontrado/);
  const same = { ano: "2026", mes: "Maio", descricao: "Relatório de consignados - Mai/2026",
    url: "https://drive.google.com/file/d/1J2_3qAc2b3smDpSSXfXKuWEvfLmxjzyf/view?usp=sharing" };
  await rejects({ [ISSUE_LABELS.operation]: "update", [ISSUE_LABELS.recordId]: "cons-2026-05",
    [ISSUE_LABELS.payload]: JSON.stringify(same) }, /nenhuma alteração/);
});

test("edição manual da issue não contorna parser ou validações", async () => {
  await rejects({ [ISSUE_LABELS.module]: "../../consignados" }, /módulo/);
  await rejects({ [ISSUE_LABELS.payload]: "{JSON inválido" }, /JSON válido/);
  await rejects({ [ISSUE_LABELS.justification]: "<b>alteração</b>" }, /justificativa/);
  await rejects({ [ISSUE_LABELS.confirmation]: `- [ ] ${CONFIRMATION_TEXT}` }, /confirmação/);

  const current = await context();
  try {
    await assert.rejects(() => processCmsIssue(`${issue(current.fields)}\n\n### ${ISSUE_LABELS.operation}\n\ndelete`,
      { config, dataFile: current.dataFile }), /duplicado/);
    assert.equal(readFileSync(current.dataFile, "utf8"), current.before);
  } finally { rmSync(current.directory, { recursive: true, force: true }); }
});
