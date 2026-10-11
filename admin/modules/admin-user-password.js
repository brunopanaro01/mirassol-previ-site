import { supabase } from "../components/supabase-client.js";
export function appendAdminPasswordControl(card, user) {
  const section = document.createElement("section");
  section.innerHTML = `
    <h3>Alterar senha deste usuário</h3>
    <p>Defina uma nova senha para esta conta. Informe-a ao titular por um canal privado.</p>
    <form>
      <div class="form-field"><label>Nova senha<input type="password" name="password" autocomplete="new-password" minlength="8" maxlength="128" required></label></div>
      <div class="form-field"><label>Confirme a nova senha<input type="password" name="confirmation" autocomplete="new-password" minlength="8" maxlength="128" required></label></div>
      <button class="button button-secondary" type="submit">Salvar senha deste usuário</button>
      <p class="form-status" role="status" aria-live="polite"></p>
    </form>
  `;
  const form = section.querySelector("form");
  const status = section.querySelector('[role="status"]');
  const button = section.querySelector("button");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (button.disabled || !form.reportValidity()) return;
    const password = form.elements.namedItem("password").value;
    if (password !== form.elements.namedItem("confirmation").value) { status.textContent = "As senhas precisam ser iguais."; return; }
    if (!window.confirm("Alterar a senha de " + user.email + "?")) return;
    button.disabled = true;
    status.textContent = "Salvando...";
    try {
      const { data, error } = await supabase.functions.invoke("admin-user-password", { body: { userId: user.user_id, password } });
      if (error || !data?.success) throw new Error();
      form.reset();
      status.textContent = "Senha deste usuário alterada com sucesso.";
    } catch { status.textContent = "Não foi possível alterar a senha. Confira sua sessão e as regras de segurança."; }
    finally { button.disabled = false; }
  });
  card.appendChild(section);
}
