import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const form = document.querySelector("#reset-form");
const button = document.querySelector("#reset-button");
const status = document.querySelector("#recovery-status");
const again = document.querySelector("#request-again");
const hash = new URLSearchParams(window.location.hash.slice(1));
const isRecovery = hash.get("type") === "recovery";
const hasError = hash.has("error") || new URLSearchParams(window.location.search).has("error");
let client;
let ready = false;

function invalidLink() {
  ready = false;
  form.hidden = true;
  again.hidden = false;
  status.textContent = "Este link é inválido ou expirou. Solicite um novo link de recuperação.";
}

async function initialize() {
  if (!isRecovery || hasError) {
    window.history.replaceState(null, "", window.location.pathname);
    invalidLink();
    return;
  }
  try {
    const local = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const { SIGPREVI_CONFIG: config } = await import(
      local ? "../sigprevi-config.local.js" : "../sigprevi-config.js"
    );
    // Keep the recovery session separate from any existing administrative session.
    client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: false, autoRefreshToken: false,
        detectSessionInUrl: true, storageKey: "sigprevi-password-recovery" }
    });
    const { data, error } = await client.auth.getSession();
    window.history.replaceState(null, "", window.location.pathname);
    if (error || !data.session) return invalidLink();
    ready = true;
    form.hidden = false;
    status.textContent = "";
    document.querySelector("#password").focus();
  } catch {
    window.history.replaceState(null, "", window.location.pathname);
    invalidLink();
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ready || button.disabled || !form.reportValidity()) return;
  const password = document.querySelector("#password").value;
  if (password !== document.querySelector("#confirmation").value) {
    status.textContent = "As senhas precisam ser iguais.";
    return;
  }
  button.disabled = true;
  status.textContent = "Salvando nova senha...";
  try {
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
    ready = false;
    form.reset();
    form.hidden = true;
    status.textContent = "Senha atualizada. Volte para o acesso e entre com sua nova senha.";
    await client.auth.signOut({ scope: "local" });
  } catch {
    status.textContent = "Não foi possível atualizar a senha. Ela deve atender às regras de segurança e ser diferente da anterior. Se o link expirou, solicite outro.";
    again.hidden = false;
    button.disabled = false;
  }
});

initialize();
