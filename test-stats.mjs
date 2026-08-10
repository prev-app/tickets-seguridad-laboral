import assert from "node:assert/strict";
import { describe, findOutliers, pairResponses, pairedMetric, buildReportData, classifyExpectation } from "./stats.js";

assert.deepEqual(describe([1, 2, 3, 4, 5]), { n: 5, mean: 3, median: 3, min: 1, max: 5, sd: Math.sqrt(2), range: 4 });
assert.deepEqual(findOutliers([0, 0, 0, 0, 0, 5]).values, [5]);

const entrances = [
  { email: "A@MAIL.COM", risk_identification: 2, unsafe_action: 2, objective_answer: "B", age: 30, education_level: "Secundario", employed: true, sector: "Industria", expectation_text: "Mejorar mis capacidades para identificar riesgos" },
  { email: "b@mail.com", risk_identification: 4, unsafe_action: 3, objective_answer: "A", age: 40, education_level: "Universitario", employed: false, expectation_text: "Obtener herramientas prácticas para mi trabajo" }
];
const exits = [
  { email: "a@mail.com", risk_identification: 5, unsafe_action: 4, objective_answer: "A", course_usefulness: 5, expectation_fulfillment: "Totalmente" },
  { email: "B@mail.com", risk_identification: 4, unsafe_action: 2, objective_answer: "A", course_usefulness: 4, expectation_fulfillment: "Parcialmente" }
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

assert.equal(classifyExpectation("Mejorar capacidades y conocimientos").key, "capacities");
assert.equal(classifyExpectation("Lograr los objetivos previstos").key, "objectives");
assert.equal(classifyExpectation("Evitar accidentes y reducir riesgos").key, "risk_prevention");
assert.equal(classifyExpectation("Obtener más herramientas prácticas").key, "practical_tools");
assert.equal(classifyExpectation("Comprender la normativa y sus requisitos").key, "regulations");
assert.equal(classifyExpectation("Promover una cultura de seguridad").key, "safety_culture");
assert.equal(classifyExpectation("Refrescar conceptos y aclarar dudas").key, "refresh_questions");
assert.equal(classifyExpectation("Compartir experiencias con colegas").key, "other");

console.log("Pruebas estadísticas correctas");
