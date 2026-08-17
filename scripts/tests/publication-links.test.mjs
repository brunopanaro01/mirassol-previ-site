import assert from "node:assert/strict";
import test from "node:test";

import { safeHttps } from "../../js/url-utils.js";

const ORIGIN = "https://mirassolprevi.com.br";

test("URL externa ausente não é convertida em rota /null", () => {
  assert.equal(safeHttps(null, ORIGIN), "");
  assert.equal(safeHttps(undefined, ORIGIN), "");
  assert.equal(safeHttps("", ORIGIN), "");
  assert.equal(safeHttps("   ", ORIGIN), "");
});

test("aceita HTTPS externo e caminho interno do portal", () => {
  assert.equal(
    safeHttps("https://example.com/documento.pdf", ORIGIN),
    "https://example.com/documento.pdf"
  );
  assert.equal(
    safeHttps("/documentos/arquivo.pdf", ORIGIN),
    "https://mirassolprevi.com.br/documentos/arquivo.pdf"
  );
});

test("recusa endereço HTTP de origem externa", () => {
  assert.equal(safeHttps("http://example.com/documento.pdf", ORIGIN), "");
});
