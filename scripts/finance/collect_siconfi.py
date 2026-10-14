"""Captura oficial MSC sem calcular saldo do RPPS antes do mapeamento contábil."""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE = 'https://apidatalake.tesouro.gov.br/ords/siconfi/tt/msc_patrimonial'

def collect(year, month, account_class, destination, *, entity=5105622, max_pages=20, opener=urlopen):
    if not (2000 <= year <= 2200 and 1 <= month <= 12 and 1 <= account_class <= 4):
        raise ValueError('Exercício, mês ou classe inválidos')
    if entity <= 0 or max_pages <= 0:
        raise ValueError('Ente e limite de páginas devem ser positivos')
    # Diretório exclusivo impede sobrescrita de uma captura histórica.
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=False)
    params = dict(id_ente=entity, an_referencia=year, me_referencia=month,
                  co_tipo_matriz='MSCC', classe_conta=account_class, id_tv='ending_balance')
    manifest = dict(source='SICONFI MSC Patrimonial', requested_period=f'{year:04}-{month:02}',
                    parameters=params, fetched_at=datetime.now(timezone.utc).isoformat(),
                    scope='municipal_unmapped', status='collecting', pages=[], records=0,
                    rpPS_indicators=None)
    offset = 0
    try:
        for page_number in range(max_pages):
            url = BASE + '?' + urlencode({**params, 'offset': offset, 'limit': 5000})
            req = Request(url, headers={'Accept':'application/json', 'User-Agent':'SIGPREVI-source-probe/1.0'})
            with opener(req, timeout=25) as response:
                if response.geturl().split('?')[0] != BASE:
                    raise ValueError('Redirecionamento inesperado da fonte')
                raw = response.read(20 * 1024 * 1024 + 1)
                if len(raw) > 20 * 1024 * 1024:
                    raise ValueError('Página excede limite de tamanho')
            name = f'page-{page_number + 1:04}.json'
            (destination / name).write_bytes(raw)
            manifest['pages'].append(dict(file=name, url=url, sha256=hashlib.sha256(raw).hexdigest()))
            data = json.loads(raw)
            if not isinstance(data, dict) or not isinstance(data.get('items'), list) or not isinstance(data.get('hasMore'), bool):
                raise ValueError('Contrato de resposta desconhecido')
            for record in data['items']:
                if (str(record.get('cod_ibge')) != str(entity)
                    or str(record.get('exercicio')) != str(year)
                    or str(record.get('mes_referencia')) != str(month)
                    or record.get('tipo_matriz') != 'MSCC'
                    or record.get('tipo_valor') != 'ending_balance'
                    or str(record.get('classe_conta')) != str(account_class)):
                    raise ValueError('Registro retornado diverge da competência ou filtros')
            manifest['records'] += len(data['items'])
            if not data['hasMore']:
                manifest['status'] = 'captured_unmapped' if manifest['records'] else 'unavailable'
                break
            if not data['items']:
                raise ValueError('Paginação sem progresso')
            offset += len(data['items'])
        else:
            raise ValueError('Limite de páginas atingido; captura incompleta')
    except Exception as exc:
        manifest['status'] = 'failed'
        manifest['error'] = f'{type(exc).__name__}: {exc}'
    (destination / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    return manifest

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--year', type=int, required=True)
    parser.add_argument('--month', type=int, required=True)
    parser.add_argument('--class', dest='account_class', type=int, default=1)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    result = collect(args.year, args.month, args.account_class, args.output)
    print(json.dumps({k: result[k] for k in ['source','requested_period','status','records']},ensure_ascii=False))
    if result['status']=='failed':
        print(result['error'])
        raise SystemExit(1)
