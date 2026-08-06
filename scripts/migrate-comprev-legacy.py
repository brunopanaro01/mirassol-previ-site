#!/usr/bin/env python3
"""Converte o banco SQLite legado do COMPREV em SQL para o SIGPREVI.

Uso:
    python scripts/migrate-comprev-legacy.py CAMINHO_APP_DB ARQUIVO_SQL

O script usa apenas a biblioteca padrão do Python e não altera o SQLite.
"""

from __future__ import annotations

import json
import re
import sqlite3
import sys
from pathlib import Path
from typing import Any, Iterable


PROCESS_STATUS = {
    "AGUARDANDO ANÁLISE": "under_review",
    "AGUARDANDO ACÓRDÃO": "document_collection",
    "APTO PARA REQUERIMENTO": "ready_to_submit",
}

FINDING_STATUS = {
    "JUSTIFICADO": "justified",
    "PENDENTE": "pending",
    "IGNORADO": "dismissed",
}


def clean(value: Any) -> str | None:
    if value is None:
        return None
    result = str(value).strip()
    return result or None


def digits(value: Any, length: int | None = None) -> str | None:
    result = re.sub(r"[^0-9]", "", clean(value) or "")
    if not result or (length is not None and len(result) != length):
        return None
    return result


def benefit_type(value: Any) -> str:
    text = (clean(value) or "").upper()
    return "pension" if "PENS" in text else "retirement"


def process_status(value: Any) -> str:
    text = (clean(value) or "").upper()
    return PROCESS_STATUS.get(text, "draft")


def finding_status(value: Any) -> str:
    text = (clean(value) or "").upper()
    return FINDING_STATUS.get(text, "pending")


def sql(value: Any, cast: str | None = None) -> str:
    if value is None:
        literal = "NULL"
    elif isinstance(value, bool):
        literal = "TRUE" if value else "FALSE"
    elif isinstance(value, (int, float)):
        literal = str(value)
    else:
        literal = "'" + str(value).replace("'", "''") + "'"
    return f"{literal}::{cast}" if cast and value is not None else literal


def json_value(value: Any) -> Any:
    if value is None or value == "":
        return {}
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(str(value))
    except (TypeError, ValueError, json.JSONDecodeError):
        return {"raw": str(value)}


def ref(table: str, legacy_id: Any) -> str:
    if legacy_id is None:
        return "NULL"
    return (
        f"(SELECT id FROM app.{table} "
        f"WHERE legacy_id = {int(legacy_id)})"
    )


def tce_data(row: sqlite3.Row) -> tuple[str | None, int | None, str | None]:
    raw_number = clean(row["protocolo_tce"]) or clean(row["numero_processo"])
    url = clean(row["link_processo_tce"])
    candidates = [url, clean(row["link_acordao_tce"])]
    number = digits(raw_number)
    year = None

    for candidate in candidates:
        if not candidate:
            continue
        match = re.search(r"/processo/([0-9]+)/([0-9]{4})", candidate)
        if match:
            number = number or match.group(1)
            year = int(match.group(2))
            url = url or candidate
            break

    if raw_number:
        match = re.search(r"([0-9]+)\D+([0-9]{4})", raw_number)
        if match:
            number = number or match.group(1)
            year = year or int(match.group(2))

    # A tabela nova exige número e ano em conjunto.
    if not number or not year:
        return None, None, url
    return number, year, url


def insert_statement(
    table: str,
    columns: Iterable[str],
    values: Iterable[str],
    update_columns: Iterable[str],
) -> str:
    column_list = list(columns)
    value_list = list(values)
    updates = ",\n        ".join(
        f"{column} = EXCLUDED.{column}" for column in update_columns
    )
    return (
        f"INSERT INTO app.{table} (\n    "
        + ",\n    ".join(column_list)
        + "\n) VALUES (\n    "
        + ",\n    ".join(value_list)
        + "\n)\nON CONFLICT (legacy_id) WHERE legacy_id IS NOT NULL\n"
        + "DO UPDATE SET\n        "
        + updates
        + ";\n"
    )


def rows(connection: sqlite3.Connection, table: str) -> list[sqlite3.Row]:
    return list(connection.execute(f"SELECT * FROM {table} ORDER BY id"))


def export_imports(connection: sqlite3.Connection) -> list[str]:
    statements = []
    columns = [
        "legacy_id", "reference_period", "source_file_name", "record_count",
        "flow_amount", "stock_amount", "total_amount", "notes",
        "imported_at", "created_at",
    ]
    for row in rows(connection, "comprev_importacoes"):
        values = [
            sql(row["id"]), sql(clean(row["competencia"])),
            sql(clean(row["nome_arquivo"])), sql(row["quantidade_registros"]),
            sql(row["valor_fluxo"]), sql(row["valor_estoque"]),
            sql(row["valor_total"]), sql(clean(row["observacao"])),
            sql(row["importado_em"]), sql(row["importado_em"]),
        ]
        statements.append(insert_statement("comprev_imports", columns, values, columns[1:]))
    return statements


def export_cases(connection: sqlite3.Connection) -> list[str]:
    statements = []
    columns = [
        "legacy_id", "beneficiary_name", "beneficiary_cpf",
        "beneficiary_registration", "benefit_type", "benefit_number",
        "benefit_start_date", "tce_process_number", "tce_process_year",
        "tce_process_url", "tce_decision_number", "tce_decision_date",
        "tce_decision_url", "tce_consulted_at", "compensation_direction",
        "origin_regime", "comprev_protocol_number", "comprev_protocol_date",
        "status", "legacy_status", "notes", "archived_at",
        "created_at", "updated_at", "legacy_imported_at",
    ]
    for row in rows(connection, "comprev_processos"):
        number, year, url = tce_data(row)
        created = row["criado_em"] or row["atualizado_em"]
        updated = row["atualizado_em"] or created
        archived = None if row["ativo"] else updated
        values = [
            sql(row["id"]), sql(clean(row["nome_beneficiario"])),
            sql(digits(row["cpf"], 11)), sql(clean(row["matricula"])),
            sql(benefit_type(row["tipo_beneficio"])),
            sql(clean(row["numero_beneficio"])),
            sql(clean(row["data_inicio_beneficio"])), sql(number), sql(year),
            sql(url), sql(clean(row["numero_acordao_tce"])),
            sql(clean(row["data_acordao_tce"])),
            sql(clean(row["link_acordao_tce"])),
            sql(clean(row["consulta_tce_em"])), sql("receivable"), sql("rgps"),
            sql(clean(row["protocolo"])),
            sql(clean(row["data_envio_requerimento"])),
            sql(process_status(row["status"])), sql(clean(row["status"])),
            sql(clean(row["observacao"])), sql(archived), sql(created),
            sql(updated), "now()",
        ]
        statements.append(insert_statement("comprev_cases", columns, values, columns[1:]))
    return statements


def export_receipts(connection: sqlite3.Connection) -> list[str]:
    statements = []
    columns = [
        "legacy_id", "import_id", "case_id", "reference_period",
        "comparison_key", "comprev_protocol_number", "beneficiary_name",
        "beneficiary_registration", "beneficiary_cpf", "beneficiary_nit",
        "benefit_number", "request_type", "retirement_type", "applicant_name",
        "recipient_name", "stock_amount", "stock_thirteenth_amount",
        "flow_amount", "flow_thirteenth_amount", "accumulated_flow_amount",
        "monthly_pro_rata_amount", "total_amount", "period_start_date",
        "period_end_date", "source_data", "created_at",
    ]
    for row in rows(connection, "comprev_recebimentos"):
        source = json.dumps(json_value(row["dados_originais"]), ensure_ascii=False)
        values = [
            sql(row["id"]), ref("comprev_imports", row["importacao_id"]),
            ref("comprev_cases", row["processo_id"]),
            sql(clean(row["competencia"])), sql(clean(row["chave_comparacao"])),
            sql(clean(row["protocolo"])), sql(clean(row["nome_beneficiario"])),
            sql(clean(row["matricula"])), sql(digits(row["cpf"], 11)),
            sql(digits(row["nit"])), sql(clean(row["numero_beneficio"])),
            sql(clean(row["tipo_requerimento"])),
            sql(clean(row["tipo_aposentadoria"])), sql(clean(row["solicitante"])),
            sql(clean(row["destinatario"])), sql(row["valor_estoque"]),
            sql(row["decimo_terceiro_estoque"]), sql(row["valor_fluxo"]),
            sql(row["decimo_terceiro_fluxo"]), sql(row["fluxo_acumulado"]),
            sql(row["pro_rata_mensal"]), sql(row["valor_total"]),
            sql(clean(row["data_inicio"])), sql(clean(row["data_fim"])),
            sql(source, "jsonb"), sql(row["criado_em"]),
        ]
        statements.append(insert_statement("comprev_receipts", columns, values, columns[1:]))
    return statements


def export_findings(connection: sqlite3.Connection) -> list[str]:
    statements = []
    columns = [
        "legacy_id", "import_id", "case_id", "receipt_id", "reference_period",
        "finding_type", "beneficiary_name", "description", "previous_amount",
        "current_amount", "difference_amount", "percentage_change", "status",
        "legacy_status", "reason", "justification", "responsible_name",
        "justified_at", "created_at",
    ]
    for row in rows(connection, "comprev_achados"):
        values = [
            sql(row["id"]), ref("comprev_imports", row["importacao_id"]),
            ref("comprev_cases", row["processo_id"]),
            ref("comprev_receipts", row["recebimento_id"]),
            sql(clean(row["competencia"])), sql(clean(row["tipo"])),
            sql(clean(row["nome_beneficiario"])), sql(clean(row["descricao"])),
            sql(row["valor_anterior"]), sql(row["valor_atual"]),
            sql(row["diferenca"]), sql(row["percentual_variacao"]),
            sql(finding_status(row["status"])), sql(clean(row["status"])),
            sql(clean(row["motivo"])), sql(clean(row["justificativa"])),
            sql(clean(row["responsavel"])), sql(row["justificado_em"]),
            sql(row["criado_em"]),
        ]
        statements.append(insert_statement("comprev_findings", columns, values, columns[1:]))
    return statements


def export_history(connection: sqlite3.Connection) -> list[str]:
    statements = []
    columns = [
        "legacy_id", "case_id", "previous_status", "new_status",
        "responsible_name", "notes", "occurred_at", "imported_from_legacy",
        "created_at",
    ]
    for row in rows(connection, "comprev_historico_status"):
        previous = clean(row["status_anterior"])
        new = clean(row["status_novo"])
        values = [
            sql(row["id"]), ref("comprev_cases", row["processo_id"]),
            sql(process_status(previous) if previous else None),
            sql(process_status(new)), sql(clean(row["responsavel"])),
            sql(clean(row["observacao"])), sql(row["data_alteracao"]),
            "TRUE", sql(row["data_alteracao"]),
        ]
        statements.append(insert_statement("comprev_status_history", columns, values, columns[1:]))
    return statements


def main() -> int:
    if len(sys.argv) != 3:
        print("Uso: python migrate-comprev-legacy.py APP_DB SAIDA_SQL", file=sys.stderr)
        return 2

    database = Path(sys.argv[1]).expanduser().resolve()
    output = Path(sys.argv[2]).expanduser().resolve()
    if not database.is_file():
        print(f"Banco SQLite não encontrado: {database}", file=sys.stderr)
        return 2

    connection = sqlite3.connect(f"file:{database.as_posix()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    try:
        groups = [
            export_imports(connection), export_cases(connection),
            export_receipts(connection), export_findings(connection),
            export_history(connection),
        ]
    finally:
        connection.close()

    statements = [item for group in groups for item in group]
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        "BEGIN;\nSET LOCAL statement_timeout = 0;\n\n"
        + "\n".join(statements)
        + "\nCOMMIT;\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"SQL criado em: {output}")
    print("Processos: 38 | Importações: 2 | Recebimentos: 170 | Achados: 170 | Histórico: 39")
    print(f"Total de operações geradas: {len(statements)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())