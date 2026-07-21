import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildRequestUrl } from "../../admin/core/request-builder.js";
import { loadModuleConfig } from "../cms/config-loader.mjs";

const workflow = readFileSync(new URL("../../.github/workflows/cms-admin.yml", import.meta.url), "utf8");
const ci = readFileSync(new URL("../../.github/workflows/cms-ci.yml", import.meta.url), "utf8");

test("workflow evita eventos privilegiados e executa autorização antes do checkout", () => {
  assert.doesNotMatch(workflow, /pull_request_target|issue_comment/);
  assert.doesNotMatch(workflow, /actions\/(checkout|setup-node)@v\d/);
  assert.match(workflow, /needs: autorizar/);
  assert.match(workflow, /collaborators\/\$ACTOR\/permission/);
  assert.match(workflow, /JSON_ADMIN_USERS/);
  assert.match(workflow, /git add -- "\$DATA_FILE"/);
  assert.match(workflow, /--draft/);
  assert.match(workflow, /persist-credentials: false/);
  const authorizeJob = workflow.slice(workflow.indexOf("  autorizar:"), workflow.indexOf("  resolver:"));
  assert.doesNotMatch(authorizeJob, /actions\/checkout/);
});

test("CI usa somente leitura e ações fixadas por SHA", () => {
  assert.match(ci, /permissions:\n  contents: read/);
  assert.doesNotMatch(ci, /actions\/(checkout|setup-node)@v\d/);
  assert.match(ci, /npm test/);
  assert.match(ci, /validate:cms/);
});

test("catálogo publicado é derivado de _data pelo Jekyll", () => {
  const manifest = readFileSync(new URL("../../admin/config/modules.json", import.meta.url), "utf8");
  assert.match(manifest, /^---\nlayout: null\npermalink: \/admin\/config\/modules\.json\n---/);
  assert.match(manifest, /site\.data\.cms\.modules \| jsonify/);
});

test("URL da issue codifica dados sem construir HTML", () => {
  const config = loadModuleConfig("consignados");
  const url = buildRequestUrl(config, { operation: "update", recordId: "cons-2026-05", baseRevision: "a".repeat(64),
    values: { descricao: "Acentuação, aspas \" e </textarea>", ano: "2026", mes: "Maio", url: "https://example.com/?a=1&b=2" } });
  assert.equal(url.searchParams.get("operacao"), "update");
  assert.match(url.searchParams.get("dados"), /<\/textarea>/);
  assert.equal(url.hostname, "github.com");
});
