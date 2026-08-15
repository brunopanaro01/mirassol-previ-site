BEGIN;

INSERT INTO storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
VALUES (
    'publication-documents',
    'publication-documents',
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

DROP POLICY IF EXISTS publications_storage_insert_authorized ON storage.objects;
DROP POLICY IF EXISTS publications_storage_update_authorized ON storage.objects;
DROP POLICY IF EXISTS publications_storage_delete_authorized ON storage.objects;

-- Leitura não exige uma política de listagem: os arquivos publicados são
-- servidos pelas URLs públicas do bucket, enquanto a enumeração permanece
-- indisponível para visitantes.
CREATE POLICY publications_storage_insert_authorized
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'publication-documents'
    AND (
        app.is_admin()
        OR app.has_permission('publications.create')
    )
    AND name ~* '^[a-z0-9_-]+/[0-9]{4}/[a-z0-9._-]+\.pdf$'
);

CREATE POLICY publications_storage_update_authorized
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'publication-documents'
    AND (
        app.is_admin()
        OR app.has_permission('publications.update')
    )
)
WITH CHECK (
    bucket_id = 'publication-documents'
    AND (
        app.is_admin()
        OR app.has_permission('publications.update')
    )
    AND name ~* '^[a-z0-9_-]+/[0-9]{4}/[a-z0-9._-]+\.pdf$'
);

CREATE POLICY publications_storage_delete_authorized
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'publication-documents'
    AND (
        app.is_admin()
        OR app.has_permission('publications.delete')
    )
);

COMMIT;
