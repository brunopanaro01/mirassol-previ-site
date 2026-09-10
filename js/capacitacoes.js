const FALLBACK_URL = "./educacao.json";

function text(value) {
  return String(value ?? "").trim();
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function badge(label, extraClass = "") {
  return element("span", `badge ${extraClass}`.trim(), label);
}

function normalizeFallback(data) {
  return Object.entries(data ?? {}).flatMap(([year, rows]) => {
    if (!Array.isArray(rows)) return [];
    return rows.map((row, index) => ({
      id: `edu-${year}-${String(index + 1).padStart(3, "0")}`,
      reference_year: Number(year),
      course_title: text(row["O QUE (CURSO)"]),
      location: text(row.ONDE),
      planned_start: text(row["INÍCIO PREVISTO"]),
      planned_end: text(row["FIM PREVISTO"]),
      participants: text(row.PARTICIPANTES),
      objective: text(row.OBJETIVO),
      estimated_cost: text(row["QUANTO? (CUSTO ESTIMADO)"]),
      workload: text(row["CARGA HORÁRIA"]),
      status: text(row.STATUS),
      display_order: index + 1
    }));
  });
}

function statusClass(value) {
  const normalized = text(value).normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (normalized === "realizado") return "valid";
  if (normalized === "em andamento") return "current";
  if (normalized === "cancelado" || normalized === "nao realizado") return "expired";
  return "expiring";
}

function detail(label, value) {
  const item = element("div", "training-detail");
  item.append(
    element("strong", "", label),
    element("span", "", value || "Não informado")
  );
  return item;
}

function trainingCard(record) {
  const details = element("details", "card training-card");
  const summary = document.createElement("summary");
  const title = element("div", "training-title");
  title.append(element("h2", "", record.course_title));
  const meta = element("div", "card-meta");
  meta.append(
    badge(record.status, statusClass(record.status)),
    badge(record.workload || "Carga horária não informada"),
    badge(`${record.planned_start} a ${record.planned_end}`)
  );
  title.append(meta);
  summary.append(title);

  const content = element("div", "training-content");
  const grid = element("div", "training-details");
  grid.append(
    detail("Local / modalidade", record.location),
    detail("Participantes", record.participants),
    detail("Objetivo", record.objective)
  );
  if (record.estimated_cost) grid.append(detail("Custo estimado", record.estimated_cost));
  content.append(grid);
  details.append(summary, content);
  return details;
}

function render(activities) {
  const target = document.querySelector("#training-list");
  if (!activities.length) {
    target.replaceChildren(element("div", "empty", "Nenhuma ação de capacitação foi publicada."));
    return;
  }

  const years = [...new Set(activities.map((record) => Number(record.reference_year)))]
    .sort((a, b) => b - a);
  const buttons = element("div", "year-buttons");
  const list = element("div", "training-list");

  function selectYear(year) {
    buttons.querySelectorAll("button").forEach((button) => {
      const active = Number(button.dataset.year) === year;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    const records = activities
      .filter((record) => Number(record.reference_year) === year)
      .sort((a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0));
    list.replaceChildren(...records.map(trainingCard));
    document.querySelector("#selected-year").textContent = `Capacitações de ${year}`;
  }

  years.forEach((year) => {
    const button = element("button", "year-button", String(year));
    button.type = "button";
    button.dataset.year = String(year);
    button.setAttribute("role", "tab");
    button.addEventListener("click", () => selectYear(year));
    buttons.append(button);
  });
  target.replaceChildren(buttons, element("h2", "selected-year", ""), list);
  target.querySelector(".selected-year").id = "selected-year";
  selectYear(years[0]);
}

async function loadActivities() {
  try {
    const { supabase } = await import("../admin/components/supabase-client.js");
    const { data, error } = await supabase.rpc("education_public_training_snapshot");
    if (error) throw error;
    if (!Array.isArray(data?.activities)) throw new TypeError("Resposta inválida das capacitações.");
    return { activities: data.activities, source: "database", updatedAt: data.updated_at };
  } catch (error) {
    console.info("Capacitações carregadas da fonte de contingência.", error);
    const response = await fetch(FALLBACK_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Falha ao carregar ${FALLBACK_URL}.`);
    return { activities: normalizeFallback(await response.json()), source: "fallback" };
  }
}

function configureNavigation() {
  const hamburger = document.querySelector(".hamb");
  const menu = document.querySelector("#menu");
  hamburger?.addEventListener("click", () => {
    const open = menu.classList.toggle("show");
    hamburger.setAttribute("aria-expanded", String(open));
  });
  document.querySelectorAll(".has-sub > button").forEach((button) => {
    button.addEventListener("click", () => {
      const parent = button.closest(".has-sub");
      const open = parent.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
    });
  });
}

async function initialize() {
  configureNavigation();
  document.querySelector("#year").textContent = new Date().getFullYear();
  try {
    const snapshot = await loadActivities();
    render(snapshot.activities);
    document.querySelector("#training-status").textContent = snapshot.source === "database"
      ? `${snapshot.activities.length} ação(ões) publicada(s).`
      : `${snapshot.activities.length} ação(ões) exibida(s) pela contingência.`;
  } catch (error) {
    console.error(error);
    document.querySelector("#training-status").textContent =
      "Não foi possível carregar as capacitações neste momento.";
  }
}

initialize();
