import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../../supabase/migrations/202610080036_action_plan_monitoring_collection.sql", import.meta.url),
  "utf8"
);
const adminModule = readFileSync(
  new URL("../../admin/modules/publicacoes.js", import.meta.url),
  "utf8"
);

test("avaliações do plano de ação coexistem como publicações atuais", () => {
  assert.match(migration, /v_category NOT IN \('certificate', 'action_plan_monitoring'\)/);
  assert.match(migration, /category = 'action_plan_monitoring'[\s\S]*status = 'current'/);
  assert.match(adminModule, /MULTI_CURRENT_CATEGORIES = new Set\(\["action_plan_monitoring"\]\)/);
  assert.match(adminModule, /MULTI_CURRENT_CATEGORIES\.has\(category\) \? "current"/);
});

test("cadastro oculta situação de versão para avaliações periódicas", () => {
  assert.match(adminModule, /data-status-field/);
  assert.match(adminModule, /statusWrapper\.hidden = keepsAllCurrent/);
});
