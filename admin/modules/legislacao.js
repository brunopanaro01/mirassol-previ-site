import { supabase } from
  "../components/supabase-client.js";

import {
  configureLegislationForm
} from "./legislacao-form.js";

import {
  configureLegislationEdit
} from "./legislacao-edit.js";

const STATUS_LABELS = Object.freeze({
  in_force: "Em vigor",
  revoked: "Revogado",
  amended: "Alterado",
  suspended: "Suspenso",
  without_effect: "Sem efeito"
});

let documentTypes = [];
let formController = null;
let editController = null;

function createCell(label, value) {
  const cell = document.createElement("td");
  cell.dataset.label = label;
  cell.textContent = value ?? "—";
  return cell;
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("pt-BR").format(
    new Date(`${value}T12:00:00`)
  );
}

function setStatus(message, type = "") {
  const status = document.querySelector(
    "#legislation-status"
  );

  if (!status) {
    return;
  }

  status.textContent = message;
  status.className =
    `form-status ${type}`.trim();
}

function renderDocumentTypes() {
  const select = document.querySelector("#type-filter");

  const options = documentTypes.map((type) => {
    const option = document.createElement("option");
    option.value = type.code;
    option.textContent = type.name;
    return option;
  });

  select.replaceChildren(
    new Option("Todos os tipos", ""),
    ...options
  );
}

function renderDocuments(documents) {
  const tableBody = document.querySelector(
    "#legislation-records"
  );

  const emptyState = document.querySelector(
    "#legislation-empty"
  );

  tableBody.replaceChildren();

  if (!documents.length) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;

  documents.forEach((documentRecord) => {
    const row = document.createElement("tr");

    row.append(
      createCell("Tipo", documentRecord.type_name),
      createCell(
        "Número",
        `${documentRecord.number}/${documentRecord.year}`
      ),
      createCell(
        "Publicação",
        formatDate(documentRecord.publication_date)
      ),
      createCell(
        "Ementa",
        documentRecord.summary
      ),
      createCell(
        "Situação",
        STATUS_LABELS[documentRecord.status] ??
          documentRecord.status
      ),
      createCell(
        "Portal",
        documentRecord.is_published
          ? "Publicado"
          : "Rascunho"
      )
    );

    const actionsCell = document.createElement("td");
    actionsCell.dataset.label = "Ações";
    actionsCell.className = "table-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className =
      "button button-small button-secondary";
    editButton.textContent = "Editar";
    editButton.dataset.action = "edit";
    editButton.dataset.id = documentRecord.id;

    const publicationButton =
      document.createElement("button");

    publicationButton.type = "button";
    publicationButton.className =
      "button button-small button-secondary";

    publicationButton.textContent =
      documentRecord.is_published
        ? "Despublicar"
        : "Publicar";

    publicationButton.dataset.action =
      documentRecord.is_published
        ? "unpublish"
        : "publish";

    publicationButton.dataset.id =
      documentRecord.id;

    actionsCell.append(
  editButton,
  publicationButton
);

if (!documentRecord.is_published) {
  const deleteButton = document.createElement(
    "button"
  );

  deleteButton.type = "button";
  deleteButton.className =
    "button button-small button-danger";

  deleteButton.textContent = "Excluir";
  deleteButton.dataset.action = "delete";
  deleteButton.dataset.id = documentRecord.id;

  actionsCell.append(deleteButton);
}

    row.append(actionsCell);
    tableBody.append(row);
  });
}

async function loadDocumentTypes() {
  const { data, error } = await supabase.rpc(
    "legislation_list_types"
  );

  if (error) {
    throw error;
  }

  documentTypes = data ?? [];
  renderDocumentTypes();
}

async function loadDocuments() {
  setStatus("Carregando documentos...");

  const typeCode =
    document.querySelector("#type-filter").value;

  const yearValue =
    document.querySelector("#year-filter").value;

  const statusValue =
    document.querySelector("#status-filter").value;

  const publicationValue =
    document.querySelector(
      "#publication-filter"
    ).value;

  const searchValue =
    document.querySelector("#search-filter").value.trim();

  const published =
    publicationValue === ""
      ? null
      : publicationValue === "true";

  const { data, error } = await supabase.rpc(
    "legislation_admin_list_documents",
    {
      p_type_code: typeCode || null,
      p_year: yearValue
        ? Number(yearValue)
        : null,
      p_status: statusValue || null,
      p_is_published: published,
      p_search: searchValue || null
    }
  );

  if (error) {
    throw error;
  }

  const documents = data ?? [];

  renderDocuments(documents);

  setStatus(
    `${documents.length} documento(s) encontrado(s).`
  );
}

async function setDocumentPublication(
  documentId,
  publish
) {
  const actionLabel = publish
    ? "publicar"
    : "despublicar";

  const confirmed = window.confirm(
    `Deseja realmente ${actionLabel} este documento?`
  );

  if (!confirmed) {
    return;
  }

  let reason = null;

  if (!publish) {
    reason = window.prompt(
      "Informe o motivo da despublicação:"
    );

    if (reason === null) {
      return;
    }

    reason = reason.trim();

    if (reason.length < 5) {
      throw new Error(
        "Informe um motivo com pelo menos cinco caracteres."
      );
    }
  }

  setStatus(
    publish
      ? "Publicando o documento..."
      : "Despublicando o documento..."
  );

  const { error } = await supabase.rpc(
    "legislation_set_publication",
    {
      p_document_id: documentId,
      p_publish: publish,
      p_reason: reason
    }
  );

  if (error) {
    throw error;
  }

  await loadDocuments();

  setStatus(
    publish
      ? "Documento publicado com sucesso."
      : "Documento despublicado com sucesso."
  );
}

async function deleteDraft(documentId) {
  const { data: documentRecord, error: readError } =
    await supabase.rpc(
      "legislation_admin_get_document",
      {
        p_document_id: documentId
      }
    );

  if (readError) {
    throw readError;
  }

  const confirmed = window.confirm(
    "Deseja realmente excluir este rascunho? " +
    "Essa operação não poderá ser desfeita."
  );

  if (!confirmed) {
    return;
  }

  const reason = window.prompt(
    "Informe a justificativa da exclusão:"
  );

  if (reason === null) {
    return;
  }

  const normalizedReason = reason.trim();

  if (normalizedReason.length < 5) {
    throw new Error(
      "Informe uma justificativa com pelo menos " +
      "cinco caracteres."
    );
  }

  setStatus("Excluindo o rascunho...");

  const { error: deleteError } = await supabase.rpc(
    "legislation_delete_draft",
    {
      p_document_id: documentId,
      p_reason: normalizedReason
    }
  );

  if (deleteError) {
    throw deleteError;
  }

  let storageWarning = false;

  if (documentRecord?.file_path) {
    const { error: storageError } =
      await supabase.storage
        .from("legislation-documents")
        .remove([documentRecord.file_path]);

    if (storageError) {
      console.error(storageError);
      storageWarning = true;
    }
  }

  await loadDocuments();

  setStatus(
    storageWarning
      ? "Registro excluído, mas o PDF não pôde " +
        "ser removido do armazenamento."
      : "Rascunho excluído com sucesso.",
    storageWarning ? "error" : ""
  );
}

function bindEvents() {
  const filterForm = document.querySelector(
    "#legislation-filters"
  );

  filterForm.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      try {
        await loadDocuments();
      } catch (error) {
        console.error(error);

        setStatus(
          "Não foi possível consultar os documentos.",
          "error"
        );
      }
    }
  );

  document.querySelector(
    "#clear-filters"
  ).addEventListener("click", async () => {
    filterForm.reset();

    try {
      await loadDocuments();
    } catch (error) {
      console.error(error);

      setStatus(
        "Não foi possível atualizar a listagem.",
        "error"
      );
    }
  });

  document.querySelector(
  "#legislation-records"
).addEventListener("click", async (event) => {
  const button = event.target.closest(
    "button[data-action]"
  );

  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const documentId = button.dataset.id;

  if (!documentId) {
    return;
  }

  if (action === "edit") {
  if (!editController) {
    setStatus(
      "O formulário de edição ainda não foi carregado.",
      "error"
    );

    return;
  }

  button.disabled = true;

  try {
    await editController.open(documentId);
  } catch (error) {
    console.error(error);

    setStatus(
      error?.message ??
        "Não foi possível abrir a edição.",
      "error"
    );
  } finally {
    button.disabled = false;
  }

  return;
}

  if (action === "delete") {
  button.disabled = true;

  try {
    await deleteDraft(documentId);
  } catch (error) {
    console.error(error);

    setStatus(
      error?.message ??
        "Não foi possível excluir o rascunho.",
      "error"
    );
  } finally {
    button.disabled = false;
  }

  return;
}

  if (
    action !== "publish" &&
    action !== "unpublish"
  ) {
    return;
  }

  button.disabled = true;

  try {
    await setDocumentPublication(
      documentId,
      action === "publish"
    );
  } catch (error) {
    console.error(error);

    setStatus(
      error?.message ??
        "Não foi possível alterar a publicação.",
      "error"
    );
  } finally {
    button.disabled = false;
  }
});
  
  document.querySelector(
  "#create-document"
).addEventListener("click", () => {
  if (!formController) {
    setStatus(
      "O formulário ainda não foi carregado.",
      "error"
    );

    return;
  }

  formController.openCreate();
});
}

export async function initializeLegislationModule() {
  const dashboardView = document.querySelector(
    "#dashboard-view"
  );

  const moduleView = document.querySelector(
    "#module-view"
  );

  dashboardView.hidden = true;
  moduleView.hidden = false;

  document.querySelectorAll(
    ".sidebar-link"
  ).forEach((link) => {
    link.classList.remove("active");
  });

  const legislationLink = document.querySelector(
    'a[href="sigprevi.html?module=legislacao"]'
  );

  legislationLink?.classList.add("active");

  moduleView.innerHTML = `
    <div class="module-heading">
      <div>
        <p class="eyebrow">Módulo administrativo</p>
        <h1>Legislação e atos normativos</h1>
        <p class="page-description">
          Consulte, cadastre e publique documentos
          legislativos no portal institucional.
        </p>
      </div>

      <button
        id="create-document"
        class="button button-primary button-auto"
        type="button"
      >
        Cadastrar documento
      </button>
    </div>

    <form
      id="legislation-filters"
      class="filter-card"
    >
      <div class="form-field">
        <label for="type-filter">Tipo</label>
        <select id="type-filter">
          <option value="">Todos os tipos</option>
        </select>
      </div>

      <div class="form-field">
        <label for="year-filter">Ano</label>
        <input
          id="year-filter"
          type="number"
          min="1900"
          max="2200"
          placeholder="Ex.: 2026"
        >
      </div>

      <div class="form-field">
        <label for="status-filter">Situação</label>
        <select id="status-filter">
          <option value="">Todas</option>
          <option value="in_force">Em vigor</option>
          <option value="revoked">Revogado</option>
          <option value="amended">Alterado</option>
          <option value="suspended">Suspenso</option>
          <option value="without_effect">
            Sem efeito
          </option>
        </select>
      </div>

      <div class="form-field">
        <label for="publication-filter">
          Publicação
        </label>

        <select id="publication-filter">
          <option value="">Todos</option>
          <option value="true">Publicados</option>
          <option value="false">Rascunhos</option>
        </select>
      </div>

      <div class="form-field filter-search">
        <label for="search-filter">Pesquisar</label>
        <input
          id="search-filter"
          type="search"
          placeholder="Número, título ou ementa"
        >
      </div>

      <div class="filter-actions">
        <button
          class="button button-secondary"
          type="submit"
        >
          Filtrar
        </button>

        <button
          id="clear-filters"
          class="button button-secondary"
          type="button"
        >
          Limpar
        </button>
      </div>
    </form>

    <p
      id="legislation-status"
      class="form-status"
      role="status"
      aria-live="polite"
    >
      Carregando módulo...
    </p>

    <section class="data-card">
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Número</th>
              <th>Publicação</th>
              <th>Ementa</th>
              <th>Situação</th>
              <th>Portal</th>
              <th>Ações</th>
            </tr>
          </thead>

          <tbody id="legislation-records"></tbody>
        </table>
      </div>

      <p
        id="legislation-empty"
        class="empty-state"
        hidden
      >
        Nenhum documento foi encontrado.
      </p>
    </section>
  `;

  bindEvents();

  try {
  await loadDocumentTypes();

  formController = configureLegislationForm({
  documentTypes,

  onSaved: async () => {
    setStatus(
      "Documento cadastrado com sucesso."
    );

    await loadDocuments();
  }
});

editController = configureLegislationEdit({
  documentTypes,

  onSaved: async ({ oldFileWarning }) => {
    await loadDocuments();

    setStatus(
      oldFileWarning
        ? "Documento atualizado, mas o PDF antigo " +
          "não pôde ser removido."
        : "Documento atualizado com sucesso.",
      oldFileWarning ? "error" : ""
    );
  }
});

await loadDocuments();
} catch (error) {

    setStatus(
      "Não foi possível carregar o módulo de legislação.",
      "error"
    );
  }
}