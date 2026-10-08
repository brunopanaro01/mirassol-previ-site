import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../supabase/migrations/202610080035_publication_document_series.sql", import.meta.url),
  "utf8"
);
const adminModule = readFileSync(
  new URL("../../admin/modules/publicacoes.js", import.meta.url),
  "utf8"
);
const publicModule = readFileSync(
  new URL("../../js/transparencia.js", import.meta.url),
  "utf8"
);

test("cartilhas independentes recebem grupos de versões próprios", () => {
  assert.match(migration, /ADD COLUMN series_key text/);
  assert.match(migration, /WHERE category = v_category\s+AND series_key = v_series_key/s);
  assert.match(migration, /ELSIF v_status = 'current' AND v_category <> 'certificate'/);
});

test("cartilha previdenciária existente é preservada na migração", () => {
  assert.match(migration, /SET series_key = 'cartilha-previdenciaria'/);
  assert.match(migration, /category <> 'guidance_booklet' OR series_key IS NOT NULL/);
});

test("SIGPREVI permite informar e reaproveitar o grupo da cartilha", () => {
  assert.match(adminModule, /name="series_key"/);
  assert.match(adminModule, /Grupo de versões da cartilha/);
  assert.match(adminModule, /series_key: seriesKey/);
  assert.match(adminModule, /slugify\(form\.elements\.series_key\.value\.trim\(\) \|\| title\)/);
  assert.doesNotMatch(adminModule, /name="series_key"[^>]*pattern=/);
  assert.match(adminModule, /form\.elements\.series_key\.value = seriesKey/);
});

test("portal continua exibindo todas as cartilhas vigentes juntas", () => {
  assert.match(publicModule, /category !== "guidance_booklet" \|\| record\.status === "current"/);
  assert.match(publicModule, /\["guidance_booklet", "capacity_plan"\]/);
});
