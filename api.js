// ═══════════════════════════════════════════════════
//  API CONFIG — Bon Request System (PHP + MySQL)
// ═══════════════════════════════════════════════════

const API_BASE = window.location.origin + '/bon-pegawai/api/';

// ── Core fetch helper ───────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
  const method  = options.method || 'GET';
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  let body = options.body || null;

  // For FormData uploads (LPJ), don't set Content-Type header
  if (body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const config = { method, headers };
  if (body) config.body = body instanceof FormData ? body : JSON.stringify(body);

  const res  = await fetch(API_BASE + endpoint, config);
  const text = await res.text();

  if (!text.trim()) {
    throw new Error('Server mengembalikan respons kosong.');
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Respons server bukan JSON valid: ' + text.substring(0, 200));
  }

  if (!res.ok) {
    throw new Error(data.error || data.message || 'Terjadi kesalahan.');
  }
  return data;
}

// ── GET ─────────────────────────────────────────────────────
async function apiGet(endpoint) {
  return apiFetch(endpoint, { method: 'GET' });
}

// ── POST ────────────────────────────────────────────────────
async function apiPost(endpoint, body) {
  return apiFetch(endpoint, { method: 'POST', body });
}

// ── PATCH ───────────────────────────────────────────────────
async function apiPatch(endpoint, body) {
  return apiFetch(endpoint, { method: 'PATCH', body });
}

// ── DELETE ───────────────────────────────────────────────────
async function apiDelete(endpoint, body) {
  return apiFetch(endpoint, { method: 'DELETE', body });
}

// ── Upload LPJ (FormData) ────────────────────────────────────
async function apiUploadLpj(id, description, file) {
  const form = new FormData();
  form.append('id', id);
  form.append('description', description);
  form.append('file', file);

  const res  = await fetch(API_BASE + 'lpj/upload', { method: 'POST', body: form });
  const text = await res.text();

  if (!text.trim()) {
    throw new Error('Server mengembalikan respons kosong.');
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Respons server bukan JSON valid: ' + text.substring(0, 200));
  }

  if (!res.ok) throw new Error(data.error || 'Gagal mengunggah file.');
  return data;
}

// ── File URL ────────────────────────────────────────────────
function fileUrl(filename) {
  return window.location.origin + '/uploads/' + filename;
}

// ── Password hash (bcrypt via client-side simulation) ────────
// Note: For production, use proper bcrypt.js library
async function hashPassword(password) {
  // Simple SHA-256 hash for compatibility with existing DB
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}
