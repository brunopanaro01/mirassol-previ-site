BEGIN;

-- Identifica de forma explícita os processos que podem alimentar o portal.
ALTER TABLE app.comprev_cases
ADD COLUMN portal_is_published boolean NOT NULL DEFAULT false,
ADD COLUMN source_benefit_key text;

COMMENT ON COLUMN app.comprev_cases.portal_is_published IS
'Autoriza a exibição exclusiva dos dados públicos do benefício no portal institucional.';

COMMENT ON COLUMN app.comprev_cases.source_benefit_key IS
'Identificador estável da publicação pública, independente do nome do beneficiário.';

CREATE UNIQUE INDEX comprev_cases_source_benefit_key_unique_idx
ON app.comprev_cases (source_benefit_key)
WHERE source_benefit_key IS NOT NULL;

-- Migra para o banco o catálogo que já era público em beneficios.json.
-- A URL do ato gera uma chave estável. Havendo processo COMPREV correspondente,
-- os dados públicos são anexados a ele; caso contrário, cria-se o cadastro-base.
CREATE TEMPORARY TABLE comprev_public_benefits_seed (
    benefit_year integer NOT NULL,
    benefit_month smallint NOT NULL,
    benefit_description text NOT NULL,
    grant_url text NOT NULL,
    tce_url text,
    beneficiary_name text NOT NULL,
    benefit_type text NOT NULL
) ON COMMIT DROP;

INSERT INTO comprev_public_benefits_seed (
    benefit_year,
    benefit_month,
    benefit_description,
    grant_url,
    tce_url,
    beneficiary_name,
    benefit_type
)
VALUES
    (2024, 12, 'Benefício Aposentadoria por incapacidade Permanente para o trabalho: Livardo Mendes da Rocha', 'https://drive.google.com/file/d/1ABIYaZve5w4kPYgsPUlMoyGJ90g9fEZB/view?usp=sharing', NULL, 'Livardo Mendes da Rocha', 'retirement'),
    (2024, 11, 'Benefício de pensão: Isleide Alves da Silva Gomes', 'https://drive.google.com/file/d/13sRb-BuC9Ze4oAXLqgaYj5X7TH2dY9yq/view?usp=sharing', NULL, 'Isleide Alves da Silva Gomes', 'pension'),
    (2024, 11, 'Benefício de aposentadoria por tempo de contribuição: Claudia Mara de Campos', 'https://drive.google.com/file/d/1Z5EQPBrig1SRiKwtNPH_yOgVyjk7A9Ys/view?usp=sharing', NULL, 'Claudia Mara de Campos', 'retirement'),
    (2024, 10, 'Benefício de aposentadoria por tempo de contribuição: Luciana Alves da Costa', 'https://drive.google.com/file/d/1dBQmtPmBVLZ2B7zQ8tkzi38kswdANDso/view?usp=sharing', NULL, 'Luciana Alves da Costa', 'retirement'),
    (2024, 8, 'Benefício de aposentadoria por tempo de contribuição: Antonio Rezende da Silva', 'https://drive.google.com/file/d/1yRMI0ZLh-NX3Wyu0SJTfezmjduKZQDuF/view?usp=sharing', NULL, 'Antonio Rezende da Silva', 'retirement'),
    (2024, 6, 'Benefício de aposentadoria por idade: Francisca Fatima Gomes de Matos', 'https://drive.google.com/file/d/1qR3Kj9gW_mu37NMCVZl50soyUX1zq8U1/view?usp=sharing', NULL, 'Francisca Fatima Gomes de Matos', 'retirement'),
    (2024, 4, 'Benefício de pensão: Isadora Araújo dos Reis e Marcelo de Souza Santana', 'https://drive.google.com/file/d/1vf61f9cyfn7wxTMjuYa4Lx7ok_JcMYyu/view?usp=sharing', NULL, 'Isadora Araújo dos Reis e Marcelo de Souza Santana', 'pension'),
    (2024, 4, 'Benefício de aposentadoria por tempo de contribuição: Rosimeire Aparecida de Almeida Oliveira', 'https://drive.google.com/file/d/1vhXLQVCNyrL_ooyIDJugChZ1EC3rS3GX/view?usp=sharing', NULL, 'Rosimeire Aparecida de Almeida Oliveira', 'retirement'),
    (2024, 1, 'Benefício de pensão: Rosalina Longo Machado', 'https://drive.google.com/file/d/1IBcZBnsT10FYFe3ZCL3xlbPXxRz0UuIQ/view?usp=sharing', NULL, 'Rosalina Longo Machado', 'pension'),
    (2024, 1, 'Benefício de aposentadoria por idade: Manoel Pereira Clube', 'https://drive.google.com/file/d/17cgdy_8ITqyc15snplxLvjHQCHLqU1VX/view?usp=sharing', NULL, 'Manoel Pereira Clube', 'retirement'),
    (2024, 1, 'Benefício de aposentadoria por tempo de contribuição: Miguel Francisco de Melo', 'https://drive.google.com/file/d/1F1SZiue2cDMVCnoIkUwLbz_dQj0ly6JQ/view?usp=sharing', NULL, 'Miguel Francisco de Melo', 'retirement'),
    (2025, 7, 'Benefício de aposentadoria por tempo de contribuição: Rinaldo Valenciano', 'https://drive.google.com/file/d/1uEOLmkHiaCslvN4o8Uh1KnDfbayJHIwm/view?usp=sharing', 'https://www.tce.mt.gov.br/processo/2076403/2025#/', 'Rinaldo Valenciano', 'retirement'),
    (2025, 3, 'Benefício de aposentadoria por tempo de contribuição: Elisangela Marques Faria', 'https://drive.google.com/file/d/16FKs6NaFu17mgUKDhN6hXnakBCpJPKfs/view?usp=sharing', 'https://www.tce.mt.gov.br/processo/2009544/2025#/', 'Elisangela Marques Faria', 'retirement'),
    (2026, 8, 'Benefício de pensão: Maria do Carmo Lima Taninado', 'https://drive.google.com/file/d/1SQr0wbXJnNc1HeM7Sqj3FsKvOUD_mt5g/view?usp=sharing', NULL, 'Maria do Carmo Lima Taninado', 'pension'),
    (2026, 8, 'Benefício de aposentadoria por tempo de contribuição: Manoel Jose Custodio', 'https://drive.google.com/file/d/1rrpx-7LJhk-0O1_as5K_ixf1ZaV_U5If/view?usp=sharing', NULL, 'Manoel Jose Custodio', 'retirement'),
    (2026, 7, 'Benefício de aposentadoria por tempo de contribuição: Fabiana Cassia Pereira dos Santos', 'https://drive.google.com/file/d/1pgwBrLA76X8O7BqSK_38aPz9PRl_MDiF/view?usp=sharing', NULL, 'Fabiana Cassia Pereira dos Santos', 'retirement'),
    (2026, 6, 'Benefício de aposentadoria por tempo de contribuição: Antônio Ramalho de Souza', 'https://drive.google.com/file/d/18Bdb8gfyHerPN5kkKVuTLbDOczM0vPeF/view?usp=sharing', 'https://www.tce.mt.gov.br/processo/2808471/2026#/', 'Antônio Ramalho de Souza', 'retirement'),
    (2026, 6, 'Benefício de aposentadoria por tempo de contribuição: Irene Oliveira Bazan', 'https://drive.google.com/file/d/13N09JwA_103_dm3u2DTBX9fKVA0_0imr/view?usp=sharing', 'https://www.tce.mt.gov.br/processo/2808900/2026#/', 'Irene Oliveira Bazan', 'retirement'),
    (2026, 5, 'Benefício de pensão: Joana Antônia de Faria', 'https://drive.google.com/file/d/1ChsW5pvDKCT1xhVqKteFJsBok4XG8Ad5/view?usp=sharing', 'https://www.tce.mt.gov.br/processo/2780933/2026', 'Joana Antônia de Faria', 'pension'),
    (2026, 5, 'Benefício de aposentadoria por tempo de contribuição: Vera Lucia Pereira Mandarino', 'https://drive.google.com/file/d/1Eze5BrW-k5zy6rQoLtaA337vACitSzb1/view?usp=sharing', 'https://www.tce.mt.gov.br/processo/2783576/2026', 'Vera Lucia Pereira Mandarino', 'retirement'),
    (2026, 4, 'Benefício de aposentadoria Compulsória: José de Paula', 'https://drive.google.com/file/d/14vIp509MulAQE5KA38c3hihEiadzazxn/view?usp=sharing', 'https://www.tce.mt.gov.br/processo/2775549/2026', 'José de Paula', 'retirement'),
    (2026, 4, 'Benefício de aposentadoria Compulsória: José Gonçalves Batista', 'https://drive.google.com/file/d/1igUF0Brtt-68Y7oF2aBxq7fWU9oLdGHT/view?usp=sharing', 'https://www.tce.mt.gov.br/processo/2780607/2026', 'José Gonçalves Batista', 'retirement'),
    (2026, 3, 'Benefício de aposentadoria por tempo de contribuição: Sandra Guerreiro Soares Faria', 'https://drive.google.com/file/d/1DUtBX09QMp3xiZ5L_HXFqjDyk2vyuEmQ/view?usp=sharing', 'https://www.tce.mt.gov.br/processo/2762692/2026', 'Sandra Guerreiro Soares Faria', 'retirement'),
    (2026, 2, 'Benefício de aposentadoria por tempo de contribuição: Maria Eliane Pinheiro Cunha', 'https://drive.google.com/file/d/1NYQz0zvPopXkOuXLyPzie4SGpc7l6prs/view?usp=sharing', 'https://www.tce.mt.gov.br/processo/2755629/2026', 'Maria Eliane Pinheiro Cunha', 'retirement'),
    (2026, 2, 'Benefício de aposentadoria por tempo de contribuição: Maria de Lurdes Cestare', 'https://drive.google.com/file/d/1ScQlggGtnrcPMJjuwUPYgO7iFpDfuxIm/view?usp=sharing', 'https://www.tce.mt.gov.br/processo/2754088/2026', 'Maria de Lurdes Cestare', 'retirement'),
    (2026, 1, 'Benefício de aposentadoria por tempo de contribuição: Luciana Pereira Castilho da Silva', 'https://drive.google.com/file/d/1ziYMVpr4RoPLAWyiVTAXfl5l3V1wrkVz/view?usp=sharing', 'https://www.tce.mt.gov.br/processo/2735660/2026', 'Luciana Pereira Castilho da Silva', 'retirement');

DO $$
DECLARE
    v_seed comprev_public_benefits_seed%ROWTYPE;
    v_case_id uuid;
    v_tce_parts text[];
    v_tce_number text;
    v_tce_year integer;
    v_source_key text;
BEGIN
    FOR v_seed IN
        SELECT *
        FROM comprev_public_benefits_seed
        ORDER BY benefit_year, benefit_month, benefit_description
    LOOP
        v_source_key := v_seed.benefit_year::text || '-' || md5(v_seed.grant_url);
        v_tce_parts := regexp_match(
            COALESCE(v_seed.tce_url, ''),
            '/processo/([0-9]+)/([0-9]{4})'
        );
        v_tce_number := v_tce_parts[1];
        v_tce_year := v_tce_parts[2]::integer;

        SELECT comprev_case.id
        INTO v_case_id
        FROM app.comprev_cases AS comprev_case
        WHERE comprev_case.source_benefit_key = v_source_key
           OR comprev_case.grant_document_url = v_seed.grant_url
           OR (
                translate(
                    lower(comprev_case.beneficiary_name),
                    'áàâãäéèêëíìîïóòôõöúùûüç',
                    'aaaaaeeeeiiiiooooouuuuc'
                ) = translate(
                    lower(v_seed.beneficiary_name),
                    'áàâãäéèêëíìîïóòôõöúùûüç',
                    'aaaaaeeeeiiiiooooouuuuc'
                )
                AND comprev_case.archived_at IS NULL
           )
        ORDER BY
            (comprev_case.source_benefit_key = v_source_key) DESC,
            (comprev_case.grant_document_url = v_seed.grant_url) DESC,
            comprev_case.updated_at DESC
        LIMIT 1;

        IF v_case_id IS NULL THEN
            INSERT INTO app.comprev_cases (
                beneficiary_name,
                benefit_type,
                source_benefit_year,
                source_benefit_month,
                source_benefit_description,
                source_benefit_key,
                grant_document_url,
                tce_process_number,
                tce_process_year,
                tce_process_url,
                compensation_direction,
                origin_regime,
                status,
                portal_is_published
            )
            VALUES (
                v_seed.beneficiary_name,
                v_seed.benefit_type,
                v_seed.benefit_year,
                v_seed.benefit_month,
                v_seed.benefit_description,
                v_source_key,
                v_seed.grant_url,
                v_tce_number,
                v_tce_year,
                v_seed.tce_url,
                'receivable',
                'rgps',
                'draft',
                true
            );
        ELSE
            UPDATE app.comprev_cases AS comprev_case
            SET
                source_benefit_year = v_seed.benefit_year,
                source_benefit_month = v_seed.benefit_month,
                source_benefit_description = v_seed.benefit_description,
                source_benefit_key = v_source_key,
                grant_document_url = v_seed.grant_url,
                tce_process_number = COALESCE(
                    comprev_case.tce_process_number,
                    v_tce_number
                ),
                tce_process_year = COALESCE(
                    comprev_case.tce_process_year,
                    v_tce_year
                ),
                tce_process_url = COALESCE(
                    comprev_case.tce_process_url,
                    v_seed.tce_url
                ),
                portal_is_published = true
            WHERE comprev_case.id = v_case_id;
        END IF;
    END LOOP;
END;
$$;

CREATE INDEX comprev_cases_public_benefits_idx
ON app.comprev_cases (
    source_benefit_year DESC,
    source_benefit_month DESC
)
WHERE portal_is_published = true
  AND archived_at IS NULL;

-- Os campos source_benefit_* e grant_document_url representam publicações
-- já existentes no portal. Somente registros completos são habilitados.
UPDATE app.comprev_cases
SET portal_is_published = true
WHERE archived_at IS NULL
  AND source_benefit_year IS NOT NULL
  AND source_benefit_month IS NOT NULL
  AND NULLIF(trim(source_benefit_description), '') IS NOT NULL
  AND NULLIF(trim(grant_document_url), '') IS NOT NULL;

-- Novos cadastros completos passam a integrar o portal automaticamente.
-- Uma despublicação explícita continua preservada em atualizações posteriores.
CREATE OR REPLACE FUNCTION app.sync_comprev_portal_publication()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $$
DECLARE
    v_complete boolean;
    v_public_fields_changed boolean;
BEGIN
    v_complete :=
        NEW.archived_at IS NULL
        AND NEW.source_benefit_year IS NOT NULL
        AND NEW.source_benefit_month IS NOT NULL
        AND NULLIF(trim(NEW.source_benefit_description), '') IS NOT NULL
        AND NULLIF(trim(NEW.grant_document_url), '') IS NOT NULL;

    v_public_fields_changed :=
        TG_OP = 'INSERT'
        OR NEW.source_benefit_year IS DISTINCT FROM OLD.source_benefit_year
        OR NEW.source_benefit_month IS DISTINCT FROM OLD.source_benefit_month
        OR NEW.source_benefit_description IS DISTINCT FROM OLD.source_benefit_description
        OR NEW.grant_document_url IS DISTINCT FROM OLD.grant_document_url;

    IF v_complete AND v_public_fields_changed THEN
        NEW.portal_is_published := true;
    ELSIF NOT v_complete THEN
        NEW.portal_is_published := false;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION app.sync_comprev_portal_publication()
FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_comprev_cases_portal_publication
BEFORE INSERT OR UPDATE
ON app.comprev_cases
FOR EACH ROW
EXECUTE FUNCTION app.sync_comprev_portal_publication();

-- Esta é a única porta pública para os benefícios. A função não retorna
-- identificadores internos, CPF, NB, protocolo, valores, situação ou notas.
CREATE OR REPLACE FUNCTION public.comprev_public_benefits_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
    SELECT COALESCE(
        jsonb_object_agg(
            benefit_year::text,
            benefit_rows
            ORDER BY benefit_year
        ),
        '{}'::jsonb
    )
    FROM (
        SELECT
            comprev_case.source_benefit_year AS benefit_year,
            jsonb_agg(
                jsonb_strip_nulls(
                    jsonb_build_object(
                        'mes', CASE comprev_case.source_benefit_month
                            WHEN 1 THEN 'Janeiro'
                            WHEN 2 THEN 'Fevereiro'
                            WHEN 3 THEN 'Março'
                            WHEN 4 THEN 'Abril'
                            WHEN 5 THEN 'Maio'
                            WHEN 6 THEN 'Junho'
                            WHEN 7 THEN 'Julho'
                            WHEN 8 THEN 'Agosto'
                            WHEN 9 THEN 'Setembro'
                            WHEN 10 THEN 'Outubro'
                            WHEN 11 THEN 'Novembro'
                            WHEN 12 THEN 'Dezembro'
                        END,
                        'descricao', comprev_case.source_benefit_description,
                        'link', comprev_case.grant_document_url,
                        'processo_tce', COALESCE(
                            NULLIF(trim(comprev_case.tce_process_url), ''),
                            CASE
                                WHEN comprev_case.tce_process_number IS NOT NULL
                                 AND comprev_case.tce_process_year IS NOT NULL
                                THEN 'https://www.tce.mt.gov.br/processo/'
                                    || comprev_case.tce_process_number
                                    || '/'
                                    || comprev_case.tce_process_year::text
                                    || '#/'
                                ELSE NULL
                            END
                        )
                    )
                )
                ORDER BY
                    comprev_case.source_benefit_month DESC,
                    comprev_case.source_benefit_description
            ) AS benefit_rows
        FROM app.comprev_cases AS comprev_case
        WHERE comprev_case.portal_is_published = true
          AND comprev_case.archived_at IS NULL
          AND comprev_case.source_benefit_year IS NOT NULL
          AND comprev_case.source_benefit_month IS NOT NULL
          AND NULLIF(trim(comprev_case.source_benefit_description), '') IS NOT NULL
          AND NULLIF(trim(comprev_case.grant_document_url), '') IS NOT NULL
        GROUP BY comprev_case.source_benefit_year
    ) AS grouped_benefits;
$$;

REVOKE ALL
ON FUNCTION public.comprev_public_benefits_snapshot()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.comprev_public_benefits_snapshot()
TO anon, authenticated;

COMMENT ON FUNCTION public.comprev_public_benefits_snapshot() IS
'Retorna exclusivamente os dados de benefícios autorizados para publicação no portal institucional.';

NOTIFY pgrst, 'reload schema';

COMMIT;
