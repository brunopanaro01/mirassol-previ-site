import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../../supabase/migrations/202609090032_consignment_reports.sql",
    import.meta.url
  ),
  "utf8"
);

const portal = await readFile(
  new URL("../../consignado.html", import.meta.url),
  "utf8"
);

const dashboard = await readFile(
  new URL("../../admin/modules/dashboard.js", import.meta.url),
  "utf8"
);

const adminModule = await readFile(
  new URL("../../admin/modules/consignados.js", import.meta.url),
  "utf8"
);

const legacyAdmin = await readFile(
  new URL("../../admin/index.html", import.meta.url),
  "utf8"
);

const fallback = JSON.parse(
  await readFile(
    new URL("../../consignados.json", import.meta.url),
    "utf8"
  )
);

test("snapshot público não abre a tabela administrativa", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.consignments_public_reports_snapshot\(\)/
  );
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.consignments_public_reports_snapshot\(\)[\s\S]*FROM PUBLIC;/
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.consignments_public_reports_snapshot\(\)[\s\S]*TO anon, authenticated;/
  );
  assert.match(
    migration,
    /REVOKE ALL ON TABLE app\.consignment_reports FROM PUBLIC, anon, authenticated;/
  );
  assert.doesNotMatch(
    migration,
    /GRANT SELECT[\s\S]*app\.consignment_reports/i
  );
});

test("snapshot retorna somente os campos públicos dos relatórios", () => {
  const functionBody = migration.match(
    /CREATE OR REPLACE FUNCTION public\.consignments_public_reports_snapshot\(\)[\s\S]*?\$\$;/
  )?.[0];

  assert.ok(functionBody, "função pública não encontrada");
  for (const publicField of ["'id'", "'mes'", "'descricao'", "'url'", "'file_path'"]) {
    assert.match(functionBody, new RegExp(publicField));
  }
  for (const privateField of ["created_by", "updated_by", "published_by", "archived_by"]) {
    assert.doesNotMatch(functionBody, new RegExp(privateField));
  }
});

test("migração preserva integralmente os relatórios da contingência", () => {
  const fallbackRows = Object.values(fallback.relatorios).flat();
  const seededIds = migration.match(/"id":"cons-[0-9]{4}-(0[1-9]|1[0-2])"/g) ?? [];
  const seededUrls = migration.match(/https:\/\/drive\.google\.com\/file\/d\//g) ?? [];

  assert.equal(fallbackRows.length, 19);
  assert.equal(seededIds.length, fallbackRows.length);
  assert.equal(seededUrls.length, fallbackRows.length);
  fallbackRows.forEach((row) => {
    assert.match(migration, new RegExp(row.id));
    assert.ok(migration.includes(row.url), `URL ausente para ${row.id}`);
  });
});

test("portal consulta Supabase antes do JSON de contingência", () => {
  const databaseCall = portal.indexOf("consignments_public_reports_snapshot");
  const fallbackCall = portal.indexOf("loadReportsFallback()", databaseCall);

  assert.ok(databaseCall >= 0, "consulta ao Supabase não encontrada");
  assert.ok(fallbackCall > databaseCall, "JSON deve ser usado somente após falha do banco");
  assert.match(portal, /validateReports\(snapshot\)/);
  assert.match(portal, /REPORT_BUCKET = "consignment-reports"/);
});

test("SIGPREVI oferece gestão, publicação e upload dos relatórios", () => {
  assert.match(dashboard, /configureConsignmentsAccess/);
  assert.match(dashboard, /moduleName === "consignados"/);
  assert.match(dashboard, /initializeConsignmentsModule/);
  assert.match(adminModule, /consignments_admin_save_report/);
  assert.match(adminModule, /consignments_admin_set_report_publication/);
  assert.match(adminModule, /consignments_admin_archive_report/);
  assert.match(adminModule, /MAX_FILE_SIZE = 20 \* 1024 \* 1024/);
  assert.match(migration, /'consignment-reports'[\s\S]*20971520/);
});

test("rota administrativa antiga direciona ao SIGPREVI", () => {
  assert.match(
    legacyAdmin,
    /location\.replace\("sigprevi\.html\?module=consignados"\)/
  );
});
