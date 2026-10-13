import { supabase } from "../components/supabase-client.js";

export function initializeUserCreation(panel, onCreated) {
  panel.hidden = false;
  panel.innerHTML = `
    <h2>Cadastrar usuário</h2>
    <p>Cadastro disponível somente para o administrador responsável. Informe a senha inicial ao titular por um canal privado.</p>
    <form id="create-user-form">
      <div class="form-field"><label for="create-full-name">Nome completo</label><input id="create-full-name" name="fullName" autocomplete="name" minlength="2" maxlength="150" required></div>
      <div class="form-field"><label for="create-email">E-mail</label><input id="create-email" name="email" type="email" autocomplete="off" maxlength="254" required></div>
      <div class="form-field"><label for="create-password">Senha inicial</label><input id="create-password" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></div>
      <div class="form-field"><label for="create-confirmation">Confirme a senha inicial</label><input id="create-confirmation" name="confirmation" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></div>
      <div class="form-field"><label for="create-profile">Acesso inicial</label><select id="create-profile" name="role"><option value="">Sem acesso a módulos</option><option value="investments_committee">Comitê de Investimentos — consultas, recomendações e minutas</option></select></div>
      <button type="submit" class="button button-primary">Cadastrar usuário</button>
      <p class="form-status" role="status" aria-live="polite"></p>
    </form>`;
  const form = panel.querySelector("form"), button = form.querySelector("button"), status = form.querySelector('[role="status"]');
  const value = name => form.elements.namedItem(name).value;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (button.disabled || !form.reportValidity()) return;
    if (value("password") !== value("confirmation")) { status.textContent = "As senhas precisam ser iguais."; return; }
    const body = { fullName: value("fullName").trim(), email: value("email").trim(), password: value("password"), role: value("role") || null };
    if (!window.confirm(`Cadastrar ${body.email}${body.role ? " com acesso ao Comitê de Investimentos" : " sem acesso a módulos"}?`)) return;
    button.disabled = true; status.textContent = "Cadastrando...";
    try {
      const { data, error } = await supabase.functions.invoke("admin-user-create", { body });
      if (error || !data?.success) {
        status.textContent = "Não foi possível concluir. Confira se o e-mail já aparece na lista antes de tentar novamente; verifique sua sessão e os dados.";
        return;
      }
      form.reset();
      status.textContent = data.message;
      try { await onCreated(); } catch { status.textContent += " Atualize a página para recarregar a lista."; }
    } catch { status.textContent = "Não foi possível confirmar o cadastro. Atualize a lista antes de tentar novamente."; }
    finally { button.disabled = false; }
  });
}
