import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('collector',Path(__file__).with_name('collect_siconfi.py'))
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
class Response(io.BytesIO):
    def geturl(self): return m.BASE

def record(**changes):
    return dict(cod_ibge=5105622,exercicio=2025,mes_referencia=12,tipo_matriz='MSCC',
                tipo_valor='ending_balance',classe_conta=1,**changes)
class CollectorTests(unittest.TestCase):
    def run_capture(self, pages, max_pages=20):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'capture'; calls=[]
            def opener(req, timeout):
                calls.append(req.full_url)
                return Response(json.dumps(pages[len(calls)-1]).encode())
            result=m.collect(2025,12,1,path,max_pages=max_pages,opener=opener)
            self.assertTrue((path/'manifest.json').exists())
            self.assertRaises(FileExistsError,m.collect,2025,12,1,path,opener=opener)
            return result,calls
    def test_pagination_uses_public_host_and_retains_raw_hashes(self):
        pages=[dict(items=[record()],hasMore=True,links=[dict(rel='next',href='https://internal.invalid/')]),
               dict(items=[record()],hasMore=False)]
        r,calls=self.run_capture(pages)
        self.assertEqual(r['records'],2);self.assertEqual(r['status'],'captured_unmapped')
        self.assertIn('offset=1',calls[1]);self.assertTrue(all(u.startswith(m.BASE) for u in calls))
        self.assertEqual(len(r['pages'][0]['sha256']),64)
    def test_empty_is_unavailable_not_zero_indicator(self):
        r,_=self.run_capture([dict(items=[],hasMore=False)])
        self.assertEqual(r['status'],'unavailable');self.assertIsNone(r['rpPS_indicators'])
    def test_wrong_period_fails(self):
        row=record();row['mes_referencia']=11
        r,_=self.run_capture([dict(items=[row],hasMore=False)])
        self.assertEqual(r['status'],'failed')
    def test_page_limit_cannot_claim_complete(self):
        r,_=self.run_capture([dict(items=[record()],hasMore=True)],max_pages=1)
        self.assertEqual(r['status'],'failed')
    def test_schema_change_fails(self):
        r,_=self.run_capture([dict(rows=[],hasMore=False)])
        self.assertEqual(r['status'],'failed')
if __name__=='__main__': unittest.main()
