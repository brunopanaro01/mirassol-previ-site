import { supabase } from
  "../components/supabase-client.js";

import {
  configureComprevForm
} from "./comprev-form.js";

import {
  configureComprevDetails
} from "./comprev-details.js";

const STATUS_LABELS = Object.freeze({
  draft: "Rascunho",
  document_collection: "Coleta de documentos",
  ready_to_submit: "Pronto para envio",
  submitted: "Protocolado",
  under_review: "Em análise",
  requirement: "Em exigência",
  approved: "Aprovado",
  rejected: "Indeferido",
  payment_active: "Pagamento ativo",
  closed: "Encerrado"
});

const BENEFIT_LABELS = Object.freeze({
  retirement: "Aposentadoria",
  pension: "Pensão"
});

const DIRECTION_LABELS = Object.freeze({
  receivable: "A receber",
  payable: "A pagar"
});

let currentCases = [];
let detailsController = null;

function setStatus(message, type = "") {
  const status = document.querySelector(
    "#comprev-status"
  );

  if (!status) {
    return;
  }

  status.textContent = message;
  status.className =
    `form-status ${type}`.trim();
}

function formatCpf(value) {
  const digits = String(value ?? "").replace(
    /\D/g,
    ""
  );

  if (digits.length !== 11) {
    return value || "—";
  }

  return digits.replace(
    /^(\d{3})(\d{3})(\d{3})(\d{2})$/,
    "$1.$2.$3-$4"
  );
}

function createCell(label, value) {
  const cell = document.createElement("td");
  cell.dataset.label = label;
  cell.textContent = value ?? "—";
  return cell;
}

function createTceCell(caseRecord) {
  const cell = document.createElement("td");
  cell.dataset.label = "Processo TCE";

  if (
    !caseRecord.tce_process_number ||
    !caseRecord.tce_process_year
  ) {
    cell.textContent = "—";
    return cell;
  }

  const processLabel =
    `${caseRecord.tce_process_number}/` +
    `${caseRecord.tce_process_year}`;

  const processUrl =
    caseRecord.tce_process_url ||
    (
      "https://www.tce.mt.gov.br/processo/" +
      encodeURIComponent(
        caseRecord.tce_process_number
      ) +
      "/" +
      encodeURIComponent(
        caseRecord.tce_process_year
      ) +
      "#/"
    );

  const link = document.createElement("a");
  link.href = processUrl;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = processLabel;
  link.className = "table-link";

  cell.append(link);
  return cell;
}

function renderCases(cases) {
  const tableBody = document.querySelector(
    "#comprev-records"
  );

  const emptyState = document.querySelector(
    "#comprev-empty"
  );

  tableBody.replaceChildren();

  if (!cases.length) {
    emptyState.hidden = false;
    return;
  }

  emptyState.hidden = true;

  cases.forEach((caseRecord) => {
    const row = document.createElement("tr");

    row.append(
      createCell(
        "Beneficiário",
        caseRecord.beneficiary_name
      ),
      createCell(
        "CPF",
        formatCpf(caseRecord.beneficiary_cpf)
      ),
      createCell(
        "Benefício",
        BENEFIT_LABELS[caseRecord.benefit_type] ??
          caseRecord.benefit_type
      ),
      createTceCell(caseRecord),
      createCell(
        "Protocolo COMPREV",
        caseRecord.comprev_protocol_number || "—"
      ),
      createCell(
        "Direção",
        DIRECTION_LABELS[
          caseRecord.compensation_direction
        ] ?? caseRecord.compensation_direction
      ),
      createCell(
        "Situação",
        STATUS_LABELS[caseRecord.status] ??
          caseRecord.status
      )
    );

    const actionsCell = document.createElement("td");
    actionsCell.dataset.label = "Ações";
    actionsCell.className = "table-actions";

    const detailsButton = document.createElement(
      "button"
    );

    detailsButton.type = "button";
    detailsButton.className =
      "button button-small button-secondary";
    detailsButton.textContent = "Detalhes";
    detailsButton.dataset.action = "details";
    detailsButton.dataset.id = caseRecord.id;

    actionsCell.append(detailsButton);

if (!caseRecord.archived_at) {
  const archiveButton = document.createElement("button");

  archiveButton.type = "button";
  archiveButton.className =
    "button button-small button-danger";
  archiveButton.textContent = "Arquivar";
  archiveButton.dataset.action = "archive";
  archiveButton.dataset.id = caseRecord.id;

  actionsCell.append(archiveButton);
}

row.append(actionsCell);
    tableBody.append(row);
  });
}

async function loadCases() {
  const statusFilter = document.querySelector(
    "#comprev-status-filter"
  );

  const searchInput = document.querySelector(
    "#comprev-search"
  );

  const includeArchived = document.querySelector(
    "#comprev-include-archived"
  );

  setStatus("Carregando processos...");

  const { data, error } = await supabase.rpc(
    "comprev_admin_list_cases",
    {
      p_status: statusFilter.value || null,
      p_search: searchInput.value.trim() || null,
      p_include_archived: includeArchived.checked
    }
  );

  if (error) {
    throw error;
  }

  currentCases = Array.isArray(data) ? data : [];

  renderCases(currentCases);

  setStatus(
    `${currentCases.length} processo(s) encontrado(s).`
  );
}

function clearFilters() {
  document.querySelector(
    "#comprev-status-filter"
  ).value = "";

  document.querySelector(
    "#comprev-search"
  ).value = "";

  document.querySelector(
    "#comprev-include-archived"
  ).checked = false;
}

function bindEvents() {
  const filterForm = document.querySelector(
    "#comprev-filters"
  );

  const clearButton = document.querySelector(
    "#comprev-clear-filters"
  );

  const tableBody = document.querySelector(
    "#comprev-records"
  );

  filterForm.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      try {
        await loadCases();
      } catch (error) {
        console.error(error);

        setStatus(
          error?.message ??
            "Não foi possível consultar os processos.",
          "error"
        );
      }
    }
  );

  clearButton.addEventListener(
    "click",
    async () => {
      clearFilters();

      try {
        await loadCases();
      } catch (error) {
        console.error(error);

        setStatus(
          error?.message ??
            "Não foi possível consultar os processos.",
          "error"
        );
      }
    }
  );

  tableBody.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");

  if (!button) {
    return;
  }

  const caseRecord = currentCases.find(
    (item) => item.id === button.dataset.id
  );

  if (!caseRecord) {
    return;
  }

  const action = button.dataset.action;

  if (action === "details") {
    if (!detailsController) {
      setStatus(
        "O formulário de detalhes ainda não foi carregado.",
        "error"
      );
      return;
    }

    button.disabled = true;

    try {
      await detailsController.open(caseRecord.id);
    } catch (error) {
      console.error(error);

      setStatus(
        error?.message ??
          "Não foi possível abrir o processo.",
        "error"
      );
    } finally {
      button.disabled = false;
    }

    return;
  }

  if (action !== "archive") {
    return;
  }

  const reason = window.prompt(
    `Informe o motivo do arquivamento do processo de ${caseRecord.beneficiary_name}:`
  );

  if (reason === null) {
    return;
  }

  if (reason.trim().length < 5) {
    setStatus(
      "O motivo do arquivamento deve possuir pelo menos 5 caracteres.",
      "error"
    );
    return;
  }

  const confirmed = window.confirm(
    "Confirma o arquivamento deste processo COMPREV?"
  );

  if (!confirmed) {
    return;
  }

  button.disabled = true;
  button.textContent = "Arquivando...";

  try {
    const { error } = await supabase.rpc(
      "comprev_admin_archive_case",
      {
        p_case_id: caseRecord.id,
        p_reason: reason.trim()
      }
    );

    if (error) {
      throw error;
    }

    await loadCases();

    setStatus("Processo COMPREV arquivado com sucesso.");
  } catch (error) {
    console.error(error);

    setStatus(
      error?.message ??
        "Não foi possível arquivar o processo.",
      "error"
    );

    button.disabled = false;
    button.textContent = "Arquivar";
  }
});
}

function renderModule() {
  const dashboardView = document.querySelector(
    "#dashboard-view"
  );

  const moduleView = document.querySelector(
    "#module-view"
  );

  if (!dashboardView || !moduleView) {
    throw new Error(
      "A estrutura do painel administrativo " +
      "não foi encontrada."
    );
  }

  dashboardView.hidden = true;
  moduleView.hidden = false;

  moduleView.innerHTML = `
    <section class="module-page">
      <div class="module-header">
        <div>
          <p class="eyebrow">
            Módulo administrativo
          </p>

          <h1>COMPREV</h1>

          <p class="page-description">
            Cadastre e acompanhe os processos de
            compensação previdenciária.
          </p>
        </div>

        <button
          id="comprev-create-button"
          class="button button-primary"
          type="button"
          disabled
        >
          Cadastrar processo
        </button>
      </div>

      <form
        id="comprev-filters"
        class="filter-panel"
      >
        <div class="form-grid">
          <label class="field">
            <span>Situação</span>

            <select id="comprev-status-filter">
              <option value="">Todas</option>

              <option value="draft">
                Rascunho
              </option>

              <option value="document_collection">
                Coleta de documentos
              </option>

              <option value="ready_to_submit">
                Pronto para envio
              </option>

              <option value="submitted">
                Protocolado
              </option>

              <option value="under_review">
                Em análise
              </option>

              <option value="requirement">
                Em exigência
              </option>

              <option value="approved">
                Aprovado
              </option>

              <option value="rejected">
                Indeferido
              </option>

              <option value="payment_active">
                Pagamento ativo
              </option>

              <option value="closed">
                Encerrado
              </option>
            </select>
          </label>

          <label class="field field-grow">
            <span>Pesquisar</span>

            <input
              id="comprev-search"
              type="search"
              placeholder="Nome, CPF, protocolo ou processo TCE"
              autocomplete="off"
            >
          </label>

          <label class="checkbox-field">
            <input
              id="comprev-include-archived"
              type="checkbox"
            >

            <span>Incluir arquivados</span>
          </label>
        </div>

        <div class="filter-actions">
          <button
            class="button button-secondary"
            type="submit"
          >
            Filtrar
          </button>

          <button
            id="comprev-clear-filters"
            class="button button-secondary"
            type="button"
          >
            Limpar
          </button>
        </div>
      </form>

      <p
        id="comprev-status"
        class="form-status"
        role="status"
        aria-live="polite"
      ></p>

      <div class="table-container">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Beneficiário</th>
              <th>CPF</th>
              <th>Benefício</th>
              <th>Processo TCE</th>
              <th>Protocolo COMPREV</th>
              <th>Direção</th>
              <th>Situação</th>
              <th>Ações</th>
            </tr>
          </thead>

          <tbody id="comprev-records"></tbody>
        </table>

        <p
          id="comprev-empty"
          class="empty-state"
          hidden
        >
          Nenhum processo COMPREV foi encontrado.
        </p>
      </div>
    </section>
  `;
}

export async function initializeComprevModule() {
  renderModule();

  detailsController = configureComprevDetails({
    async onUpdated() {
      await loadCases();

      setStatus(
        "Processo COMPREV atualizado com sucesso."
      );
    }
  });

  bindEvents();

  configureComprevForm({
    async onCreated() {
      await loadCases();

      setStatus(
        "Processo COMPREV cadastrado com sucesso."
      );
    }
  });

  try {
    await loadCases();
  } catch (error) {
    console.error(error);

    setStatus(
      error?.message ??
        "Não foi possível carregar o módulo COMPREV.",
      "error"
    );
  }
}