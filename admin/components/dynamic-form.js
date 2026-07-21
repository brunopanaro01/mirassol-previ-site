import { resolveOptions } from "../../cms/core/config.js";
import { buildRecordId } from "../../cms/core/identity.js";
import { validateValues } from "../../cms/core/validators.js";

function controlFor(field, value, disabled) {
  let control;
  if (field.type === "textarea") {
    control = document.createElement("textarea");
    control.rows = 4;
  } else if (field.type === "select") {
    control = document.createElement("select");
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Selecione";
    control.append(empty);
    for (const value of resolveOptions(field)) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      control.append(option);
    }
  } else {
    control = document.createElement("input");
    control.type = field.type;
  }
  control.id = `cms-field-${field.key}`;
  control.name = field.key;
  control.value = String(value ?? "");
  control.required = Boolean(field.required);
  control.disabled = disabled;
  return control;
}

export class DynamicForm {
  constructor({ dialog, form, fields, title, error, onSubmit }) {
    Object.assign(this, { dialog, form, fields, title, error, onSubmit });
    form.addEventListener("submit", (event) => this.submit(event));
    for (const close of dialog.querySelectorAll("[data-close]")) {
      close.addEventListener("click", () => dialog.close());
    }
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  open(config, operation, record = {}) {
    this.config = config;
    this.operation = operation;
    this.record = record;
    this.error.textContent = "";
    this.fields.replaceChildren();
    this.title.textContent = `${operation === "create" ? "Cadastrar" : "Editar"} — ${config.name}`;
    const immutable = new Set(operation === "update" ? config.identity.immutable ?? [] : []);

    for (const field of config.fields) {
      const wrapper = document.createElement("div");
      wrapper.className = "form-field";
      const label = document.createElement("label");
      label.htmlFor = `cms-field-${field.key}`;
      label.textContent = `${field.label}${field.required ? " *" : ""}`;
      const control = controlFor(field, record[field.key], immutable.has(field.key));
      wrapper.append(label, control);
      if (immutable.has(field.key)) {
        const hint = document.createElement("small");
        hint.textContent = "Este campo identifica o registro e não pode ser alterado.";
        wrapper.append(hint);
      }
      this.fields.append(wrapper);
    }
    this.dialog.showModal();
    this.form.querySelector("input, select, textarea")?.focus();
  }

  submit(event) {
    event.preventDefault();
    try {
      const raw = Object.fromEntries(this.config.fields.map((field) => {
        const control = this.form.elements.namedItem(field.key);
        return [field.key, control.disabled ? this.record[field.key] : control.value];
      }));
      const values = validateValues(this.config, raw);
      const recordId = this.operation === "create"
        ? buildRecordId(this.config, values)
        : this.record[this.config.identity.field];
      this.dialog.close();
      this.onSubmit({ operation: this.operation, recordId, values });
    } catch (error) {
      this.error.textContent = error.message;
    }
  }
}
