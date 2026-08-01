BEGIN;

-- =============================================================================
-- DADOS INICIAIS DE CONTROLE DE ACESSO
-- =============================================================================
-- Cria o papel global de administrador, as permissões iniciais do Core e os
-- respectivos vínculos.
--
-- Esta migration não atribui o papel de administrador a nenhum usuário.
-- Essa atribuição será feita posteriormente por procedimento controlado.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- MÓDULO CORE
-- -----------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM app.modules
        WHERE code = 'core'
    ) THEN
        RAISE EXCEPTION
            'O módulo core não foi encontrado em app.modules.';
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- PAPEL GLOBAL DE ADMINISTRADOR
-- -----------------------------------------------------------------------------

INSERT INTO app.roles (
    name,
    description,
    scope,
    module_id,
    is_system
)
VALUES (
    'administrator',
    'Administrador global do SIGPREVI, com acesso integral às funcionalidades administrativas.',
    'global',
    NULL,
    true
)
ON CONFLICT (name)
DO UPDATE SET
    description = EXCLUDED.description,
    scope = EXCLUDED.scope,
    module_id = EXCLUDED.module_id,
    is_system = EXCLUDED.is_system,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- PERMISSÕES INICIAIS DO CORE
-- -----------------------------------------------------------------------------

INSERT INTO app.permissions (
    code,
    name,
    description,
    module_id
)
SELECT
    seed.code,
    seed.name,
    seed.description,
    module.id
FROM (
    VALUES
        (
            'core.users.read',
            'Consultar usuários',
            'Permite consultar os usuários cadastrados no SIGPREVI.'
        ),
        (
            'core.users.create',
            'Criar usuários',
            'Permite criar perfis de usuários no SIGPREVI.'
        ),
        (
            'core.users.update',
            'Alterar usuários',
            'Permite alterar dados e configurações de usuários.'
        ),
        (
            'core.users.delete',
            'Excluir usuários',
            'Permite excluir perfis de usuários quando legal e tecnicamente permitido.'
        ),
        (
            'core.modules.read',
            'Consultar módulos',
            'Permite consultar módulos ativos e inativos do SIGPREVI.'
        ),
        (
            'core.modules.create',
            'Criar módulos',
            'Permite cadastrar novos módulos no SIGPREVI.'
        ),
        (
            'core.modules.update',
            'Alterar módulos',
            'Permite alterar dados e disponibilidade dos módulos.'
        ),
        (
            'core.modules.delete',
            'Excluir módulos',
            'Permite excluir módulos que não possuam dependências impeditivas.'
        ),
        (
            'core.access_control.read',
            'Consultar controle de acesso',
            'Permite consultar papéis, permissões e vínculos de acesso.'
        ),
        (
            'core.access_control.manage',
            'Gerenciar controle de acesso',
            'Permite criar, alterar e remover papéis, permissões e vínculos de acesso.'
        ),
        (
            'core.audit.read',
            'Consultar auditoria',
            'Permite consultar os registros de auditoria do SIGPREVI.'
        ),
        (
            'core.settings.read',
            'Consultar configurações',
            'Permite consultar configurações gerais do sistema.'
        ),
        (
            'core.settings.manage',
            'Gerenciar configurações',
            'Permite alterar configurações gerais do sistema.'
        )
) AS seed (
    code,
    name,
    description
)
CROSS JOIN app.modules AS module
WHERE module.code = 'core'
ON CONFLICT (code)
DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    module_id = EXCLUDED.module_id,
    updated_at = now();

-- -----------------------------------------------------------------------------
-- TODAS AS PERMISSÕES DO CORE PARA O ADMINISTRADOR
-- -----------------------------------------------------------------------------

INSERT INTO app.role_permissions (
    role_id,
    permission_id
)
SELECT
    role_record.id,
    permission_record.id
FROM app.roles AS role_record
CROSS JOIN app.permissions AS permission_record
JOIN app.modules AS module_record
  ON module_record.id = permission_record.module_id
WHERE role_record.name = 'administrator'
  AND module_record.code = 'core'
ON CONFLICT (role_id, permission_id)
DO NOTHING;

-- -----------------------------------------------------------------------------
-- VALIDAÇÕES
-- -----------------------------------------------------------------------------

DO $$
DECLARE
    v_expected_permissions integer := 13;
    v_created_permissions integer;
    v_linked_permissions integer;
BEGIN
    SELECT count(*)
    INTO v_created_permissions
    FROM app.permissions AS permission_record
    JOIN app.modules AS module_record
      ON module_record.id = permission_record.module_id
    WHERE module_record.code = 'core'
      AND permission_record.code IN (
          'core.users.read',
          'core.users.create',
          'core.users.update',
          'core.users.delete',
          'core.modules.read',
          'core.modules.create',
          'core.modules.update',
          'core.modules.delete',
          'core.access_control.read',
          'core.access_control.manage',
          'core.audit.read',
          'core.settings.read',
          'core.settings.manage'
      );

    IF v_created_permissions <> v_expected_permissions THEN
        RAISE EXCEPTION
            'Falha ao criar permissões iniciais: esperadas %, encontradas %.',
            v_expected_permissions,
            v_created_permissions;
    END IF;

    SELECT count(*)
    INTO v_linked_permissions
    FROM app.role_permissions AS role_permission
    JOIN app.roles AS role_record
      ON role_record.id = role_permission.role_id
    JOIN app.permissions AS permission_record
      ON permission_record.id = role_permission.permission_id
    WHERE role_record.name = 'administrator'
      AND permission_record.code IN (
          'core.users.read',
          'core.users.create',
          'core.users.update',
          'core.users.delete',
          'core.modules.read',
          'core.modules.create',
          'core.modules.update',
          'core.modules.delete',
          'core.access_control.read',
          'core.access_control.manage',
          'core.audit.read',
          'core.settings.read',
          'core.settings.manage'
      );

    IF v_linked_permissions <> v_expected_permissions THEN
        RAISE EXCEPTION
            'Falha ao vincular permissões ao administrador: esperadas %, encontradas %.',
            v_expected_permissions,
            v_linked_permissions;
    END IF;
END;
$$;

COMMIT;