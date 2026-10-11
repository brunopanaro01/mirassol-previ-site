import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function harness(file, options = {}) {
  const nodes = new Map();
  const calls = [];
  const document = { querySelector(id) {
    if (!nodes.has(id)) nodes.set(id, { value: '', hidden: true, disabled: false,
      textContent: '', focus() {}, reset() {}, reportValidity: () => true,
      addEventListener(name, fn) { this[name] = fn; } });
    return nodes.get(id);
  }};
  const auth = {
    async resetPasswordForEmail(...args) { calls.push(['request', ...args]); return { error: options.requestError }; },
    async getSession() { return { data: { session: options.expired ? null : {} } }; },
    async updateUser(...args) { calls.push(['update', ...args]); return { error: options.updateError }; },
    async signOut(...args) { calls.push(['signOut', ...args]); return {}; }
  };
  let source = readFileSync(new URL(`../../admin/modules/${file}`, import.meta.url), 'utf8')
    .replace(/^import .*;\n/m, '')
    .replace(/await import\([\s\S]*?\n    \)/, '({ SIGPREVI_CONFIG: {} })');
  const context = { document, supabase: { auth }, createClient: () => ({ auth }),
    URL, URLSearchParams, window: { location: { hash: options.hash ?? '#type=recovery&access_token=test',
      search: '', pathname: '/admin/sigprevi-redefinir-senha.html', hostname: 'mirassolprevi.com.br',
      href: 'https://mirassolprevi.com.br/admin/sigprevi-recuperar-senha.html' },
      history: { replaceState(...args) { calls.push(['cleanURL', ...args]); } } } };
  vm.runInNewContext(source, context);
  return { nodes, calls, settle: () => new Promise(resolve => setImmediate(resolve)) };
}

test('request uses exact same-origin recovery destination and neutral confirmation', async () => {
  const h = harness('password-recovery.js');
  // The email is read only when submitting.
  const form = h.nodes.get('#recovery-form');
  await form.submit({ preventDefault() {} });
  assert.equal(h.calls[0][2].redirectTo, 'https://mirassolprevi.com.br/admin/sigprevi-redefinir-senha.html');
  assert.match(h.nodes.get('#recovery-status').textContent, /Se este e-mail estiver cadastrado/);
  await form.submit({ preventDefault() {} });
  assert.equal(h.calls.length, 1);
});

test('request failure allows retry without exposing account existence', async () => {
  const h = harness('password-recovery.js', { requestError: {} });
  await h.nodes.get('#recovery-form').submit({ preventDefault() {} });
  assert.equal(h.nodes.get('#recovery-button').disabled, false);
  assert.match(h.nodes.get('#recovery-status').textContent, /tente novamente/);
});

for (const options of [{ hash: '' }, { hash: '#type=signup&access_token=test' }, { expired: true }, { hash: '#error=expired&type=recovery' }]) {
  test(`invalid link stays blocked: ${JSON.stringify(options)}`, async () => {
    const h = harness('password-reset.js', options);
    await h.settle();
    await h.nodes.get('#reset-form').submit({ preventDefault() {} });
    assert.equal(h.nodes.get('#reset-form').hidden, true);
    assert.equal(h.calls.filter(c => c[0] === 'update').length, 0);
  });
}

test('valid link requires matching passwords, updates once, and closes only recovery session', async () => {
  const h = harness('password-reset.js');
  await h.settle();
  assert.equal(h.nodes.get('#reset-form').hidden, false);
  h.nodes.get('#password').value = 'test-only-password';
  // Create the confirmation input through the submit handler.
  await h.nodes.get('#reset-form').submit({ preventDefault() {} });
  assert.equal(h.calls.filter(c => c[0] === 'update').length, 0);
  h.nodes.get('#confirmation').value = 'test-only-password';
  await h.nodes.get('#reset-form').submit({ preventDefault() {} });
  await h.nodes.get('#reset-form').submit({ preventDefault() {} });
  assert.equal(h.calls.filter(c => c[0] === 'update').length, 1);
  assert.equal(h.calls.find(c => c[0] === 'signOut')[1].scope, 'local');
  assert.equal(h.nodes.get('#reset-form').hidden, true);
});

