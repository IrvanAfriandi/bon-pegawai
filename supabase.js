// ═══════════════════════════════════════════════════
//  SUPABASE CONFIG — include di semua halaman
// ═══════════════════════════════════════════════════

const SUPA_URL = "https://pustxqgkxatslwjjmiti.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1c3R4cWdreGF0c2x3amptaXRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMTA1OTUsImV4cCI6MjA5Mzg4NjU5NX0.9FcVc7yNXhFptZ1TC7Cdd9Ov8P1t8AVSywzcgF2yntQ";

const SB_HEADERS = {
  "Content-Type":  "application/json",
  "apikey":        SUPA_KEY,
  "Authorization": `Bearer ${SUPA_KEY}`,
  "Prefer":        "return=representation",
};

// ── GET dengan optional query string (PostgREST format) ──────────
async function sbGet(table, query = "") {
  const res  = await fetch(`${SUPA_URL}/rest/v1/${table}?${query}`, { headers: SB_HEADERS });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || "Gagal mengambil data.");
  return data;
}

// ── POST ─────────────────────────────────────────────────────────
async function sbPost(table, body) {
  const res  = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
    method: "POST", headers: SB_HEADERS, body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || "Gagal menyimpan data.");
  return Array.isArray(data) ? data[0] : data;
}

// ── PATCH by id ──────────────────────────────────────────────────
async function sbPatch(table, id, body) {
  const res  = await fetch(`${SUPA_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH", headers: SB_HEADERS, body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || "Gagal mengubah data.");
  return Array.isArray(data) ? data[0] : data;
}

// ── DELETE by id ─────────────────────────────────────────────────
async function sbDelete(table, id) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "DELETE", headers: { ...SB_HEADERS, "Prefer": "return=minimal" },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Gagal menghapus data.");
  }
  return true;
}

// ── Upload file ke Supabase Storage ─────────────────────────────
// bucket: nama bucket, mis. 'lpj-files'
async function sbUploadFile(bucket, file) {
  const ext      = file.name.split(".").pop().toLowerCase();
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const res      = await fetch(`${SUPA_URL}/storage/v1/object/${bucket}/${filename}`, {
    method:  "POST",
    headers: {
      "apikey":        SUPA_KEY,
      "Authorization": `Bearer ${SUPA_KEY}`,
      "Content-Type":  file.type || "application/octet-stream",
    },
    body: file,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || data.message || "Gagal mengunggah file.");
  }
  return filename;
}

// ── URL publik file dari Storage ────────────────────────────────
function sbFileUrl(bucket, filename) {
  return `${SUPA_URL}/storage/v1/object/public/${bucket}/${filename}`;
}

// ── SHA-256 password hash ────────────────────────────────────────
async function sha256(message) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0")).join("");
}