import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { processIssue } from "../admin/core.mjs";
import { consignadosConfig, serializeConsignados } from "../admin/modules/consignados.mjs";

const CONFIRMATION =
  "Confirmo que revisei os dados e que o documento não contém informação pessoal ou sigilosa.";
const SOURCE = new URL("../../consignados.json", import.meta.url);

function body(overrides = {}) {
  const fields = {
    "Operação": "Cadastrar",
    "Identificador": "",
    "Ano": "2026",
    "Mês": "Junho",
    "Descrição": "Relatório de consignados - Jun/2026",
    "URL do documento": "https://drive.google.com/file/d/1ValidDriveIdentifier123/view?usp=sharing",
    "Justificativa administrativa": "Publicação mensal validada pelo setor responsável.",
    "Confirmação": `- [x] ${CONFIRMATION}`,
    ...overrides
  };
  return Object.entries(fields)
    .map(([label, value]) => `### ${label}\n\n${value || "_No response_"}`)
    .join("\n\n");
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "consignados-test-"));
  const file = join(directory, "consignados.json");
  writeFileSync(file, readFileSync(SOURCE, "utf8"));
  return {
    directory,
    file,
    config: { ...consignadosConfig, dataFile: file }
  };
}

function run(requestBody) {
  const context = fixture();
  try {
    const result = processIssue({ body: requestBody, config: context.config });
    return { result, data: JSON.parse(readFileSync(context.file, "utf8")) };
  } finally {
    rmSync(context.directory, { recursive: true, force: true });
  }
}

function rejects(requestBody, pattern) {
  const context = fixture();
  const before = readFileSync(context.file, "utf8");
  try {
    assert.throws(() => processIssue({ body: requestBody, config: context.config }), pattern);
    assert.equal(readFileSync(context.file, "utf8"), before, "falhas não podem alterar o arquivo");
  } finally {
    rmSync(context.directory, { recursive: true, force: true });
  }
}

test("cadastrar, editar e excluir de forma determinística", () => {
  const created = run(body());
  assert.equal(created.result.recordId, "cons-2026-06");
  assert.equal(created.data.relatorios["2026"].at(-1).id, "cons-2026-06");

  const edited = run(body({
    "Operação": "Editar",
    "Identificador": "cons-2026-05",
    "Ano": "2026",
    "Mês": "Maio",
    "Descrição": "Relatório de consignados — Mai/2026, versão \"final\"",
    "URL do documento": "https://drive.google.com/file/d/1AnotherValidDriveId99/view"
  }));
  assert.match(edited.data.relatorios["2026"].at(-1).descricao, /versão "final"/);

  const deleted = run(body({
    "Operação": "Excluir",
    "Identificador": "cons-2026-05",
    "Ano": "",
    "Mês": "Não se aplica",
    "Descrição": "",
    "URL do documento": ""
  }));
  assert.equal(deleted.data.relatorios["2026"].some((item) => item.id === "cons-2026-05"), false);
});

test("rejeitar identificadores ausentes, duplicados ou inconsistentes", () => {
  rejects(body({ "Operação": "Editar", "Identificador": "cons-2029-12" }), /não foi encontrado/);
  rejects(body({ "Ano": "2026", "Mês": "Maio" }), /Já existe/);
  rejects(body({
    "Operação": "Editar",
    "Identificador": "cons-2026-05",
    "Ano": "2026",
    "Mês": "Junho"
  }), /não podem ser alterados/);

  const context = fixture();
  try {
    const data = JSON.parse(readFileSync(context.file, "utf8"));
    data.relatorios["2026"][1].id = data.relatorios["2026"][0].id;
    writeFileSync(context.file, serializeConsignados(data));
    assert.throws(
      () => processIssue({ body: body(), config: context.config }),
      /não corresponde|duplicado/
    );
  } finally {
    rmSync(context.directory, { recursive: true, force: true });
  }
});

test("rejeitar ano, mês, HTML e links fora da lista permitida", () => {
  rejects(body({ "Ano": "1999" }), /ano deve/);
  rejects(body({ "Ano": "2000" }), /lista permitida/);
  rejects(body({ "Mês": "Décimo terceiro" }), /mês válido/);
  rejects(body({ "Descrição": "<script>alert(1)</script>" }), /HTML/);
  rejects(body({ "URL do documento": "http://drive.google.com/file/d/1ValidDriveIdentifier123/view" }), /Google Drive/);
  rejects(body({ "URL do documento": "https://example.com/file/d/1ValidDriveIdentifier123/view" }), /Google Drive/);
  rejects(body({ "URL do documento": "https://drive.google.com/file/d/" }), /Google Drive/);
});

test("rejeitar confirmação, justificativa, campos duplicados e solicitações sem mudança", () => {
  rejects(body({ "Confirmação": "- [ ] Não confirmado" }), /confirmação/);
  rejects(body({ "Justificativa administrativa": "curta" }), /justificativa/);
  rejects(`${body()}\n\n### Operação\n\nExcluir`, /duplicado/);
  rejects(body({
    "Operação": "Editar",
    "Identificador": "cons-2026-05",
    "Ano": "2026",
    "Mês": "Maio",
    "Descrição": "Relatório de consignados - Mai/2026",
    "URL do documento": "https://drive.google.com/file/d/1J2_3qAc2b3smDpSSXfXKuWEvfLmxjzyf/view?usp=sharing"
  }), /nenhuma alteração/);
});

test("preservar o prefixo que aciona o workflow", async () => {
  const { consignadosAdminConfig } = await import("../../admin/modules/consignados.js");
  const { buildIssueUrl } = await import("../../admin/components/admin-app.js");
  assert.match(consignadosAdminConfig.issueTitle("Cadastrar"), /^\[ADMIN CONSIGNADOS\]/);
  assert.match(
    consignadosAdminConfig.issueTitle("Editar", { id: "cons-2026-05" }),
    /^\[ADMIN CONSIGNADOS\] Editar cons-2026-05$/
  );
  const url = buildIssueUrl(consignadosAdminConfig, "Editar", {
    id: "cons-2026-05",
    ano: "2026",
    mes: "Maio",
    descricao: "Relatório com acentuação e aspas \"seguras\"",
    url: "https://drive.google.com/file/d/1J2_3qAc2b3smDpSSXfXKuWEvfLmxjzyf/view"
  });
  assert.equal(url.searchParams.get("operacao"), "Editar");
  assert.equal(url.searchParams.get("identificador"), "cons-2026-05");
  assert.equal(url.searchParams.get("mes"), "Maio");
  assert.match(url.searchParams.get("title"), /^\[ADMIN CONSIGNADOS\]/);
});

test("manter as proteções estáticas do workflow", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/administrar-json.yml", import.meta.url),
    "utf8"
  );
  const wrapper = readFileSync(
    new URL("../../.github/workflows/administrar-consignados.yml", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(workflow, /pull_request_target|issue_comment|author_association/);
  assert.doesNotMatch(workflow, /actions\/(checkout|setup-node)@v\d/);
  assert.match(workflow, /collaborators\/\$ACTOR\/permission/);
  assert.match(workflow, /JSON_ADMIN_USERS/);
  assert.match(workflow, /--draft/);
  assert.match(workflow, /git add -- "\$DATA_FILE"/);
  assert.match(wrapper, /startsWith\(github\.event\.issue\.title, '\[ADMIN CONSIGNADOS\]'/);
  assert.match(wrapper, /uses: \.\/\.github\/workflows\/administrar-json\.yml/);
});
