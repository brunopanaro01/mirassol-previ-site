import {
  requireAuthenticatedUser,
  signOut
} from "../components/auth-guard.js";

import { supabase } from "../components/supabase-client.js";

const emailElement = document.querySelector("#user-email");
const logoutButton = document.querySelector("#logout-button");
const statusElement = document.querySelector("#application-status");

async function configureAdministratorAccess() {
  const { error } = await supabase.rpc(
    "access_admin_list_module_roles"
  );

  if (error) {
    console.info(
      "Área de administração de acessos indisponível para este usuário."
    );

    return false;
  }

  document.querySelector(
    "#access-management-link"
  )?.removeAttribute("hidden");

  document.querySelector(
    "#access-management-card"
  )?.removeAttribute("hidden");

  return true;
}

async function configureComprevAccess() {
  const { error } = await supabase.rpc(
    "comprev_admin_list_cases",
    {
      p_status: null,
      p_search: null,
      p_include_archived: false
    }
  );

  if (error) {
    console.info(
      "Módulo COMPREV indisponível para este usuário."
    );

    return false;
  }

  document.querySelector(
    "#comprev-link"
  )?.removeAttribute("hidden");

  document.querySelector(
    "#comprev-card"
  )?.removeAttribute("hidden");

  return true;
}

async function initializeDashboard() {
  try {
    const user = await requireAuthenticatedUser();

    if (!user) {
      return;
    }

    emailElement.textContent =
      user.email ?? "Usuário autenticado";

    const parameters = new URLSearchParams(
      window.location.search
    );

    const moduleName = parameters.get("module");

    const [
      isAdministrator,
      hasComprevAccess
    ] = await Promise.all([
      configureAdministratorAccess(),
      configureComprevAccess()
    ]);

    if (moduleName === "legislacao") {
      const { initializeLegislationModule } = await import(
        "./legislacao.js"
      );

      await initializeLegislationModule();
      return;
    }

    if (moduleName === "acessos") {
      if (!isAdministrator) {
        statusElement.textContent =
          "Esta área é restrita aos administradores.";

        statusElement.classList.add("error");
        return;
      }

      const { initializeAccessManagement } = await import(
        "./access-management.js"
      );

      await initializeAccessManagement();
      return;
    }

    if (moduleName === "comprev") {
      if (!hasComprevAccess) {
        statusElement.textContent =
          "Você não possui acesso ao módulo COMPREV.";

        statusElement.classList.add("error");
        return;
      }

      const { initializeComprevModule } = await import(
        "./comprev.js?v=20260806-tce-search-1"
      );

      await initializeComprevModule();
    }
  } catch (error) {
    console.error(error);

    statusElement.textContent =
      "Não foi possível carregar o painel administrativo.";

    statusElement.classList.add("error");
  }
}

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  logoutButton.textContent = "Saindo...";

  try {
    await signOut();
  } catch (error) {
    console.error(error);

    statusElement.textContent =
      "Não foi possível encerrar a sessão.";

    statusElement.classList.add("error");

    logoutButton.disabled = false;
    logoutButton.textContent = "Sair";
  }
});

initializeDashboard();