BEGIN;

-- =============================================================================
-- BOOTSTRAP DO PRIMEIRO ADMINISTRADOR
-- =============================================================================
-- Permite atribuir o papel global "administrator" ao primeiro usuário do
-- SIGPREVI de forma controlada.
--
-- Regras:
-- 1. O usuário precisa existir em auth.users e app.users.
-- 2. O papel administrator precisa existir e ser global.
-- 3. O bootstrap só funciona enquanto nenhum administrador estiver cadastrado.
-- 4. A função não ficará acessível aos papéis anon ou authenticated.
-- 5. A execução deve ocorrer pelo SQL Editor, ambiente administrativo ou
--    backend seguro utilizando service_role.
-- =============================================================================

CREATE OR REPLACE FUNCTION app.bootstrap_first_administrator(
    p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, app
AS $$
DECLARE
    v_administrator_role_id uuid;
    v_existing_administrator_count integer;
    v_inserted_rows integer;
    v_assignment_created boolean := false;
BEGIN

    -- Evita duas execuções simultâneas do bootstrap.
    PERFORM pg_advisory_xact_lock(
        hashtext('app.bootstrap_first_administrator')
    );

    -- -------------------------------------------------------------------------
    -- VALIDAÇÃO DO IDENTIFICADOR
    -- -------------------------------------------------------------------------

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION
            'O identificador do usuário deve ser informado.';
    END IF;

    -- -------------------------------------------------------------------------
    -- VALIDAÇÃO EM AUTH.USERS
    -- -------------------------------------------------------------------------

    IF NOT EXISTS (
        SELECT 1
        FROM auth.users AS auth_user
        WHERE auth_user.id = p_user_id
    ) THEN
        RAISE EXCEPTION
            'O usuário informado não existe em auth.users.';
    END IF;

    -- -------------------------------------------------------------------------
    -- VALIDAÇÃO DO PERFIL DA APLICAÇÃO
    -- -------------------------------------------------------------------------

    IF NOT EXISTS (
        SELECT 1
        FROM app.users AS application_user
        WHERE application_user.id = p_user_id
    ) THEN
        RAISE EXCEPTION
            'O perfil do usuário não existe em app.users. Verifique o trigger de criação automática.';
    END IF;

    -- -------------------------------------------------------------------------
    -- LOCALIZAÇÃO DO PAPEL ADMINISTRADOR
    -- -------------------------------------------------------------------------

    SELECT role_record.id
    INTO v_administrator_role_id
    FROM app.roles AS role_record
    WHERE role_record.name = 'administrator'
      AND role_record.scope = 'global'
      AND role_record.module_id IS NULL
    LIMIT 1;

    IF v_administrator_role_id IS NULL THEN
        RAISE EXCEPTION
            'O papel global administrator não foi encontrado.';
    END IF;

    -- -------------------------------------------------------------------------
    -- VERIFICAÇÃO DE BOOTSTRAP ANTERIOR
    -- -------------------------------------------------------------------------

    SELECT count(*)
    INTO v_existing_administrator_count
    FROM app.user_roles AS user_role
    JOIN app.roles AS role_record
      ON role_record.id = user_role.role_id
    WHERE role_record.name = 'administrator'
      AND role_record.scope = 'global';

    IF v_existing_administrator_count > 0 THEN
        RAISE EXCEPTION
            'O bootstrap foi bloqueado porque já existe um administrador cadastrado.';
    END IF;

    -- -------------------------------------------------------------------------
    -- ATRIBUIÇÃO DO PRIMEIRO ADMINISTRADOR
    -- -------------------------------------------------------------------------

    INSERT INTO app.user_roles (
        user_id,
        role_id
    )
    VALUES (
        p_user_id,
        v_administrator_role_id
    )
    ON CONFLICT (user_id, role_id)
    DO NOTHING;

    GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;

    v_assignment_created := v_inserted_rows = 1;


    IF NOT v_assignment_created THEN
        RAISE EXCEPTION
            'Não foi possível atribuir o papel administrator ao usuário.';
    END IF;

    -- -------------------------------------------------------------------------
    -- REGISTRO DE AUDITORIA
    -- -------------------------------------------------------------------------

    INSERT INTO app.audit_logs (
        occurred_at,
        actor_user_id,
        module_id,
        action,
        entity_schema,
        entity_table,
        entity_id,
        source,
        success,
        reason,
        old_data,
        new_data,
        metadata,
        correlation_id
    )
    SELECT
        now(),
        NULL,
        module_record.id,
        'core.administrator.bootstrap',
        'app',
        'user_roles',
        p_user_id::text,
        'system',
        true,
        'Primeiro administrador do SIGPREVI atribuído por procedimento de bootstrap.',
        NULL,
        jsonb_build_object(
            'user_id', p_user_id,
            'role_id', v_administrator_role_id,
            'role', 'administrator'
        ),
        jsonb_build_object(
            'bootstrap', true,
            'executed_by_database_role', current_user
        ),
        gen_random_uuid()
    FROM app.modules AS module_record
    WHERE module_record.code = 'core';

    -- -------------------------------------------------------------------------
    -- VALIDAÇÃO FINAL
    -- -------------------------------------------------------------------------

    IF NOT EXISTS (
        SELECT 1
        FROM app.user_roles AS user_role
        JOIN app.roles AS role_record
          ON role_record.id = user_role.role_id
        WHERE user_role.user_id = p_user_id
          AND role_record.name = 'administrator'
          AND role_record.scope = 'global'
    ) THEN
        RAISE EXCEPTION
            'A validação final da atribuição do administrador falhou.';
    END IF;
END;
$$;

COMMENT ON FUNCTION app.bootstrap_first_administrator(uuid) IS
'Atribui o papel global administrator ao primeiro usuário do SIGPREVI. A função é bloqueada após a existência do primeiro administrador.';

-- =============================================================================
-- RESTRIÇÃO DE EXECUÇÃO
-- =============================================================================

REVOKE ALL
ON FUNCTION app.bootstrap_first_administrator(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION app.bootstrap_first_administrator(uuid)
FROM anon;

REVOKE ALL
ON FUNCTION app.bootstrap_first_administrator(uuid)
FROM authenticated;

GRANT EXECUTE
ON FUNCTION app.bootstrap_first_administrator(uuid)
TO service_role;

COMMIT;