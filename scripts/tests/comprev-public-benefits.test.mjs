import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../../supabase/migrations/202609040031_comprev_public_benefits.sql",
    import.meta.url
  ),
  "utf8"
);

const portal = await readFile(
  new URL("../../aposentadorias.html", import.meta.url),
  "utf8"
);

const details = await readFile(
  new URL("../../admin/modules/comprev-details.js", import.meta.url),
  "utf8"
);

const fallback = JSON.parse(
  await readFile(
    new URL("../../beneficios.json", import.meta.url),
    "utf8"
  )
);

test("snapshot público possui permissão anônima sem abrir a tabela COMPREV", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.comprev_public_benefits_snapshot\(\)/
  );
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(
    migration,
    /REVOKE ALL[\s\S]*comprev_public_benefits_snapshot\(\)[\s\S]*FROM PUBLIC;/
  );
  assert.match(
    migration,
    /GRANT EXECUTE[\s\S]*comprev_public_benefits_snapshot\(\)[\s\S]*TO anon, authenticated;/
  );
  assert.doesNotMatch(migration, /GRANT SELECT[\s\S]*comprev_cases/i);
});

test("snapshot retorna somente os campos públicos permitidos", () => {
  const functionBody = migration.match(
    /CREATE OR REPLACE FUNCTION public\.comprev_public_benefits_snapshot\(\)[\s\S]*?\$\$;/
  )?.[0];

  assert.ok(functionBody, "função pública não encontrada");
  for (const publicField of [
    "'mes'",
    "'descricao'",
    "'link'",
    "'processo_tce'"
  ]) {
    assert.match(functionBody, new RegExp(publicField));
  }

  for (const privateField of [
    "beneficiary_cpf",
    "benefit_number",
    "comprev_protocol_number",
    "monthly_compensation_amount",
    "arrears_amount",
    "notes"
  ]) {
    assert.doesNotMatch(functionBody, new RegExp(privateField));
  }
});

test("portal consulta o banco antes do JSON de contingência", () => {
  const databaseCall = portal.indexOf("comprev_public_benefits_snapshot");
  const fallbackCall = portal.indexOf("loadBeneficiosFallback()", databaseCall);

  assert.ok(databaseCall >= 0, "consulta ao Supabase não encontrada");
  assert.ok(
    fallbackCall > databaseCall,
    "JSON deve ser acionado somente depois da tentativa no banco"
  );
  assert.match(portal, /validateBeneficios\(data\)/);
  assert.match(portal, /validHttps\(item\.processo_tce\)/);
});

test("migração inicial preserva todos os benefícios da contingência", () => {
  const fallbackCount = Object.values(fallback)
    .reduce((total, rows) => total + rows.length, 0);
  const seededGrantLinks = migration.match(
    /https:\/\/drive\.google\.com\/file\/d\//g
  ) ?? [];

  assert.equal(fallbackCount, 26);
  assert.equal(seededGrantLinks.length, fallbackCount);
  assert.match(migration, /source_benefit_key text/);
  assert.match(
    migration,
    /CREATE UNIQUE INDEX comprev_cases_source_benefit_key_unique_idx/
  );
});

test("detalhes do COMPREV permitem manter os dados publicados", () => {
  for (const field of [
    "source_benefit_year",
    "source_benefit_month",
    "source_benefit_description",
    "grant_document_url"
  ]) {
    assert.match(details, new RegExp(`name="${field}"`));
    assert.match(details, new RegExp(`${field}: nullable\\(`));
  }
});
