BEGIN;

-- =============================================================================
-- CRIAÇÃO AUTOMÁTICA DO PERFIL DO USUÁRIO
-- =============================================================================

CREATE OR REPLACE FUNCTION app.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, app
AS $$
DECLARE
    v_full_name text;
BEGIN

    v_full_name :=
        COALESCE(
            NEW.raw_user_meta_data ->> 'full_name',
            NEW.raw_user_meta_data ->> 'name',
            split_part(NEW.email, '@', 1)
        );

    INSERT INTO app.users (
        id,
        full_name,
        registration,
        status,
        created_at,
        updated_at
    )
    VALUES (
        NEW.id,
        v_full_name,
        NULL,
        'active',
        now(),
        now()
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;

END;
$$;

COMMENT ON FUNCTION app.handle_new_auth_user() IS
'Cria automaticamente o perfil da aplicação após a criação do usuário no Supabase Auth.';

-- =============================================================================
-- REMOVE O TRIGGER CASO JÁ EXISTA
-- =============================================================================

DROP TRIGGER IF EXISTS trg_auth_user_created
ON auth.users;

-- =============================================================================
-- NOVO TRIGGER
-- =============================================================================

CREATE TRIGGER trg_auth_user_created
AFTER INSERT
ON auth.users
FOR EACH ROW
EXECUTE FUNCTION app.handle_new_auth_user();

COMMIT;