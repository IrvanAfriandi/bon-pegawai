const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
const fs = require("fs");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

// ─── Users JSON File ──────────────────────────────────────────────────────────
const USERS_FILE    = path.join(__dirname, "users.json");
const PEGAWAI_FILE  = path.join(__dirname, "pegawai.json");

function readUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
}
function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ─── Pegawai (Daftar Nama+NIP) ────────────────────────────────────────────────
function readPegawai() {
  if (!fs.existsSync(PEGAWAI_FILE)) return [];
  return JSON.parse(fs.readFileSync(PEGAWAI_FILE, "utf-8"));
}
function writePegawai(data) {
  fs.writeFileSync(PEGAWAI_FILE, JSON.stringify(data, null, 2));
}

async function seedDefaultUsers() {
  if (fs.existsSync(USERS_FILE)) return;
  const defaults = [
    { id: "1", username: "admin",      password: await bcrypt.hash("admin123", 10),      role: "admin" },
    { id: "2", username: "pegawai1",   password: await bcrypt.hash("pegawai123", 10),    role: "pegawai" },
    { id: "3", username: "ppk1",       password: await bcrypt.hash("ppk123", 10),        role: "ppk" },
    { id: "4", username: "kalapas1",   password: await bcrypt.hash("kalapas123", 10),    role: "kalapas" },
    { id: "5", username: "bendahara1", password: await bcrypt.hash("bendahara123", 10),  role: "bendahara" },
  ];
  writeUsers(defaults);
  console.log("✅ Default users created → users.json");
}

// ─── MongoDB ──────────────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/bon_request_db")
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// ─── Bon Schema ───────────────────────────────────────────────────────────────
const bonSchema = new mongoose.Schema(
  {
    applicantName: { type: String, required: true, trim: true },
    applicantNip:  { type: String, default: "", trim: true },
    items: [{
      name:    { type: String, required: true },
      amount:  { type: Number, required: true, min: 0 },
      purpose: { type: String, required: true },
    }],
    totalAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["submitted","approved_ppk","approved_kalapas","disbursed","completed"],
      default: "submitted",
    },
    lpj: {
      description: { type: String, default: "" },
      file:        { type: String, default: "" },
    },
  },
  { timestamps: true }
);
const Bon = mongoose.model("Bon", bonSchema);

// ─── Multer ───────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename:    (req, file, cb) => {
    cb(null, Date.now() + "-" + Math.round(Math.random()*1e9) + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [".pdf",".jpg",".jpeg",".png",".doc",".docx"];
    allowed.includes(path.extname(file.originalname).toLowerCase())
      ? cb(null, true)
      : cb(new Error("Tipe file tidak diizinkan."));
  },
});

const VALID_ROLES = ["pegawai","ppk","kalapas","bendahara"];

// ═══════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Username dan password wajib diisi." });

  const user = readUsers().find(u => u.username === username.trim());
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ error: "Username atau password salah." });

  res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
});

// ═══════════════════════════════════════════════════
//  ADMIN — USER MANAGEMENT
// ═══════════════════════════════════════════════════

app.get("/admin/users", (req, res) => {
  res.json(readUsers().map(({ password, ...u }) => u));
});

app.post("/admin/users", async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !username.trim())    return res.status(400).json({ error: "Username wajib diisi." });
  if (!password || password.length < 6) return res.status(400).json({ error: "Password minimal 6 karakter." });
  if (!["admin",...VALID_ROLES].includes(role)) return res.status(400).json({ error: "Role tidak valid." });

  const users = readUsers();
  if (users.find(u => u.username === username.trim()))
    return res.status(409).json({ error: "Username sudah digunakan." });

  const newUser = { id: Date.now().toString(), username: username.trim(), password: await bcrypt.hash(password, 10), role };
  users.push(newUser);
  writeUsers(users);
  const { password: _, ...safe } = newUser;
  res.status(201).json({ success: true, user: safe });
});

app.put("/admin/users/:id", async (req, res) => {
  const { username, password, role } = req.body;
  const users = readUsers();
  const idx   = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "User tidak ditemukan." });

  if (username && username.trim()) {
    if (users.find(u => u.username === username.trim() && u.id !== req.params.id))
      return res.status(409).json({ error: "Username sudah digunakan." });
    users[idx].username = username.trim();
  }
  if (role && ["admin",...VALID_ROLES].includes(role)) users[idx].role = role;
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: "Password minimal 6 karakter." });
    users[idx].password = await bcrypt.hash(password, 10);
  }

  writeUsers(users);
  const { password: _, ...safe } = users[idx];
  res.json({ success: true, user: safe });
});

app.delete("/admin/users/:id", (req, res) => {
  const users = readUsers();
  const idx   = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "User tidak ditemukan." });

  if (users[idx].role === "admin" && users.filter(u => u.role === "admin").length <= 1)
    return res.status(400).json({ error: "Tidak bisa menghapus satu-satunya akun admin." });

  users.splice(idx, 1);
  writeUsers(users);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════
//  ADMIN — DAFTAR PEGAWAI (Nama + NIP)
// ═══════════════════════════════════════════════════

// GET /admin/pegawai — ambil semua, support ?q=... untuk search
app.get("/admin/pegawai", (req, res) => {
  let list = readPegawai();
  const q  = (req.query.q || "").trim().toLowerCase();
  if (q) {
    list = list.filter(p =>
      p.nama.toLowerCase().includes(q) ||
      p.nip.toLowerCase().includes(q)
    );
  }
  res.json(list);
});

// POST /admin/pegawai — tambah pegawai baru
app.post("/admin/pegawai", (req, res) => {
  const { nama, nip } = req.body;
  if (!nama || !nama.trim()) return res.status(400).json({ error: "Nama pegawai wajib diisi." });
  if (!nip  || !nip.trim())  return res.status(400).json({ error: "NIP wajib diisi." });

  const list = readPegawai();
  if (list.find(p => p.nip === nip.trim()))
    return res.status(409).json({ error: "NIP sudah terdaftar." });

  const newP = { id: Date.now().toString(), nama: nama.trim(), nip: nip.trim() };
  list.push(newP);
  writePegawai(list);
  res.status(201).json({ success: true, pegawai: newP });
});

// PUT /admin/pegawai/:id — edit pegawai
app.put("/admin/pegawai/:id", (req, res) => {
  const { nama, nip } = req.body;
  const list = readPegawai();
  const idx  = list.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Pegawai tidak ditemukan." });

  if (nip && list.find(p => p.nip === nip.trim() && p.id !== req.params.id))
    return res.status(409).json({ error: "NIP sudah digunakan pegawai lain." });

  if (nama) list[idx].nama = nama.trim();
  if (nip)  list[idx].nip  = nip.trim();
  writePegawai(list);
  res.json({ success: true, pegawai: list[idx] });
});

// DELETE /admin/pegawai/:id — hapus pegawai
app.delete("/admin/pegawai/:id", (req, res) => {
  const list = readPegawai();
  const idx  = list.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Pegawai tidak ditemukan." });
  list.splice(idx, 1);
  writePegawai(list);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════
//  BON ROUTES
// ═══════════════════════════════════════════════════

app.get("/bon", async (req, res) => {
  try { res.json(await Bon.find().sort({ createdAt: -1 })); }
  catch { res.status(500).json({ error: "Gagal memuat data." }); }
});

app.post("/bon", async (req, res) => {
  try {
    const { applicantName, applicantNip, items } = req.body;
    if (!applicantName?.trim()) return res.status(400).json({ error: "Nama pemohon wajib diisi." });
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "Minimal satu item." });
    for (const i of items) {
      if (!i.name || !i.purpose) return res.status(400).json({ error: "Nama dan keperluan item wajib diisi." });
      if (typeof i.amount !== "number" || i.amount <= 0) return res.status(400).json({ error: "Jumlah item harus > 0." });
    }
    const bon = new Bon({
      applicantName: applicantName.trim(),
      applicantNip:  (applicantNip || "").trim(),
      items,
      totalAmount: items.reduce((s,i) => s + i.amount, 0),
    });
    await bon.save();
    res.status(201).json({ success: true, bon });
  } catch { res.status(500).json({ error: "Gagal membuat pengajuan." }); }
});

app.patch("/bon/:id/status", async (req, res) => {
  try {
    const valid = ["submitted","approved_ppk","approved_kalapas","disbursed","completed"];
    if (!valid.includes(req.body.status)) return res.status(400).json({ error: "Status tidak valid." });
    const bon = await Bon.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    if (!bon) return res.status(404).json({ error: "Bon tidak ditemukan." });
    res.json({ success: true, bon });
  } catch { res.status(500).json({ error: "Gagal mengubah status." }); }
});

app.post("/lpj/:id", upload.single("file"), async (req, res) => {
  try {
    if (!req.body.description?.trim()) return res.status(400).json({ error: "Deskripsi LPJ wajib diisi." });
    if (!req.file) return res.status(400).json({ error: "File LPJ wajib diunggah." });
    const bon = await Bon.findByIdAndUpdate(
      req.params.id,
      { lpj: { description: req.body.description.trim(), file: req.file.filename }, status: "completed" },
      { new: true }
    );
    if (!bon) return res.status(404).json({ error: "Bon tidak ditemukan." });
    res.json({ success: true, bon });
  } catch (err) { res.status(500).json({ error: err.message || "Gagal upload LPJ." }); }
});

app.delete("/bon/:id", async (req, res) => {
  try {
    const bon = await Bon.findByIdAndDelete(req.params.id);
    if (!bon) return res.status(404).json({ error: "Bon tidak ditemukan." });
    if (bon.lpj?.file) {
      const fp = path.join(__dirname, "uploads", bon.lpj.file);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    res.json({ success: true });
  } catch { res.status(500).json({ error: "Gagal menghapus bon." }); }
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message || "Internal server error." });
});

// ─── Start ────────────────────────────────────────────────────────────────────
seedDefaultUsers().then(() => {
  app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
});