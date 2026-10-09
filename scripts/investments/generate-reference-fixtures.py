import gzip
"""Generate synthetic calculation references from the original Flask module.

Run with the original project's Python environment:
python scripts/investments/generate-reference-fixtures.py --source PATH
Only an in-memory SQLite database is ever initialized. No application factory,
production configuration, existing database, server or external request is used.
"""
import argparse
import hashlib
import importlib
import json
import sys
import types
from datetime import date, datetime
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'tests/fixtures/investments-reference.json.gz')
    args = parser.parse_args()
    source = args.source.resolve()
    # Namespace shells prevent execution of app/__init__.py and its factory.
    for name, folder in [('app', 'app'), ('app.models', 'app/models'), ('app.routes', 'app/routes')]:
        package = types.ModuleType(name)
        package.__path__ = [str(source / folder)]
        sys.modules[name] = package
    from flask import Flask
    db = importlib.import_module('app.extensions').db
    models = importlib.import_module('app.models.investimentos')
    routes = importlib.import_module('app.routes.investimentos')
    app = Flask('synthetic-investments-reference')
    app.config.update(TESTING=True, SQLALCHEMY_DATABASE_URI='sqlite:///:memory:', SQLALCHEMY_TRACK_MODIFICATIONS=False, SECRET_KEY='synthetic-reference-only')
    db.init_app(app)

    def serial(value):
        if isinstance(value, dict):
            return {str(k): serial(v) for k, v in value.items()}
        if isinstance(value, (list, tuple)):
            return [serial(v) for v in value]
        if isinstance(value, (datetime, date)):
            return value.isoformat()
        if isinstance(value, db.Model):
            return {column.name: serial(getattr(value, column.name)) for column in value.__table__.columns}
        return value

    fixed = datetime(2026, 1, 1)
    def add(model, **values):
        obj = model(**values, criado_em=fixed, atualizado_em=fixed)
        db.session.add(obj)
        return obj

    with app.app_context():
        assert db.engine.url.database == ':memory:'
        db.create_all()
        add(models.InstituicaoFinanceira, id=1, nome='Instituição Sintética', ativo=True)
        classes = ['CDI', 'IMA-B 5', 'IMA-B', 'EXTERIOR', 'IRF-M 1', 'Outros']
        benchmarks = ['CDI', 'IMA-B 5', 'IMA-B', 'MSCI WORLD', 'IRF-M 1', 'SEM CADASTRO']
        returns = [
            [1, .9, 0, 1.1, -.1, .8, -.2, -.4],
            [2, -1, 0, 3, -2, -.2, -.4, -.8],
            [5, -7, 0, 8, 3, -4, -3, -2],
            [12, -24, 0, 19, -8, -6, -4, -3],
            [.8, -.2, 0, 1.2, .3, .5, .6, .7],
            [1, 0, -.5, 2, -1, .5, 0, 1],
        ]
        funds = []
        for i, (classe, benchmark, series) in enumerate(zip(classes, benchmarks, returns), 1):
            fund = add(models.FundoInvestimento, id=i, instituicao_id=1, nome=f'Fundo Sintético {i}', classe=classe, benchmark=benchmark, ativo=i != 6, status_carteira='ENCERRADO' if i == 6 else 'ATIVO', encerrado_em='2026-08' if i == 6 else None, consignado=i == 5)
            funds.append(fund)
            for month, percent in enumerate(series, 1):
                initial = 10000.0 * i
                applications = 100.0 * month
                withdrawals = 50.0 if month % 2 else 0.0
                base = initial + applications - withdrawals
                if i == 6 and month == 3:
                    withdrawals = initial + applications  # zero profitability base
                    base = 0
                income = base * percent / 100
                add(models.SaldoInvestimento, id=(i-1)*8+month, fundo_id=i, mes_ano=f'2026-{month:02d}', saldo_inicial=initial, aplicacoes=applications, resgates=withdrawals, rendimento=income, saldo_final=base+income)
        add(models.MetaAtuarialAnual, id=1, ano=2026, indice='IPCA', taxa_real_anual=5.63)
        # February zero; March missing; April divergent legacy; May legacy only.
        for month, value in [(1,.5), (2,0), (4,.4), (6,-.1), (7,.2), (8,.3)]:
            add(models.IndicadorEconomicoMensal, mes_ano=f'2026-{month:02d}', indicador='IPCA', rentabilidade_percentual=value, fonte='Sintética')
        add(models.IndiceAtuarialMensal, id=1, meta_anual_id=1, mes=4, indice_percentual=.9)
        add(models.IndiceAtuarialMensal, id=2, meta_anual_id=1, mes=5, indice_percentual=.25)
        for index, name in enumerate(benchmarks[:-1]):
            for month in range(1, 9):
                if month == 3 or (index == 3 and month == 8):
                    continue
                value = [1.0, 0.0, 0.0, -.8, .7, -.3, .5, -.2][month-1] * (index+1)
                add(models.IndicadorEconomicoMensal, mes_ano=f'2026-{month:02d}', indicador=name, rentabilidade_percentual=value, fonte='Sintética')
        db.session.commit()
        inputs = {table.name: [dict(row._mapping) for row in db.session.execute(table.select().order_by(table.c.id))] for table in db.metadata.sorted_tables}
        expected = {
            '_taxa_real_mensal': [{'input': n, 'expected': routes._taxa_real_mensal(n)} for n in [0, 5.63, -1, None]],
            '_compor_percentuais': [{'input': values, 'expected': routes._compor_percentuais(values)} for values in [[], [0], [1,-1,0,.5], [None, .2]]],
            '_painel_meta_atuarial': {'2026': routes._painel_meta_atuarial(2026), '2025': routes._painel_meta_atuarial(2025)},
            '_historico_individual_fundo': {},
            '_indicador_desempenho_fundo': {},
            '_radar_individual_fundo': {},
            '_dados_ranking_fundos': {},
        }
        for fund in funds:
            for period in [3, 6, 12, 24, 'invalid']:
                key = f'{fund.id}:{period}'
                history = routes._historico_individual_fundo(fund, period)
                indicator = routes._indicador_desempenho_fundo(fund)
                expected['_historico_individual_fundo'][key] = history
                expected['_radar_individual_fundo'][key] = routes._radar_individual_fundo(fund, history, indicator)
            for month in [None, '2026-04', '2026-03', '2026-12']:
                expected['_indicador_desempenho_fundo'][f'{fund.id}:{month}'] = routes._indicador_desempenho_fundo(fund, month)
        for period in [3, 6, 12, 24, 'invalid']:
            for closed in [False, True]:
                expected['_dados_ranking_fundos'][f'{period}:{closed}'] = routes._dados_ranking_fundos(period, closed)
        payload = serial({'synthetic': True, 'source_sha256': hashlib.sha256((source/'app/routes/investimentos.py').read_bytes()).hexdigest(), 'inputs': inputs, 'expected': expected})
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(gzip.compress(json.dumps(payload, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8'), mtime=0))
        print(f'Synthetic fixtures written: {args.output} ({len(funds)} funds; {sum(len(rows) for rows in inputs.values())} rows)')
        db.session.remove()
        db.engine.dispose()


if __name__ == '__main__':
    main()
