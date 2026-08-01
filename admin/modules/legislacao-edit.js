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
      "O arquivo não foi reconhecido como PDF."
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

async function removePdf(filePath) {
  if (!filePath) {
    return false;
  }

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([filePath]);

  if (error) {
    console.error(error);
    return false;
  }

  return true;
}

function createEditDialog() {
  const existing = document.querySelector(
    "#legislation-edit-dialog"
  );

  if (existing) {
    return existing;
  }

  const dialog = document.createElement("dialog");
  dialog.id = "legislation-edit-dialog";
  dialog.className = "document-dialog";

  dialog.innerHTML = `
    <form
      id="legislation-edit-form"
      class="document-form"
      method="dialog"
    >
      <div class="dialog-heading">
        <div>
          <p class="eyebrow">Alteração de registro</p>
          <h2>Editar ato normativo</h2>
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
        As alterações serão registradas na auditoria.
        Documentos publicados devem ser despublicados
        antes da edição.
      </p>

      <div class="document-form-grid">
        <div class="form-field">
          <label for="edit-document-type">
            Tipo do ato
          </label>

          <select
            id="edit-document-type"
            required
          >
            <option value="">
              Selecione o tipo
            </option>
          </select>
        </div>

        <div class="form-field">
          <label for="edit-document-number">
            Número
          </label>

          <input
            id="edit-document-number"
            type="text"
            maxlength="40"
            required
          >
        </div>

        <div class="form-field">
          <label for="edit-document-year">
            Ano
          </label>

          <input
            id="edit-document-year"
            type="number"
            min="1900"
            max="2200"
            required
          >
        </div>

        <div class="form-field">
          <label for="edit-publication-date">
            Data de publicação
          </label>

          <input
            id="edit-publication-date"
            type="date"
          >
        </div>

        <div class="form-field form-field-wide">
          <label for="edit-document-title">
            Título complementar
          </label>

          <input
            id="edit-document-title"
            type="text"
            maxlength="250"
          >
        </div>

        <div class="form-field form-field-wide">
          <label for="edit-document-summary">
            Ementa
          </label>

          <textarea
            id="edit-document-summary"
            rows="4"
            maxlength="2000"
            required
          ></textarea>
        </div>

        <div class="form-field form-field-wide">
          <label for="edit-document-description">
            Observações
          </label>

          <textarea
            id="edit-document-description"
            rows="3"
            maxlength="3000"
          ></textarea>
        </div>

        <div class="form-field">
          <label for="edit-document-status">
            Situação
          </label>

          <select
            id="edit-document-status"
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
          <label>PDF atual</label>

          <p
            id="current-document-file"
            class="current-file"
          >
            Nenhum PDF cadastrado.
          </p>
        </div>

        <div class="form-field form-field-wide">
          <label for="edit-document-file">
            Substituir PDF
          </label>

          <input
            id="edit-document-file"
            type="file"
            accept="application/pdf,.pdf"
          >

          <small>
            Deixe vazio para manter o arquivo atual.
            Tamanho máximo: 20 MB.
          </small>
        </div>

        <div class="form-field form-field-wide">
          <label for="edit-external-url">
            Endereço externo
          </label>

          <input
            id="edit-external-url"
            type="url"
            maxlength="1000"
            placeholder="https://..."
          >
        </div>
      </div>

      <p
        id="edit-form-status"
        class="form-status"
        role="alert"
        aria-live="polite"
      ></p>

      <div class="dialog-actions">
        <button
          class="button button-secondary cancel-edit"
          type="button"
        >
          Cancelar
        </button>

        <button
          id="save-document-edit"
          class="button button-primary button-auto"
          type="submit"
        >
          Salvar alterações
        </button>
      </div>
    </form>
  `;

  document.body.append(dialog);

  return dialog;
}

function populateTypes(
  dialog,
  documentTypes
) {
  const select = dialog.querySelector(
    "#edit-document-type"
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

function setEditStatus(
  dialog,
  message,
  type = ""
) {
  const status = dialog.querySelector(
    "#edit-form-status"
  );

  status.textContent = message;
  status.className =
    `form-status ${type}`.trim();
}

function fillEditForm(dialog, documentRecord) {
  dialog.querySelector(
    "#edit-document-type"
  ).value = documentRecord.document_type_id;

  dialog.querySelector(
    "#edit-document-number"
  ).value = documentRecord.number ?? "";

  dialog.querySelector(
    "#edit-document-year"
  ).value = documentRecord.year ?? "";

  dialog.querySelector(
    "#edit-publication-date"
  ).value = documentRecord.publication_date ?? "";

  dialog.querySelector(
    "#edit-document-title"
  ).value = documentRecord.title ?? "";

  dialog.querySelector(
    "#edit-document-summary"
  ).value = documentRecord.summary ?? "";

  dialog.querySelector(
    "#edit-document-description"
  ).value = documentRecord.description ?? "";

  dialog.querySelector(
    "#edit-document-status"
  ).value = documentRecord.status ?? "in_force";

  dialog.querySelector(
    "#edit-external-url"
  ).value = documentRecord.external_url ?? "";

  dialog.querySelector(
    "#edit-document-file"
  ).value = "";

  dialog.querySelector(
    "#current-document-file"
  ).textContent =
    documentRecord.file_path ??
    "Nenhum PDF cadastrado.";

  setEditStatus(dialog, "");
}

export function configureLegislationEdit({
  documentTypes,
  onSaved
}) {
  const dialog = createEditDialog();

  const form = dialog.querySelector(
    "#legislation-edit-form"
  );

  const saveButton = dialog.querySelector(
    "#save-document-edit"
  );

  let currentDocument = null;

  populateTypes(dialog, documentTypes);

  function closeDialog() {
    if (!saveButton.disabled) {
      dialog.close();
    }
  }

  dialog.querySelector(
    ".dialog-close"
  ).addEventListener("click", closeDialog);

  dialog.querySelector(
    ".cancel-edit"
  ).addEventListener("click", closeDialog);

  dialog.addEventListener("cancel", (event) => {
    if (saveButton.disabled) {
      event.preventDefault();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentDocument) {
      setEditStatus(
        dialog,
        "Nenhum documento foi selecionado.",
        "error"
      );

      return;
    }

    let uploadedFilePath = null;

    const typeSelect = dialog.querySelector(
      "#edit-document-type"
    );

    const selectedOption =
      typeSelect.options[typeSelect.selectedIndex];

    const documentTypeId = typeSelect.value;
    const typeCode = selectedOption?.dataset.code;

    const number = dialog.querySelector(
      "#edit-document-number"
    ).value.trim();

    const year = Number(
      dialog.querySelector(
        "#edit-document-year"
      ).value
    );

    const publicationDate =
      dialog.querySelector(
        "#edit-publication-date"
      ).value;

    const title = dialog.querySelector(
      "#edit-document-title"
    ).value.trim();

    const summary = dialog.querySelector(
      "#edit-document-summary"
    ).value.trim();

    const description = dialog.querySelector(
      "#edit-document-description"
    ).value.trim();

    const status = dialog.querySelector(
      "#edit-document-status"
    ).value;

    const externalUrl = dialog.querySelector(
      "#edit-external-url"
    ).value.trim();

    const file = dialog.querySelector(
      "#edit-document-file"
    ).files[0] ?? null;

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

      validatePdf(file);
      validateExternalUrl(externalUrl);

      if (
        !file &&
        !currentDocument.file_path &&
        !externalUrl
      ) {
        throw new Error(
          "O documento precisa possuir um PDF " +
          "ou um endereço externo."
        );
      }

      saveButton.disabled = true;
      saveButton.textContent = "Salvando...";

      let effectiveFilePath =
        currentDocument.file_path;

      if (file) {
        setEditStatus(
          dialog,
          "Enviando o novo PDF..."
        );

        uploadedFilePath = await uploadPdf(
          file,
          typeCode,
          year
        );

        effectiveFilePath = uploadedFilePath;
      }

      setEditStatus(
        dialog,
        "Atualizando o documento..."
      );

      const { data, error } = await supabase.rpc(
        "legislation_update_document",
        {
          p_document_id: currentDocument.id,
          p_document_type_id: documentTypeId,
          p_number: number,
          p_year: year,
          p_summary: summary,
          p_publication_date:
            publicationDate || null,
          p_title: title || null,
          p_description: description || null,
          p_status: status,
          p_file_path: effectiveFilePath,
          p_external_url: externalUrl || null
        }
      );

      if (error) {
        throw error;
      }

      let oldFileWarning = false;

      if (
        uploadedFilePath &&
        currentDocument.file_path &&
        currentDocument.file_path !==
          uploadedFilePath
      ) {
        const removed = await removePdf(
          currentDocument.file_path
        );

        oldFileWarning = !removed;
      }

      dialog.close();

      if (typeof onSaved === "function") {
        await onSaved({
          document: data,
          oldFileWarning
        });
      }
    } catch (error) {
      console.error(error);

      if (uploadedFilePath) {
        await removePdf(uploadedFilePath);
      }

      setEditStatus(
        dialog,
        error?.message ??
          "Não foi possível atualizar o documento.",
        "error"
      );
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Salvar alterações";
    }
  });

  return {
    async open(documentId) {
      setEditStatus(
        dialog,
        "Carregando documento..."
      );

      const { data, error } = await supabase.rpc(
        "legislation_admin_get_document",
        {
          p_document_id: documentId
        }
      );

      if (error) {
        throw error;
      }

      if (data.is_published) {
        throw new Error(
          "Despublique o documento antes de editá-lo."
        );
      }

      currentDocument = data;

      populateTypes(dialog, documentTypes);
      fillEditForm(dialog, currentDocument);
      dialog.showModal();
    }
  };
}