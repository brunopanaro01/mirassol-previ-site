import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminModule = await readFile(
  new URL("../../admin/modules/publicacoes.js", import.meta.url),
  "utf8"
);
const portalScript = await readFile(
  new URL("../../js/transparencia.js", import.meta.url),
  "utf8"
);

test("SIGPREVI possui área própria para gerenciar certidões", () => {
  assert.match(adminModule, /data-publication-tab="certificates"/);
  assert.match(adminModule, /data-publication-panel="certificates"/);
  assert.match(adminModule, /data-document-category="certificate"/);
  assert.match(adminModule, /id="publication-certificate-records"/);
  assert.match(adminModule, /Cadastrar certidão/);
});

test("certidões reutilizam o fluxo seguro de documentos", () => {
  assert.match(adminModule, /publications_admin_save_document/);
  assert.match(adminModule, /publications_admin_set_document_publication/);
  assert.match(adminModule, /publications_admin_delete/);
  assert.match(adminModule, /uploadDocument/);
  assert.match(adminModule, /valid_until/);
  assert.match(adminModule, /issued_at/);
});

test("portal continua exibindo somente certidões publicadas pelo snapshot", () => {
  assert.match(portalScript, /\["certificate"\]/);
  assert.match(portalScript, /record\.valid_until/);
  assert.match(portalScript, /Nenhuma certidão foi publicada/);
});
