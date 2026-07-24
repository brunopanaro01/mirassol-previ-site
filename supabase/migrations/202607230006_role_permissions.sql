BEGIN;

-- -----------------------------------------------------------------------------
-- Relação entre papéis e permissões
-- -----------------------------------------------------------------------------

CREATE TABLE app.role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL,

    granted_at timestamptz NOT NULL DEFAULT now(),

    granted_by uuid,

    CONSTRAINT pk_role_permissions
        PRIMARY KEY (role_id, permission_id),

    CONSTRAINT fk_role_permissions_role
        FOREIGN KEY (role_id)
        REFERENCES app.roles(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_role_permissions_permission
        FOREIGN KEY (permission_id)
        REFERENCES app.permissions(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_role_permissions_granted_by
        FOREIGN KEY (granted_by)
        REFERENCES app.users(id)
        ON DELETE SET NULL
);

COMMENT ON TABLE app.role_permissions IS
'Relaciona papéis às permissões do sistema.';

COMMENT ON COLUMN app.role_permissions.role_id IS
'Papel que recebe a permissão.';

COMMENT ON COLUMN app.role_permissions.permission_id IS
'Permissão atribuída ao papel.';

COMMENT ON COLUMN app.role_permissions.granted_at IS
'Data e hora da concessão da permissão.';

COMMENT ON COLUMN app.role_permissions.granted_by IS
'Usuário responsável pela concessão da permissão.';

CREATE INDEX idx_role_permissions_permission
    ON app.role_permissions(permission_id);

CREATE INDEX idx_role_permissions_granted_by
    ON app.role_permissions(granted_by);

COMMIT;