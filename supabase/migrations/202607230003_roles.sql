BEGIN;

-- -----------------------------------------------------------------------------
-- Tabela de papéis (roles)
-- -----------------------------------------------------------------------------

CREATE TABLE app.roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    name text NOT NULL,

    description text,

    scope app.role_scope NOT NULL DEFAULT 'module',

    is_system boolean NOT NULL DEFAULT false,

    created_at timestamptz NOT NULL DEFAULT now(),

    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_roles_name UNIQUE (name)
);

COMMENT ON TABLE app.roles IS
'Papéis utilizados para concessão de permissões no SIGPREVI.';

COMMENT ON COLUMN app.roles.id IS
'Identificador único do papel.';

COMMENT ON COLUMN app.roles.name IS
'Nome único do papel.';

COMMENT ON COLUMN app.roles.description IS
'Descrição do papel.';

COMMENT ON COLUMN app.roles.scope IS
'Escopo do papel (global ou módulo).';

COMMENT ON COLUMN app.roles.is_system IS
'Indica se é um papel interno do sistema que não pode ser removido.';

CREATE INDEX idx_roles_scope
ON app.roles(scope);

CREATE TRIGGER trg_roles_updated_at
BEFORE UPDATE ON app.roles
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

COMMIT;