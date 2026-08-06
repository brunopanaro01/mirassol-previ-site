BEGIN;

CREATE OR REPLACE FUNCTION public.comprev_admin_link_tce_process(
    p_case_id uuid,
    p_process_number text,
    p_process_year integer
)
RETURNS app.comprev_cases
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
DECLARE
    v_old_case app.comprev_cases%ROWTYPE;
    v_new_case app.comprev_cases%ROWTYPE;
    v_module_id smallint;
    v_process_number text;
    v_process_url text;
BEGIN
    PERFORM app.require_comprev_permission(
        'comprev.cases.update'
    );

    IF p_case_id IS NULL THEN
        RAISE EXCEPTION
            'O processo COMPREV deve ser informado.';
    END IF;

    v_process_number := regexp_replace(
        COALESCE(p_process_number, ''),
        '[^0-9]',
        '',
        'g'
    );

    IF length(v_process_number) = 0 THEN
        RAISE EXCEPTION
            'O número do processo do TCE é inválido.';
    END IF;

    IF p_process_year IS NULL
       OR p_process_year NOT BETWEEN 2000 AND 2200 THEN
        RAISE EXCEPTION
            'O ano do processo do TCE é inválido.';
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
        RAISE EXCEPTION
            'Não é possível alterar um processo arquivado.';
    END IF;

    v_process_url :=
        'https://www.tce.mt.gov.br/processo/'
        || v_process_number
        || '/'
        || p_process_year::text
        || '#/';

    UPDATE app.comprev_cases
    SET
        tce_process_number = v_process_number,
        tce_process_year = p_process_year,
        tce_process_url = v_process_url,
        tce_consulted_at = now(),
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
        'update',
        'app',
        'comprev_cases',
        v_new_case.id::text,
        'api',
        true,
        'Vinculação de processo localizado no portal do TCE-MT.',
        to_jsonb(v_old_case),
        to_jsonb(v_new_case),
        jsonb_build_object(
            'operation',
            'comprev_tce_process_link',
            'tce_process_number',
            v_process_number,
            'tce_process_year',
            p_process_year,
            'tce_process_url',
            v_process_url
        )
    );

    RETURN v_new_case;
END;
$$;

REVOKE ALL
ON FUNCTION public.comprev_admin_link_tce_process(
    uuid,
    text,
    integer
)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.comprev_admin_link_tce_process(
    uuid,
    text,
    integer
)
TO authenticated;

COMMENT ON FUNCTION public.comprev_admin_link_tce_process(
    uuid,
    text,
    integer
) IS
'Vincula a um processo COMPREV o processo correspondente localizado no portal do TCE-MT.';

COMMIT;