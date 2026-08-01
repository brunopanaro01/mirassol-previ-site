BEGIN;

-- -----------------------------------------------------------------------------
-- Tabela de usuários da aplicação
-- -----------------------------------------------------------------------------

CREATE TABLE app.users (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    full_name text NOT NULL,

    registration text,

    status app.account_status NOT NULL DEFAULT 'pending',

    last_login_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT now(),

    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE app.users IS
'Perfil dos usuários do SIGPREVI.';

COMMENT ON COLUMN app.users.id IS
'Identificador do usuário, vinculado ao auth.users.';

COMMENT ON COLUMN app.users.full_name IS
'Nome completo do usuário.';

COMMENT ON COLUMN app.users.registration IS
'Matrícula do servidor.';

COMMENT ON COLUMN app.users.status IS
'Situação da conta do usuário.';

COMMENT ON COLUMN app.users.last_login_at IS
'Data e hora do último login realizado.';

CREATE INDEX idx_users_registration
    ON app.users(registration);

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON app.users
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

COMMIT;