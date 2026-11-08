// CMN 5.272/2025, modalidades dos arts. 7 a 12; limites globais exigem controle próprio.
export const framingRules = {
 '7-I': {label:'Art. 7º, I',description:'Fundos / ETF exclusivamente títulos públicos',limit:100,minLevel:0},
 '7-II': {label:'Art. 7º, II',description:'Tesouro — oferta primária / plataforma eletrônica',limit:100,minLevel:0},
 '7-III': {label:'Art. 7º, III',description:'Tesouro — mercado de balcão',limit:100,minLevel:1},
 '7-IV': {label:'Art. 7º, IV',description:'Operações compromissadas diretas',limit:5,minLevel:1},
 '7-V': {label:'Art. 7º, V',description:'Fundos RF sem sufixo Crédito Privado',limit:80,minLevel:2},
 '7-VI': {label:'Art. 7º, VI',description:'Ativos bancários diretos',limit:20,minLevel:2},
 '7-VII': {label:'Art. 7º, VII',description:'Fundos RF Crédito Privado',limit:20,minLevel:3},
 '7-VIII': {label:'Art. 7º, VIII',description:'Fundos de infraestrutura',limit:20,minLevel:3},
 '7-IX': {label:'Art. 7º, IX',description:'FIDC sênior',limit:20,minLevel:4},
 '8-I': {label:'Art. 8º, I',description:'Fundos de ações',limit:40,minLevel:2},
 '8-II': {label:'Art. 8º, II',description:'ETF de ações',limit:40,minLevel:2},
 '8-III': {label:'Art. 8º, III',description:'Fundos de BDR',limit:10,minLevel:3},
 '8-IV': {label:'Art. 8º, IV',description:'ETF internacional',limit:10,minLevel:3},
 '9-I': {label:'Art. 9º, I',description:'Renda Fixa — Dívida Externa',limit:10,minLevel:3},
 '9-II': {label:'Art. 9º, II',description:'Fundos no exterior — investidor qualificado',limit:10,minLevel:3},
 '9-III': {label:'Art. 9º, III',description:'Fundos no exterior — investidor em geral',limit:10,minLevel:3},
 '10-I': {label:'Art. 10, I',description:'Multimercado',limit:15,minLevel:2},
 '10-II': {label:'Art. 10, II',description:'Fiagro',limit:5,minLevel:3},
 '10-III': {label:'Art. 10, III',description:'Fundos de participações — FIP',limit:10,minLevel:4},
 '10-IV': {label:'Art. 10, IV',description:'Ações — Mercado de Acesso',limit:10,minLevel:4},
 '11': {label:'Art. 11',description:'Fundos imobiliários — FII',limit:20,minLevel:3},
 '12': {label:'Art. 12',description:'Empréstimos consignados',limit:10,minLevel:1}
};
export function framingKey(value){
 const text=String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
 const match=/^ART(?:IGO)?\.?\s*(7|8|9|10|11|12)\s*[O°º.]?\s*[,;–—-]?\s*([IVX]+)?\b/.exec(text);
 if(!match)return null;
 // Alíneas antigas indicam cadastro ainda baseado na CMN 4.963.
 if(match[1]==='7'&&['III','IV'].includes(match[2])&&/["'“”]\s*[A-Z]/.test(text))return null;
 const key=['11','12'].includes(match[1])?match[1]:`${match[1]}-${match[2]}`;
 return framingRules[key]?key:null;
}
const cents=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?null:Math.round(Number(value)*100);
export function framingSummary(data,month,{base=null,level=1}={}){
 const funds=new Map((data.invest_fundos??[]).map(f=>[String(f.id),f]));
 const groups=new Map(),warnings=[];let total=0;
 const selected=(data.invest_saldos??[]).filter(r=>r.mes_ano===month);
 const seen=new Set();
 for(const row of selected){
  const id=String(row.fundo_id);const value=cents(row.saldo_final);
  if(seen.has(id)){warnings.push('Há lançamentos duplicados para o mesmo fundo e competência.');}
  seen.add(id);
  if(value===null){warnings.push('Há saldo inválido na competência.');continue;}
  total+=value;if(value===0)continue;
  if(value<0)warnings.push('Há saldo negativo na competência.');
  const fund=funds.get(id);let key=framingKey(fund?.artigo_resolucao);
  // A marcação "conta dos consignados" não muda a natureza de uma cota de fundo.
  if(key==='12'&&String(fund?.cnpj??'').replace(/\D/g,'').length===14){key=null;warnings.push('Um fundo com CNPJ está cadastrado como empréstimo; revisar enquadramento.');}
  const rule=key==='12'&&level===0?{...framingRules['12'],limit:5,minLevel:0}:framingRules[key]??null;
  const group=groups.get(key)??{key,rule,cents:0,funds:[]};
  group.cents+=value;group.funds.push({fund,amount:value/100});groups.set(key,group);
 }
 const baseCents=base===null||base===''?null:cents(base);
 const validBase=baseCents!==null&&baseCents>0&&baseCents>=total;
 if(baseCents!==null&&!validBase)warnings.push('A base do RPPS deve ser positiva e não pode ser inferior aos ativos considerados neste quadro.');
 const currentRule=Boolean(month&&month>='2026-02');
 if(!currentRule)warnings.push('Competência anterior à vigência da CMN 5.272: aplicar norma e certificação históricas.');
 const incomplete=warnings.length>0||groups.has(null);
 const result=[...groups.values()].map(g=>{
  const percentage=validBase?g.cents/baseCents*100:null;
  const fundShare=total>0?g.cents/total*100:null;
  const excess=validBase&&g.rule?g.cents*100>baseCents*g.rule.limit:null;
  const eligible=g.rule?level>=g.rule.minLevel:false;
  let status='Pendente',tone='attention';
  if(!currentRule)status='Requer norma histórica';
  else if(!g.rule)status='Revisar cadastro';
  else if(!validBase)status='Informar base do RPPS';
  else if(incomplete)status='Revisar dados da carteira';
  else {status=excess?'Acima do limite percentual':'Dentro do limite percentual';tone=excess?'critical':eligible?'normal':'attention';}
  return {...g,amount:g.cents/100,percentage,fundShare,excess,eligible,status,tone,
   limitValue:validBase&&g.rule?baseCents/100*g.rule.limit/100:null};
 }).sort((a,b)=>(a.key===null)-(b.key===null)||Object.keys(framingRules).indexOf(a.key)-Object.keys(framingRules).indexOf(b.key));
 return {month,total:total/100,base:validBase?baseCents/100:null,groups:result,warnings:[...new Set(warnings)],currentRule,incomplete};
}

// Mantém todas as modalidades visíveis; posição existente não depende do filtro de nível.
export function framingOverview(data,month,level=1){
 const summary=framingSummary(data,month,{level});
 const actual=new Map(summary.groups.map(g=>[g.key,g]));
 const groups=Object.entries(framingRules).map(([key,original])=>{
  const rule=key==='12'&&level===0?{...original,limit:5,minLevel:0}:original;
  const row=actual.get(key)??{key,rule,amount:0,cents:0,funds:[],fundShare:0};
  const eligible=level>=rule.minLevel;
  return {...row,rule,eligible,availableLimit:eligible?rule.limit:0,
   fundShare:summary.total>0?(row.fundShare??0):0,
   integrated:key!=='12'||actual.has('12')};
 });
 if(actual.has(null))groups.push({...actual.get(null),availableLimit:null,integrated:true});
 return {...summary,groups};
}
