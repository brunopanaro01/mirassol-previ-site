BEGIN;

CREATE TABLE app.permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    code text NOT NULL,

    name text NOT NULL,

    description text,

    module text NOT NULL,

    created_at timestamptz NOT NULL DEFAULT now(),

    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_permissions_code UNIQUE (code)
);

COMMENT ON TABLE app.permissions IS
'Permissões disponíveis no SIGPREVI.';

COMMENT ON COLUMN app.permissions.id IS
'Identificador único da permissão.';

COMMENT ON COLUMN app.permissions.code IS
'Código técnico único da permissão.';

COMMENT ON COLUMN app.permissions.name IS
'Nome da permissão.';

COMMENT ON COLUMN app.permissions.description IS
'Descrição da permissão.';

COMMENT ON COLUMN app.permissions.module IS
'Módulo ao qual a permissão pertence.';

CREATE INDEX idx_permissions_module
    ON app.permissions(module);

CREATE TRIGGER trg_permissions_updated_at
BEFORE UPDATE ON app.permissions
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

COMMIT;