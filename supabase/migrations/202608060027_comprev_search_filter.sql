BEGIN;

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
DECLARE
    v_search text;
    v_search_digits text;
BEGIN
    PERFORM app.require_comprev_permission(
        'comprev.cases.read'
    );

    v_search := NULLIF(trim(p_search), '');

    v_search_digits := NULLIF(
        regexp_replace(
            COALESCE(p_search, ''),
            '[^0-9]',
            '',
            'g'
        ),
        ''
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
        v_search IS NULL

        OR comprev_case.beneficiary_name
            ILIKE '%' || v_search || '%'

        OR (
            v_search_digits IS NOT NULL
            AND comprev_case.beneficiary_cpf
                ILIKE '%' || v_search_digits || '%'
        )

        OR comprev_case.comprev_protocol_number
            ILIKE '%' || v_search || '%'

        OR comprev_case.tce_process_number
            ILIKE '%' || v_search || '%'
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

COMMIT;