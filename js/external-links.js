const PORTAL_HOSTS = new Set([
  "mirassolprevi.com.br",
  "www.mirassolprevi.com.br"
]);

function externalDestination(anchor) {
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) return null;

  let url;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return null;
  }

  if (!/^https?:$/.test(url.protocol)) return null;
  if (PORTAL_HOSTS.has(url.hostname) || url.hostname === window.location.hostname) return null;
  return url;
}

function buildWarningDialog() {
  const dialog = document.createElement("dialog");
  dialog.className = "external-link-warning";
  dialog.setAttribute("aria-labelledby", "external-link-warning-title");
  dialog.setAttribute("aria-describedby", "external-link-warning-description");
  dialog.innerHTML = `
    <form method="dialog">
      <div class="external-link-warning__icon" aria-hidden="true">↗</div>
      <div>
        <p class="external-link-warning__eyebrow">Aviso de redirecionamento</p>
        <h2 id="external-link-warning-title">Você está saindo do portal</h2>
        <p id="external-link-warning-description">
          O conteúdo e o tratamento de dados pessoais passam a seguir as regras do site de destino.
        </p>
        <p class="external-link-warning__destination">
          Destino: <strong data-external-host></strong>
        </p>
      </div>
      <div class="external-link-warning__actions">
        <button value="cancel" type="submit" class="external-link-warning__cancel">Cancelar</button>
        <button value="continue" type="submit" class="external-link-warning__continue">Continuar</button>
      </div>
    </form>`;

  const style = document.createElement("style");
  style.textContent = `
    .external-link-warning {
      width: min(520px, calc(100% - 32px));
      padding: 0;
      border: 0;
      border-radius: 18px;
      color: #12324a;
      background: #fff;
      box-shadow: 0 24px 70px rgba(3, 36, 58, .28);
    }
    .external-link-warning::backdrop { background: rgba(4, 31, 49, .62); }
    .external-link-warning form {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 18px;
      padding: 28px;
      margin: 0;
    }
    .external-link-warning__icon {
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: 14px;
      color: #075985;
      background: #e0f2fe;
      font: 700 24px/1 system-ui, sans-serif;
    }
    .external-link-warning__eyebrow {
      margin: 0 0 5px;
      color: #0369a1;
      font: 700 12px/1.3 system-ui, sans-serif;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .external-link-warning h2 {
      margin: 0 0 10px;
      color: #073b5c;
      font: 700 clamp(21px, 4vw, 27px)/1.2 system-ui, sans-serif;
    }
    .external-link-warning p {
      font-family: system-ui, sans-serif;
      line-height: 1.55;
    }
    .external-link-warning__destination {
      margin: 14px 0 0;
      padding: 10px 12px;
      border-radius: 10px;
      overflow-wrap: anywhere;
      color: #334155;
      background: #f1f5f9;
      font-size: 14px;
    }
    .external-link-warning__actions {
      grid-column: 1 / -1;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 4px;
    }
    .external-link-warning button {
      min-height: 44px;
      padding: 10px 18px;
      border: 1px solid #0b5f91;
      border-radius: 10px;
      cursor: pointer;
      font: 700 15px/1 system-ui, sans-serif;
    }
    .external-link-warning__cancel { color: #075985; background: #fff; }
    .external-link-warning__continue { color: #fff; background: #075985; }
    .external-link-warning button:focus-visible { outline: 3px solid #f59e0b; outline-offset: 2px; }
    @media (max-width: 480px) {
      .external-link-warning form { grid-template-columns: 1fr; padding: 22px; }
      .external-link-warning__actions { grid-column: 1; flex-direction: column-reverse; }
      .external-link-warning button { width: 100%; }
    }
    @media (prefers-reduced-motion: no-preference) {
      .external-link-warning[open] { animation: external-warning-in .18s ease-out; }
      @keyframes external-warning-in { from { opacity: 0; transform: translateY(8px); } }
    }`;

  document.head.append(style);
  document.body.append(dialog);
  return dialog;
}

const dialog = buildWarningDialog();
const hostLabel = dialog.querySelector("[data-external-host]");
let pendingNavigation = null;
let sourceLink = null;

document.addEventListener("click", (event) => {
  if (event.defaultPrevented || event.button !== 0) return;
  const anchor = event.target.closest?.("a[href]");
  if (!anchor) return;

  const url = externalDestination(anchor);
  if (!url) return;

  event.preventDefault();
  pendingNavigation = {
    url: url.href,
    target: anchor.target,
    download: anchor.hasAttribute("download")
  };
  sourceLink = anchor;
  hostLabel.textContent = url.hostname.replace(/^www\./, "");

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else if (window.confirm(`Você será direcionado para ${hostLabel.textContent}. Deseja continuar?`)) {
    window.open(url.href, anchor.target || "_self", "noopener,noreferrer");
  }
});

dialog.addEventListener("close", () => {
  const navigation = pendingNavigation;
  pendingNavigation = null;

  if (dialog.returnValue === "continue" && navigation) {
    if (navigation.target === "_blank" || navigation.download) {
      window.open(navigation.url, "_blank", "noopener,noreferrer");
    } else {
      window.location.assign(navigation.url);
    }
    return;
  }

  sourceLink?.focus({ preventScroll: true });
  sourceLink = null;
});
