-- =============================================================================
-- SIGPREVI Core v1.0
-- Migration: 202607230001_foundation_schema_types
-- Descrição: Fundação do banco (schema, extensão, enums e função comum)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Schema
-- -----------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS app;

COMMENT ON SCHEMA app IS
'Schema interno do SIGPREVI para componentes comuns da aplicação.';

-- -----------------------------------------------------------------------------
-- Extensões
-- -----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pgcrypto;

COMMENT ON EXTENSION pgcrypto IS
'Extensão utilizada para UUIDs e funções criptográficas.';

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------

CREATE TYPE app.account_status AS ENUM (
    'pending',
    'active',
    'inactive',
    'blocked'
);

COMMENT ON TYPE app.account_status IS
'Situação de contas de usuários.';

CREATE TYPE app.role_scope AS ENUM (
    'global',
    'module'
);

COMMENT ON TYPE app.role_scope IS
'Escopo de aplicação de uma função.';

CREATE TYPE app.audit_operation AS ENUM (
    'insert',
    'update',
    'delete',
    'login',
    'logout',
    'execute'
);

COMMENT ON TYPE app.audit_operation IS
'Operações auditáveis do sistema.';

CREATE TYPE app.audit_result AS ENUM (
    'success',
    'failure',
    'denied'
);

COMMENT ON TYPE app.audit_result IS
'Resultado da operação auditada.';

CREATE TYPE app.module_status AS ENUM (
    'active',
    'inactive'
);

COMMENT ON TYPE app.module_status IS
'Situação de um módulo do sistema.';

CREATE TYPE app.environment_type AS ENUM (
    'development',
    'homologation',
    'production'
);

COMMENT ON TYPE app.environment_type IS
'Identificação do ambiente de execução.';

-- -----------------------------------------------------------------------------
-- Função comum
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION app.set_updated_at() IS
'Atualiza automaticamente o campo updated_at.';

COMMIT;