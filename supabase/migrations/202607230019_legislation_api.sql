BEGIN;

-- =============================================================================
-- API SEGURA DO MÓDULO DE LEGISLAÇÃO
-- =============================================================================

-- -----------------------------------------------------------------------------
-- FUNÇÃO INTERNA: EXIGIR PERMISSÃO
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.require_legislation_permission(
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
            'O usuário não possui a permissão necessária: %.',
            p_permission_code
            USING ERRCODE = '42501';
    END IF;
END;
$$;

COMMENT ON FUNCTION app.require_legislation_permission(text) IS
'Interrompe a operação quando o usuário não possui a permissão informada.';

REVOKE ALL
ON FUNCTION app.require_legislation_permission(text)
FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- FUNÇÃO INTERNA: REGISTRAR AUDITORIA
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.audit_legislation_action(
    p_action text,
    p_entity_table text,
    p_entity_id text,
    p_old_data jsonb DEFAULT NULL,
    p_new_data jsonb DEFAULT NULL,
    p_reason text DEFAULT NULL,
    p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
DECLARE
    v_audit_id bigint;
    v_module_id smallint;
BEGIN
    IF p_action IS NULL OR length(trim(p_action)) = 0 THEN
        RAISE EXCEPTION
            'A ação de auditoria deve ser informada.';
    END IF;

    IF p_metadata IS NULL
       OR jsonb_typeof(p_metadata) <> 'object' THEN
        RAISE EXCEPTION
            'Os metadados da auditoria devem ser um objeto JSON.';
    END IF;

    SELECT module_record.id
    INTO v_module_id
    FROM app.modules AS module_record
    WHERE module_record.code = 'legislation'
    LIMIT 1;

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
        trim(p_action),
        'app',
        p_entity_table,
        p_entity_id,
        'api',
        true,
        p_reason,
        p_old_data,
        p_new_data,
        p_metadata
    )
    RETURNING id INTO v_audit_id;

    RETURN v_audit_id;
END;
$$;

COMMENT ON FUNCTION app.audit_legislation_action(
    text,
    text,
    text,
    jsonb,
    jsonb,
    text,
    jsonb
) IS
'Registra na auditoria as operações realizadas pelas RPCs do módulo de legislação.';

REVOKE ALL
ON FUNCTION app.audit_legislation_action(
    text,
    text,
    text,
    jsonb,
    jsonb,
    text,
    jsonb
)
FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- RPC PÚBLICA: LISTAR TIPOS ATIVOS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.legislation_list_types()
RETURNS TABLE (
    id uuid,
    code text,
    name text,
    plural_name text,
    description text,
    display_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
    SELECT
        document_type.id,
        document_type.code,
        document_type.name,
        document_type.plural_name,
        document_type.description,
        document_type.display_order
    FROM app.legislation_document_types AS document_type
    WHERE document_type.is_active = true
    ORDER BY
        document_type.display_order,
        document_type.name;
$$;

COMMENT ON FUNCTION public.legislation_list_types() IS
'Lista os tipos ativos de atos normativos.';

REVOKE ALL
ON FUNCTION public.legislation_list_types()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.legislation_list_types()
TO anon, authenticated;

-- =============================================================================
-- RPC PÚBLICA: LISTAR ATOS PUBLICADOS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.legislation_list_published(
    p_type_code text DEFAULT NULL,
    p_year integer DEFAULT NULL,
    p_search text DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    type_code text,
    type_name text,
    type_plural_name text,
    number text,
    year integer,
    publication_date date,
    title text,
    summary text,
    description text,
    status text,
    file_path text,
    external_url text,
    published_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
    SELECT
        document.id,
        document_type.code,
        document_type.name,
        document_type.plural_name,
        document.number,
        document.year,
        document.publication_date,
        document.title,
        document.summary,
        document.description,
        document.status,
        document.file_path,
        document.external_url,
        document.published_at
    FROM app.legislation_documents AS document
    JOIN app.legislation_document_types AS document_type
      ON document_type.id = document.document_type_id
    WHERE document.is_published = true
      AND document_type.is_active = true
      AND (
          p_type_code IS NULL
          OR document_type.code = p_type_code
      )
      AND (
          p_year IS NULL
          OR document.year = p_year
      )
      AND (
          p_search IS NULL
          OR length(trim(p_search)) = 0
          OR to_tsvector(
              'portuguese',
              coalesce(document.title, '') || ' ' ||
              coalesce(document.summary, '') || ' ' ||
              coalesce(document.description, '') || ' ' ||
              document.number
          ) @@ websearch_to_tsquery('portuguese', trim(p_search))
      )
    ORDER BY
        document.publication_date DESC NULLS LAST,
        document.year DESC,
        document.number DESC;
$$;

COMMENT ON FUNCTION public.legislation_list_published(
    text,
    integer,
    text
) IS
'Lista e pesquisa os atos normativos publicados no portal institucional.';

REVOKE ALL
ON FUNCTION public.legislation_list_published(
    text,
    integer,
    text
)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.legislation_list_published(
    text,
    integer,
    text
)
TO anon, authenticated;

-- =============================================================================
-- RPC ADMINISTRATIVA: LISTAR DOCUMENTOS
-- =============================================================================

CREATE OR REPLACE FUNCTION public.legislation_admin_list_documents(
    p_type_code text DEFAULT NULL,
    p_year integer DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_is_published boolean DEFAULT NULL,
    p_search text DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    document_type_id uuid,
    type_code text,
    type_name text,
    number text,
    year integer,
    publication_date date,
    title text,
    summary text,
    description text,
    status text,
    file_path text,
    external_url text,
    is_published boolean,
    published_at timestamptz,
    created_by uuid,
    updated_by uuid,
    published_by uuid,
    created_at timestamptz,
    updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
BEGIN
    PERFORM app.require_legislation_permission(
        'legislation.documents.read'
    );

    RETURN QUERY
    SELECT
        document.id,
        document.document_type_id,
        document_type.code,
        document_type.name,
        document.number,
        document.year,
        document.publication_date,
        document.title,
        document.summary,
        document.description,
        document.status,
        document.file_path,
        document.external_url,
        document.is_published,
        document.published_at,
        document.created_by,
        document.updated_by,
        document.published_by,
        document.created_at,
        document.updated_at
    FROM app.legislation_documents AS document
    JOIN app.legislation_document_types AS document_type
      ON document_type.id = document.document_type_id
    WHERE (
        p_type_code IS NULL
        OR document_type.code = p_type_code
    )
      AND (
          p_year IS NULL
          OR document.year = p_year
      )
      AND (
          p_status IS NULL
          OR document.status = p_status
      )
      AND (
          p_is_published IS NULL
          OR document.is_published = p_is_published
      )
      AND (
          p_search IS NULL
          OR length(trim(p_search)) = 0
          OR document.number ILIKE '%' || trim(p_search) || '%'
          OR coalesce(document.title, '') ILIKE
             '%' || trim(p_search) || '%'
          OR document.summary ILIKE
             '%' || trim(p_search) || '%'
      )
    ORDER BY
        document.updated_at DESC,
        document.year DESC,
        document.number DESC;
END;
$$;

REVOKE ALL
ON FUNCTION public.legislation_admin_list_documents(
    text,
    integer,
    text,
    boolean,
    text
)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.legislation_admin_list_documents(
    text,
    integer,
    text,
    boolean,
    text
)
TO authenticated;

-- =============================================================================
-- RPC ADMINISTRATIVA: CONSULTAR UM DOCUMENTO
-- =============================================================================

CREATE OR REPLACE FUNCTION public.legislation_admin_get_document(
    p_document_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
DECLARE
    v_result jsonb;
BEGIN
    PERFORM app.require_legislation_permission(
        'legislation.documents.read'
    );

    SELECT jsonb_build_object(
        'id', document.id,
        'document_type_id', document.document_type_id,
        'type_code', document_type.code,
        'type_name', document_type.name,
        'number', document.number,
        'year', document.year,
        'publication_date', document.publication_date,
        'title', document.title,
        'summary', document.summary,
        'description', document.description,
        'status', document.status,
        'file_path', document.file_path,
        'external_url', document.external_url,
        'is_published', document.is_published,
        'published_at', document.published_at,
        'created_by', document.created_by,
        'updated_by', document.updated_by,
        'published_by', document.published_by,
        'created_at', document.created_at,
        'updated_at', document.updated_at
    )
    INTO v_result
    FROM app.legislation_documents AS document
    JOIN app.legislation_document_types AS document_type
      ON document_type.id = document.document_type_id
    WHERE document.id = p_document_id;

    IF v_result IS NULL THEN
        RAISE EXCEPTION
            'Documento legislativo não encontrado.'
            USING ERRCODE = 'P0002';
    END IF;

    RETURN v_result;
END;
$$;

REVOKE ALL
ON FUNCTION public.legislation_admin_get_document(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.legislation_admin_get_document(uuid)
TO authenticated;

-- =============================================================================
-- RPC ADMINISTRATIVA: CADASTRAR DOCUMENTO
-- =============================================================================

CREATE OR REPLACE FUNCTION public.legislation_create_document(
    p_document_type_id uuid,
    p_number text,
    p_year integer,
    p_summary text,
    p_publication_date date DEFAULT NULL,
    p_title text DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_status text DEFAULT 'in_force',
    p_file_path text DEFAULT NULL,
    p_external_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
DECLARE
    v_document app.legislation_documents%ROWTYPE;
BEGIN
    PERFORM app.require_legislation_permission(
        'legislation.documents.create'
    );

    IF p_document_type_id IS NULL THEN
        RAISE EXCEPTION
            'O tipo do ato normativo deve ser informado.';
    END IF;

    IF p_number IS NULL OR length(trim(p_number)) = 0 THEN
        RAISE EXCEPTION
            'O número do ato normativo deve ser informado.';
    END IF;

    IF p_summary IS NULL OR length(trim(p_summary)) = 0 THEN
        RAISE EXCEPTION
            'A ementa do ato normativo deve ser informada.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM app.legislation_document_types AS document_type
        WHERE document_type.id = p_document_type_id
          AND document_type.is_active = true
    ) THEN
        RAISE EXCEPTION
            'O tipo de ato normativo informado não existe ou está inativo.';
    END IF;

    INSERT INTO app.legislation_documents (
        document_type_id,
        number,
        year,
        publication_date,
        title,
        summary,
        description,
        status,
        file_path,
        external_url,
        is_published,
        created_by,
        updated_by
    )
    VALUES (
        p_document_type_id,
        trim(p_number),
        p_year,
        p_publication_date,
        nullif(trim(p_title), ''),
        trim(p_summary),
        nullif(trim(p_description), ''),
        p_status,
        nullif(trim(p_file_path), ''),
        nullif(trim(p_external_url), ''),
        false,
        auth.uid(),
        auth.uid()
    )
    RETURNING *
    INTO v_document;

    PERFORM app.audit_legislation_action(
        p_action => 'create',
        p_entity_table => 'legislation_documents',
        p_entity_id => v_document.id::text,
        p_new_data => to_jsonb(v_document),
        p_metadata => jsonb_build_object(
            'permission',
            'legislation.documents.create'
        )
    );

    RETURN to_jsonb(v_document);
END;
$$;

REVOKE ALL
ON FUNCTION public.legislation_create_document(
    uuid,
    text,
    integer,
    text,
    date,
    text,
    text,
    text,
    text,
    text
)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.legislation_create_document(
    uuid,
    text,
    integer,
    text,
    date,
    text,
    text,
    text,
    text,
    text
)
TO authenticated;

-- =============================================================================
-- RPC ADMINISTRATIVA: ATUALIZAR DOCUMENTO
-- =============================================================================

CREATE OR REPLACE FUNCTION public.legislation_update_document(
    p_document_id uuid,
    p_document_type_id uuid,
    p_number text,
    p_year integer,
    p_summary text,
    p_publication_date date DEFAULT NULL,
    p_title text DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_status text DEFAULT 'in_force',
    p_file_path text DEFAULT NULL,
    p_external_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
DECLARE
    v_old_document app.legislation_documents%ROWTYPE;
    v_new_document app.legislation_documents%ROWTYPE;
BEGIN
    PERFORM app.require_legislation_permission(
        'legislation.documents.update'
    );

    SELECT *
    INTO v_old_document
    FROM app.legislation_documents
    WHERE id = p_document_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Documento legislativo não encontrado.'
            USING ERRCODE = 'P0002';
    END IF;

    IF p_document_type_id IS NULL THEN
        RAISE EXCEPTION
            'O tipo do ato normativo deve ser informado.';
    END IF;

    IF p_number IS NULL OR length(trim(p_number)) = 0 THEN
        RAISE EXCEPTION
            'O número do ato normativo deve ser informado.';
    END IF;

    IF p_summary IS NULL OR length(trim(p_summary)) = 0 THEN
        RAISE EXCEPTION
            'A ementa do ato normativo deve ser informada.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM app.legislation_document_types AS document_type
        WHERE document_type.id = p_document_type_id
          AND document_type.is_active = true
    ) THEN
        RAISE EXCEPTION
            'O tipo de ato normativo informado não existe ou está inativo.';
    END IF;

    UPDATE app.legislation_documents
    SET
        document_type_id = p_document_type_id,
        number = trim(p_number),
        year = p_year,
        publication_date = p_publication_date,
        title = nullif(trim(p_title), ''),
        summary = trim(p_summary),
        description = nullif(trim(p_description), ''),
        status = p_status,
        file_path = nullif(trim(p_file_path), ''),
        external_url = nullif(trim(p_external_url), ''),
        updated_by = auth.uid()
    WHERE id = p_document_id
    RETURNING *
    INTO v_new_document;

    PERFORM app.audit_legislation_action(
        p_action => 'update',
        p_entity_table => 'legislation_documents',
        p_entity_id => v_new_document.id::text,
        p_old_data => to_jsonb(v_old_document),
        p_new_data => to_jsonb(v_new_document),
        p_metadata => jsonb_build_object(
            'permission',
            'legislation.documents.update'
        )
    );

    RETURN to_jsonb(v_new_document);
END;
$$;

REVOKE ALL
ON FUNCTION public.legislation_update_document(
    uuid,
    uuid,
    text,
    integer,
    text,
    date,
    text,
    text,
    text,
    text,
    text
)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.legislation_update_document(
    uuid,
    uuid,
    text,
    integer,
    text,
    date,
    text,
    text,
    text,
    text,
    text
)
TO authenticated;

-- =============================================================================
-- RPC ADMINISTRATIVA: PUBLICAR OU DESPUBLICAR
-- =============================================================================

CREATE OR REPLACE FUNCTION public.legislation_set_publication(
    p_document_id uuid,
    p_publish boolean,
    p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
DECLARE
    v_old_document app.legislation_documents%ROWTYPE;
    v_new_document app.legislation_documents%ROWTYPE;
    v_action text;
BEGIN
    PERFORM app.require_legislation_permission(
        'legislation.documents.publish'
    );

    IF p_publish IS NULL THEN
        RAISE EXCEPTION
            'A situação da publicação deve ser informada.';
    END IF;

    SELECT *
    INTO v_old_document
    FROM app.legislation_documents
    WHERE id = p_document_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Documento legislativo não encontrado.'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_old_document.is_published = p_publish THEN
        RETURN to_jsonb(v_old_document);
    END IF;

    UPDATE app.legislation_documents
    SET
        is_published = p_publish,
        updated_by = auth.uid()
    WHERE id = p_document_id
    RETURNING *
    INTO v_new_document;

    v_action := CASE
        WHEN p_publish THEN 'publish'
        ELSE 'unpublish'
    END;

    PERFORM app.audit_legislation_action(
        p_action => v_action,
        p_entity_table => 'legislation_documents',
        p_entity_id => v_new_document.id::text,
        p_old_data => to_jsonb(v_old_document),
        p_new_data => to_jsonb(v_new_document),
        p_reason => nullif(trim(p_reason), ''),
        p_metadata => jsonb_build_object(
            'permission',
            'legislation.documents.publish'
        )
    );

    RETURN to_jsonb(v_new_document);
END;
$$;

REVOKE ALL
ON FUNCTION public.legislation_set_publication(
    uuid,
    boolean,
    text
)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.legislation_set_publication(
    uuid,
    boolean,
    text
)
TO authenticated;

-- =============================================================================
-- RPC ADMINISTRATIVA: EXCLUIR RASCUNHO
-- =============================================================================

CREATE OR REPLACE FUNCTION public.legislation_delete_draft(
    p_document_id uuid,
    p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
DECLARE
    v_old_document app.legislation_documents%ROWTYPE;
BEGIN
    PERFORM app.require_legislation_permission(
        'legislation.documents.delete'
    );

    IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
        RAISE EXCEPTION
            'Informe uma justificativa de exclusão com pelo menos cinco caracteres.';
    END IF;

    SELECT *
    INTO v_old_document
    FROM app.legislation_documents
    WHERE id = p_document_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Documento legislativo não encontrado.'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_old_document.is_published = true THEN
        RAISE EXCEPTION
            'Um documento publicado deve ser despublicado antes da exclusão.';
    END IF;

    DELETE FROM app.legislation_documents
    WHERE id = p_document_id;

    PERFORM app.audit_legislation_action(
        p_action => 'delete',
        p_entity_table => 'legislation_documents',
        p_entity_id => v_old_document.id::text,
        p_old_data => to_jsonb(v_old_document),
        p_reason => trim(p_reason),
        p_metadata => jsonb_build_object(
            'permission',
            'legislation.documents.delete',
            'file_path',
            v_old_document.file_path
        )
    );

    RETURN true;
END;
$$;

REVOKE ALL
ON FUNCTION public.legislation_delete_draft(
    uuid,
    text
)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.legislation_delete_draft(
    uuid,
    text
)
TO authenticated;

COMMIT;