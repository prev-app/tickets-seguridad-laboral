import assert from "node:assert/strict";
import { analyzeAduImprovements, describe, findOutliers, pairResponses, pairedMetric, buildReportData, classifyAduImprovement, classifyExpectation, getTechnicalQuestions, technicalAnswer } from "./stats.js";
import { buildCsvData } from "./exports.js";

assert.deepEqual(describe([1, 2, 3, 4, 5]), { n: 5, mean: 3, median: 3, min: 1, max: 5, sd: Math.sqrt(2), range: 4 });
assert.deepEqual(findOutliers([0, 0, 0, 0, 0, 5]).values, [5]);

const entrances = [
  { email: "A@MAIL.COM", risk_identification: 2, unsafe_action: 2, objective_answer: "B", technical_answers: { q1: "B", q2: "No" }, age: 30, education_level: "Secundario", employed: true, sector: "Industria", expectation_text: "Mejorar mis capacidades para identificar riesgos" },
  { email: "b@mail.com", risk_identification: 4, unsafe_action: 3, objective_answer: "A", technical_answers: { q1: "A", q2: "Sí" }, age: 40, education_level: "Universitario", employed: false, expectation_text: "Obtener herramientas prácticas para mi trabajo" }
];
const exits = [
  { email: "a@mail.com", risk_identification: 5, unsafe_action: 4, objective_answer: "A", technical_answers: { q1: "A", q2: "Sí" }, course_usefulness: 5, expectation_fulfillment: "Totalmente" },
  { email: "B@mail.com", risk_identification: 4, unsafe_action: 2, objective_answer: "A", technical_answers: { q1: "A", q2: "Sí" }, course_usefulness: 4, expectation_fulfillment: "Parcialmente" }
];

assert.equal(pairResponses(entrances, exits).length, 2);
const metric = pairedMetric(entrances, exits, "risk_identification");
assert.equal(metric.improved, 1);
assert.equal(metric.unchanged, 1);
assert.equal(metric.worsened, 0);
assert.equal(metric.change.mean, 1.5);

const report = buildReportData({ correct_answer: "A" }, entrances, exits);
assert.equal(report.paired.length, 2);
assert.equal(report.objectiveEntrance.share, 50);
assert.equal(report.objectiveExit.share, 100);
assert.equal(report.completionRate, 100);
assert.equal(report.expectations.answered, 2);
assert.equal(report.expectations.pairedAnswered, 2);
assert.equal(report.expectations.crossTab.find(row => row.key === "capacities").counts.Totalmente, 1);
assert.equal(report.expectations.crossTab.find(row => row.key === "practical_tools").counts.Parcialmente, 1);

const technicalCourse = {
  technical_questions: [
    { id: "q1", question: "Pregunta uno", options: ["A", "B"], correct_answer: "A" },
    { id: "q2", question: "Pregunta dos", options: ["Sí", "No"], correct_answer: "Sí" }
  ]
};
const technicalReport = buildReportData(technicalCourse, entrances, exits);
assert.equal(getTechnicalQuestions(technicalCourse).length, 2);
assert.equal(technicalAnswer(entrances[0], technicalCourse.technical_questions[1], 1), "No");
assert.equal(technicalReport.technicalQuestions[0].entrance.share, 50);
assert.equal(technicalReport.technicalQuestions[1].entrance.share, 50);
assert.equal(technicalReport.technicalQuestions[1].exit.share, 100);
assert.equal(technicalReport.technicalQuestions[1].change, 50);

const inspectorEntrances = [
  { email: "inspector1@srt.gob.ar", age: 34, education_level: "Universitario", inspector_tenure: "1 a 3 años", adu_comfort: 2, adu_checklist_clarity: 2, adu_writing_confidence: 3, adu_main_difficulty: "Selección de checklists", technical_answers: { adu_q1: "Completar ambos" } },
  { email: "inspector2@srt.gob.ar", age: 46, education_level: "Terciario / técnico", inspector_tenure: "8 años o más", adu_comfort: 4, adu_checklist_clarity: 3, adu_writing_confidence: 3, adu_main_difficulty: "Uso de la plataforma/tablet", technical_answers: { adu_q1: "No desplegar ninguno" } }
];
const inspectorExits = [
  { email: "inspector1@srt.gob.ar", adu_comfort: 4, adu_checklist_clarity: 5, adu_writing_confidence: 4, adu_improvement_needed: "Mejorar el rendimiento de la tablet", technical_answers: { adu_q1: "No desplegar ninguno" }, course_usefulness: 5 },
  { email: "inspector2@srt.gob.ar", adu_comfort: 5, adu_checklist_clarity: 5, adu_writing_confidence: 4, technical_answers: { adu_q1: "No desplegar ninguno" }, course_usefulness: 5 }
];
const inspectorCourse = {
  audience_type: "inspectors",
  technical_questions: [{ id: "adu_q1", question: "Inspección fallida", options: ["Completar ambos", "No desplegar ninguno"], correct_answer: "No desplegar ninguno" }]
};
const inspectorReport = buildReportData(inspectorCourse, inspectorEntrances, inspectorExits);
assert.equal(inspectorReport.audience, "inspectors");
assert.equal(inspectorReport.adu.comfort.change.mean, 1.5);
assert.equal(inspectorReport.adu.checklistClarity.improved, 2);
assert.equal(inspectorReport.adu.difficulties.length, 2);
assert.equal(inspectorReport.adu.improvementNeeds.length, 1);
assert.equal(inspectorReport.adu.improvementAnalysis.total, 2);
assert.equal(inspectorReport.adu.improvementAnalysis.answered, 1);
assert.equal(inspectorReport.adu.improvementAnalysis.categories.find(row => row.key === "platform").count, 1);
assert.equal(inspectorReport.adu.improvementAnalysis.categories.find(row => row.key === "no_response").count, 1);
assert.equal(inspectorReport.inspectorTenure.length, 2);
assert.equal(inspectorReport.risk.pairs, 0);
assert.equal(inspectorReport.technicalQuestions[0].entrance.share, 50);
assert.equal(inspectorReport.technicalQuestions[0].exit.share, 100);

const inspectorCsv = buildCsvData(inspectorCourse, { entrances: inspectorEntrances, exits: inspectorExits });
assert.ok(inspectorCsv.headers.includes("principal_dificultad_adu"));
assert.ok(inspectorCsv.headers.includes("aspecto_adu_a_mejorar"));
assert.ok(!inspectorCsv.headers.includes("trabaja"));
assert.ok(inspectorCsv.rows.every(row => row.length === inspectorCsv.headers.length));

const workerCsv = buildCsvData(technicalCourse, { entrances, exits });
assert.ok(workerCsv.headers.includes("trabaja"));
assert.ok(workerCsv.headers.includes("sector"));
assert.ok(workerCsv.rows.every(row => row.length === workerCsv.headers.length));

const internalCsv = buildCsvData({ ...technicalCourse, audience_type: "internal" }, { entrances, exits });
assert.ok(!internalCsv.headers.includes("trabaja"));
assert.ok(!internalCsv.headers.includes("sector"));
assert.ok(internalCsv.headers.includes("identifica_riesgos_entrada"));
assert.ok(internalCsv.rows.every(row => row.length === internalCsv.headers.length));

assert.equal(classifyExpectation("Mejorar capacidades y conocimientos").key, "capacities");
assert.equal(classifyExpectation("Lograr los objetivos previstos").key, "objectives");
assert.equal(classifyExpectation("Evitar accidentes y reducir riesgos").key, "risk_prevention");
assert.equal(classifyExpectation("Obtener más herramientas prácticas").key, "practical_tools");
assert.equal(classifyExpectation("Comprender la normativa y sus requisitos").key, "regulations");
assert.equal(classifyExpectation("Promover una cultura de seguridad").key, "safety_culture");
assert.equal(classifyExpectation("Refrescar conceptos y aclarar dudas").key, "refresh_questions");
assert.equal(classifyExpectation("Compartir experiencias con colegas").key, "other");

assert.equal(classifyAduImprovement("No logré comprender cómo elegir el checklist").key, "understanding_gap");
assert.equal(classifyAduImprovement("Entendí todo y no tengo nada pendiente").key, "understood");
assert.equal(classifyAduImprovement("Quiero practicar la selección de checklists").key, "checklists");
assert.equal(classifyAduImprovement("Necesito mejorar la redacción de incumplimientos").key, "writing");
assert.equal(classifyAduImprovement("Ganar velocidad con la tablet ADU").key, "platform");
assert.equal(classifyAduImprovement("Repasar el procedimiento completo").key, "general_review");
assert.equal(classifyAduImprovement("").key, "no_response");

const improvementAnalysis = analyzeAduImprovements([
  { adu_improvement_needed: "No entendí el procedimiento" },
  { adu_improvement_needed: "Practicar checklists" },
  { adu_improvement_needed: "Todo claro" },
  { adu_improvement_needed: null }
]);
assert.equal(improvementAnalysis.total, 4);
assert.equal(improvementAnalysis.answered, 3);
assert.equal(improvementAnalysis.categories.reduce((total, row) => total + row.count, 0), 4);
assert.equal(improvementAnalysis.categories.find(row => row.key === "understanding_gap").count, 1);

console.log("Pruebas estadísticas correctas");
