import { CONFIG } from "./config.js?v=20260821-2";
import { normalizeEmail } from "./stats.js?v=20260821-2";

const DEFAULT_COURSE = {
  id: "demo-course-1",
  name: "Seguridad laboral básica",
  instructor: "Profesor/a a confirmar",
  hours: 8,
  modality: "Presencial",
  audience_type: "workers",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: new Date().toISOString().slice(0, 10),
  status: "open",
  is_active: true,
  objective_question: "Si detectás una condición que puede provocar un accidente, ¿qué deberías hacer primero?",
  objective_options: [
    "Detener la tarea y comunicar la situación",
    "Continuar con cuidado para no demorar",
    "Esperar a que otra persona la resuelva",
    "Ignorarla si todavía no ocurrió un accidente"
  ],
  correct_answer: "Detener la tarea y comunicar la situación",
  technical_questions: [{
    id: "q1",
    question: "Si detectás una condición que puede provocar un accidente, ¿qué deberías hacer primero?",
    options: [
      "Detener la tarea y comunicar la situación",
      "Continuar con cuidado para no demorar",
      "Esperar a que otra persona la resuelva",
      "Ignorarla si todavía no ocurrió un accidente"
    ],
    correct_answer: "Detener la tarea y comunicar la situación"
  }]
};

function configured() {
  return Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
}

function storageKey(name) {
  return `${CONFIG.storagePrefix}:${name}`;
}

function readLocal(name, fallback) {
  try {
    const raw = localStorage.getItem(storageKey(name));
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(name, value) {
  localStorage.setItem(storageKey(name), JSON.stringify(value));
  return value;
}

function localId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function apiError(payload, status) {
  const message = payload?.message || payload?.msg || payload?.error_description || payload?.error || `Error ${status}`;
  const error = new Error(message);
  error.status = status;
  error.code = payload?.code;
  return error;
}

export class DataClient {
  constructor() {
    this.remote = configured();
    this.token = sessionStorage.getItem(storageKey("admin-token")) || "";
  }

  get isDemo() { return !this.remote; }

  headers(admin = false, prefer = "") {
    const headers = {
      apikey: CONFIG.supabaseAnonKey,
      Authorization: `Bearer ${admin && this.token ? this.token : CONFIG.supabaseAnonKey}`,
      "Content-Type": "application/json"
    };
    if (prefer) headers.Prefer = prefer;
    return headers;
  }

  async request(path, options = {}, admin = false) {
    const response = await fetch(`${CONFIG.supabaseUrl}${path}`, {
      ...options,
      headers: { ...this.headers(admin, options.prefer), ...(options.headers || {}) }
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) throw apiError(payload, response.status);
    return payload;
  }

  async getActiveCourse(admin = false) {
    if (!this.remote) return readLocal("course", DEFAULT_COURSE);
    if (!admin) {
      const rows = await this.request("/rest/v1/rpc/get_active_course_with_questions", { method: "POST", body: "{}" });
      return rows[0] || null;
    }
    const rows = await this.request("/rest/v1/courses?is_active=eq.true&select=*&order=created_at.desc&limit=1", {}, admin);
    return rows[0] || null;
  }

  async submitEntrance(values) {
    const row = { ...values, email: normalizeEmail(values.email), responded_at: new Date().toISOString() };
    if (!this.remote) {
      const rows = readLocal("entrances", []);
      if (rows.some(item => item.course_id === row.course_id && normalizeEmail(item.email) === row.email)) {
        throw new Error("Ya existe un ticket de entrada para este correo.");
      }
      rows.push({ ...row, id: localId() });
      writeLocal("entrances", rows);
      return row;
    }
    return this.request("/rest/v1/entrance_responses", { method: "POST", body: JSON.stringify(row), prefer: "return=minimal" });
  }

  async submitExit(values) {
    const row = { ...values, email: normalizeEmail(values.email), responded_at: new Date().toISOString() };
    if (!this.remote) {
      const entrances = readLocal("entrances", []);
      if (!entrances.some(item => item.course_id === row.course_id && normalizeEmail(item.email) === row.email)) {
        const error = new Error("No encontramos un ticket de entrada con ese correo para este curso.");
        error.code = "NO_ENTRANCE";
        throw error;
      }
      const rows = readLocal("exits", []);
      if (rows.some(item => item.course_id === row.course_id && normalizeEmail(item.email) === row.email)) {
        throw new Error("Ya existe un ticket de salida para este correo.");
      }
      rows.push({ ...row, id: localId() });
      writeLocal("exits", rows);
      return row;
    }
    return this.request("/rest/v1/exit_responses", { method: "POST", body: JSON.stringify(row), prefer: "return=minimal" });
  }

  async login(accessCode) {
    if (!this.remote) return { user: { email: "demo@local" } };
    if (!CONFIG.adminEmail) throw new Error("El acceso administrador todavía no está configurado.");
    const response = await fetch(`${CONFIG.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: CONFIG.supabaseAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: CONFIG.adminEmail, password: accessCode })
    });
    const payload = await response.json();
    if (!response.ok) throw apiError(payload, response.status);
    this.token = payload.access_token;
    sessionStorage.setItem(storageKey("admin-token"), this.token);
    const profiles = await this.request("/rest/v1/admin_profiles?select=user_id&limit=1", {}, true);
    if (!profiles.length) {
      this.logout();
      const error = new Error("La cuenta no tiene permisos de administración.");
      error.status = 403;
      throw error;
    }
    return payload;
  }

  async hasSession() {
    if (!this.remote) return true;
    if (!this.token) return false;
    try {
      await this.request("/auth/v1/user", {}, true);
      const profiles = await this.request("/rest/v1/admin_profiles?select=user_id&limit=1", {}, true);
      if (!profiles.length) throw new Error("Sin permisos de administración");
      return true;
    } catch {
      this.logout();
      return false;
    }
  }

  logout() {
    this.token = "";
    sessionStorage.removeItem(storageKey("admin-token"));
  }

  async saveCourse(values) {
    const row = { ...values, is_active: true, updated_at: new Date().toISOString() };
    if (!this.remote) {
      const current = readLocal("course", DEFAULT_COURSE);
      return writeLocal("course", { ...current, ...row, id: current.id || localId() });
    }
    if (row.id) {
      const id = row.id;
      delete row.id;
      const rows = await this.request(`/rest/v1/courses?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(row), prefer: "return=representation" }, true);
      return rows[0];
    }
    const rows = await this.request("/rest/v1/courses", { method: "POST", body: JSON.stringify({ ...row, status: "open" }), prefer: "return=representation" }, true);
    return rows[0];
  }

  async updateCourseStatus(courseId, status) {
    if (!this.remote) {
      const course = readLocal("course", DEFAULT_COURSE);
      return writeLocal("course", { ...course, status, updated_at: new Date().toISOString() });
    }
    const rows = await this.request(`/rest/v1/courses?id=eq.${encodeURIComponent(courseId)}`, { method: "PATCH", body: JSON.stringify({ status, updated_at: new Date().toISOString() }), prefer: "return=representation" }, true);
    return rows[0];
  }

  async getResponses(courseId) {
    if (!this.remote) {
      return {
        entrances: readLocal("entrances", []).filter(row => row.course_id === courseId),
        exits: readLocal("exits", []).filter(row => row.course_id === courseId)
      };
    }
    const filter = `course_id=eq.${encodeURIComponent(courseId)}&select=*&order=responded_at.asc`;
    const [entrances, exits] = await Promise.all([
      this.request(`/rest/v1/entrance_responses?${filter}`, {}, true),
      this.request(`/rest/v1/exit_responses?${filter}`, {}, true)
    ]);
    return { entrances, exits };
  }

  async resetResponses(courseId) {
    if (!this.remote) {
      writeLocal("entrances", readLocal("entrances", []).filter(row => row.course_id !== courseId));
      writeLocal("exits", readLocal("exits", []).filter(row => row.course_id !== courseId));
      return;
    }
    await this.request(`/rest/v1/exit_responses?course_id=eq.${encodeURIComponent(courseId)}`, { method: "DELETE" }, true);
    await this.request(`/rest/v1/entrance_responses?course_id=eq.${encodeURIComponent(courseId)}`, { method: "DELETE" }, true);
  }
}
