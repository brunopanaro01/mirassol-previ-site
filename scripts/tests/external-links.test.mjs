import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const script = fs.readFileSync(path.join(root, "js/external-links.js"), "utf8");
const publicPages = fs.readdirSync(root)
  .filter((file) => file.endsWith(".html"));

test("todas as páginas públicas carregam o aviso de links externos", () => {
  for (const page of publicPages) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    assert.match(html, /<script\s+src=["']js\/external-links\.js\?v=20260912["']><\/script>/i, page);
  }
});

test("aviso reconhece apenas links HTTP externos e informa o domínio", () => {
  assert.match(script, /\^https\?:\$/);
  assert.match(script, /PORTAL_HOSTS\.has\(url\.hostname\)/);
  assert.match(script, /data-external-host/);
  assert.match(script, /Você está saindo do portal/);
  assert.match(script, /Cancelar/);
  assert.match(script, /Continuar/);
});

test("redirecionamento externo protege a aba de origem", () => {
  assert.match(script, /noopener,noreferrer/);
  assert.match(script, /event\.preventDefault\(\)/);
});
