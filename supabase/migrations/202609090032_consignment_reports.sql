BEGIN;

-- =============================================================================
-- RELATÓRIOS PÚBLICOS DO MÓDULO CONSIGNADOS
-- =============================================================================

UPDATE app.modules
SET
    name = 'Consignados',
    description = 'Empréstimos consignados e relatórios mensais.',
    is_active = true,
    updated_at = now()
WHERE code = 'consignments';

INSERT INTO app.permissions (module_id, code, name, description)
SELECT
    module_record.id,
    permission_data.code,
    permission_data.name,
    permission_data.description
FROM app.modules AS module_record
CROSS JOIN (
    VALUES
        ('consignments.reports.read', 'Consultar relatórios de consignados', 'Permite consultar todos os relatórios no SIGPREVI.'),
        ('consignments.reports.create', 'Cadastrar relatórios de consignados', 'Permite cadastrar relatórios mensais.'),
        ('consignments.reports.update', 'Editar relatórios de consignados', 'Permite alterar relatórios mensais.'),
        ('consignments.reports.publish', 'Publicar relatórios de consignados', 'Permite publicar ou despublicar relatórios no portal.'),
        ('consignments.reports.archive', 'Arquivar relatórios de consignados', 'Permite arquivar relatórios despublicados preservando o histórico.')
) AS permission_data(code, name, description)
WHERE module_record.code = 'consignments'
ON CONFLICT (code) DO UPDATE SET
    module_id = EXCLUDED.module_id,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = now();

INSERT INTO app.roles (name, description, scope, module_id, is_system)
SELECT
    'consignments_manager',
    'Gestor dos relatórios públicos do módulo Consignados.',
    'module',
    module_record.id,
    true
FROM app.modules AS module_record
WHERE module_record.code = 'consignments'
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    scope = EXCLUDED.scope,
    module_id = EXCLUDED.module_id,
    is_system = EXCLUDED.is_system,
    updated_at = now();

INSERT INTO app.role_permissions (role_id, permission_id)
SELECT role_record.id, permission_record.id
FROM app.roles AS role_record
JOIN app.permissions AS permission_record
  ON permission_record.code LIKE 'consignments.reports.%'
WHERE role_record.name IN ('consignments_manager', 'administrator')
ON CONFLICT (role_id, permission_id) DO NOTHING;

CREATE TABLE app.consignment_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id text NOT NULL UNIQUE,
    reference_year integer NOT NULL,
    reference_month smallint NOT NULL,
    description text NOT NULL,
    file_path text,
    external_url text,
    is_published boolean NOT NULL DEFAULT false,
    published_at timestamptz,
    published_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    archived_at timestamptz,
    archived_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT consignment_reports_public_id_chk
        CHECK (public_id ~ '^cons-[0-9]{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT consignment_reports_year_chk
        CHECK (reference_year BETWEEN 2024 AND 2200),
    CONSTRAINT consignment_reports_month_chk
        CHECK (reference_month BETWEEN 1 AND 12),
    CONSTRAINT consignment_reports_description_chk
        CHECK (length(trim(description)) BETWEEN 5 AND 200),
    CONSTRAINT consignment_reports_source_chk
        CHECK (num_nonnulls(file_path, external_url) = 1),
    CONSTRAINT consignment_reports_file_chk
        CHECK (file_path IS NULL OR (file_path !~ '(^/|\.\.)' AND file_path ~* '\.pdf$')),
    CONSTRAINT consignment_reports_url_chk
        CHECK (external_url IS NULL OR external_url ~* '^https://'),
    CONSTRAINT consignment_reports_publication_chk
        CHECK (
            (is_published AND published_at IS NOT NULL)
            OR (NOT is_published AND published_at IS NULL)
        ),
    CONSTRAINT consignment_reports_archiving_chk
        CHECK (
            (archived_at IS NULL AND archived_by IS NULL)
            OR archived_at IS NOT NULL
        )
);

COMMENT ON TABLE app.consignment_reports IS
'Relatórios mensais de consignados publicados no portal pelo SIGPREVI.';

CREATE UNIQUE INDEX consignment_reports_active_period_unique_idx
ON app.consignment_reports (reference_year, reference_month)
WHERE archived_at IS NULL;

CREATE INDEX consignment_reports_public_idx
ON app.consignment_reports (reference_year DESC, reference_month)
WHERE is_published = true AND archived_at IS NULL;

CREATE TRIGGER trg_consignment_reports_updated_at
BEFORE UPDATE ON app.consignment_reports
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.consignment_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.consignment_reports FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE app.consignment_reports FROM PUBLIC, anon, authenticated;

CREATE POLICY consignment_reports_select_authorized
ON app.consignment_reports
FOR SELECT TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('consignments.reports.read')
);

CREATE POLICY consignment_reports_insert_authorized
ON app.consignment_reports
FOR INSERT TO authenticated
WITH CHECK (
    app.is_admin()
    OR app.has_permission('consignments.reports.create')
);

CREATE POLICY consignment_reports_update_authorized
ON app.consignment_reports
FOR UPDATE TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('consignments.reports.update')
    OR app.has_permission('consignments.reports.publish')
    OR app.has_permission('consignments.reports.archive')
)
WITH CHECK (
    app.is_admin()
    OR app.has_permission('consignments.reports.update')
    OR app.has_permission('consignments.reports.publish')
    OR app.has_permission('consignments.reports.archive')
);

-- Migra integralmente a fonte pública já existente. O JSON permanece no
-- repositório apenas como contingência e deixa de exigir atualização manual.
INSERT INTO app.consignment_reports (
    public_id,
    reference_year,
    reference_month,
    description,
    external_url,
    is_published,
    published_at
)
SELECT
    report_item->>'id',
    report_year::integer,
    array_position(
        ARRAY[
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ]::text[],
        report_item->>'mes'
    )::smallint,
    trim(report_item->>'descricao'),
    trim(report_item->>'url'),
    true,
    now()
FROM jsonb_each($json$
{
  "2024": [
    {"mes":"Dezembro","descricao":"Relatório de consignados - Dez/2024","url":"https://drive.google.com/file/d/1Xe3K8zOGvoIkCsuBxjDB5xj5DI2wmFzW/view?usp=sharing","id":"cons-2024-12"}
  ],
  "2025": [
    {"mes":"Janeiro","descricao":"Relatório de consignados - Jan/2025","url":"https://drive.google.com/file/d/1Xe3K8zOGvoIkCsuBxjDB5xj5DI2wmFzW/view?usp=sharing","id":"cons-2025-01"},
    {"mes":"Fevereiro","descricao":"Relatório de consignados - Fev/2025","url":"https://drive.google.com/file/d/1Xe3K8zOGvoIkCsuBxjDB5xj5DI2wmFzW/view?usp=sharing","id":"cons-2025-02"},
    {"mes":"Março","descricao":"Relatório de consignados - Mar/2025","url":"https://drive.google.com/file/d/1Xe3K8zOGvoIkCsuBxjDB5xj5DI2wmFzW/view?usp=sharing","id":"cons-2025-03"},
    {"mes":"Abril","descricao":"Relatório de consignados - Abr/2025","url":"https://drive.google.com/file/d/1Xe3K8zOGvoIkCsuBxjDB5xj5DI2wmFzW/view?usp=sharing","id":"cons-2025-04"},
    {"mes":"Maio","descricao":"Relatório de consignados - Mai/2025","url":"https://drive.google.com/file/d/1Xe3K8zOGvoIkCsuBxjDB5xj5DI2wmFzW/view?usp=sharing","id":"cons-2025-05"},
    {"mes":"Junho","descricao":"Relatório de consignados - Jun/2025","url":"https://drive.google.com/file/d/1Xe3K8zOGvoIkCsuBxjDB5xj5DI2wmFzW/view?usp=sharing","id":"cons-2025-06"},
    {"mes":"Julho","descricao":"Relatório de consignados - Jul/2025","url":"https://drive.google.com/file/d/1Xe3K8zOGvoIkCsuBxjDB5xj5DI2wmFzW/view?usp=sharing","id":"cons-2025-07"},
    {"mes":"Agosto","descricao":"Relatório de consignados - Ago/2025","url":"https://drive.google.com/file/d/1Xe3K8zOGvoIkCsuBxjDB5xj5DI2wmFzW/view?usp=sharing","id":"cons-2025-08"},
    {"mes":"Setembro","descricao":"Relatório de consignados - Set/2025","url":"https://drive.google.com/file/d/1Xe3K8zOGvoIkCsuBxjDB5xj5DI2wmFzW/view?usp=sharing","id":"cons-2025-09"},
    {"mes":"Outubro","descricao":"Relatório de consignados - Out/2025","url":"https://drive.google.com/file/d/1Xe3K8zOGvoIkCsuBxjDB5xj5DI2wmFzW/view?usp=sharing","id":"cons-2025-10"},
    {"mes":"Novembro","descricao":"Relatório de consignados - Nov/2025","url":"https://drive.google.com/file/d/1Xe3K8zOGvoIkCsuBxjDB5xj5DI2wmFzW/view?usp=sharing","id":"cons-2025-11"},
    {"mes":"Dezembro","descricao":"Relatório de consignados - Dez/2025","url":"https://drive.google.com/file/d/1Xe3K8zOGvoIkCsuBxjDB5xj5DI2wmFzW/view?usp=sharing","id":"cons-2025-12"}
  ],
  "2026": [
    {"mes":"Janeiro","descricao":"Relatório de consignados - Jan/2026","url":"https://drive.google.com/file/d/1Xe3K8zOGvoIkCsuBxjDB5xj5DI2wmFzW/view?usp=sharing","id":"cons-2026-01"},
    {"mes":"Fevereiro","descricao":"Relatório de consignados - Fev/2026","url":"https://drive.google.com/file/d/1Xe3K8zOGvoIkCsuBxjDB5xj5DI2wmFzW/view?usp=sharing","id":"cons-2026-02"},
    {"mes":"Março","descricao":"Relatório de consignados - Mar/2026","url":"https://drive.google.com/file/d/1Jp292OOXnzbVsM2a9w76szJcNQEgFBGP/view?usp=sharing","id":"cons-2026-03"},
    {"mes":"Abril","descricao":"Relatório de consignados - Abr/2026","url":"https://drive.google.com/file/d/1lg_UpWZgR0Ipevrqrpprrn7Coozwa38q/view?usp=sharing","id":"cons-2026-04"},
    {"mes":"Maio","descricao":"Relatório de consignados - Mai/2026","url":"https://drive.google.com/file/d/1J2_3qAc2b3smDpSSXfXKuWEvfLmxjzyf/view?usp=sharing","id":"cons-2026-05"},
    {"mes":"Junho","descricao":"Relatório Consignados Junho de 2026","url":"https://drive.google.com/file/d/1ZbO1Uonp0uBjqxyNGdawbUN2CzGFU9bu/view?usp=sharing","id":"cons-2026-06"}
  ]
}
$json$::jsonb) AS year_group(report_year, report_rows)
CROSS JOIN LATERAL jsonb_array_elements(year_group.report_rows) AS report_item
ON CONFLICT (public_id) DO NOTHING;

-- =============================================================================
-- AUTORIA E AUTORIZAÇÃO
-- =============================================================================

CREATE OR REPLACE FUNCTION app.prepare_consignment_report()
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

REVOKE ALL ON FUNCTION app.prepare_consignment_report()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_prepare_consignment_report
BEFORE INSERT OR UPDATE ON app.consignment_reports
FOR EACH ROW
EXECUTE FUNCTION app.prepare_consignment_report();

CREATE OR REPLACE FUNCTION app.require_consignments_permission(p_permission_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'É necessário estar autenticado.' USING ERRCODE = '42501';
    END IF;

    IF NOT (app.is_admin() OR app.has_permission(p_permission_code)) THEN
        RAISE EXCEPTION 'O usuário não possui permissão para esta operação.'
            USING ERRCODE = '42501';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION app.require_consignments_permission(text)
FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- API PÚBLICA E ADMINISTRATIVA
-- =============================================================================

CREATE OR REPLACE FUNCTION public.consignments_public_reports_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
    SELECT jsonb_build_object(
        'observacoes', 'Relatórios de consignados organizados por ano e mês.',
        'relatorios', COALESCE((
            SELECT jsonb_object_agg(
                report_year::text,
                report_rows
                ORDER BY report_year
            )
            FROM (
                SELECT
                    report.reference_year AS report_year,
                    jsonb_agg(
                        jsonb_strip_nulls(jsonb_build_object(
                            'id', report.public_id,
                            'mes', CASE report.reference_month
                                WHEN 1 THEN 'Janeiro'
                                WHEN 2 THEN 'Fevereiro'
                                WHEN 3 THEN 'Março'
                                WHEN 4 THEN 'Abril'
                                WHEN 5 THEN 'Maio'
                                WHEN 6 THEN 'Junho'
                                WHEN 7 THEN 'Julho'
                                WHEN 8 THEN 'Agosto'
                                WHEN 9 THEN 'Setembro'
                                WHEN 10 THEN 'Outubro'
                                WHEN 11 THEN 'Novembro'
                                WHEN 12 THEN 'Dezembro'
                            END,
                            'descricao', report.description,
                            'url', report.external_url,
                            'file_path', report.file_path
                        ))
                        ORDER BY report.reference_month
                    ) AS report_rows
                FROM app.consignment_reports AS report
                WHERE report.is_published = true
                  AND report.archived_at IS NULL
                GROUP BY report.reference_year
            ) AS grouped_reports
        ), '{}'::jsonb)
    );
$$;

REVOKE ALL ON FUNCTION public.consignments_public_reports_snapshot()
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.consignments_public_reports_snapshot()
TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.consignments_admin_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
BEGIN
    PERFORM app.require_consignments_permission('consignments.reports.read');

    RETURN jsonb_build_object(
        'reports', COALESCE((
            SELECT jsonb_agg(to_jsonb(report) ORDER BY report.reference_year DESC, report.reference_month)
            FROM app.consignment_reports AS report
            WHERE report.archived_at IS NULL
        ), '[]'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.consignments_admin_snapshot()
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.consignments_admin_snapshot()
TO authenticated;

CREATE OR REPLACE FUNCTION public.consignments_admin_save_report(
    p_id uuid,
    p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
DECLARE
    v_id uuid;
    v_year integer;
    v_month smallint;
    v_description text;
    v_file_path text;
    v_external_url text;
BEGIN
    PERFORM app.require_consignments_permission(
        CASE WHEN p_id IS NULL
            THEN 'consignments.reports.create'
            ELSE 'consignments.reports.update'
        END
    );

    IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
        RAISE EXCEPTION 'Os dados do relatório devem ser informados.';
    END IF;

    v_year := NULLIF(p_payload->>'reference_year', '')::integer;
    v_month := NULLIF(p_payload->>'reference_month', '')::smallint;
    v_description := trim(p_payload->>'description');
    v_file_path := NULLIF(trim(p_payload->>'file_path'), '');
    v_external_url := NULLIF(trim(p_payload->>'external_url'), '');

    IF num_nonnulls(v_file_path, v_external_url) <> 1 THEN
        RAISE EXCEPTION 'Informe um PDF ou um endereço externo.';
    END IF;

    IF p_id IS NULL THEN
        INSERT INTO app.consignment_reports (
            public_id, reference_year, reference_month, description,
            file_path, external_url, created_by, updated_by
        )
        VALUES (
            format('cons-%s-%s', v_year, lpad(v_month::text, 2, '0')),
            v_year, v_month, v_description,
            v_file_path, v_external_url, auth.uid(), auth.uid()
        )
        RETURNING id INTO v_id;
    ELSE
        UPDATE app.consignment_reports
        SET
            public_id = format('cons-%s-%s', v_year, lpad(v_month::text, 2, '0')),
            reference_year = v_year,
            reference_month = v_month,
            description = v_description,
            file_path = v_file_path,
            external_url = v_external_url,
            updated_by = auth.uid()
        WHERE id = p_id
          AND archived_at IS NULL
        RETURNING id INTO v_id;

        IF v_id IS NULL THEN
            RAISE EXCEPTION 'Relatório não encontrado.' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.consignments_admin_set_report_publication(
    p_id uuid,
    p_publish boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
BEGIN
    PERFORM app.require_consignments_permission('consignments.reports.publish');

    UPDATE app.consignment_reports
    SET
        is_published = p_publish,
        published_at = CASE WHEN p_publish THEN now() ELSE NULL END,
        published_by = CASE WHEN p_publish THEN auth.uid() ELSE NULL END,
        updated_by = auth.uid()
    WHERE id = p_id
      AND archived_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Relatório não encontrado.' USING ERRCODE = 'P0002';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.consignments_admin_archive_report(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
BEGIN
    PERFORM app.require_consignments_permission('consignments.reports.archive');

    UPDATE app.consignment_reports
    SET
        archived_at = now(),
        archived_by = auth.uid(),
        updated_by = auth.uid()
    WHERE id = p_id
      AND archived_at IS NULL
      AND is_published = false;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'O relatório deve estar despublicado antes de ser arquivado.';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.consignments_admin_save_report(uuid, jsonb)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.consignments_admin_set_report_publication(uuid, boolean)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.consignments_admin_archive_report(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.consignments_admin_save_report(uuid, jsonb)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.consignments_admin_set_report_publication(uuid, boolean)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.consignments_admin_archive_report(uuid)
TO authenticated;

-- =============================================================================
-- ARMAZENAMENTO DE PDFs
-- =============================================================================

INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'consignment-reports',
    'consignment-reports',
    true,
    20971520,
    ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS consignment_reports_storage_insert_authorized ON storage.objects;
DROP POLICY IF EXISTS consignment_reports_storage_update_authorized ON storage.objects;
DROP POLICY IF EXISTS consignment_reports_storage_delete_authorized ON storage.objects;

CREATE POLICY consignment_reports_storage_insert_authorized
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'consignment-reports'
    AND (app.is_admin() OR app.has_permission('consignments.reports.create'))
    AND name ~* '^[0-9]{4}/(0[1-9]|1[0-2])/[a-z0-9._-]+\.pdf$'
);

CREATE POLICY consignment_reports_storage_update_authorized
ON storage.objects
FOR UPDATE TO authenticated
USING (
    bucket_id = 'consignment-reports'
    AND (app.is_admin() OR app.has_permission('consignments.reports.update'))
)
WITH CHECK (
    bucket_id = 'consignment-reports'
    AND (app.is_admin() OR app.has_permission('consignments.reports.update'))
    AND name ~* '^[0-9]{4}/(0[1-9]|1[0-2])/[a-z0-9._-]+\.pdf$'
);

CREATE POLICY consignment_reports_storage_delete_authorized
ON storage.objects
FOR DELETE TO authenticated
USING (
    bucket_id = 'consignment-reports'
    AND (app.is_admin() OR app.has_permission('consignments.reports.update'))
);

NOTIFY pgrst, 'reload schema';

COMMIT;
