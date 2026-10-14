// Núcleo de caixa. Entradas normalizadas por um mapeamento contábil validado.
const categories = new Set(['normal_contribution', 'comprev', 'other_current',
  'supplementary_funding', 'installment', 'benefit', 'administration',
  'investment_return', 'redemption', 'internal_transfer']);
const revenueCategories = new Set(['normal_contribution', 'comprev', 'other_current']);
export function cents(value) {
  if (typeof value !== 'string' || !/^-?\d{1,16}\.\d{2}$/.test(value)) {
    throw new Error('Informe dinheiro como texto decimal com duas casas.');
  }
  return BigInt(value.replace('.', ''));
}
export function decimal(value) {
  const sign = value < 0n ? '-' : '';
  const abs = value < 0n ? -value : value;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new Error('Data de caixa inválida.');
  }
}
export function cashIndicators(records, period, { complete = false } = {}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Competência inválida.');
  if (!Array.isArray(records)) throw new Error('Registros devem ser uma lista.');
  const unique = new Map();
  for (const record of records) {
    if (!record || typeof record !== 'object') throw new Error('Registro inválido.');
    for (const key of ['source', 'sourceRecordId', 'evidence', 'mappingVersion', 'entity']) {
      if (typeof record[key] !== 'string' || !record[key].trim()) throw new Error(`Origem ausente: ${key}`);
    }
    if (!categories.has(record.category)) throw new Error('Natureza sem mapeamento.');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(record.originPeriod)) throw new Error('Competência de origem inválida.');
    date(record.cashDate);
    cents(record.amount);
    if (!['benefits', 'administrative'].includes(record.fund)) throw new Error('Destinação ausente.');
    const id = JSON.stringify([record.source, record.sourceRecordId]);
    const canonical = JSON.stringify(Object.keys(record).sort().map(k => [k, record[k]]));
    if (unique.has(id)) {
      if (unique.get(id).canonical !== canonical) throw new Error('Revisões conflitantes exigem escolha explícita.');
    } else unique.set(id, { record, canonical });
  }
  for (const { record } of unique.values()) {
    if (cents(record.amount) >= 0n) continue;
    const original = unique.get(JSON.stringify([record.source, record.reversalOf]))?.record;
    if (!original || cents(original.amount) <= 0n || original.category !== record.category ||
        original.fund !== record.fund || original.entity !== record.entity) {
      throw new Error('Estorno exige vínculo com registro original da mesma natureza e destinação.');
    }
  }
  const included = [...unique.values()].map(x => x.record).filter(x => x.cashDate.startsWith(period));
  let current = 0n, supplementary = 0n, benefits = 0n, installments = 0n;
  const evidence = [];
  for (const record of included) {
    if (record.fund !== 'benefits') continue;
    let used = true;
    if (revenueCategories.has(record.category)) current += cents(record.amount);
    else if (record.category === 'supplementary_funding') supplementary += cents(record.amount);
    else if (record.category === 'benefit') benefits += cents(record.amount);
    else if (record.category === 'installment') installments += cents(record.amount);
    else used = false;
    if (used) evidence.push({ source: record.source, sourceRecordId: record.sourceRecordId,
      evidence: record.evidence, mappingVersion: record.mappingVersion,
      originPeriod: record.originPeriod, cashDate: record.cashDate });
  }
  if (current < 0n || benefits < 0n || supplementary < 0n || installments < 0n) {
    throw new Error('Estornos excedem os recebimentos ou pagamentos no período; revisar classificação.');
  }
  const values = complete ? {
    currentRevenue: decimal(current), benefitsPaidGross: decimal(benefits),
    supplementaryFunding: decimal(supplementary), installmentReceipts: decimal(installments),
    currentResult: decimal(current - benefits),
    resultAfterSupplementary: decimal(current + supplementary - benefits),
    coveragePercent: benefits === 0n ? null : decimal((current * 10000n + benefits / 2n) / benefits)
  } : null;
  return { period, basis: 'cash', status: complete ? 'calculated_pending_validation' : 'incomplete',
    values, evidence, uniqueRecords: unique.size };
}
