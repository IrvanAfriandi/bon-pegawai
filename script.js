// ═══════════════════════════════════════════════════
//  BON REQUEST SYSTEM – Frontend Script (Supabase)
// ═══════════════════════════════════════════════════
//  Tabel: bon       → id, applicant_name, applicant_nip,
//                      total_amount, status, lpj_file,
//                      lpj_description, created_at, updated_at
//  Tabel: bon_items → id, bon_id, name, amount, purpose
//  Requires: supabase.js di-load sebelum file ini

// ── Auth Guard ───────────────────────────────────────
const userRaw = sessionStorage.getItem("user");
if (!userRaw) window.location.href = "login.html";
const user = JSON.parse(userRaw);
if (user.role === "admin") window.location.href = "admin.html";

// ── Helpers ──────────────────────────────────────────
function formatRupiah(num) {
  return "Rp " + Number(num).toLocaleString("id-ID");
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function statusLabel(status) {
  const labels = {
    submitted:        "Diajukan",
    approved_ppk:     "Disetujui PPK",
    approved_kalapas: "Disetujui Kalapas",
    disbursed:        "Dicairkan",
    completed:        "Selesai (LPJ)",
    rejected:         "Ditolak",
  };
  return labels[status] || status;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Navbar ───────────────────────────────────────────
document.getElementById("navUserInfo").textContent =
  `👤 ${user.username} (${user.role.toUpperCase()})`;

document.getElementById("logoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem("user");
  window.location.href = "login.html";
});

// ── Show/Hide Create Section ──────────────────────────
const createSection = document.getElementById("createSection");
if (user.role !== "pegawai") createSection.style.display = "none";

// ═══════════════════════════════════════════════════
//  CUSTOM COMBOBOX PEGAWAI
// ═══════════════════════════════════════════════════

let allPegawai      = [];
let selectedPegawai = null;

const comboInput    = document.getElementById("pegawaiSearch");
const comboDropdown = document.getElementById("comboboxDropdown");
const comboList     = document.getElementById("comboboxList");
const comboArrow    = document.getElementById("comboboxArrow");
const comboSearch   = document.getElementById("comboboxSearchInput");
const comboWrap     = document.getElementById("comboboxWrap");

function openCombobox() {
  comboDropdown.classList.remove("hidden");
  comboArrow.style.transform = "rotate(180deg)";
  comboSearch.value = "";
  renderComboList(allPegawai);
  setTimeout(() => comboSearch.focus(), 50);
}

function closeCombobox() {
  comboDropdown.classList.add("hidden");
  comboArrow.style.transform = "rotate(0deg)";
}

function renderComboList(list) {
  comboList.innerHTML = "";
  if (!list.length) {
    comboList.innerHTML = `<li class="combobox-empty">Tidak ada pegawai ditemukan</li>`;
    return;
  }
  list.forEach(p => {
    const li = document.createElement("li");
    li.className = "combobox-item";
    if (selectedPegawai && selectedPegawai.id === p.id) li.classList.add("selected");
    li.innerHTML = `
      <span class="combo-nama">${escHtml(p.nama)}</span>
      <span class="combo-nip">NIP: ${escHtml(p.nip)}</span>
    `;
    li.addEventListener("mousedown", (e) => { e.preventDefault(); selectPegawai(p); });
    comboList.appendChild(li);
  });
}

function selectPegawai(p) {
  selectedPegawai = p;
  comboInput.value = p.nama;
  document.getElementById("applicantSelectId").value   = p.id;
  document.getElementById("applicantSelectNama").value = p.nama;
  document.getElementById("applicantSelectNip").value  = p.nip;
  document.getElementById("selectedNip").textContent   = p.nip;
  document.getElementById("selectedPegawaiInfo").classList.remove("hidden");
  closeCombobox();
}

function clearCombobox() {
  selectedPegawai = null;
  comboInput.value = "";
  document.getElementById("applicantSelectId").value   = "";
  document.getElementById("applicantSelectNama").value = "";
  document.getElementById("applicantSelectNip").value  = "";
  document.getElementById("selectedPegawaiInfo").classList.add("hidden");
  document.getElementById("selectedNip").textContent   = "–";
}

comboInput.addEventListener("click", openCombobox);
comboSearch.addEventListener("input", function () {
  const q = this.value.trim().toLowerCase();
  if (!q) { renderComboList(allPegawai); return; }
  renderComboList(allPegawai.filter(p =>
    p.nama.toLowerCase().includes(q) || p.nip.toLowerCase().includes(q)
  ));
});
document.addEventListener("click", (e) => {
  if (!comboWrap.contains(e.target)) closeCombobox();
});

async function loadPegawaiOptions() {
  try {
    allPegawai = await sbGet("pegawai", "select=id,nama,nip&order=nama.asc");
    renderComboList(allPegawai);
  } catch {
    console.warn("Gagal memuat daftar pegawai.");
  }
}

if (user.role === "pegawai") loadPegawaiOptions();

// ═══════════════════════════════════════════════════
//  ITEMS MANAGEMENT
// ═══════════════════════════════════════════════════

let itemCount = 0;

function addItem() {
  itemCount++;
  const idx = itemCount;
  const container = document.getElementById("itemsContainer");
  const row = document.createElement("div");
  row.className = "item-row";
  row.dataset.idx = idx;
  row.innerHTML = `
    <input type="text"   placeholder="Nama item"    class="item-name"    data-idx="${idx}" />
    <input type="number" placeholder="Jumlah (Rp)"  class="item-amount"  data-idx="${idx}" min="1" />
    <input type="text"   placeholder="Keperluan"    class="item-purpose" data-idx="${idx}" />
    <button class="remove-item-btn" onclick="removeItem(${idx})" title="Hapus">✕</button>
  `;
  container.appendChild(row);
  row.querySelector(".item-amount").addEventListener("input", recalcTotal);
}

function removeItem(idx) {
  const row = document.querySelector(`.item-row[data-idx="${idx}"]`);
  if (row) { row.remove(); recalcTotal(); }
}

function recalcTotal() {
  const amounts = [...document.querySelectorAll(".item-amount")]
    .map(el => parseFloat(el.value) || 0);
  document.getElementById("totalDisplay").textContent =
    formatRupiah(amounts.reduce((a, b) => a + b, 0));
}

function getItems() {
  return [...document.querySelectorAll(".item-row")].map(row => ({
    name:    row.querySelector(".item-name").value.trim(),
    amount:  parseFloat(row.querySelector(".item-amount").value),
    purpose: row.querySelector(".item-purpose").value.trim(),
  }));
}

document.getElementById("addItemBtn").addEventListener("click", addItem);
addItem();

// ── Submit Bon ───────────────────────────────────────
// Alur: POST ke tabel 'bon' dulu → dapat id → POST tiap item ke 'bon_items'
document.getElementById("submitBonBtn").addEventListener("click", async () => {
  const errorDiv   = document.getElementById("createError");
  const successDiv = document.getElementById("createSuccess");
  const btn        = document.getElementById("submitBonBtn");

  errorDiv.classList.add("hidden");
  successDiv.classList.add("hidden");

  const applicantName = document.getElementById("applicantSelectNama").value;
  const applicantNip  = document.getElementById("applicantSelectNip").value;

  if (!applicantName) {
    errorDiv.textContent = "Pilih nama pemohon terlebih dahulu.";
    errorDiv.classList.remove("hidden");
    return;
  }

  const items = getItems();
  if (!items.length) {
    errorDiv.textContent = "Minimal satu item wajib diisi.";
    errorDiv.classList.remove("hidden");
    return;
  }
  for (const i of items) {
    if (!i.name || !i.purpose) {
      errorDiv.textContent = "Nama dan keperluan setiap item wajib diisi.";
      errorDiv.classList.remove("hidden");
      return;
    }
    if (!i.amount || i.amount <= 0) {
      errorDiv.textContent = "Jumlah setiap item harus lebih dari 0.";
      errorDiv.classList.remove("hidden");
      return;
    }
  }

  btn.disabled = true;
  btn.textContent = "Memproses...";

  try {
    const totalAmount = items.reduce((s, i) => s + i.amount, 0);

    // 1. Simpan header bon
    const bon = await sbPost("bon", {
      applicant_name: applicantName,
      applicant_nip:  applicantNip,
      total_amount:   totalAmount,
      status:         "submitted",
    });

    // 2. Simpan tiap item dengan bon_id yang baru didapat
    const bonId = bon.id;
    for (const item of items) {
      await sbPost("bon_items", {
        bon_id:  bonId,
        name:    item.name,
        amount:  item.amount,
        purpose: item.purpose,
      });
    }

    successDiv.textContent = "✅ Bon berhasil diajukan!";
    successDiv.classList.remove("hidden");
    clearCombobox();
    document.getElementById("itemsContainer").innerHTML = "";
    itemCount = 0;
    addItem();
    recalcTotal();
    errorDiv.classList.add("hidden");
    setTimeout(() => successDiv.classList.add("hidden"), 3000);
    loadBons();
  } catch (err) {
    errorDiv.textContent = err.message;
    errorDiv.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Ajukan Bon";
  }
});

// ═══════════════════════════════════════════════════
//  LOAD & RENDER BON TABLE / TAB VIEW
// ═══════════════════════════════════════════════════

// Inisialisasi tampilan: tab atau tabel berdasarkan role
const useTabView = ["pegawai", "bendahara"].includes(user.role);
if (useTabView) {
  document.getElementById("tabView").classList.remove("hidden");
  document.getElementById("tableView").classList.add("hidden");

  // Logika klik tab
  document.querySelectorAll(".bon-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".bon-tab").forEach(t => t.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".bon-tab-panel").forEach(p => p.classList.add("hidden"));
      const tabMap = {
        proses:    "tabPanelProses",
        pencairan: "tabPanelPencairan",
        lpj:       "tabPanelLpj",
        selesai:   "tabPanelSelesai",
        ditolak:   "tabPanelDitolak",
      };
      const panelId = tabMap[btn.dataset.tab];
      if (panelId) document.getElementById(panelId).classList.remove("hidden");
    });
  });

  // ── Filter bar: search + bulan ───────────────────────
  const tabSearchInput = document.getElementById("tabSearchInput");
  const tabSearchClear = document.getElementById("tabSearchClear");
  const tabMonthFilter = document.getElementById("tabMonthFilter");

  tabSearchInput.addEventListener("input", () => {
    tabSearchClear.classList.toggle("hidden", !tabSearchInput.value);
    applyTabFilters();
  });
  tabSearchClear.addEventListener("click", () => {
    tabSearchInput.value = "";
    tabSearchClear.classList.add("hidden");
    applyTabFilters();
  });
  tabMonthFilter.addEventListener("change", applyTabFilters);
}

async function loadBons() {
  const errorDiv = document.getElementById("tableError");
  errorDiv.classList.add("hidden");

  try {
    // Bangun query filter berdasarkan role
    let query = "select=*,bon_items(id,name,amount,purpose)&order=created_at.desc";
    if (user.role === "ppk")     query += "&status=eq.submitted";
    if (user.role === "kalapas") query += "&status=eq.approved_ppk";

    const bons = await sbGet("bon", query);

    if (useTabView) {
      renderTabView(bons);
    } else {
      renderTableView(bons);
    }

    // Notifikasi ditolak untuk pegawai
    if (user.role === "pegawai") {
      const rejected = bons.filter(b => b.status === "rejected");
      if (rejected.length > 0) {
        const listHtml = rejected.map(b => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #fee2e2;gap:12px;">
            <div style="text-align:left;">
              <strong style="color:#1a202c;">${escHtml(b.applicant_name)}</strong>
              <div style="font-size:11px;color:#718096;">${formatRupiah(b.total_amount)} · ${formatDate(b.created_at)}</div>
              ${b.rejection_reason
                ? `<div style="font-size:12px;color:#c53030;margin-top:3px;">📌 ${escHtml(b.rejection_reason)}</div>`
                : `<div style="font-size:12px;color:#a0aec0;font-style:italic;">Alasan tidak dicatat</div>`}
            </div>
          </div>`).join("");
        Swal.fire({
          title: `❌ ${rejected.length} Bon Ditolak`,
          html: `
            <p style="color:#718096;font-size:13px;margin-bottom:12px;">Bon berikut telah ditolak. Silakan hubungi atasan untuk informasi lebih lanjut.</p>
            <div style="max-height:220px;overflow-y:auto;">${listHtml}</div>`,
          icon: "error",
          confirmButtonColor: "#3182ce",
          confirmButtonText: "Oke, Mengerti",
        });
      }
    }

  } catch (err) {
    errorDiv.textContent = err.message;
    errorDiv.classList.remove("hidden");
  }
}

// ── Simpan semua bon terakhir untuk keperluan filter ──
let _lastBons = [];

// ── Isi dropdown bulan dari data bon ─────────────────
function populateMonthFilter(bons) {
  const monthSel = document.getElementById("tabMonthFilter");
  if (!monthSel) return;
  const months = new Set();
  bons.forEach(b => {
    const d = new Date(b.created_at);
    months.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`);
  });
  const sorted = [...months].sort().reverse();
  const prev = monthSel.value;
  monthSel.innerHTML = `<option value="">Semua Bulan</option>`;
  sorted.forEach(m => {
    const [y, mo] = m.split("-");
    const label = new Date(y, mo-1).toLocaleDateString("id-ID",{month:"long",year:"numeric"});
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = label;
    if (m === prev) opt.selected = true;
    monthSel.appendChild(opt);
  });
}

// ── Terapkan filter search + bulan ke semua tab panel ─
function applyTabFilters() {
  const q     = (document.getElementById("tabSearchInput")?.value || "").trim().toLowerCase();
  const month = document.getElementById("tabMonthFilter")?.value || "";

  const filtered = _lastBons.filter(b => {
    const matchQ = !q ||
      (b.applicant_name || "").toLowerCase().includes(q) ||
      (b.applicant_nip  || "").toLowerCase().includes(q);
    const matchM = !month || (() => {
      const d = new Date(b.created_at);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}` === month;
    })();
    return matchQ && matchM;
  });

  _renderTabPanels(filtered);
}

// ── Render Tab View (pegawai & bendahara) ─────────────
function renderTabView(bons) {
  _lastBons = bons;
  populateMonthFilter(bons);
  _renderTabPanels(bons);
}

function _renderTabPanels(bons) {
  // Proses = submitted dan approved_ppk saja
  const prosesF    = bons.filter(b => ["submitted","approved_ppk"].includes(b.status));
  // Menunggu Pencairan = sudah disetujui Kalapas
  const pencairanF = bons.filter(b => b.status === "approved_kalapas");
  // Harus Upload LPJ = sudah dicairkan, belum ada file LPJ
  const lpjF       = bons.filter(b => b.status === "disbursed" && !b.lpj_file);
  // Selesai = sudah LPJ atau disbursed+ada lpj
  const selesaiF   = bons.filter(b => b.status === "completed" || (b.status === "disbursed" && b.lpj_file));
  const ditolakF   = bons.filter(b => b.status === "rejected");

  // Update badge count
  document.getElementById("tabCountProses").textContent    = prosesF.length;
  document.getElementById("tabCountPencairan").textContent = pencairanF.length;
  document.getElementById("tabCountLpj").textContent       = lpjF.length;
  document.getElementById("tabCountSelesai").textContent   = selesaiF.length;
  document.getElementById("tabCountDitolak").textContent   = ditolakF.length;

  renderTabPanel("tabPanelProses",    prosesF,    "proses");
  renderTabPanel("tabPanelPencairan", pencairanF, "pencairan");
  renderTabPanel("tabPanelLpj",       lpjF,       "lpj");
  renderTabPanel("tabPanelSelesai",   selesaiF,   "selesai");
  renderTabPanel("tabPanelDitolak",   ditolakF,   "ditolak");
}

function renderTabPanel(panelId, bons, tabType) {
  const panel = document.getElementById(panelId);
  if (!bons.length) {
    panel.innerHTML = `<div class="bon-tab-empty">✅ Tidak ada pengajuan di kategori ini.</div>`;
    return;
  }
  panel.innerHTML = `<div class="bon-card-list">${bons.map((bon, idx) => buildBonCard(bon, idx, tabType)).join("")}</div>`;

  // Pasang event toggle expand
  panel.querySelectorAll(".bon-card").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("button") || e.target.closest("a")) return;
      card.classList.toggle("expanded");
    });
  });
}

function buildBonCard(bon, idx, tabType) {
  const items = bon.bon_items || [];
  const itemsHtml = items.length
    ? `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px;">
        <thead><tr style="color:var(--text-muted);">
          <th style="text-align:left;padding:4px 8px 4px 0;font-weight:600;">#</th>
          <th style="text-align:left;padding:4px 8px 4px 0;font-weight:600;">Nama Item</th>
          <th style="text-align:left;padding:4px 8px 4px 0;font-weight:600;">Keperluan</th>
          <th style="text-align:right;padding:4px 0;font-weight:600;">Jumlah</th>
        </tr></thead>
        <tbody>
          ${items.map((item, i) => `
            <tr style="border-top:1px solid var(--border);">
              <td style="padding:6px 8px 6px 0;color:var(--text-muted);">${i+1}</td>
              <td style="padding:6px 8px 6px 0;">${escHtml(item.name)}</td>
              <td style="padding:6px 8px 6px 0;color:var(--text-secondary);">${escHtml(item.purpose)}</td>
              <td style="padding:6px 0;text-align:right;font-family:var(--font-mono);font-weight:500;">${formatRupiah(item.amount)}</td>
            </tr>`).join("")}
        </tbody>
        <tfoot><tr style="border-top:2px solid var(--border);">
          <td colspan="3" style="padding:6px 0;text-align:right;font-weight:700;color:var(--text-secondary);font-size:12px;">TOTAL</td>
          <td style="padding:6px 0;text-align:right;font-family:var(--font-mono);font-weight:700;color:var(--blue);">${formatRupiah(bon.total_amount)}</td>
        </tr></tfoot>
      </table>`
    : `<p style="font-size:12px;color:var(--text-muted);margin:0;">Tidak ada item.</p>`;

  const extraNote = bon.status === "rejected" && bon.rejection_reason
    ? `<div class="bon-card-reject-note">❌ Alasan Penolakan: ${escHtml(bon.rejection_reason)}</div>`
    : bon.lpj_description
      ? `<div class="bon-card-lpj-note">📝 Keterangan LPJ: ${escHtml(bon.lpj_description)}</div>`
      : "";

  const actionsHtml = renderActions(bon);
  const hasActions = actionsHtml && !actionsHtml.includes("color:var(--text-muted)");

  return `
    <div class="bon-card" data-id="${bon.id}">
      <div class="bon-card-top">
        <div class="bon-card-left">
          <span class="bon-card-name">${escHtml(bon.applicant_name)}</span>
          ${bon.applicant_nip ? `<span class="bon-card-nip">NIP: ${escHtml(bon.applicant_nip)}</span>` : ""}
        </div>
        <div class="bon-card-right">
          <span class="bon-card-amount">${formatRupiah(bon.total_amount)}</span>
          <span class="badge badge-${bon.status}">${statusLabel(bon.status)}</span>
          <span class="bon-card-chevron">▶</span>
        </div>
      </div>
      <div class="bon-card-meta">
        <span>📅 ${formatDate(bon.created_at)}</span>
        <span>📦 ${(bon.bon_items||[]).length} item</span>
        ${bon.lpj_file ? `<a href="${sbFileUrl('lpj-files', bon.lpj_file)}" target="_blank" class="lpj-link" onclick="event.stopPropagation()">📄 Lihat LPJ</a>` : ""}
      </div>
      <div class="bon-card-detail">
        ${itemsHtml}
        ${extraNote}
        ${hasActions ? `<div class="bon-card-actions">${actionsHtml}</div>` : ""}
      </div>
    </div>`;
}

// ── Render Table View (ppk, kalapas, dll) ─────────────
function renderTableView(bons) {
  const tbody = document.getElementById("bonTableBody");
  if (!bons.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-row">Belum ada pengajuan bon.</td></tr>`;
    return;
  }
  tbody.innerHTML = "";
  bons.forEach((bon, index) => {
    const items = bon.bon_items || [];
    const tr = document.createElement("tr");
    tr.className = "bon-row";
    tr.innerHTML = `
      <td>
        <span class="row-chevron" id="icon-${bon.id}" style="display:inline-block;transition:transform .2s;">▶</span>
        ${index + 1}
      </td>
      <td>
        <strong>${escHtml(bon.applicant_name)}</strong>
        ${bon.applicant_nip ? `<br><small style="color:var(--text-muted);font-size:11px;">NIP: ${escHtml(bon.applicant_nip)}</small>` : ""}
      </td>
      <td style="font-family:var(--font-mono);font-weight:500;">${formatRupiah(bon.total_amount)}</td>
      <td><span class="badge badge-${bon.status}">${statusLabel(bon.status)}</span></td>
      <td>${renderLpj(bon)}</td>
      <td>${formatDate(bon.created_at)}</td>
      <td class="actions-cell">${renderActions(bon)}</td>
    `;
    const trDetail = document.createElement("tr");
    trDetail.className = "bon-detail-row hidden";
    trDetail.innerHTML = `
      <td colspan="7">
        <div class="detail-panel">
          <table class="detail-items-table">
            <thead><tr><th>#</th><th>Nama Item</th><th>Keperluan</th><th style="text-align:right;">Jumlah</th></tr></thead>
            <tbody>
              ${items.length ? items.map((item, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${escHtml(item.name)}</td>
                  <td>${escHtml(item.purpose)}</td>
                  <td style="text-align:right;font-family:var(--font-mono);font-weight:500;">${formatRupiah(item.amount)}</td>
                </tr>`).join("") : `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">Tidak ada item</td></tr>`}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3" style="text-align:right;font-weight:600;color:var(--text-secondary);">TOTAL</td>
                <td style="text-align:right;font-family:var(--font-mono);font-weight:700;color:var(--blue);">${formatRupiah(bon.total_amount)}</td>
              </tr>
            </tfoot>
          </table>
          ${bon.lpj_description ? `<div class="detail-lpj-note">📝 Keterangan LPJ: ${escHtml(bon.lpj_description)}</div>` : ""}
          ${bon.status === "rejected" && bon.rejection_reason ? `<div class="detail-reject-note">❌ Alasan Penolakan: ${escHtml(bon.rejection_reason)}</div>` : ""}
        </div>
      </td>
    `;
    tr.addEventListener("click", (e) => {
      if (e.target.closest("button") || e.target.closest("a")) return;
      const isOpen = !trDetail.classList.contains("hidden");
      const icon   = document.getElementById(`icon-${bon.id}`);
      if (isOpen) { trDetail.classList.add("hidden"); if (icon) icon.style.transform = "rotate(0deg)"; }
      else         { trDetail.classList.remove("hidden"); if (icon) icon.style.transform = "rotate(90deg)"; }
    });
    tbody.appendChild(tr);
    tbody.appendChild(trDetail);
  });
}

function renderLpj(bon) {
  if (bon.lpj_file) {
    return `<a href="${sbFileUrl('lpj-files', bon.lpj_file)}" target="_blank" class="lpj-link" title="${escHtml(bon.lpj_description || '')}">📄 Lihat LPJ</a>`;
  }
  return `<span style="color:var(--text-muted);font-size:12px;">–</span>`;
}

function renderActions(bon) {
  const btns = [];

  if (user.role === "ppk" && bon.status === "submitted") {
    btns.push(`<button class="btn btn-sm btn-approve-ppk" onclick="updateStatus('${bon.id}','approved_ppk')">✓ Setujui (PPK)</button>`);
    btns.push(`<button class="btn btn-sm btn-reject" onclick="rejectBon('${bon.id}','PPK')">✕ Tolak</button>`);
  }

  if (user.role === "kalapas" && bon.status === "approved_ppk") {
    btns.push(`<button class="btn btn-sm btn-approve-kpl" onclick="updateStatus('${bon.id}','approved_kalapas')">✓ Setujui (Kalapas)</button>`);
    btns.push(`<button class="btn btn-sm btn-reject" onclick="rejectBon('${bon.id}','Kalapas')">✕ Tolak</button>`);
  }

  if (user.role === "bendahara" && bon.status === "approved_kalapas")
    btns.push(`<button class="btn btn-sm btn-disburse" onclick="updateStatus('${bon.id}','disbursed')">💰 Cairkan</button>`);

  if (user.role === "pegawai" && bon.status === "disbursed")
    btns.push(`<button class="btn btn-sm btn-lpj" onclick="openLpjModal('${bon.id}')">📄 Upload LPJ</button>`);

  // Tombol lihat alasan penolakan — tampil untuk semua role jika ditolak
  if (bon.status === "rejected") {
    const safeReason = (bon.rejection_reason || "Tidak ada alasan yang dicatat.").replace(/'/g, "\\'").replace(/"/g, "&quot;");
    btns.push(`<button class="btn btn-sm btn-show-reason" onclick="showRejectionReason('${safeReason}')">💬 Lihat Alasan</button>`);
    // Tombol edit & ajukan ulang — hanya untuk pegawai
    if (user.role === "pegawai")
      btns.push(`<button class="btn btn-sm btn-lpj" onclick="openEditBonModal('${bon.id}')">✏️ Edit & Ajukan Ulang</button>`);
  }

  if (["bendahara","admin"].includes(user.role))
    btns.push(`<button class="btn btn-sm btn-delete" onclick="deleteBon('${bon.id}',\`${escHtml(bon.applicant_name)}\`)">🗑 Hapus</button>`);

  return btns.join("") || `<span style="color:var(--text-muted);font-size:12px;">–</span>`;
}

// ── Delete Bon ───────────────────────────────────────
// Hapus items dulu baru header (foreign key constraint)
async function deleteBon(id, name) {
  const result = await Swal.fire({
    title: "Hapus Bon?",
    html: `Bon milik <strong>${name}</strong> akan dihapus permanen.<br>Tindakan ini tidak dapat dibatalkan.`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#e53e3e",
    cancelButtonColor: "#718096",
    confirmButtonText: "Ya, Hapus!",
    cancelButtonText: "Batal",
  });
  if (!result.isConfirmed) return;
  try {
    // Hapus semua bon_items terkait dulu
    await fetch(`${SUPA_URL}/rest/v1/bon_items?bon_id=eq.${id}`, {
      method: "DELETE",
      headers: { ...SB_HEADERS, "Prefer": "return=minimal" },
    });
    // Baru hapus bon-nya
    await sbDelete("bon", id);
    await Swal.fire({ title: "Terhapus!", text: "Bon berhasil dihapus.", icon: "success", timer: 1800, showConfirmButton: false });
    loadBons();
  } catch (err) {
    Swal.fire({ title: "Error", text: err.message, icon: "error" });
  }
}

// ── Update Status ────────────────────────────────────
async function updateStatus(id, status) {
  const result = await Swal.fire({
    title: "Konfirmasi",
    html: `Ubah status menjadi:<br><strong>"${statusLabel(status)}"</strong>?`,
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#3182ce",
    cancelButtonColor: "#718096",
    confirmButtonText: "Ya, Konfirmasi",
    cancelButtonText: "Batal",
  });
  if (!result.isConfirmed) return;
  try {
    await sbPatch("bon", id, { status });
    await Swal.fire({ title: "Berhasil!", text: `Status diperbarui menjadi "${statusLabel(status)}".`, icon: "success", timer: 1800, showConfirmButton: false });
    loadBons();
  } catch (err) {
    Swal.fire({ title: "Error", text: err.message, icon: "error" });
  }
}

// ── Reject Bon ───────────────────────────────────────
async function rejectBon(id, role) {
  const result = await Swal.fire({
    title: `<span style="color:#e53e3e;">✕ Tolak Bon (${role})</span>`,
    html: `
      <p style="color:#718096;font-size:13px;margin-bottom:14px;">
        Mohon isi alasan penolakan dengan jelas agar pemohon dapat memahami keputusan ini.
      </p>
      <label style="display:block;text-align:left;margin-bottom:6px;font-weight:600;color:#4a5568;font-size:13px;">
        Alasan Penolakan <span style="color:#e53e3e;">*</span>
      </label>
      <textarea
        id="swal-reject-reason"
        class="swal2-textarea"
        placeholder="Contoh: Dokumen pendukung tidak lengkap, anggaran tidak sesuai, dll."
        style="margin:0;height:110px;resize:vertical;font-size:13px;border-color:#fed7d7;"
      ></textarea>`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#e53e3e",
    cancelButtonColor: "#718096",
    confirmButtonText: "✕ Tolak Bon",
    cancelButtonText: "Batal",
    focusConfirm: false,
    customClass: { popup: "swal-reject-popup" },
    didOpen: () => {
      setTimeout(() => document.getElementById("swal-reject-reason")?.focus(), 100);
    },
    preConfirm: () => {
      const reason = document.getElementById("swal-reject-reason").value.trim();
      if (!reason) {
        Swal.showValidationMessage("⚠️ Alasan penolakan wajib diisi!");
        return false;
      }
      if (reason.length < 10) {
        Swal.showValidationMessage("⚠️ Alasan terlalu singkat, minimal 10 karakter.");
        return false;
      }
      return reason;
    },
  });
  if (!result.isConfirmed) return;

  // ── Step 1: Update status ke "rejected" dulu ──────────
  try {
    await sbPatch("bon", id, { status: "rejected" });
  } catch (err) {
    Swal.fire({
      title: "Gagal Menolak",
      html: `<p>Tidak dapat mengubah status bon.</p><code style="font-size:11px;color:#718096;">${escHtml(err.message)}</code>`,
      icon: "error",
      confirmButtonColor: "#e53e3e",
    });
    return;
  }

  // ── Step 2: Coba simpan alasan penolakan ─────────────
  let reasonSaved = false;
  try {
    await sbPatch("bon", id, { rejection_reason: result.value });
    reasonSaved = true;
  } catch (_) {
    // Kolom rejection_reason belum ada di Supabase — abaikan
    reasonSaved = false;
  }

  // ── Tampilkan hasil ───────────────────────────────────
  if (reasonSaved) {
    await Swal.fire({
      title: "✅ Bon Berhasil Ditolak",
      html: `
        <p style="color:#4a5568;margin-bottom:12px;">Alasan penolakan telah disimpan:</p>
        <div style="background:#fff1f2;border-left:4px solid #e53e3e;padding:12px 16px;border-radius:8px;text-align:left;color:#c53030;font-size:13px;line-height:1.6;">
          "${escHtml(result.value)}"
        </div>`,
      icon: "success",
      confirmButtonColor: "#3182ce",
      confirmButtonText: "Tutup",
    });
  } else {
    await Swal.fire({
      title: "⚠️ Bon Ditolak (Alasan Belum Tersimpan)",
      html: `
        <p style="color:#4a5568;margin-bottom:10px;">Status berhasil diubah ke <strong>Ditolak</strong>, namun alasan tidak tersimpan karena kolom <code>rejection_reason</code> belum ada di Supabase.</p>
        <div style="background:#fff1f2;border-left:4px solid #e53e3e;padding:10px 14px;border-radius:8px;text-align:left;color:#c53030;font-size:13px;margin-bottom:12px;">
          Alasan: "${escHtml(result.value)}"
        </div>
        <p style="font-size:12px;color:#718096;background:#f7fafc;padding:10px;border-radius:6px;text-align:left;">
          ⚙️ Jalankan SQL ini di <strong>Supabase → SQL Editor</strong>:<br>
          <code style="font-size:11px;">ALTER TABLE bon ADD COLUMN rejection_reason TEXT DEFAULT '';</code>
        </p>`,
      icon: "warning",
      confirmButtonColor: "#3182ce",
      confirmButtonText: "Mengerti",
    });
  }

  loadBons();
}

// ── Lihat Alasan Penolakan ────────────────────────────
function showRejectionReason(reason) {
  const isNoReason = !reason || reason === "Tidak ada alasan yang dicatat.";
  Swal.fire({
    title: "❌ Bon Ditolak",
    html: isNoReason
      ? `<p style="color:#718096;font-style:italic;">Tidak ada alasan penolakan yang dicatat.</p>`
      : `<div style="background:#fff1f2;border-left:4px solid #e53e3e;padding:14px 16px;border-radius:8px;text-align:left;color:#c53030;font-size:14px;line-height:1.7;word-break:break-word;">${escHtml(reason)}</div>`,
    icon: "error",
    confirmButtonColor: "#3182ce",
    confirmButtonText: "Tutup",
  });
}


// ── LPJ Modal ────────────────────────────────────────
function openLpjModal(bonId) {
  document.getElementById("lpjBonId").value = bonId;
  document.getElementById("lpjDescription").value = "";
  document.getElementById("lpjFile").value = "";
  document.getElementById("fileName").textContent = "";
  document.getElementById("fileName").classList.add("hidden");
  const hintEl = document.querySelector(".file-hint");
  if (hintEl) hintEl.classList.remove("hidden");
  document.getElementById("lpjError").classList.add("hidden");
  document.getElementById("lpjSuccess").classList.add("hidden");
  document.getElementById("lpjModal").classList.remove("hidden");
}

document.getElementById("closeLpjModal").addEventListener("click", () => {
  document.getElementById("lpjModal").classList.add("hidden");
});
document.getElementById("lpjModal").addEventListener("click", (e) => {
  if (e.target === document.getElementById("lpjModal"))
    document.getElementById("lpjModal").classList.add("hidden");
});

document.getElementById("lpjFile").addEventListener("change", (e) => {
  const file   = e.target.files[0];
  const nameEl = document.getElementById("fileName");
  const hintEl = document.querySelector(".file-hint");
  if (file) {
    nameEl.textContent = "✅ " + file.name;
    nameEl.classList.remove("hidden");
    if (hintEl) hintEl.classList.add("hidden");
  } else {
    nameEl.classList.add("hidden");
    if (hintEl) hintEl.classList.remove("hidden");
  }
});

// ── Submit LPJ ───────────────────────────────────────
document.getElementById("submitLpjBtn").addEventListener("click", async () => {
  const bonId       = document.getElementById("lpjBonId").value;
  const description = document.getElementById("lpjDescription").value.trim();
  const fileInput   = document.getElementById("lpjFile");
  const errorDiv    = document.getElementById("lpjError");
  const successDiv  = document.getElementById("lpjSuccess");
  const btn         = document.getElementById("submitLpjBtn");

  errorDiv.classList.add("hidden");
  successDiv.classList.add("hidden");

  if (!description) {
    errorDiv.textContent = "Deskripsi LPJ wajib diisi.";
    errorDiv.classList.remove("hidden");
    return;
  }
  if (!fileInput.files[0]) {
    errorDiv.textContent = "File LPJ wajib diunggah.";
    errorDiv.classList.remove("hidden");
    return;
  }
  const file = fileInput.files[0];
  if (file.size > 10 * 1024 * 1024) {
    errorDiv.textContent = "Ukuran file maksimal 10MB.";
    errorDiv.classList.remove("hidden");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Mengunggah...";

  try {
    // 1. Upload file ke Supabase Storage bucket 'lpj-files'
    const filename = await sbUploadFile("lpj-files", file);

    // 2. Update kolom lpj_file, lpj_description, dan status di tabel bon
    await sbPatch("bon", bonId, {
      lpj_file:        filename,
      lpj_description: description,
      status:          "completed",
    });

    successDiv.textContent = "✅ LPJ berhasil diunggah!";
    successDiv.classList.remove("hidden");
    setTimeout(() => {
      document.getElementById("lpjModal").classList.add("hidden");
      loadBons();
    }, 1500);
  } catch (err) {
    errorDiv.textContent = err.message;
    errorDiv.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Upload LPJ";
  }
});


// ═══════════════════════════════════════════════════
//  EDIT & AJUKAN ULANG BON (pegawai – bon ditolak)
// ═══════════════════════════════════════════════════

let editItemCount = 0;

function addEditItem(name = "", amount = "", purpose = "") {
  editItemCount++;
  const idx = editItemCount;
  const container = document.getElementById("editItemsContainer");
  const row = document.createElement("div");
  row.className = "item-row";
  row.dataset.idx = idx;
  row.innerHTML = `
    <input type="text"   placeholder="Nama item"    class="edit-item-name"    data-idx="${idx}" value="${escHtml(String(name))}" />
    <input type="number" placeholder="Jumlah (Rp)"  class="edit-item-amount"  data-idx="${idx}" min="1" value="${amount}" />
    <input type="text"   placeholder="Keperluan"    class="edit-item-purpose" data-idx="${idx}" value="${escHtml(String(purpose))}" />
    <button class="remove-item-btn" onclick="removeEditItem(${idx})" title="Hapus">✕</button>
  `;
  container.appendChild(row);
  row.querySelector(".edit-item-amount").addEventListener("input", recalcEditTotal);
  recalcEditTotal();
}

function removeEditItem(idx) {
  const row = document.querySelector(`.item-row[data-idx="${idx}"]`);
  if (row) { row.remove(); recalcEditTotal(); }
}

function recalcEditTotal() {
  const amounts = [...document.querySelectorAll(".edit-item-amount")]
    .map(el => parseFloat(el.value) || 0);
  document.getElementById("editTotalDisplay").textContent =
    formatRupiah(amounts.reduce((a, b) => a + b, 0));
}

function getEditItems() {
  return [...document.querySelectorAll("#editItemsContainer .item-row")].map(row => ({
    name:    row.querySelector(".edit-item-name").value.trim(),
    amount:  parseFloat(row.querySelector(".edit-item-amount").value),
    purpose: row.querySelector(".edit-item-purpose").value.trim(),
  }));
}

// Buka modal edit, isi data dari bon yang ditolak
async function openEditBonModal(bonId) {
  const modal      = document.getElementById("editBonModal");
  const errorDiv   = document.getElementById("editBonError");
  const successDiv = document.getElementById("editBonSuccess");

  errorDiv.classList.add("hidden");
  successDiv.classList.add("hidden");
  document.getElementById("editItemsContainer").innerHTML = "";
  editItemCount = 0;

  try {
    // Ambil data bon beserta items
    const bons = await sbGet("bon", `select=*,bon_items(id,name,amount,purpose)&id=eq.${bonId}`);
    if (!bons || !bons.length) throw new Error("Data bon tidak ditemukan.");
    const bon = bons[0];

    document.getElementById("editBonId").value        = bon.id;
    document.getElementById("editApplicantName").value = bon.applicant_name;
    document.getElementById("editApplicantNip").value  = bon.applicant_nip || "";

    // Tampilkan alasan penolakan jika ada
    const rejBox    = document.getElementById("editRejectionInfo");
    const rejReason = document.getElementById("editRejectionReason");
    if (bon.rejection_reason) {
      rejReason.textContent = bon.rejection_reason;
      rejBox.classList.remove("hidden");
    } else {
      rejBox.classList.add("hidden");
    }

    // Isi item-item yang sudah ada
    const items = bon.bon_items || [];
    if (items.length) {
      items.forEach(item => addEditItem(item.name, item.amount, item.purpose));
    } else {
      addEditItem();
    }

    modal.classList.remove("hidden");
  } catch (err) {
    Swal.fire({ title: "Error", text: err.message, icon: "error" });
  }
}

document.getElementById("closeEditBonModal").addEventListener("click", () => {
  document.getElementById("editBonModal").classList.add("hidden");
});
document.getElementById("editBonModal").addEventListener("click", (e) => {
  if (e.target === document.getElementById("editBonModal"))
    document.getElementById("editBonModal").classList.add("hidden");
});
document.getElementById("editAddItemBtn").addEventListener("click", () => addEditItem());

// Submit ajukan ulang
document.getElementById("submitEditBonBtn").addEventListener("click", async () => {
  const errorDiv   = document.getElementById("editBonError");
  const successDiv = document.getElementById("editBonSuccess");
  const btn        = document.getElementById("submitEditBonBtn");
  const bonId      = document.getElementById("editBonId").value;

  errorDiv.classList.add("hidden");
  successDiv.classList.add("hidden");

  const items = getEditItems();
  if (!items.length) {
    errorDiv.textContent = "Minimal satu item wajib diisi.";
    errorDiv.classList.remove("hidden");
    return;
  }
  for (const i of items) {
    if (!i.name || !i.purpose) {
      errorDiv.textContent = "Nama dan keperluan setiap item wajib diisi.";
      errorDiv.classList.remove("hidden");
      return;
    }
    if (!i.amount || i.amount <= 0) {
      errorDiv.textContent = "Jumlah setiap item harus lebih dari 0.";
      errorDiv.classList.remove("hidden");
      return;
    }
  }

  const confirm = await Swal.fire({
    title: "Ajukan Ulang?",
    html: "Bon ini akan diubah dan diajukan ulang ke PPK.<br>Pastikan sudah sesuai perbaikan.",
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#3182ce",
    cancelButtonColor:  "#718096",
    confirmButtonText:  "Ya, Ajukan Ulang",
    cancelButtonText:   "Batal",
  });
  if (!confirm.isConfirmed) return;

  btn.disabled = true;
  btn.textContent = "Memproses...";

  try {
    const totalAmount = items.reduce((s, i) => s + i.amount, 0);

    // 1. Update header bon: reset status ke submitted, hapus rejection_reason
    await sbPatch("bon", bonId, {
      total_amount:     totalAmount,
      status:           "submitted",
      rejection_reason: "",
    });

    // 2. Hapus semua bon_items lama
    await fetch(`${SUPA_URL}/rest/v1/bon_items?bon_id=eq.${bonId}`, {
      method: "DELETE",
      headers: { ...SB_HEADERS, "Prefer": "return=minimal" },
    });

    // 3. Simpan item-item baru
    for (const item of items) {
      await sbPost("bon_items", {
        bon_id:  bonId,
        name:    item.name,
        amount:  item.amount,
        purpose: item.purpose,
      });
    }

    successDiv.textContent = "✅ Bon berhasil diajukan ulang!";
    successDiv.classList.remove("hidden");

    setTimeout(() => {
      document.getElementById("editBonModal").classList.add("hidden");
      loadBons();
    }, 1500);
  } catch (err) {
    errorDiv.textContent = err.message;
    errorDiv.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "🔄 Ajukan Ulang";
  }
});

// ── Refresh & Init ────────────────────────────────────
document.getElementById("refreshBtn").addEventListener("click", loadBons);
loadBons();