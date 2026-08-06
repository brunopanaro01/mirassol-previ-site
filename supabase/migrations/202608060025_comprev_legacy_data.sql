BEGIN;

-- =============================================================================
-- IDENTIFICAÇÃO DE REGISTROS IMPORTADOS DO SISTEMA ANTERIOR
-- =============================================================================

ALTER TABLE app.comprev_cases
    ADD COLUMN legacy_id bigint,
    ADD COLUMN legacy_status text,
    ADD COLUMN legacy_imported_at timestamptz;

CREATE UNIQUE INDEX comprev_cases_legacy_id_unique_idx
    ON app.comprev_cases (legacy_id)
    WHERE legacy_id IS NOT NULL;

COMMENT ON COLUMN app.comprev_cases.legacy_id IS
'Identificador original do processo no banco SQLite legado.';

COMMENT ON COLUMN app.comprev_cases.legacy_status IS
'Situação original do processo antes da conversão para o fluxo atual.';

COMMENT ON COLUMN app.comprev_cases.legacy_imported_at IS
'Data e hora em que o processo legado foi importado.';

-- =============================================================================
-- IMPORTAÇÕES MENSAIS DO COMPREV
-- =============================================================================

CREATE TABLE app.comprev_imports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    legacy_id bigint,

    reference_period text NOT NULL,

    source_file_name text,

    record_count integer NOT NULL DEFAULT 0,

    flow_amount numeric(14,2) NOT NULL DEFAULT 0,

    stock_amount numeric(14,2) NOT NULL DEFAULT 0,

    total_amount numeric(14,2) NOT NULL DEFAULT 0,

    notes text,

    imported_at timestamptz NOT NULL DEFAULT now(),

    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT comprev_imports_reference_period_chk
        CHECK (
            reference_period ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'
            OR reference_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
        ),

    CONSTRAINT comprev_imports_record_count_chk
        CHECK (record_count >= 0),

    CONSTRAINT comprev_imports_amounts_chk
        CHECK (
            flow_amount >= 0
            AND stock_amount >= 0
            AND total_amount >= 0
        )
);

CREATE UNIQUE INDEX comprev_imports_legacy_id_unique_idx
    ON app.comprev_imports (legacy_id)
    WHERE legacy_id IS NOT NULL;

CREATE INDEX comprev_imports_reference_period_idx
    ON app.comprev_imports (reference_period);

COMMENT ON TABLE app.comprev_imports IS
'Importações periódicas dos demonstrativos financeiros do COMPREV.';

-- =============================================================================
-- RECEBIMENTOS E CRÉDITOS DO COMPREV
-- =============================================================================

CREATE TABLE app.comprev_receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    legacy_id bigint,

    import_id uuid NOT NULL
        REFERENCES app.comprev_imports(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    case_id uuid
        REFERENCES app.comprev_cases(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    reference_period text NOT NULL,

    comparison_key text NOT NULL,

    comprev_protocol_number text,

    beneficiary_name text NOT NULL,

    beneficiary_registration text,

    beneficiary_cpf text,

    beneficiary_nit text,

    benefit_number text,

    request_type text,

    retirement_type text,

    applicant_name text,

    recipient_name text,

    stock_amount numeric(14,2) NOT NULL DEFAULT 0,

    stock_thirteenth_amount numeric(14,2) NOT NULL DEFAULT 0,

    flow_amount numeric(14,2) NOT NULL DEFAULT 0,

    flow_thirteenth_amount numeric(14,2) NOT NULL DEFAULT 0,

    accumulated_flow_amount numeric(14,2) NOT NULL DEFAULT 0,

    monthly_pro_rata_amount numeric(14,2) NOT NULL DEFAULT 0,

    total_amount numeric(14,2) NOT NULL DEFAULT 0,

    period_start_date date,

    period_end_date date,

    source_data jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT comprev_receipts_beneficiary_name_chk
        CHECK (length(trim(beneficiary_name)) > 0),

    CONSTRAINT comprev_receipts_cpf_chk
        CHECK (
            beneficiary_cpf IS NULL
            OR beneficiary_cpf ~ '^[0-9]{11}$'
        ),

    CONSTRAINT comprev_receipts_source_data_chk
        CHECK (jsonb_typeof(source_data) = 'object'),

    CONSTRAINT comprev_receipts_dates_chk
        CHECK (
            period_end_date IS NULL
            OR period_start_date IS NULL
            OR period_end_date >= period_start_date
        )
);

CREATE UNIQUE INDEX comprev_receipts_legacy_id_unique_idx
    ON app.comprev_receipts (legacy_id)
    WHERE legacy_id IS NOT NULL;

CREATE INDEX comprev_receipts_import_id_idx
    ON app.comprev_receipts (import_id);

CREATE INDEX comprev_receipts_case_id_idx
    ON app.comprev_receipts (case_id);

CREATE INDEX comprev_receipts_reference_period_idx
    ON app.comprev_receipts (reference_period);

CREATE INDEX comprev_receipts_cpf_idx
    ON app.comprev_receipts (beneficiary_cpf)
    WHERE beneficiary_cpf IS NOT NULL;

COMMENT ON TABLE app.comprev_receipts IS
'Valores de fluxo, estoque e créditos recebidos por competência no COMPREV.';

-- =============================================================================
-- ACHADOS DE CONFERÊNCIA E AUDITORIA
-- =============================================================================

CREATE TABLE app.comprev_findings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    legacy_id bigint,

    import_id uuid NOT NULL
        REFERENCES app.comprev_imports(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    case_id uuid
        REFERENCES app.comprev_cases(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    receipt_id uuid
        REFERENCES app.comprev_receipts(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    reference_period text NOT NULL,

    finding_type text NOT NULL,

    beneficiary_name text NOT NULL,

    description text NOT NULL,

    previous_amount numeric(14,2),

    current_amount numeric(14,2),

    difference_amount numeric(14,2),

    percentage_change numeric(12,6),

    status text NOT NULL DEFAULT 'open',

    legacy_status text,

    reason text,

    justification text,

    responsible_name text,

    justified_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT comprev_findings_type_chk
        CHECK (length(trim(finding_type)) > 0),

    CONSTRAINT comprev_findings_name_chk
        CHECK (length(trim(beneficiary_name)) > 0),

    CONSTRAINT comprev_findings_description_chk
        CHECK (length(trim(description)) > 0),

    CONSTRAINT comprev_findings_status_chk
        CHECK (
            status IN (
                'open',
                'under_review',
                'justified',
                'resolved',
                'dismissed'
            )
        )
);

CREATE UNIQUE INDEX comprev_findings_legacy_id_unique_idx
    ON app.comprev_findings (legacy_id)
    WHERE legacy_id IS NOT NULL;

CREATE INDEX comprev_findings_import_id_idx
    ON app.comprev_findings (import_id);

CREATE INDEX comprev_findings_case_id_idx
    ON app.comprev_findings (case_id);

CREATE INDEX comprev_findings_receipt_id_idx
    ON app.comprev_findings (receipt_id);

CREATE INDEX comprev_findings_status_idx
    ON app.comprev_findings (status, reference_period);

COMMENT ON TABLE app.comprev_findings IS
'Inconsistências e ocorrências identificadas na conferência dos recebimentos.';

-- =============================================================================
-- HISTÓRICO OPERACIONAL ANTERIOR
-- =============================================================================

CREATE TABLE app.comprev_status_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    legacy_id bigint,

    case_id uuid NOT NULL
        REFERENCES app.comprev_cases(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    previous_status text,

    new_status text NOT NULL,

    responsible_name text,

    notes text,

    occurred_at timestamptz NOT NULL DEFAULT now(),

    imported_from_legacy boolean NOT NULL DEFAULT false,

    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT comprev_status_history_new_status_chk
        CHECK (length(trim(new_status)) > 0)
);

CREATE UNIQUE INDEX comprev_status_history_legacy_id_unique_idx
    ON app.comprev_status_history (legacy_id)
    WHERE legacy_id IS NOT NULL;

CREATE INDEX comprev_status_history_case_id_idx
    ON app.comprev_status_history (case_id, occurred_at DESC);

COMMENT ON TABLE app.comprev_status_history IS
'Histórico das alterações de situação dos processos COMPREV.';

-- =============================================================================
-- PROTEÇÃO DOS DADOS
-- =============================================================================

ALTER TABLE app.comprev_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.comprev_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.comprev_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.comprev_status_history ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE app.comprev_imports
    FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE app.comprev_receipts
    FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE app.comprev_findings
    FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE app.comprev_status_history
    FROM PUBLIC, anon, authenticated;

COMMIT;