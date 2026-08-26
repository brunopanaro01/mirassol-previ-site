import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const path = new URL("../../patrimonio_anual.json", import.meta.url);
const indexPath = new URL("../../index.html", import.meta.url);

test("patrimônio anual contém JSON válido e uma série cronológica", async () => {
  const data = JSON.parse(await readFile(path, "utf8"));

  assert.ok(Array.isArray(data.dados));
  assert.ok(data.dados.length > 0);

  const years = data.dados.map(({ ano }) => Number(ano));
  const values = data.dados.map(({ valor }) => Number(valor));

  assert.equal(new Set(years).size, years.length, "há anos duplicados");
  assert.deepEqual(years, [...years].sort((a, b) => a - b));
  assert.ok(years.every(Number.isInteger), "todo ano deve ser inteiro");
  assert.ok(values.every((value) => Number.isFinite(value) && value >= 0));
});

test("patrimônio de 2026 está disponível para o gráfico", async () => {
  const data = JSON.parse(await readFile(path, "utf8"));
  assert.deepEqual(
    data.dados.find(({ ano }) => ano === 2026),
    { ano: 2026, valor: 76504801.17 }
  );
});

test("gráfico cria uma coluna para cada ano sem quebrar a série", async () => {
  const index = await readFile(indexPath, "utf8");

  assert.match(
    index,
    /grid-template-columns:repeat\(var\(--bar-count, 8\), minmax\(0, 1fr\)\)/
  );
  assert.match(
    index,
    /chart\.style\.setProperty\('--bar-count', dados\.length\)/
  );
  assert.doesNotMatch(index, /grid-template-columns:repeat\(8,/);
});
