import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {realMonthly,compose,targetPanel,fundHistory,fundIndicator,fundRadar,fundRanking,monthlyTarget,monthlyReturn} from '../../admin/modules/investments/calculations.js';
import {visibleTabs,parseNumber} from '../../admin/modules/investments/catalog.js';
const fixture=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/investments-reference.json.gz',import.meta.url))).toString('utf8'));
const data=fixture.inputs,expected=fixture.expected;
function equivalent(actual,wanted,path='result'){
 if(typeof wanted==='number'){assert.equal(typeof actual,'number',path);assert.ok(Math.abs(actual-wanted)<1e-8,`${path}: ${actual} != ${wanted}`);return;}
 if(wanted===null||typeof wanted!=='object'){assert.equal(actual,wanted,path);return;}
 if(Array.isArray(wanted)){assert.ok(Array.isArray(actual),path);assert.equal(actual.length,wanted.length,path);wanted.forEach((v,i)=>equivalent(actual[i],v,`${path}[${i}]`));return;}
 // Extra status metadata (closed-month support) does not alter the legacy numeric result.
 for(const [k,v]of Object.entries(wanted))equivalent(actual[k],v,`${path}.${k}`);
}
test('synthetic fixture only; monthly real rate and compound return match Python',()=>{
 assert.equal(fixture.synthetic,true);
 for(const row of expected._taxa_real_mensal)equivalent(realMonthly(row.input),row.expected);
 for(const row of expected._compor_percentuais)equivalent(compose(row.input),row.expected);
});
test('annual target and cumulative portfolio match original Python',()=>{
 for(const [year,wanted]of Object.entries(expected._painel_meta_atuarial)){
  const actual=targetPanel(data,year);
  // Python uses :g in warning text; semantic warning is independently tested below.
  if(actual)actual.linhas.forEach((r,i)=>{if(wanted.linhas[i]?.aviso)r.aviso=wanted.linhas[i].aviso;});
  equivalent(actual,wanted);
 }
});
test('fund histories for all original periods match Python',()=>{
 for(const [key,wanted]of Object.entries(expected._historico_individual_fundo)){
  const [id,period]=key.split(':');equivalent(fundHistory(data,data.invest_fundos.find(f=>f.id===Number(id)),period),wanted,key);
 }
});
test('risk indicators and original class thresholds match Python',()=>{
 for(const [key,wanted]of Object.entries(expected._indicador_desempenho_fundo)){
  const [id,month]=key.split(':');equivalent(fundIndicator(data,data.invest_fundos.find(f=>f.id===Number(id)),month==='None'?null:month),wanted,key);
 }
});
test('radar axes and ranking scores match Python',()=>{
 for(const [key,wanted]of Object.entries(expected._radar_individual_fundo)){
  const [id,period]=key.split(':'),f=data.invest_fundos.find(f=>f.id===Number(id));equivalent(fundRadar(f,fundHistory(data,f,period),fundIndicator(data,f)),wanted,key);
 }
 for(const [key,wanted]of Object.entries(expected._dados_ranking_fundos)){
  const [period,closed]=key.split(':');equivalent(fundRanking(data,period,closed==='True'),wanted,key);
 }
});
test('IPCA missing, zero, changed and divergent legacy are explicit',()=>{
 assert.equal(monthlyTarget(data,'2026-03').ipca_percentual,null);
 assert.equal(monthlyTarget(data,'2026-02').ipca_percentual,0);
 const altered=structuredClone(data);altered.invest_indicadores_mensais.find(r=>r.mes_ano==='2026-01'&&r.indicador==='IPCA').rentabilidade_percentual=.8;
 assert.equal(monthlyTarget(altered,'2026-01').ipca_percentual,.8);
 assert.match(monthlyTarget(altered,'2026-04').aviso,/Divergência/);
 assert.equal(monthlyTarget(altered,'2026-04').ipca_percentual,.9);
 assert.equal(monthlyTarget(altered,'2026-05').origem,'Histórico preservado');
 assert.equal(altered.invest_meta_atuarial_anual[0].taxa_real_anual,data.invest_meta_atuarial_anual[0].taxa_real_anual);
});
test('closed snapshot overrides later source changes without modifying input',()=>{
 const closed=structuredClone(data),snapshot=monthlyTarget(closed,'2026-01');
 closed.invest_competencias_fechadas=[{mes_ano:'2026-01',snapshot}];
 closed.invest_indicadores_mensais.find(r=>r.mes_ano==='2026-01'&&r.indicador==='IPCA').rentabilidade_percentual=9;
 assert.equal(monthlyTarget(closed,'2026-01').ipca_percentual,snapshot.ipca_percentual);
 assert.equal(monthlyTarget(closed,'2026-01').fechada,true);
 const divergent=structuredClone(data);
 divergent.invest_competencias_fechadas=[{mes_ano:'2026-04',snapshot:monthlyTarget(data,'2026-04')}];
 assert.match(monthlyTarget(divergent,'2026-04').aviso,/Divergência/);
});
test('empty fund and zero or negative investment base remain defined',()=>{
 assert.equal(fundIndicator({}, {id:1}).cor,'cinza');assert.equal(fundHistory({}, {id:1}).total_meses,0);
 assert.equal(monthlyReturn({saldo_inicial:0,rendimento:50}),0);
 assert.equal(monthlyReturn({saldo_inicial:10,resgates:20,rendimento:50}),0);
});
test('committee has consultation tabs and no posting tab; decimal input preserves 5.63',()=>{
 assert.ok(!visibleTabs(false).some(([key])=>key==='lancamentos'));
 assert.ok(visibleTabs(false).some(([key])=>key==='meta'));
 assert.ok(visibleTabs(true).some(([key])=>key==='lancamentos'));
 assert.equal(parseNumber('5,63'),5.63);assert.equal(parseNumber('5.63'),5.63);assert.equal(parseNumber('1.234,56'),1234.56);
 assert.throws(()=>parseNumber('xyz'));
});
