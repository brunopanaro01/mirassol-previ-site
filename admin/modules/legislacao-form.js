import { supabase } from
  "../components/supabase-client.js";

const STORAGE_BUCKET = "legislation-documents";
const MAX_FILE_SIZE = 20 * 1024 * 1024;

function normalizeFileName(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function createStoragePath(typeCode, year, file) {
  const normalizedName =
    normalizeFileName(file.name) || "documento.pdf";

  const nameWithoutExtension =
    normalizedName.replace(/\.pdf$/i, "");

  const uniquePart =
    crypto.randomUUID().split("-")[0];

  return (
    `${typeCode}/${year}/` +
    `${nameWithoutExtension}-${uniquePart}.pdf`
  );
}

function validatePdf(file) {
  if (!file) {
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      "O PDF deve possuir no máximo 20 MB."
    );
  }

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error(
      "Selecione um arquivo no formato PDF."
    );
  }

  if (
    file.type &&
    file.type !== "application/pdf"
  ) {
    throw new Error(
      "O arquivo selecionado não foi reconhecido como PDF."
    );
  }
}

function validateExternalUrl(value) {
  if (!value) {
    return;
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error(
      "O endereço externo informado é inválido."
    );
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error(
      "O endereço externo deve utilizar HTTPS."
    );
  }
}

async function uploadPdf(
  file,
  typeCode,
  year
) {
  const filePath = createStoragePath(
    typeCode,
    year,
    file
  );

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, file, {
      contentType: "application/pdf",
      cacheControl: "3600",
      upsert: false
    });

  if (error) {
    throw new Error(
      `Não foi possível enviar o PDF: ${error.message}`
    );
  }

  return filePath;
}

async function removeUploadedPdf(filePath) {
  if (!filePath) {
    return;
  }

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([filePath]);

  if (error) {
    console.error(
      "Não foi possível remover o PDF após a falha:",
      error
    );
  }
}

function createDialog() {
  const existingDialog = document.querySelector(
    "#legislation-form-dialog"
  );

  if (existingDialog) {
    return existingDialog;
  }

  const dialog = document.createElement("dialog");
  dialog.id = "legislation-form-dialog";
  dialog.className = "document-dialog";

  dialog.innerHTML = `
    <form
      id="legislation-document-form"
      class="document-form"
      method="dialog"
    >
      <div class="dialog-heading">
        <div>
          <p class="eyebrow">Novo registro</p>
          <h2>Cadastrar ato normativo</h2>
        </div>

        <button
          class="dialog-close"
          type="button"
          aria-label="Fechar formulário"
        >
          ×
        </button>
      </div>

      <p class="dialog-description">
        Cadastre primeiro como rascunho. A publicação
        será realizada posteriormente pela ação
        “Publicar”.
      </p>

      <div class="document-form-grid">
        <div class="form-field">
          <label for="document-type">
            Tipo do ato
          </label>

          <select
            id="document-type"
            name="document_type_id"
            required
          >
            <option value="">
              Selecione o tipo
            </option>
          </select>
        </div>

        <div class="form-field">
          <label for="document-number">
            Número
          </label>

          <input
            id="document-number"
            name="number"
            type="text"
            maxlength="40"
            placeholder="Ex.: 005"
            required
          >
        </div>

        <div class="form-field">
          <label for="document-year">
            Ano
          </label>

          <input
            id="document-year"
            name="year"
            type="number"
            min="1900"
            max="2200"
            required
          >
        </div>

        <div class="form-field">
          <label for="publication-date">
            Data de publicação
          </label>

          <input
            id="publication-date"
            name="publication_date"
            type="date"
          >
        </div>

        <div class="form-field form-field-wide">
          <label for="document-title">
            Título complementar
          </label>

          <input
            id="document-title"
            name="title"
            type="text"
            maxlength="250"
            placeholder="Opcional"
          >
        </div>

        <div class="form-field form-field-wide">
          <label for="document-summary">
            Ementa
          </label>

          <textarea
            id="document-summary"
            name="summary"
            rows="4"
            maxlength="2000"
            required
          ></textarea>
        </div>

        <div class="form-field form-field-wide">
          <label for="document-description">
            Observações
          </label>

          <textarea
            id="document-description"
            name="description"
            rows="3"
            maxlength="3000"
            placeholder="Opcional"
          ></textarea>
        </div>

        <div class="form-field">
          <label for="document-status">
            Situação
          </label>

          <select
            id="document-status"
            name="status"
            required
          >
            <option value="in_force">
              Em vigor
            </option>

            <option value="revoked">
              Revogado
            </option>

            <option value="amended">
              Alterado
            </option>

            <option value="suspended">
              Suspenso
            </option>

            <option value="without_effect">
              Sem efeito
            </option>
          </select>
        </div>

        <div class="form-field form-field-wide">
          <label for="document-file">
            Arquivo PDF
          </label>

          <input
            id="document-file"
            name="file"
            type="file"
            accept="application/pdf,.pdf"
          >

          <small>
            Tamanho máximo: 20 MB. Informe um PDF ou
            um endereço externo.
          </small>
        </div>

        <div class="form-field form-field-wide">
          <label for="document-external-url">
            Endereço externo
          </label>

          <input
            id="document-external-url"
            name="external_url"
            type="url"
            maxlength="1000"
            placeholder="https://..."
          >
        </div>
      </div>

      <p
        id="document-form-status"
        class="form-status"
        role="alert"
        aria-live="polite"
      ></p>

      <div class="dialog-actions">
        <button
          class="button button-secondary cancel-document"
          type="button"
        >
          Cancelar
        </button>

        <button
          id="save-document"
          class="button button-primary button-auto"
          type="submit"
        >
          Salvar rascunho
        </button>
      </div>
    </form>
  `;

  document.body.append(dialog);

  return dialog;
}

function populateDocumentTypes(
  dialog,
  documentTypes
) {
  const select = dialog.querySelector(
    "#document-type"
  );

  const options = documentTypes.map((type) => {
    const option = document.createElement("option");
    option.value = type.id;
    option.dataset.code = type.code;
    option.textContent = type.name;
    return option;
  });

  select.replaceChildren(
    new Option("Selecione o tipo", ""),
    ...options
  );
}

function setFormStatus(
  dialog,
  message,
  type = ""
) {
  const status = dialog.querySelector(
    "#document-form-status"
  );

  status.textContent = message;
  status.className =
    `form-status ${type}`.trim();
}

function resetForm(dialog) {
  const form = dialog.querySelector(
    "#legislation-document-form"
  );

  form.reset();

  dialog.querySelector("#document-year").value =
    new Date().getFullYear();

  setFormStatus(dialog, "");
}

export function configureLegislationForm({
  documentTypes,
  onSaved
}) {
  const dialog = createDialog();

  populateDocumentTypes(
    dialog,
    documentTypes
  );

  const form = dialog.querySelector(
    "#legislation-document-form"
  );

  const saveButton = dialog.querySelector(
    "#save-document"
  );

  function closeDialog() {
    if (!saveButton.disabled) {
      dialog.close();
    }
  }

  dialog.querySelector(
    ".dialog-close"
  ).addEventListener("click", closeDialog);

  dialog.querySelector(
    ".cancel-document"
  ).addEventListener("click", closeDialog);

  dialog.addEventListener("cancel", (event) => {
    if (saveButton.disabled) {
      event.preventDefault();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    let uploadedFilePath = null;

    const formData = new FormData(form);

    const documentTypeId =
      formData.get("document_type_id");

    const selectedOption =
      dialog.querySelector(
        "#document-type option:checked"
      );

    const typeCode =
      selectedOption?.dataset.code;

    const number =
      String(formData.get("number") ?? "").trim();

    const year =
      Number(formData.get("year"));

    const summary =
      String(formData.get("summary") ?? "").trim();

    const publicationDate =
      String(
        formData.get("publication_date") ?? ""
      ).trim();

    const title =
      String(formData.get("title") ?? "").trim();

    const description =
      String(
        formData.get("description") ?? ""
      ).trim();

    const status =
      String(formData.get("status") ?? "");

    const externalUrl =
      String(
        formData.get("external_url") ?? ""
      ).trim();

    const fileInput = dialog.querySelector(
      "#document-file"
    );

    const file = fileInput.files[0] ?? null;

    try {
      if (
        !documentTypeId ||
        !typeCode ||
        !number ||
        !Number.isInteger(year) ||
        !summary
      ) {
        throw new Error(
          "Preencha todos os campos obrigatórios."
        );
      }

      if (year < 1900 || year > 2200) {
        throw new Error(
          "O ano informado é inválido."
        );
      }

      if (!file && !externalUrl) {
        throw new Error(
          "Informe um arquivo PDF ou um endereço externo."
        );
      }

      validatePdf(file);
      validateExternalUrl(externalUrl);

      saveButton.disabled = true;
      saveButton.textContent = "Salvando...";

      setFormStatus(
        dialog,
        file
          ? "Enviando o PDF..."
          : "Salvando o documento..."
      );

      if (file) {
        uploadedFilePath = await uploadPdf(
          file,
          typeCode,
          year
        );
      }

      setFormStatus(
        dialog,
        "Registrando o documento..."
      );

      const { data, error } = await supabase.rpc(
        "legislation_create_document",
        {
          p_document_type_id: documentTypeId,
          p_number: number,
          p_year: year,
          p_summary: summary,
          p_publication_date:
            publicationDate || null,
          p_title: title || null,
          p_description: description || null,
          p_status: status,
          p_file_path: uploadedFilePath,
          p_external_url: externalUrl || null
        }
      );

      if (error) {
        throw error;
      }

      setFormStatus(
        dialog,
        "Documento cadastrado com sucesso."
      );

      dialog.close();

      if (typeof onSaved === "function") {
        await onSaved(data);
      }
    } catch (error) {
      console.error(error);

      if (uploadedFilePath) {
        await removeUploadedPdf(
          uploadedFilePath
        );
      }

      setFormStatus(
        dialog,
        error?.message ??
          "Não foi possível cadastrar o documento.",
        "error"
      );
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Salvar rascunho";
    }
  });

  return {
    openCreate() {
      resetForm(dialog);
      populateDocumentTypes(
        dialog,
        documentTypes
      );
      dialog.showModal();
    }
  };
}