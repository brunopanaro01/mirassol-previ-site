export const CMS_SCHEMA_VERSION = 1;

export const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export const OPERATIONS = Object.freeze({
  create: "Cadastrar",
  update: "Editar",
  delete: "Excluir"
});

export const CONFIRMATION_TEXT =
  "Confirmo que revisei os dados e que o documento não contém informação pessoal ou sigilosa.";

export const ISSUE_LABELS = Object.freeze({
  module: "Módulo",
  operation: "Operação",
  recordId: "Identificador",
  baseRevision: "Revisão base",
  payload: "Dados estruturados",
  justification: "Justificativa administrativa",
  confirmation: "Confirmação"
});
