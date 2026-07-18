import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readRecords, writeRecords } from "../../cms/core/adapters.js";
import { validateModuleConfig } from "../../cms/core/config.js";
import { buildRecordId } from "../../cms/core/identity.js";
import { applyRecordOperation, normalizeAndValidateRecords } from "../../cms/core/records.js";
import { validateValues } from "../../cms/core/validators.js";

const config = validateModuleConfig(JSON.parse(readFileSync(
  new URL("../../_data/cms/modules/consignados.json", import.meta.url), "utf8"
)));
const data = JSON.parse(readFileSync(new URL("../../consignados.json", import.meta.url), "utf8"));

test("configuração declarativa descreve e valida o módulo homologado", () => {
  assert.equal(config.key, "consignados");
  assert.equal(config.data.file, "consignados.json");
  assert.deepEqual(config.operations, ["create", "update", "delete"]);
  assert.equal(buildRecordId(config, { ano: "2026", mes: "Junho" }), "cons-2026-06");
});

test("adaptador agrupado normaliza e recompõe o JSON sem perder metadados", () => {
  const records = normalizeAndValidateRecords(config, readRecords(config, data));
  assert.equal(records.length, 18);
  assert.equal(new Set(records.map((record) => record.id)).size, 18);
  const copy = structuredClone(data);
  writeRecords(config, copy, records);
  assert.deepEqual(copy, data);
  assert.equal(copy.observacoes, data.observacoes);
});

test("adaptadores suportam coleção na raiz, aninhada e matriz sem código por módulo", () => {
  const arrayConfig = { data: { adapter: "array", collectionPath: [], groups: [] } };
  assert.deepEqual(readRecords(arrayConfig, [{ id: "a", nome: "A" }]), [{ id: "a", nome: "A" }]);
  assert.deepEqual(writeRecords(arrayConfig, [{ id: "a" }], [{ id: "b", nome: "B" }]), [{ id: "b", nome: "B" }]);

  const matrixConfig = { data: { adapter: "matrix", collectionPath: [], groups: ["categoria", "ano"], valueField: "valor" } };
  const matrix = { contribuição: { "2025": 12.5 }, benefícios: { "2025": 9.25 } };
  const matrixRecords = readRecords(matrixConfig, matrix);
  assert.equal(matrixRecords.length, 2);
  assert.deepEqual(writeRecords(matrixConfig, structuredClone(matrix), matrixRecords), matrix);

  const nestedConfig = { data: { adapter: "array", collectionPath: ["metadados", "dados"], groups: [] } };
  const nested = { metadados: { titulo: "Teste", dados: [{ id: "1" }] } };
  assert.deepEqual(writeRecords(nestedConfig, structuredClone(nested), [{ id: "2" }]),
    { metadados: { titulo: "Teste", dados: [{ id: "2" }] } });
});

test("operações são determinísticas e preservam identificadores", () => {
  const records = normalizeAndValidateRecords(config, readRecords(config, data));
  const created = applyRecordOperation(config, records, {
    operation: "create", values: {
      ano: "2026", mes: "Junho", descricao: "Relatório de consignados - Jun/2026",
      url: "https://drive.google.com/file/d/1ValidDriveIdentifier123/view"
    }
  });
  assert.equal(created.some((record) => record.id === "cons-2026-06"), true);
  const updated = applyRecordOperation(config, records, {
    operation: "update", recordId: "cons-2026-05", values: {
      ano: "2026", mes: "Maio", descricao: "Relatório de consignados — Mai/2026, versão \"final\"",
      url: "https://drive.google.com/file/d/1AnotherValidDriveId99/view"
    }
  });
  assert.match(updated.find((record) => record.id === "cons-2026-05").descricao, /versão "final"/);
  const deleted = applyRecordOperation(config, records, { operation: "delete", recordId: "cons-2026-05", values: {} });
  assert.equal(deleted.some((record) => record.id === "cons-2026-05"), false);
});

test("validações comuns recusam valores inseguros e desconhecidos", () => {
  const valid = { ano: "2026", mes: "Junho", descricao: "Descrição válida", url: "https://drive.google.com/file/d/1ValidDriveIdentifier123/view" };
  assert.throws(() => validateValues(config, { ...valid, ano: "1999" }), /entre 2024 e 2099/);
  assert.throws(() => validateValues(config, { ...valid, mes: "Décimo terceiro" }), /valor válido/);
  assert.throws(() => validateValues(config, { ...valid, descricao: "<b>HTML</b>" }), /HTML/);
  assert.throws(() => validateValues(config, { ...valid, url: "http://drive.google.com/file/d/1ValidDriveIdentifier123/view" }), /HTTPS/);
  assert.throws(() => validateValues(config, { ...valid, url: "https://example.com/file/d/1ValidDriveIdentifier123/view" }), /Google Drive/);
  assert.throws(() => validateValues(config, { ...valid, extra: "não permitido" }), /não reconhecidos/);
});

test("edição e exclusão nunca selecionam registro de forma ambígua", () => {
  const records = normalizeAndValidateRecords(config, readRecords(config, data));
  assert.throws(() => applyRecordOperation(config, records, {
    operation: "update", recordId: "cons-2026-99", values: {}
  }), /não foi encontrado/);
  assert.throws(() => applyRecordOperation(config, records, {
    operation: "update", recordId: "cons-2026-05", values: {
      ano: "2026", mes: "Junho", descricao: "Descrição válida",
      url: "https://drive.google.com/file/d/1ValidDriveIdentifier123/view"
    }
  }), /não pode ser alterado/);
  const duplicate = structuredClone(data);
  duplicate.relatorios["2026"][1].id = duplicate.relatorios["2026"][0].id;
  assert.throws(() => normalizeAndValidateRecords(config, readRecords(config, duplicate)), /deveria ser|duplicado/);
});
