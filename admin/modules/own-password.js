import { supabase } from "../components/supabase-client.js";

export function initializeOwnPasswordChange() {
  const panel = document.querySelector("#own-password-panel");
  if (!panel) return;
  panel.innerHTML = `
    <h2>Alterar minha senha</h2>
    <p>Esta alteração vale somente para a sua conta conectada ao Sigprevi.</p>
    <form id="own-password-form">
      <div class="form-field">
        <label for="own-new-password">Nova senha</label>
        <input id="own-new-password" type="password" autocomplete="new-password" minlength="8" required>
      </div>
      <div class="form-field">
        <label for="own-confirm-password">Confirme a nova senha</label>
        <input id="own-confirm-password" type="password" autocomplete="new-password" minlength="8" required>
      </div>
      <button id="own-password-save" class="button button-primary" type="submit">Salvar minha senha</button>
      <p id="own-password-status" class="form-status" role="status" aria-live="polite"></p>
    </form>
  `;
  const form = panel.querySelector("#own-password-form");
  const button = panel.querySelector("#own-password-save");
  const status = panel.querySelector("#own-password-status");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (button.disabled || !form.reportValidity()) return;
    const password = panel.querySelector("#own-new-password").value;
    const confirmation = panel.querySelector("#own-confirm-password").value;
    if (password.length < 8) {
      status.textContent = "Use uma senha com pelo menos 8 caracteres.";
      return;
    }
    if (password !== confirmation) {
      status.textContent = "As senhas precisam ser iguais.";
      return;
    }
    button.disabled = true;
    status.textContent = "Salvando nova senha...";
    try {
      const { data, error: sessionError } = await supabase.auth.getUser();
      if (sessionError || !data?.user) {
        status.textContent = "Sua sessão expirou. Entre novamente para alterar a senha.";
        return;
      }
      // updateUser always targets the authenticated account; no user ID is accepted.
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        if (error.code === "reauthentication_needed" || error.code === "reauthentication_not_valid") {
          status.textContent = "Por segurança, entre novamente no Sigprevi e tente alterar a senha.";
        } else if (error.code === "same_password") {
          status.textContent = "Escolha uma senha diferente da atual.";
        } else if (error.code === "weak_password") {
          status.textContent = "A senha não atende às regras de segurança. Escolha uma senha mais forte.";
        } else {
          status.textContent = "Não foi possível alterar a senha. Confira sua conexão e tente novamente; se persistir, entre novamente.";
        }
        return;
      }
      form.reset();
      status.textContent = "Sua senha foi alterada com sucesso.";
    } catch {
      status.textContent = "Não foi possível alterar a senha. Tente novamente.";
    } finally {
      button.disabled = false;
    }
  });
}
