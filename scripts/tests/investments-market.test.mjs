import test from 'node:test';
import assert from 'node:assert/strict';
import {CsvReader,cvmCandidate,alias,inferBenchmark,parseSgs,parseSgsMonthlyReturn,parseAnbimaMonthly,canonicalAnbimaIndex} from '../../supabase/functions/investments-market-data/parsers.js';
test('official monthly SGS values distinguish missing and zero',()=>{
 assert.equal(parseSgs([]),null);assert.equal(parseSgs([{valor:'0,00'}]),0);assert.equal(parseSgs([{valor:'-0.10'}]),-.1);
 assert.throws(()=>parseSgs([{valor:'NaN'}]));assert.throws(()=>parseSgs([{valor:''}]));
});
test('CVM streaming CSV handles chunks, quotes, semicolons and embedded newlines',()=>{
 const rows=[],parser=new CsvReader(r=>rows.push(r));
 const csv='CNPJ_FUNDO;DENOM_SOCIAL;CLASSE;SIT\r\n"12.345.678/0001-90";"Fundo; \"\"DI\"\"\nBrasil";"RENDA FIXA";"NORMAL"\r\n';
 for(let n=0;n<csv.length;n+=3)parser.write(csv.slice(n,n+3),n+3>=csv.length);
 assert.equal(rows.length,1);assert.equal(rows[0].DENOM_SOCIAL,'Fundo; "DI"\nBrasil');
 assert.equal(alias(rows[0],['CNPJ_FUNDO']),'12.345.678/0001-90');
 const result=cvmCandidate({...rows[0],DENOM_SOCIAL:'Fundo Referenciado DI'},'12345678000190');
 assert.equal(result.data.benchmark,'CDI');assert.equal(result.data.classe,'CDI / REFERENCIADO DI');assert.equal(result.score,13);
 assert.equal(inferBenchmark('Fundo IMA-B 5+','RENDA FIXA'),'IMA-B 5+');
});

test('official Ibovespa series calculates the requested monthly return',()=>{
 const values=[{data:'30/09/2026',valor:'145000.00'},{data:'01/10/2026',valor:'146000.00'},{data:'30/10/2026',valor:'150800.00'}];
 assert.equal(parseSgsMonthlyReturn(values,'2026-10'),4);
 assert.equal(parseSgsMonthlyReturn(values,'2026-09'),null);
});
test('official ANBIMA payload normalizes index names and decimal formats',()=>{
 assert.equal(canonicalAnbimaIndex('IMA - B 5+'),'IMA-B 5+');
 assert.deepEqual(parseAnbimaMonthly({resultados:[
  {indice:'IMA-B 5+',variacao_mensal:'1,2345'},
  {nome_indice:'IRF-M 1',variacao_no_mes:0.4567}
 ]}),[{indicator:'IMA-B 5+',value:1.2345},{indicator:'IRF-M 1',value:.4567}]);
});
