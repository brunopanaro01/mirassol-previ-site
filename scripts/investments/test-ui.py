"""Browser smoke tests with synthetic fixtures and a mocked Supabase client only.
Run with Python + Playwright + Chromium. No connection to the real Supabase project.
"""
import json
import gzip
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import threading
import unittest
import os
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = json.loads(gzip.decompress((ROOT / 'scripts/tests/fixtures/investments-reference.json.gz').read_bytes()))

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

class BrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True, executable_path=os.environ.get('TEST_BROWSER_EXECUTABLE'))

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()

    def open(self, manager):
        page = self.browser.new_page(viewport={'width': 1440, 'height': 1000})
        self.addCleanup(page.close)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        def mock_client(route):
            tables = json.dumps(FIXTURE['inputs'], ensure_ascii=False)
            flag = 'true' if manager else 'false'
            route.fulfill(content_type='application/javascript', body=f'''
              const tables={tables};
              export const supabase={{
                rpc:async(name,args)=>{{
                  if(name==='investments_snapshot')return {{data:{{tables,can_manage:{flag},can_participate:true,user_id:'synthetic'}},error:null}};
                  if(name==='investments_save'){{const old=tables[args.p_table].find(r=>r.id===args.p_id);if(old)Object.assign(old,args.p_data);else tables[args.p_table].push({{id:999,version:1,...args.p_data}});return {{data:{{}},error:null}};}}
                  if(name==='investments_participate')return {{data:1,error:null}};
                  return {{data:null,error:{{message:'Sem acesso sintético'}}}};
                }},
                functions:{{invoke:async()=>({{data:{{saved:['IPCA: 0.5%.'],errors:[]}},error:null}})}}
              }};
            ''')
        page.route('**/components/supabase-client.js', mock_client)
        page.route('**/components/auth-guard.js', lambda route: route.fulfill(content_type='application/javascript', body="export async function requireAuthenticatedUser(){return {email:'teste@sintetico.invalid'};} export async function signOut(){}"))
        # Every remote resource is blocked; the test cannot touch real accounts or data.
        page.route('https://**/*', lambda route: route.abort())
        page.goto(f'http://127.0.0.1:{self.server.server_port}/admin/sigprevi.html?module=investimentos')
        page.get_by_role('heading', name='Carteira e governança').wait_for()
        return page, errors

    def test_manager_all_tabs_and_save(self):
        page, errors = self.open(True)
        for name in ['carteira','instituicoes','fundos','lancamentos','desempenho','meta','indicadores','benchmarks','radar','ranking','comparador','mercado','diario','documentos','decisoes','deliberacoes','alertas','relatorios','historico','painel']:
            page.locator(f'[data-tab="{name}"]').click()
        page.locator('[data-tab="indicadores"]').click()
        page.get_by_role('button', name='Novo registro', exact=True).click()
        dialog = page.get_by_role('dialog')
        dialog.get_by_label('Competência').fill('2026-09')
        dialog.get_by_label('Indicador / benchmark').fill('IPCA')
        dialog.get_by_label('Variação mensal (%)').fill('0,42')
        dialog.get_by_role('button', name='Salvar', exact=True).click()
        dialog.wait_for(state='detached')
        page.get_by_text('Registro salvo.', exact=True).wait_for()
        page.locator('[data-tab="meta"]').click()
        page.get_by_text('0,42%', exact=True).wait_for()
        page.locator('[data-tab="desempenho"]').click()
        page.locator('.investments-table tbody button').first.click()
        page.get_by_role('dialog').get_by_role('heading', name='Radar', exact=False).wait_for()
        page.get_by_role('dialog').get_by_role('button', name='Fechar', exact=True).click()
        self.assertEqual(errors, [])

    def test_committee_readonly_ui_and_participation(self):
        page, errors = self.open(False)
        self.assertEqual(page.locator('[data-tab="lancamentos"]').count(), 0)
        for name in ['fundos','instituicoes','meta','indicadores','diario','documentos','decisoes','historico']:
            page.locator(f'[data-tab="{name}"]').click()
            self.assertEqual(page.get_by_role('button', name='Novo registro', exact=True).count(), 0)
            self.assertEqual(page.get_by_role('button', name='Editar', exact=True).count(), 0)
            self.assertEqual(page.get_by_role('button', name='Excluir', exact=True).count(), 0)
        page.locator('[data-tab="deliberacoes"]').click()
        page.get_by_role('button', name='Registrar participação', exact=True).click()
        dialog = page.get_by_role('dialog')
        self.assertNotIn('deliberacao', dialog.get_by_label('Tipo').locator('option').evaluate_all('(options)=>options.map(o=>o.value)'))
        dialog.get_by_label('Assunto').fill('Recomendação sintética')
        dialog.get_by_label('Conteúdo').fill('Conferir dados da carteira.')
        dialog.get_by_role('button', name='Registrar', exact=True).click()
        dialog.wait_for(state='detached')
        self.assertEqual(errors, [])

if __name__ == '__main__':
    unittest.main(verbosity=2)
