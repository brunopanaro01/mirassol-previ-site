import {
  requireAuthenticatedUser,
  signOut
} from "../components/auth-guard.js";

const emailElement = document.querySelector("#user-email");
const logoutButton = document.querySelector("#logout-button");
const statusElement = document.querySelector("#application-status");

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

    if (moduleName === "legislacao") {
      const { initializeLegislationModule } = await import(
        "./legislacao.js"
      );

      await initializeLegislationModule();
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