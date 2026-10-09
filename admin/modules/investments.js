import {supabase} from '../components/supabase-client.js';
import {catalog,visibleTabs,parseNumber} from './investments/catalog.js';
import {portfolio,monthlyReturn,monthlyTarget,targetPanel,fundHistory,fundIndicator,fundRadar,fundRanking,benchmarkName} from './investments/calculations.js';

let snapshot, data={}, tab='painel', month='', year=2026, period=12, search='';
let view, content, status;
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const decimal=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:4});
const pct=v=>v===null||v===undefined?'Pendente':`${decimal.format(v)}%`;
const brl=v=>money.format(v??0);
const rows=t=>data[t]??[];
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function button(label,action,cls='button button-secondary'){const n=el('button',label,cls);n.type='button';n.addEventListener('click',action);return n;}
function message(text,error=false){status.textContent=text;status.className=`form-status ${error?'error':''}`;}
async function rpc(name,args={}){const {data:value,error}=await supabase.rpc(name,args);if(error)throw error;return value;}
async function run(action){try{await action();}catch(e){console.error(e);message(e.message||'Não foi possível concluir a operação.',true);}}
async function load(){
 snapshot=await rpc('investments_snapshot');data=snapshot.tables??{};
 const dateParts=new Intl.DateTimeFormat('en',{timeZone:'America/Cuiaba',year:'numeric',month:'2-digit'}).formatToParts(new Date());
 const currentMonth=`${dateParts.find(p=>p.type==='year').value}-${dateParts.find(p=>p.type==='month').value}`;
 if(!month)month=rows('invest_saldos').map(r=>r.mes_ano).sort().at(-1)||currentMonth;
 year=Number(month.slice(0,4));
 renderShell();render();message('Dados carregados.');
}
function table(headers,values){
 const wrapper=el('div',undefined,'investments-table-wrap'),t=el('table',undefined,'investments-table'),head=el('thead'),tr=el('tr');
 headers.forEach(h=>tr.append(el('th',h)));head.append(tr);t.append(head);const body=el('tbody');
 for(const row of values){const r=el('tr');row.forEach(value=>{const c=el('td');if(value instanceof Node)c.append(value);else c.textContent=value??'—';r.append(c);});body.append(r);}
 if(!values.length){const r=el('tr'),c=el('td','Nenhum registro para os filtros selecionados.');c.colSpan=headers.length;r.append(c);body.append(r);}
 t.append(body);wrapper.append(t);return wrapper;
}
function card(label,value){const c=el('article',undefined,'investment-kpi');c.append(el('span',label),el('strong',value));return c;}
function kpis(items){const group=el('div',undefined,'investment-kpis');items.forEach(([k,v])=>group.append(card(k,v)));return group;}
function section(title,text){const s=el('section',undefined,'investment-section');s.append(el('h2',title));if(text)s.append(el('p',text));content.append(s);return s;}
function fundName(id){return rows('invest_fundos').find(f=>f.id===id)?.nome??'Fundo não encontrado';}
function filterMonth(values){return values.filter(r=>!month||!r.mes_ano||r.mes_ano===month);}
function formatField(field,value){
 if(field.type==='fund')return fundName(value);
 if(field.type==='institution')return rows('invest_instituicoes').find(r=>r.id===value)?.nome??'—';
 if(field.type==='checkbox')return value?'Sim':'Não';
 if(field.type==='number')return value===null||value===undefined?'—':decimal.format(value);
 return value??'—';
}
function safeLink(value){try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol))return el('span','Link inválido');const a=el('a','Abrir documento');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';return a;}catch{return el('span','—');}}
function renderShell(){
 view.replaceChildren();view.append(el('p','Investimentos','eyebrow'),el('h1','Carteira e governança'));
 view.append(el('p',snapshot.can_manage?'Perfil do gestor: consultas, cadastros e deliberações.':'Perfil do Comitê: consultas, recomendações, comentários e minutas. Cadastros financeiros são mantidos pelo gestor.','page-description'));
 const tools=el('div',undefined,'investment-toolbar'),m=el('input'),ml=el('label','Competência');m.type='month';m.value=month;ml.append(m);m.addEventListener('change',()=>{month=m.value;if(month)year=Number(month.slice(0,4));render();});
 const p=el('select'),pl=el('label','Período de análise');[3,6,12,24].forEach(v=>p.add(new Option(`${v} meses`,String(v))));p.value=String(period);p.addEventListener('change',()=>{period=Number(p.value);render();});pl.append(p);
 tools.append(ml,pl,button('Atualizar',()=>run(load)));view.append(tools);
 const nav=el('nav',undefined,'investment-tabs');nav.setAttribute('aria-label','Abas de Investimentos');
 for(const [key,label] of visibleTabs(snapshot.can_manage)){const b=button(label,()=>{tab=key;search='';render();});b.dataset.tab=key;nav.append(b);}
 view.append(nav);content=el('div');view.append(content);status=el('p',undefined,'form-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');view.append(status);
}
function render(){
 content.replaceChildren();view.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false'));
 if(catalog[tab])return renderEntity(tab);
 ({painel:renderDashboard,carteira:renderPortfolio,desempenho:renderPerformance,meta:renderMeta,radar:renderPerformance,ranking:renderRanking,comparador:renderComparison,mercado:renderMarket,deliberacoes:renderParticipation,alertas:renderAlerts,relatorios:renderReports,historico:renderLegacy})[tab]?.();
}
function renderDashboard(){
 const r=portfolio(data,month),target=monthlyTarget(data,month),funds=rows('invest_saldos').filter(r=>r.mes_ano===month&&r.saldo_final>.01);
 const s=section(`Painel — ${month||'todas as competências'}`);
 s.append(kpis([['Patrimônio',brl(r.saldo_final)],['Rendimento',brl(r.rendimento)],['Rentabilidade',pct(r.rentabilidade)],['Meta do mês',pct(target?.meta_percentual)],['Aplicações brutas',brl(r.aplicacoes)],['Fundos com posição',String(funds.length)]]));
 if(target?.aviso)s.append(el('p',target.aviso,'investment-warning'));
 if(target?.meta_percentual!=null)s.append(el('p',r.rentabilidade>=target.meta_percentual?'Meta do mês atingida.':'Rentabilidade abaixo da meta do mês.'));
 const apps=rows('invest_saldos').filter(r=>r.mes_ano===month&&r.aplicacoes>0).sort((a,b)=>b.aplicacoes-a.aplicacoes);
 s.append(el('h3','Aplicações da competência'),table(['Fundo','Valor aplicado'],apps.map(r=>[fundName(r.fundo_id),brl(r.aplicacoes)])));
 renderPortfolio();
}
function renderPortfolio(){
 const r=portfolio(data,month),s=section('Composição da carteira');
 s.append(table(['Fundo','Classe','Saldo','Participação','Rentabilidade'],rows('invest_saldos').filter(r=>r.mes_ano===month&&r.saldo_final>.01).sort((a,b)=>b.saldo_final-a.saldo_final).map(r=>{
  const f=rows('invest_fundos').find(f=>f.id===r.fundo_id);return [button(f?.nome??'Fundo',()=>showFund(f)),f?.classe,brl(r.saldo_final),pct(r.saldo_final/(portfolio(data,month).saldo_final||1)*100),pct(monthlyReturn(r))];
 })));
}
function renderEntity(key,parent=null){
 const cfg=catalog[key];if(cfg.managerOnly&&!snapshot.can_manage)return;
 const s=parent??section(cfg.title),controls=el('div',undefined,'investment-toolbar');
 if(snapshot.can_manage&&!cfg.readonly)controls.append(button('Novo registro',()=>editRecord(key), 'button button-primary'));
 const input=el('input');input.type='search';input.placeholder='Buscar registros';input.setAttribute('aria-label','Buscar registros');input.value=search;
 input.addEventListener('input',()=>{search=input.value;draw();});controls.append(input);s.append(controls);
 if(key==='indicadores'){
  s.append(el('p','Cadastre o IPCA uma única vez aqui. A Meta Atuarial usa automaticamente este valor, preservando a taxa real anual e os índices históricos.'));
  if(snapshot.can_manage)s.append(button('Buscar IPCA e Selic oficiais',()=>run(updateOfficial)));
 }
 if(key==='diario'&&snapshot.can_manage)s.append(button('Preparar minuta com os dados do mês',()=>prepareDiary()));
 if(key==='fundos'&&snapshot.can_manage)s.append(button('Consultar cadastro CVM',()=>cvmForm()));
 const holder=el('div');s.append(holder);
 const fields=cfg.fields.slice(0,key==='fundos'?5:4);
 function draw(){
  const list=filterMonth(rows(cfg.table)).filter(r=>JSON.stringify(r).toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).sort((a,b)=>(b.mes_ano??'').localeCompare(a.mes_ano??'')||a.id-b.id);
  holder.replaceChildren(table([...fields.map(f=>f.label),'Ações'],list.map(row=>{
   const actions=el('div',undefined,'investment-actions');actions.append(button('Ver',()=>detailRecord(key,row)));
   if(snapshot.can_manage&&!cfg.readonly){actions.append(button('Editar',()=>editRecord(key,row)),button('Excluir',()=>deleteRecord(key,row),'button button-danger'));}
   return [...fields.map(f=>formatField(f,row[f.key])),actions];
  })));
 }
 draw();
}
function dialog(title){
 const d=el('dialog',undefined,'investment-dialog');d.setAttribute('aria-label',title);d.append(el('h2',title));document.body.append(d);
 d.addEventListener('close',()=>d.remove());d.addEventListener('click',e=>{if(e.target===d)d.close();});return d;
}
function detailRecord(key,row){
 const cfg=catalog[key],d=dialog(cfg.title),dl=el('dl');
 cfg.fields.forEach(f=>{dl.append(el('dt',f.label));const v=el('dd');v.append(f.type==='url'?safeLink(row[f.key]):el('span',formatField(f,row[f.key])));dl.append(v);});
 dl.append(el('dt','Criado em'),el('dd',row.criado_em),el('dt','Última alteração'),el('dd',row.atualizado_em));d.append(dl,button('Fechar',()=>d.close()));d.showModal();
}
function editRecord(key,row=null,defaults={}){
 if(!snapshot.can_manage)return;
 const cfg=catalog[key],d=dialog(`${row?'Editar':'Novo'} — ${cfg.title}`),form=el('form',undefined,'investment-form'),values=row??defaults;
 for(const f of cfg.fields){
  const label=el('label',f.label);let input;
  if(['select','fund','institution'].includes(f.type)){
   input=el('select');input.add(new Option('Selecione',''));
   const options=f.options??rows(f.type==='fund'?'invest_fundos':'invest_instituicoes').map(r=>({id:r.id,nome:r.nome}));
   options.forEach(o=>input.add(new Option(typeof o==='string'?o:o.nome,typeof o==='string'?o:String(o.id))));
  }else if(f.type==='textarea')input=el('textarea');else{input=el('input');input.type=['month','date','url','checkbox'].includes(f.type)?f.type:'text';if(['number','integer'].includes(f.type))input.inputMode='decimal';}
  input.name=f.key;input.required=f.required;
  if(f.type==='checkbox')input.checked=values[f.key]??(f.key==='ativo');else input.value=values[f.key]??(f.key==='mes_ano'?month:f.key==='ano'?year:f.key==='indice'?'IPCA':'');
  label.append(input);form.append(label);
 }
 const err=el('p',undefined,'form-status error');err.setAttribute('role','alert');
 const save=el('button','Salvar','button button-primary');save.type='submit';form.append(err,save,button('Cancelar',()=>d.close()));d.append(form);
 form.addEventListener('submit',async e=>{
  e.preventDefault();save.disabled=true;try{
   const payload={};for(const f of cfg.fields){const input=form.elements.namedItem(f.key);let v=input.value.trim();
    if(f.type==='checkbox')v=input.checked;else if(['number','integer','fund','institution'].includes(f.type))v=parseNumber(v);
    else if(!v&&!f.required)v=null;payload[f.key]=v;
   }
   if(key==='lancamentos'&&payload.saldo_final===null)payload.saldo_final=(payload.saldo_inicial??0)+(payload.aplicacoes??0)-(payload.resgates??0)+(payload.rendimento??0);
   if(key==='indicadores')payload.indicador=benchmarkName(payload.indicador);
   await rpc('investments_save',{p_table:cfg.table,p_data:payload,p_id:row?.id??null,p_version:row?.version??null});d.close();await load();message('Registro salvo.');
  }catch(error){err.textContent=error.message;}finally{save.disabled=false;}
 });d.showModal();
}
function deleteRecord(key,row){
 const d=dialog('Excluir registro'),form=el('form'),label=el('label','Justificativa'),reason=el('textarea');reason.required=true;reason.minLength=5;label.append(reason);form.append(el('p','A exclusão ficará registrada na auditoria. Registros de competências fechadas e índices legados são protegidos.'),label);
 const err=el('p',undefined,'form-status error'),save=el('button','Confirmar exclusão','button button-danger');save.type='submit';form.append(err,save,button('Cancelar',()=>d.close()));d.append(form);
 form.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;try{await rpc('investments_delete',{p_table:catalog[key].table,p_id:row.id,p_version:row.version,p_reason:reason.value});d.close();await load();}catch(error){err.textContent=error.message;}finally{save.disabled=false;}});d.showModal();
}
function renderMeta(){
 const s=section(`Meta Atuarial — ${year}`,'IPCA automático de Indicadores Econômicos. O histórico legado é preservado e divergências exigem conferência. Acumulados compõem as competências disponíveis, como no painel local; lacunas permanecem pendentes.');
 const y=el('input');y.type='number';y.value=String(year);y.min='1900';y.max='2200';y.setAttribute('aria-label','Exercício');y.addEventListener('change',()=>{year=Number(y.value);render();});s.append(y);
 const p=targetPanel(data,year);
 if(snapshot.can_manage){s.append(button(p?'Editar taxa anual':'Configurar taxa anual',()=>editRecord('anual',p?.meta??null,{ano:year,indice:'IPCA',taxa_real_anual:year===2026?5.63:null})));}
 if(!p){s.append(el('p','Meta anual não configurada.'));return;}
 s.append(kpis([['Taxa real anual',pct(p.meta.taxa_real_anual)],['Taxa real mensal equivalente',pct(p.taxa_real_mensal)],['Meta acumulada',pct(p.ultima?.meta_acumulada)],['Carteira acumulada',pct(p.ultima?.carteira_acumulada)]]));
 s.append(table(['Competência','IPCA','Origem / aviso','Meta mensal','IPCA acum.','Meta acum.','Carteira mês','Carteira acum.','Fechamento'],p.linhas.map(r=>[
  r.mes_ano,pct(r.indice_mes),r.aviso??r.origem??'Pendente em Indicadores',pct(r.meta_mes),pct(r.indice_acumulado),pct(r.meta_acumulada),pct(r.carteira_mes),pct(r.carteira_acumulada),
  snapshot.can_manage?button(r.fechada?'Reabrir':'Fechar mês',()=>closeMonth(r.mes_ano,!!r.fechada)):r.fechada?'Fechado':'Aberto'
 ])));
}
function closeMonth(comp,reopen){
 const d=dialog(reopen?'Reabrir competência':'Fechar competência'),form=el('form');form.append(el('p',reopen?'A reabertura exige justificativa e ficará registrada.':'O fechamento preserva os valores atuais e bloqueia alterações financeiras e na taxa anual.'));
 const reason=el('textarea');reason.required=reopen;reason.minLength=reopen?5:0;reason.setAttribute('aria-label','Justificativa');if(reopen)form.append(reason);
 const err=el('p',undefined,'form-status error'),save=el('button','Confirmar','button button-primary');save.type='submit';form.append(err,save,button('Cancelar',()=>d.close()));d.append(form);
 form.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;try{await rpc('investments_close_month',{p_mes:comp,p_reopen:reopen,p_reason:reopen?reason.value:null});d.close();await load();}catch(error){err.textContent=error.message;}finally{save.disabled=false;}});d.showModal();
}
function renderPerformance(){
 const s=section(tab==='radar'?'Radar do Comitê':'Desempenho e risco','Os parâmetros por classe e a volatilidade amostral seguem o painel local. O indicador considera o histórico completo; a análise por período está no detalhe do fundo.');
 const funds=rows('invest_fundos').filter(f=>!month?f.ativo:rows('invest_saldos').some(r=>r.fundo_id===f.id&&r.mes_ano===month&&r.saldo_final>.01));
 s.append(table(['Fundo','Rentabilidade mês','Benchmark mês','Diferença (p.p.)','Volatilidade 12m','Situação / motivos'],funds.map(f=>{
  const i=fundIndicator(data,f,month);return [button(f.nome,()=>showFund(f)),pct(i.rentabilidade_mes),pct(i.benchmark_mes),i.diferenca_benchmark===null?'Pendente':decimal.format(i.diferenca_benchmark),pct(i.volatilidade_12m),`${i.nivel}: ${i.motivos.join(' ')}`];
 })));
}
function historyTable(h){return table(['Competência','Rentabilidade','Benchmark','Meta atuarial','Dif. benchmark (p.p.)','Saldo final'],h.linhas.map(r=>[r.mes_ano,pct(r.rentabilidade),pct(r.benchmark),pct(r.meta_atuarial),r.diferenca_benchmark===null?'Pendente':decimal.format(r.diferenca_benchmark),brl(r.saldo_final)]));}
function showFund(f){
 if(!f)return;const d=dialog(f.nome),h=fundHistory(data,f,period),i=fundIndicator(data,f),r=fundRadar(f,h,i);
 d.append(kpis([['Retorno acumulado',pct(h.retorno_acumulado)],['Benchmark acumulado',pct(h.benchmark_acumulado)],['Meta acumulada',pct(h.meta_acumulada)],['Volatilidade do período',pct(h.volatilidade)]]),el('p',`Período: ${h.total_meses} observações. Ausências do benchmark e da meta não são tratadas como zero.`));
 d.append(historyTable(h),el('h3',`Radar — nota ${decimal.format(r.nota)}`),table(['Eixo','Valor','Situação','Descrição'],r.eixos.map(e=>[e.nome,e.valor,e.situacao,e.descricao])));
 d.append(el('h3','Decisões'),table(['Data','Tipo','Justificativa','Responsável'],rows('invest_historico_decisoes_fundo').filter(r=>r.fundo_id===f.id).map(r=>[r.data_decisao,r.tipo_decisao,r.justificativa,r.responsavel])));
 d.append(button('Imprimir / salvar PDF',()=>window.print()),button('Fechar',()=>d.close()));d.showModal();
}
function renderRanking(){const s=section('Ranking dos fundos','Pontuação, consistência, diferença para benchmark/meta e penalidade de volatilidade preservam os critérios do painel local.');
 const include=el('input');include.type='checkbox';const label=el('label','Incluir fundos encerrados');label.append(include);s.append(label);const holder=el('div');s.append(holder);
 const draw=()=>holder.replaceChildren(table(['Posição','Fundo','Nota','Retorno acumulado','Dif. benchmark (p.p.)','Volatilidade'],fundRanking(data,period,include.checked).map(r=>[r.posicao,button(r.fundo.nome,()=>showFund(r.fundo)),decimal.format(r.score),pct(r.historico.retorno_acumulado),r.diferenca_benchmark===null?'Pendente':decimal.format(r.diferenca_benchmark),pct(r.historico.volatilidade)])));include.addEventListener('change',draw);draw();}
function renderComparison(){const s=section('Comparador de fundos'),controls=el('div',undefined,'investment-toolbar'),holder=el('div'),selects=[];
 for(let n=0;n<2;n++){const label=el('label',`Fundo ${n+1}`),select=el('select');rows('invest_fundos').forEach(f=>select.add(new Option(f.nome,String(f.id))));select.selectedIndex=Math.min(n,select.options.length-1);label.append(select);controls.append(label);selects.push(select);}
 const draw=()=>{const funds=selects.map(s=>rows('invest_fundos').find(f=>f.id===Number(s.value))).filter(Boolean),hs=funds.map(f=>fundHistory(data,f,period));holder.replaceChildren(table(['Indicador',...funds.map(f=>f.nome)],[['Retorno acumulado',...hs.map(h=>pct(h.retorno_acumulado))],['Benchmark acumulado',...hs.map(h=>pct(h.benchmark_acumulado))],['Meta acumulada',...hs.map(h=>pct(h.meta_acumulada))],['Volatilidade',...hs.map(h=>pct(h.volatilidade))],['Meses acima do benchmark',...hs.map(h=>h.meses_acima_benchmark)]]));};selects.forEach(s=>s.addEventListener('change',draw));s.append(controls,holder);draw();}
function renderMarket(){const s=section('Centro de Mercado');s.append(table(['Competência','Indicador','Variação','Fonte'],filterMonth(rows('invest_indicadores_mensais')).map(r=>[r.mes_ano,r.indicador,pct(r.rentabilidade_percentual),r.fonte])));renderEntity('diario');}
function prepareDiary(){
 const r=portfolio(data,month),m=monthlyTarget(data,month),inds=filterMonth(rows('invest_indicadores_mensais'));
 const fatos=[`Competência ${month}.`,...inds.map(i=>`${i.indicador}: ${pct(i.rentabilidade_percentual)} (fonte: ${i.fonte||'não informada'}).`),`Carteira: rendimento ${brl(r.rendimento)}; rentabilidade ${pct(r.rentabilidade)}.`,`Meta atuarial: ${pct(m?.meta_percentual)}.`].join('\n');
 editRecord('diario',null,{mes_ano:month,fatos_economicos:fatos,fonte_referencia:inds.map(i=>i.fonte).filter(Boolean).join('; ')});
}
function renderParticipation(){
 const s=section('Participação do Comitê','Recomendações, comentários e minutas têm autoria e data registradas. A deliberação final é publicada pelo gestor. Os registros permanecem no histórico.');
 if(snapshot.can_participate)s.append(button('Registrar participação',()=>participationForm()));
 s.append(table(['Competência','Tipo','Assunto','Fundo','Autor','Data','Conteúdo'],filterMonth(rows('invest_deliberacoes')).sort((a,b)=>b.id-a.id).map(r=>[r.mes_ano,r.tipo,r.assunto,r.fundo_id?fundName(r.fundo_id):'Geral',r.autor_nome,r.criado_em,el('p',r.texto)])));
}
function participationForm(){
 const d=dialog('Registrar participação'),form=el('form',undefined,'investment-form');
 const fields=[['mes','Competência','month'],['fundo','Fundo (opcional)','fund'],['tipo','Tipo','select'],['assunto','Assunto','text'],['texto','Conteúdo','textarea']];
 for(const [key,label,type]of fields){const l=el('label',label);let input;
  if(type==='fund'||type==='select'){input=el('select');if(type==='fund'){input.add(new Option('Geral',''));rows('invest_fundos').forEach(f=>input.add(new Option(f.nome,String(f.id))));}else{const options=['recomendacao','comentario','minuta',...(snapshot.can_manage?['deliberacao']:[])];options.forEach(o=>input.add(new Option(o,o)));}}
  else if(type==='textarea')input=el('textarea');else{input=el('input');input.type=type;}
  input.name=key;input.required=key!=='fundo';if(key==='mes')input.value=month;if(key==='assunto')input.maxLength=200;if(key==='texto')input.maxLength=20000;l.append(input);form.append(l);
 }
 const err=el('p',undefined,'form-status error'),save=el('button','Registrar','button button-primary');save.type='submit';form.append(err,save,button('Cancelar',()=>d.close()));d.append(form);
 form.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;try{const f=new FormData(form);await rpc('investments_participate',{p_mes:f.get('mes'),p_fundo:f.get('fundo')?Number(f.get('fundo')):null,p_tipo:f.get('tipo'),p_assunto:f.get('assunto'),p_texto:f.get('texto')});d.close();await load();}catch(error){err.textContent=error.message;}finally{save.disabled=false;}});d.showModal();
}
function renderAlerts(){const s=section('Alertas e conferências'),alerts=[];
 for(const annual of rows('invest_meta_atuarial_anual'))for(const l of targetPanel(data,annual.ano).linhas)if(l.aviso)alerts.push([l.mes_ano,'IPCA histórico',l.aviso]);
 const target=monthlyTarget(data,month);if(!target)alerts.push([month,'Meta anual','Meta anual não configurada.']);else if(target.meta_percentual===null)alerts.push([month,'IPCA pendente','Cadastre o IPCA em Indicadores Econômicos.']);
 for(const r of rows('invest_saldos')){const expected=(r.saldo_inicial??0)+(r.aplicacoes??0)-(r.resgates??0)+(r.rendimento??0);if(Math.abs(expected-(r.saldo_final??0))>.02)alerts.push([r.mes_ano,'Saldo divergente',`${fundName(r.fundo_id)}: cálculo ${brl(expected)}, informado ${brl(r.saldo_final)}.`]);if(r.saldo_final<0)alerts.push([r.mes_ano,'Saldo negativo',fundName(r.fundo_id)]);}
 for(const f of rows('invest_fundos').filter(f=>f.ativo)){const missing=['cnpj','classe','benchmark','gestor','administrador','artigo_resolucao'].filter(k=>!f[k]);if(missing.length)alerts.push([month,'Cadastro incompleto',`${f.nome}: ${missing.join(', ')}.`]);if(!rows('invest_saldos').some(r=>r.fundo_id===f.id&&r.mes_ano===month))alerts.push([month,'Lançamento pendente',f.nome]);const i=fundIndicator(data,f,month);if(['amarelo','vermelho'].includes(i.cor))alerts.push([month,i.nivel,`${f.nome}: ${i.motivos.join(' ')}`]);}
 s.append(table(['Competência','Alerta','Descrição'],alerts));}
function download(name,text,type){const a=el('a');const u=URL.createObjectURL(new Blob([text],{type}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function renderReports(){const s=section('Relatórios e exportações','Relatórios respeitam as permissões do usuário. Para gerar PDF, abra o relatório e escolha Imprimir / salvar PDF.');
 s.append(button('Relatório mensal',()=>{content.replaceChildren();renderDashboard();renderMeta();renderPerformance();renderEntity('diario');renderEntity('documentos');renderParticipation();content.append(button('Imprimir / salvar PDF',()=>window.print()));}));
 s.append(button('Exportar carteira CSV',()=>{const lines=[['Competência','Fundo','Saldo inicial','Aplicações','Resgates','Rendimento','Saldo final','Rentabilidade (%)'],...rows('invest_saldos').filter(r=>!month||r.mes_ano===month).map(r=>[r.mes_ano,fundName(r.fundo_id),r.saldo_inicial,r.aplicacoes,r.resgates,r.rendimento,r.saldo_final,monthlyReturn(r)])];const csv=lines.map(row=>row.map(v=>`"${(typeof v==='number'?String(v):String(v??'').replace(/^[=+@-]/,"'$&")).replaceAll('"','""')}"`).join(';')).join('\r\n');download(`carteira-${month}.csv`,'\uFEFF'+csv,'text/csv;charset=utf-8');}));
 if(snapshot.can_manage){s.append(button('Exportar cópia dos dados',()=>download('investimentos-backup.json',JSON.stringify({format:'sigprevi-investments-backup-v1',exported_at:new Date().toISOString(),tables:data},null,2),'application/json')));const input=el('input');input.type='file';input.accept='.json,application/json';input.setAttribute('aria-label','Importação inicial do painel local');input.addEventListener('change',()=>run(()=>previewImport(input.files[0])));s.append(el('h3','Importação inicial do painel local'),el('p','Use o arquivo gerado pelo exportador em leitura somente. A importação exige destino vazio e é executada uma única vez, sem sobrescrever cadastros.'),input);}
}
async function previewImport(file){
 if(!file)return;if(file.size>20*1024*1024)throw new Error('Arquivo maior que 20 MB.');const payload=JSON.parse(await file.text());if(payload.format!=='sigprevi-investments-v1')throw new Error('Formato de importação inválido.');
 const d=dialog('Conferir importação inicial');d.append(el('p','Confira as contagens antes de confirmar. Os dados atuais do destino não serão sobrescritos.'),table(['Tabela','Registros'],Object.entries(payload.tables??{}).map(([k,v])=>[k,Array.isArray(v)?v.length:'Inválido'])));
 const err=el('p',undefined,'form-status error'),confirm=button('Confirmar importação',async()=>{confirm.disabled=true;try{const result=await rpc('investments_import',{p_payload:payload});d.close();await load();message(`Importação concluída. Identificação: ${result.fingerprint}`);}catch(error){err.textContent=error.message;confirm.disabled=false;}},'button button-primary');d.append(err,confirm,button('Cancelar',()=>d.close()));d.showModal();
}
async function updateOfficial(){
 if(!month)throw new Error('Selecione uma competência.');message('Consultando IPCA e Selic oficiais...');
 const {data:result,error}=await supabase.functions.invoke('investments-market-data',{body:{action:'indicators',month}});if(error)throw error;
 await load();message([...(result.saved??[]),...(result.errors??[])].join(' ')||'Nenhum índice publicado para esta competência.',!!result.errors?.length);
}
function cvmForm(){
 const d=dialog('Consultar fundo na CVM'),form=el('form'),label=el('label','CNPJ do fundo ou classe'),input=el('input');input.required=true;input.inputMode='numeric';input.maxLength=20;label.append(input);
 const err=el('p',undefined,'form-status error'),save=el('button','Consultar','button button-primary');save.type='submit';form.append(label,err,save,button('Cancelar',()=>d.close()));d.append(form);
 form.addEventListener('submit',async e=>{e.preventDefault();save.disabled=true;err.textContent='Consultando o cadastro oficial...';try{
  const {data:result,error}=await supabase.functions.invoke('investments-market-data',{body:{action:'cvm',cnpj:input.value}});
  if(error||result?.error)throw error??new Error(result.error);d.close();editRecord('fundos',null,result.data);message(result.aviso);
 }catch(error){err.textContent=error.message;}finally{save.disabled=false;}});d.showModal();
}
function renderLegacy(){renderEntity('indicesLegados');renderEntity('metasLegadas');renderEntity('decisoesLegadas');}
export async function initializeInvestmentsModule(){
 document.querySelector('#dashboard-view').hidden=true;view=document.querySelector('#module-view');view.hidden=false;view.replaceChildren(el('p','Carregando Investimentos...'));await load();
}
