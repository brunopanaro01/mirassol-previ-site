BEGIN;

-- Indicadores anuais exibidos na página inicial. As permissões do módulo
-- Publicações são reutilizadas para manter a administração centralizada.
CREATE TABLE app.portal_annual_indicators (
    reference_year integer PRIMARY KEY,
    retirees integer,
    pensioners integer,
    insured integer,
    net_assets numeric(18, 2),
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT portal_indicators_year_chk
        CHECK (reference_year BETWEEN 2000 AND 2200),
    CONSTRAINT portal_indicators_retirees_chk
        CHECK (retirees IS NULL OR retirees >= 0),
    CONSTRAINT portal_indicators_pensioners_chk
        CHECK (pensioners IS NULL OR pensioners >= 0),
    CONSTRAINT portal_indicators_insured_chk
        CHECK (insured IS NULL OR insured >= 0),
    CONSTRAINT portal_indicators_assets_chk
        CHECK (net_assets IS NULL OR net_assets >= 0),
    CONSTRAINT portal_indicators_value_chk
        CHECK (
            retirees IS NOT NULL
            OR pensioners IS NOT NULL
            OR insured IS NOT NULL
            OR net_assets IS NOT NULL
        )
);

COMMENT ON TABLE app.portal_annual_indicators IS
'Histórico anual de segurados, aposentados, pensionistas e patrimônio exibido na página inicial.';

CREATE TRIGGER trg_portal_indicators_updated_at
BEFORE UPDATE ON app.portal_annual_indicators
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE OR REPLACE FUNCTION app.prepare_portal_annual_indicator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL
       AND session_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
        RAISE EXCEPTION 'Não foi possível identificar o usuário responsável.'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.created_by := COALESCE(NEW.created_by, v_user_id);
        NEW.updated_by := COALESCE(NEW.updated_by, v_user_id);
    ELSE
        NEW.updated_by := COALESCE(v_user_id, NEW.updated_by);
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.prepare_portal_annual_indicator()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_prepare_portal_annual_indicator
BEFORE INSERT OR UPDATE ON app.portal_annual_indicators
FOR EACH ROW
EXECUTE FUNCTION app.prepare_portal_annual_indicator();

ALTER TABLE app.portal_annual_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.portal_annual_indicators FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE app.portal_annual_indicators
FROM PUBLIC, anon, authenticated;

CREATE POLICY portal_indicators_select_authorized
ON app.portal_annual_indicators
FOR SELECT TO authenticated
USING (app.is_admin() OR app.has_permission('publications.read'));

CREATE POLICY portal_indicators_insert_authorized
ON app.portal_annual_indicators
FOR INSERT TO authenticated
WITH CHECK (app.is_admin() OR app.has_permission('publications.create'));

CREATE POLICY portal_indicators_update_authorized
ON app.portal_annual_indicators
FOR UPDATE TO authenticated
USING (app.is_admin() OR app.has_permission('publications.update'))
WITH CHECK (app.is_admin() OR app.has_permission('publications.update'));

-- Preserva integralmente os dois JSONs usados anteriormente pelo portal.
INSERT INTO app.portal_annual_indicators (
    reference_year, retirees, pensioners, insured, net_assets
)
VALUES
    (2016, 6,   0, 438, NULL),
    (2017, 22,  0, 479, NULL),
    (2018, 38,  1, 459,  8867051.16),
    (2019, 57,  2, 438, 12472331.86),
    (2020, 72,  2, 414, 15009589.64),
    (2021, 90,  7, 394, 16737166.29),
    (2022, 105, 9, 551, 19641188.86),
    (2023, 118, 9, 576, 31198105.91),
    (2024, 127, 12, 532, 49075375.52),
    (2025, 124, 11, 524, 62463790.90),
    (2026, 134, 13, 517, 78160227.17)
ON CONFLICT (reference_year) DO NOTHING;

CREATE OR REPLACE FUNCTION public.portal_public_indicators_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
    SELECT jsonb_build_object(
        'updated_at', to_char(COALESCE(max(updated_at), now()), 'YYYY-MM-DD'),
        'years', COALESCE(jsonb_agg(
            jsonb_build_object(
                'reference_year', reference_year,
                'retirees', retirees,
                'pensioners', pensioners,
                'insured', insured,
                'net_assets', net_assets
            ) ORDER BY reference_year
        ), '[]'::jsonb)
    )
    FROM app.portal_annual_indicators;
$$;

REVOKE ALL ON FUNCTION public.portal_public_indicators_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_public_indicators_snapshot()
TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.portal_indicators_admin_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
BEGIN
    PERFORM app.require_publications_permission('publications.read');
    RETURN jsonb_build_object(
        'years', COALESCE((
            SELECT jsonb_agg(to_jsonb(indicator) ORDER BY reference_year DESC)
            FROM app.portal_annual_indicators AS indicator
        ), '[]'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.portal_indicators_admin_snapshot()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_indicators_admin_snapshot()
TO authenticated;

CREATE OR REPLACE FUNCTION public.portal_indicators_admin_save(p_payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
DECLARE
    v_year integer := NULLIF(p_payload->>'reference_year', '')::integer;
    v_exists boolean;
BEGIN
    IF v_year IS NULL OR v_year NOT BETWEEN 2000 AND 2200 THEN
        RAISE EXCEPTION 'Informe um ano válido entre 2000 e 2200.';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM app.portal_annual_indicators
        WHERE reference_year = v_year
    ) INTO v_exists;

    PERFORM app.require_publications_permission(
        CASE WHEN v_exists THEN 'publications.update' ELSE 'publications.create' END
    );

    INSERT INTO app.portal_annual_indicators (
        reference_year, retirees, pensioners, insured, net_assets
    ) VALUES (
        v_year,
        NULLIF(p_payload->>'retirees', '')::integer,
        NULLIF(p_payload->>'pensioners', '')::integer,
        NULLIF(p_payload->>'insured', '')::integer,
        NULLIF(p_payload->>'net_assets', '')::numeric
    )
    ON CONFLICT (reference_year) DO UPDATE SET
        retirees = EXCLUDED.retirees,
        pensioners = EXCLUDED.pensioners,
        insured = EXCLUDED.insured,
        net_assets = EXCLUDED.net_assets,
        updated_by = auth.uid();

    RETURN v_year;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_indicators_admin_save(jsonb)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_indicators_admin_save(jsonb)
TO authenticated;

COMMIT;
