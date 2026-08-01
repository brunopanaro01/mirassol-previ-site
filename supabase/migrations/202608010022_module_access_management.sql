BEGIN;

-- =============================================================================
-- GESTÃO GERAL DE ACESSOS AOS MÓDULOS
-- =============================================================================
-- O usuário é cadastrado uma única vez.
-- O administrador concede ou revoga papéis de módulos conforme necessário.
-- Papéis globais, especialmente administrator, não podem ser concedidos
-- por estas RPCs.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PAPEL: GESTOR DE LEGISLAÇÃO
-- -----------------------------------------------------------------------------

INSERT INTO app.roles (
    name,
    description,
    scope,
    module_id,
    is_system
)
SELECT
    'legislation_manager',
    'Gestor do módulo de legislação, autorizado a consultar, cadastrar, editar, publicar e excluir rascunhos.',
    'module',
    module_record.id,
    true
FROM app.modules AS module_record
WHERE module_record.code = 'legislation'
ON CONFLICT (name)
DO UPDATE SET
    description = EXCLUDED.description,
    scope = EXCLUDED.scope,
    module_id = EXCLUDED.module_id,
    is_system = EXCLUDED.is_system,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- PERMISSÕES DO GESTOR DE LEGISLAÇÃO
-- -----------------------------------------------------------------------------

INSERT INTO app.role_permissions (
    role_id,
    permission_id
)
SELECT
    role_record.id,
    permission_record.id
FROM app.roles AS role_record
JOIN app.permissions AS permission_record
  ON permission_record.code IN (
      'legislation.documents.read',
      'legislation.documents.create',
      'legislation.documents.update',
      'legislation.documents.delete',
      'legislation.documents.publish'
  )
WHERE role_record.name = 'legislation_manager'
ON CONFLICT (role_id, permission_id)
DO NOTHING;

-- -----------------------------------------------------------------------------
-- FUNÇÃO INTERNA: EXIGIR ADMINISTRADOR
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.require_access_administrator()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION
            'É necessário estar autenticado.'
            USING ERRCODE = '42501';
    END IF;

    IF NOT app.is_admin() THEN
        RAISE EXCEPTION
            'Somente administradores podem gerenciar acessos.'
            USING ERRCODE = '42501';
    END IF;
END;
$$;

COMMENT ON FUNCTION app.require_access_administrator() IS
'Interrompe a operação quando o usuário autenticado não é administrador global.';

REVOKE ALL
ON FUNCTION app.require_access_administrator()
FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- RPC: LISTAR USUÁRIOS E SEUS PAPÉIS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.access_admin_list_users()
RETURNS TABLE (
    user_id uuid,
    email text,
    full_name text,
    registration text,
    account_status text,
    created_at timestamptz,
    roles jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
BEGIN
    PERFORM app.require_access_administrator();

    RETURN QUERY
    SELECT
        app_user.id,
        auth_user.email::text,
        app_user.full_name,
        app_user.registration,
        app_user.status::text,
        app_user.created_at,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'name', role_record.name,
                    'description', role_record.description,
                    'scope', role_record.scope,
                    'module_code', module_record.code,
                    'module_name', module_record.name
                )
                ORDER BY
                    module_record.name,
                    role_record.name
            ) FILTER (
                WHERE role_record.id IS NOT NULL
            ),
            '[]'::jsonb
        ) AS roles
    FROM app.users AS app_user
    JOIN auth.users AS auth_user
      ON auth_user.id = app_user.id
    LEFT JOIN app.user_roles AS user_role
      ON user_role.user_id = app_user.id
    LEFT JOIN app.roles AS role_record
      ON role_record.id = user_role.role_id
    LEFT JOIN app.modules AS module_record
      ON module_record.id = role_record.module_id
    GROUP BY
        app_user.id,
        auth_user.email,
        app_user.full_name,
        app_user.registration,
        app_user.status,
        app_user.created_at
    ORDER BY
        app_user.full_name,
        auth_user.email;
END;
$$;

REVOKE ALL
ON FUNCTION public.access_admin_list_users()
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.access_admin_list_users()
TO authenticated;

-- =============================================================================
-- RPC: LISTAR PAPÉIS DISPONÍVEIS POR MÓDULO
-- =============================================================================

CREATE OR REPLACE FUNCTION public.access_admin_list_module_roles()
RETURNS TABLE (
    role_name text,
    role_description text,
    module_code text,
    module_name text,
    permission_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
BEGIN
    PERFORM app.require_access_administrator();

    RETURN QUERY
    SELECT
        role_record.name,
        role_record.description,
        module_record.code,
        module_record.name,
        count(role_permission.permission_id)::integer
    FROM app.roles AS role_record
    JOIN app.modules AS module_record
      ON module_record.id = role_record.module_id
    LEFT JOIN app.role_permissions AS role_permission
      ON role_permission.role_id = role_record.id
    WHERE role_record.scope = 'module'
    GROUP BY
        role_record.id,
        role_record.name,
        role_record.description,
        module_record.code,
        module_record.name
    ORDER BY
        module_record.name,
        role_record.name;
END;
$$;

REVOKE ALL
ON FUNCTION public.access_admin_list_module_roles()
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.access_admin_list_module_roles()
TO authenticated;

-- =============================================================================
-- RPC: CONCEDER PAPEL DE MÓDULO
-- =============================================================================

CREATE OR REPLACE FUNCTION public.access_admin_grant_module_role(
    p_user_id uuid,
    p_role_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
DECLARE
    v_role app.roles%ROWTYPE;
    v_affected integer;
BEGIN
    PERFORM app.require_access_administrator();

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION
            'O usuário deve ser informado.';
    END IF;

    IF p_role_name IS NULL
       OR length(trim(p_role_name)) = 0 THEN
        RAISE EXCEPTION
            'O papel deve ser informado.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM app.users AS app_user
        WHERE app_user.id = p_user_id
    ) THEN
        RAISE EXCEPTION
            'O usuário informado não foi encontrado.'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT role_record.*
    INTO v_role
    FROM app.roles AS role_record
    WHERE role_record.name = trim(p_role_name)
      AND role_record.scope = 'module'
      AND role_record.module_id IS NOT NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'O papel de módulo informado não foi encontrado.'
            USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO app.user_roles (
        user_id,
        role_id,
        assigned_by
    )
    VALUES (
        p_user_id,
        v_role.id,
        auth.uid()
    )
    ON CONFLICT (user_id, role_id)
    DO NOTHING;

    GET DIAGNOSTICS v_affected = ROW_COUNT;

    IF v_affected = 0 THEN
        RETURN jsonb_build_object(
            'status', 'already_assigned',
            'user_id', p_user_id,
            'role_name', v_role.name
        );
    END IF;

    INSERT INTO app.audit_logs (
        actor_user_id,
        module_id,
        action,
        entity_schema,
        entity_table,
        entity_id,
        source,
        success,
        new_data,
        metadata
    )
    VALUES (
        auth.uid(),
        v_role.module_id,
        'grant_role',
        'app',
        'user_roles',
        p_user_id::text,
        'api',
        true,
        jsonb_build_object(
            'user_id', p_user_id,
            'role_id', v_role.id,
            'role_name', v_role.name
        ),
        jsonb_build_object(
            'operation', 'module_access_grant'
        )
    );

    RETURN jsonb_build_object(
        'status', 'assigned',
        'user_id', p_user_id,
        'role_name', v_role.name
    );
END;
$$;

REVOKE ALL
ON FUNCTION public.access_admin_grant_module_role(uuid, text)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.access_admin_grant_module_role(uuid, text)
TO authenticated;

-- =============================================================================
-- RPC: REVOGAR PAPEL DE MÓDULO
-- =============================================================================

CREATE OR REPLACE FUNCTION public.access_admin_revoke_module_role(
    p_user_id uuid,
    p_role_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
DECLARE
    v_role app.roles%ROWTYPE;
    v_affected integer;
BEGIN
    PERFORM app.require_access_administrator();

    IF p_user_id IS NULL THEN
        RAISE EXCEPTION
            'O usuário deve ser informado.';
    END IF;

    IF p_role_name IS NULL
       OR length(trim(p_role_name)) = 0 THEN
        RAISE EXCEPTION
            'O papel deve ser informado.';
    END IF;

    SELECT role_record.*
    INTO v_role
    FROM app.roles AS role_record
    WHERE role_record.name = trim(p_role_name)
      AND role_record.scope = 'module'
      AND role_record.module_id IS NOT NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'O papel de módulo informado não foi encontrado.'
            USING ERRCODE = 'P0002';
    END IF;

    DELETE FROM app.user_roles AS user_role
    WHERE user_role.user_id = p_user_id
      AND user_role.role_id = v_role.id;

    GET DIAGNOSTICS v_affected = ROW_COUNT;

    IF v_affected = 0 THEN
        RETURN jsonb_build_object(
            'status', 'not_assigned',
            'user_id', p_user_id,
            'role_name', v_role.name
        );
    END IF;

    INSERT INTO app.audit_logs (
        actor_user_id,
        module_id,
        action,
        entity_schema,
        entity_table,
        entity_id,
        source,
        success,
        old_data,
        metadata
    )
    VALUES (
        auth.uid(),
        v_role.module_id,
        'revoke_role',
        'app',
        'user_roles',
        p_user_id::text,
        'api',
        true,
        jsonb_build_object(
            'user_id', p_user_id,
            'role_id', v_role.id,
            'role_name', v_role.name
        ),
        jsonb_build_object(
            'operation', 'module_access_revoke'
        )
    );

    RETURN jsonb_build_object(
        'status', 'revoked',
        'user_id', p_user_id,
        'role_name', v_role.name
    );
END;
$$;

REVOKE ALL
ON FUNCTION public.access_admin_revoke_module_role(uuid, text)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.access_admin_revoke_module_role(uuid, text)
TO authenticated;

-- =============================================================================
-- VALIDAÇÃO DA CONFIGURAÇÃO
-- =============================================================================

DO $$
DECLARE
    v_permission_count integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM app.roles AS role_record
        JOIN app.modules AS module_record
          ON module_record.id = role_record.module_id
        WHERE role_record.name = 'legislation_manager'
          AND role_record.scope = 'module'
          AND module_record.code = 'legislation'
    ) THEN
        RAISE EXCEPTION
            'O papel legislation_manager não foi configurado corretamente.';
    END IF;

    SELECT count(*)
    INTO v_permission_count
    FROM app.role_permissions AS role_permission
    JOIN app.roles AS role_record
      ON role_record.id = role_permission.role_id
    JOIN app.permissions AS permission_record
      ON permission_record.id = role_permission.permission_id
    WHERE role_record.name = 'legislation_manager'
      AND permission_record.code IN (
          'legislation.documents.read',
          'legislation.documents.create',
          'legislation.documents.update',
          'legislation.documents.delete',
          'legislation.documents.publish'
      );

    IF v_permission_count <> 5 THEN
        RAISE EXCEPTION
            'O papel legislation_manager deve possuir 5 permissões; encontradas %.',
            v_permission_count;
    END IF;
END;
$$;

COMMIT;