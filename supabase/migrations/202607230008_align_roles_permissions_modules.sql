BEGIN;

-- -----------------------------------------------------------------------------
-- Papéis vinculados a módulos
-- -----------------------------------------------------------------------------

ALTER TABLE app.roles
ADD COLUMN module_id smallint;

ALTER TABLE app.roles
ADD CONSTRAINT fk_roles_module
FOREIGN KEY (module_id)
REFERENCES app.modules(id)
ON DELETE RESTRICT;

ALTER TABLE app.roles
ADD CONSTRAINT ck_roles_scope_module
CHECK (
    (scope = 'global' AND module_id IS NULL)
    OR
    (scope = 'module' AND module_id IS NOT NULL)
);

COMMENT ON COLUMN app.roles.module_id IS
'Módulo ao qual o papel pertence quando seu escopo for module.';

CREATE INDEX idx_roles_module_id
ON app.roles(module_id);

-- -----------------------------------------------------------------------------
-- Permissões vinculadas a módulos
-- -----------------------------------------------------------------------------

ALTER TABLE app.permissions
ADD COLUMN module_id smallint;

-- Converte eventuais valores já cadastrados na coluna textual.
UPDATE app.permissions AS permission
SET module_id = module.id
FROM app.modules AS module
WHERE lower(trim(permission.module)) = lower(module.code)
   OR lower(trim(permission.module)) = lower(module.name);

-- Interrompe a migration caso exista permissão sem módulo correspondente.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM app.permissions
        WHERE module_id IS NULL
    ) THEN
        RAISE EXCEPTION
            'Existem permissões cujo módulo textual não corresponde a app.modules.';
    END IF;
END;
$$;

ALTER TABLE app.permissions
ALTER COLUMN module_id SET NOT NULL;

ALTER TABLE app.permissions
ADD CONSTRAINT fk_permissions_module
FOREIGN KEY (module_id)
REFERENCES app.modules(id)
ON DELETE RESTRICT;

COMMENT ON COLUMN app.permissions.module_id IS
'Módulo ao qual a permissão pertence.';

DROP INDEX IF EXISTS app.idx_permissions_module;

ALTER TABLE app.permissions
DROP COLUMN module;

CREATE INDEX idx_permissions_module_id
ON app.permissions(module_id);

COMMIT;