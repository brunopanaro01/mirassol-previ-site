BEGIN;

-- =============================================================================
-- ENDURECIMENTO DO STORAGE DE LEGISLAÇÃO
-- =============================================================================
-- O bucket permanece público para permitir a abertura direta dos PDFs.
-- A política ampla de SELECT é removida para impedir a listagem dos objetos
-- por clientes anônimos ou autenticados.
-- =============================================================================

DROP POLICY IF EXISTS legislation_storage_select_public
ON storage.objects;

COMMIT;