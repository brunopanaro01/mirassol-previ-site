BEGIN;

-- =============================================================================
-- REGISTRO CENTRAL DE AUDITORIA
-- =============================================================================
-- Registra ações relevantes realizadas por usuários, serviços, integrações
-- e rotinas internas do SIGPREVI.
--
-- Esta tabela não utiliza updated_at, pois registros de auditoria devem ser
-- tratados como eventos históricos imutáveis.
-- =============================================================================

CREATE TABLE app.audit_logs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    occurred_at timestamptz NOT NULL DEFAULT now(),

    actor_user_id uuid,

    module_id smallint,

    action text NOT NULL,

    entity_schema text,

    entity_table text,

    entity_id text,

    source text NOT NULL DEFAULT 'system',

    success boolean NOT NULL DEFAULT true,

    reason text,

    old_data jsonb,

    new_data jsonb,

    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    correlation_id uuid,

    ip_address inet,

    user_agent text,

    CONSTRAINT fk_audit_logs_actor_user
        FOREIGN KEY (actor_user_id)
        REFERENCES app.users(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_audit_logs_module
        FOREIGN KEY (module_id)
        REFERENCES app.modules(id)
        ON DELETE SET NULL,

    CONSTRAINT ck_audit_logs_action_not_empty
        CHECK (length(trim(action)) > 0),

    CONSTRAINT ck_audit_logs_entity_schema_not_empty
        CHECK (
            entity_schema IS NULL
            OR length(trim(entity_schema)) > 0
        ),

    CONSTRAINT ck_audit_logs_entity_table_not_empty
        CHECK (
            entity_table IS NULL
            OR length(trim(entity_table)) > 0
        ),

    CONSTRAINT ck_audit_logs_source
        CHECK (
            source IN (
                'user',
                'system',
                'api',
                'integration',
                'automation',
                'intelligence_center'
            )
        ),

    CONSTRAINT ck_audit_logs_old_data_object
        CHECK (
            old_data IS NULL
            OR jsonb_typeof(old_data) = 'object'
        ),

    CONSTRAINT ck_audit_logs_new_data_object
        CHECK (
            new_data IS NULL
            OR jsonb_typeof(new_data) = 'object'
        ),

    CONSTRAINT ck_audit_logs_metadata_object
        CHECK (jsonb_typeof(metadata) = 'object')
);

-- =============================================================================
-- DOCUMENTAÇÃO
-- =============================================================================

COMMENT ON TABLE app.audit_logs IS
'Registro central e imutável das ações relevantes realizadas no SIGPREVI.';

COMMENT ON COLUMN app.audit_logs.id IS
'Identificador sequencial do registro de auditoria.';

COMMENT ON COLUMN app.audit_logs.occurred_at IS
'Data e hora em que o evento auditado ocorreu.';

COMMENT ON COLUMN app.audit_logs.actor_user_id IS
'Usuário responsável pela ação, quando identificado.';

COMMENT ON COLUMN app.audit_logs.module_id IS
'Módulo do SIGPREVI relacionado ao evento.';

COMMENT ON COLUMN app.audit_logs.action IS
'Ação realizada, como login, create, update, delete, export ou publish.';

COMMENT ON COLUMN app.audit_logs.entity_schema IS
'Schema do banco de dados da entidade afetada.';

COMMENT ON COLUMN app.audit_logs.entity_table IS
'Tabela ou tipo de entidade afetada pela ação.';

COMMENT ON COLUMN app.audit_logs.entity_id IS
'Identificador do registro ou recurso afetado.';

COMMENT ON COLUMN app.audit_logs.source IS
'Origem da ação: usuário, sistema, API, integração, automação ou Centro de Inteligência.';

COMMENT ON COLUMN app.audit_logs.success IS
'Indica se a ação foi concluída com sucesso.';

COMMENT ON COLUMN app.audit_logs.reason IS
'Justificativa, resultado, mensagem de erro ou motivo relacionado à ação.';

COMMENT ON COLUMN app.audit_logs.old_data IS
'Estado anterior dos dados afetados, quando aplicável.';

COMMENT ON COLUMN app.audit_logs.new_data IS
'Novo estado dos dados afetados, quando aplicável.';

COMMENT ON COLUMN app.audit_logs.metadata IS
'Informações adicionais estruturadas sobre o evento.';

COMMENT ON COLUMN app.audit_logs.correlation_id IS
'Identificador usado para relacionar vários eventos da mesma operação ou requisição.';

COMMENT ON COLUMN app.audit_logs.ip_address IS
'Endereço IP de origem da operação, quando disponível.';

COMMENT ON COLUMN app.audit_logs.user_agent IS
'Identificação do navegador, cliente ou serviço responsável pela requisição.';

-- =============================================================================
-- ÍNDICES
-- =============================================================================

CREATE INDEX idx_audit_logs_occurred_at
    ON app.audit_logs (occurred_at DESC);

CREATE INDEX idx_audit_logs_actor_user_id
    ON app.audit_logs (actor_user_id, occurred_at DESC);

CREATE INDEX idx_audit_logs_module_id
    ON app.audit_logs (module_id, occurred_at DESC);

CREATE INDEX idx_audit_logs_action
    ON app.audit_logs (action, occurred_at DESC);

CREATE INDEX idx_audit_logs_source
    ON app.audit_logs (source, occurred_at DESC);

CREATE INDEX idx_audit_logs_success
    ON app.audit_logs (success, occurred_at DESC)
    WHERE success = false;

CREATE INDEX idx_audit_logs_entity
    ON app.audit_logs (
        entity_schema,
        entity_table,
        entity_id,
        occurred_at DESC
    );

CREATE INDEX idx_audit_logs_correlation_id
    ON app.audit_logs (correlation_id)
    WHERE correlation_id IS NOT NULL;

-- Índice para pesquisas em informações adicionais estruturadas.
CREATE INDEX idx_audit_logs_metadata_gin
    ON app.audit_logs
    USING gin (metadata);

-- =============================================================================
-- PROTEÇÃO CONTRA ALTERAÇÃO E EXCLUSÃO
-- =============================================================================

CREATE OR REPLACE FUNCTION app.prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
BEGIN
    -- Permite operações administrativas executadas durante migrations.
    IF session_user IN ('postgres', 'supabase_admin') THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;

        RETURN NEW;
    END IF;

    RAISE EXCEPTION
        'Registros de auditoria não podem ser alterados ou excluídos.'
        USING ERRCODE = '42501';
END;
$$;

COMMENT ON FUNCTION app.prevent_audit_log_mutation() IS
'Impede a alteração ou exclusão de registros históricos de auditoria.';

CREATE TRIGGER trg_prevent_audit_logs_update
BEFORE UPDATE ON app.audit_logs
FOR EACH ROW
EXECUTE FUNCTION app.prevent_audit_log_mutation();

CREATE TRIGGER trg_prevent_audit_logs_delete
BEFORE DELETE ON app.audit_logs
FOR EACH ROW
EXECUTE FUNCTION app.prevent_audit_log_mutation();

COMMIT;