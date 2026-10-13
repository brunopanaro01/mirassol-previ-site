import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createSigpreviUser } from "./handler.js";
const origins = new Set(["https://mirassolprevi.com.br", "https://www.mirassolprevi.com.br"]);
Deno.serve(async (request) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origins.has(request.headers.get("origin") ?? "") ? request.headers.get("origin")! : "https://mirassolprevi.com.br",
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Cache-Control": "no-store", "Vary": "Origin"
  };
  const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
  if (request.method === "OPTIONS") return response({});
  if (request.method !== "POST") return response({error:"Método não permitido."},405);
  try {
    const raw = await request.text();
    if (raw.length > 4096) return response({error:"Solicitação muito grande."},413);
    const url = Deno.env.get("SUPABASE_URL")!;
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    const result = await createSigpreviUser({
      authorization: request.headers.get("authorization"), body: JSON.parse(raw),
      createCaller: (authorization: string) => createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { ...options, global: { headers: { Authorization: authorization } } }),
      createAdmin: () => createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, options),
      audit: (entry: unknown) => console.info(JSON.stringify(entry))
    });
    const { status, ...value } = result;
    return response(value, status);
  } catch { return response({error:"Não foi possível processar a solicitação."},400); }
});
