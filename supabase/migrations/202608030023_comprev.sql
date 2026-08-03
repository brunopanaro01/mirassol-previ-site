BEGIN;

-- =============================================================================
-- MÓDULO COMPREV
-- =============================================================================

UPDATE app.modules
SET
    name = 'COMPREV',
    description = 'Gestão da compensação previdenciária.',
    is_active = true,
    updated_at = now()
WHERE code = 'comprev';

-- =============================================================================
-- PROCESSOS DE COMPENSAÇÃO PREVIDENCIÁRIA
-- =============================================================================

CREATE TABLE app.comprev_cases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    beneficiary_name text NOT NULL,
    beneficiary_cpf text,

    benefit_type text NOT NULL,
    benefit_number text,

    benefit_start_date date,
    benefit_grant_date date,

    source_benefit_year integer,
    source_benefit_month smallint,
    source_benefit_description text,

    grant_document_url text,

    tce_process_number text,
    tce_process_year integer,
    tce_process_url text,

    compensation_direction text NOT NULL DEFAULT 'receivable',
    origin_regime text NOT NULL DEFAULT 'rgps',
    origin_regime_name text,
    origin_regime_cnpj text,

    comprev_protocol_number text,
    comprev_protocol_date date,

    status text NOT NULL DEFAULT 'draft',

    requirement_description text,
    requirement_received_at date,
    requirement_deadline date,

    analysis_date date,
    approval_date date,
    rejection_reason text,

    monthly_compensation_amount numeric(14,2),
    arrears_amount numeric(14,2),
    payment_start_date date,
    payment_end_date date,

    notes text,

    archived_at timestamptz,
    archived_by uuid
        REFERENCES app.users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    created_by uuid
        REFERENCES app.users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    updated_by uuid
        REFERENCES app.users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT comprev_cases_beneficiary_name_not_empty_chk
        CHECK (length(trim(beneficiary_name)) > 0),

    CONSTRAINT comprev_cases_cpf_chk
        CHECK (
            beneficiary_cpf IS NULL
            OR beneficiary_cpf ~ '^[0-9]{11}$'
        ),

    CONSTRAINT comprev_cases_benefit_type_chk
        CHECK (
            benefit_type IN (
                'retirement',
                'pension'
            )
        ),

    CONSTRAINT comprev_cases_source_year_chk
        CHECK (
            source_benefit_year IS NULL
            OR source_benefit_year BETWEEN 1900 AND 2200
        ),

    CONSTRAINT comprev_cases_source_month_chk
        CHECK (
            source_benefit_month IS NULL
            OR source_benefit_month BETWEEN 1 AND 12
        ),

    CONSTRAINT comprev_cases_tce_process_number_chk
        CHECK (
            tce_process_number IS NULL
            OR tce_process_number ~ '^[0-9]+$'
        ),

    CONSTRAINT comprev_cases_tce_process_year_chk
        CHECK (
            tce_process_year IS NULL
            OR tce_process_year BETWEEN 2000 AND 2200
        ),

    CONSTRAINT comprev_cases_tce_process_pair_chk
        CHECK (
            (
                tce_process_number IS NULL
                AND tce_process_year IS NULL
            )
            OR
            (
                tce_process_number IS NOT NULL
                AND tce_process_year IS NOT NULL
            )
        ),

    CONSTRAINT comprev_cases_grant_document_url_chk
        CHECK (
            grant_document_url IS NULL
            OR grant_document_url ~* '^https://'
        ),

    CONSTRAINT comprev_cases_tce_process_url_chk
        CHECK (
            tce_process_url IS NULL
            OR tce_process_url ~* '^https://www\.tce\.mt\.gov\.br/processo/'
        ),

    CONSTRAINT comprev_cases_direction_chk
        CHECK (
            compensation_direction IN (
                'receivable',
                'payable'
            )
        ),

    CONSTRAINT comprev_cases_origin_regime_chk
        CHECK (
            origin_regime IN (
                'rgps',
                'rpps',
                'unknown'
            )
        ),

    CONSTRAINT comprev_cases_origin_cnpj_chk
        CHECK (
            origin_regime_cnpj IS NULL
            OR origin_regime_cnpj ~ '^[0-9]{14}$'
        ),

    CONSTRAINT comprev_cases_status_chk
        CHECK (
            status IN (
                'draft',
                'document_collection',
                'ready_to_submit',
                'submitted',
                'under_review',
                'requirement',
                'approved',
                'rejected',
                'payment_active',
                'closed'
            )
        ),

    CONSTRAINT comprev_cases_requirement_dates_chk
        CHECK (
            requirement_deadline IS NULL
            OR requirement_received_at IS NULL
            OR requirement_deadline >= requirement_received_at
        ),

    CONSTRAINT comprev_cases_monthly_amount_chk
        CHECK (
            monthly_compensation_amount IS NULL
            OR monthly_compensation_amount >= 0
        ),

    CONSTRAINT comprev_cases_arrears_amount_chk
        CHECK (
            arrears_amount IS NULL
            OR arrears_amount >= 0
        ),

    CONSTRAINT comprev_cases_payment_dates_chk
        CHECK (
            payment_end_date IS NULL
            OR payment_start_date IS NULL
            OR payment_end_date >= payment_start_date
        ),

    CONSTRAINT comprev_cases_archiving_chk
        CHECK (
            (
                archived_at IS NULL
                AND archived_by IS NULL
            )
            OR
            archived_at IS NOT NULL
        )
);

COMMENT ON TABLE app.comprev_cases IS
'Processos administrativos de compensação previdenciária gerenciados pelo SIGPREVI.';

COMMENT ON COLUMN app.comprev_cases.beneficiary_cpf IS
'CPF armazenado somente com onze dígitos e protegido pelas regras de acesso do módulo.';

COMMENT ON COLUMN app.comprev_cases.source_benefit_description IS
'Descrição original do benefício importada ou referenciada a partir de beneficios.json.';

COMMENT ON COLUMN app.comprev_cases.grant_document_url IS
'Endereço do ato de concessão do benefício.';

COMMENT ON COLUMN app.comprev_cases.tce_process_url IS
'Endereço público do processo de registro do benefício no TCE-MT.';

COMMENT ON COLUMN app.comprev_cases.compensation_direction IS
'Indica se a compensação é a receber ou a pagar pelo RPPS.';

COMMENT ON COLUMN app.comprev_cases.status IS
'Etapa operacional atual do processo no fluxo do COMPREV.';

-- =============================================================================
-- ÍNDICES
-- =============================================================================

CREATE UNIQUE INDEX comprev_cases_tce_process_unique_idx
ON app.comprev_cases (
    tce_process_number,
    tce_process_year
)
WHERE
    tce_process_number IS NOT NULL
    AND tce_process_year IS NOT NULL;

CREATE UNIQUE INDEX comprev_cases_protocol_unique_idx
ON app.comprev_cases (
    lower(comprev_protocol_number)
)
WHERE comprev_protocol_number IS NOT NULL;

CREATE INDEX comprev_cases_beneficiary_name_idx
ON app.comprev_cases (
    lower(beneficiary_name)
);

CREATE INDEX comprev_cases_cpf_idx
ON app.comprev_cases (
    beneficiary_cpf
)
WHERE beneficiary_cpf IS NOT NULL;

CREATE INDEX comprev_cases_status_idx
ON app.comprev_cases (
    status,
    updated_at DESC
)
WHERE archived_at IS NULL;

CREATE INDEX comprev_cases_requirement_deadline_idx
ON app.comprev_cases (
    requirement_deadline
)
WHERE
    status = 'requirement'
    AND archived_at IS NULL;

CREATE INDEX comprev_cases_payment_idx
ON app.comprev_cases (
    payment_start_date,
    payment_end_date
)
WHERE status = 'payment_active';

CREATE INDEX comprev_cases_search_idx
ON app.comprev_cases
USING gin (
    to_tsvector(
        'portuguese',
        coalesce(beneficiary_name, '') || ' ' ||
        coalesce(benefit_number, '') || ' ' ||
        coalesce(comprev_protocol_number, '') || ' ' ||
        coalesce(tce_process_number, '') || ' ' ||
        coalesce(source_benefit_description, '')
    )
);

CREATE TRIGGER trg_comprev_cases_updated_at
BEFORE UPDATE
ON app.comprev_cases
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

-- =============================================================================
-- PERMISSÕES
-- =============================================================================

INSERT INTO app.permissions (
    module_id,
    code,
    name,
    description
)
SELECT
    module_record.id,
    permission_data.code,
    permission_data.name,
    permission_data.description
FROM app.modules AS module_record
CROSS JOIN (
    VALUES
        (
            'comprev.cases.read',
            'Consultar processos do COMPREV',
            'Permite consultar processos de compensação previdenciária.'
        ),
        (
            'comprev.cases.create',
            'Cadastrar processos do COMPREV',
            'Permite cadastrar processos de compensação previdenciária.'
        ),
        (
            'comprev.cases.update',
            'Editar processos do COMPREV',
            'Permite atualizar processos e informações operacionais.'
        ),
        (
            'comprev.cases.manage',
            'Gerenciar processos do COMPREV',
            'Permite protocolar, registrar exigências, decisões e pagamentos.'
        ),
        (
            'comprev.cases.archive',
            'Arquivar processos do COMPREV',
            'Permite arquivar processos preservando o histórico administrativo.'
        )
) AS permission_data (
    code,
    name,
    description
)
WHERE module_record.code = 'comprev'
ON CONFLICT (code)
DO UPDATE SET
    module_id = EXCLUDED.module_id,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = now();

-- =============================================================================
-- PAPEL DO GESTOR DO COMPREV
-- =============================================================================

INSERT INTO app.roles (
    name,
    description,
    scope,
    module_id,
    is_system
)
SELECT
    'comprev_manager',
    'Gestor do módulo COMPREV, autorizado a consultar, cadastrar, editar, gerenciar e arquivar processos de compensação previdenciária.',
    'module',
    module_record.id,
    true
FROM app.modules AS module_record
WHERE module_record.code = 'comprev'
ON CONFLICT (name)
DO UPDATE SET
    description = EXCLUDED.description,
    scope = EXCLUDED.scope,
    module_id = EXCLUDED.module_id,
    is_system = EXCLUDED.is_system,
    updated_at = now();

INSERT INTO app.role_permissions (
    role_id,
    permission_id
)
SELECT
    role_record.id,
    permission_record.id
FROM app.roles AS role_record
JOIN app.permissions AS permission_record
  ON permission_record.code IN (
      'comprev.cases.read',
      'comprev.cases.create',
      'comprev.cases.update',
      'comprev.cases.manage',
      'comprev.cases.archive'
  )
WHERE role_record.name = 'comprev_manager'
ON CONFLICT (role_id, permission_id)
DO NOTHING;

-- Administradores globais recebem todas as permissões do COMPREV.

INSERT INTO app.role_permissions (
    role_id,
    permission_id
)
SELECT
    role_record.id,
    permission_record.id
FROM app.roles AS role_record
JOIN app.permissions AS permission_record
  ON permission_record.code LIKE 'comprev.%'
WHERE role_record.name = 'administrator'
  AND role_record.scope = 'global'
  AND role_record.module_id IS NULL
ON CONFLICT (role_id, permission_id)
DO NOTHING;

-- =============================================================================
-- VALIDAÇÃO
-- =============================================================================

DO $$
DECLARE
    v_permission_count integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM app.modules
        WHERE code = 'comprev'
          AND is_active = true
    ) THEN
        RAISE EXCEPTION
            'O módulo COMPREV não está ativo.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM app.roles AS role_record
        JOIN app.modules AS module_record
          ON module_record.id = role_record.module_id
        WHERE role_record.name = 'comprev_manager'
          AND role_record.scope = 'module'
          AND module_record.code = 'comprev'
    ) THEN
        RAISE EXCEPTION
            'O papel comprev_manager não foi configurado corretamente.';
    END IF;

    SELECT count(*)
    INTO v_permission_count
    FROM app.role_permissions AS role_permission
    JOIN app.roles AS role_record
      ON role_record.id = role_permission.role_id
    JOIN app.permissions AS permission_record
      ON permission_record.id = role_permission.permission_id
    WHERE role_record.name = 'comprev_manager'
      AND permission_record.code LIKE 'comprev.%';

    IF v_permission_count <> 5 THEN
        RAISE EXCEPTION
            'O papel comprev_manager deve possuir 5 permissões; encontradas %.',
            v_permission_count;
    END IF;
END;
$$;

COMMIT;