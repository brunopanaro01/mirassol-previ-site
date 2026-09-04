import { supabase } from
  "../components/supabase-client.js";

import {
  configureComprevTceSearch
} from "./comprev-tce-search.js";

const STATUS_OPTIONS = Object.freeze({
  draft: "Rascunho",
  document_collection: "Coleta de documentos",
  ready_to_submit: "Pronto para envio",
  submitted: "Protocolado",
  under_review: "Em análise",
  requirement: "Em exigência",
  approved: "Aprovado",
  rejected: "Indeferido",
  payment_active: "Compensação ativa",
  closed: "Encerrado"
});

function createOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function setField(form, name, value) {
  const field = form.elements.namedItem(name);

  if (field) {
    field.value = value ?? "";
  }
}

function nullable(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function buildTceUrl(number, year) {
  if (!number || !year) {
    return null;
  }

  return (
    "https://www.tce.mt.gov.br/processo/" +
    `${encodeURIComponent(number)}/` +
    `${encodeURIComponent(year)}#/`
  );
}

function createDialog() {
  const dialog = document.createElement("dialog");
  dialog.id = "comprev-details-dialog";
  dialog.className = "admin-dialog";

  dialog.innerHTML = `
    <div class="admin-dialog-content">
      <header class="admin-dialog-header">
        <p class="eyebrow">PROCESSO COMPREV</p>
        <h2>Detalhes e acompanhamento</h2>

        <button
          class="dialog-close"
          type="button"
          aria-label="Fechar"
        >
          ×
        </button>
      </header>

      <form id="comprev-details-form">
        <div class="admin-dialog-body">
          <p class="page-description">
            Atualize os dados cadastrais e o andamento do processo.
          </p>

          <div class="dialog-form-grid">
            <label class="field-full">
              Nome do beneficiário *
              <input
                name="beneficiary_name"
                type="text"
                maxlength="200"
                required
              >
            </label>

            <label>
              CPF
              <input
                name="beneficiary_cpf"
                type="text"
                inputmode="numeric"
                maxlength="14"
              >
            </label>

            <label>
              Tipo de benefício *
              <select name="benefit_type" required>
                <option value="retirement">
                  Aposentadoria
                </option>
                <option value="pension">
                  Pensão
                </option>
              </select>
            </label>

            <label>
              Número do benefício
              <input
                name="benefit_number"
                type="text"
                maxlength="50"
              >
            </label>

            <label>
              Data de início
              <input
                name="benefit_start_date"
                type="date"
              >
            </label>

            <label>
              Data de concessão
              <input
                name="benefit_grant_date"
                type="date"
              >
            </label>

            <label>
              Ano da publicação no portal
              <input
                name="source_benefit_year"
                type="number"
                min="1900"
                max="2200"
              >
            </label>

            <label>
              Mês da publicação no portal
              <select name="source_benefit_month">
                <option value="">Não informado</option>
                <option value="1">Janeiro</option>
                <option value="2">Fevereiro</option>
                <option value="3">Março</option>
                <option value="4">Abril</option>
                <option value="5">Maio</option>
                <option value="6">Junho</option>
                <option value="7">Julho</option>
                <option value="8">Agosto</option>
                <option value="9">Setembro</option>
                <option value="10">Outubro</option>
                <option value="11">Novembro</option>
                <option value="12">Dezembro</option>
              </select>
            </label>

            <label class="field-full">
              Descrição publicada do benefício
              <textarea
                name="source_benefit_description"
                rows="3"
                maxlength="1000"
              ></textarea>
            </label>

            <label class="field-full">
              Link do ato de concessão
              <input
                name="grant_document_url"
                type="url"
                placeholder="https://..."
              >
            </label>

            <label>
              Direção
              <select name="compensation_direction">
                <option value="receivable">
                  A receber
                </option>
                <option value="payable">
                  A pagar
                </option>
              </select>
            </label>

            <label>
              Número do processo TCE
              <input
                name="tce_process_number"
                type="text"
                inputmode="numeric"
              >
            </label>

            <label>
              Ano do processo TCE
              <input
                name="tce_process_year"
                type="number"
                min="2000"
                max="2200"
              >
            </label>

            <div class="tce-search-panel">
  <div class="tce-search-panel-heading">
    <div>
      <strong>Consulta ao TCE-MT</strong>

      <span>
        Localize o processo pelo nome e CPF do
        beneficiário.
      </span>
    </div>

    <button
      id="comprev-tce-search-button"
      class="button button-secondary"
      type="button"
    >
      Buscar processo no TCE
    </button>
  </div>

  <div
    id="comprev-tce-search-results"
    class="tce-search-results"
    hidden
  ></div>
</div>

            <label>
              Regime de origem
              <select name="origin_regime">
                <option value="rgps">RGPS</option>
                <option value="rpps">RPPS</option>
                <option value="unknown">
                  Não identificado
                </option>
              </select>
            </label>

            <label>
              Nome do regime de origem
              <input
                name="origin_regime_name"
                type="text"
                maxlength="200"
              >
            </label>

            <label>
              CNPJ do regime de origem
              <input
                name="origin_regime_cnpj"
                type="text"
                inputmode="numeric"
                maxlength="18"
              >
            </label>

            <label>
              Protocolo COMPREV
              <input
                name="comprev_protocol_number"
                type="text"
                maxlength="100"
              >
            </label>

            <label>
              Data do protocolo
              <input
                name="comprev_protocol_date"
                type="date"
              >
            </label>

            <label>
              Situação
              <select name="status"></select>
            </label>

            <label>
              Data de análise
              <input
                name="analysis_date"
                type="date"
              >
            </label>

            <label>
              Data de aprovação
              <input
                name="approval_date"
                type="date"
              >
            </label>

            <label>
              Valor mensal
              <input
                name="monthly_compensation_amount"
                type="number"
                min="0"
                step="0.01"
              >
            </label>

            <label>
              Valor dos atrasados
              <input
                name="arrears_amount"
                type="number"
                min="0"
                step="0.01"
              >
            </label>

            <label>
              Início do pagamento
              <input
                name="payment_start_date"
                type="date"
              >
            </label>

            <label>
              Final do pagamento
              <input
                name="payment_end_date"
                type="date"
              >
            </label>

            <label class="field-full">
              Descrição da exigência
              <textarea
                name="requirement_description"
                rows="3"
              ></textarea>
            </label>

            <label>
              Recebimento da exigência
              <input
                name="requirement_received_at"
                type="date"
              >
            </label>

            <label>
              Prazo da exigência
              <input
                name="requirement_deadline"
                type="date"
              >
            </label>

            <label class="field-full">
              Motivo do indeferimento
              <textarea
                name="rejection_reason"
                rows="3"
              ></textarea>
            </label>

            <label class="field-full">
              Observações
              <textarea
                name="notes"
                rows="4"
              ></textarea>
            </label>
          </div>

          <p
            id="comprev-details-status"
            class="form-status"
            role="status"
            aria-live="polite"
          ></p>
        </div>

        <footer class="admin-dialog-footer">
          <button
            class="button button-secondary"
            data-action="cancel"
            type="button"
          >
            Cancelar
          </button>

          <button
            class="button button-primary"
            type="submit"
          >
            Salvar alterações
          </button>
        </footer>
      </form>
    </div>
  `;

  document.body.append(dialog);
  return dialog;
}

export function configureComprevDetails({
  onUpdated
} = {}) {
  const dialog =
    document.querySelector("#comprev-details-dialog") ??
    createDialog();

  const form = dialog.querySelector(
    "#comprev-details-form"
  );

  const statusElement = dialog.querySelector(
    "#comprev-details-status"
  );

  const submitButton = form.querySelector(
    'button[type="submit"]'
  );

  const statusSelect = form.elements.namedItem("status");

  statusSelect.replaceChildren(
    ...Object.entries(STATUS_OPTIONS).map(
      ([value, label]) => createOption(value, label)
    )
  );

  let currentCaseId = null;

const tceSearchController =
  configureComprevTceSearch({
    dialog,
    form,
    statusElement,

    async onLinked() {
      await onUpdated?.();
    }
  });

function close() {
  dialog.close();
}

dialog.querySelector(".dialog-close")
    .addEventListener("click", close);

  form.querySelector('[data-action="cancel"]')
    .addEventListener("click", close);

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      close();
    }
  });

  async function open(caseId) {
  currentCaseId = caseId;
  tceSearchController.setCase(caseId);
  form.reset();
    statusElement.textContent = "";
    statusElement.className = "form-status";

    const { data, error } = await supabase.rpc(
      "comprev_admin_get_case",
      {
        p_case_id: caseId
      }
    );

    if (error) {
      throw error;
    }

    const record = Array.isArray(data)
      ? data[0]
      : data;

    if (!record) {
      throw new Error(
        "O processo COMPREV não foi encontrado."
      );
    }

    [
      "beneficiary_name",
      "beneficiary_cpf",
      "benefit_type",
      "benefit_number",
      "benefit_start_date",
      "benefit_grant_date",
      "source_benefit_year",
      "source_benefit_month",
      "source_benefit_description",
      "grant_document_url",
      "compensation_direction",
      "tce_process_number",
      "tce_process_year",
      "origin_regime",
      "origin_regime_name",
      "origin_regime_cnpj",
      "comprev_protocol_number",
      "comprev_protocol_date",
      "status",
      "analysis_date",
      "approval_date",
      "monthly_compensation_amount",
      "arrears_amount",
      "payment_start_date",
      "payment_end_date",
      "requirement_description",
      "requirement_received_at",
      "requirement_deadline",
      "rejection_reason",
      "notes"
    ].forEach((fieldName) => {
      setField(form, fieldName, record[fieldName]);
    });

    dialog.showModal();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentCaseId) {
      return;
    }

    const formData = new FormData(form);

    const cpf = digitsOnly(
      formData.get("beneficiary_cpf")
    );

    const cnpj = digitsOnly(
      formData.get("origin_regime_cnpj")
    );

    const tceNumber = digitsOnly(
      formData.get("tce_process_number")
    );

    const tceYear = nullable(
      formData.get("tce_process_year")
    );

    if (cpf && cpf.length !== 11) {
      statusElement.textContent =
        "O CPF deve conter 11 números.";
      statusElement.className = "form-status error";
      return;
    }

    if (cnpj && cnpj.length !== 14) {
      statusElement.textContent =
        "O CNPJ deve conter 14 números.";
      statusElement.className = "form-status error";
      return;
    }

    if (
      (tceNumber && !tceYear) ||
      (!tceNumber && tceYear)
    ) {
      statusElement.textContent =
        "Informe juntos o número e o ano do processo TCE.";
      statusElement.className = "form-status error";
      return;
    }

    const payload = {
      beneficiary_name: nullable(
        formData.get("beneficiary_name")
      ),
      beneficiary_cpf: cpf || null,
      benefit_type: formData.get("benefit_type"),
      benefit_number: nullable(
        formData.get("benefit_number")
      ),
      benefit_start_date: nullable(
        formData.get("benefit_start_date")
      ),
      benefit_grant_date: nullable(
        formData.get("benefit_grant_date")
      ),
      source_benefit_year: nullable(
        formData.get("source_benefit_year")
      ),
      source_benefit_month: nullable(
        formData.get("source_benefit_month")
      ),
      source_benefit_description: nullable(
        formData.get("source_benefit_description")
      ),
      grant_document_url: nullable(
        formData.get("grant_document_url")
      ),
      compensation_direction: formData.get(
        "compensation_direction"
      ),
      tce_process_number: tceNumber || null,
      tce_process_year: tceYear,
      tce_process_url: buildTceUrl(
        tceNumber,
        tceYear
      ),
      origin_regime: formData.get("origin_regime"),
      origin_regime_name: nullable(
        formData.get("origin_regime_name")
      ),
      origin_regime_cnpj: cnpj || null,
      comprev_protocol_number: nullable(
        formData.get("comprev_protocol_number")
      ),
      comprev_protocol_date: nullable(
        formData.get("comprev_protocol_date")
      ),
      status: formData.get("status"),
      analysis_date: nullable(
        formData.get("analysis_date")
      ),
      approval_date: nullable(
        formData.get("approval_date")
      ),
      monthly_compensation_amount: nullable(
        formData.get("monthly_compensation_amount")
      ),
      arrears_amount: nullable(
        formData.get("arrears_amount")
      ),
      payment_start_date: nullable(
        formData.get("payment_start_date")
      ),
      payment_end_date: nullable(
        formData.get("payment_end_date")
      ),
      requirement_description: nullable(
        formData.get("requirement_description")
      ),
      requirement_received_at: nullable(
        formData.get("requirement_received_at")
      ),
      requirement_deadline: nullable(
        formData.get("requirement_deadline")
      ),
      rejection_reason: nullable(
        formData.get("rejection_reason")
      ),
      notes: nullable(formData.get("notes"))
    };

    submitButton.disabled = true;
    submitButton.textContent = "Salvando...";

    try {
      const { error } = await supabase.rpc(
        "comprev_admin_update_case",
        {
          p_case_id: currentCaseId,
          p_data: payload
        }
      );

      if (error) {
        throw error;
      }

      close();
      await onUpdated?.();
    } catch (error) {
      console.error(error);

      statusElement.textContent =
        error?.message ??
        "Não foi possível atualizar o processo.";

      statusElement.className = "form-status error";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Salvar alterações";
    }
  });

  return {
    open
  };
}
