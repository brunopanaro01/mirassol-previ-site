import test from 'node:test';
import assert from 'node:assert/strict';
import {CsvReader,cvmCandidate,alias,inferBenchmark,parseSgs} from '../../supabase/functions/investments-market-data/parsers.js';
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
