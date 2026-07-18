export function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

export function createButton(label, variant, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `btn btn-small ${variant}`;
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

export function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}
