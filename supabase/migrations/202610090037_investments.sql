-- Native SIGPREVI Investments. Models and formulas originate in the local director panel.
BEGIN;

CREATE TABLE app.invest_benchmarks (
	id SERIAL NOT NULL, 
	nome VARCHAR(100) NOT NULL, 
	fonte VARCHAR(150), 
	codigo_fonte VARCHAR(50), 
	atualizacao_automatica BOOLEAN DEFAULT false NOT NULL, 
	ativo BOOLEAN DEFAULT true NOT NULL, 
	observacao TEXT, 
	criado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'UTC'), 
	atualizado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'UTC'), 
	version integer NOT NULL DEFAULT 1,
	PRIMARY KEY (id)
)

;

CREATE TABLE app.invest_decisoes (
	id SERIAL NOT NULL, 
	data_decisao DATE, 
	assunto VARCHAR(200) NOT NULL, 
	classe_ativo VARCHAR(100), 
	recomendacao TEXT, 
	decisao TEXT, 
	responsavel VARCHAR(150), 
	criado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'UTC'), 
	atualizado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'UTC'), 
	version integer NOT NULL DEFAULT 1,
	PRIMARY KEY (id)
)

;

CREATE TABLE app.invest_diario_economico_mensal (
	id SERIAL NOT NULL, 
	mes_ano VARCHAR(7) NOT NULL, 
	fatos_economicos TEXT NOT NULL, 
	avaliacao_gestor TEXT, 
	impacto_pos_fixados TEXT, 
	impacto_prefixados TEXT, 
	impacto_inflacao TEXT, 
	impacto_acoes TEXT, 
	impacto_exterior TEXT, 
	fonte_referencia VARCHAR(250), 
	observacao TEXT, 
	criado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'UTC'), 
	atualizado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'UTC'), 
	version integer NOT NULL DEFAULT 1,
	PRIMARY KEY (id)
)

;

CREATE TABLE app.invest_documentos_governanca_mensal (
	id SERIAL NOT NULL, 
	mes_ano VARCHAR(7) NOT NULL, 
	tipo_documento VARCHAR(30) NOT NULL, 
	numero VARCHAR(100) NOT NULL, 
	data_documento DATE, 
	titulo VARCHAR(200), 
	descricao TEXT, 
	link_documento VARCHAR(500), 
	criado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'UTC'), 
	atualizado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'UTC'), 
	version integer NOT NULL DEFAULT 1,
	PRIMARY KEY (id)
)

;

CREATE TABLE app.invest_indicadores_mensais (
	id SERIAL NOT NULL, 
	mes_ano VARCHAR(7) NOT NULL, 
	indicador VARCHAR(80) NOT NULL, 
	rentabilidade_percentual DOUBLE PRECISION DEFAULT 0 NOT NULL, 
	fonte VARCHAR(150), 
	observacao TEXT, 
	criado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'UTC'), 
	atualizado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'UTC'), 
	version integer NOT NULL DEFAULT 1,
	PRIMARY KEY (id), 
	CONSTRAINT uq_indicador_mes UNIQUE (mes_ano, indicador)
)

;

CREATE TABLE app.invest_instituicoes (
	id SERIAL NOT NULL, 
	nome VARCHAR(150) NOT NULL, 
	cnpj VARCHAR(20), 
	tipo VARCHAR(80), 
	contato VARCHAR(150), 
	observacao TEXT, 
	ativo BOOLEAN DEFAULT true NOT NULL, 
	criado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'UTC'), 
	atualizado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'UTC'), 
	version integer NOT NULL DEFAULT 1,
	PRIMARY KEY (id)
)

;

CREATE TABLE app.invest_meta_atuarial (
	id SERIAL NOT NULL, 
	mes_ano VARCHAR(7) NOT NULL, 
	meta_percentual DOUBLE PRECISION DEFAULT 0, 
	ipca_percentual DOUBLE PRECISION DEFAULT 0, 
	juros_percentual DOUBLE PRECISION DEFAULT 0, 
	observacao TEXT, 
	criado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'UTC'), 
	atualizado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'UTC'), 
	version integer NOT NULL DEFAULT 1,
	PRIMARY KEY (id)
)

;

CREATE TABLE app.invest_meta_atuarial_anual (
	id SERIAL NOT NULL, 
	ano INTEGER NOT NULL, 
	indice VARCHAR(50) DEFAULT 'IPCA' NOT NULL, 
	taxa_real_anual DOUBLE PRECISION DEFAULT 0 NOT NULL, 
	observacao TEXT, 
	criado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'UTC'), 
	atualizado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'UTC'), 
	version integer NOT NULL DEFAULT 1,
	PRIMARY KEY (id)
)

;

CREATE TABLE app.invest_fundos (
	id SERIAL NOT NULL, 
	instituicao_id INTEGER, 
	nome VARCHAR(200) NOT NULL, 
	cnpj VARCHAR(20), 
	classe VARCHAR(100), 
	benchmark VARCHAR(100), 
	limite_resolucao VARCHAR(100), 
	classe_cvm VARCHAR(120), 
	artigo_resolucao VARCHAR(120), 
	gestor VARCHAR(150), 
	administrador VARCHAR(150), 
	custodiante VARCHAR(150), 
	meta_fundo VARCHAR(120), 
	risco VARCHAR(50), 
	observacao TEXT, 
	ativo BOOLEAN DEFAULT true NOT NULL, 
	consignado BOOLEAN DEFAULT false NOT NULL, 
	status_carteira VARCHAR(30) DEFAULT 'ATIVO' NOT NULL, 
	encerrado_em VARCHAR(7), 
	criado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'UTC'), 
	atualizado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'UTC'), 
	version integer NOT NULL DEFAULT 1,
	PRIMARY KEY (id), 
	FOREIGN KEY(instituicao_id) REFERENCES app.invest_instituicoes (id)
)

;

CREATE TABLE app.invest_indice_atuarial_mensal (
	id SERIAL NOT NULL, 
	meta_anual_id INTEGER NOT NULL, 
	mes INTEGER NOT NULL, 
	indice_percentual DOUBLE PRECISION DEFAULT 0 NOT NULL, 
	observacao TEXT, 
	criado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'UTC'), 
	atualizado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'UTC'), 
	version integer NOT NULL DEFAULT 1,
	PRIMARY KEY (id), 
	CONSTRAINT uq_meta_anual_mes UNIQUE (meta_anual_id, mes), 
	FOREIGN KEY(meta_anual_id) REFERENCES app.invest_meta_atuarial_anual (id)
)

;

CREATE TABLE app.invest_historico_decisoes_fundo (
	id SERIAL NOT NULL, 
	fundo_id INTEGER NOT NULL, 
	data_decisao DATE NOT NULL, 
	tipo_decisao VARCHAR(40) NOT NULL, 
	valor DOUBLE PRECISION DEFAULT 0, 
	justificativa TEXT NOT NULL, 
	numero_ata VARCHAR(100), 
	numero_parecer VARCHAR(100), 
	responsavel VARCHAR(150), 
	observacao TEXT, 
	criado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'UTC'), 
	atualizado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'UTC'), 
	version integer NOT NULL DEFAULT 1,
	PRIMARY KEY (id), 
	FOREIGN KEY(fundo_id) REFERENCES app.invest_fundos (id)
)

;

CREATE TABLE app.invest_saldos (
	id SERIAL NOT NULL, 
	fundo_id INTEGER NOT NULL, 
	mes_ano VARCHAR(7) NOT NULL, 
	saldo_inicial DOUBLE PRECISION DEFAULT 0, 
	aplicacoes DOUBLE PRECISION DEFAULT 0, 
	resgates DOUBLE PRECISION DEFAULT 0, 
	rendimento DOUBLE PRECISION DEFAULT 0, 
	saldo_final DOUBLE PRECISION DEFAULT 0, 
	observacao TEXT, 
	criado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'UTC'), 
	atualizado_em TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() AT TIME ZONE 'UTC'), 
	version integer NOT NULL DEFAULT 1,
	PRIMARY KEY (id), 
	CONSTRAINT uq_invest_saldo_fundo_mes UNIQUE (fundo_id, mes_ano), 
	FOREIGN KEY(fundo_id) REFERENCES app.invest_fundos (id)
)

;
ALTER TABLE app.invest_benchmarks ADD UNIQUE(nome);
ALTER TABLE app.invest_instituicoes ADD UNIQUE(nome);
ALTER TABLE app.invest_diario_economico_mensal ADD UNIQUE(mes_ano);
ALTER TABLE app.invest_meta_atuarial ADD UNIQUE(mes_ano);
ALTER TABLE app.invest_meta_atuarial_anual ADD UNIQUE(ano);
ALTER TABLE app.invest_meta_atuarial_anual ADD CHECK(taxa_real_anual > -100 AND taxa_real_anual < 10000);
ALTER TABLE app.invest_documentos_governanca_mensal ADD CHECK(tipo_documento IN ('ATA','PARECER'));
ALTER TABLE app.invest_documentos_governanca_mensal ADD CHECK(link_documento IS NULL OR link_documento='' OR link_documento ~ '^https?://');
ALTER TABLE app.invest_indice_atuarial_mensal ADD CHECK(mes BETWEEN 1 AND 12);
ALTER TABLE app.invest_saldos ADD CHECK(mes_ano ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE app.invest_indicadores_mensais ADD CHECK(mes_ano ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE app.invest_diario_economico_mensal ADD CHECK(mes_ano ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE app.invest_documentos_governanca_mensal ADD CHECK(mes_ano ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE app.invest_meta_atuarial ADD CHECK(mes_ano ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
-- Appended to the model-derived DDL by the build script. All writes go through RPCs.
CREATE TABLE app.invest_deliberacoes (
 id bigserial PRIMARY KEY, mes_ano varchar(7) NOT NULL,
 fundo_id integer REFERENCES app.invest_fundos(id) ON DELETE RESTRICT,
 tipo text NOT NULL CHECK (tipo IN ('recomendacao','comentario','minuta','deliberacao')),
 assunto text NOT NULL CHECK (length(trim(assunto)) BETWEEN 1 AND 200),
 texto text NOT NULL CHECK (length(trim(texto)) BETWEEN 1 AND 20000),
 autor_id uuid NOT NULL REFERENCES app.users(id), autor_nome text NOT NULL,
 criado_em timestamptz NOT NULL DEFAULT now(),
 CHECK (mes_ano ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
CREATE TABLE app.invest_competencias_fechadas (
 mes_ano varchar(7) PRIMARY KEY, snapshot jsonb NOT NULL,
 fechado_por uuid NOT NULL REFERENCES app.users(id), fechado_em timestamptz NOT NULL DEFAULT now(),
 CHECK (mes_ano ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
CREATE TABLE app.invest_importacoes (
 id bigserial PRIMARY KEY, fingerprint text NOT NULL UNIQUE,
 autor_id uuid NOT NULL REFERENCES app.users(id), criado_em timestamptz NOT NULL DEFAULT now(), contagens jsonb NOT NULL
);

INSERT INTO app.permissions(code,name,description,module_id)
SELECT 'investments.'||v.code,v.name,v.name,m.id FROM app.modules m CROSS JOIN
 (VALUES ('read','Consultar investimentos'),('manage','Gerenciar investimentos'),('participate','Registrar recomendações do Comitê')) v(code,name)
WHERE m.code='investments' ON CONFLICT(code) DO NOTHING;
INSERT INTO app.roles(name,description,scope,module_id,is_system)
SELECT v.name,v.description,'module',m.id,true FROM app.modules m CROSS JOIN
 (VALUES ('investments_manager','Gestor de Investimentos: acesso completo e publicação das deliberações.'),
 ('investments_committee','Comitê de Investimentos: consulta e registro de recomendações e minutas.')) v(name,description)
WHERE m.code='investments' ON CONFLICT(name) DO NOTHING;
INSERT INTO app.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM app.roles r CROSS JOIN app.permissions p
WHERE (r.name IN ('administrator','investments_manager') AND p.code IN ('investments.read','investments.manage','investments.participate'))
 OR (r.name='investments_committee' AND p.code IN ('investments.read','investments.participate'))
ON CONFLICT DO NOTHING;

CREATE FUNCTION app.require_investments(p_permission text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,auth AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM app.users WHERE id=auth.uid() AND status='active')
 OR NOT EXISTS(SELECT 1 FROM app.modules WHERE code='investments' AND is_active)
 OR NOT (app.is_admin() OR app.has_permission(p_permission)) THEN
  RAISE EXCEPTION 'Acesso a Investimentos não autorizado.' USING ERRCODE='42501';
 END IF;
END $$;
REVOKE ALL ON FUNCTION app.require_investments(text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION app.investments_tables() RETURNS text[] LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$ SELECT ARRAY[
 'invest_benchmarks','invest_decisoes','invest_diario_economico_mensal','invest_documentos_governanca_mensal',
 'invest_indicadores_mensais','invest_instituicoes','invest_meta_atuarial','invest_meta_atuarial_anual',
 'invest_fundos','invest_indice_atuarial_mensal','invest_historico_decisoes_fundo','invest_saldos']::text[] $$;
REVOKE ALL ON FUNCTION app.investments_tables() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.investments_snapshot() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,auth AS $$
DECLARE result jsonb := '{}'::jsonb; tab text; rows jsonb;
BEGIN
 PERFORM app.require_investments('investments.read');
 FOREACH tab IN ARRAY app.investments_tables()||ARRAY['invest_deliberacoes','invest_competencias_fechadas'] LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) FROM app.%I t',tab) INTO rows;
  result:=result||jsonb_build_object(tab,rows);
 END LOOP;
 RETURN jsonb_build_object('tables',result,'user_id',auth.uid(),'can_manage',app.is_admin() OR app.has_permission('investments.manage'),
 'can_participate',app.is_admin() OR app.has_permission('investments.participate'));
END $$;
REVOKE ALL ON FUNCTION public.investments_snapshot() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.investments_snapshot() TO authenticated;

CREATE FUNCTION app.investments_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,auth AS $$
BEGIN
 INSERT INTO app.audit_logs(actor_user_id,module_id,action,entity_schema,entity_table,entity_id,source,old_data,new_data)
 VALUES(auth.uid(),(SELECT id FROM app.modules WHERE code='investments'),lower(TG_OP),'app',TG_TABLE_NAME,
 coalesce(to_jsonb(NEW)->>'id',to_jsonb(OLD)->>'id',to_jsonb(NEW)->>'mes_ano',to_jsonb(OLD)->>'mes_ano'),'api',
 CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END,CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END);
 RETURN coalesce(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION app.investments_audit() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION app.investments_check_open(p_table text,p_row jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE comp text:=p_row->>'mes_ano';
BEGIN
 IF comp IS NULL AND p_row ? 'data_decisao' THEN comp:=left(p_row->>'data_decisao',7); END IF;
 IF EXISTS(SELECT 1 FROM app.invest_competencias_fechadas WHERE mes_ano=comp)
 OR (p_table='invest_meta_atuarial_anual' AND EXISTS(SELECT 1 FROM app.invest_competencias_fechadas WHERE left(mes_ano,4)=p_row->>'ano')) THEN
  RAISE EXCEPTION 'Competência fechada: reabertura justificada é necessária.' USING ERRCODE='23514';
 END IF;
END $$;
REVOKE ALL ON FUNCTION app.investments_check_open(text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.investments_save(p_table text,p_data jsonb,p_id integer DEFAULT NULL,p_version integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,auth AS $$
DECLARE oldrow jsonb; result jsonb; columns_sql text; values_sql text; updates_sql text; key text;
BEGIN
 PERFORM app.require_investments('investments.manage');
 -- Serialize edits/closing/import so a closed month cannot race a save.
 PERFORM pg_advisory_xact_lock(7037109);
 IF NOT p_table=ANY(app.investments_tables()) OR p_table IN ('invest_meta_atuarial','invest_indice_atuarial_mensal') THEN
  RAISE EXCEPTION 'Cadastro não editável. Índice histórico preservado.' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR p_data='{}'::jsonb THEN RAISE EXCEPTION 'Dados inválidos.'; END IF;
 FOR key IN SELECT jsonb_object_keys(p_data) LOOP
  IF key IN ('id','version','criado_em','atualizado_em') OR NOT EXISTS(
   SELECT 1 FROM information_schema.columns WHERE table_schema='app' AND table_name=p_table AND column_name=key
  ) THEN RAISE EXCEPTION 'Campo não permitido: %',key; END IF;
 END LOOP;
 IF p_id IS NOT NULL THEN
  EXECUTE format('SELECT to_jsonb(t) FROM app.%I t WHERE id=$1 FOR UPDATE',p_table) INTO oldrow USING p_id;
  IF oldrow IS NULL THEN RAISE EXCEPTION 'Registro não encontrado.' USING ERRCODE='P0002'; END IF;
  IF p_version IS DISTINCT FROM (oldrow->>'version')::integer THEN
   RAISE EXCEPTION 'Registro alterado por outro usuário. Recarregue antes de salvar.' USING ERRCODE='40001';
  END IF;
  PERFORM app.investments_check_open(p_table,oldrow);
 END IF;
 PERFORM app.investments_check_open(p_table,coalesce(oldrow,'{}'::jsonb)||p_data);
 IF p_table='invest_saldos' AND (p_data->>'saldo_final') IS NULL THEN
  result:=coalesce(oldrow,'{}'::jsonb)||p_data;
  p_data:=p_data||jsonb_build_object('saldo_final',coalesce((result->>'saldo_inicial')::double precision,0)+coalesce((result->>'aplicacoes')::double precision,0)-coalesce((result->>'resgates')::double precision,0)+coalesce((result->>'rendimento')::double precision,0));
 END IF;
 SELECT string_agg(format('%I',k),','),string_agg(format('r.%I',k),','),string_agg(format('%I=r.%I',k,k),',')
 INTO columns_sql,values_sql,updates_sql FROM jsonb_object_keys(p_data) k;
 IF p_id IS NULL THEN
  EXECUTE format('INSERT INTO app.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::app.%I,$1) r RETURNING to_jsonb(%I.*)',
   p_table,columns_sql,values_sql,p_table,p_table) INTO result USING p_data;
 ELSE
  EXECUTE format('UPDATE app.%I t SET %s, version=t.version+1, atualizado_em=now() AT TIME ZONE ''UTC'' FROM jsonb_populate_record(NULL::app.%I,$1) r WHERE t.id=$2 RETURNING to_jsonb(t.*)',
   p_table,updates_sql,p_table) INTO result USING p_data,p_id;
 END IF;
 IF p_table='invest_saldos' THEN
  -- Same fund status transition used by the original Python on posting/editing.
  IF (result->>'saldo_final')::double precision <= .01 AND (result->>'resgates')::double precision>0
   AND coalesce((result->>'saldo_inicial')::double precision,0)+coalesce((result->>'aplicacoes')::double precision,0)>0 THEN
   UPDATE app.invest_fundos SET ativo=false,status_carteira='ENCERRADO',encerrado_em=result->>'mes_ano',version=version+1,atualizado_em=now() AT TIME ZONE 'UTC' WHERE id=(result->>'fundo_id')::integer;
  ELSIF (result->>'saldo_final')::double precision > .01 THEN
   UPDATE app.invest_fundos SET ativo=true,status_carteira='ATIVO',encerrado_em=NULL,version=version+1,atualizado_em=now() AT TIME ZONE 'UTC' WHERE id=(result->>'fundo_id')::integer;
  END IF;
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.investments_save(text,jsonb,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.investments_save(text,jsonb,integer,integer) TO authenticated;

CREATE FUNCTION public.investments_delete(p_table text,p_id integer,p_version integer,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,auth AS $$
DECLARE oldrow jsonb;
BEGIN
 PERFORM app.require_investments('investments.manage'); PERFORM pg_advisory_xact_lock(7037109);
 IF NOT p_table=ANY(app.investments_tables()) OR p_table IN ('invest_meta_atuarial','invest_indice_atuarial_mensal') THEN
  RAISE EXCEPTION 'Cadastro não excluível. Histórico preservado.' USING ERRCODE='42501'; END IF;
 IF length(trim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Informe a justificativa da exclusão.'; END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM app.%I t WHERE id=$1 FOR UPDATE',p_table) INTO oldrow USING p_id;
 IF oldrow IS NULL THEN RAISE EXCEPTION 'Registro não encontrado.' USING ERRCODE='P0002'; END IF;
 IF p_version IS DISTINCT FROM (oldrow->>'version')::integer THEN RAISE EXCEPTION 'Registro alterado por outro usuário.' USING ERRCODE='40001'; END IF;
 PERFORM app.investments_check_open(p_table,oldrow);
 EXECUTE format('DELETE FROM app.%I WHERE id=$1',p_table) USING p_id;
 INSERT INTO app.audit_logs(actor_user_id,module_id,action,entity_schema,entity_table,entity_id,source,reason)
 VALUES(auth.uid(),(SELECT id FROM app.modules WHERE code='investments'),'delete_reason','app',p_table,p_id::text,'api',p_reason);
END $$;
REVOKE ALL ON FUNCTION public.investments_delete(text,integer,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.investments_delete(text,integer,integer,text) TO authenticated;

CREATE FUNCTION public.investments_participate(p_mes text,p_fundo integer,p_tipo text,p_assunto text,p_texto text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,auth AS $$
DECLARE result bigint;
BEGIN
 PERFORM app.require_investments('investments.participate');
 IF p_tipo='deliberacao' THEN PERFORM app.require_investments('investments.manage'); END IF;
 INSERT INTO app.invest_deliberacoes(mes_ano,fundo_id,tipo,assunto,texto,autor_id,autor_nome)
 VALUES(p_mes,p_fundo,p_tipo,p_assunto,p_texto,auth.uid(),(SELECT full_name FROM app.users WHERE id=auth.uid())) RETURNING id INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.investments_participate(text,integer,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.investments_participate(text,integer,text,text,text) TO authenticated;

CREATE FUNCTION public.investments_close_month(p_mes text,p_reopen boolean DEFAULT false,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,auth AS $$
DECLARE result jsonb; annual app.invest_meta_atuarial_anual; ipca double precision; origem text;
BEGIN
 PERFORM app.require_investments('investments.manage'); PERFORM pg_advisory_xact_lock(7037109);
 IF p_mes IS NULL OR p_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Competência inválida.'; END IF;
 IF p_reopen THEN
  IF length(trim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'Justifique a reabertura.'; END IF;
  DELETE FROM app.invest_competencias_fechadas WHERE mes_ano=p_mes;
  INSERT INTO app.audit_logs(actor_user_id,module_id,action,entity_schema,entity_table,entity_id,source,reason)
  VALUES(auth.uid(),(SELECT id FROM app.modules WHERE code='investments'),'reopen','app','invest_competencias_fechadas',p_mes,'api',p_reason);
  RETURN jsonb_build_object('reopened',p_mes);
 END IF;
 SELECT * INTO annual FROM app.invest_meta_atuarial_anual WHERE ano=left(p_mes,4)::integer;
 IF annual.id IS NULL THEN RAISE EXCEPTION 'Configure a meta anual antes de fechar.'; END IF;
 SELECT indice_percentual INTO ipca FROM app.invest_indice_atuarial_mensal WHERE meta_anual_id=annual.id AND mes=right(p_mes,2)::integer;
 origem:='Histórico preservado';
 IF ipca IS NULL THEN
  SELECT rentabilidade_percentual INTO ipca FROM app.invest_indicadores_mensais WHERE mes_ano=p_mes AND indicador=annual.indice;
  origem:='Indicadores Econômicos';
 END IF;
 IF ipca IS NULL THEN RAISE EXCEPTION 'IPCA ausente; fechamento não permitido.'; END IF;
 result:=jsonb_build_object('ipca_percentual',ipca,'taxa_real_anual',annual.taxa_real_anual,'indice',annual.indice,'origem',origem,
  'meta_percentual',((1+ipca/100)*power(1+annual.taxa_real_anual/100,1.0/12)-1)*100);
 INSERT INTO app.invest_competencias_fechadas(mes_ano,snapshot,fechado_por) VALUES(p_mes,result,auth.uid());
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.investments_close_month(text,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.investments_close_month(text,boolean,text) TO authenticated;

CREATE FUNCTION public.investments_import(p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,auth AS $$
DECLARE tab text; n bigint; rowdata jsonb; counts jsonb:='{}'; cols text; vals text; fp text;
BEGIN
 PERFORM app.require_investments('investments.manage'); PERFORM pg_advisory_xact_lock(7037109);
 IF p_payload->>'format'<>'sigprevi-investments-v1' OR jsonb_typeof(p_payload->'tables')<>'object'
 OR p_payload->>'format' IS NULL THEN RAISE EXCEPTION 'Formato de importação inválido.'; END IF;
 IF EXISTS(SELECT 1 FROM app.invest_importacoes) THEN RAISE EXCEPTION 'Importação inicial já realizada. Não é permitido sobrepor dados.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload->'tables') k WHERE NOT k=ANY(app.investments_tables())) THEN
  RAISE EXCEPTION 'A importação contém tabela fora do módulo Investimentos.'; END IF;
 FOREACH tab IN ARRAY app.investments_tables() LOOP
  IF jsonb_typeof(p_payload->'tables'->tab) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Tabela ausente: %',tab; END IF;
  EXECUTE format('SELECT count(*) FROM app.%I',tab) INTO n;
  IF n>0 THEN RAISE EXCEPTION 'Importação exige destino vazio: % possui dados.',tab; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM app.invest_competencias_fechadas) OR EXISTS(SELECT 1 FROM app.invest_deliberacoes) THEN
  RAISE EXCEPTION 'Importação exige módulo ainda não utilizado.'; END IF;
 FOREACH tab IN ARRAY app.investments_tables() LOOP
  n:=0;
  FOR rowdata IN SELECT value FROM jsonb_array_elements(p_payload->'tables'->tab) LOOP
   IF jsonb_typeof(rowdata)<>'object' OR rowdata->>'id' IS NULL OR (rowdata->>'id')::integer<=0 THEN RAISE EXCEPTION 'Registro inválido em %',tab; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(rowdata) k WHERE k='version' OR NOT EXISTS(
    SELECT 1 FROM information_schema.columns c WHERE c.table_schema='app' AND c.table_name=tab AND c.column_name=k)) THEN
    RAISE EXCEPTION 'Campo desconhecido na importação de %. Nada foi importado.',tab; END IF;
   SELECT string_agg(format('%I',column_name),','),string_agg(format('r.%I',column_name),',') INTO cols,vals
   FROM information_schema.columns WHERE table_schema='app' AND table_name=tab AND rowdata ? column_name AND column_name<>'version';
   EXECUTE format('INSERT INTO app.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::app.%I,$1) r',tab,cols,vals,tab) USING rowdata;
   n:=n+1;
  END LOOP;
  EXECUTE format('SELECT setval(pg_get_serial_sequence(%L,''id''),coalesce(max(id),0)+1,false) FROM app.%I','app.'||tab,tab);
  counts:=counts||jsonb_build_object(tab,n);
 END LOOP;
 fp:=md5((p_payload->'tables')::text);
 INSERT INTO app.invest_importacoes(fingerprint,autor_id,contagens) VALUES(fp,auth.uid(),counts);
 RETURN jsonb_build_object('counts',counts,'fingerprint',fp);
END $$;
REVOKE ALL ON FUNCTION public.investments_import(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.investments_import(jsonb) TO authenticated;

-- Defense in depth: no browser role can write directly, even by bypassing the UI.
CREATE FUNCTION app.investments_validate_finite() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM jsonb_each_text(to_jsonb(NEW)) j
 JOIN information_schema.columns c ON c.table_schema='app' AND c.table_name=TG_TABLE_NAME AND c.column_name=j.key
 WHERE c.data_type='double precision' AND j.value IN ('NaN','Infinity','-Infinity')) THEN
  RAISE EXCEPTION 'Valores numéricos devem ser finitos.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.investments_validate_finite() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY app.investments_tables()||ARRAY['invest_deliberacoes','invest_competencias_fechadas','invest_importacoes'] LOOP
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,anon,authenticated',tab);
  EXECUTE format('CREATE TRIGGER audit_investments AFTER INSERT OR UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.investments_audit()',tab);
  EXECUTE format('CREATE TRIGGER validate_investments BEFORE INSERT OR UPDATE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.investments_validate_finite()',tab);
 END LOOP;
END $$;

COMMIT;
