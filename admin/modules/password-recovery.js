import { supabase } from "../components/supabase-client.js";

const form = document.querySelector("#recovery-form");
const button = document.querySelector("#recovery-button");
const status = document.querySelector("#recovery-status");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (button.disabled || !form.reportValidity()) return;
  button.disabled = true;
  status.textContent = "Enviando solicitação...";
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(
      document.querySelector("#email").value.trim(),
      { redirectTo: new URL("sigprevi-redefinir-senha.html", window.location.href).href }
    );
    if (error) throw error;
    status.textContent = "Se este e-mail estiver cadastrado, você receberá um link para definir uma nova senha. Confira também a pasta de spam.";
  } catch {
    status.textContent = "Não foi possível enviar a solicitação agora. Aguarde alguns minutos e tente novamente.";
    button.disabled = false;
  }
});
