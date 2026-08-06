BEGIN;

ALTER TABLE app.comprev_cases
ADD COLUMN beneficiary_registration text,
ADD COLUMN tce_decision_number text,
ADD COLUMN tce_decision_date date,
ADD COLUMN tce_decision_url text,
ADD COLUMN tce_consulted_at timestamptz;

ALTER TABLE app.comprev_cases
ADD CONSTRAINT comprev_cases_tce_decision_url_chk
CHECK (
    tce_decision_url IS NULL
    OR tce_decision_url ~* '^https://'
);

COMMENT ON COLUMN app.comprev_cases.beneficiary_registration IS
'Matrícula do beneficiário preservada do sistema COMPREV anterior.';

COMMENT ON COLUMN app.comprev_cases.tce_decision_number IS
'Número do acórdão ou decisão do TCE-MT.';

COMMENT ON COLUMN app.comprev_cases.tce_decision_date IS
'Data do acórdão ou decisão do TCE-MT.';

COMMENT ON COLUMN app.comprev_cases.tce_decision_url IS
'Endereço eletrônico do acórdão ou decisão do TCE-MT.';

COMMENT ON COLUMN app.comprev_cases.tce_consulted_at IS
'Data e hora da última consulta realizada ao portal do TCE-MT.';

COMMIT;