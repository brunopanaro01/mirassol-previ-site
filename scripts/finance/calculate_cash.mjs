import { readFile, writeFile } from 'node:fs/promises';
import { cashIndicators } from './indicators.mjs';
const [input, period, output] = process.argv.slice(2);
if (!input || !period || !output || process.argv.length !== 5) {
  console.error('Uso: node scripts/finance/calculate_cash.mjs ENTRADA.json AAAA-MM SAIDA.json');
  process.exit(1);
}
try {
  const data = JSON.parse(await readFile(input, 'utf8'));
  if (typeof data.complete !== 'boolean') throw new Error('Declare complete como booleano.');
  const result = cashIndicators(data.records, period, { complete: data.complete });
  await writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(`Competência ${period}: ${result.status}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
