BEGIN;

-- =============================================================================
-- SEGURANÇA, RLS E PUBLICAÇÃO DO MÓDULO DE LEGISLAÇÃO
-- =============================================================================

-- -----------------------------------------------------------------------------
-- FUNÇÃO: preencher autoria e controlar publicação
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.prepare_legislation_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
DECLARE
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();

    -- Operações administrativas das migrations podem não possuir auth.uid().
    IF v_user_id IS NULL
       AND session_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
        RAISE EXCEPTION
            'Não foi possível identificar o usuário responsável pela operação.'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.created_by := COALESCE(NEW.created_by, v_user_id);
        NEW.updated_by := COALESCE(NEW.updated_by, v_user_id);
    ELSE
        NEW.updated_by := COALESCE(v_user_id, NEW.updated_by);
    END IF;

    -- Início da publicação.
    IF NEW.is_published = true
       AND (
           TG_OP = 'INSERT'
           OR OLD.is_published = false
       ) THEN

        IF v_user_id IS NOT NULL
           AND NOT (
               app.is_admin()
               OR app.has_permission('legislation.documents.publish')
           ) THEN
            RAISE EXCEPTION
                'O usuário não possui permissão para publicar atos normativos.'
                USING ERRCODE = '42501';
        END IF;

        NEW.published_at := COALESCE(NEW.published_at, now());
        NEW.published_by := COALESCE(NEW.published_by, v_user_id);
    END IF;

    -- Despublicação.
    IF TG_OP = 'UPDATE'
       AND OLD.is_published = true
       AND NEW.is_published = false THEN

        IF v_user_id IS NOT NULL
           AND NOT (
               app.is_admin()
               OR app.has_permission('legislation.documents.publish')
           ) THEN
            RAISE EXCEPTION
                'O usuário não possui permissão para despublicar atos normativos.'
                USING ERRCODE = '42501';
        END IF;

        NEW.published_at := NULL;
        NEW.published_by := NULL;
    END IF;

    -- Impede alteração manual dos metadados de publicação.
    IF TG_OP = 'UPDATE'
       AND NEW.is_published = OLD.is_published
       AND (
           NEW.published_at IS DISTINCT FROM OLD.published_at
           OR NEW.published_by IS DISTINCT FROM OLD.published_by
       )
       AND session_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
        RAISE EXCEPTION
            'Os metadados de publicação não podem ser alterados diretamente.'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION app.prepare_legislation_document() IS
'Preenche autoria, controla publicação e protege os metadados dos atos normativos.';

REVOKE ALL
ON FUNCTION app.prepare_legislation_document()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_prepare_legislation_document
BEFORE INSERT OR UPDATE
ON app.legislation_documents
FOR EACH ROW
EXECUTE FUNCTION app.prepare_legislation_document();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE app.legislation_document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.legislation_documents ENABLE ROW LEVEL SECURITY;

-- Obriga inclusive o proprietário comum a respeitar as políticas.
ALTER TABLE app.legislation_document_types FORCE ROW LEVEL SECURITY;
ALTER TABLE app.legislation_documents FORCE ROW LEVEL SECURITY;

-- =============================================================================
-- PRIVILÉGIOS
-- =============================================================================

-- O schema app não é exposto diretamente pela Data API, mas a permissão
-- é necessária para a view pública consultar seus objetos.

GRANT USAGE ON SCHEMA app TO anon, authenticated;

REVOKE ALL
ON TABLE app.legislation_document_types
FROM anon, authenticated;

REVOKE ALL
ON TABLE app.legislation_documents
FROM anon, authenticated;

GRANT SELECT
ON TABLE app.legislation_document_types
TO anon, authenticated;

GRANT SELECT
ON TABLE app.legislation_documents
TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE
ON TABLE app.legislation_document_types
TO authenticated;

GRANT INSERT, UPDATE, DELETE
ON TABLE app.legislation_documents
TO authenticated;

-- =============================================================================
-- POLÍTICAS: TIPOS DE DOCUMENTOS
-- =============================================================================

CREATE POLICY legislation_types_select_public
ON app.legislation_document_types
FOR SELECT
TO anon
USING (
    is_active = true
);

CREATE POLICY legislation_types_select_authenticated
ON app.legislation_document_types
FOR SELECT
TO authenticated
USING (
    is_active = true
    OR app.is_admin()
    OR app.has_permission('legislation.documents.read')
);

-- Inicialmente, somente administrador gerencia o catálogo de tipos.

CREATE POLICY legislation_types_insert_admin
ON app.legislation_document_types
FOR INSERT
TO authenticated
WITH CHECK (
    app.is_admin()
);

CREATE POLICY legislation_types_update_admin
ON app.legislation_document_types
FOR UPDATE
TO authenticated
USING (
    app.is_admin()
)
WITH CHECK (
    app.is_admin()
);

CREATE POLICY legislation_types_delete_admin
ON app.legislation_document_types
FOR DELETE
TO authenticated
USING (
    app.is_admin()
);

-- =============================================================================
-- POLÍTICAS: DOCUMENTOS
-- =============================================================================

-- Visitantes consultam exclusivamente atos publicados.

CREATE POLICY legislation_documents_select_public
ON app.legislation_documents
FOR SELECT
TO anon
USING (
    is_published = true
);

-- Usuário autorizado consulta documentos publicados e rascunhos.

CREATE POLICY legislation_documents_select_authenticated
ON app.legislation_documents
FOR SELECT
TO authenticated
USING (
    is_published = true
    OR app.is_admin()
    OR app.has_permission('legislation.documents.read')
);

CREATE POLICY legislation_documents_insert_authorized
ON app.legislation_documents
FOR INSERT
TO authenticated
WITH CHECK (
    app.is_admin()
    OR app.has_permission('legislation.documents.create')
);

CREATE POLICY legislation_documents_update_authorized
ON app.legislation_documents
FOR UPDATE
TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('legislation.documents.update')
    OR app.has_permission('legislation.documents.publish')
)
WITH CHECK (
    app.is_admin()
    OR app.has_permission('legislation.documents.update')
    OR app.has_permission('legislation.documents.publish')
);

-- Documento publicado deve ser despublicado antes da exclusão.

CREATE POLICY legislation_documents_delete_authorized
ON app.legislation_documents
FOR DELETE
TO authenticated
USING (
    is_published = false
    AND (
        app.is_admin()
        OR app.has_permission('legislation.documents.delete')
    )
);

-- =============================================================================
-- VIEW PÚBLICA PARA O PORTAL
-- =============================================================================
-- A página legislacao.html consultará esta view quando migrar do JSON para a API.

CREATE OR REPLACE VIEW public.published_legislation
WITH (security_invoker = true)
AS
SELECT
    document.id,
    document_type.code AS type_code,
    document_type.name AS type_name,
    document_type.plural_name AS type_plural_name,
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
  AND document_type.is_active = true;

COMMENT ON VIEW public.published_legislation IS
'Atos normativos publicados e disponíveis para consulta no portal institucional.';

REVOKE ALL
ON TABLE public.published_legislation
FROM PUBLIC;

GRANT SELECT
ON TABLE public.published_legislation
TO anon, authenticated;

COMMIT;