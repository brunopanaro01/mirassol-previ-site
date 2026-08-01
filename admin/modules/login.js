import { supabase } from
  "../components/supabase-client.js";

import {
  redirectAuthenticatedUser
} from "../components/auth-guard.js";

const form = document.querySelector("#login-form");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const statusElement = document.querySelector("#login-status");
const submitButton = document.querySelector("#login-button");

function showStatus(message, type = "") {
  statusElement.textContent = message;
  statusElement.className =
    `form-status ${type}`.trim();
}

function getRedirectDestination() {
  const parameters = new URLSearchParams(
    window.location.search
  );

  const destination = parameters.get("redirect");

  if (
    !destination ||
    !destination.startsWith("/") ||
    destination.startsWith("//")
  ) {
    return "sigprevi.html";
  }

  return destination;
}

async function initializeLogin() {
  try {
    const redirected =
      await redirectAuthenticatedUser();

    if (!redirected) {
      emailInput.focus();
    }
  } catch (error) {
    console.error(error);

    showStatus(
      "Não foi possível verificar a sessão. " +
      "Confira a configuração do Supabase.",
      "error"
    );
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showStatus(
      "Informe o e-mail e a senha.",
      "error"
    );

    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Entrando...";

  showStatus("Validando as credenciais...");

  try {
    const { error } =
      await supabase.auth.signInWithPassword({
        email,
        password
      });

    if (error) {
      throw error;
    }

    window.location.replace(
      getRedirectDestination()
    );
  } catch (error) {
    console.error(error);

    const message =
      error?.message === "Invalid login credentials"
        ? "E-mail ou senha inválidos."
        : "Não foi possível entrar. " +
          "Verifique os dados e tente novamente.";

    showStatus(message, "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Entrar";
  }
});

initializeLogin();