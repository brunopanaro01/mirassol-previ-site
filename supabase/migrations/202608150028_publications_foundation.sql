BEGIN;

-- Módulo único de Publicações do portal
INSERT INTO app.modules (code, name, description)
VALUES ('publications', 'Publicações', 'Publicações, colegiados, agendas e audiências do portal')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = true,
  updated_at = now();

INSERT INTO app.permissions (module_id, code, name, description)
SELECT module_record.id, permission_data.code, permission_data.name, permission_data.description
FROM app.modules AS module_record
CROSS JOIN (
  VALUES
    ('publications.read', 'Consultar publicações', 'Permite consultar registros administrativos do módulo.'),
    ('publications.create', 'Cadastrar publicações', 'Permite cadastrar documentos, membros, reuniões e audiências.'),
    ('publications.update', 'Editar publicações', 'Permite atualizar documentos, membros, reuniões e audiências.'),
    ('publications.delete', 'Excluir publicações', 'Permite excluir rascunhos e registros administrativos.'),
    ('publications.publish', 'Publicar no portal', 'Permite publicar ou despublicar conteúdos.')
) AS permission_data(code, name, description)
WHERE module_record.code = 'publications'
ON CONFLICT (code) DO UPDATE SET
  module_id = EXCLUDED.module_id,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  updated_at = now();

INSERT INTO app.roles (name, description, scope, module_id, is_system)
SELECT
  'publications_manager',
  'Gestor do módulo único de Publicações.',
  'module',
  module_record.id,
  true
FROM app.modules AS module_record
WHERE module_record.code = 'publications'
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  scope = EXCLUDED.scope,
  module_id = EXCLUDED.module_id,
  is_system = EXCLUDED.is_system,
  updated_at = now();

INSERT INTO app.role_permissions (role_id, permission_id)
SELECT role_record.id, permission_record.id
FROM app.roles AS role_record
JOIN app.permissions AS permission_record
  ON permission_record.code LIKE 'publications.%'
WHERE role_record.name = 'publications_manager'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO app.role_permissions (role_id, permission_id)
SELECT role_record.id, permission_record.id
FROM app.roles AS role_record
JOIN app.permissions AS permission_record
  ON permission_record.code LIKE 'publications.%'
WHERE role_record.name = 'administrator'
  AND role_record.scope = 'global'
  AND role_record.module_id IS NULL
ON CONFLICT (role_id, permission_id) DO NOTHING;

CREATE TABLE app.publication_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  category text NOT NULL,
  title text NOT NULL,
  description text,
  reference_year integer,
  publication_date date,
  version_label text,
  status text NOT NULL DEFAULT 'current',
  file_path text,
  external_url text,
  issued_at date,
  valid_until date,
  display_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  published_by uuid REFERENCES app.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publication_documents_public_id_chk CHECK (public_id ~ '^[a-z0-9][a-z0-9-]{2,119}$'),
  CONSTRAINT publication_documents_category_chk CHECK (category IN (
    'progestao_certificate', 'governance_report', 'guidance_booklet',
    'capacity_plan', 'ethics_code', 'posic', 'action_plan',
    'action_plan_monitoring', 'certificate', 'other'
  )),
  CONSTRAINT publication_documents_title_chk CHECK (length(trim(title)) BETWEEN 3 AND 250),
  CONSTRAINT publication_documents_year_chk CHECK (reference_year IS NULL OR reference_year BETWEEN 2000 AND 2200),
  CONSTRAINT publication_documents_status_chk CHECK (status IN ('current', 'historical')),
  CONSTRAINT publication_documents_source_chk CHECK (num_nonnulls(file_path, external_url) = 1),
  CONSTRAINT publication_documents_file_chk CHECK (file_path IS NULL OR (file_path !~ '(^/|\.\.)' AND file_path ~* '\.pdf$')),
  CONSTRAINT publication_documents_url_chk CHECK (external_url IS NULL OR external_url ~* '^https://'),
  CONSTRAINT publication_documents_validity_chk CHECK (valid_until IS NULL OR issued_at IS NULL OR valid_until >= issued_at)
);

CREATE TABLE app.publication_bodies (
  code text PRIMARY KEY,
  name text NOT NULL,
  periodicity text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  official_url text,
  last_reviewed_on date,
  display_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publication_bodies_code_chk CHECK (code IN ('conselho', 'fiscal', 'comite')),
  CONSTRAINT publication_bodies_status_chk CHECK (status IN ('active', 'pending')),
  CONSTRAINT publication_bodies_url_chk CHECK (official_url IS NULL OR official_url ~* '^https://')
);

CREATE TABLE app.publication_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  body_code text NOT NULL REFERENCES app.publication_bodies(code) ON DELETE RESTRICT,
  name text NOT NULL,
  role text NOT NULL,
  image_path text,
  start_date date,
  end_date date,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publication_members_dates_chk CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE app.publication_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  body_code text NOT NULL REFERENCES app.publication_bodies(code) ON DELETE RESTRICT,
  reference_year integer NOT NULL,
  meeting_date date NOT NULL,
  meeting_type text NOT NULL,
  agenda text NOT NULL,
  expected_result text,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publication_meetings_year_chk CHECK (reference_year BETWEEN 2000 AND 2200),
  CONSTRAINT publication_meetings_date_year_chk CHECK (reference_year = EXTRACT(YEAR FROM meeting_date)::integer),
  CONSTRAINT publication_meetings_type_chk CHECK (meeting_type IN ('Ordinária', 'Extraordinária')),
  CONSTRAINT publication_meetings_unique UNIQUE (body_code, meeting_date, meeting_type)
);

CREATE TABLE app.publication_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  reference_year integer NOT NULL,
  title text NOT NULL,
  event_date date,
  description text,
  youtube_url text NOT NULL,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publication_audiences_year_chk CHECK (reference_year BETWEEN 2000 AND 2200),
  CONSTRAINT publication_audiences_url_chk CHECK (youtube_url ~* '^https://(www\.)?(youtube\.com|youtu\.be)/')
);

CREATE INDEX publication_documents_public_idx ON app.publication_documents (is_published, category, status, reference_year DESC);
CREATE INDEX publication_members_body_idx ON app.publication_members (body_code, is_active, display_order);
CREATE INDEX publication_meetings_body_year_idx ON app.publication_meetings (body_code, reference_year DESC, meeting_date);
CREATE INDEX publication_audiences_year_idx ON app.publication_audiences (is_published, reference_year DESC);

CREATE TRIGGER trg_publication_documents_updated_at BEFORE UPDATE ON app.publication_documents FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER trg_publication_bodies_updated_at BEFORE UPDATE ON app.publication_bodies FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER trg_publication_members_updated_at BEFORE UPDATE ON app.publication_members FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER trg_publication_meetings_updated_at BEFORE UPDATE ON app.publication_meetings FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER trg_publication_audiences_updated_at BEFORE UPDATE ON app.publication_audiences FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE app.publication_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.publication_bodies ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.publication_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.publication_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.publication_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.publication_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE app.publication_bodies FORCE ROW LEVEL SECURITY;
ALTER TABLE app.publication_members FORCE ROW LEVEL SECURITY;
ALTER TABLE app.publication_meetings FORCE ROW LEVEL SECURITY;
ALTER TABLE app.publication_audiences FORCE ROW LEVEL SECURITY;

GRANT SELECT ON app.publication_documents, app.publication_bodies, app.publication_members, app.publication_meetings, app.publication_audiences TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON app.publication_documents, app.publication_bodies, app.publication_members, app.publication_meetings, app.publication_audiences TO authenticated;

CREATE POLICY publication_documents_public_read ON app.publication_documents FOR SELECT TO anon USING (is_published);
CREATE POLICY publication_documents_authenticated_read ON app.publication_documents FOR SELECT TO authenticated USING (is_published OR app.is_admin() OR app.has_permission('publications.read'));
CREATE POLICY publication_documents_admin_write ON app.publication_documents FOR ALL TO authenticated
USING (app.is_admin() OR app.has_permission('publications.update') OR app.has_permission('publications.publish') OR app.has_permission('publications.delete'))
WITH CHECK (app.is_admin() OR app.has_permission('publications.create') OR app.has_permission('publications.update') OR app.has_permission('publications.publish'));

CREATE POLICY publication_bodies_public_read ON app.publication_bodies FOR SELECT TO anon USING (true);
CREATE POLICY publication_bodies_authenticated_read ON app.publication_bodies FOR SELECT TO authenticated USING (true);
CREATE POLICY publication_bodies_admin_write ON app.publication_bodies FOR UPDATE TO authenticated
USING (app.is_admin() OR app.has_permission('publications.update'))
WITH CHECK (app.is_admin() OR app.has_permission('publications.update'));

CREATE POLICY publication_members_public_read ON app.publication_members FOR SELECT TO anon USING (is_active);
CREATE POLICY publication_members_authenticated_read ON app.publication_members FOR SELECT TO authenticated USING (is_active OR app.is_admin() OR app.has_permission('publications.read'));
CREATE POLICY publication_members_admin_write ON app.publication_members FOR ALL TO authenticated
USING (app.is_admin() OR app.has_permission('publications.update') OR app.has_permission('publications.delete'))
WITH CHECK (app.is_admin() OR app.has_permission('publications.create') OR app.has_permission('publications.update'));

CREATE POLICY publication_meetings_public_read ON app.publication_meetings FOR SELECT TO anon USING (is_published);
CREATE POLICY publication_meetings_authenticated_read ON app.publication_meetings FOR SELECT TO authenticated USING (is_published OR app.is_admin() OR app.has_permission('publications.read'));
CREATE POLICY publication_meetings_admin_write ON app.publication_meetings FOR ALL TO authenticated
USING (app.is_admin() OR app.has_permission('publications.update') OR app.has_permission('publications.delete'))
WITH CHECK (app.is_admin() OR app.has_permission('publications.create') OR app.has_permission('publications.update'));

CREATE POLICY publication_audiences_public_read ON app.publication_audiences FOR SELECT TO anon USING (is_published);
CREATE POLICY publication_audiences_authenticated_read ON app.publication_audiences FOR SELECT TO authenticated USING (is_published OR app.is_admin() OR app.has_permission('publications.read'));
CREATE POLICY publication_audiences_admin_write ON app.publication_audiences FOR ALL TO authenticated
USING (app.is_admin() OR app.has_permission('publications.update') OR app.has_permission('publications.delete'))
WITH CHECK (app.is_admin() OR app.has_permission('publications.create') OR app.has_permission('publications.update'));

INSERT INTO app.publication_bodies (code, name, periodicity, status, official_url, last_reviewed_on, display_order)
SELECT
  item->>'code', item->>'name', item->>'periodicity', item->>'status',
  item->>'official_url', nullif(item->>'last_updated', '')::date,
  COALESCE((item->>'display_order')::integer, 0)
FROM jsonb_array_elements($json$[{"code":"conselho","name":"Conselho Previdenciário","periodicity":"Trimestral","status":"active","official_url":"https://www.consultatransparencia.com.br/mirassoldoestenovo/Transparencia/CompostoConselho","last_updated":"2026-08-15","display_order":10},{"code":"fiscal","name":"Conselho Fiscal","periodicity":"Trimestral","status":"pending","official_url":"https://www.consultatransparencia.com.br/mirassoldoestenovo/Transparencia/CompostoConselhoFiscal","last_updated":"2026-08-15","display_order":20},{"code":"comite","name":"Comitê de Investimentos","periodicity":"Mensal","status":"active","official_url":"https://www.consultatransparencia.com.br/mirassoldoestenovo/Transparencia/CompostoInvestimentos","last_updated":"2026-08-15","display_order":30}]$json$::jsonb) AS item
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, periodicity = EXCLUDED.periodicity, status = EXCLUDED.status,
  official_url = EXCLUDED.official_url, last_reviewed_on = EXCLUDED.last_reviewed_on,
  display_order = EXCLUDED.display_order, updated_at = now();

INSERT INTO app.publication_documents (
  public_id, category, title, description, reference_year, publication_date,
  version_label, status, file_path, external_url, issued_at, valid_until,
  display_order, is_published, published_at
)
SELECT
  item->>'id', item->>'category', item->>'title', nullif(item->>'description',''),
  nullif(item->>'reference_year','')::integer, nullif(item->>'publication_date','')::date,
  nullif(item->>'version_label',''), item->>'status', nullif(item->>'file_path',''),
  nullif(item->>'external_url',''), nullif(item->>'issued_at','')::date,
  nullif(item->>'valid_until','')::date, COALESCE((item->>'display_order')::integer,0),
  COALESCE((item->>'is_published')::boolean,false),
  CASE WHEN COALESCE((item->>'is_published')::boolean,false) THEN now() ELSE NULL END
FROM jsonb_array_elements($json$[{"id":"cert-progestao-2026","category":"progestao_certificate","title":"Certificado Pró-Gestão RPPS","description":"Certificado institucional do Mirassol-Previ.","reference_year":2026,"publication_date":"2026-01-12","version_label":"Vigente","status":"current","external_url":"https://drive.google.com/file/d/1xcCu6jjJVB3MeD-2WL3VL7v58CrsODXx/view?usp=sharing","file_path":null,"issued_at":"2026-01-12","valid_until":null,"is_published":true,"display_order":10},{"id":"governanca-2025","category":"governance_report","title":"Relatório de Governança Corporativa 2025","description":"Relatório anual de governança corporativa.","reference_year":2025,"publication_date":null,"version_label":"","status":"current","external_url":"https://drive.google.com/file/d/1YE_HR9XFhiIjShto_TRbiRlKal5nXUQk/view?usp=sharing","file_path":null,"issued_at":null,"valid_until":null,"is_published":true,"display_order":10},{"id":"governanca-2024","category":"governance_report","title":"Relatório de Governança Corporativa 2024","description":"Relatório anual de governança corporativa.","reference_year":2024,"publication_date":null,"version_label":"","status":"historical","external_url":"https://drive.google.com/file/d/1F1DTjP9cTLsPeUWkVq6pKT4XupLZqI7U/view?usp=sharing","file_path":null,"issued_at":null,"valid_until":null,"is_published":true,"display_order":20},{"id":"cartilha-previdenciaria-2026","category":"guidance_booklet","title":"Cartilha Previdenciária","description":"Orientações sobre o RPPS, benefícios e serviços do Mirassol-Previ.","reference_year":2026,"publication_date":"2026-01-12","version_label":"1.0","status":"current","external_url":"https://drive.google.com/file/d/1F0T8Lvhkq6qEQwH8XlvWq88xTgt-FGFA/view?usp=sharing","file_path":null,"issued_at":null,"valid_until":null,"is_published":true,"display_order":10},{"id":"codigo-etica","category":"ethics_code","title":"Código de Ética","description":"Código de Ética do Mirassol-Previ.","reference_year":null,"publication_date":null,"version_label":"Vigente","status":"current","external_url":"https://drive.google.com/file/d/1L6lEL6Yijihv4GcEvy3sMsrpkpqRcZ--/view?usp=sharing","file_path":null,"issued_at":null,"valid_until":null,"is_published":true,"display_order":10},{"id":"posic","category":"posic","title":"Política de Segurança da Informação e Comunicação — POSIC","description":"Versão vigente da POSIC do Mirassol-Previ.","reference_year":null,"publication_date":null,"version_label":"Vigente","status":"current","external_url":"https://drive.google.com/file/d/1m7K5CDBqZG6PbbXwNrKYy40ffFiy2Mgb/view?usp=sharing","file_path":null,"issued_at":null,"valid_until":null,"is_published":true,"display_order":10},{"id":"plano-acao","category":"action_plan","title":"Plano de Ação","description":"Plano de Ação do Mirassol-Previ.","reference_year":2026,"publication_date":null,"version_label":"Vigente","status":"current","external_url":"https://drive.google.com/file/d/1RHtnFIvo5ONXFZLBPq5bjHCvoXDRnZlD/view?usp=sharing","file_path":null,"issued_at":null,"valid_until":null,"is_published":true,"display_order":10},{"id":"cert-cndt","category":"certificate","title":"Certidão Negativa de Débitos Trabalhistas — CNDT","description":"Regularidade trabalhista.","reference_year":null,"publication_date":null,"version_label":"","status":"current","external_url":"https://drive.google.com/file/d/1gnwccvTBc2CpBApw24GNa2-hRESWCxLZ/view?usp=sharing","file_path":null,"issued_at":null,"valid_until":null,"is_published":true,"display_order":10},{"id":"cert-federal","category":"certificate","title":"Certidão Negativa de Débitos Federais e Dívida Ativa da União","description":"Receita Federal e PGFN.","reference_year":null,"publication_date":null,"version_label":"","status":"current","external_url":"https://drive.google.com/file/d/1EKxwwy_58jEiL2iv79-vJQtgYPdkMVjg/view?usp=sharing","file_path":null,"issued_at":null,"valid_until":null,"is_published":true,"display_order":20},{"id":"cert-estadual","category":"certificate","title":"Certidão Estadual — PGE/SEFAZ","description":"Regularidade fiscal estadual.","reference_year":null,"publication_date":null,"version_label":"","status":"current","external_url":"https://drive.google.com/file/d/1zYtnLikj9NgLhT-GRTe7Jxy9zhprE7L-/view?usp=sharing","file_path":null,"issued_at":null,"valid_until":null,"is_published":true,"display_order":30},{"id":"cert-fgts","category":"certificate","title":"Certificado de Regularidade do FGTS — CRF","description":"Caixa Econômica Federal.","reference_year":null,"publication_date":null,"version_label":"","status":"current","external_url":"https://drive.google.com/file/d/1glVGTwVkaDFG0M-KoSkI32fBInaMMOTy/view?usp=sharing","file_path":null,"issued_at":null,"valid_until":null,"is_published":true,"display_order":40}]$json$::jsonb) AS item
ON CONFLICT (public_id) DO NOTHING;

INSERT INTO app.publication_members (
  public_id, body_code, name, role, image_path, start_date, end_date, is_active, display_order
)
SELECT
  item->>'id', item->>'body_code', item->>'name', item->>'role',
  nullif(item->>'image_path',''), nullif(item->>'start_date','')::date,
  nullif(item->>'end_date','')::date, COALESCE((item->>'is_active')::boolean,true),
  COALESCE((item->>'display_order')::integer,0)
FROM jsonb_array_elements($json$[{"id":"conselho-fatima","body_code":"conselho","name":"Fatima Borghi Martins","role":"Presidente","image_path":"Fatima.jpeg","start_date":null,"end_date":null,"is_active":true,"display_order":10},{"id":"conselho-abraao","body_code":"conselho","name":"Abraão Paracatu","role":"Membro","image_path":"semfoto.jpeg","start_date":null,"end_date":null,"is_active":true,"display_order":20},{"id":"conselho-ana-maria","body_code":"conselho","name":"Ana Maria de Jesus Pires","role":"Membro","image_path":"AnaMaria.jpeg","start_date":null,"end_date":null,"is_active":true,"display_order":30},{"id":"conselho-luiz","body_code":"conselho","name":"Luiz Emilio Tolon","role":"Membro","image_path":"semfoto.jpeg","start_date":null,"end_date":null,"is_active":true,"display_order":40},{"id":"conselho-ana-paula","body_code":"conselho","name":"Ana Paula Belisario do Nascimento","role":"Membro","image_path":"anapaula.jpeg","start_date":null,"end_date":null,"is_active":true,"display_order":50},{"id":"conselho-masterson","body_code":"conselho","name":"Masterson Felipe da Silva","role":"Membro","image_path":"masterson.jpeg","start_date":null,"end_date":null,"is_active":true,"display_order":60},{"id":"conselho-rodrigo","body_code":"conselho","name":"Rodrigo Donizete Terradas","role":"Membro","image_path":"rodrigo.coordenado.jpg","start_date":null,"end_date":null,"is_active":true,"display_order":70},{"id":"conselho-rogerio","body_code":"conselho","name":"Rogério Antônio da Silva","role":"Membro","image_path":"semfoto.jpeg","start_date":null,"end_date":null,"is_active":true,"display_order":80},{"id":"comite-carlos","body_code":"comite","name":"Carlos Eduardo Tolon","role":"Presidente","image_path":"carlos.jpeg","start_date":null,"end_date":null,"is_active":true,"display_order":10},{"id":"comite-celia","body_code":"comite","name":"Celia Regina de Mattos Prado","role":"Membro","image_path":"CELIA.jpeg","start_date":null,"end_date":null,"is_active":true,"display_order":20},{"id":"comite-valmir","body_code":"comite","name":"Valmir Borges Virtuoso","role":"Membro","image_path":"valmir.jpeg","start_date":null,"end_date":null,"is_active":true,"display_order":30}]$json$::jsonb) AS item
ON CONFLICT (public_id) DO NOTHING;

INSERT INTO app.publication_meetings (
  public_id, body_code, reference_year, meeting_date, meeting_type, agenda, expected_result, is_published
)
SELECT
  item->>'id', item->>'body_code', (item->>'year')::integer,
  (item->>'meeting_date')::date, item->>'meeting_type', item->>'agenda',
  nullif(item->>'expected_result',''), COALESCE((item->>'is_published')::boolean,false)
FROM jsonb_array_elements($json$[{"id":"meeting-1","body_code":"conselho","year":2025,"meeting_date":"2025-01-29","meeting_type":"Ordinária","agenda":"Abertura; Verificação de quórum; Aprovação da pauta; constituição de reservas com as sobras das receitas administrativas.","expected_result":"Constituição de reservas com as sobras das receitas administrativas.","is_published":true},{"id":"meeting-2","body_code":"conselho","year":2025,"meeting_date":"2025-02-20","meeting_type":"Ordinária","agenda":"Abertura; Verificação de quórum; Aprovação da pauta; Alteração Alteração da Taxa do Consignado.","expected_result":"Alteração da Taxa do Consignado.","is_published":true},{"id":"meeting-3","body_code":"conselho","year":2025,"meeting_date":"2025-03-28","meeting_type":"Ordinária","agenda":"Abertura; Verificação de quórum; Aprovação da pauta; Alteração na Direção Executiva; Substituição de membros (nomeações e suplência); Aprovação do Jeton (LC 285/2025); Aquisição de lote para construção da sede; Encerramento (assuntos gerais e palavra livre).","expected_result":"Deliberação sobre aquisição do lote e aprovação do Jeton.","is_published":true},{"id":"meeting-4","body_code":"conselho","year":2025,"meeting_date":"2025-08-13","meeting_type":"Ordinária","agenda":"Abertura; Verificação de quórum; Aprovação da pauta; Substituição de membros conforme Regimento Interno; Votação do Regimento Interno do Comitê de Investimentos; Atualização do Regimento Interno do Conselho Previdenciário; Doação de área da Prefeitura ao Mirassol-Previ para construção da sede; Encerramento.","expected_result":"Aprovação da atualização do Regimento Interno do Conselho e aprovação do Regimento Interno do Comitê.","is_published":true},{"id":"meeting-5","body_code":"conselho","year":2025,"meeting_date":"2025-10-07","meeting_type":"Ordinária","agenda":"Reunião ordinária de outubro; Análise das alterações do Regimento Interno do Conselho; Discussão e votação do Regimento Interno do Comite de Investimento; Parecer referente aos documentos encaminhados pelo Comite de Investimento, Elaboração do calendário de reuniões para 2026.","expected_result":"Realização da 3ª reunião ordinária do ano.","is_published":true},{"id":"meeting-6","body_code":"conselho","year":2025,"meeting_date":"2025-11-03","meeting_type":"Ordinária","agenda":"Abertura; Verificação de quórum; Aprovação da pauta; Análise e aprovação do Plano Anual de Investimento: 2026","expected_result":"Ata de Aprovação da Política Anual de Investimentos 2026","is_published":true},{"id":"meeting-7","body_code":"conselho","year":2026,"meeting_date":"2026-01-07","meeting_type":"Extraordinária","agenda":"Abertura; Verificação de quórum; Análise e aprovação do parecer do Conselho Previdenciário sobre a posição da carteira de investimentos referente aos meses de agosto, setembro e outubro de 2025.","expected_result":"Reunião Extraordinária.","is_published":true},{"id":"meeting-8","body_code":"conselho","year":2026,"meeting_date":"2026-01-30","meeting_type":"Extraordinária","agenda":"Abertura; Verificação de quórum; Análise e aprovação de constituição de reserva com as sobras das receitas destinadas ao custeio das despesas administrativas do exercício de 2025.","expected_result":"Reunião Extraordinária.","is_published":true},{"id":"meeting-9","body_code":"conselho","year":2026,"meeting_date":"2026-02-12","meeting_type":"Extraordinária","agenda":"Abertura; Verificação de quórum; Alteração e aprovação da Política Anual de Investimentos – PAI 2026; Aprovação dos relatórios de Investimentos de 2024 e 2025; Parecer referente à posição da carteira de investimento Novembro e Dezembro/2025 e Aprovação da alteração do percentual do patrimônio de 5% para 10% devido a certificação do Pró Gestão.","expected_result":"Reunião Extraordinária.","is_published":true},{"id":"meeting-10","body_code":"conselho","year":2026,"meeting_date":"2026-03-17","meeting_type":"Ordinária","agenda":"Abertura; Verificação de quórum; Informar sobre a renovação do CRP; Apresentar portifólio de investimentos, situação do consignado e situação da meta atuarial; Aprovar plano de ação de capacitação; Aprovar pareceres do Comitê de Investimentos; Apresentar a proposta de alteração da Lei Complementar nº 160/2016 referente a criação do Conselho Fiscal.","expected_result":"Realização da 1ª reunião ordinária do ano.","is_published":true},{"id":"meeting-11","body_code":"conselho","year":2026,"meeting_date":"2026-08-13","meeting_type":"Ordinária","agenda":"Abertura; Verificação de quórum; Aprovação da pauta; Parecer referente aos documentos encaminhados pelo Comite de Investimento; Informar sobre o andamento para renovação do CRP; Apresentar portifólio de investimentos, situação do consignado e situação da meta atuarial.","expected_result":"Realização da 2ª reunião ordinária do ano.","is_published":true},{"id":"meeting-12","body_code":"conselho","year":2026,"meeting_date":"2026-10-08","meeting_type":"Ordinária","agenda":"Abertura; Verificação de quórum; Aprovação da pauta; Parecer referente aos documentos encaminhados pelo Comite de Investimento;Apresentar portifólio de investimentos e situação da meta atuarial; Encerramento.","expected_result":"Realização da 3ª reunião ordinária do ano.","is_published":true},{"id":"meeting-13","body_code":"conselho","year":2026,"meeting_date":"2026-11-03","meeting_type":"Extraordinária","agenda":"Análise e aprovação do Plano Anual de Investimento: 2027","expected_result":"Reunião Extraordinária.","is_published":true},{"id":"meeting-14","body_code":"comite","year":2025,"meeting_date":"2025-03-28","meeting_type":"Ordinária","agenda":"Abertura; Verificação de quórum; Aprovação da pauta; Alteração na Direção Executiva; Substituição de membros; Aprovação do Jeton (LC 285/2025); Aquisição de lote para construção da sede; Encerramento.","expected_result":"Análise e encaminhamentos relativos às matérias conjuntas.","is_published":true},{"id":"meeting-15","body_code":"comite","year":2025,"meeting_date":"2025-05-20","meeting_type":"Extraordinária","agenda":"Abertura; Verificação de quórum; Análise da carteira de investimento; Encerramento.","expected_result":"Reunião Extraordinária: Análise dos investimentos.","is_published":true},{"id":"meeting-16","body_code":"comite","year":2025,"meeting_date":"2025-08-13","meeting_type":"Ordinária","agenda":"Abertura; Verificação de quórum; Aprovação da pauta; Elaboração e aprovação do Regimento Interno do Comitê de Investimentos; Atualização do Regimento Interno do Conselho Previdenciário; Doação de área para construção da sede; Encerramento.","expected_result":"Aprovação do Regimento Interno do Comitê e ciência das atualizações do Conselho.","is_published":true},{"id":"meeting-17","body_code":"comite","year":2025,"meeting_date":"2025-09-09","meeting_type":"Extraordinária","agenda":"Abertura; Verificação de quórum; Aprovação do Regimento Interno do Comitê de Investimentos; Emitir parecer frente ao Relatório Anual de Investimentos 2024; Emitir parecer frente aos relatórios mensais de investimento de 2025; Encerramento.","expected_result":"Reunião Extraordinária.","is_published":true},{"id":"meeting-18","body_code":"comite","year":2025,"meeting_date":"2025-10-08","meeting_type":"Ordinária","agenda":"Reunião ordinária de outubro; Discussão e votação do Regimento Interno do Comite de Investimento; Emissão de Parecer dos relatórios mensais de investimento.","expected_result":"3ª reunião ordinária do ano.","is_published":true},{"id":"meeting-19","body_code":"comite","year":2025,"meeting_date":"2025-11-03","meeting_type":"Extraordinária","agenda":"Análise e aprovação do Plano Anual de Investimento: 2026","expected_result":"Reunião Extraordinária.","is_published":true},{"id":"meeting-20","body_code":"comite","year":2025,"meeting_date":"2025-12-09","meeting_type":"Ordinária","agenda":"Emissão de Parecer dos relatórios mensais de investimento relativos a agosto, setembro e outubro.","expected_result":"Parecer frente as relatórios e posterior encaminhamento ao Conselho Precidenciário","is_published":true},{"id":"meeting-21","body_code":"comite","year":2026,"meeting_date":"2026-01-28","meeting_type":"Ordinária","agenda":"Emissão de Parecer dos relatórios mensais - Novembro e Dezembro/2025- e anual de 2025 referente aos investimento e Aprovação do PAI 2026 com as alterações da Resolução 5272/2026","expected_result":"Reunião Ordinária: Parecer frente aos relatórios de investimento e a alteração do PAI para posterior encaminhamento ao Conselho Previdenciário","is_published":true},{"id":"meeting-22","body_code":"comite","year":2026,"meeting_date":"2026-02-25","meeting_type":"Ordinária","agenda":"Emissão de Parecer dos relatórios mensais de investimento.","expected_result":"Reunião Ordinária:Parecer frente aos relatórios e posterior encaminhamento ao Conselho Previdenciário","is_published":true},{"id":"meeting-23","body_code":"comite","year":2026,"meeting_date":"2026-03-25","meeting_type":"Ordinária","agenda":"Emissão de Parecer dos relatórios mensais de investimento.","expected_result":"Reunião Ordinária: Parecer frente aos relatórios e posterior encaminhamento ao Conselho Previdenciário","is_published":true},{"id":"meeting-24","body_code":"comite","year":2026,"meeting_date":"2026-04-29","meeting_type":"Ordinária","agenda":"Emissão de Parecer dos relatórios mensais de investimento.","expected_result":"Reunião Ordinária: Parecer frente aos relatórios e posterior encaminhamento ao Conselho Previdenciário","is_published":true},{"id":"meeting-25","body_code":"comite","year":2026,"meeting_date":"2026-05-27","meeting_type":"Ordinária","agenda":"Emissão de Parecer dos relatórios mensais de investimento.","expected_result":"Reunião Ordinária: Parecer frente aos relatórios e posterior encaminhamento ao Conselho Previdenciário","is_published":true},{"id":"meeting-26","body_code":"comite","year":2026,"meeting_date":"2026-06-24","meeting_type":"Ordinária","agenda":"Emissão de Parecer dos relatórios mensais de investimento.","expected_result":"Reunião Ordinária: Parecer frente aos relatórios e posterior encaminhamento ao Conselho Previdenciário","is_published":true},{"id":"meeting-27","body_code":"comite","year":2026,"meeting_date":"2026-07-29","meeting_type":"Ordinária","agenda":"Emissão de Parecer dos relatórios mensais de investimento.","expected_result":"Reunião Ordinária: Parecer frente aos relatórios e posterior encaminhamento ao Conselho Previdenciário","is_published":true},{"id":"meeting-28","body_code":"comite","year":2026,"meeting_date":"2026-08-26","meeting_type":"Ordinária","agenda":"Emissão de Parecer dos relatórios mensais de investimento.","expected_result":"Reunião Ordinária: Parecer frente aos relatórios e posterior encaminhamento ao Conselho Previdenciário","is_published":true},{"id":"meeting-29","body_code":"comite","year":2026,"meeting_date":"2026-09-30","meeting_type":"Ordinária","agenda":"Emissão de Parecer dos relatórios mensais de investimento.","expected_result":"Reunião Ordinária: Parecer frente aos relatórios e posterior encaminhamento ao Conselho Previdenciário","is_published":true},{"id":"meeting-30","body_code":"comite","year":2026,"meeting_date":"2026-10-28","meeting_type":"Ordinária","agenda":"Emissão de Parecer dos relatórios mensais de investimento.","expected_result":"Reunião Ordinária: Parecer frente aos relatórios e posterior encaminhamento ao Conselho Previdenciário","is_published":true},{"id":"meeting-31","body_code":"comite","year":2026,"meeting_date":"2026-11-25","meeting_type":"Ordinária","agenda":"Emissão de Parecer dos relatórios mensais de investimento; Análise e aprovação do Plano Anual de Investimento: 2026.","expected_result":"Reunião Ordinária: Parecer frente aos relatórios e posterior encaminhamento ao Conselho Previdenciário","is_published":true},{"id":"meeting-32","body_code":"comite","year":2026,"meeting_date":"2026-12-09","meeting_type":"Ordinária","agenda":"Emissão de Parecer dos relatórios mensais de investimento.","expected_result":"Reunião Ordinária: Parecer frente aos relatórios e posterior encaminhamento ao Conselho Previdenciário","is_published":true}]$json$::jsonb) AS item
ON CONFLICT (public_id) DO NOTHING;

INSERT INTO app.publication_audiences (
  public_id, reference_year, title, event_date, description, youtube_url, is_published
)
SELECT
  item->>'id', (item->>'year')::integer, item->>'title',
  nullif(item->>'event_date','')::date, nullif(item->>'description',''),
  item->>'youtube_url', COALESCE((item->>'is_published')::boolean,false)
FROM jsonb_array_elements($json$[{"id":"audiencia-2025","year":2025,"title":"Audiência Pública — Resultados de 2025","event_date":"2026-04-23","description":"Apresentação pública dos resultados do exercício de 2025.","youtube_url":"https://www.youtube.com/live/MdlUxoW7kc0?si=AVoUmAhaL1LykV-K","is_published":true}]$json$::jsonb) AS item
ON CONFLICT (public_id) DO NOTHING;

COMMIT;

