import { supabase } from
  "../components/supabase-client.js";

function setStatus(statusElement, message, type = "") {
  statusElement.textContent = message;
  statusElement.className =
    `form-status ${type}`.trim();
}

function createTextElement(tagName, text, className = "") {
  const element = document.createElement(tagName);
  element.textContent = text;

  if (className) {
    element.className = className;
  }

  return element;
}

function renderEmpty(resultsContainer) {
  resultsContainer.replaceChildren(
    createTextElement(
      "p",
      "Nenhum processo compatível foi localizado no TCE-MT.",
      "tce-search-empty"
    )
  );

  resultsContainer.hidden = false;
}

function createResultCard(result, onSelect) {
  const card = document.createElement("article");
  card.className = "tce-search-result";

  const information = document.createElement("div");
  information.className = "tce-search-result-information";

  information.append(
    createTextElement(
      "strong",
      `Processo ${result.protocol}`
    )
  );

  const interestedNames = Array.isArray(
    result.interestedNames
  )
    ? result.interestedNames.join(", ")
    : "";

  if (interestedNames) {
    information.append(
      createTextElement(
        "span",
        interestedNames
      )
    );
  }

  if (result.protocolDate) {
    const formattedDate =
      new Intl.DateTimeFormat("pt-BR").format(
        new Date(
          `${result.protocolDate}T12:00:00`
        )
      );

    information.append(
      createTextElement(
        "span",
        `Protocolado em ${formattedDate}`
      )
    );
  }

  const validation = document.createElement("div");
  validation.className = "tce-search-validation";

  if (result.cpfMatch) {
    validation.append(
      createTextElement(
        "span",
        "CPF correspondente",
        "status-badge status-success"
      )
    );
  }

  if (result.exactNameMatch) {
    validation.append(
      createTextElement(
        "span",
        "Nome correspondente",
        "status-badge status-success"
      )
    );
  }

  information.append(validation);

  const actions = document.createElement("div");
  actions.className = "tce-search-result-actions";

  const openLink = document.createElement("a");
  openLink.className =
    "button button-small button-secondary";
  openLink.href = result.url;
  openLink.target = "_blank";
  openLink.rel = "noopener";
  openLink.textContent = "Abrir no TCE";

  const selectButton = document.createElement("button");
  selectButton.type = "button";
  selectButton.className =
    "button button-small button-primary";
  selectButton.textContent = "Vincular processo";

  selectButton.addEventListener(
    "click",
    () => onSelect(result, selectButton)
  );

  actions.append(openLink, selectButton);
  card.append(information, actions);

  return card;
}

export function configureComprevTceSearch({
  dialog,
  form,
  statusElement,
  onLinked
}) {
  const searchButton = dialog.querySelector(
    "#comprev-tce-search-button"
  );

  const resultsContainer = dialog.querySelector(
    "#comprev-tce-search-results"
  );

  if (!searchButton || !resultsContainer) {
    throw new Error(
      "A estrutura da consulta ao TCE não foi encontrada."
    );
  }

  let currentCaseId = null;

  function reset() {
    resultsContainer.replaceChildren();
    resultsContainer.hidden = true;
    searchButton.disabled = false;
    searchButton.textContent =
      "Buscar processo no TCE";
  }

  function setCase(caseId) {
    currentCaseId = caseId;
    reset();
  }

  async function linkResult(result, button) {
    if (!currentCaseId) {
      return;
    }

    const confirmed = window.confirm(
      `Deseja vincular o processo ${
        result.protocol
      } a este cadastro COMPREV?`
    );

    if (!confirmed) {
      return;
    }

    button.disabled = true;
    button.textContent = "Vinculando...";

    try {
      const { error } = await supabase.rpc(
        "comprev_admin_link_tce_process",
        {
          p_case_id: currentCaseId,
          p_process_number: result.number,
          p_process_year: result.year
        }
      );

      if (error) {
        throw error;
      }

      const numberField = form.elements.namedItem(
        "tce_process_number"
      );

      const yearField = form.elements.namedItem(
        "tce_process_year"
      );

      if (numberField) {
        numberField.value = result.number;
      }

      if (yearField) {
        yearField.value = String(result.year);
      }

      resultsContainer.hidden = true;

      setStatus(
        statusElement,
        `Processo ${result.protocol} vinculado com sucesso.`,
        "success"
      );

      await onLinked?.();
    } catch (error) {
      console.error(error);

      setStatus(
        statusElement,
        error?.message ??
          "Não foi possível vincular o processo do TCE.",
        "error"
      );

      button.disabled = false;
      button.textContent = "Vincular processo";
    }
  }

  async function search() {
    if (!currentCaseId) {
      return;
    }

    searchButton.disabled = true;
    searchButton.textContent =
      "Consultando o TCE...";

    resultsContainer.replaceChildren();
    resultsContainer.hidden = true;

    setStatus(
      statusElement,
      "Consultando o portal do TCE-MT..."
    );

    try {
      const { data, error } =
        await supabase.functions.invoke(
          "comprev-tce-search",
          {
            body: {
              caseId: currentCaseId
            }
          }
        );

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const results = Array.isArray(data?.results)
        ? data.results
        : [];

      if (!results.length) {
        renderEmpty(resultsContainer);

        setStatus(
          statusElement,
          "A consulta foi concluída, mas nenhum processo compatível foi localizado."
        );

        return;
      }

      const cards = results.map(
        (result) => createResultCard(
          result,
          linkResult
        )
      );

      resultsContainer.replaceChildren(...cards);
      resultsContainer.hidden = false;

      setStatus(
        statusElement,
        `${results.length} processo(s) compatível(is) encontrado(s).`
      );
    } catch (error) {
      console.error(error);

      setStatus(
        statusElement,
        error?.message ??
          "Não foi possível consultar o portal do TCE.",
        "error"
      );
    } finally {
      searchButton.disabled = false;
      searchButton.textContent =
        "Buscar processo no TCE";
    }
  }

  searchButton.addEventListener("click", search);

  return {
    setCase,
    reset
  };
}