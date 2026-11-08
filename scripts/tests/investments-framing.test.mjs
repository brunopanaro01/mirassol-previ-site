import test from 'node:test';
import assert from 'node:assert/strict';
import {framingKey,framingSummary,framingOverview} from '../../admin/modules/investments/framing.js';
const fixture=()=>({invest_fundos:[{id:1,nome:'RF público',artigo_resolucao:'Art. 7º, I',ativo:false,consignado:true},{id:2,nome:'RF geral',artigo_resolucao:'Art. 7º, V'}],invest_saldos:[{fundo_id:1,mes_ano:'2026-09',saldo_final:20},{fundo_id:2,mes_ano:'2026-09',saldo_final:80}]});
test('agrupa a competência, inclusive fundo encerrado e conta dos consignados, sem alterar entradas',()=>{
 const d=fixture(),before=structuredClone(d);d.invest_saldos.push({fundo_id:1,mes_ano:'2026-08',saldo_final:900});
 const q=framingSummary(d,'2026-09',{base:100});assert.equal(q.total,100);assert.equal(q.groups.find(g=>g.key==='7-I').amount,20);assert.equal(q.groups.length,2);assert.deepEqual(d.invest_fundos,before.invest_fundos);
});
test('limite exato e excesso de um centavo; elegibilidade é separada do teto',()=>{
 const d=fixture();let g=framingSummary(d,'2026-09',{base:100,level:1}).groups.find(g=>g.key==='7-V');assert.equal(g.excess,false);assert.equal(g.status,'Dentro do limite percentual');assert.equal(g.eligible,false);
 d.invest_saldos[0].saldo_final=19.99;d.invest_saldos[1].saldo_final=80.01;g=framingSummary(d,'2026-09',{base:100}).groups.find(g=>g.key==='7-V');assert.equal(g.excess,true);assert.equal(g.status,'Acima do limite percentual');
});
test('base ausente ou menor que os ativos não produz conclusão de conformidade',()=>{
 for(const base of [null,0,99]){const q=framingSummary(fixture(),'2026-09',{base});assert.equal(q.base,null);assert.ok(q.groups.every(g=>g.status==='Informar base do RPPS'));}
});
test('cadastro desconhecido, saldo negativo e duplicidade impedem falsa conformidade',()=>{
 for(const kind of ['unknown','negative','duplicate','missing']){const d=fixture();if(kind==='unknown')d.invest_fundos[1].artigo_resolucao='';if(kind==='negative')d.invest_saldos[0].saldo_final=-1;if(kind==='duplicate')d.invest_saldos.push({...d.invest_saldos[0]});if(kind==='missing')d.invest_saldos[0].saldo_final=null;const q=framingSummary(d,'2026-09',{base:200});assert.equal(q.incomplete,true);assert.ok(q.groups.every(g=>g.status!=='Dentro do limite percentual'));}
});
test('não confunde fundo bancário com empréstimo nem aplica CMN 5272 a mês antigo',()=>{
 assert.equal(framingKey('Artigo 7º I, "b"'),'7-I');assert.equal(framingKey('Artigo 7º III, "a"'),null);assert.equal(framingKey('Art. 8º, III'),'8-III');assert.equal(framingKey('Art. 9º, III'),'9-III');
 const d=fixture();d.invest_fundos[0].artigo_resolucao='Art. 12';d.invest_fundos[0].cnpj='00.000.000/0001-00';assert.equal(framingSummary(d,'2026-09',{base:100}).incomplete,true);
 d.invest_saldos.forEach(r=>r.mes_ano='2026-01');assert.ok(framingSummary(d,'2026-01',{base:100}).groups.every(g=>g.status==='Requer norma histórica'));
 assert.equal(framingSummary({},'2026-09').total,0);
});

test('todas as 22 modalidades permanecem visíveis com zero onde não há posição',()=>{
 const q=framingOverview(fixture(),'2026-09',1);assert.equal(q.groups.length,22);
 assert.equal(q.groups.find(g=>g.key==='10-II').fundShare,0);
 assert.equal(q.groups.find(g=>g.key==='12').integrated,false);
 assert.equal(framingOverview({},'2026-09',1).groups.filter(g=>g.integrated).every(g=>g.fundShare===0),true);
});
test('nível ajusta acesso e limite de consignados sem ocultar nem alterar a carteira',()=>{
 const d=fixture();for(let level=0;level<=4;level++)assert.equal(framingOverview(d,'2026-09',level).groups.length,22);
 const get=(level,key)=>framingOverview(d,'2026-09',level).groups.find(g=>g.key===key);
 assert.equal(get(1,'7-V').availableLimit,0);assert.equal(get(2,'7-V').availableLimit,80);
 assert.equal(get(2,'10-I').availableLimit,15);assert.equal(get(3,'10-II').availableLimit,5);assert.equal(get(4,'10-III').availableLimit,10);
 assert.equal(get(0,'12').availableLimit,5);assert.equal(get(1,'12').availableLimit,10);
 assert.equal(get(1,'7-V').fundShare,get(4,'7-V').fundShare);
});
test('percentuais são recalculados a partir de lançamentos atualizados',()=>{
 const d=fixture();assert.equal(framingOverview(d,'2026-09').groups.find(g=>g.key==='7-I').fundShare,20);
 d.invest_saldos[0].saldo_final=80;
 assert.equal(framingOverview(d,'2026-09').groups.find(g=>g.key==='7-I').fundShare,50);
});
