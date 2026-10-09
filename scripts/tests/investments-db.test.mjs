import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {PGlite} from '@electric-sql/pglite';
const root = new URL('../../', import.meta.url);
const manager = '00000000-0000-4000-8000-000000000001';
const committee = '00000000-0000-4000-8000-000000000002';
const outsider = '00000000-0000-4000-8000-000000000003';
const fixture = JSON.parse(gunzipSync(await readFile(new URL('fixtures/investments-reference.json.gz', import.meta.url))).toString('utf8'));
const payload = JSON.stringify({ format: 'sigprevi-investments-v1', tables: fixture.inputs });

test('Investments PostgreSQL authorization, import and historical integrity', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;`);
  const migrations = [
    '202607230001_foundation_schema_types','202607230002_users','202607230003_roles',
    '202607230004_user_roles','202607230005_permissions','202607230006_role_permissions',
    '202607230007_modules','202607230008_align_roles_permissions_modules','202607230009_audit_logs',
    '202607230011_authorization_functions','202607230013_initial_roles_permissions',
    '202610090037_investments'
  ];
  for (const migration of migrations) {
    let sql = await readFile(new URL(`supabase/migrations/${migration}.sql`, root), 'utf8');
    // PGlite has native gen_random_uuid(); pgcrypto extension itself is unavailable.
    if (migration.endsWith('foundation_schema_types')) sql = sql.replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/, '').replace(/COMMENT ON EXTENSION pgcrypto IS\s*'[^']*';/, '');
    await db.exec(sql);
  }
  await db.exec(`GRANT USAGE ON SCHEMA app TO authenticated;
    INSERT INTO auth.users(id) VALUES('${manager}'),('${committee}'),('${outsider}');
    INSERT INTO app.users(id,full_name,status) VALUES('${manager}','Gestor Sintético','active'),('${committee}','Comitê Sintético','active'),('${outsider}','Sem Papel','active');
    INSERT INTO app.user_roles(user_id,role_id) SELECT '${manager}',id FROM app.roles WHERE name='investments_manager';
    INSERT INTO app.user_roles(user_id,role_id) SELECT '${committee}',id FROM app.roles WHERE name='investments_committee';`);
  async function as(id, callback, role = 'authenticated') {
    await db.exec(`SET ROLE ${role}`);
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id || '']);
    try { return await callback(); } finally { await db.exec('RESET ROLE'); }
  }
  const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0].value;
  const save = (table, data, id = null, version = null) => scalar('SELECT public.investments_save($1,$2::jsonb,$3,$4) AS value', [table, JSON.stringify(data), id, version]);
  const snapshot = () => scalar('SELECT public.investments_snapshot() AS value');
  const importData = () => scalar('SELECT public.investments_import($1::jsonb) AS value', [payload]);
  const close = (month, reopen = false, reason = null) => scalar('SELECT public.investments_close_month($1,$2,$3) AS value', [month, reopen, reason]);
  const participate = type => scalar("SELECT public.investments_participate('2026-08',1,$1,'Análise sintética','Texto sintético') AS value", [type]);

  await t.test('nonfinite values are rejected even via direct RPC or import', async()=>{
    await as(manager,async()=>{
      await assert.rejects(()=>save('invest_indicadores_mensais',{mes_ano:'2026-01',indicador:'IPCA',rentabilidade_percentual:'NaN'}),/finitos/);
      const invalid=structuredClone(fixture.inputs);invalid.invest_saldos[0].rendimento='Infinity';
      await assert.rejects(()=>scalar('SELECT public.investments_import($1::jsonb) AS value',[JSON.stringify({format:'sigprevi-investments-v1',tables:invalid})]),/finitos/);
    });
    assert.equal(await scalar('SELECT count(*)::int AS value FROM app.invest_saldos'),0);
    assert.equal(await scalar('SELECT count(*)::int AS value FROM app.invest_fundos'),0);
  });

  await t.test('anonymous and users without a role cannot read or write', async () => {
    await as(null, async () => { await assert.rejects(snapshot); await assert.rejects(importData); }, 'anon');
    await as(outsider, async () => { await assert.rejects(snapshot, /não autorizado/); await assert.rejects(importData, /não autorizado/); });
  });
  await t.test('initial import rejects a nonempty destination atomically', async () => {
    await as(manager, async () => {
      const created = await save('invest_instituicoes', { nome: 'Temporária' });
      await assert.rejects(importData, /destino vazio/);
      await scalar('SELECT public.investments_delete($1,$2,$3,$4) AS value', ['invest_instituicoes', created.id, created.version, 'Remoção sintética']);
    });
    assert.equal(await scalar('SELECT count(*)::int AS value FROM app.invest_saldos'), 0);
  });
  await t.test('active manager imports every synthetic table, preserves data and cannot repeat', async () => {
    await as(manager, async () => {
      const imported = await importData();
      assert.equal(imported.counts.invest_saldos, 48);
      const data = await snapshot();
      assert.equal(data.can_manage, true);
      assert.equal(data.tables.invest_fundos.length, 6);
      assert.equal(data.tables.invest_meta_atuarial_anual[0].taxa_real_anual, 5.63);
      await assert.rejects(importData, /já realizada/);
    });
  });
  await t.test('committee reads and participates; direct SQL and management RPCs are denied', async () => {
    await as(committee, async () => {
      const data = await snapshot(); assert.equal(data.can_manage, false); assert.equal(data.can_participate, true);
      await assert.rejects(() => db.exec("UPDATE app.invest_fundos SET nome='Ataque' WHERE id=1"), /permission denied/);
      await assert.rejects(() => save('invest_fundos', { nome: 'Ataque' }, 1, 1), /não autorizado/);
      await assert.rejects(() => close('2026-02'), /não autorizado/);
      await assert.rejects(importData, /não autorizado/);
      const id = await participate('recomendacao');
      const record = (await snapshot()).tables.invest_deliberacoes.find(row => row.id === id);
      assert.equal(record.autor_id, committee); assert.equal(record.autor_nome, 'Comitê Sintético');
      await assert.rejects(() => participate('deliberacao'), /não autorizado/);
    });
    await as(manager, async () => { await participate('deliberacao'); });
  });
  await t.test('blocked and revoked users lose access immediately', async () => {
    await db.exec(`UPDATE app.users SET status='blocked' WHERE id='${committee}'`);
    await as(committee, async () => { await assert.rejects(snapshot, /não autorizado/); await assert.rejects(() => participate('comentario'), /não autorizado/); });
    await db.exec(`UPDATE app.users SET status='active' WHERE id='${committee}'; DELETE FROM app.user_roles WHERE user_id='${committee}'`);
    await as(committee, async () => { await assert.rejects(snapshot, /não autorizado/); });
  });
  await t.test('stale versions cannot overwrite a newer edit', async () => {
    await as(manager, async () => {
      const updated = await save('invest_fundos', { observacao: 'Primeira edição' }, 1, 1);
      assert.equal(updated.version, 2);
      await assert.rejects(() => save('invest_fundos', { observacao: 'Edição obsoleta' }, 1, 1), /outro usuário/);
      assert.equal((await snapshot()).tables.invest_fundos.find(row => row.id === 1).observacao, 'Primeira edição');
    });
  });
  await t.test('missing IPCA blocks closure; zero is valid; month and annual rate are protected', async () => {
    await as(manager, async () => {
      await assert.rejects(() => close('2026-03'), /IPCA ausente/);
      const result = await close('2026-02'); assert.equal(result.ipca_percentual, 0); assert.equal(result.taxa_real_anual, 5.63);
      const ipca = (await snapshot()).tables.invest_indicadores_mensais.find(row => row.mes_ano === '2026-02' && row.indicador === 'IPCA');
      await assert.rejects(() => save('invest_indicadores_mensais', { rentabilidade_percentual: .8 }, ipca.id, ipca.version), /fechada/);
      await assert.rejects(() => save('invest_meta_atuarial_anual', { taxa_real_anual: 6 }, 1, 1), /fechada/);
      await assert.rejects(() => close('2026-02', true, ''), /Justifique/);
      await close('2026-02', true, 'Conferência sintética autorizada');
      await save('invest_indicadores_mensais', { rentabilidade_percentual: .8 }, ipca.id, ipca.version);
    });
    assert.equal(await scalar("SELECT count(*)::int AS value FROM app.audit_logs WHERE action='reopen' AND reason='Conferência sintética autorizada'"), 1);
  });
  await t.test('divergent legacy IPCA is preserved at closure', async () => {
    await as(manager, async () => {
      const result = await close('2026-04'); assert.equal(result.ipca_percentual, .9); assert.equal(result.origem, 'Histórico preservado');
      await assert.rejects(() => save('invest_indice_atuarial_mensal', { indice_percentual: .4 }, 1, 1), /histórico preservado/i);
    });
  });
});
