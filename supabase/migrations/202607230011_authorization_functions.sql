BEGIN;

-- =============================================================================
-- FUNÇÃO: O usuário possui determinado papel?
-- =============================================================================

CREATE OR REPLACE FUNCTION app.has_role(
    p_role_code text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
SELECT EXISTS (
    SELECT 1
      FROM app.user_roles ur
      JOIN app.roles r
        ON r.id = ur.role_id
     WHERE ur.user_id = auth.uid()
       AND r.name = p_role_code
);
$$;

COMMENT ON FUNCTION app.has_role(text) IS
'Retorna TRUE quando o usuário autenticado possui o papel informado.';

-- =============================================================================
-- FUNÇÃO: O usuário possui determinada permissão?
-- =============================================================================

CREATE OR REPLACE FUNCTION app.has_permission(
    p_permission_code text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
SELECT EXISTS (

    SELECT 1
      FROM app.user_roles ur
      JOIN app.role_permissions rp
        ON rp.role_id = ur.role_id
      JOIN app.permissions p
        ON p.id = rp.permission_id
     WHERE ur.user_id = auth.uid()
       AND p.code = p_permission_code

);
$$;

COMMENT ON FUNCTION app.has_permission(text) IS
'Retorna TRUE quando o usuário autenticado possui a permissão informada.';

-- =============================================================================
-- FUNÇÃO: Usuário é administrador?
-- =============================================================================

CREATE OR REPLACE FUNCTION app.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
SELECT app.has_role('administrator');
$$;

COMMENT ON FUNCTION app.is_admin() IS
'Retorna TRUE quando o usuário autenticado possui o papel Administrator.';

-- =============================================================================
-- FUNÇÃO: Usuário pertence ao módulo?
-- =============================================================================

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
      FROM app.user_roles ur
      JOIN app.roles r
        ON r.id = ur.role_id
      JOIN app.modules m
        ON m.id = r.module_id
     WHERE ur.user_id = auth.uid()
       AND (
            r.scope = 'global'
            OR m.code = p_module_code
       )

);
$$;

COMMENT ON FUNCTION app.has_module_access(text) IS
'Verifica se o usuário possui acesso ao módulo informado.';

-- =============================================================================
-- PERMISSÃO DE EXECUÇÃO
-- =============================================================================

GRANT EXECUTE ON FUNCTION app.has_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION app.has_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION app.has_module_access(text) TO authenticated;
GRANT EXECUTE ON FUNCTION app.is_admin() TO authenticated;

COMMIT;