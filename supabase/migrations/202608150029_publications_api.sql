BEGIN;

CREATE OR REPLACE FUNCTION app.require_publications_permission(p_permission_code text)
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
    RAISE EXCEPTION 'O usuário não possui a permissão necessária: %.', p_permission_code USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION app.require_publications_permission(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.publications_public_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
  SELECT jsonb_build_object(
    'meta', jsonb_build_object(
      'schema_version', 1,
      'updated_at', to_char(GREATEST(
        COALESCE((SELECT max(updated_at) FROM app.publication_documents WHERE is_published), '-infinity'::timestamptz),
        COALESCE((SELECT max(updated_at) FROM app.publication_bodies), '-infinity'::timestamptz),
        COALESCE((SELECT max(updated_at) FROM app.publication_members WHERE is_active), '-infinity'::timestamptz),
        COALESCE((SELECT max(updated_at) FROM app.publication_meetings WHERE is_published), '-infinity'::timestamptz),
        COALESCE((SELECT max(updated_at) FROM app.publication_audiences WHERE is_published), '-infinity'::timestamptz)
      ), 'YYYY-MM-DD')
    ),
    'documents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', document.public_id,
        'database_id', document.id,
        'category', document.category,
        'title', document.title,
        'description', document.description,
        'reference_year', document.reference_year,
        'publication_date', document.publication_date,
        'version_label', document.version_label,
        'status', document.status,
        'file_path', document.file_path,
        'external_url', document.external_url,
        'issued_at', document.issued_at,
        'valid_until', document.valid_until,
        'display_order', document.display_order,
        'is_published', document.is_published
      ) ORDER BY document.category, document.display_order, document.reference_year DESC NULLS LAST)
      FROM app.publication_documents AS document
      WHERE document.is_published = true
    ), '[]'::jsonb),
    'bodies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'code', body.code,
        'name', body.name,
        'periodicity', body.periodicity,
        'status', body.status,
        'official_url', body.official_url,
        'last_updated', body.last_reviewed_on,
        'display_order', body.display_order
      ) ORDER BY body.display_order)
      FROM app.publication_bodies AS body
    ), '[]'::jsonb),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', member.public_id,
        'database_id', member.id,
        'body_code', member.body_code,
        'name', member.name,
        'role', member.role,
        'image_path', member.image_path,
        'start_date', member.start_date,
        'end_date', member.end_date,
        'is_active', member.is_active,
        'display_order', member.display_order
      ) ORDER BY member.body_code, member.display_order)
      FROM app.publication_members AS member
      WHERE member.is_active = true
    ), '[]'::jsonb),
    'meetings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', meeting.public_id,
        'database_id', meeting.id,
        'body_code', meeting.body_code,
        'year', meeting.reference_year,
        'meeting_date', meeting.meeting_date,
        'meeting_type', meeting.meeting_type,
        'agenda', meeting.agenda,
        'expected_result', meeting.expected_result,
        'is_published', meeting.is_published
      ) ORDER BY meeting.reference_year DESC, meeting.meeting_date)
      FROM app.publication_meetings AS meeting
      WHERE meeting.is_published = true
    ), '[]'::jsonb),
    'audiences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', audience.public_id,
        'database_id', audience.id,
        'year', audience.reference_year,
        'title', audience.title,
        'event_date', audience.event_date,
        'description', audience.description,
        'youtube_url', audience.youtube_url,
        'is_published', audience.is_published
      ) ORDER BY audience.reference_year DESC)
      FROM app.publication_audiences AS audience
      WHERE audience.is_published = true
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.publications_public_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publications_public_snapshot() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.publications_admin_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
BEGIN
  PERFORM app.require_publications_permission('publications.read');
  RETURN jsonb_build_object(
    'documents', COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.category, d.reference_year DESC NULLS LAST, d.display_order) FROM app.publication_documents d), '[]'::jsonb),
    'bodies', COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.display_order) FROM app.publication_bodies b), '[]'::jsonb),
    'members', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.body_code, m.display_order) FROM app.publication_members m), '[]'::jsonb),
    'meetings', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.reference_year DESC, m.meeting_date) FROM app.publication_meetings m), '[]'::jsonb),
    'audiences', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.reference_year DESC) FROM app.publication_audiences a), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publications_admin_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publications_admin_snapshot() TO authenticated;

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
BEGIN
  PERFORM app.require_publications_permission(CASE WHEN p_id IS NULL THEN 'publications.create' ELSE 'publications.update' END);
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION 'Dados inválidos.'; END IF;
  IF num_nonnulls(v_file_path, v_external_url) <> 1 THEN RAISE EXCEPTION 'Informe um PDF ou um endereço externo.'; END IF;

  IF v_status = 'current' AND v_category <> 'certificate' THEN
    UPDATE app.publication_documents
       SET status = 'historical', updated_by = auth.uid()
     WHERE category = v_category AND status = 'current' AND (p_id IS NULL OR id <> p_id);
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO app.publication_documents (
      public_id, category, title, description, reference_year, publication_date,
      version_label, status, file_path, external_url, issued_at, valid_until,
      display_order, created_by, updated_by
    ) VALUES (
      trim(p_payload->>'public_id'), v_category, trim(p_payload->>'title'),
      nullif(trim(p_payload->>'description'), ''),
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

CREATE OR REPLACE FUNCTION public.publications_admin_set_document_publication(p_id uuid, p_publish boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
BEGIN
  PERFORM app.require_publications_permission('publications.publish');
  UPDATE app.publication_documents SET
    is_published = p_publish,
    published_at = CASE WHEN p_publish THEN now() ELSE NULL END,
    published_by = CASE WHEN p_publish THEN auth.uid() ELSE NULL END,
    updated_by = auth.uid()
  WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Publicação não encontrada.'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.publications_admin_save_member(p_id uuid, p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM app.require_publications_permission(CASE WHEN p_id IS NULL THEN 'publications.create' ELSE 'publications.update' END);
  IF p_id IS NULL THEN
    INSERT INTO app.publication_members (public_id, body_code, name, role, image_path, start_date, end_date, is_active, display_order)
    VALUES (
      trim(p_payload->>'public_id'), trim(p_payload->>'body_code'), trim(p_payload->>'name'), trim(p_payload->>'role'),
      nullif(trim(p_payload->>'image_path'), ''), nullif(p_payload->>'start_date','')::date,
      nullif(p_payload->>'end_date','')::date, COALESCE((p_payload->>'is_active')::boolean, true),
      COALESCE(nullif(p_payload->>'display_order','')::integer, 0)
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE app.publication_members SET
      body_code = trim(p_payload->>'body_code'), name = trim(p_payload->>'name'),
      role = trim(p_payload->>'role'), image_path = nullif(trim(p_payload->>'image_path'), ''),
      start_date = nullif(p_payload->>'start_date','')::date, end_date = nullif(p_payload->>'end_date','')::date,
      is_active = COALESCE((p_payload->>'is_active')::boolean, true),
      display_order = COALESCE(nullif(p_payload->>'display_order','')::integer, 0)
    WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Membro não encontrado.'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.publications_admin_save_meeting(p_id uuid, p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
DECLARE v_id uuid; v_date date := (p_payload->>'meeting_date')::date;
BEGIN
  PERFORM app.require_publications_permission(CASE WHEN p_id IS NULL THEN 'publications.create' ELSE 'publications.update' END);
  IF p_id IS NULL THEN
    INSERT INTO app.publication_meetings (public_id, body_code, reference_year, meeting_date, meeting_type, agenda, expected_result, is_published)
    VALUES (
      trim(p_payload->>'public_id'), trim(p_payload->>'body_code'), EXTRACT(YEAR FROM v_date)::integer,
      v_date, trim(p_payload->>'meeting_type'), trim(p_payload->>'agenda'),
      nullif(trim(p_payload->>'expected_result'), ''), COALESCE((p_payload->>'is_published')::boolean, false)
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE app.publication_meetings SET
      body_code = trim(p_payload->>'body_code'), reference_year = EXTRACT(YEAR FROM v_date)::integer,
      meeting_date = v_date, meeting_type = trim(p_payload->>'meeting_type'),
      agenda = trim(p_payload->>'agenda'), expected_result = nullif(trim(p_payload->>'expected_result'), ''),
      is_published = COALESCE((p_payload->>'is_published')::boolean, false)
    WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Reunião não encontrada.'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.publications_admin_save_audience(p_id uuid, p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM app.require_publications_permission(CASE WHEN p_id IS NULL THEN 'publications.create' ELSE 'publications.update' END);
  IF p_id IS NULL THEN
    INSERT INTO app.publication_audiences (public_id, reference_year, title, event_date, description, youtube_url, is_published)
    VALUES (
      trim(p_payload->>'public_id'), (p_payload->>'reference_year')::integer, trim(p_payload->>'title'),
      nullif(p_payload->>'event_date','')::date, nullif(trim(p_payload->>'description'), ''),
      trim(p_payload->>'youtube_url'), COALESCE((p_payload->>'is_published')::boolean, false)
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE app.publication_audiences SET
      reference_year = (p_payload->>'reference_year')::integer, title = trim(p_payload->>'title'),
      event_date = nullif(p_payload->>'event_date','')::date, description = nullif(trim(p_payload->>'description'), ''),
      youtube_url = trim(p_payload->>'youtube_url'), is_published = COALESCE((p_payload->>'is_published')::boolean, false)
    WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Audiência não encontrada.'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.publications_admin_update_body(p_code text, p_status text, p_official_url text, p_last_reviewed_on date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
BEGIN
  PERFORM app.require_publications_permission('publications.update');
  UPDATE app.publication_bodies SET
    status = p_status, official_url = nullif(trim(p_official_url), ''),
    last_reviewed_on = p_last_reviewed_on
  WHERE code = p_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'Colegiado não encontrado.'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.publications_admin_delete(p_entity text, p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
BEGIN
  PERFORM app.require_publications_permission('publications.delete');
  CASE p_entity
    WHEN 'document' THEN
      DELETE FROM app.publication_documents WHERE id = p_id AND is_published = false;
    WHEN 'meeting' THEN
      DELETE FROM app.publication_meetings WHERE id = p_id AND is_published = false;
    WHEN 'audience' THEN
      DELETE FROM app.publication_audiences WHERE id = p_id AND is_published = false;
    ELSE
      RAISE EXCEPTION 'Tipo de registro inválido.';
  END CASE;
  IF NOT FOUND THEN RAISE EXCEPTION 'O registro deve estar despublicado antes da exclusão.'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.publications_admin_save_document(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publications_admin_set_document_publication(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publications_admin_save_member(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publications_admin_save_meeting(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publications_admin_save_audience(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publications_admin_update_body(text, text, text, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publications_admin_delete(text, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.publications_admin_save_document(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publications_admin_set_document_publication(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publications_admin_save_member(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publications_admin_save_meeting(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publications_admin_save_audience(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publications_admin_update_body(text, text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publications_admin_delete(text, uuid) TO authenticated;

COMMIT;

