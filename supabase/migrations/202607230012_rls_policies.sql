BEGIN;

-- =============================================================================
-- ROW LEVEL SECURITY — CORE DO SIGPREVI
-- =============================================================================
-- As políticas abaixo protegem as tabelas mesmo quando uma consulta é feita
-- diretamente pela API do Supabase.
--
-- Usuários do tipo service_role continuam com acesso administrativo, pois esse
-- papel ignora RLS por padrão no Supabase.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- CORREÇÃO DA FUNÇÃO DE ACESSO A MÓDULOS
-- -----------------------------------------------------------------------------
-- A versão anterior utilizava INNER JOIN com app.modules. Isso impediria que
-- papéis globais, cujo module_id é NULL, fossem reconhecidos.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.has_module_access(
    p_module_code text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM app.user_roles AS ur
        JOIN app.roles AS r
          ON r.id = ur.role_id
        LEFT JOIN app.modules AS m
          ON m.id = r.module_id
        WHERE ur.user_id = auth.uid()
          AND (
              r.scope = 'global'
              OR (
                  r.scope = 'module'
                  AND m.code = p_module_code
                  AND m.is_active = true
              )
          )
    );
$$;

COMMENT ON FUNCTION app.has_module_access(text) IS
'Verifica se o usuário autenticado possui papel global ou acesso ao módulo informado.';

GRANT EXECUTE
ON FUNCTION app.has_module_access(text)
TO authenticated;

-- =============================================================================
-- ATIVAÇÃO DO RLS
-- =============================================================================

ALTER TABLE app.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- REVOGAÇÃO DE ACESSOS PÚBLICOS
-- =============================================================================

REVOKE ALL ON SCHEMA app FROM anon;

REVOKE ALL ON TABLE app.users FROM anon;
REVOKE ALL ON TABLE app.modules FROM anon;
REVOKE ALL ON TABLE app.roles FROM anon;
REVOKE ALL ON TABLE app.user_roles FROM anon;
REVOKE ALL ON TABLE app.permissions FROM anon;
REVOKE ALL ON TABLE app.role_permissions FROM anon;
REVOKE ALL ON TABLE app.audit_logs FROM anon;

-- O usuário autenticado pode acessar o schema, mas as políticas abaixo
-- determinam quais registros ele poderá consultar ou modificar.

GRANT USAGE ON SCHEMA app TO authenticated;

-- =============================================================================
-- APP.USERS
-- =============================================================================
-- O usuário pode visualizar apenas seu próprio perfil.
-- Administradores e usuários autorizados podem consultar todos os perfis.
-- Alterações de usuários serão realizadas por administradores ou por funções
-- específicas, evitando que o próprio usuário altere status ou outros campos
-- sensíveis diretamente.
-- =============================================================================

GRANT SELECT ON TABLE app.users TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE app.users TO authenticated;

CREATE POLICY users_select_own_profile
ON app.users
FOR SELECT
TO authenticated
USING (
    id = auth.uid()
);

CREATE POLICY users_select_authorized
ON app.users
FOR SELECT
TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('core.users.read')
);

CREATE POLICY users_insert_authorized
ON app.users
FOR INSERT
TO authenticated
WITH CHECK (
    app.is_admin()
    OR app.has_permission('core.users.create')
);

CREATE POLICY users_update_authorized
ON app.users
FOR UPDATE
TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('core.users.update')
)
WITH CHECK (
    app.is_admin()
    OR app.has_permission('core.users.update')
);

CREATE POLICY users_delete_authorized
ON app.users
FOR DELETE
TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('core.users.delete')
);

-- =============================================================================
-- APP.MODULES
-- =============================================================================
-- Módulos ativos podem ser consultados por usuários autenticados.
-- Gerenciamento somente por administradores ou usuários autorizados.
-- =============================================================================

GRANT SELECT ON TABLE app.modules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE app.modules TO authenticated;

CREATE POLICY modules_select_active
ON app.modules
FOR SELECT
TO authenticated
USING (
    is_active = true
    OR app.is_admin()
    OR app.has_permission('core.modules.read')
);

CREATE POLICY modules_insert_authorized
ON app.modules
FOR INSERT
TO authenticated
WITH CHECK (
    app.is_admin()
    OR app.has_permission('core.modules.create')
);

CREATE POLICY modules_update_authorized
ON app.modules
FOR UPDATE
TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('core.modules.update')
)
WITH CHECK (
    app.is_admin()
    OR app.has_permission('core.modules.update')
);

CREATE POLICY modules_delete_authorized
ON app.modules
FOR DELETE
TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('core.modules.delete')
);

-- =============================================================================
-- APP.ROLES
-- =============================================================================

GRANT SELECT ON TABLE app.roles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE app.roles TO authenticated;

CREATE POLICY roles_select_authorized
ON app.roles
FOR SELECT
TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('core.access_control.read')
);

CREATE POLICY roles_insert_authorized
ON app.roles
FOR INSERT
TO authenticated
WITH CHECK (
    app.is_admin()
    OR app.has_permission('core.access_control.manage')
);

CREATE POLICY roles_update_authorized
ON app.roles
FOR UPDATE
TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('core.access_control.manage')
)
WITH CHECK (
    app.is_admin()
    OR app.has_permission('core.access_control.manage')
);

CREATE POLICY roles_delete_authorized
ON app.roles
FOR DELETE
TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('core.access_control.manage')
);

-- =============================================================================
-- APP.USER_ROLES
-- =============================================================================
-- O usuário pode consultar os próprios vínculos.
-- Consulta geral e manutenção exigem autorização administrativa.
-- =============================================================================

GRANT SELECT ON TABLE app.user_roles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE app.user_roles TO authenticated;

CREATE POLICY user_roles_select_own
ON app.user_roles
FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
);

CREATE POLICY user_roles_select_authorized
ON app.user_roles
FOR SELECT
TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('core.access_control.read')
);

CREATE POLICY user_roles_insert_authorized
ON app.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
    app.is_admin()
    OR app.has_permission('core.access_control.manage')
);

CREATE POLICY user_roles_update_authorized
ON app.user_roles
FOR UPDATE
TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('core.access_control.manage')
)
WITH CHECK (
    app.is_admin()
    OR app.has_permission('core.access_control.manage')
);

CREATE POLICY user_roles_delete_authorized
ON app.user_roles
FOR DELETE
TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('core.access_control.manage')
);

-- =============================================================================
-- APP.PERMISSIONS
-- =============================================================================

GRANT SELECT ON TABLE app.permissions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE app.permissions TO authenticated;

CREATE POLICY permissions_select_authorized
ON app.permissions
FOR SELECT
TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('core.access_control.read')
);

CREATE POLICY permissions_insert_authorized
ON app.permissions
FOR INSERT
TO authenticated
WITH CHECK (
    app.is_admin()
    OR app.has_permission('core.access_control.manage')
);

CREATE POLICY permissions_update_authorized
ON app.permissions
FOR UPDATE
TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('core.access_control.manage')
)
WITH CHECK (
    app.is_admin()
    OR app.has_permission('core.access_control.manage')
);

CREATE POLICY permissions_delete_authorized
ON app.permissions
FOR DELETE
TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('core.access_control.manage')
);

-- =============================================================================
-- APP.ROLE_PERMISSIONS
-- =============================================================================

GRANT SELECT ON TABLE app.role_permissions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE app.role_permissions TO authenticated;

CREATE POLICY role_permissions_select_authorized
ON app.role_permissions
FOR SELECT
TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('core.access_control.read')
);

CREATE POLICY role_permissions_insert_authorized
ON app.role_permissions
FOR INSERT
TO authenticated
WITH CHECK (
    app.is_admin()
    OR app.has_permission('core.access_control.manage')
);

CREATE POLICY role_permissions_update_authorized
ON app.role_permissions
FOR UPDATE
TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('core.access_control.manage')
)
WITH CHECK (
    app.is_admin()
    OR app.has_permission('core.access_control.manage')
);

CREATE POLICY role_permissions_delete_authorized
ON app.role_permissions
FOR DELETE
TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('core.access_control.manage')
);

-- =============================================================================
-- APP.AUDIT_LOGS
-- =============================================================================
-- Usuários autenticados não recebem INSERT, UPDATE ou DELETE direto.
-- Os registros deverão ser produzidos por funções seguras, triggers, APIs
-- internas ou pelo service_role.
--
-- A consulta exige permissão específica ou papel de administrador.
-- =============================================================================

GRANT SELECT ON TABLE app.audit_logs TO authenticated;

REVOKE INSERT, UPDATE, DELETE
ON TABLE app.audit_logs
FROM authenticated;

CREATE POLICY audit_logs_select_authorized
ON app.audit_logs
FOR SELECT
TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('core.audit.read')
);

COMMIT;