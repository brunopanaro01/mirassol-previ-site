BEGIN;

-- =============================================================================
-- MÓDULO DE LEGISLAÇÃO E ATOS NORMATIVOS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TIPOS DE ATOS NORMATIVOS
-- -----------------------------------------------------------------------------

CREATE TABLE app.legislation_document_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    code text NOT NULL UNIQUE,
    name text NOT NULL,
    plural_name text NOT NULL,

    description text,

    display_order integer NOT NULL DEFAULT 0,

    is_active boolean NOT NULL DEFAULT true,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT legislation_document_types_code_format_chk
        CHECK (code ~ '^[a-z][a-z0-9_]*$'),

    CONSTRAINT legislation_document_types_name_not_empty_chk
        CHECK (length(trim(name)) > 0),

    CONSTRAINT legislation_document_types_plural_name_not_empty_chk
        CHECK (length(trim(plural_name)) > 0)
);

COMMENT ON TABLE app.legislation_document_types IS
'Tipos de atos normativos cadastráveis no módulo de legislação.';

-- -----------------------------------------------------------------------------
-- DOCUMENTOS LEGISLATIVOS
-- -----------------------------------------------------------------------------

CREATE TABLE app.legislation_documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    document_type_id uuid NOT NULL
        REFERENCES app.legislation_document_types(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    number text NOT NULL,

    year integer NOT NULL,

    publication_date date,

    title text,

    summary text NOT NULL,

    description text,

    status text NOT NULL DEFAULT 'in_force',

    file_path text,

    external_url text,

    is_published boolean NOT NULL DEFAULT false,

    published_at timestamptz,

    created_by uuid
        REFERENCES app.users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    updated_by uuid
        REFERENCES app.users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    published_by uuid
        REFERENCES app.users(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    created_at timestamptz NOT NULL DEFAULT now(),

    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT legislation_documents_number_not_empty_chk
        CHECK (length(trim(number)) > 0),

    CONSTRAINT legislation_documents_year_chk
        CHECK (year BETWEEN 1900 AND 2200),

    CONSTRAINT legislation_documents_summary_not_empty_chk
        CHECK (length(trim(summary)) > 0),

    CONSTRAINT legislation_documents_status_chk
        CHECK (
            status IN (
                'in_force',
                'revoked',
                'amended',
                'suspended',
                'without_effect'
            )
        ),

    CONSTRAINT legislation_documents_file_or_url_chk
        CHECK (
            file_path IS NOT NULL
            OR external_url IS NOT NULL
        ),

    CONSTRAINT legislation_documents_file_path_chk
        CHECK (
            file_path IS NULL
            OR (
                file_path !~ '(^/|\.\.)'
                AND file_path ~* '\.pdf$'
            )
        ),

    CONSTRAINT legislation_documents_external_url_chk
        CHECK (
            external_url IS NULL
            OR external_url ~* '^https://'
        ),

    CONSTRAINT legislation_documents_published_metadata_chk
        CHECK (
            (
                is_published = false
                AND published_at IS NULL
                AND published_by IS NULL
            )
            OR
            (
                is_published = true
                AND published_at IS NOT NULL
                AND published_by IS NOT NULL
            )
        )
);

COMMENT ON TABLE app.legislation_documents IS
'Leis, decretos, portarias e demais atos normativos publicados pelo SIGPREVI.';

-- -----------------------------------------------------------------------------
-- UNICIDADE DO DOCUMENTO
-- -----------------------------------------------------------------------------

CREATE UNIQUE INDEX legislation_documents_unique_document_idx
ON app.legislation_documents (
    document_type_id,
    lower(number),
    year
);

-- -----------------------------------------------------------------------------
-- ÍNDICES
-- -----------------------------------------------------------------------------

CREATE INDEX legislation_document_types_active_order_idx
ON app.legislation_document_types (
    is_active,
    display_order
);

CREATE INDEX legislation_documents_type_idx
ON app.legislation_documents (
    document_type_id
);

CREATE INDEX legislation_documents_year_idx
ON app.legislation_documents (
    year DESC
);

CREATE INDEX legislation_documents_status_idx
ON app.legislation_documents (
    status
);

CREATE INDEX legislation_documents_published_idx
ON app.legislation_documents (
    is_published,
    publication_date DESC,
    year DESC
);

CREATE INDEX legislation_documents_created_by_idx
ON app.legislation_documents (
    created_by
);

CREATE INDEX legislation_documents_summary_search_idx
ON app.legislation_documents
USING gin (
    to_tsvector(
        'portuguese',
        coalesce(title, '') || ' ' ||
        coalesce(summary, '') || ' ' ||
        coalesce(description, '')
    )
);

-- -----------------------------------------------------------------------------
-- TRIGGERS DE ATUALIZAÇÃO
-- -----------------------------------------------------------------------------

CREATE TRIGGER trg_legislation_document_types_updated_at
BEFORE UPDATE
ON app.legislation_document_types
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER trg_legislation_documents_updated_at
BEFORE UPDATE
ON app.legislation_documents
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

-- -----------------------------------------------------------------------------
-- TIPOS INICIAIS
-- -----------------------------------------------------------------------------

INSERT INTO app.legislation_document_types (
    code,
    name,
    plural_name,
    description,
    display_order
)
VALUES
    (
        'law',
        'Lei',
        'Leis',
        'Lei ordinária.',
        10
    ),
    (
        'complementary_law',
        'Lei Complementar',
        'Leis Complementares',
        'Lei complementar.',
        20
    ),
    (
        'decree',
        'Decreto',
        'Decretos',
        'Decreto regulamentar ou administrativo.',
        30
    ),
    (
        'ordinance',
        'Portaria',
        'Portarias',
        'Portaria administrativa.',
        40
    ),
    (
        'resolution',
        'Resolução',
        'Resoluções',
        'Resolução de conselho, comitê ou órgão colegiado.',
        50
    ),
    (
        'normative_instruction',
        'Instrução Normativa',
        'Instruções Normativas',
        'Instrução normativa.',
        60
    ),
    (
        'other',
        'Outro ato normativo',
        'Outros atos normativos',
        'Outros atos não abrangidos pelos tipos anteriores.',
        100
    )
ON CONFLICT (code)
DO UPDATE SET
    name = EXCLUDED.name,
    plural_name = EXCLUDED.plural_name,
    description = EXCLUDED.description,
    display_order = EXCLUDED.display_order,
    is_active = true,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- PERMISSÕES DO MÓDULO
-- -----------------------------------------------------------------------------

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
            'legislation.documents.read',
            'Consultar documentos legislativos',
            'Permite consultar documentos e atos normativos.'
        ),
        (
            'legislation.documents.create',
            'Cadastrar documentos legislativos',
            'Permite cadastrar leis, decretos, portarias e outros atos.'
        ),
        (
            'legislation.documents.update',
            'Editar documentos legislativos',
            'Permite atualizar documentos e atos normativos.'
        ),
        (
            'legislation.documents.delete',
            'Excluir documentos legislativos',
            'Permite excluir documentos quando não houver impedimento.'
        ),
        (
            'legislation.documents.publish',
            'Publicar documentos legislativos',
            'Permite publicar e despublicar documentos no portal.'
        )
) AS permission_data (
    code,
    name,
    description
)
WHERE module_record.code = 'legislation'
ON CONFLICT (code)
DO UPDATE SET
    module_id = EXCLUDED.module_id,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- ATRIBUIÇÃO DAS PERMISSÕES AO ADMINISTRADOR
-- -----------------------------------------------------------------------------

INSERT INTO app.role_permissions (
    role_id,
    permission_id
)
SELECT
    role_record.id,
    permission_record.id
FROM app.roles AS role_record
JOIN app.permissions AS permission_record
  ON permission_record.code LIKE 'legislation.%'
WHERE role_record.name = 'administrator'
  AND role_record.scope = 'global'
  AND role_record.module_id IS NULL
ON CONFLICT (role_id, permission_id)
DO NOTHING;

COMMIT;