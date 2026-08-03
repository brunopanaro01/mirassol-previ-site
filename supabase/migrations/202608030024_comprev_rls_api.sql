BEGIN;

-- =============================================================================
-- SEGURANÇA E API ADMINISTRATIVA DO COMPREV
-- =============================================================================

-- -----------------------------------------------------------------------------
-- FUNÇÃO INTERNA: EXIGIR PERMISSÃO
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.require_comprev_permission(
    p_permission_code text
)
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

    IF NOT (
        app.is_admin()
        OR app.has_permission(p_permission_code)
    ) THEN
        RAISE EXCEPTION
            'O usuário não possui permissão para esta operação.'
            USING ERRCODE = '42501';
    END IF;
END;
$$;

REVOKE ALL
ON FUNCTION app.require_comprev_permission(text)
FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- TRIGGER DE AUTORIA
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.prepare_comprev_case()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
DECLARE
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL
       AND session_user NOT IN (
           'postgres',
           'supabase_admin',
           'service_role'
       ) THEN
        RAISE EXCEPTION
            'Não foi possível identificar o usuário responsável.'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.created_by := COALESCE(
            NEW.created_by,
            v_user_id
        );

        NEW.updated_by := COALESCE(
            NEW.updated_by,
            v_user_id
        );
    ELSE
        NEW.updated_by := COALESCE(
            v_user_id,
            NEW.updated_by
        );
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION app.prepare_comprev_case()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_prepare_comprev_case
BEFORE INSERT OR UPDATE
ON app.comprev_cases
FOR EACH ROW
EXECUTE FUNCTION app.prepare_comprev_case();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE app.comprev_cases
ENABLE ROW LEVEL SECURITY;

ALTER TABLE app.comprev_cases
FORCE ROW LEVEL SECURITY;

REVOKE ALL
ON TABLE app.comprev_cases
FROM PUBLIC, anon, authenticated;

CREATE POLICY comprev_cases_select_authorized
ON app.comprev_cases
FOR SELECT
TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('comprev.cases.read')
);

CREATE POLICY comprev_cases_insert_authorized
ON app.comprev_cases
FOR INSERT
TO authenticated
WITH CHECK (
    app.is_admin()
    OR app.has_permission('comprev.cases.create')
);

CREATE POLICY comprev_cases_update_authorized
ON app.comprev_cases
FOR UPDATE
TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('comprev.cases.update')
    OR app.has_permission('comprev.cases.manage')
    OR app.has_permission('comprev.cases.archive')
)
WITH CHECK (
    app.is_admin()
    OR app.has_permission('comprev.cases.update')
    OR app.has_permission('comprev.cases.manage')
    OR app.has_permission('comprev.cases.archive')
);

-- Não existe política DELETE.
-- Os registros serão arquivados para preservação do histórico.

-- =============================================================================
-- RPC: LISTAR PROCESSOS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.comprev_admin_list_cases(
    p_status text DEFAULT NULL,
    p_search text DEFAULT NULL,
    p_include_archived boolean DEFAULT false
)
RETURNS SETOF app.comprev_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
BEGIN
    PERFORM app.require_comprev_permission(
        'comprev.cases.read'
    );

    RETURN QUERY
    SELECT comprev_case.*
    FROM app.comprev_cases AS comprev_case
    WHERE (
        p_include_archived = true
        OR comprev_case.archived_at IS NULL
    )
    AND (
        p_status IS NULL
        OR length(trim(p_status)) = 0
        OR comprev_case.status = trim(p_status)
    )
    AND (
        p_search IS NULL
        OR length(trim(p_search)) = 0
        OR comprev_case.beneficiary_name
            ILIKE '%' || trim(p_search) || '%'
        OR comprev_case.beneficiary_cpf
            ILIKE '%' || regexp_replace(
                p_search,
                '[^0-9]',
                '',
                'g'
            ) || '%'
        OR comprev_case.comprev_protocol_number
            ILIKE '%' || trim(p_search) || '%'
        OR comprev_case.tce_process_number
            ILIKE '%' || trim(p_search) || '%'
    )
    ORDER BY
        comprev_case.updated_at DESC,
        comprev_case.beneficiary_name;
END;
$$;

REVOKE ALL
ON FUNCTION public.comprev_admin_list_cases(
    text,
    text,
    boolean
)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.comprev_admin_list_cases(
    text,
    text,
    boolean
)
TO authenticated;

-- =============================================================================
-- RPC: CONSULTAR UM PROCESSO
-- =============================================================================

CREATE OR REPLACE FUNCTION public.comprev_admin_get_case(
    p_case_id uuid
)
RETURNS app.comprev_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
DECLARE
    v_case app.comprev_cases%ROWTYPE;
BEGIN
    PERFORM app.require_comprev_permission(
        'comprev.cases.read'
    );

    SELECT comprev_case.*
    INTO v_case
    FROM app.comprev_cases AS comprev_case
    WHERE comprev_case.id = p_case_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'O processo COMPREV não foi encontrado.'
            USING ERRCODE = 'P0002';
    END IF;

    RETURN v_case;
END;
$$;

REVOKE ALL
ON FUNCTION public.comprev_admin_get_case(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.comprev_admin_get_case(uuid)
TO authenticated;

-- =============================================================================
-- RPC: CADASTRAR PROCESSO
-- =============================================================================

CREATE OR REPLACE FUNCTION public.comprev_admin_create_case(
    p_data jsonb
)
RETURNS app.comprev_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
DECLARE
    v_case app.comprev_cases%ROWTYPE;
    v_module_id smallint;
BEGIN
    PERFORM app.require_comprev_permission(
        'comprev.cases.create'
    );

    IF p_data IS NULL
       OR jsonb_typeof(p_data) <> 'object' THEN
        RAISE EXCEPTION
            'Os dados do processo devem ser informados.';
    END IF;

    IF p_data->>'beneficiary_name' IS NULL
       OR length(trim(p_data->>'beneficiary_name')) = 0 THEN
        RAISE EXCEPTION
            'O nome do beneficiário deve ser informado.';
    END IF;

    INSERT INTO app.comprev_cases (
        beneficiary_name,
        beneficiary_cpf,
        benefit_type,
        benefit_number,
        benefit_start_date,
        benefit_grant_date,
        source_benefit_year,
        source_benefit_month,
        source_benefit_description,
        grant_document_url,
        tce_process_number,
        tce_process_year,
        tce_process_url,
        compensation_direction,
        origin_regime,
        origin_regime_name,
        origin_regime_cnpj,
        notes,
        created_by,
        updated_by
    )
    VALUES (
        trim(p_data->>'beneficiary_name'),

        NULLIF(
            regexp_replace(
                COALESCE(
                    p_data->>'beneficiary_cpf',
                    ''
                ),
                '[^0-9]',
                '',
                'g'
            ),
            ''
        ),

        COALESCE(
            NULLIF(
                trim(p_data->>'benefit_type'),
                ''
            ),
            'retirement'
        ),

        NULLIF(
            trim(p_data->>'benefit_number'),
            ''
        ),

        NULLIF(
            p_data->>'benefit_start_date',
            ''
        )::date,

        NULLIF(
            p_data->>'benefit_grant_date',
            ''
        )::date,

        NULLIF(
            p_data->>'source_benefit_year',
            ''
        )::integer,

        NULLIF(
            p_data->>'source_benefit_month',
            ''
        )::smallint,

        NULLIF(
            trim(
                p_data->>'source_benefit_description'
            ),
            ''
        ),

        NULLIF(
            trim(p_data->>'grant_document_url'),
            ''
        ),

        NULLIF(
            regexp_replace(
                COALESCE(
                    p_data->>'tce_process_number',
                    ''
                ),
                '[^0-9]',
                '',
                'g'
            ),
            ''
        ),

        NULLIF(
            p_data->>'tce_process_year',
            ''
        )::integer,

        NULLIF(
            trim(p_data->>'tce_process_url'),
            ''
        ),

        COALESCE(
            NULLIF(
                trim(
                    p_data->>'compensation_direction'
                ),
                ''
            ),
            'receivable'
        ),

        COALESCE(
            NULLIF(
                trim(p_data->>'origin_regime'),
                ''
            ),
            'rgps'
        ),

        NULLIF(
            trim(p_data->>'origin_regime_name'),
            ''
        ),

        NULLIF(
            regexp_replace(
                COALESCE(
                    p_data->>'origin_regime_cnpj',
                    ''
                ),
                '[^0-9]',
                '',
                'g'
            ),
            ''
        ),

        NULLIF(
            trim(p_data->>'notes'),
            ''
        ),

        auth.uid(),
        auth.uid()
    )
    RETURNING *
    INTO v_case;

    SELECT module_record.id
    INTO v_module_id
    FROM app.modules AS module_record
    WHERE module_record.code = 'comprev';

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
        v_module_id,
        'create',
        'app',
        'comprev_cases',
        v_case.id::text,
        'api',
        true,
        to_jsonb(v_case),
        jsonb_build_object(
            'operation',
            'comprev_case_create'
        )
    );

    RETURN v_case;
END;
$$;

REVOKE ALL
ON FUNCTION public.comprev_admin_create_case(jsonb)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.comprev_admin_create_case(jsonb)
TO authenticated;

-- =============================================================================
-- RPC: ATUALIZAR PROCESSO
-- =============================================================================

CREATE OR REPLACE FUNCTION public.comprev_admin_update_case(
    p_case_id uuid,
    p_data jsonb
)
RETURNS app.comprev_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
DECLARE
    v_old_case app.comprev_cases%ROWTYPE;
    v_new_case app.comprev_cases%ROWTYPE;
    v_module_id smallint;
BEGIN
    PERFORM app.require_comprev_permission(
        'comprev.cases.update'
    );

    IF p_data IS NULL
       OR jsonb_typeof(p_data) <> 'object' THEN
        RAISE EXCEPTION
            'Os dados da atualização devem ser informados.';
    END IF;

    SELECT comprev_case.*
    INTO v_old_case
    FROM app.comprev_cases AS comprev_case
    WHERE comprev_case.id = p_case_id
      AND comprev_case.archived_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'O processo COMPREV não foi encontrado ou está arquivado.'
            USING ERRCODE = 'P0002';
    END IF;

    IF p_data ?| ARRAY[
        'comprev_protocol_number',
        'comprev_protocol_date',
        'status',
        'requirement_description',
        'requirement_received_at',
        'requirement_deadline',
        'analysis_date',
        'approval_date',
        'rejection_reason',
        'monthly_compensation_amount',
        'arrears_amount',
        'payment_start_date',
        'payment_end_date'
    ] THEN
        PERFORM app.require_comprev_permission(
            'comprev.cases.manage'
        );
    END IF;

    UPDATE app.comprev_cases
    SET
        beneficiary_name = CASE
            WHEN p_data ? 'beneficiary_name'
            THEN trim(p_data->>'beneficiary_name')
            ELSE beneficiary_name
        END,

        beneficiary_cpf = CASE
            WHEN p_data ? 'beneficiary_cpf'
            THEN NULLIF(
                regexp_replace(
                    COALESCE(
                        p_data->>'beneficiary_cpf',
                        ''
                    ),
                    '[^0-9]',
                    '',
                    'g'
                ),
                ''
            )
            ELSE beneficiary_cpf
        END,

        benefit_type = CASE
            WHEN p_data ? 'benefit_type'
            THEN trim(p_data->>'benefit_type')
            ELSE benefit_type
        END,

        benefit_number = CASE
            WHEN p_data ? 'benefit_number'
            THEN NULLIF(
                trim(p_data->>'benefit_number'),
                ''
            )
            ELSE benefit_number
        END,

        benefit_start_date = CASE
            WHEN p_data ? 'benefit_start_date'
            THEN NULLIF(
                p_data->>'benefit_start_date',
                ''
            )::date
            ELSE benefit_start_date
        END,

        benefit_grant_date = CASE
            WHEN p_data ? 'benefit_grant_date'
            THEN NULLIF(
                p_data->>'benefit_grant_date',
                ''
            )::date
            ELSE benefit_grant_date
        END,

        source_benefit_year = CASE
            WHEN p_data ? 'source_benefit_year'
            THEN NULLIF(
                p_data->>'source_benefit_year',
                ''
            )::integer
            ELSE source_benefit_year
        END,

        source_benefit_month = CASE
            WHEN p_data ? 'source_benefit_month'
            THEN NULLIF(
                p_data->>'source_benefit_month',
                ''
            )::smallint
            ELSE source_benefit_month
        END,

        source_benefit_description = CASE
            WHEN p_data ? 'source_benefit_description'
            THEN NULLIF(
                trim(
                    p_data->>'source_benefit_description'
                ),
                ''
            )
            ELSE source_benefit_description
        END,

        grant_document_url = CASE
            WHEN p_data ? 'grant_document_url'
            THEN NULLIF(
                trim(p_data->>'grant_document_url'),
                ''
            )
            ELSE grant_document_url
        END,

        tce_process_number = CASE
            WHEN p_data ? 'tce_process_number'
            THEN NULLIF(
                regexp_replace(
                    COALESCE(
                        p_data->>'tce_process_number',
                        ''
                    ),
                    '[^0-9]',
                    '',
                    'g'
                ),
                ''
            )
            ELSE tce_process_number
        END,

        tce_process_year = CASE
            WHEN p_data ? 'tce_process_year'
            THEN NULLIF(
                p_data->>'tce_process_year',
                ''
            )::integer
            ELSE tce_process_year
        END,

        tce_process_url = CASE
            WHEN p_data ? 'tce_process_url'
            THEN NULLIF(
                trim(p_data->>'tce_process_url'),
                ''
            )
            ELSE tce_process_url
        END,

        compensation_direction = CASE
            WHEN p_data ? 'compensation_direction'
            THEN trim(
                p_data->>'compensation_direction'
            )
            ELSE compensation_direction
        END,

        origin_regime = CASE
            WHEN p_data ? 'origin_regime'
            THEN trim(p_data->>'origin_regime')
            ELSE origin_regime
        END,

        origin_regime_name = CASE
            WHEN p_data ? 'origin_regime_name'
            THEN NULLIF(
                trim(p_data->>'origin_regime_name'),
                ''
            )
            ELSE origin_regime_name
        END,

        origin_regime_cnpj = CASE
            WHEN p_data ? 'origin_regime_cnpj'
            THEN NULLIF(
                regexp_replace(
                    COALESCE(
                        p_data->>'origin_regime_cnpj',
                        ''
                    ),
                    '[^0-9]',
                    '',
                    'g'
                ),
                ''
            )
            ELSE origin_regime_cnpj
        END,

        comprev_protocol_number = CASE
            WHEN p_data ? 'comprev_protocol_number'
            THEN NULLIF(
                trim(
                    p_data->>'comprev_protocol_number'
                ),
                ''
            )
            ELSE comprev_protocol_number
        END,

        comprev_protocol_date = CASE
            WHEN p_data ? 'comprev_protocol_date'
            THEN NULLIF(
                p_data->>'comprev_protocol_date',
                ''
            )::date
            ELSE comprev_protocol_date
        END,

        status = CASE
            WHEN p_data ? 'status'
            THEN trim(p_data->>'status')
            ELSE status
        END,

        requirement_description = CASE
            WHEN p_data ? 'requirement_description'
            THEN NULLIF(
                trim(
                    p_data->>'requirement_description'
                ),
                ''
            )
            ELSE requirement_description
        END,

        requirement_received_at = CASE
            WHEN p_data ? 'requirement_received_at'
            THEN NULLIF(
                p_data->>'requirement_received_at',
                ''
            )::date
            ELSE requirement_received_at
        END,

        requirement_deadline = CASE
            WHEN p_data ? 'requirement_deadline'
            THEN NULLIF(
                p_data->>'requirement_deadline',
                ''
            )::date
            ELSE requirement_deadline
        END,

        analysis_date = CASE
            WHEN p_data ? 'analysis_date'
            THEN NULLIF(
                p_data->>'analysis_date',
                ''
            )::date
            ELSE analysis_date
        END,

        approval_date = CASE
            WHEN p_data ? 'approval_date'
            THEN NULLIF(
                p_data->>'approval_date',
                ''
            )::date
            ELSE approval_date
        END,

        rejection_reason = CASE
            WHEN p_data ? 'rejection_reason'
            THEN NULLIF(
                trim(p_data->>'rejection_reason'),
                ''
            )
            ELSE rejection_reason
        END,

        monthly_compensation_amount = CASE
            WHEN p_data ? 'monthly_compensation_amount'
            THEN NULLIF(
                p_data->>'monthly_compensation_amount',
                ''
            )::numeric
            ELSE monthly_compensation_amount
        END,

        arrears_amount = CASE
            WHEN p_data ? 'arrears_amount'
            THEN NULLIF(
                p_data->>'arrears_amount',
                ''
            )::numeric
            ELSE arrears_amount
        END,

        payment_start_date = CASE
            WHEN p_data ? 'payment_start_date'
            THEN NULLIF(
                p_data->>'payment_start_date',
                ''
            )::date
            ELSE payment_start_date
        END,

        payment_end_date = CASE
            WHEN p_data ? 'payment_end_date'
            THEN NULLIF(
                p_data->>'payment_end_date',
                ''
            )::date
            ELSE payment_end_date
        END,

        notes = CASE
            WHEN p_data ? 'notes'
            THEN NULLIF(
                trim(p_data->>'notes'),
                ''
            )
            ELSE notes
        END,

        updated_by = auth.uid()
    WHERE id = p_case_id
    RETURNING *
    INTO v_new_case;

    SELECT module_record.id
    INTO v_module_id
    FROM app.modules AS module_record
    WHERE module_record.code = 'comprev';

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
        new_data,
        metadata
    )
    VALUES (
        auth.uid(),
        v_module_id,
        'update',
        'app',
        'comprev_cases',
        v_new_case.id::text,
        'api',
        true,
        to_jsonb(v_old_case),
        to_jsonb(v_new_case),
        jsonb_build_object(
            'operation',
            'comprev_case_update'
        )
    );

    RETURN v_new_case;
END;
$$;

REVOKE ALL
ON FUNCTION public.comprev_admin_update_case(
    uuid,
    jsonb
)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.comprev_admin_update_case(
    uuid,
    jsonb
)
TO authenticated;

-- =============================================================================
-- RPC: ARQUIVAR PROCESSO
-- =============================================================================

CREATE OR REPLACE FUNCTION public.comprev_admin_archive_case(
    p_case_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
DECLARE
    v_old_case app.comprev_cases%ROWTYPE;
    v_new_case app.comprev_cases%ROWTYPE;
    v_module_id smallint;
BEGIN
    PERFORM app.require_comprev_permission(
        'comprev.cases.archive'
    );

    IF p_reason IS NULL
       OR length(trim(p_reason)) < 5 THEN
        RAISE EXCEPTION
            'Informe o motivo do arquivamento.';
    END IF;

    SELECT comprev_case.*
    INTO v_old_case
    FROM app.comprev_cases AS comprev_case
    WHERE comprev_case.id = p_case_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'O processo COMPREV não foi encontrado.'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_old_case.archived_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'status',
            'already_archived',
            'case_id',
            p_case_id
        );
    END IF;

    UPDATE app.comprev_cases
    SET
        archived_at = now(),
        archived_by = auth.uid(),
        updated_by = auth.uid()
    WHERE id = p_case_id
    RETURNING *
    INTO v_new_case;

    SELECT module_record.id
    INTO v_module_id
    FROM app.modules AS module_record
    WHERE module_record.code = 'comprev';

    INSERT INTO app.audit_logs (
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
        metadata
    )
    VALUES (
        auth.uid(),
        v_module_id,
        'archive',
        'app',
        'comprev_cases',
        v_new_case.id::text,
        'api',
        true,
        trim(p_reason),
        to_jsonb(v_old_case),
        to_jsonb(v_new_case),
        jsonb_build_object(
            'operation',
            'comprev_case_archive'
        )
    );

    RETURN jsonb_build_object(
        'status',
        'archived',
        'case_id',
        p_case_id
    );
END;
$$;

REVOKE ALL
ON FUNCTION public.comprev_admin_archive_case(
    uuid,
    text
)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.comprev_admin_archive_case(
    uuid,
    text
)
TO authenticated;

COMMIT;