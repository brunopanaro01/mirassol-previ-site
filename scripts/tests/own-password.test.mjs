import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function setup(options = {}) {
  const nodes = new Map();
  const panel = { innerHTML: "", querySelector(id) {
    if (!nodes.has(id)) nodes.set(id, { value: "", disabled: false, textContent: "",
      reportValidity: () => true, reset() { nodes.get("#own-new-password").value = ""; nodes.get("#own-confirm-password").value = ""; },
      addEventListener(event, callback) { this[event] = callback; } });
    return nodes.get(id);
  }};
  const calls = [];
  const source = readFileSync(new URL("../../admin/modules/own-password.js", import.meta.url), "utf8")
    .replace(/^import .*;\n/, "").replace("export function", "function");
  vm.runInNewContext(source + "\ninitializeOwnPasswordChange();", {
    document: { querySelector: () => panel },
    supabase: { auth: {
      async getUser() { calls.push("getUser"); return { data: { user: options.expired ? null : { id: "self" } } }; },
      async updateUser(value) { calls.push(value); return { error: options.error }; }
    }}
  });
  panel.querySelector("#own-new-password").value = options.password ?? "synthetic-password";
  panel.querySelector("#own-confirm-password").value = options.confirmation ?? "synthetic-password";
  return { nodes, calls, submit: () => nodes.get("#own-password-form").submit({ preventDefault() {} }) };
}

test("password change targets only authenticated user and clears form", async () => {
  const h = setup(); await h.submit();
  assert.equal(h.calls[0], "getUser");
  assert.deepEqual(Object.keys(h.calls[1]), ["password"]);
  assert.equal(h.nodes.get("#own-new-password").value, "");
  assert.match(h.nodes.get("#own-password-status").textContent, /sucesso/);
});
for (const options of [{ password: "short" }, { confirmation: "different-password" }, { expired: true }]) {
  test("invalid input or missing session prevents password write " + JSON.stringify(options), async () => {
    const h = setup(options); await h.submit();
    assert.equal(h.calls.filter(c => typeof c === "object").length, 0);
    assert.equal(h.nodes.get("#own-password-save").disabled, false);
  });
}
for (const code of ["same_password", "weak_password", "reauthentication_needed"]) {
  test("handles server rejection " + code, async () => {
    const h = setup({ error: { code } }); await h.submit();
    assert.doesNotMatch(h.nodes.get("#own-password-status").textContent, /sucesso/);
    assert.equal(h.nodes.get("#own-password-save").disabled, false);
    assert.equal(h.nodes.get("#own-new-password").value, "synthetic-password");
  });
}
test("prevents duplicate submissions", async () => {
  const h = setup();
  await Promise.all([h.submit(), h.submit()]);
  assert.equal(h.calls.filter(c => typeof c === "object").length, 1);
});
