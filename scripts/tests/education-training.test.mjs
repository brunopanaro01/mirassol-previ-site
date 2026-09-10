import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../../supabase/migrations/202609100033_education_training.sql",
    import.meta.url
  ),
  "utf8"
);
const portal = await readFile(
  new URL("../../transparencia.html", import.meta.url),
  "utf8"
);
const portalScript = await readFile(
  new URL("../../js/transparencia.js", import.meta.url),
  "utf8"
);
const adminModule = await readFile(
  new URL("../../admin/modules/publicacoes.js", import.meta.url),
  "utf8"
);
const dashboard = await readFile(
  new URL("../../admin/modules/dashboard.js", import.meta.url),
  "utf8"
);
const adminShell = await readFile(
  new URL("../../admin/sigprevi.html", import.meta.url),
  "utf8"
);
const fallback = JSON.parse(
  await readFile(new URL("../../educacao.json", import.meta.url), "utf8")
);

test("migração preserva as 21 capacitações do JSON anterior", () => {
  const seededJson = migration.match(/\$education\$(.*?)\$education\$/s)?.[1];
  assert.ok(seededJson, "dados iniciais não encontrados na migration");
  assert.deepEqual(JSON.parse(seededJson), fallback);
  assert.equal(Object.values(fallback).flat().length, 21);
});

test("todos os campos públicos das capacitações são preservados", () => {
  for (const field of [
    "course_title", "location", "planned_start", "planned_end",
    "participants", "objective", "estimated_cost", "workload", "status"
  ]) {
    assert.match(migration, new RegExp(`'${field}'`));
    assert.match(portalScript, new RegExp(field));
  }
});

test("RPC pública não expõe autoria nem abre a tabela ao visitante", () => {
  const publicFunction = migration.match(
    /CREATE OR REPLACE FUNCTION public\.education_public_training_snapshot\(\)[\s\S]*?\$\$;/
  )?.[0];
  assert.ok(publicFunction, "função pública não encontrada");
  assert.match(publicFunction, /SECURITY DEFINER/);
  assert.doesNotMatch(
    publicFunction,
    /created_by|updated_by|published_by|archived_by/
  );
  assert.match(
    migration,
    /REVOKE ALL ON TABLE app\.education_training_activities[\s\S]*FROM PUBLIC, anon, authenticated;/
  );
  assert.doesNotMatch(
    migration,
    /GRANT SELECT[\s\S]*app\.education_training_activities/i
  );
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
});

test("portal usa Supabase como fonte principal e JSON como contingência", () => {
  const databaseCall = portalScript.indexOf(
    'rpc("education_public_training_snapshot")'
  );
  const fallbackCall = portalScript.indexOf(
    "fetch(EDUCATION_FALLBACK_URL",
    databaseCall
  );
  assert.ok(databaseCall >= 0, "consulta ao banco não encontrada");
  assert.ok(fallbackCall > databaseCall, "JSON deve ser usado só após falha do banco");
  assert.match(portal, /id="training-list"/);
  assert.match(portal, /href="#educacao">Educação</);
});

test("portal mantém o acesso aos documentos oficiais de educação", () => {
  assert.match(
    portal,
    /https:\/\/www\.consultatransparencia\.com\.br\/mirassoldoestenovo\/Transparencia\/Documentos\?tipo=158&amp;Pag2=CompostoProGestao/
  );
  assert.match(portal, />Documentos oficiais ↗<\/a>/);
});

test("SIGPREVI oferece cadastro, edição, publicação e exclusão", () => {
  assert.match(adminModule, /data-publication-tab="trainings"/);
  assert.match(adminModule, /data-create-kind="training"/);
  assert.match(adminModule, /education_admin_save_training/);
  assert.match(adminModule, /education_admin_set_training_publication/);
  assert.match(adminModule, /education_admin_delete_training/);
  assert.match(migration, /THEN 'publications\.create'/);
  assert.match(migration, /ELSE 'publications\.update'/);
  assert.match(migration, /app\.require_publications_permission\('publications\.publish'\)/);
  assert.match(migration, /app\.require_publications_permission\('publications\.delete'\)/);
  const deleteFunction = migration.match(
    /CREATE OR REPLACE FUNCTION public\.education_admin_delete_training[\s\S]*?\$\$;/
  )?.[0];
  assert.match(deleteFunction, /is_published = false/);
  assert.match(adminModule, /if \(!record\.is_published\)/);
});

test("identificadores de cache carregam a versão com capacitações", () => {
  assert.match(dashboard, /publicacoes\.js\?v=20260910-capacitacoes-1/);
  assert.match(adminShell, /dashboard\.js\?v=20260910-capacitacoes-1/);
  assert.match(portal, /transparencia\.js\?v=20260910-capacitacoes-1/);
});
