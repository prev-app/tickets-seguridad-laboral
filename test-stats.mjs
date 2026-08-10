import assert from "node:assert/strict";
import { describe, findOutliers, pairResponses, pairedMetric, buildReportData } from "./stats.js";

assert.deepEqual(describe([1, 2, 3, 4, 5]), { n: 5, mean: 3, median: 3, min: 1, max: 5, sd: Math.sqrt(2), range: 4 });
assert.deepEqual(findOutliers([0, 0, 0, 0, 0, 5]).values, [5]);

const entrances = [
  { email: "A@MAIL.COM", risk_identification: 2, unsafe_action: 2, objective_answer: "B", age: 30, education_level: "Secundario", employed: true, sector: "Industria" },
  { email: "b@mail.com", risk_identification: 4, unsafe_action: 3, objective_answer: "A", age: 40, education_level: "Universitario", employed: false }
];
const exits = [
  { email: "a@mail.com", risk_identification: 5, unsafe_action: 4, objective_answer: "A", course_usefulness: 5 },
  { email: "B@mail.com", risk_identification: 4, unsafe_action: 2, objective_answer: "A", course_usefulness: 4 }
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

console.log("Pruebas estadísticas correctas");
