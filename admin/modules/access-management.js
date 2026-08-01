import { supabase } from "../components/supabase-client.js";

let users = [];
let moduleRoles = [];
let searchTerm = "";

function getModuleView() {
  return document.querySelector("#module-view");
}

function setStatus(message, type = "") {
  const status = document.querySelector(
    "#access-management-status"
  );

  if (!status) {
    return;
  }

  status.textContent = message;
  status.className = `form-status ${type}`.trim();
}

function normalizeRoles(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function userHasRole(user, roleName) {
  return normalizeRoles(user.roles).some(
    (role) => role.name === roleName
  );
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = text;
  }

  return element;
}

function createRoleControl(user, role) {
  const assigned = userHasRole(user, role.role_name);

  const control = createElement(
    "div",
    "access-role-control"
  );

  const information = createElement(
    "div",
    "access-role-information"
  );

  information.append(
    createElement(
      "strong",
      "",
      role.module_name
    ),
    createElement(
      "span",
      "",
      role.role_description ??
        `${role.permission_count} permissão(ões)`
    )
  );

  const button = createElement(
    "button",
    assigned
      ? "button button-danger"
      : "button button-secondary",
    assigned ? "Remover acesso" : "Conceder acesso"
  );

  button.type = "button";

  button.addEventListener("click", async () => {
    await updateUserRole(
      user.user_id,
      role.role_name,
      assigned,
      button
    );
  });

  control.append(information, button);
  return control;
}

function createAssignedRoles(user) {
  const roles = normalizeRoles(user.roles);

  const container = createElement(
    "div",
    "access-current-roles"
  );

  if (!roles.length) {
    container.appendChild(
      createElement(
        "span",
        "access-role-empty",
        "Nenhum acesso administrativo atribuído."
      )
    );

    return container;
  }

  roles.forEach((role) => {
    const label =
      role.scope === "global"
        ? `${role.description ?? role.name} — acesso global`
        : `${role.module_name ?? role.module_code} — ${
            role.description ?? role.name
          }`;

    container.appendChild(
      createElement("span", "access-role-badge", label)
    );
  });

  return container;
}

function createUserCard(user) {
  const card = createElement("article", "access-user-card");
  const header = createElement("header", "access-user-header");
  const identity = createElement("div", "access-user-identity");

  identity.append(
    createElement(
      "h2",
      "",
      user.full_name || user.email || "Usuário sem nome"
    ),
    createElement(
      "span",
      "",
      user.email || "E-mail não informado"
    )
  );

  const status = createElement(
    "span",
    `access-account-status ${
      user.account_status === "active" ? "active" : ""
    }`,
    user.account_status === "active" ? "Ativo" : user.account_status
  );

  header.append(identity, status);

  const currentTitle = createElement(
    "h3",
    "access-section-title",
    "Acessos atuais"
  );

  const controlsTitle = createElement(
    "h3",
    "access-section-title",
    "Gerenciar módulos"
  );

  const controls = createElement(
    "div",
    "access-role-controls"
  );

  moduleRoles.forEach((role) => {
    controls.appendChild(createRoleControl(user, role));
  });

  card.append(
    header,
    currentTitle,
    createAssignedRoles(user),
    controlsTitle,
    controls
  );

  return card;
}

function renderUsers() {
  const container = document.querySelector(
    "#access-users-list"
  );

  const count = document.querySelector(
    "#access-users-count"
  );

  if (!container || !count) {
    return;
  }

  container.replaceChildren();

  const normalizedSearch = searchTerm
    .trim()
    .toLocaleLowerCase("pt-BR");

  const filteredUsers = users.filter((user) => {
    if (!normalizedSearch) {
      return true;
    }

    return [
      user.full_name,
      user.email,
      user.registration
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("pt-BR")
      .includes(normalizedSearch);
  });

  count.textContent =
    `${filteredUsers.length} usuário(s) encontrado(s).`;

  if (!filteredUsers.length) {
    container.appendChild(
      createElement(
        "p",
        "access-empty-message",
        "Nenhum usuário corresponde à pesquisa."
      )
    );

    return;
  }

  filteredUsers.forEach((user) => {
    container.appendChild(createUserCard(user));
  });
}

async function loadUsers() {
  const { data, error } = await supabase.rpc(
    "access_admin_list_users"
  );

  if (error) {
    throw error;
  }

  users = Array.isArray(data) ? data : [];
}

async function loadModuleRoles() {
  const { data, error } = await supabase.rpc(
    "access_admin_list_module_roles"
  );

  if (error) {
    throw error;
  }

  moduleRoles = Array.isArray(data) ? data : [];
}

async function updateUserRole(
  userId,
  roleName,
  isAssigned,
  button
) {
  const action = isAssigned ? "remover" : "conceder";

  const confirmed = window.confirm(
    `Deseja ${action} este acesso?`
  );

  if (!confirmed) {
    return;
  }

  button.disabled = true;
  setStatus(
    isAssigned
      ? "Removendo acesso..."
      : "Concedendo acesso..."
  );

  const functionName = isAssigned
    ? "access_admin_revoke_module_role"
    : "access_admin_grant_module_role";

  try {
    const { error } = await supabase.rpc(functionName, {
      p_user_id: userId,
      p_role_name: roleName
    });

    if (error) {
      throw error;
    }

    await loadUsers();
    renderUsers();

    setStatus(
      isAssigned
        ? "Acesso removido com sucesso."
        : "Acesso concedido com sucesso.",
      "success"
    );
  } catch (error) {
    console.error(error);

    setStatus(
      error?.message ??
        "Não foi possível atualizar o acesso.",
      "error"
    );

    button.disabled = false;
  }
}

function renderModule() {
  const dashboardView = document.querySelector(
    "#dashboard-view"
  );

  const moduleView = getModuleView();

  dashboardView.hidden = true;
  moduleView.hidden = false;

  document.querySelectorAll(".sidebar-link").forEach((link) => {
    link.classList.remove("active");
  });

  document.querySelector(
    "#access-management-link"
  )?.classList.add("active");

  moduleView.innerHTML = `
    <section class="access-management">
      <div class="access-page-heading">
        <div>
          <p class="eyebrow">Administração do sistema</p>
          <h1>Usuários e acessos</h1>
          <p class="page-description">
            Conceda ou remova o acesso dos usuários aos módulos
            administrativos do SIGPREVI.
          </p>
        </div>
      </div>

      <div class="access-toolbar">
        <label for="access-user-search">
          Pesquisar usuário
        </label>

        <input
          id="access-user-search"
          type="search"
          placeholder="Nome, e-mail ou matrícula"
          autocomplete="off"
        >
      </div>

      <p
        id="access-management-status"
        class="form-status"
        role="status"
        aria-live="polite"
      ></p>

      <p id="access-users-count"></p>

      <div id="access-users-list" class="access-users-list"></div>
    </section>
  `;

  document
    .querySelector("#access-user-search")
    .addEventListener("input", (event) => {
      searchTerm = event.target.value;
      renderUsers();
    });
}

export async function initializeAccessManagement() {
  renderModule();
  setStatus("Carregando usuários e acessos...");

  try {
    await Promise.all([
      loadUsers(),
      loadModuleRoles()
    ]);

    renderUsers();
    setStatus("");
  } catch (error) {
    console.error(error);

    setStatus(
      error?.message ??
        "Não foi possível carregar os usuários e acessos.",
      "error"
    );
  }
}