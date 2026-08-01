BEGIN;

-- -----------------------------------------------------------------------------
-- Módulos do sistema
-- -----------------------------------------------------------------------------

CREATE TABLE app.modules (
    id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    code text NOT NULL,

    name text NOT NULL,

    description text,

    is_active boolean NOT NULL DEFAULT true,

    created_at timestamptz NOT NULL DEFAULT now(),

    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_modules_code UNIQUE (code),

    CONSTRAINT uq_modules_name UNIQUE (name)
);

COMMENT ON TABLE app.modules IS
'Módulos disponíveis no SIGPREVI.';

COMMENT ON COLUMN app.modules.code IS
'Código interno do módulo.';

COMMENT ON COLUMN app.modules.name IS
'Nome do módulo.';

COMMENT ON COLUMN app.modules.description IS
'Descrição do módulo.';

COMMENT ON COLUMN app.modules.is_active IS
'Indica se o módulo está disponível para uso.';

CREATE TRIGGER trg_modules_updated_at
BEFORE UPDATE ON app.modules
FOR EACH ROW
EXECUTE FUNCTION app.set_updated_at();

-- -----------------------------------------------------------------------------
-- Dados iniciais
-- -----------------------------------------------------------------------------

INSERT INTO app.modules (code, name, description)
VALUES
('core', 'Core', 'Infraestrutura do sistema'),
('benefits', 'Benefícios', 'Gestão de aposentadorias e pensões'),
('investments', 'Investimentos', 'Carteira de investimentos'),
('consignments', 'Consignados', 'Empréstimos consignados'),
('comprev', 'COMPREV', 'Compensação Previdenciária'),
('accounting', 'Contabilidade', 'Integração contábil'),
('protocol', 'Protocolo', 'Processos e documentos'),
('reports', 'Relatórios', 'Relatórios gerenciais'),
('legislation', 'Legislação e Atos Normativos',
 'Gestão e publicação de leis, decretos e portarias'),
('settings', 'Configurações', 'Configurações do sistema');

COMMIT;