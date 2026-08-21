import { classifyExpectation, getTechnicalQuestions, normalizeEmail, technicalAnswer } from "./stats.js?v=20260821-2";

const LABELS = {
  workers: "Trabajadores",
  inspectors: "Inspectores",
  internal: "Capacitación interna"
};

function audienceType(course = {}) {
  return LABELS[course.audience_type] ? course.audience_type : "workers";
}

function dateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function buildCsvData(course, responses) {
  const exits = new Map(responses.exits.map(row => [normalizeEmail(row.email), row]));
  const questions = getTechnicalQuestions(course);
  const type = audienceType(course);
  const typeLabel = LABELS[type];
  const technicalHeaders = questions.flatMap((_, index) => [
    `pregunta_tecnica_${index + 1}`,
    `respuesta_pregunta_${index + 1}_entrada`,
    `respuesta_pregunta_${index + 1}_salida`
  ]);
  const commonHeaders = ["tipo_publico", "email", "fecha_entrada", "fecha_salida", "edad", "nivel_academico"];
  const headers = type === "inspectors" ? [
    ...commonHeaders, "antiguedad_inspectiva",
    "comodidad_adu_entrada", "comodidad_adu_salida",
    "claridad_campos_checklists_entrada", "claridad_campos_checklists_salida",
    "seguridad_redaccion_entrada", "seguridad_redaccion_salida",
    "principal_dificultad_adu", ...technicalHeaders,
    "aspecto_adu_a_mejorar", "utilidad_curso"
  ] : [
    ...commonHeaders, ...(type === "workers" ? ["trabaja", "sector"] : []),
    "identifica_riesgos_entrada", "identifica_riesgos_salida", "actua_entrada", "actua_salida",
    ...technicalHeaders, "expectativa_inicial", "categoria_expectativa",
    "cumplimiento_expectativa", "riesgo_principal", "medida_preventiva", "utilidad_curso"
  ];
  const rows = responses.entrances.map(entrance => {
    const exit = exits.get(normalizeEmail(entrance.email)) || {};
    const technicalCells = questions.flatMap((question, index) => [
      question.question,
      technicalAnswer(entrance, question, index),
      technicalAnswer(exit, question, index)
    ]);
    const common = [typeLabel, entrance.email, dateTime(entrance.responded_at), dateTime(exit.responded_at), entrance.age, entrance.education_level];
    if (type === "inspectors") {
      return [
        ...common, entrance.inspector_tenure,
        entrance.adu_comfort, exit.adu_comfort,
        entrance.adu_checklist_clarity, exit.adu_checklist_clarity,
        entrance.adu_writing_confidence, exit.adu_writing_confidence,
        entrance.adu_main_difficulty, ...technicalCells,
        exit.adu_improvement_needed, exit.course_usefulness
      ];
    }
    return [
      ...common, ...(type === "workers" ? [entrance.employed ? "Sí" : "No", entrance.sector] : []),
      entrance.risk_identification, exit.risk_identification,
      entrance.unsafe_action, exit.unsafe_action, ...technicalCells,
      entrance.expectation_text, classifyExpectation(entrance.expectation_text).label, exit.expectation_fulfillment,
      entrance.main_risk, exit.preventive_measure, exit.course_usefulness
    ];
  });
  const entranceEmails = new Set(responses.entrances.map(entrance => normalizeEmail(entrance.email)));
  responses.exits.filter(exit => !entranceEmails.has(normalizeEmail(exit.email))).forEach(exit => {
    const technicalCells = questions.flatMap((question, index) => [question.question, "", technicalAnswer(exit, question, index)]);
    if (type === "inspectors") {
      rows.push([
        typeLabel, exit.email, "", dateTime(exit.responded_at), "", "", "",
        "", exit.adu_comfort, "", exit.adu_checklist_clarity, "", exit.adu_writing_confidence,
        "", ...technicalCells, exit.adu_improvement_needed, exit.course_usefulness
      ]);
    } else {
      rows.push([
        typeLabel, exit.email, "", dateTime(exit.responded_at), "", "", ...(type === "workers" ? ["", ""] : []),
        "", exit.risk_identification, "", exit.unsafe_action,
        ...technicalCells, "", "", exit.expectation_fulfillment, "", exit.preventive_measure, exit.course_usefulness
      ]);
    }
  });
  return { headers, rows };
}
