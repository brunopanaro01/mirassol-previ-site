BEGIN;

-- As capacitações integram o módulo Publicações, assim como composição,
-- agenda e audiências, e reutilizam as permissões já atribuídas a esse módulo.

CREATE TABLE app.education_training_activities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id text NOT NULL UNIQUE,
    reference_year integer NOT NULL,
    course_title text NOT NULL,
    location text NOT NULL,
    planned_start text NOT NULL,
    planned_end text NOT NULL,
    participants text NOT NULL,
    objective text NOT NULL,
    estimated_cost text,
    workload text NOT NULL,
    status text NOT NULL,
    display_order integer NOT NULL DEFAULT 0,
    is_published boolean NOT NULL DEFAULT false,
    published_at timestamptz,
    published_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    archived_at timestamptz,
    archived_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT education_training_public_id_chk
        CHECK (public_id ~ '^edu-[0-9]{4}-[0-9]{3,}$'),
    CONSTRAINT education_training_year_chk
        CHECK (reference_year BETWEEN 2020 AND 2200),
    CONSTRAINT education_training_title_chk
        CHECK (length(trim(course_title)) BETWEEN 3 AND 300),
    CONSTRAINT education_training_location_chk
        CHECK (length(trim(location)) BETWEEN 2 AND 200),
    CONSTRAINT education_training_period_chk
        CHECK (length(trim(planned_start)) BETWEEN 2 AND 80
           AND length(trim(planned_end)) BETWEEN 2 AND 80),
    CONSTRAINT education_training_participants_chk
        CHECK (length(trim(participants)) BETWEEN 2 AND 500),
    CONSTRAINT education_training_objective_chk
        CHECK (length(trim(objective)) BETWEEN 3 AND 1500),
    CONSTRAINT education_training_cost_chk
        CHECK (estimated_cost IS NULL OR length(trim(estimated_cost)) <= 100),
    CONSTRAINT education_training_workload_chk
        CHECK (length(trim(workload)) BETWEEN 1 AND 80),
    CONSTRAINT education_training_status_chk
        CHECK (status IN (
            'A AGENDAR',
            'EM ANDAMENTO',
            'REALIZADO',
            'NÃO REALIZADO',
            'CANCELADO'
        )),
    CONSTRAINT education_training_order_chk
        CHECK (display_order BETWEEN 0 AND 10000),
    CONSTRAINT education_training_publication_chk
        CHECK (
            (is_published AND published_at IS NOT NULL)
            OR (NOT is_published AND published_at IS NULL)
        ),
    CONSTRAINT education_training_archiving_chk
        CHECK (
            (archived_at IS NULL AND archived_by IS NULL)
            OR archived_at IS NOT NULL
        )
);

COMMENT ON TABLE app.education_training_activities IS
'Ações de capacitação e educação previdenciária exibidas no portal de Transparência.';

CREATE INDEX education_training_public_idx
ON app.education_training_activities (reference_year DESC, display_order, course_title)
WHERE is_published = true AND archived_at IS NULL;

CREATE TRIGGER trg_education_training_updated_at
BEFORE UPDATE ON app.education_training_activities
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.education_training_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.education_training_activities FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE app.education_training_activities
FROM PUBLIC, anon, authenticated;

CREATE POLICY education_training_select_authorized
ON app.education_training_activities
FOR SELECT TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('publications.read')
);

CREATE POLICY education_training_insert_authorized
ON app.education_training_activities
FOR INSERT TO authenticated
WITH CHECK (
    app.is_admin()
    OR app.has_permission('publications.create')
);

CREATE POLICY education_training_update_authorized
ON app.education_training_activities
FOR UPDATE TO authenticated
USING (
    app.is_admin()
    OR app.has_permission('publications.update')
    OR app.has_permission('publications.publish')
    OR app.has_permission('publications.delete')
)
WITH CHECK (
    app.is_admin()
    OR app.has_permission('publications.update')
    OR app.has_permission('publications.publish')
    OR app.has_permission('publications.delete')
);

-- Migra integralmente o arquivo educacao.json. O JSON permanece como
-- contingência do portal e deixa de exigir atualização manual.
INSERT INTO app.education_training_activities (
    public_id,
    reference_year,
    course_title,
    location,
    planned_start,
    planned_end,
    participants,
    objective,
    estimated_cost,
    workload,
    status,
    display_order,
    is_published,
    published_at
)
SELECT
    format('edu-%s-%s', year_group.reference_year, lpad(activity.ordinality::text, 3, '0')),
    year_group.reference_year::integer,
    trim(activity.item->>'O QUE (CURSO)'),
    trim(activity.item->>'ONDE'),
    trim(activity.item->>'INÍCIO PREVISTO'),
    trim(activity.item->>'FIM PREVISTO'),
    trim(activity.item->>'PARTICIPANTES'),
    trim(activity.item->>'OBJETIVO'),
    NULLIF(trim(activity.item->>'QUANTO? (CUSTO ESTIMADO)'), ''),
    trim(activity.item->>'CARGA HORÁRIA'),
    trim(activity.item->>'STATUS'),
    activity.ordinality::integer,
    true,
    now()
FROM jsonb_each($education${"2025":[{"O QUE (CURSO)":"Censo Cadastral Previdenciário (Turma NOV/2025)","ONDE":"EAD","INÍCIO PREVISTO":"Janeiro","FIM PREVISTO":"Novembro","PARTICIPANTES":"Membros do conselho previdenciario e comite de investimento","OBJETIVO":"Conhecimento em fases do Planejamento do censo cadastral previdenciário","CARGA HORÁRIA":"30h","STATUS":"REALIZADO"},{"O QUE (CURSO)":"Direito e Processo Previdenciário","ONDE":"EAD","INÍCIO PREVISTO":"Abril/2024","FIM PREVISTO":"Fevereiro/2025","PARTICIPANTES":"Gestores De Rpps","OBJETIVO":"O objetivo principal é capacitar os profissionais para compreender e aplicar as normas previdenciárias no âmbito dos regimes próprios","CARGA HORÁRIA":"360h","STATUS":"REALIZADO"},{"O QUE (CURSO)":"RPPS de Excelência: Pró-Gestão e Investimento na Prática","ONDE":"PRESENCIAL","INÍCIO PREVISTO":"Junho","FIM PREVISTO":"Junho","PARTICIPANTES":"Servidores da Área Previdenciária","OBJETIVO":"Implantação do Nível de Acesso ao Pró-Gestão RPPS- Desenvolvimento dos documentos necessários para atendimento das Ações exigidas de cada Dimensão do Manual Pró-Gestão ","CARGA HORÁRIA":"24h","STATUS":"REALIZADO"},{"O QUE (CURSO)":"CURSO PRÁTICO SOBRE O PPP E LTCAT PARA A ADMINISTRAÇÃO PÚBLICA","ONDE":"PRESENCIAL","INÍCIO PREVISTO":"Junho","FIM PREVISTO":"Junho","PARTICIPANTES":"Gestores De Rpps","OBJETIVO":"Aprimorar conhecimentos na área afim","CARGA HORÁRIA":"16h","STATUS":"REALIZADO"},{"O QUE (CURSO)":"Encontro de Gestores de RPPS do Estado de Mato Grosso e o 2° Encontro da Região Centro Oeste.","ONDE":"PRESENCIAL","INÍCIO PREVISTO":"Outubro","FIM PREVISTO":"Outubro","PARTICIPANTES":"Gestores De Rpps","OBJETIVO":"Formação básica em RPPS para os servidores;","CARGA HORÁRIA":"16h","STATUS":"REALIZADO"},{"O QUE (CURSO)":"Certificação do Responsavel pela gestão de recursos e membros do comitê de investimento do RPPS. CP RPPS CGINV I","ONDE":"PRESENCIAL","INÍCIO PREVISTO":"Novembro","FIM PREVISTO":"Novembro","PARTICIPANTES":"Comitê de Investimento","OBJETIVO":"Atendimento ao Pró-Gestão","CARGA HORÁRIA":"2h30","STATUS":"REALIZADO"},{"O QUE (CURSO)":"Demonstrativo de Investimentos do RPPS - DAIR E DPIN (Turma NOV/2025)","ONDE":"EAD","INÍCIO PREVISTO":"Novembro","FIM PREVISTO":"Novembro","PARTICIPANTES":"Presidente do Comitê Investimento","OBJETIVO":"Preenchimento do DAIR e DPIN/ Informações gerais","CARGA HORÁRIA":"30h","STATUS":"REALIZADO"},{"O QUE (CURSO)":"Aposentadoria e Pensão de servidores: Atualizações conforme Emenda 103/2019 (Turma NOV/2025)","ONDE":"EAD","INÍCIO PREVISTO":"Novembro","FIM PREVISTO":"Novembro","PARTICIPANTES":"Servidores da Área Previdenciária","OBJETIVO":"Formação básica em RPPS para os servidores","CARGA HORÁRIA":"25h","STATUS":"REALIZADO"}],"2026":[{"O QUE (CURSO)":"CURSOS na area previdenciaria e de investimento para RPPS","ONDE":"EAD","INÍCIO PREVISTO":"Janeiro","FIM PREVISTO":"Novembro","PARTICIPANTES":"Membros do Conselho e do Comitê","OBJETIVO":"Aprimorar conhecimento sobre a area afim","QUANTO? (CUSTO ESTIMADO)":"","CARGA HORÁRIA":"30","STATUS":"EM ANDAMENTO"},{"O QUE (CURSO)":"Diálogo Previdenciário","ONDE":"SALA DE REUNIÕES - Educação","INÍCIO PREVISTO":"Janeiro","FIM PREVISTO":"Janeiro","PARTICIPANTES":"Segurados com aposentadoria prevista para 2026","OBJETIVO":"Orientar os segurados quanto aos procedimentos adotados na futura concessão do benefício","QUANTO? (CUSTO ESTIMADO)":"","CARGA HORÁRIA":"4h","STATUS":"NÃO REALIZADO"},{"O QUE (CURSO)":"Palestra sobre Educação Previdenciária: Conheça o Mirassol-Previ.","ONDE":"A definir","INÍCIO PREVISTO":"Fevereiro","FIM PREVISTO":"Fevereiro","PARTICIPANTES":"Servidores da Educação","OBJETIVO":"Promover educação previdenciária aos segurados ativos vinculados à Secretaria Municipal de Educação, ampliando a compreensão sobre o RPPS","QUANTO? (CUSTO ESTIMADO)":"","CARGA HORÁRIA":"2h","STATUS":"NÃO REALIZADO"},{"O QUE (CURSO)":"Produção e divulgação de vídeos educativos sobre regras previdenciárias no canal oficial do Mirassol-Previ no YouTube","ONDE":"YouTube","INÍCIO PREVISTO":"Fevereiro","FIM PREVISTO":"Setembro","PARTICIPANTES":"Servidores em geral","OBJETIVO":"Ampliar o alcance da educação previdenciária, garantindo que os segurados tenham acesso claro, acessível e permanente às informações sobre direitos e deveres previdenciários, independentemente de horário ou local, contribuindo para uma relação de transparência e consciência previdenciária","QUANTO? (CUSTO ESTIMADO)":"","CARGA HORÁRIA":"3h","STATUS":"A AGENDAR"},{"O QUE (CURSO)":"Curso Averbação de Tempo de Serviço/Contribuição","ONDE":"CUIABÁ-MT","INÍCIO PREVISTO":"Março","FIM PREVISTO":"Março","PARTICIPANTES":"Coordenador de Benefícios / Membro do Conselho Previdenciário","OBJETIVO":"Buscar conhecimento e atualização da Averbação do tempo de contribuição","QUANTO? (CUSTO ESTIMADO)":"R$ 4.560,00","CARGA HORÁRIA":"16H","STATUS":"REALIZADO"},{"O QUE (CURSO)":"Palestra sobre Educação Previdenciária: Conheça o Mirassol-Previ.","ONDE":"SAEMI","INÍCIO PREVISTO":"Julho","FIM PREVISTO":"Julho","PARTICIPANTES":"Servidores Ativos Do SAEMI","OBJETIVO":"Promover educação previdenciária aos segurados ativos vinculados ao SAEMI, ampliando a compreensão sobre o RPPS","QUANTO? (CUSTO ESTIMADO)":"","CARGA HORÁRIA":"2h","STATUS":"REALIZADO"},{"O QUE (CURSO)":"Atuária para não Atuários","ONDE":"Cáceres - MT","INÍCIO PREVISTO":"Abril","FIM PREVISTO":"Abril","PARTICIPANTES":"Diretor, Coordenador e Conselheiros","OBJETIVO":"Buscar conhecimento e atualização sobre Gestão Atuarial","QUANTO? (CUSTO ESTIMADO)":"","CARGA HORÁRIA":"8h","STATUS":"REALIZADO"},{"O QUE (CURSO)":"Palestra sobre Educação Previdenciária: Conheça o Mirassol-Previ.","ONDE":"SECRETARIA DE INFRAESTRUTURA","INÍCIO PREVISTO":"Maio","FIM PREVISTO":"Maio","PARTICIPANTES":"Servidores Ativos da Secretaria","OBJETIVO":"Promover educação previdenciária aos segurados ativos vinculados à Secretaria Municipal de Infraestrutura, ampliando a compreensão sobre o RPPS","QUANTO? (CUSTO ESTIMADO)":"","CARGA HORÁRIA":"2h","STATUS":"A AGENDAR"},{"O QUE (CURSO)":"1º Fórum de Prefeitos pelos RPPS de Mato Grosso","ONDE":"ESCOLA SUPERIOR DE CONTAS - TCE-MT","INÍCIO PREVISTO":"28/05/2026","FIM PREVISTO":"28/05/2026","PARTICIPANTES":"Prefeito, Diretor e Coordenador","OBJETIVO":"Melhorar o conhecimento sobre assuntos relacionados ao RPPS: investimento e Pró-Gestão","QUANTO? (CUSTO ESTIMADO)":"","CARGA HORÁRIA":"8h","STATUS":"REALIZADO"},{"O QUE (CURSO)":"59º Congresso Nacional da ABIPEM","ONDE":"Centro de Convenções de Natal/RN","INÍCIO PREVISTO":"10/06/2026","FIM PREVISTO":"12/06/2026","PARTICIPANTES":"Diretor, Coordenador e Presidente do Conselho","OBJETIVO":"adquirir conhecimentos sobre os diversos temas que cercam os RPPS, conhecer detalhadamente as alterações na Legislação e interagir com os especialistas mais renomados do Brasil.","QUANTO? (CUSTO ESTIMADO)":"","CARGA HORÁRIA":"18h","STATUS":"REALIZADO"},{"O QUE (CURSO)":"EVENTO: 13º Encontro de Gestores de RPPS do Estado de Mato Grosso","ONDE":"CUIABÁ-MT","INÍCIO PREVISTO":"Outubro","FIM PREVISTO":"Outubro","PARTICIPANTES":"Diretor, Coordenador, Conselheiros e Membros do Comitê","OBJETIVO":"Melhorar o conhecimento sobre o novo cenário dos RPPS","QUANTO? (CUSTO ESTIMADO)":"","CARGA HORÁRIA":"16","STATUS":"A AGENDAR"},{"O QUE (CURSO)":"3º Encontro da Região Centro Oeste","ONDE":"CAMPO GRANDE - MS","INÍCIO PREVISTO":"Outubro","FIM PREVISTO":"Outubro","PARTICIPANTES":"Diretor, Coordenador, Conselheiros e Membros do Comitê","OBJETIVO":"Aprimorar conhecimento sobre a area afim","QUANTO? (CUSTO ESTIMADO)":"","CARGA HORÁRIA":"16","STATUS":"A AGENDAR"},{"O QUE (CURSO)":"Capacitação para Certificação dos Membros Conselheiros","ONDE":"CUIABÁ-MT","INÍCIO PREVISTO":"Novembro","FIM PREVISTO":"Novembro","PARTICIPANTES":"Membros do Conselho e do Comitê (atualização)","OBJETIVO":"Capacitar-se para prova de certificação","QUANTO? (CUSTO ESTIMADO)":"","CARGA HORÁRIA":"20","STATUS":"A AGENDAR"}]}$education$::jsonb)
    AS year_group(reference_year, activities)
CROSS JOIN LATERAL jsonb_array_elements(year_group.activities)
    WITH ORDINALITY AS activity(item, ordinality)
ON CONFLICT (public_id) DO NOTHING;

-- =============================================================================
-- AUTORIA
-- =============================================================================

CREATE OR REPLACE FUNCTION app.prepare_education_training_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL
       AND session_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
        RAISE EXCEPTION 'Não foi possível identificar o usuário responsável.'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.created_by := COALESCE(NEW.created_by, v_user_id);
        NEW.updated_by := COALESCE(NEW.updated_by, v_user_id);
    ELSE
        NEW.updated_by := COALESCE(v_user_id, NEW.updated_by);
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.prepare_education_training_activity()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_prepare_education_training_activity
BEFORE INSERT OR UPDATE ON app.education_training_activities
FOR EACH ROW
EXECUTE FUNCTION app.prepare_education_training_activity();

-- =============================================================================
-- API PÚBLICA E ADMINISTRATIVA
-- =============================================================================

CREATE OR REPLACE FUNCTION public.education_public_training_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
    SELECT jsonb_build_object(
        'updated_at', to_char(COALESCE(max(activity.updated_at), now()), 'YYYY-MM-DD'),
        'activities',
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', activity.public_id,
                'reference_year', activity.reference_year,
                'course_title', activity.course_title,
                'location', activity.location,
                'planned_start', activity.planned_start,
                'planned_end', activity.planned_end,
                'participants', activity.participants,
                'objective', activity.objective,
                'estimated_cost', activity.estimated_cost,
                'workload', activity.workload,
                'status', activity.status,
                'display_order', activity.display_order
            )
            ORDER BY activity.reference_year DESC, activity.display_order, activity.course_title
        ), '[]'::jsonb)
    )
    FROM app.education_training_activities AS activity
    WHERE activity.is_published = true
      AND activity.archived_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.education_public_training_snapshot()
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.education_public_training_snapshot()
TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.education_admin_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
BEGIN
    PERFORM app.require_publications_permission('publications.read');

    RETURN jsonb_build_object(
        'activities', COALESCE((
            SELECT jsonb_agg(
                to_jsonb(activity)
                ORDER BY activity.reference_year DESC, activity.display_order, activity.course_title
            )
            FROM app.education_training_activities AS activity
            WHERE activity.archived_at IS NULL
        ), '[]'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.education_admin_snapshot()
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.education_admin_snapshot()
TO authenticated;

CREATE OR REPLACE FUNCTION public.education_admin_save_training(
    p_id uuid,
    p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
DECLARE
    v_id uuid;
    v_year integer;
    v_public_id text;
    v_display_order integer;
BEGIN
    PERFORM app.require_publications_permission(
        CASE WHEN p_id IS NULL
            THEN 'publications.create'
            ELSE 'publications.update'
        END
    );

    IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
        RAISE EXCEPTION 'Os dados da capacitação devem ser informados.';
    END IF;

    v_year := NULLIF(p_payload->>'reference_year', '')::integer;
    v_display_order := COALESCE(NULLIF(p_payload->>'display_order', '')::integer, 0);

    IF p_id IS NULL THEN
        PERFORM pg_advisory_xact_lock(
            hashtextextended('education_training:' || v_year::text, 0)
        );

        SELECT format(
            'edu-%s-%s',
            v_year,
            lpad((COALESCE(max(sequence_number), 0) + 1)::text, 3, '0')
        )
        INTO v_public_id
        FROM (
            SELECT substring(public_id FROM '([0-9]+)$')::integer AS sequence_number
            FROM app.education_training_activities
            WHERE reference_year = v_year
        ) AS year_sequences;

        INSERT INTO app.education_training_activities (
            public_id, reference_year, course_title, location, planned_start,
            planned_end, participants, objective, estimated_cost, workload,
            status, display_order, created_by, updated_by
        )
        VALUES (
            v_public_id,
            v_year,
            trim(p_payload->>'course_title'),
            trim(p_payload->>'location'),
            trim(p_payload->>'planned_start'),
            trim(p_payload->>'planned_end'),
            trim(p_payload->>'participants'),
            trim(p_payload->>'objective'),
            NULLIF(trim(p_payload->>'estimated_cost'), ''),
            trim(p_payload->>'workload'),
            trim(p_payload->>'status'),
            v_display_order,
            auth.uid(),
            auth.uid()
        )
        RETURNING id INTO v_id;
    ELSE
        UPDATE app.education_training_activities
        SET
            reference_year = v_year,
            course_title = trim(p_payload->>'course_title'),
            location = trim(p_payload->>'location'),
            planned_start = trim(p_payload->>'planned_start'),
            planned_end = trim(p_payload->>'planned_end'),
            participants = trim(p_payload->>'participants'),
            objective = trim(p_payload->>'objective'),
            estimated_cost = NULLIF(trim(p_payload->>'estimated_cost'), ''),
            workload = trim(p_payload->>'workload'),
            status = trim(p_payload->>'status'),
            display_order = v_display_order,
            updated_by = auth.uid()
        WHERE id = p_id
          AND archived_at IS NULL
        RETURNING id INTO v_id;

        IF v_id IS NULL THEN
            RAISE EXCEPTION 'Capacitação não encontrada.' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.education_admin_set_training_publication(
    p_id uuid,
    p_publish boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
BEGIN
    PERFORM app.require_publications_permission('publications.publish');

    UPDATE app.education_training_activities
    SET
        is_published = p_publish,
        published_at = CASE WHEN p_publish THEN now() ELSE NULL END,
        published_by = CASE WHEN p_publish THEN auth.uid() ELSE NULL END,
        updated_by = auth.uid()
    WHERE id = p_id
      AND archived_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Capacitação não encontrada.' USING ERRCODE = 'P0002';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.education_admin_delete_training(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth, app
AS $$
BEGIN
    PERFORM app.require_publications_permission('publications.delete');

    UPDATE app.education_training_activities
    SET
        is_published = false,
        published_at = NULL,
        published_by = NULL,
        archived_at = now(),
        archived_by = auth.uid(),
        updated_by = auth.uid()
    WHERE id = p_id
      AND archived_at IS NULL
      AND is_published = false;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'A capacitação deve estar despublicada antes de ser excluída.';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.education_admin_save_training(uuid, jsonb)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.education_admin_set_training_publication(uuid, boolean)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.education_admin_delete_training(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.education_admin_save_training(uuid, jsonb)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.education_admin_set_training_publication(uuid, boolean)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.education_admin_delete_training(uuid)
TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
