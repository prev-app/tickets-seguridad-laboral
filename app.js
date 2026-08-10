import { DataClient } from "./data.js";
import { buildReportData, classifyExpectation, normalizeEmail } from "./stats.js";

const client = new DataClient();
const page = document.body.dataset.page;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const formatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const percentFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dateOnly(value) {
  if (!value) return "Sin fecha";
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("es-AR").format(new Date(year, month - 1, day));
}

function dateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function number(value, suffix = "") {
  return value === null || value === undefined || Number.isNaN(value) ? "—" : `${formatter.format(value)}${suffix}`;
}

function percent(value) {
  return `${percentFormatter.format(Number(value) || 0)} %`;
}

function courseHeader(course) {
  const statusClass = course.status === "open" ? "" : " status-badge--closed";
  const statusText = course.status === "open" ? "Participación abierta" : "Participación cerrada";
  return `
    <div class="course-card__top">
      <div>
        <span class="eyebrow">Capacitación</span>
        <h2>${escapeHtml(course.name)}</h2>
        <div>Profesor/a: <strong>${escapeHtml(course.instructor)}</strong></div>
      </div>
      <span class="status-badge${statusClass}">${statusText}</span>
    </div>
    <div class="course-meta">
      <span>${dateOnly(course.start_date)} — ${dateOnly(course.end_date)}</span>
      <span>${escapeHtml(course.modality)} · ${number(course.hours)} horas</span>
    </div>`;
}

function objectiveOptions(course) {
  const question = $("[data-objective-question]");
  const container = $("[data-objective-options]");
  if (!question || !container) return;
  question.textContent = course.objective_question;
  const options = Array.isArray(course.objective_options) ? course.objective_options : [];
  container.innerHTML = options.map((option, index) => `
    <label>
      <input type="radio" name="objective_answer" value="${escapeHtml(option)}" ${index === 0 ? "required" : ""}>
      <span>${escapeHtml(option)}</span>
    </label>`).join("");
}

function setMessage(element, message, type = "error") {
  if (!element) return;
  element.textContent = message;
  element.className = `form-message${type === "success" ? " form-message--success" : type === "info" ? " form-message--info" : ""}`;
}

function setBusy(form, busy) {
  $$(`button, input, select, textarea`, form).forEach(control => { control.disabled = busy; });
}

function formObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function friendlyError(error) {
  if (error?.code === "23505") return "Ya existe una respuesta para este correo en el curso.";
  if (error?.code === "23503" || error?.code === "NO_ENTRANCE" || /ticket de entrada/i.test(error?.message || "")) {
    return "No encontramos un ticket de entrada con ese correo para este curso.";
  }
  if (error?.status === 401 || error?.status === 403) return "No tenés permiso para realizar esta acción.";
  if (/Failed to fetch/i.test(error?.message || "")) return "No se pudo conectar. Revisá tu conexión e intentá nuevamente.";
  return error?.message || "Ocurrió un error inesperado.";
}

async function initTicket(kind) {
  const header = $("[data-course-header]");
  const formPanel = $("[data-form-panel]");
  const unavailable = $("[data-unavailable-panel]");
  try {
    const course = await client.getActiveCourse();
    if (!course) {
      header.hidden = true;
      unavailable.hidden = false;
      unavailable.innerHTML = "<h1>No hay un curso activo</h1><p>La administración todavía no configuró una capacitación.</p>";
      return;
    }
    header.innerHTML = courseHeader(course);
    if (course.status !== "open") {
      formPanel.hidden = true;
      unavailable.hidden = false;
      unavailable.innerHTML = `<h1>Participación cerrada</h1><p>Ya no se reciben respuestas para ${escapeHtml(course.name)}.</p>`;
      return;
    }
    objectiveOptions(course);
    formPanel.hidden = false;
    unavailable.hidden = true;

    const form = kind === "entrance" ? $("#entrance-form") : $("#exit-form");
    const message = $("[data-form-message]");

    if (kind === "entrance") {
      $$(`input[name="employed"]`, form).forEach(input => input.addEventListener("change", () => {
        const working = input.value === "true" && input.checked;
        const sectorField = $("#sector-field");
        const sector = $("#sector");
        sectorField.hidden = !working;
        sector.required = working;
        if (!working) sector.value = "";
      }));
    }

    form.addEventListener("submit", async event => {
      event.preventDefault();
      setMessage(message, "", "info");
      if (!form.reportValidity()) return;
      const values = formObject(form);
      const base = {
        course_id: course.id,
        email: normalizeEmail(values.email),
        risk_identification: Number(values.risk_identification),
        unsafe_action: Number(values.unsafe_action),
        objective_answer: values.objective_answer
      };
      try {
        setBusy(form, true);
        if (kind === "entrance") {
          await client.submitEntrance({
            ...base,
            age: Number(values.age),
            education_level: values.education_level,
            employed: values.employed === "true",
            sector: values.employed === "true" ? values.sector : null,
            expectation_text: values.expectation_text.trim(),
            main_risk: values.main_risk.trim()
          });
        } else {
          await client.submitExit({
            ...base,
            preventive_measure: values.preventive_measure.trim(),
            expectation_fulfillment: values.expectation_fulfillment,
            course_usefulness: Number(values.course_usefulness)
          });
        }
        form.reset();
        if (kind === "entrance") $("#sector-field").hidden = true;
        setMessage(message, "Respuesta guardada correctamente. Gracias por participar.", "success");
        message.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (error) {
        setMessage(message, friendlyError(error));
      } finally {
        setBusy(form, false);
      }
    });
  } catch (error) {
    header.hidden = true;
    unavailable.hidden = false;
    unavailable.innerHTML = `<h1>No pudimos cargar el curso</h1><p>${escapeHtml(friendlyError(error))}</p>`;
  }
}

let adminCourse = null;
let adminResponses = { entrances: [], exits: [] };

function fillCourseForm(course) {
  const form = $("#course-form");
  const values = course || {
    id: "",
    name: "",
    instructor: "",
    hours: 8,
    modality: "Presencial",
    start_date: "",
    end_date: "",
    objective_question: "Si detectás una condición que puede provocar un accidente, ¿qué deberías hacer primero?",
    objective_options: ["Detener la tarea y comunicar la situación", "Continuar con cuidado", "Esperar a que otra persona lo resuelva", "Ignorarla"],
    correct_answer: "Detener la tarea y comunicar la situación"
  };
  Object.entries(values).forEach(([key, value]) => {
    const control = form.elements.namedItem(key);
    if (!control) return;
    control.value = key === "objective_options" && Array.isArray(value) ? value.join("\n") : (value ?? "");
  });
}

function updateAdminSummary() {
  const { entrances, exits } = adminResponses;
  const entranceEmails = new Set(entrances.map(row => normalizeEmail(row.email)));
  const paired = exits.filter(row => entranceEmails.has(normalizeEmail(row.email))).length;
  const completion = entrances.length ? (paired / entrances.length) * 100 : 0;
  $("[data-count='entrances']").textContent = entrances.length;
  $("[data-count='exits']").textContent = exits.length;
  $("[data-count='paired']").textContent = paired;
  $("[data-count='completion']").textContent = percent(completion);
  $("[data-completion-bar]").style.width = `${Math.min(completion, 100)}%`;
  const badge = $("[data-course-status]");
  const toggle = $("#toggle-course-button");
  if (!adminCourse) {
    badge.textContent = "Sin configurar";
    badge.className = "status-badge status-badge--closed";
    toggle.disabled = true;
    return;
  }
  const open = adminCourse.status === "open";
  badge.textContent = open ? "Curso abierto" : "Curso cerrado";
  badge.className = `status-badge${open ? "" : " status-badge--closed"}`;
  toggle.disabled = false;
  toggle.textContent = open ? "Cerrar participación" : "Reabrir participación";
}

function setResponseActionsDisabled(disabled) {
  ["#download-data-button", "#view-report-button", "#download-report-button", "#reset-course-button"]
    .forEach(selector => { $(selector).disabled = disabled; });
}

async function refreshAdmin() {
  let loaded = false;
  setResponseActionsDisabled(true);
  try {
    adminCourse = await client.getActiveCourse(true);
    fillCourseForm(adminCourse);
    adminResponses = adminCourse ? await client.getResponses(adminCourse.id) : { entrances: [], exits: [] };
    updateAdminSummary();
    loaded = true;
  } finally {
    setResponseActionsDisabled(!loaded || !adminCourse);
  }
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const string = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${string.replaceAll('"', '""')}"`;
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCsv() {
  if (!adminCourse) return;
  const exits = new Map(adminResponses.exits.map(row => [normalizeEmail(row.email), row]));
  const headers = [
    "email", "fecha_entrada", "fecha_salida", "edad", "nivel_academico", "trabaja", "sector",
    "identifica_riesgos_entrada", "identifica_riesgos_salida", "actua_entrada", "actua_salida",
    "respuesta_objetiva_entrada", "respuesta_objetiva_salida", "expectativa_inicial", "categoria_expectativa",
    "cumplimiento_expectativa", "riesgo_principal", "medida_preventiva", "utilidad_curso"
  ];
  const rows = adminResponses.entrances.map(entrance => {
    const exit = exits.get(normalizeEmail(entrance.email)) || {};
    return [
      entrance.email, dateTime(entrance.responded_at), dateTime(exit.responded_at), entrance.age, entrance.education_level,
      entrance.employed ? "Sí" : "No", entrance.sector, entrance.risk_identification, exit.risk_identification,
      entrance.unsafe_action, exit.unsafe_action, entrance.objective_answer, exit.objective_answer,
      entrance.expectation_text, classifyExpectation(entrance.expectation_text).label, exit.expectation_fulfillment,
      entrance.main_risk, exit.preventive_measure, exit.course_usefulness
    ];
  });
  const unmatchedExits = adminResponses.exits.filter(exit => !adminResponses.entrances.some(entrance => normalizeEmail(entrance.email) === normalizeEmail(exit.email)));
  unmatchedExits.forEach(exit => rows.push([
    exit.email, "", dateTime(exit.responded_at), "", "", "", "", "", exit.risk_identification, "", exit.unsafe_action,
    "", exit.objective_answer, "", "", exit.expectation_fulfillment, "", exit.preventive_measure, exit.course_usefulness
  ]));
  const csv = `\uFEFF${headers.map(csvCell).join(",")}\r\n${rows.map(row => row.map(csvCell).join(",")).join("\r\n")}`;
  downloadFile(`respuestas-${slug(adminCourse.name)}.csv`, csv, "text/csv;charset=utf-8");
}

function slug(value) {
  return String(value || "curso").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function metricTable(title, metric) {
  const total = metric.pairs || 0;
  const share = count => total ? percent((count / total) * 100) : "0 %";
  const extremes = metric.outliers.length
    ? `${metric.outliers.map(value => value > 0 ? `+${value}` : value).join(", ")} (${percent(metric.outlierShare)} de la muestra)`
    : total < 4 ? "Muestra insuficiente para aplicar el criterio IQR" : "No se detectaron";
  return `
    <h3>${escapeHtml(title)}</h3>
    <table class="report-table">
      <thead><tr><th>Indicador</th><th>Entrada</th><th>Salida</th><th>Cambio individual</th></tr></thead>
      <tbody>
        <tr><td>Casos válidos</td><td>${metric.entrance.n}</td><td>${metric.exit.n}</td><td>${metric.change.n}</td></tr>
        <tr><td>Media</td><td>${number(metric.entrance.mean)}</td><td>${number(metric.exit.mean)}</td><td>${metric.change.mean > 0 ? "+" : ""}${number(metric.change.mean)}</td></tr>
        <tr><td>Mediana</td><td>${number(metric.entrance.median)}</td><td>${number(metric.exit.median)}</td><td>${metric.change.median > 0 ? "+" : ""}${number(metric.change.median)}</td></tr>
        <tr><td>Mínimo</td><td>${number(metric.entrance.min)}</td><td>${number(metric.exit.min)}</td><td>${number(metric.change.min)}</td></tr>
        <tr><td>Máximo</td><td>${number(metric.entrance.max)}</td><td>${number(metric.exit.max)}</td><td>${number(metric.change.max)}</td></tr>
        <tr><td>Desviación estándar</td><td>${number(metric.entrance.sd)}</td><td>${number(metric.exit.sd)}</td><td>${number(metric.change.sd)}</td></tr>
        <tr><td>Rango</td><td>${number(metric.entrance.range)}</td><td>${number(metric.exit.range)}</td><td>${number(metric.change.range)}</td></tr>
      </tbody>
    </table>
    <p class="report-note"><strong>Cambio:</strong> ${metric.improved} mejoraron (${share(metric.improved)}), ${metric.unchanged} no variaron (${share(metric.unchanged)}) y ${metric.worsened} disminuyeron (${share(metric.worsened)}). <strong>Valores extremos:</strong> ${extremes}.${metric.outliers.length ? ` El cambio medio sin esos casos es ${number(metric.meanWithoutOutliers)} puntos.` : ""}</p>`;
}

function barList(items) {
  if (!items.length || !items.some(item => item.count)) return "<p class='muted'>Sin datos.</p>";
  const max = Math.max(...items.map(item => item.count), 1);
  return `<div class="bar-list">${items.filter(item => item.count).map(item => `
    <div class="bar-row">
      <span>${escapeHtml(item.label)}</span>
      <div class="bar-track"><span style="width:${(item.count / max) * 100}%"></span></div>
      <strong>${percent(item.share)}</strong>
  </div>`).join("")}</div>`;
}

function fulfillmentCell(count, total) {
  return `${count} (${total ? percent((count / total) * 100) : "0 %"})`;
}

function expectationChart(rows) {
  const visible = rows.filter(row => row.entranceCount);
  if (!visible.length) return "<p class='muted'>Sin expectativas registradas.</p>";
  return `
    <div class="chart-legend" aria-label="Referencias del gráfico">
      <span><i class="stacked-full"></i>Totalmente</span>
      <span><i class="stacked-partial"></i>Parcialmente</span>
      <span><i class="stacked-no"></i>No cumplió</span>
    </div>
    <div class="expectation-chart">${visible.map(row => {
      const total = row.pairedCount;
      const full = row.counts.Totalmente;
      const partial = row.counts.Parcialmente;
      const no = row.counts["No cumplió"];
      const width = count => total ? (count / total) * 100 : 0;
      return `<div class="stacked-row">
        <div class="stacked-label"><strong>${escapeHtml(row.label)}</strong>${row.entranceCount} participantes · ${total} con respuesta final</div>
        <div class="stacked-track" aria-label="${escapeHtml(row.label)}: ${full} totalmente, ${partial} parcialmente y ${no} no cumplió">
          ${full ? `<span class="stacked-full" style="width:${width(full)}%" title="Totalmente: ${full}">${full}</span>` : ""}
          ${partial ? `<span class="stacked-partial" style="width:${width(partial)}%" title="Parcialmente: ${partial}">${partial}</span>` : ""}
          ${no ? `<span class="stacked-no" style="width:${width(no)}%" title="No cumplió: ${no}">${no}</span>` : ""}
        </div>
      </div>`;
    }).join("")}</div>`;
}

function expectationTable(rows) {
  const visible = rows.filter(row => row.entranceCount);
  if (!visible.length) return "";
  return `<table class="report-table expectation-table">
    <thead><tr><th>Expectativa</th><th>Inicial</th><th>Totalmente</th><th>Parcialmente</th><th>No cumplió</th><th>Sin respuesta final</th></tr></thead>
    <tbody>${visible.map(row => `<tr>
      <td>${escapeHtml(row.label)}</td>
      <td>${row.entranceCount}</td>
      <td>${fulfillmentCell(row.counts.Totalmente, row.pairedCount)}</td>
      <td>${fulfillmentCell(row.counts.Parcialmente, row.pairedCount)}</td>
      <td>${fulfillmentCell(row.counts["No cumplió"], row.pairedCount)}</td>
      <td>${row.withoutExit}</td>
    </tr>`).join("")}</tbody>
  </table>`;
}

function reportHtml(data) {
  const generatedAt = new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeStyle: "short" }).format(new Date());
  const objectiveAvailable = data.objectiveEntrance.n || data.objectiveExit.n;
  return `<article class="report-paper">
    <span class="eyebrow">Informe de capacitación</span>
    <h1>${escapeHtml(data.course.name)}</h1>
    <div class="report-meta">
      Profesor/a: ${escapeHtml(data.course.instructor)} · ${escapeHtml(data.course.modality)} · ${number(data.course.hours)} horas<br>
      Período: ${dateOnly(data.course.start_date)} — ${dateOnly(data.course.end_date)} · Informe generado: ${escapeHtml(generatedAt)}
    </div>

    <div class="report-cards">
      <div class="report-card"><strong>${data.entrances.length}</strong><span>Tickets de entrada</span></div>
      <div class="report-card"><strong>${data.exits.length}</strong><span>Tickets de salida</span></div>
      <div class="report-card"><strong>${data.paired.length}</strong><span>Casos vinculados</span></div>
      <div class="report-card"><strong>${percent(data.completionRate)}</strong><span>Tasa de seguimiento</span></div>
    </div>

    <h2>Evaluación del aprendizaje</h2>
    ${metricTable("Identificación de riesgos", data.risk)}
    ${metricTable("Actuación ante una situación insegura", data.action)}

    <h2>Pregunta objetiva</h2>
    ${objectiveAvailable ? `
      <table class="report-table">
        <thead><tr><th>Indicador</th><th>Entrada</th><th>Salida</th><th>Cambio</th></tr></thead>
        <tbody><tr><td>Respuestas correctas</td><td>${percent(data.objectiveEntrance.share)} (${data.objectiveEntrance.correct}/${data.objectiveEntrance.n})</td><td>${percent(data.objectiveExit.share)} (${data.objectiveExit.correct}/${data.objectiveExit.n})</td><td>${data.objectiveChange > 0 ? "+" : ""}${percent(data.objectiveChange)}</td></tr></tbody>
      </table>` : "<p class='muted'>Sin respuestas suficientes.</p>"}

    <h2>Expectativas iniciales y cumplimiento</h2>
    <p>Se clasificaron <strong>${data.expectations.answered} expectativas</strong> (${percent(data.expectations.coverage)} de los tickets de entrada). Cada respuesta pertenece a una sola categoría para que las cantidades y porcentajes no se dupliquen.</p>
    <h3>Expectativas agrupadas</h3>
    ${barList(data.expectations.categories)}
    <h3>Cumplimiento general</h3>
    ${barList(data.expectations.fulfillment)}
    <h3>Qué ocurrió con cada expectativa</h3>
    ${expectationChart(data.expectations.crossTab)}
    ${expectationTable(data.expectations.crossTab)}
    <p class="report-note">El cruce utiliza el mismo correo en entrada y salida. Los porcentajes de cumplimiento de cada fila se calculan solamente sobre quienes contestaron ambos tickets; la columna “Sin respuesta final” hace visible cualquier caso pendiente.</p>
    <h3>Reglas de clasificación utilizadas</h3>
    <ul class="rule-list">${data.expectations.categories.map(category => `<li><strong>${escapeHtml(category.label)}:</strong> ${escapeHtml(category.description)}.</li>`).join("")}</ul>

    <h2>Perfil de participantes</h2>
    <p><strong>Edad:</strong> media ${number(data.age.mean)} años, mediana ${number(data.age.median)}, mínimo ${number(data.age.min)} y máximo ${number(data.age.max)} (n=${data.age.n}).</p>
    <h3>Rangos de edad</h3>${barList(data.ageRanges)}
    <h3>Nivel académico alcanzado</h3>${barList(data.education)}
    <h3>Situación laboral</h3>${barList(data.employment)}
    <h3>Sectores laborales</h3>${barList(data.sectors)}

    <h2>Valoración del curso</h2>
    <p>La utilidad media fue de <strong>${number(data.usefulness.mean)} sobre 5</strong> (mediana ${number(data.usefulness.median)}, n=${data.usefulness.n}).</p>

    <p class="report-note">Los valores extremos se detectan sobre los cambios individuales mediante el criterio de rango intercuartílico (1,5 × IQR). Los resultados describen a quienes respondieron ambos tickets y deben interpretarse con cautela cuando la muestra es pequeña.</p>
  </article>`;
}

function fullReportDocument(content) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Informe ${escapeHtml(adminCourse?.name || "")}</title><style>${REPORT_CSS}</style></head><body>${content}</body></html>`;
}

const REPORT_CSS = `
  :root{font-family:Arial,sans-serif;color:#172421}body{margin:0;background:#f3f6f5}.report-paper{max-width:850px;margin:24px auto;padding:38px;background:#fff;box-shadow:0 10px 30px #18362f14}.eyebrow{color:#0b6b58;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.report-paper h1{font-size:32px;margin:5px 0 8px}.report-paper h2{font-size:19px;margin:30px 0 12px;padding-top:18px;border-top:1px solid #dce5e2}.report-paper h3{font-size:15px}.report-meta,.muted{color:#60706c;font-size:13px;line-height:1.5}.report-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:22px 0}.report-card{padding:13px;border:1px solid #dce5e2;border-radius:9px}.report-card strong{display:block;font-size:23px}.report-card span{color:#60706c;font-size:11px}.report-table{display:block;width:100%;max-width:100%;overflow-x:auto;border-collapse:collapse;font-size:12px}.report-table th,.report-table td{padding:8px 6px;border-bottom:1px solid #dce5e2;text-align:right}.report-table th:first-child,.report-table td:first-child{text-align:left}.report-table th{color:#60706c;font-size:10px;text-transform:uppercase}.report-note{padding:11px 13px;border-left:3px solid #0b6b58;background:#e4f3ef;font-size:12px;line-height:1.5}.bar-list{display:grid;gap:9px}.bar-row{display:grid;grid-template-columns:140px 1fr 50px;align-items:center;gap:9px;font-size:12px}.bar-track{height:8px;overflow:hidden;border-radius:99px;background:#e5ece9}.bar-track span{display:block;height:100%;background:#0b6b58}.chart-legend{display:flex;flex-wrap:wrap;gap:12px;margin:10px 0 14px;color:#60706c;font-size:11px}.chart-legend span{display:inline-flex;align-items:center;gap:5px}.chart-legend i{width:10px;height:10px;border-radius:3px}.expectation-chart{display:grid;gap:14px}.stacked-row{display:grid;grid-template-columns:170px 1fr;align-items:center;gap:12px}.stacked-label{font-size:12px;line-height:1.35}.stacked-label strong{display:block}.stacked-track{display:flex;min-height:24px;overflow:hidden;border-radius:6px;background:#e5ece9}.stacked-track span{display:grid;place-items:center;color:#fff;font-size:10px;font-weight:800}.stacked-full{background:#147d68}.stacked-partial{background:#d38b18}.stacked-no{background:#b64b4b}.rule-list{padding-left:19px;color:#60706c;font-size:12px;line-height:1.55}@media(max-width:650px){.report-paper{margin:0;padding:22px 16px}.report-cards{grid-template-columns:repeat(2,1fr)}.bar-row{grid-template-columns:105px 1fr 45px}.stacked-row{grid-template-columns:1fr;gap:5px}}@media print{body{background:#fff}.report-paper{margin:0;padding:0;box-shadow:none}.report-table{display:table;max-width:none;overflow:visible}}`;

function getReportContent() {
  if (!adminCourse) throw new Error("Primero configurá un curso.");
  return reportHtml(buildReportData(adminCourse, adminResponses.entrances, adminResponses.exits));
}

function showReport() {
  const content = getReportContent();
  $("[data-report-content]").innerHTML = content;
  $("#report-dialog").showModal();
}

function printReport() {
  const content = $("[data-report-content]").innerHTML || getReportContent();
  const printRoot = document.createElement("div");
  printRoot.className = "print-root";
  printRoot.innerHTML = content;
  document.body.append(printRoot);
  window.print();
  printRoot.remove();
}

function downloadReport() {
  const content = getReportContent();
  downloadFile(`informe-${slug(adminCourse.name)}.html`, fullReportDocument(content), "text/html;charset=utf-8");
}

function confirmAction({ title, text, requireWord = false, dangerLabel = "Confirmar" }) {
  return new Promise(resolve => {
    const dialog = $("#confirm-dialog");
    $("[data-confirm-title]").textContent = title;
    $("[data-confirm-text]").textContent = text;
    $("[data-confirm-button]").textContent = dangerLabel;
    const wrap = $("[data-confirm-input-wrap]");
    const input = $("[data-confirm-input]");
    wrap.hidden = !requireWord;
    input.value = "";
    const closeHandler = () => {
      dialog.removeEventListener("close", closeHandler);
      resolve(dialog.returnValue === "confirm" && (!requireWord || input.value.trim().toUpperCase() === "REINICIAR"));
    };
    dialog.addEventListener("close", closeHandler);
    dialog.showModal();
  });
}

async function showAdminPanel() {
  $("#login-panel").hidden = true;
  $("#admin-panel").hidden = false;
  $("#logout-button").hidden = client.isDemo;
  $("[data-demo-banner]").hidden = !client.isDemo;
  try {
    await refreshAdmin();
  } catch (error) {
    setMessage($("[data-course-message]"), friendlyError(error));
  }
}

function bindAdminActions() {
  const loginForm = $("#login-form");
  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    const message = $("[data-login-message]");
    if (!loginForm.reportValidity()) return;
    const values = formObject(loginForm);
    try {
      setBusy(loginForm, true);
      await client.login(values.access_code);
      await showAdminPanel();
    } catch (error) {
      setMessage(message, error.status === 400 ? "La clave de acceso es incorrecta." : friendlyError(error));
    } finally {
      setBusy(loginForm, false);
    }
  });

  $("#logout-button").addEventListener("click", () => {
    client.logout();
    $("#admin-panel").hidden = true;
    $("#login-panel").hidden = false;
    $("#logout-button").hidden = true;
  });

  $("#course-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = $("[data-course-message]");
    if (!form.reportValidity()) return;
    const values = formObject(form);
    const options = values.objective_options.split("\n").map(value => value.trim()).filter(Boolean);
    if (options.length < 2) return setMessage(message, "Ingresá al menos dos opciones para la pregunta objetiva.");
    if (!options.includes(values.correct_answer.trim())) return setMessage(message, "La respuesta correcta debe coincidir exactamente con una de las opciones.");
    if (values.end_date < values.start_date) return setMessage(message, "La fecha final no puede ser anterior a la fecha de inicio.");
    try {
      setBusy(form, true);
      adminCourse = await client.saveCourse({
        id: values.id || undefined,
        name: values.name.trim(),
        instructor: values.instructor.trim(),
        hours: Number(values.hours),
        modality: values.modality,
        start_date: values.start_date,
        end_date: values.end_date,
        objective_question: values.objective_question.trim(),
        objective_options: options,
        correct_answer: values.correct_answer.trim()
      });
      await refreshAdmin();
      setMessage(message, "Configuración guardada.", "success");
    } catch (error) {
      setMessage(message, friendlyError(error));
    } finally {
      setBusy(form, false);
    }
  });

  $("#refresh-button").addEventListener("click", async () => {
    const button = $("#refresh-button");
    button.disabled = true;
    try { await refreshAdmin(); } finally { button.disabled = false; }
  });
  $("#download-data-button").addEventListener("click", exportCsv);
  $("#view-report-button").addEventListener("click", () => {
    try { showReport(); } catch (error) { setMessage($("[data-course-message]"), friendlyError(error)); }
  });
  $("#download-report-button").addEventListener("click", () => {
    try { downloadReport(); } catch (error) { setMessage($("[data-course-message]"), friendlyError(error)); }
  });
  $$(`[data-close-dialog]`).forEach(button => button.addEventListener("click", () => $("#report-dialog").close()));
  $("[data-print-report]").addEventListener("click", printReport);

  $("#toggle-course-button").addEventListener("click", async () => {
    if (!adminCourse) return;
    const closing = adminCourse.status === "open";
    const confirmed = await confirmAction({
      title: closing ? "Cerrar participación" : "Reabrir participación",
      text: closing ? "No se recibirán nuevas respuestas hasta que vuelvas a abrir el curso." : "Los tickets volverán a aceptar respuestas.",
      dangerLabel: closing ? "Cerrar curso" : "Reabrir curso"
    });
    if (!confirmed) return;
    try {
      adminCourse = await client.updateCourseStatus(adminCourse.id, closing ? "closed" : "open");
      updateAdminSummary();
    } catch (error) {
      setMessage($("[data-course-message]"), friendlyError(error));
    }
  });

  $("#reset-course-button").addEventListener("click", async () => {
    if (!adminCourse) return;
    const count = adminResponses.entrances.length + adminResponses.exits.length;
    const confirmed = await confirmAction({
      title: "Reiniciar respuestas",
      text: `Se eliminarán ${count} respuestas del curso. Descargá un respaldo antes si necesitás conservarlas. Esta acción no se puede deshacer.`,
      requireWord: true,
      dangerLabel: "Eliminar respuestas"
    });
    if (!confirmed) return;
    try {
      await client.resetResponses(adminCourse.id);
      await refreshAdmin();
      setMessage($("[data-course-message]"), "Las respuestas fueron eliminadas. La configuración se conservó.", "success");
    } catch (error) {
      setMessage($("[data-course-message]"), friendlyError(error));
    }
  });
}

async function initAdmin() {
  bindAdminActions();
  const session = await client.hasSession();
  if (session) {
    await showAdminPanel();
  } else {
    $("#login-panel").hidden = false;
  }
}

if (page === "entrance") initTicket("entrance");
if (page === "exit") initTicket("exit");
if (page === "admin") initAdmin();
