import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createSigpreviUser } from '../../supabase/functions/admin-user-create/handler.js';
const actor = 'owner-id', target = 'new-id';
async function run(options = {}) {
  const calls = [], logs = [];
  const result = await createSigpreviUser({
    authorization: options.authorization ?? 'Bearer synthetic',
    body: options.body ?? { fullName: 'Usuário de teste', email: 'test@example.org', password: 'synthetic-password', role: 'investments_committee' },
    createCaller: () => ({auth: {getUser: async () => ({data: {user: options.noUser ? null : {
      id: actor, email: options.email ?? 'brunopanaro@gmail.com', email_confirmed_at: options.unverified ? null : '2026-01-01'
    }}, error: options.authError})}, rpc: async (name, args) => {
      if (name === 'access_admin_list_users') return {data: options.users ?? [{user_id:actor, account_status:'active'}],error:options.accessError};
      calls.push(['role', args]); return {error:options.roleError};
    }}),
    createAdmin: () => ({auth:{admin:{createUser:async value => {
      calls.push(['create', value]); return {data:{user: options.noCreated ? null : {id:target}},error:options.createError};
    }}}}), audit: entry => logs.push(entry)
  });
  return {result,calls,logs};
}
test('owner creates active identity using existing profile trigger and grants only committee', async () => {
  const h = await run(); assert.equal(h.result.status,201); assert.equal(h.result.roleAssigned,true);
  assert.deepEqual(h.calls[0][1],{email:'test@example.org',password:'synthetic-password',email_confirm:true,user_metadata:{full_name:'Usuário de teste'}});
  assert.deepEqual(h.calls[1],['role',{p_user_id:target,p_role_name:'investments_committee'}]);
  assert.equal(JSON.stringify(h.logs).includes('synthetic-password'),false);
});
for (const [label, options, status] of [
  ['no authentication',{authorization:''},401], ['other admin',{email:'other@example.org'},403],
  ['unverified owner',{unverified:true},403], ['invalid token',{authError:{}},403],
  ['no user',{noUser:true},403], ['not global admin',{accessError:{}},403],
  ['inactive owner',{users:[{user_id:actor,account_status:'inactive'}]},403],
  ['duplicate email',{users:[{user_id:actor,account_status:'active'},{email:'TEST@example.org'}]},409],
  ...[{role:'administrator'},{role:'investments_manager'},{password:'short'},{fullName:' '},{email:'invalid'},{password:7}].map(change =>
    ['invalid '+JSON.stringify(change),{body:{fullName:'Test User',email:'test@example.org',password:'synthetic-password',...change}},400])
]) test(label,async()=>{const h=await run(options);assert.equal(h.result.status,status);assert.equal(h.calls.length,0);});
test('no module role creates identity without granting access',async()=>{
  const h=await run({body:{fullName:' Test User ',email:' TEST@example.org ',password:'synthetic-password'}});
  assert.equal(h.result.status,201);assert.equal(h.calls.length,1);assert.equal(h.calls[0][1].email,'test@example.org');
});
test('provider error does not grant roles or expose credentials/provider details',async()=>{
  const h=await run({createError:{message:'private provider detail'}});assert.equal(h.result.status,400);
  assert.equal(h.calls.length,1);assert.equal(JSON.stringify(h.result).includes('private'),false);
});
test('role failure preserves created account and reports partial completion without retrying creation',async()=>{
  const h=await run({roleError:{}});assert.equal(h.result.status,201);assert.equal(h.result.success,true);
  assert.equal(h.result.roleAssigned,false);assert.match(h.result.message,/não foi concedido/);assert.equal(h.calls.length,2);
});
function ui(options={}) {
  const fields = Object.fromEntries(Object.entries({fullName:'Test User',email:'test@example.org',password:'synthetic-password',confirmation:options.confirmation??'synthetic-password',role:'investments_committee'}).map(([k,value])=>[k,{value}]));
  const calls=[],button={disabled:false},status={textContent:''};
  const form={elements:{namedItem:name=>fields[name]},reportValidity:()=>true,addEventListener:(name,fn)=>{form[name]=fn;},
    querySelector:selector=>selector==='button'?button:status,reset:()=>{calls.push('reset');}};
  const panel={hidden:true,innerHTML:'',querySelector:()=>form};
  const source=readFileSync(new URL('../../admin/modules/admin-user-create.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/,'').replace('export function','function');
  vm.runInNewContext(source+'\ninitializeUserCreation(panel,async()=>{calls.push("refresh");});',{
    panel,calls,window:{confirm:()=>options.confirm!==false},supabase:{functions:{invoke:async(name,args)=>{
      calls.push({name,body:args.body});return options.failure?{error:{}}:{data:{success:true,message:'Criado'}};
    }}}
  });
  return {calls,button,status,submit:()=>form.submit({preventDefault(){}})};
}
test('UI validates confirmation and avoids writes on cancellation',async()=>{
  for(const options of [{confirmation:'different'},{confirm:false}]) {const h=ui(options);await h.submit();assert.equal(h.calls.length,0);}
});
test('UI clears passwords and refreshes list once after creation, blocks double submission',async()=>{
  const h=ui();await Promise.all([h.submit(),h.submit()]);assert.equal(h.calls.filter(x=>x?.name).length,1);
  assert.deepEqual(h.calls.slice(-2),['reset','refresh']);assert.equal(h.button.disabled,false);
});
test('uncertain server result tells owner to inspect list before retry',async()=>{
  const h=ui({failure:true});await h.submit();assert.match(h.status.textContent,/antes de tentar novamente/);
  assert.equal(h.calls.includes('reset'),false);assert.equal(h.button.disabled,false);
});
