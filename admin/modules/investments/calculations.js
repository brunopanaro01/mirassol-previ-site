// Port of the director panel's formulas. Missing observations are not converted to zero.
export const normalize = (v) => String(v ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim().replace(/\s+/g, ' ');
export function benchmarkName(v) {
  const t = normalize(v);
  return ({'REFERENCIADO DI':'CDI','CDI REFERENCIADO DI':'CDI','DI':'CDI','IMAB':'IMA-B','IMAB 5':'IMA-B 5','IMAB 5+':'IMA-B 5+','IRFM':'IRF-M','IRFM 1':'IRF-M 1','IRFM 1+':'IRF-M 1+','IBOV':'IBOVESPA','BDRX':'GLOBAL BDRX'})[t] ?? t;
}
export const compose = (vs) => (vs.reduce((f,v) => f * (1 + Number(v ?? 0)/100), 1) - 1)*100;
export const realMonthly = (annual) => ((1+Number(annual ?? 0)/100)**(1/12)-1)*100;
export function sampleDeviation(vs) {
  if (vs.length < 2) return 0;
  const mean = vs.reduce((a,b)=>a+Number(b??0),0)/vs.length;
  return Math.sqrt(vs.reduce((a,b)=>a+(Number(b??0)-mean)**2,0)/(vs.length-1));
}
export function monthlyReturn(r) {
  const base = Number(r.saldo_inicial??0)+Number(r.aplicacoes??0)-Number(r.resgates??0);
  return base > 0 ? Number(r.rendimento??0)/base*100 : 0;
}
export const records = (data, table) => data[table] ?? [];
export function portfolio(data, month) {
  const rows = records(data,'invest_saldos').filter(r=>!month || r.mes_ano===month);
  const sum = (key) => rows.reduce((s,r)=>s+Number(r[key]??0),0);
  const base = rows.reduce((s,r)=>s+Math.max(0,Number(r.saldo_inicial??0)+Number(r.aplicacoes??0)-Number(r.resgates??0)),0);
  return {saldo_final:sum('saldo_final'),saldo_inicial:sum('saldo_inicial'),aplicacoes:sum('aplicacoes'),resgates:sum('resgates'),rendimento:sum('rendimento'),rentabilidade:base>0?sum('rendimento')/base*100:0};
}
export function ipcaSource(data, annual, month) {
  const legacy = records(data,'invest_indice_atuarial_mensal').find(r=>r.meta_anual_id===annual.id && r.mes===Number(month.slice(5)));
  const official = records(data,'invest_indicadores_mensais').find(r=>r.mes_ano===month && r.indicador===annual.indice);
  const value = official?.rentabilidade_percentual ?? null;
  if (legacy) return {valor:legacy.indice_percentual,origem:'Histórico preservado',aviso:value===null?'Histórico preservado: índice ausente em Indicadores Econômicos.':Math.abs(legacy.indice_percentual-value)>1e-9?`Divergência: histórico ${legacy.indice_percentual}% e Indicadores ${value}%. Histórico preservado; requer conferência.`:null};
  return {valor:value,origem:'Indicadores Econômicos',aviso:null};
}
export function monthlyTarget(data, month) {
  if (!month || month.length!==7) return null;
  const closed = records(data,'invest_competencias_fechadas').find(r=>r.mes_ano===month);
  if (closed) {
    const annual=records(data,'invest_meta_atuarial_anual').find(r=>r.ano===Number(month.slice(0,4)));
    const aviso=annual?ipcaSource(data,annual,month).aviso:closed.snapshot.aviso??null;
    return {mes_ano:month,...closed.snapshot,taxa_real_mensal:realMonthly(closed.snapshot.taxa_real_anual),fechada:true,aviso};
  }
  const annual=records(data,'invest_meta_atuarial_anual').find(r=>r.ano===Number(month.slice(0,4)));
  if (!annual) return null;
  const source=ipcaSource(data,annual,month), real=realMonthly(annual.taxa_real_anual);
  return {mes_ano:month,ipca_percentual:source.valor,meta_percentual:source.valor===null?null:((1+source.valor/100)*(1+real/100)-1)*100,
    taxa_real_mensal:real,taxa_real_anual:annual.taxa_real_anual,indice:annual.indice,origem:source.origem,aviso:source.aviso};
}
export function targetPanel(data, year) {
  const meta=records(data,'invest_meta_atuarial_anual').find(r=>r.ano===Number(year));
  if (!meta) return null;
  const linhas=[], indices=[], targets=[], returns=[];
  for (let mes=1;mes<=12;mes++) {
    const mes_ano=`${year}-${String(mes).padStart(2,'0')}`, target=monthlyTarget(data,mes_ano);
    if (target.ipca_percentual===null) {linhas.push({mes,mes_ano,indice_mes:null});continue;}
    const carteira_mes=portfolio(data,mes_ano).rentabilidade;
    indices.push(target.ipca_percentual);targets.push(target.meta_percentual);returns.push(carteira_mes);
    linhas.push({mes,mes_ano,indice_mes:target.ipca_percentual,origem:target.origem,aviso:target.aviso,fechada:!!target.fechada,
      meta_mes:target.meta_percentual,indice_acumulado:compose(indices),meta_acumulada:compose(targets),carteira_mes,carteira_acumulada:compose(returns),atingiu:compose(returns)>=compose(targets)});
  }
  return {meta,linhas,taxa_real_mensal:realMonthly(meta.taxa_real_anual),ultima:linhas.filter(r=>r.indice_mes!==null).at(-1)??null};
}
export function fundHistory(data, fund, period=12) {
  period=Number.parseInt(period,10);if (![3,6,12,24].includes(period)) period=12;
  const rows=records(data,'invest_saldos').filter(r=>r.fundo_id===fund.id).sort((a,b)=>a.mes_ano.localeCompare(b.mes_ano)).slice(-period);
  const linhas=rows.map(r=>{
    const benchmark=records(data,'invest_indicadores_mensais').find(i=>i.mes_ano===r.mes_ano && i.indicador===benchmarkName(fund.benchmark))?.rentabilidade_percentual??null;
    const meta_atuarial=monthlyTarget(data,r.mes_ano)?.meta_percentual??null, rentabilidade=monthlyReturn(r);
    return {...Object.fromEntries(['saldo_inicial','aplicacoes','resgates','rendimento','saldo_final'].map(k=>[k,r[k]??0])),mes_ano:r.mes_ano,rentabilidade,benchmark,meta_atuarial,
      diferenca_benchmark:benchmark===null?null:rentabilidade-benchmark,diferenca_meta:meta_atuarial===null?null:rentabilidade-meta_atuarial};
  });
  const vs=linhas.map(r=>r.rentabilidade),bs=linhas.map(r=>r.benchmark).filter(v=>v!==null),ms=linhas.map(r=>r.meta_atuarial).filter(v=>v!==null);
  return {periodo:period,linhas,retorno_acumulado:compose(vs),benchmark_acumulado:bs.length?compose(bs):null,meta_acumulada:ms.length?compose(ms):null,
    volatilidade:sampleDeviation(vs),melhor_mes:linhas.reduce((a,b)=>!a||b.rentabilidade>a.rentabilidade?b:a,null),pior_mes:linhas.reduce((a,b)=>!a||b.rentabilidade<a.rentabilidade?b:a,null),
    meses_acima_benchmark:linhas.filter(r=>r.diferenca_benchmark!==null&&r.diferenca_benchmark>=0).length,
    meses_acima_meta:linhas.filter(r=>r.diferenca_meta!==null&&r.diferenca_meta>=0).length,total_meses:linhas.length,ultimo:linhas.at(-1)??null};
}
export function fundIndicator(data,fund,month=null) {
  const rows=records(data,'invest_saldos').filter(r=>r.fundo_id===fund.id).sort((a,b)=>a.mes_ano.localeCompare(b.mes_ano));
  if (!rows.length) return {cor:'cinza',nivel:'Sem histórico',motivos:['Sem lançamentos mensais.'],rentabilidade_mes:0,benchmark_mes:null,diferenca_benchmark:null,situacao_benchmark:'Sem benchmark',volatilidade_6m:0,volatilidade_12m:0,meses_negativos:0,rentabilidade_acumulada:0,benchmark_acumulado:0,diferenca_acumulada:null};
  const atual=rows.find(r=>r.mes_ano===month)??rows.at(-1), nome=benchmarkName(fund.benchmark);
  const benchmark_mes=records(data,'invest_indicadores_mensais').find(i=>i.mes_ano===atual.mes_ano&&i.indicador===nome)?.rentabilidade_percentual??null;
  const rentabilidade_mes=monthlyReturn(atual),diferenca=benchmark_mes===null?null:rentabilidade_mes-benchmark_mes;
  let negativos=0;for(const r of [...rows].reverse()){if(monthlyReturn(r)<0)negativos++;else break;}
  const year=atual.mes_ano.slice(0,4),bs=records(data,'invest_indicadores_mensais').filter(i=>i.indicador===nome&&i.mes_ano.startsWith(year+'-')).sort((a,b)=>a.mes_ano.localeCompare(b.mes_ano));
  const rentabilidade_acumulada=compose(rows.filter(r=>r.mes_ano.startsWith(year)).map(monthlyReturn)),benchmark_acumulado=compose(bs.map(i=>i.rentabilidade_percentual));
  const vol6=sampleDeviation(rows.slice(-6).map(monthlyReturn)),vol12=sampleDeviation(rows.slice(-12).map(monthlyReturn)),classe=normalize(fund.classe);
  const limits=classe.includes('CDI')||classe.includes('REFERENCIADO DI')?[.30,.70,1,2,-.10,-.25]:classe.includes('IMA-B 5')?[2,4,2,3,-.35,-.80]:classe.includes('IMA-B')?[4,7,2,4,-.50,-1.20]:classe.includes('ACOES')||classe.includes('EXTERIOR')?[10,18,2,4,-1,-2.5]:[2,5,2,3,-.4,-1];
  const [va,vr,pa,pr,da,dr]=limits,amarelo=[],vermelho=[];
  if(negativos>=pa)(negativos>=pr?vermelho:amarelo).push(`${negativos} meses consecutivos de rentabilidade negativa.`);
  if(vol12>va)(vol12>vr?vermelho:amarelo).push(`Volatilidade de 12 meses em ${vol12.toFixed(2)}%, ${vol12>vr?'acima do limite da classe.':'em nível moderado.'}`);
  if(diferenca!==null&&diferenca<=da)(diferenca<=dr?vermelho:amarelo).push(`Ficou ${Math.abs(diferenca).toFixed(2)} p.p. abaixo do benchmark no mês.`);
  if(rentabilidade_mes<0&&benchmark_mes!==null&&benchmark_mes>0)vermelho.push('Rentabilidade negativa enquanto o benchmark foi positivo.');
  const cor=vermelho.length?'vermelho':amarelo.length?'amarelo':'verde';
  return {cor,nivel:{verde:'Normal',amarelo:'Atenção',vermelho:'Crítico'}[cor],motivos:vermelho.length||amarelo.length?[...vermelho,...amarelo]:['Desempenho dentro dos parâmetros.'],rentabilidade_mes,benchmark_mes,diferenca_benchmark:diferenca,
    situacao_benchmark:diferenca===null?'Sem benchmark':diferenca>.0001?'Acima do benchmark':diferenca<-.0001?'Abaixo do benchmark':'Igual ao benchmark',
    volatilidade_6m:vol6,volatilidade_12m:vol12,meses_negativos:negativos,rentabilidade_acumulada,benchmark_acumulado,diferenca_acumulada:bs.length?rentabilidade_acumulada-benchmark_acumulado:null};
}
export function fundRadar(fund,history,indicator) {
  const last=history.ultimo,db=last?.diferenca_benchmark??null,dm=last?.diferenca_meta??null,v=history.volatilidade??0,c=normalize(fund.classe||fund.classe_cvm);
  const limit=c.includes('CDI')||c.includes('REFERENCIADO DI')?.7:c.includes('IRF-M 1')?1.5:c.includes('IMA-B 5')?4:c.includes('IMA-B')?7:c.includes('ACOES')||c.includes('EXTERIOR')?18:5;
  const eixos=[];const axis=(nome,situacao,valor,descricao)=>eixos.push({nome,situacao,valor,descricao});
  axis('Benchmark',db===null?'cinza':db>=0?'verde':db>-.5?'amarelo':'vermelho',db===null?'Sem dado':`${db>=0?'+':''}${db.toFixed(2)} p.p.`,db===null?'O benchmark da competência ainda não foi informado.':db>=0?'O fundo ficou igual ou acima do benchmark.':db>-.5?'O fundo ficou moderadamente abaixo do benchmark.':'O fundo ficou significativamente abaixo do benchmark.');
  axis('Meta atuarial',dm===null?'cinza':dm>=0?'verde':dm>-.5?'amarelo':'vermelho',dm===null?'Sem dado':`${dm>=0?'+':''}${dm.toFixed(2)} p.p.`,dm===null?'A meta atuarial da competência ainda não está disponível.':dm>=0?'O fundo superou a meta atuarial da competência.':dm>-.5?'O fundo ficou pouco abaixo da meta atuarial.':'O fundo ficou significativamente abaixo da meta atuarial.');
  axis('Volatilidade',v<=limit*.6?'verde':v<=limit?'amarelo':'vermelho',`${v.toFixed(2)}%`,v<=limit*.6?'A volatilidade está confortável para a classe.':v<=limit?'A volatilidade exige acompanhamento.':'A volatilidade está acima do limite indicativo da classe.');
  const n=indicator.meses_negativos??0;
  axis('Perdas sucessivas',n===0?'verde':n<=2?'amarelo':'vermelho',n===0?'Nenhuma':n<=2?`${n} mês(es)`:`${n} meses`,n===0?'Não há sequência atual de rentabilidades negativas.':n<=2?'Há sequência curta de rentabilidades negativas.':'Há sequência relevante de rentabilidades negativas.');
  const total=history.total_meses??0,cons=total?(history.meses_acima_benchmark??0)/total*100:0;
  axis('Consistência',!total?'cinza':cons>=70?'verde':cons>=50?'amarelo':'vermelho',`${cons.toFixed(0)}%`,'Percentual de meses iguais ou acima do benchmark.');
  const nota=eixos.reduce((s,e)=>s+({verde:2,amarelo:1,vermelho:0,cinza:1})[e.situacao],0)/(eixos.length*2)*10;
  return {eixos,nota,situacao:nota>=8?'verde':nota>=6?'amarelo':'vermelho'};
}
export function fundRanking(data,period=12,includeClosed=false) {
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  return records(data,'invest_fundos').filter(f=>includeClosed||!f.status_carteira||f.status_carteira==='ATIVO').sort((a,b)=>a.nome.localeCompare(b.nome)).map(fundo=>{
    const historico=fundHistory(data,fundo,period),indicador=fundIndicator(data,fundo),radar=fundRadar(fundo,historico,indicador);
    const diferenca_benchmark=historico.benchmark_acumulado===null?null:historico.retorno_acumulado-historico.benchmark_acumulado,diferenca_meta=historico.meta_acumulada===null?null:historico.retorno_acumulado-historico.meta_acumulada;
    const score=clamp(radar.nota+(diferenca_benchmark===null?0:clamp(diferenca_benchmark,-1.5,1.5))+(diferenca_meta===null?0:clamp(diferenca_meta,-1,1))-Math.min(2,historico.volatilidade/10),0,10);
    return {fundo,historico,indicador,radar,score,diferenca_benchmark,diferenca_meta};
  }).filter(r=>r.historico.linhas.length).sort((a,b)=>b.score-a.score||b.historico.retorno_acumulado-a.historico.retorno_acumulado).map((r,i)=>({...r,posicao:i+1}));
}
