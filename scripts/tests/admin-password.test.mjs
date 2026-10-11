import { test } from "node:test";
import assert from "node:assert/strict";
import { resetOtherPassword } from "../../supabase/functions/admin-user-password/handler.js";
const actor = "11111111-1111-4111-8111-111111111111";
const target = "22222222-2222-4222-8222-222222222222";
async function run(options = {}) {
  const calls = [], logs = [];
  const result = await resetOtherPassword({
    authorization: options.authorization ?? "Bearer test",
    body: options.body ?? { userId: target, password: "synthetic-password" },
    createCaller: () => ({
      auth: { getUser: async () => ({data:{user: options.noUser ? null : {id:actor,email:options.email ?? "brunopanaro@gmail.com",email_confirmed_at:options.unverified ? null : "2026-01-01"}},error:options.authError}) },
      rpc: async () => ({data: options.users ?? [{user_id:actor,account_status:"active"},{user_id:target,account_status:"active"}],error:options.accessError})
    }),
    createAdmin: () => ({auth:{admin:{updateUserById:async (...args) => { calls.push(args); return {error:options.updateError}; }}}}),
    audit: entry => logs.push(entry)
  });
  return {result,calls,logs};
}
test("only verified authorized administrator can change another active account",async()=>{
  const h=await run(); assert.equal(h.result.status,200);
  assert.deepEqual(h.calls,[[target,{password:"synthetic-password"}]]);
  assert.equal(h.logs[0].actor,actor); assert.equal(h.logs[0].target,target);
  assert.equal(JSON.stringify(h.logs).includes("synthetic-password"),false);
});
for(const [label,options,status] of [
  ["no bearer",{authorization:""},401],
  ["other administrator email",{email:"other@example.org"},403],
  ["unverified owner",{unverified:true},403],
  ["invalid token",{authError:{}},403],
  ["missing user",{noUser:true},403],
  ["no administrator role",{accessError:{}},403],
  ["inactive owner",{users:[{user_id:actor,account_status:"inactive"}]},403],
  ["own account",{body:{userId:actor,password:"synthetic-password"}},400],
  ["unknown target",{users:[{user_id:actor,account_status:"active"}]},404],
  ["short password",{body:{userId:target,password:"short"}},400],
  ["invalid target",{body:{userId:"invalid",password:"synthetic-password"}},400]
]) test(label,async()=>{const h=await run(options);assert.equal(h.result.status,status);assert.equal(h.calls.length,0);});
test("provider rejection is not reported as success",async()=>{const h=await run({updateError:{message:"private provider error"}});assert.equal(h.result.status,400);assert.equal(h.logs[0].success,false);assert.equal(JSON.stringify(h.result).includes("private"),false);});
