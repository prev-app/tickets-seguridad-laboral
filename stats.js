const numeric = values => values
  .map(Number)
  .filter(value => Number.isFinite(value));

export function sum(values) {
  return numeric(values).reduce((total, value) => total + value, 0);
}

export function mean(values) {
  const clean = numeric(values);
  return clean.length ? sum(clean) / clean.length : null;
}

export function median(values) {
  const clean = numeric(values).sort((a, b) => a - b);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

export function standardDeviation(values) {
  const clean = numeric(values);
  if (!clean.length) return null;
  const average = mean(clean);
  return Math.sqrt(clean.reduce((total, value) => total + ((value - average) ** 2), 0) / clean.length);
}

export function percentile(values, probability) {
  const clean = numeric(values).sort((a, b) => a - b);
  if (!clean.length) return null;
  if (clean.length === 1) return clean[0];
  const index = (clean.length - 1) * probability;
  const lower = Math.floor(index);
  const fraction = index - lower;
  return clean[lower + 1] === undefined
    ? clean[lower]
    : clean[lower] + fraction * (clean[lower + 1] - clean[lower]);
}

export function describe(values) {
  const clean = numeric(values);
  if (!clean.length) {
    return { n: 0, mean: null, median: null, min: null, max: null, sd: null, range: null };
  }
  const minimum = Math.min(...clean);
  const maximum = Math.max(...clean);
  return {
    n: clean.length,
    mean: mean(clean),
    median: median(clean),
    min: minimum,
    max: maximum,
    sd: standardDeviation(clean),
    range: maximum - minimum
  };
}

export function findOutliers(values) {
  const clean = numeric(values);
  if (clean.length < 4) return { values: [], q1: null, q3: null, iqr: null, lower: null, upper: null };
  const q1 = percentile(clean, 0.25);
  const q3 = percentile(clean, 0.75);
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  return { values: clean.filter(value => value < lower || value > upper), q1, q3, iqr, lower, upper };
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

export const EXPECTATION_FULFILLMENT = ["Totalmente", "Parcialmente", "No cumplió"];

export const EXPECTATION_RULES = [
  {
    key: "capacities",
    label: "Mejorar capacidades",
    groups: [
      ["mejorar", "fortalecer", "desarrollar", "ampliar", "potenciar"],
      ["capacidad", "capacidades", "habilidad", "habilidades", "competencia", "competencias", "conocimiento", "conocimientos"]
    ],
    description: "mejorar/fortalecer/desarrollar + capacidades, habilidades, competencias o conocimientos"
  },
  {
    key: "objectives",
    label: "Lograr objetivos",
    groups: [
      ["lograr", "alcanzar", "cumplir", "conseguir"],
      ["objetivo", "objetivos", "meta", "metas", "resultado", "resultados"]
    ],
    description: "lograr/alcanzar/cumplir + objetivos, metas o resultados"
  },
  {
    key: "risk_prevention",
    label: "Prevenir riesgos",
    groups: [
      ["prevenir", "evitar", "reducir", "minimizar", "controlar"],
      ["riesgo", "riesgos", "accidente", "accidentes", "incidente", "incidentes"]
    ],
    description: "prevenir/evitar/reducir + riesgos, accidentes o incidentes"
  },
  {
    key: "practical_tools",
    label: "Obtener herramientas prácticas",
    groups: [
      ["obtener", "aplicar", "implementar", "incorporar", "usar", "adquirir"],
      ["herramienta", "herramientas", "procedimiento", "procedimientos", "practica", "practicas", "trabajo"]
    ],
    description: "obtener/aplicar/implementar + herramientas, procedimientos o prácticas"
  },
  {
    key: "regulations",
    label: "Conocer la normativa",
    groups: [
      ["conocer", "comprender", "entender", "actualizar", "aprender"],
      ["normativa", "normativas", "ley", "leyes", "reglamento", "reglamentos", "requisito", "requisitos"]
    ],
    description: "conocer/comprender/actualizar + normativa, leyes, reglamentos o requisitos"
  },
  {
    key: "safety_culture",
    label: "Promover cultura de seguridad",
    groups: [
      ["concientizar", "sensibilizar", "promover", "fortalecer"],
      ["seguridad", "cultura", "prevencion"]
    ],
    description: "concientizar/sensibilizar/promover + seguridad, cultura o prevención"
  },
  {
    key: "refresh_questions",
    label: "Actualizarse y resolver dudas",
    groups: [
      ["actualizar", "refrescar", "repasar", "aclarar", "resolver"],
      ["conocimiento", "conocimientos", "concepto", "conceptos", "duda", "dudas", "tema", "temas"]
    ],
    description: "actualizar/refrescar/aclarar + conocimientos, conceptos o dudas"
  },
  {
    key: "other",
    label: "Otras expectativas",
    groups: [],
    description: "respuestas que no reúnen ninguna combinación anterior"
  }
];

export function normalizeExpectationText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasKeyword(text, keyword) {
  return ` ${text} `.includes(` ${keyword} `);
}

export function classifyExpectation(value) {
  const text = normalizeExpectationText(value);
  const fallback = EXPECTATION_RULES.at(-1);
  if (!text) return { ...fallback, matched: false };
  const match = EXPECTATION_RULES.slice(0, -1).find(rule =>
    rule.groups.every(group => group.some(keyword => hasKeyword(text, keyword)))
  );
  return { ...(match || fallback), matched: Boolean(match) };
}

function orderedDistribution(values, order) {
  const valid = values.filter(value => order.includes(value));
  return order.map(label => {
    const count = valid.filter(value => value === label).length;
    return { label, count, share: valid.length ? (count / valid.length) * 100 : 0 };
  });
}

export function analyzeExpectations(entrances, exits) {
  const classified = entrances
    .filter(item => String(item.expectation_text || "").trim())
    .map(item => ({ item, category: classifyExpectation(item.expectation_text) }));
  const categoryCounts = new Map(EXPECTATION_RULES.map(rule => [rule.key, 0]));
  classified.forEach(({ category }) => categoryCounts.set(category.key, categoryCounts.get(category.key) + 1));
  const categories = EXPECTATION_RULES.map(rule => ({
    key: rule.key,
    label: rule.label,
    description: rule.description,
    count: categoryCounts.get(rule.key),
    share: classified.length ? (categoryCounts.get(rule.key) / classified.length) * 100 : 0
  }));

  const pairs = pairResponses(entrances, exits);
  const crossTab = categories.map(category => {
    const entranceCount = category.count;
    const categoryPairs = pairs.filter(pair =>
      String(pair.entrance.expectation_text || "").trim() &&
      classifyExpectation(pair.entrance.expectation_text).key === category.key &&
      EXPECTATION_FULFILLMENT.includes(pair.exit.expectation_fulfillment)
    );
    const counts = Object.fromEntries(EXPECTATION_FULFILLMENT.map(label => [label, 0]));
    categoryPairs.forEach(pair => { counts[pair.exit.expectation_fulfillment] += 1; });
    return {
      ...category,
      entranceCount,
      pairedCount: categoryPairs.length,
      withoutExit: Math.max(entranceCount - categoryPairs.length, 0),
      counts
    };
  });

  return {
    answered: classified.length,
    coverage: entrances.length ? (classified.length / entrances.length) * 100 : 0,
    categories,
    fulfillment: orderedDistribution(exits.map(item => item.expectation_fulfillment), EXPECTATION_FULFILLMENT),
    crossTab,
    pairedAnswered: crossTab.reduce((total, row) => total + row.pairedCount, 0)
  };
}

export function pairResponses(entrances, exits) {
  const exitsByEmail = new Map(exits.map(item => [normalizeEmail(item.email), item]));
  return entrances
    .map(entrance => ({ entrance, exit: exitsByEmail.get(normalizeEmail(entrance.email)) }))
    .filter(pair => pair.exit);
}

export function pairedMetric(entrances, exits, key) {
  const pairs = pairResponses(entrances, exits)
    .map(pair => ({
      entrance: pair.entrance[key] === null || pair.entrance[key] === undefined || pair.entrance[key] === "" ? null : Number(pair.entrance[key]),
      exit: pair.exit[key] === null || pair.exit[key] === undefined || pair.exit[key] === "" ? null : Number(pair.exit[key])
    }))
    .filter(pair => pair.entrance !== null && pair.exit !== null && Number.isFinite(pair.entrance) && Number.isFinite(pair.exit));
  const deltas = pairs.map(pair => pair.exit - pair.entrance);
  const outlierInfo = findOutliers(deltas);
  const outlierSet = new Set(outlierInfo.values);
  const withoutOutliers = deltas.filter(value => !outlierSet.has(value));
  return {
    entrance: describe(pairs.map(pair => pair.entrance)),
    exit: describe(pairs.map(pair => pair.exit)),
    change: describe(deltas),
    improved: deltas.filter(value => value > 0).length,
    unchanged: deltas.filter(value => value === 0).length,
    worsened: deltas.filter(value => value < 0).length,
    outliers: outlierInfo.values,
    outlierShare: deltas.length ? (outlierInfo.values.length / deltas.length) * 100 : 0,
    meanWithoutOutliers: withoutOutliers.length ? mean(withoutOutliers) : null,
    pairs: pairs.length
  };
}

export function distribution(values) {
  const counts = new Map();
  values
    .filter(value => value !== null && value !== undefined && String(value).trim() !== "")
    .forEach(value => counts.set(String(value), (counts.get(String(value)) || 0) + 1));
  const total = [...counts.values()].reduce((acc, value) => acc + value, 0);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, share: total ? (count / total) * 100 : 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
}

export function ageRanges(ages) {
  const ranges = [
    { label: "Menos de 25", min: -Infinity, max: 24 },
    { label: "25–34", min: 25, max: 34 },
    { label: "35–44", min: 35, max: 44 },
    { label: "45–54", min: 45, max: 54 },
    { label: "55 o más", min: 55, max: Infinity }
  ];
  const clean = numeric(ages);
  return ranges.map(range => {
    const count = clean.filter(age => age >= range.min && age <= range.max).length;
    return { label: range.label, count, share: clean.length ? (count / clean.length) * 100 : 0 };
  });
}

export function objectiveResult(items, correctAnswer) {
  const valid = items.filter(item => String(item.objective_answer || "").trim());
  const correct = valid.filter(item => String(item.objective_answer).trim() === String(correctAnswer || "").trim()).length;
  return { n: valid.length, correct, share: valid.length ? (correct / valid.length) * 100 : 0 };
}

export function getTechnicalQuestions(course = {}) {
  const configured = Array.isArray(course.technical_questions)
    ? course.technical_questions.slice(0, 3).filter(item => item && String(item.question || "").trim())
    : [];
  if (configured.length) {
    return configured.map((item, index) => ({
      id: String(item.id || `q${index + 1}`),
      question: String(item.question || "").trim(),
      options: Array.isArray(item.options) ? item.options.map(String) : [],
      correct_answer: String(item.correct_answer || "").trim()
    }));
  }
  if (course.objective_question || course.correct_answer || Array.isArray(course.objective_options)) {
    return [{
      id: "q1",
      question: String(course.objective_question || "Pregunta objetiva").trim(),
      options: Array.isArray(course.objective_options) ? course.objective_options.map(String) : [],
      correct_answer: String(course.correct_answer || "").trim()
    }];
  }
  return [];
}

export function technicalAnswer(item, question, index = 0) {
  const answers = item?.technical_answers;
  const answer = answers && typeof answers === "object" && !Array.isArray(answers)
    ? answers[question.id]
    : undefined;
  if (String(answer || "").trim()) return String(answer).trim();
  return index === 0 ? String(item?.objective_answer || "").trim() : "";
}

export function technicalQuestionResults(course, entrances, exits) {
  return getTechnicalQuestions(course).map((question, index) => {
    const entranceItems = entrances.map(item => ({ objective_answer: technicalAnswer(item, question, index) }));
    const exitItems = exits.map(item => ({ objective_answer: technicalAnswer(item, question, index) }));
    const entrance = objectiveResult(entranceItems, question.correct_answer);
    const exit = objectiveResult(exitItems, question.correct_answer);
    return { ...question, entrance, exit, change: exit.share - entrance.share };
  });
}

export function buildReportData(course, entrances, exits) {
  const audience = ["workers", "inspectors", "internal"].includes(course?.audience_type) ? course.audience_type : "workers";
  const paired = pairResponses(entrances, exits);
  const risk = pairedMetric(entrances, exits, "risk_identification");
  const action = pairedMetric(entrances, exits, "unsafe_action");
  const technicalQuestions = technicalQuestionResults(course, entrances, exits);
  const objectiveEntrance = technicalQuestions[0]?.entrance || objectiveResult([], "");
  const objectiveExit = technicalQuestions[0]?.exit || objectiveResult([], "");
  return {
    course,
    entrances,
    exits,
    paired,
    completionRate: entrances.length ? (paired.length / entrances.length) * 100 : 0,
    audience,
    risk,
    action,
    age: describe(entrances.map(item => item.age)),
    ageRanges: ageRanges(entrances.map(item => item.age)),
    education: distribution(entrances.map(item => item.education_level)),
    employment: distribution(entrances.map(item => item.employed === true || item.employed === "true" ? "Trabaja" : "No trabaja")),
    sectors: distribution(entrances.filter(item => item.employed === true || item.employed === "true").map(item => item.sector || "Sin especificar")),
    usefulness: describe(exits.map(item => item.course_usefulness)),
    objectiveEntrance,
    objectiveExit,
    objectiveChange: objectiveExit.share - objectiveEntrance.share,
    technicalQuestions,
    expectations: analyzeExpectations(entrances, exits),
    inspectorTenure: distribution(entrances.map(item => item.inspector_tenure)),
    adu: {
      comfort: pairedMetric(entrances, exits, "adu_comfort"),
      checklistClarity: pairedMetric(entrances, exits, "adu_checklist_clarity"),
      writingConfidence: pairedMetric(entrances, exits, "adu_writing_confidence"),
      difficulties: distribution(entrances.map(item => item.adu_main_difficulty)),
      improvementNeeds: exits.map(item => String(item.adu_improvement_needed || "").trim()).filter(Boolean)
    }
  };
}
