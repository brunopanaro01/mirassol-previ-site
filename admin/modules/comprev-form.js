import { supabase } from
  "../components/supabase-client.js";

function normalizeDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function optionalValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function createTceUrl(number, year) {
  if (!number || !year) {
    return null;
  }

  return (
    "https://www.tce.mt.gov.br/processo/" +
    encodeURIComponent(number) +
    "/" +
    encodeURIComponent(year) +
    "#/"
  );
}

function renderDialog() {
  const existingDialog = document.querySelector(
    "#comprev-create-dialog"
  );

  if (existingDialog) {
    return existingDialog;
  }

  const dialog = document.createElement("dialog");
  dialog.id = "comprev-create-dialog";
  dialog.className = "admin-dialog";

  dialog.innerHTML = `
    <form
      id="comprev-create-form"
      class="admin-dialog-content"
      method="dialog"
    >
      <header class="admin-dialog-header">
        <div>
          <p class="eyebrow">Novo registro</p>
          <h2>Cadastrar processo COMPREV</h2>
        </div>

        <button
          class="dialog-close"
          type="button"
          aria-label="Fechar"
        >
          ×
        </button>
      </header>

      <div class="admin-dialog-body">
        <p class="page-description">
          Cadastre inicialmente os dados do benefício,
          do processo no TCE e do regime de origem.
        </p>

        <div class="dialog-form-grid">
          <label class="field field-full">
            <span>Nome do beneficiário *</span>
            <input
              name="beneficiary_name"
              type="text"
              maxlength="200"
              required
            >
          </label>

          <label class="field">
            <span>CPF</span>
            <input
              name="beneficiary_cpf"
              type="text"
              inputmode="numeric"
              maxlength="14"
              placeholder="000.000.000-00"
            >
          </label>

          <label class="field">
            <span>Tipo de benefício *</span>
            <select name="benefit_type" required>
              <option value="retirement">
                Aposentadoria
              </option>
              <option value="pension">
                Pensão
              </option>
            </select>
          </label>

          <label class="field">
            <span>Número do benefício</span>
            <input
              name="benefit_number"
              type="text"
              maxlength="80"
            >
          </label>

          <label class="field">
            <span>Data de início do benefício</span>
            <input
              name="benefit_start_date"
              type="date"
            >
          </label>

          <label class="field">
            <span>Data de concessão</span>
            <input
              name="benefit_grant_date"
              type="date"
            >
          </label>

          <label class="field">
            <span>Ano da publicação original</span>
            <input
              name="source_benefit_year"
              type="number"
              min="1900"
              max="2200"
              placeholder="2026"
            >
          </label>

          <label class="field">
            <span>Mês da publicação original</span>
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

          <label class="field field-full">
            <span>Descrição do benefício</span>
            <textarea
              name="source_benefit_description"
              rows="3"
              maxlength="1000"
            ></textarea>
          </label>

          <label class="field field-full">
            <span>Link do ato de concessão</span>
            <input
              name="grant_document_url"
              type="url"
              placeholder="https://..."
            >
          </label>

          <label class="field">
            <span>Número do processo TCE</span>
            <input
              name="tce_process_number"
              type="text"
              inputmode="numeric"
              maxlength="30"
            >
          </label>

          <label class="field">
            <span>Ano do processo TCE</span>
            <input
              name="tce_process_year"
              type="number"
              min="2000"
              max="2200"
              placeholder="2026"
            >
          </label>

          <label class="field">
            <span>Direção da compensação *</span>
            <select
              name="compensation_direction"
              required
            >
              <option value="receivable">
                A receber pelo Mirassol-Previ
              </option>
              <option value="payable">
                A pagar pelo Mirassol-Previ
              </option>
            </select>
          </label>

          <label class="field">
            <span>Regime de origem *</span>
            <select name="origin_regime" required>
              <option value="rgps">RGPS — INSS</option>
              <option value="rpps">Outro RPPS</option>
              <option value="unknown">
                Ainda não identificado
              </option>
            </select>
          </label>

          <label class="field">
            <span>Nome do regime de origem</span>
            <input
              name="origin_regime_name"
              type="text"
              maxlength="200"
              placeholder="INSS ou nome do RPPS"
            >
          </label>

          <label class="field">
            <span>CNPJ do regime de origem</span>
            <input
              name="origin_regime_cnpj"
              type="text"
              inputmode="numeric"
              maxlength="18"
              placeholder="00.000.000/0000-00"
            >
          </label>

          <label class="field field-full">
            <span>Observações</span>
            <textarea
              name="notes"
              rows="4"
              maxlength="3000"
            ></textarea>
          </label>
        </div>

        <p
          id="comprev-create-status"
          class="form-status"
          role="status"
          aria-live="polite"
        ></p>
      </div>

      <footer class="admin-dialog-footer">
        <button
          class="button button-secondary dialog-cancel"
          type="button"
        >
          Cancelar
        </button>

        <button
          class="button button-primary"
          type="submit"
        >
          Salvar processo
        </button>
      </footer>
    </form>
  `;

  document.body.append(dialog);
  return dialog;
}

function buildPayload(form) {
  const formData = new FormData(form);

  const cpf = normalizeDigits(
    formData.get("beneficiary_cpf")
  );

  const originCnpj = normalizeDigits(
    formData.get("origin_regime_cnpj")
  );

  const tceNumber = normalizeDigits(
    formData.get("tce_process_number")
  );

  const tceYear = optionalValue(
    formData.get("tce_process_year")
  );

  if (cpf && cpf.length !== 11) {
    throw new Error(
      "O CPF deve possuir exatamente 11 números."
    );
  }

  if (originCnpj && originCnpj.length !== 14) {
    throw new Error(
      "O CNPJ deve possuir exatamente 14 números."
    );
  }

  if (
    (tceNumber && !tceYear) ||
    (!tceNumber && tceYear)
  ) {
    throw new Error(
      "Informe conjuntamente o número e o ano do processo TCE."
    );
  }

  return {
    beneficiary_name: optionalValue(
      formData.get("beneficiary_name")
    ),
    beneficiary_cpf: cpf || null,
    benefit_type: formData.get("benefit_type"),
    benefit_number: optionalValue(
      formData.get("benefit_number")
    ),
    benefit_start_date: optionalValue(
      formData.get("benefit_start_date")
    ),
    benefit_grant_date: optionalValue(
      formData.get("benefit_grant_date")
    ),
    source_benefit_year: optionalValue(
      formData.get("source_benefit_year")
    ),
    source_benefit_month: optionalValue(
      formData.get("source_benefit_month")
    ),
    source_benefit_description: optionalValue(
      formData.get("source_benefit_description")
    ),
    grant_document_url: optionalValue(
      formData.get("grant_document_url")
    ),
    tce_process_number: tceNumber || null,
    tce_process_year: tceYear,
    tce_process_url: createTceUrl(
      tceNumber,
      tceYear
    ),
    compensation_direction: formData.get(
      "compensation_direction"
    ),
    origin_regime: formData.get("origin_regime"),
    origin_regime_name: optionalValue(
      formData.get("origin_regime_name")
    ),
    origin_regime_cnpj: originCnpj || null,
    notes: optionalValue(formData.get("notes"))
  };
}

export function configureComprevForm({
  onCreated
} = {}) {
  const dialog = renderDialog();

  const form = dialog.querySelector(
    "#comprev-create-form"
  );

  const status = dialog.querySelector(
    "#comprev-create-status"
  );

  const submitButton = form.querySelector(
    "[type='submit']"
  );

  const createButton = document.querySelector(
    "#comprev-create-button"
  );

  function closeDialog() {
    dialog.close();
  }

  createButton.disabled = false;
  createButton.removeAttribute("title");

  createButton.addEventListener("click", () => {
    form.reset();
    status.textContent = "";
    status.className = "form-status";
    dialog.showModal();
  });

  dialog.querySelector(
    ".dialog-close"
  ).addEventListener("click", closeDialog);

  dialog.querySelector(
    ".dialog-cancel"
  ).addEventListener("click", closeDialog);

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      closeDialog();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    submitButton.disabled = true;
    submitButton.textContent = "Salvando...";
    status.textContent = "";

    try {
      const payload = buildPayload(form);

      const { data, error } = await supabase.rpc(
        "comprev_admin_create_case",
        {
          p_data: payload
        }
      );

      if (error) {
        throw error;
      }

      closeDialog();

      if (typeof onCreated === "function") {
        await onCreated(data);
      }
    } catch (error) {
      console.error(error);

      status.textContent =
        error?.message ??
        "Não foi possível cadastrar o processo.";

      status.className = "form-status error";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Salvar processo";
    }
  });

  return {
    open() {
      createButton.click();
    }
  };
}