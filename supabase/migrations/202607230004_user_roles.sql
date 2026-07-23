BEGIN;

-- -----------------------------------------------------------------------------
-- Relação entre usuários e papéis
-- -----------------------------------------------------------------------------

CREATE TABLE app.user_roles (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,

    assigned_at timestamptz NOT NULL DEFAULT now(),

    assigned_by uuid,

    CONSTRAINT pk_user_roles
        PRIMARY KEY (user_id, role_id),

    CONSTRAINT fk_user_roles_user
        FOREIGN KEY (user_id)
        REFERENCES app.users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_user_roles_role
        FOREIGN KEY (role_id)
        REFERENCES app.roles(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_user_roles_assigned_by
        FOREIGN KEY (assigned_by)
        REFERENCES app.users(id)
        ON DELETE SET NULL
);

COMMENT ON TABLE app.user_roles IS
'Relaciona usuários aos papéis atribuídos no SIGPREVI.';

COMMENT ON COLUMN app.user_roles.user_id IS
'Usuário que recebeu o papel.';

COMMENT ON COLUMN app.user_roles.role_id IS
'Papel atribuído ao usuário.';

COMMENT ON COLUMN app.user_roles.assigned_at IS
'Data e hora da atribuição do papel.';

COMMENT ON COLUMN app.user_roles.assigned_by IS
'Usuário responsável pela atribuição do papel.';

CREATE INDEX idx_user_roles_role_id
    ON app.user_roles(role_id);

CREATE INDEX idx_user_roles_assigned_by
    ON app.user_roles(assigned_by);

COMMIT;