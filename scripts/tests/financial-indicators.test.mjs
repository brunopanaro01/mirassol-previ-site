import test from 'node:test';
import assert from 'node:assert/strict';
import { cents, cashIndicators } from '../finance/indicators.mjs';
const row = (id, category, amount, extra = {}) => ({ source: 'official-export',
  sourceRecordId: id, evidence: 'closing-2026-09.csv', mappingVersion: 'v1',
  entity: 'prefeitura', fund: 'benefits', originPeriod: '2026-09',
  cashDate: '2026-09-30', category, amount, ...extra });
test('caixa separa corrente, suplementar e parcelamento; exclui resgates e transferência', () => {
  const result = cashIndicators([row('a','normal_contribution','800.00'),
    row('b','benefit','1000.00'), row('c','supplementary_funding','400.00'),
    row('d','redemption','50000.00'), row('e','internal_transfer','50000.00'),
    row('f','investment_return','900.00'), row('g','installment','30.00'),
    row('h','normal_contribution','70.00',{fund:'administrative'})], '2026-09',{complete:true});
  assert.equal(result.values.currentResult,'-200.00');
  assert.equal(result.values.resultAfterSupplementary,'200.00');
  assert.equal(result.values.coveragePercent,'80.00');
  assert.equal(result.evidence.length,4);
});
test('repasse recebido em outubro não altera o caixa de setembro', () => {
  const r = row('a','normal_contribution','1.00',{cashDate:'2026-10-05'});
  assert.equal(cashIndicators([r],'2026-09',{complete:true}).values.currentRevenue,'0.00');
  const out=cashIndicators([r],'2026-10',{complete:true});
  assert.equal(out.values.currentRevenue,'1.00');
  assert.equal(out.evidence[0].originPeriod,'2026-09');
});
test('importação repetida é idempotente e correção exige revisão', () => {
  const r=row('a','normal_contribution','0.10');
  assert.equal(cashIndicators([r,{...r}],'2026-09',{complete:true}).values.currentRevenue,'0.10');
  assert.throws(()=>cashIndicators([r,{...r,amount:'0.20'}],'2026-09'),/Revisões/);
});
test('dados incompletos não produzem zeros; denominador zero não produz percentual', () => {
  assert.equal(cashIndicators([],'2026-09').values,null);
  assert.equal(cashIndicators([],'2026-09',{complete:true}).values.coveragePercent,null);
});
test('dinheiro exato, formatos e datas inválidas e falta de evidência', () => {
  assert.equal(cents('90071992547409.91')+cents('0.01'),9007199254740992n);
  for(const amount of [0.1,'0.1','NaN','1e2','1,00']) assert.throws(()=>cents(amount));
  assert.throws(()=>cashIndicators([row('a','benefit','1.00',{cashDate:'2026-02-30'})],'2026-09'));
  assert.throws(()=>cashIndicators([row('a','benefit','1.00',{evidence:''})],'2026-09'));
});
test('estornos vinculados reduzem o total sem gerar retorno artificial',()=>{
  const rows=[row('a','normal_contribution','100.00'),row('b','normal_contribution','-10.00',{reversalOf:'a'})];
  assert.equal(cashIndicators(rows,'2026-09',{complete:true}).values.currentRevenue,'90.00');
});

test("estorno sem original é rejeitado",()=>assert.throws(()=>cashIndicators([row("a","benefit","-1.00")],"2026-09"),/Estorno/));
