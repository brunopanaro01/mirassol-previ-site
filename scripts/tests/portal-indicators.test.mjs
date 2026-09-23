import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../../supabase/migrations/202609230034_portal_indicators.sql", import.meta.url),
  "utf8"
);
const portal = await readFile(new URL("../../index.html", import.meta.url), "utf8");
const adminModule = await readFile(
  new URL("../../admin/modules/publicacoes.js", import.meta.url),
  "utf8"
);
const peopleFallback = JSON.parse(
  await readFile(new URL("../../dados.json", import.meta.url), "utf8")
);
const assetsFallback = JSON.parse(
  await readFile(new URL("../../patrimonio_anual.json", import.meta.url), "utf8")
);

test("migração preserva todos os indicadores históricos", () => {
  for (const [year, retirees] of Object.entries(peopleFallback.aposentados)) {
    const pensioners = peopleFallback.pensionistas[year];
    const insured = peopleFallback.segurados[year];
    const asset = assetsFallback.dados.find((item) => String(item.ano) === year)?.valor;
    const assetSql = asset === undefined ? "NULL" : Number(asset).toFixed(2);
    assert.match(
      migration,
      new RegExp(`\\(${year},\\s*${retirees},\\s*${pensioners},\\s*${insured},\\s*${assetSql.replace(".", "\\.")}\\)`)
    );
  }
});

test("API pública expõe somente os quatro indicadores e o ano", () => {
  assert.match(migration, /portal_public_indicators_snapshot/);
  assert.match(migration, /'reference_year', reference_year/);
  assert.match(migration, /'retirees', retirees/);
  assert.match(migration, /'pensioners', pensioners/);
  assert.match(migration, /'insured', insured/);
  assert.match(migration, /'net_assets', net_assets/);
  assert.doesNotMatch(
    migration.match(/CREATE OR REPLACE FUNCTION public\.portal_public_indicators_snapshot[\s\S]*?\$\$;/)?.[0] ?? "",
    /created_by|updated_by/
  );
});

test("página inicial usa Supabase antes dos JSONs de contingência", () => {
  const databaseCall = portal.indexOf("portal_public_indicators_snapshot");
  const peopleFallbackCall = portal.indexOf("fetch('./dados.json'", databaseCall);
  const assetsFallbackCall = portal.indexOf("fetch('./patrimonio_anual.json'", databaseCall);
  assert.ok(databaseCall >= 0);
  assert.ok(peopleFallbackCall > databaseCall);
  assert.ok(assetsFallbackCall > databaseCall);
  assert.match(portal, /renderKPIs\(normalized\.people\)/);
  assert.match(portal, /renderPatrimonio\(normalized\.assets\)/);
});

test("SIGPREVI permite cadastrar e editar os indicadores anuais", () => {
  assert.match(adminModule, /data-publication-tab="indicators"/);
  assert.match(adminModule, /data-publication-panel="indicators"/);
  assert.match(adminModule, /data-create-kind="indicator"/);
  assert.match(adminModule, /portal_indicators_admin_snapshot/);
  assert.match(adminModule, /portal_indicators_admin_save/);
  for (const field of ["reference_year", "insured", "retirees", "pensioners", "net_assets"]) {
    assert.match(adminModule, new RegExp(`name="${field}"`));
  }
});

test("tabela de indicadores possui RLS e reutiliza permissões de Publicações", () => {
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /publications\.read/);
  assert.match(migration, /publications\.create/);
  assert.match(migration, /publications\.update/);
  assert.match(migration, /REVOKE ALL ON TABLE app\.portal_annual_indicators/);
});
