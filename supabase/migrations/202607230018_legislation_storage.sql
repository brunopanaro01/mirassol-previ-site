BEGIN;

-- =============================================================================
-- STORAGE DOS DOCUMENTOS DE LEGISLAÇÃO
-- =============================================================================
-- Bucket público para PDFs de leis, decretos, portarias e outros atos.
-- Upload, substituição e exclusão continuam protegidos por RLS.
-- =============================================================================

INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'legislation-documents',
    'legislation-documents',
    true,
    20971520,
    ARRAY['application/pdf']::text[]
)
ON CONFLICT (id)
DO UPDATE SET
    name = EXCLUDED.name,
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Limpeza preventiva das políticas desta migration
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS legislation_storage_select_public
ON storage.objects;

DROP POLICY IF EXISTS legislation_storage_insert_authorized
ON storage.objects;

DROP POLICY IF EXISTS legislation_storage_update_authorized
ON storage.objects;

DROP POLICY IF EXISTS legislation_storage_delete_authorized
ON storage.objects;

-- -----------------------------------------------------------------------------
-- Consulta dos objetos
-- -----------------------------------------------------------------------------

CREATE POLICY legislation_storage_select_public
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
    bucket_id = 'legislation-documents'
);

-- -----------------------------------------------------------------------------
-- Upload
-- -----------------------------------------------------------------------------
-- Formato obrigatório:
-- tipo/ano/nome-do-arquivo.pdf
--
-- Exemplos:
-- portarias/2026/portaria-005-2026.pdf
-- decretos/2025/decreto-5146-2025.pdf
-- leis/2016/lei-complementar-160-2016.pdf
-- -----------------------------------------------------------------------------

CREATE POLICY legislation_storage_insert_authorized
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'legislation-documents'
    AND (
        app.is_admin()
        OR app.has_permission('legislation.documents.create')
    )
    AND name ~* '^[a-z0-9_-]+/[0-9]{4}/[a-z0-9._-]+\.pdf$'
);

-- -----------------------------------------------------------------------------
-- Substituição ou movimentação
-- -----------------------------------------------------------------------------

CREATE POLICY legislation_storage_update_authorized
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'legislation-documents'
    AND (
        app.is_admin()
        OR app.has_permission('legislation.documents.update')
    )
)
WITH CHECK (
    bucket_id = 'legislation-documents'
    AND (
        app.is_admin()
        OR app.has_permission('legislation.documents.update')
    )
    AND name ~* '^[a-z0-9_-]+/[0-9]{4}/[a-z0-9._-]+\.pdf$'
);

-- -----------------------------------------------------------------------------
-- Exclusão
-- -----------------------------------------------------------------------------

CREATE POLICY legislation_storage_delete_authorized
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'legislation-documents'
    AND (
        app.is_admin()
        OR app.has_permission('legislation.documents.delete')
    )
);

COMMIT;