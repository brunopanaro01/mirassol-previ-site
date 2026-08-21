import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../../admin/modules/publicacoes.js", import.meta.url),
  "utf8"
);

test("modal de configuração de colegiado possui os campos preenchidos por openDialog", () => {
  const bodyDialog = source.match(
    /<dialog id="body-dialog"[\s\S]*?<\/form><\/dialog>/
  )?.[0];

  assert.ok(bodyDialog, "modal de colegiado não encontrado");
  for (const field of [
    "record_id",
    "body_code",
    "body_name",
    "body_status",
    "last_reviewed_on",
    "official_url"
  ]) {
    assert.match(bodyDialog, new RegExp(`name="${field}"`));
  }
});
