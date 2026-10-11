"""Read-only export of Investments, never the payroll or other director-panel modules.

python export-local.py --database PATH/app.db --output PRIVATE_DIRECTORY
The JSON contains only Investments tables. The private SQLite backup contains the
entire source database and must remain local. Do not commit either output.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import os

TABLES = [
    'invest_benchmarks', 'invest_decisoes', 'invest_diario_economico_mensal',
    'invest_documentos_governanca_mensal', 'invest_indicadores_mensais',
    'invest_instituicoes', 'invest_meta_atuarial', 'invest_meta_atuarial_anual',
    'invest_fundos', 'invest_indice_atuarial_mensal', 'invest_historico_decisoes_fundo', 'invest_saldos'
]

def export(database, output):
    database = Path(os.path.abspath(database))
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    # Online SQLite backup produces one transactionally consistent snapshot.
    backup = output / f'investimentos-fonte-{stamp}.sqlite'
    with sqlite3.connect(database.as_uri() + '?mode=ro', uri=True) as source:
        with sqlite3.connect(backup) as dest:
            source.backup(dest)
    with sqlite3.connect(backup.as_uri() + '?mode=ro', uri=True) as source:
        source.row_factory = sqlite3.Row
        tables = {table: [dict(r) for r in source.execute(f'SELECT * FROM "{table}" ORDER BY id')] for table in TABLES}
        # JSON Booleans match PostgreSQL model types; values and identifiers are preserved.
        for records in tables.values():
            for record in records:
                for field in ('ativo', 'consignado', 'atualizacao_automatica'):
                    if field in record and record[field] is not None:
                        record[field] = bool(record[field])
    payload = {'format': 'sigprevi-investments-v1', 'exported_at': stamp, 'tables': tables}
    raw = json.dumps(payload, ensure_ascii=False, indent=2).encode('utf-8')
    export_file = output / f'investimentos-importacao-{stamp}.json'
    export_file.write_bytes(raw)
    digest = hashlib.sha256(raw).hexdigest()
    counts = {table: len(records) for table, records in tables.items()}
    manifest = output / f'investimentos-conferencia-{stamp}.json'
    manifest.write_text(json.dumps({'sha256': digest, 'counts': counts}, indent=2), encoding='utf-8')
    return {'export': str(export_file), 'backup': str(backup), 'manifest': str(manifest), 'counts': counts}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    print(json.dumps(export(args.database, args.output), ensure_ascii=False, indent=2))
