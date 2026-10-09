export const field = (key,label,type='text',required=false,options=null) => ({key,label,type,required,options});
const f=field, obs=f('observacao','Observação','textarea'), fund=f('fundo_id','Fundo','fund',true), month=f('mes_ano','Competência','month',true);
export const catalog = {
 instituicoes:{table:'invest_instituicoes',title:'Instituições',fields:[f('nome','Nome','text',true),f('cnpj','CNPJ'),f('tipo','Tipo'),f('contato','Contato'),obs,f('ativo','Ativa','checkbox')]},
 fundos:{table:'invest_fundos',title:'Fundos e ativos',fields:[f('nome','Nome','text',true),f('instituicao_id','Instituição','institution'),f('cnpj','CNPJ'),f('classe','Classe'),f('benchmark','Benchmark'),f('classe_cvm','Classe CVM'),f('artigo_resolucao','Artigo da resolução'),f('limite_resolucao','Limite da resolução'),f('gestor','Gestor'),f('administrador','Administrador'),f('custodiante','Custodiante'),f('meta_fundo','Meta do fundo'),f('risco','Risco'),f('ativo','Ativo','checkbox'),f('consignado','Conta dos consignados','checkbox'),obs]},
 lancamentos:{table:'invest_saldos',title:'Lançamentos',managerOnly:true,fields:[fund,month,f('saldo_inicial','Saldo inicial','number',true),f('aplicacoes','Aplicações','number'),f('resgates','Resgates','number'),f('rendimento','Rendimento','number'),f('saldo_final','Saldo final (vazio: calcular)','number'),obs]},
 indicadores:{table:'invest_indicadores_mensais',title:'Indicadores Econômicos',fields:[month,f('indicador','Indicador / benchmark','text',true),f('rentabilidade_percentual','Variação mensal (%)','number',true),f('fonte','Fonte'),obs]},
 benchmarks:{table:'invest_benchmarks',title:'Benchmarks',fields:[f('nome','Nome','text',true),f('fonte','Fonte'),f('codigo_fonte','Código SGS'),f('atualizacao_automatica','Atualização oficial disponível','checkbox'),f('ativo','Ativo','checkbox'),obs]},
 anual:{table:'invest_meta_atuarial_anual',title:'Configuração anual',managerOnly:true,fields:[f('ano','Ano','integer',true),f('indice','Índice','select',true,['IPCA']),f('taxa_real_anual','Taxa real anual (%)','number',true),obs]},
 diario:{table:'invest_diario_economico_mensal',title:'Diário Econômico',fields:[month,f('fatos_economicos','Fatos econômicos','textarea',true),f('avaliacao_gestor','Avaliação do gestor','textarea'),f('impacto_pos_fixados','Impacto: pós-fixados','textarea'),f('impacto_prefixados','Impacto: prefixados','textarea'),f('impacto_inflacao','Impacto: inflação','textarea'),f('impacto_acoes','Impacto: ações','textarea'),f('impacto_exterior','Impacto: exterior','textarea'),f('fonte_referencia','Fontes de referência'),obs]},
 documentos:{table:'invest_documentos_governanca_mensal',title:'Atas e Pareceres',fields:[month,f('tipo_documento','Tipo','select',true,['ATA','PARECER']),f('numero','Número','text',true),f('data_documento','Data','date'),f('titulo','Título'),f('descricao','Descrição','textarea'),f('link_documento','Link do documento','url')]},
 decisoes:{table:'invest_historico_decisoes_fundo',title:'Histórico de decisões por fundo',fields:[fund,f('data_decisao','Data','date',true),f('tipo_decisao','Decisão','select',true,['APLICAÇÃO','MANUTENÇÃO','RESGATE','REBALANCEAMENTO']),f('valor','Valor relacionado','number'),f('justificativa','Justificativa','textarea',true),f('numero_ata','Número da ata'),f('numero_parecer','Número do parecer'),f('responsavel','Responsável'),obs]},
 decisoesLegadas:{table:'invest_decisoes',title:'Decisões gerais',fields:[f('data_decisao','Data','date'),f('assunto','Assunto','text',true),f('classe_ativo','Classe'),f('recomendacao','Recomendação','textarea'),f('decisao','Decisão','textarea'),f('responsavel','Responsável')]},
 indicesLegados:{table:'invest_indice_atuarial_mensal',title:'Índices atuariais históricos',readonly:true,fields:[f('meta_anual_id','Configuração anual','integer'),f('mes','Mês','integer'),f('indice_percentual','Índice (%)','number'),obs]},
 metasLegadas:{table:'invest_meta_atuarial',title:'Metas mensais antigas',readonly:true,fields:[month,f('meta_percentual','Meta (%)','number'),f('ipca_percentual','IPCA (%)','number'),f('juros_percentual','Juros (%)','number'),obs]}
};
export const tabs = [
 ['painel','Painel'],['carteira','Carteira'],['instituicoes','Instituições'],['fundos','Fundos e ativos'],['lancamentos','Lançamentos'],
 ['desempenho','Desempenho e risco'],['meta','Meta Atuarial'],['indicadores','Indicadores Econômicos'],['benchmarks','Benchmarks'],
 ['radar','Radar do Comitê'],['ranking','Ranking'],['comparador','Comparador'],['mercado','Centro de Mercado'],['diario','Diário Econômico'],
 ['documentos','Atas e Pareceres'],['decisoes','Decisões por fundo'],['deliberacoes','Participação do Comitê'],['alertas','Alertas'],['relatorios','Relatórios'],['historico','Histórico legado']
];
export function visibleTabs(canManage) {return tabs.filter(([key])=>canManage||!catalog[key]?.managerOnly);}
export function parseNumber(value) {
 const raw=String(value??'').trim(); if(!raw)return null;
 const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;
 const n=Number(normalized);if(!Number.isFinite(n))throw new Error('Informe um número válido.');return n;
}
