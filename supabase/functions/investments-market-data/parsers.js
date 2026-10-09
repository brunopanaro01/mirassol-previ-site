export const digits=v=>String(v??'').replace(/\D/g,'');
const column=v=>String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim().replace(/[^A-Z0-9]+/g,'_');
export function alias(row,names){const normalized=Object.fromEntries(Object.entries(row).map(([k,v])=>[column(k),String(v??'').trim()]));for(const name of names){const value=normalized[column(name)];if(value)return value;}return '';}
export function inferBenchmark(name,cls){
 const text=`${name} ${cls}`.toUpperCase();
 if(['REFERENCIADO DI','REF DI','CDI','LIQUIDEZ'].some(k=>text.includes(k)))return 'CDI';
 for(const [target,aliases]of [['IMA-B 5+',['IMA-B 5+','IMAB 5+']],['IMA-B 5',['IMA-B 5','IMAB 5']],['IMA-B',['IMA-B','IMAB']],['IRF-M 1+',['IRF-M 1+','IRFM 1+']],['IRF-M 1',['IRF-M 1','IRFM 1']],['IRF-M',['IRF-M','IRFM']],['IPCA',['IPCA']],['IBOVESPA',['IBOVESPA','IBOV']]])if(aliases.some(k=>text.includes(k)))return target;
 return '';
}
export function cvmCandidate(row,cnpj){
 const name=alias(row,['DENOM_SOCIAL_CLASSE','DENOM_SOCIAL','DENOM_SOCIAL_FUNDO','NM_FUNDO','NOME_FUNDO','DENOMINACAO_SOCIAL']);
 const cls=alias(row,['CLASSE','CLASSE_ANBIMA','CLASSE_CVM','TP_FUNDO','TIPO_FUNDO','CLASSE_COTA','DENOM_CLASSE']);
 const raw=(cls||name).trim().toUpperCase();
 const classe_cvm=raw.includes('RENDA FIXA')||raw.includes('RF')?'RENDA FIXA':raw.includes('ACOES')||raw.includes('AÇÕES')?'AÇÕES':raw.includes('MULTIMERCADO')?'MULTIMERCADO':raw.includes('CAMBIAL')?'CAMBIAL':raw;
 const benchmark=inferBenchmark(name,cls),gestor=alias(row,['GESTOR','DENOM_SOCIAL_GESTOR','NM_GESTOR','GESTOR_FUNDO']),administrador=alias(row,['ADMIN','ADMINISTRADOR','DENOM_SOCIAL_ADMIN','NM_ADMIN','ADMINISTRADOR_FUNDO']);
 const situacao_cvm=alias(row,['SIT','SITUACAO','SIT_FUNDO','SIT_CLASSE','SITUACAO_CLASSE']);
 const score=(['FUNCIONAMENTO NORMAL','NORMAL','ATIVO'].some(k=>situacao_cvm.toUpperCase().includes(k))?10:0)+(alias(row,['DENOM_SOCIAL','DENOM_SOCIAL_FUNDO','DENOM_SOCIAL_CLASSE'])?3:0)+(alias(row,['ADMIN','ADMINISTRADOR','DENOM_SOCIAL_ADMIN'])?2:0)+(alias(row,['GESTOR','DENOM_SOCIAL_GESTOR'])?2:0);
 return {score,data:{cnpj,nome:name,classe:benchmark==='CDI'?'CDI / REFERENCIADO DI':benchmark||classe_cvm,classe_cvm,benchmark,gestor,administrador,custodiante:alias(row,['CUSTODIANTE','DENOM_SOCIAL_CUSTODIANTE','NM_CUSTODIANTE']),situacao_cvm}};
}
// Incremental CSV, including quoted delimiters/newlines and quotes split across chunks.
export class CsvReader {
 constructor(onRow){this.onRow=onRow;this.field='';this.row=[];this.header=null;this.quoted=false;this.afterQuote=false;this.delimiter=null;this.probe='';}
 write(text,final=false){
  if(this.delimiter===null){this.probe+=text;const end=this.probe.indexOf('\n');if(end<0&&!final)return;const header=this.probe.slice(0,end<0?undefined:end);this.delimiter=['; ',',','|','\t'].map(v=>v.trimEnd()||'\t').sort((a,b)=>header.split(b).length-header.split(a).length)[0];text=this.probe;this.probe='';}
  for(const char of text){
   if(this.quoted){if(this.afterQuote){if(char==='"'){this.field+='"';this.afterQuote=false;continue;}this.quoted=false;this.afterQuote=false;}else if(char==='"'){this.afterQuote=true;continue;}else{this.field+=char;continue;}}
   if(char==='"'&&!this.field){this.quoted=true;continue;}
   if(char===this.delimiter){this.row.push(this.field);this.field='';}
   else if(char==='\n'){this.row.push(this.field.replace(/\r$/,''));this.field='';this.emit();}
   else this.field+=char;
   if(this.field.length>1000000)throw new Error('Linha CVM maior que o limite suportado.');
  }
  if(final&&(this.field||this.row.length)){this.row.push(this.field.replace(/\r$/,''));this.field='';this.emit();}
 }
 emit(){if(!this.header)this.header=this.row.map(k=>k.replace(/^\uFEFF/,''));else if(this.row.some(Boolean))this.onRow(Object.fromEntries(this.header.map((k,i)=>[k,this.row[i]??''])));this.row=[];}
}
export function parseSgs(values){if(!Array.isArray(values)||!values.length)return null;const raw=String(values.at(-1).valor??'').trim();if(!raw)throw new Error('Valor oficial vazio.');const value=Number(raw.replace(',','.'));if(!Number.isFinite(value))throw new Error('Valor oficial inválido.');return value;}
