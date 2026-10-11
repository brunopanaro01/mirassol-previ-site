import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {Unzip,UnzipInflate} from 'npm:fflate@0.8.2';
import {CsvReader,alias,digits,cvmCandidate,parseSgs} from './parsers.js';

const origins=new Set(['https://mirassolprevi.com.br','https://www.mirassolprevi.com.br','http://localhost:5500','http://127.0.0.1:5500']);
function response(request:Request,value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':origins.has(request.headers.get('origin')??'')?request.headers.get('origin')!:'https://mirassolprevi.com.br','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'}});}

Deno.serve(async request=>{
 if(request.method==='OPTIONS')return response(request,{});
 if(request.method!=='POST')return response(request,{error:'Método não permitido.'},405);
 const authorization=request.headers.get('authorization')??'';
 if(!authorization.startsWith('Bearer '))return response(request,{error:'Autenticação necessária.'},401);
 const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
 // Uses caller's JWT, never a service-role key. Database checks active account and role.
 const {data:snapshot,error:accessError}=await client.rpc('investments_snapshot');
 if(accessError||!snapshot?.can_manage)return response(request,{error:'Operação restrita ao gestor.'},403);
 try{
  const body=await request.json();
  if(body.action==='indicators'){
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month??''))throw new Error('Competência inválida.');
   const [year,month]=body.month.split('-').map(Number),last=new Date(Date.UTC(year,month,0)).getUTCDate();
   const start=`01/${String(month).padStart(2,'0')}/${year}`,end=`${last}/${String(month).padStart(2,'0')}/${year}`;
   const saved:string[]=[],errors:string[]=[];
   for(const [indicator,series,source]of [['IPCA','433','IBGE via Banco Central do Brasil - SGS 433'],['SELIC','4390','Banco Central do Brasil - SGS 4390']]){
    try{
     const remote=await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${series}/dados?formato=json&dataInicial=${start}&dataFinal=${end}`,{signal:AbortSignal.timeout(15000)});
     if(!remote.ok)throw new Error(`Fonte oficial indisponível (HTTP ${remote.status}).`);
     const value=parseSgs(await remote.json());if(value===null){errors.push(`${indicator}: valor ainda não publicado.`);continue;}
     const old=snapshot.tables.invest_indicadores_mensais.find((r:{mes_ano:string;indicador:string})=>r.mes_ano===body.month&&r.indicador===indicator);
     const {error}=await client.rpc('investments_save',{p_table:'invest_indicadores_mensais',p_id:old?.id??null,p_version:old?.version??null,p_data:{mes_ano:body.month,indicador:indicator,rentabilidade_percentual:value,fonte:source,observacao:`Atualização oficial em ${new Date().toISOString()}.`}});
     if(error)throw error;saved.push(`${indicator}: ${value}%.`);
    }catch(e){errors.push(`${indicator}: ${e instanceof Error?e.message:String(e)}`);}
   }
   return response(request,{saved,errors});
  }
  if(body.action==='cvm'){
   const cnpj=digits(body.cnpj);if(cnpj.length!==14)throw new Error('Informe um CNPJ com 14 dígitos.');
   const remote=await fetch('https://dados.cvm.gov.br/dados/FI/CAD/DADOS/registro_fundo_classe.zip',{signal:AbortSignal.timeout(45000)});
   if(!remote.ok||!remote.body)throw new Error('Cadastro CVM indisponível.');
   let candidate:{score:number;data:unknown}|null=null,uncompressed=0,compressed=0,error:Error|null=null;
   const unzip=new Unzip(file=>{
    if(!/\.(csv|txt)$/i.test(file.name)){file.terminate();return;}
    const decoder=new TextDecoder('windows-1252'),csv=new CsvReader((row:Record<string,string>)=>{
     if(digits(alias(row,['CNPJ_FUNDO','CNPJ_FUNDO_CLASSE','CNPJ_CLASSE','CNPJ','CNPJ_FUNDO_COTA','CNPJ_CLASSE_COTA']))!==cnpj)return;
     const found=cvmCandidate(row,body.cnpj);if(!candidate||found.score>candidate.score)candidate=found;
    });
    file.ondata=(err,chunk,final)=>{if(err){error=err;return;}uncompressed+=chunk.length;if(uncompressed>200*1024*1024){error=new Error('Base CVM excedeu o limite da consulta. Tente novamente mais tarde.');file.terminate();return;}try{csv.write(decoder.decode(chunk,{stream:!final}),final);}catch(e){error=e as Error;}};
    file.start();
   });unzip.register(UnzipInflate);
   const reader=remote.body.getReader();
   try{while(true){const {done,value}=await reader.read();if(done){unzip.push(new Uint8Array(),true);break;}compressed+=value.length;if(compressed>32*1024*1024)throw new Error('Base CVM maior que o limite da consulta.');unzip.push(value,false);if(error)throw error;}}finally{await reader.cancel();}
   if(error)throw error;
   const result=candidate as {score:number;data:unknown}|null;
   if(!result)return response(request,{error:'CNPJ não localizado no cadastro público da CVM.'},404);
   return response(request,{data:result.data,aviso:'Revise os dados antes de salvar. Artigo da resolução, risco, meta do fundo e enquadramento RPPS não são definidos automaticamente pela CVM.'});
  }
  return response(request,{error:'Operação desconhecida.'},400);
 }catch(e){return response(request,{error:e instanceof Error?e.message:'Falha ao consultar a fonte oficial.'},400);}
});
