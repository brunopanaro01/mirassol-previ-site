BEGIN;

-- Avaliações periódicas são documentos independentes. A publicação de uma
-- nova avaliação não deve transformar as avaliações anteriores em histórico.
UPDATE app.publication_documents
SET category = 'action_plan_monitoring',
    status = 'current',
    updated_at = now()
WHERE public_id = 'document-avaliacao-agosto-2026-faf31035'
  AND category = 'action_plan';

UPDATE app.publication_documents
SET status = 'current',
    updated_at = now()
WHERE category = 'action_plan_monitoring'
  AND status <> 'current';

UPDATE app.publication_documents
SET status = 'current',
    updated_at = now()
WHERE public_id = 'plano-acao'
  AND category = 'action_plan';

CREATE OR REPLACE FUNCTION public.publications_admin_save_document(p_id uuid, p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
DECLARE
  v_id uuid;
  v_category text := trim(p_payload->>'category');
  v_status text := COALESCE(nullif(trim(p_payload->>'status'), ''), 'current');
  v_file_path text := nullif(trim(p_payload->>'file_path'), '');
  v_external_url text := nullif(trim(p_payload->>'external_url'), '');
  v_series_key text := nullif(trim(p_payload->>'series_key'), '');
BEGIN
  PERFORM app.require_publications_permission(CASE WHEN p_id IS NULL THEN 'publications.create' ELSE 'publications.update' END);
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION 'Dados inválidos.'; END IF;
  IF num_nonnulls(v_file_path, v_external_url) <> 1 THEN RAISE EXCEPTION 'Informe um PDF ou um endereço externo.'; END IF;
  IF v_category = 'guidance_booklet' AND v_series_key IS NULL THEN
    RAISE EXCEPTION 'Informe o grupo de versões da cartilha.';
  END IF;

  IF v_category = 'action_plan_monitoring' THEN
    v_status := 'current';
  END IF;

  IF v_status = 'current' AND v_category = 'guidance_booklet' THEN
    UPDATE app.publication_documents
       SET status = 'historical', updated_by = auth.uid()
     WHERE category = v_category
       AND series_key = v_series_key
       AND status = 'current'
       AND (p_id IS NULL OR id <> p_id);
  ELSIF v_status = 'current'
    AND v_category NOT IN ('certificate', 'action_plan_monitoring') THEN
    UPDATE app.publication_documents
       SET status = 'historical', updated_by = auth.uid()
     WHERE category = v_category
       AND status = 'current'
       AND (p_id IS NULL OR id <> p_id);
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO app.publication_documents (
      public_id, category, series_key, title, description, reference_year,
      publication_date, version_label, status, file_path, external_url,
      issued_at, valid_until, display_order, created_by, updated_by
    ) VALUES (
      trim(p_payload->>'public_id'), v_category, v_series_key,
      trim(p_payload->>'title'), nullif(trim(p_payload->>'description'), ''),
      nullif(p_payload->>'reference_year','')::integer,
      nullif(p_payload->>'publication_date','')::date,
      nullif(trim(p_payload->>'version_label'), ''), v_status,
      v_file_path, v_external_url,
      nullif(p_payload->>'issued_at','')::date,
      nullif(p_payload->>'valid_until','')::date,
      COALESCE(nullif(p_payload->>'display_order','')::integer, 0),
      auth.uid(), auth.uid()
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE app.publication_documents SET
      category = v_category,
      series_key = v_series_key,
      title = trim(p_payload->>'title'),
      description = nullif(trim(p_payload->>'description'), ''),
      reference_year = nullif(p_payload->>'reference_year','')::integer,
      publication_date = nullif(p_payload->>'publication_date','')::date,
      version_label = nullif(trim(p_payload->>'version_label'), ''),
      status = v_status,
      file_path = v_file_path,
      external_url = v_external_url,
      issued_at = nullif(p_payload->>'issued_at','')::date,
      valid_until = nullif(p_payload->>'valid_until','')::date,
      display_order = COALESCE(nullif(p_payload->>'display_order','')::integer, 0),
      updated_by = auth.uid()
    WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Publicação não encontrada.'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.publications_admin_save_document(uuid, jsonb)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publications_admin_save_document(uuid, jsonb)
TO authenticated;

COMMIT;
