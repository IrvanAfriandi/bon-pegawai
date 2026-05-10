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
//  LOAD & RENDER BON TABLE
// ═══════════════════════════════════════════════════
// Supabase PostgREST: join bon_items via foreign key dengan select embed

async function loadBons() {
  const tbody    = document.getElementById("bonTableBody");
  const errorDiv = document.getElementById("tableError");
  tbody.innerHTML = `<tr><td colspan="7" class="loading-row">Memuat data...</td></tr>`;
  errorDiv.classList.add("hidden");

  try {
    // Ambil bon beserta items-nya sekaligus (PostgREST resource embedding)
    const bons = await sbGet(
      "bon",
      "select=*,bon_items(id,name,amount,purpose)&order=created_at.desc"
    );

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

      // Detail row — tampilkan bon_items
      const trDetail = document.createElement("tr");
      trDetail.className = "bon-detail-row hidden";
      trDetail.innerHTML = `
        <td colspan="7">
          <div class="detail-panel">
            <table class="detail-items-table">
              <thead>
                <tr><th>#</th><th>Nama Item</th><th>Keperluan</th><th style="text-align:right;">Jumlah</th></tr>
              </thead>
              <tbody>
                ${items.length ? items.map((item, idx) => `
                  <tr>
                    <td>${idx + 1}</td>
                    <td>${escHtml(item.name)}</td>
                    <td>${escHtml(item.purpose)}</td>
                    <td style="text-align:right;font-family:var(--font-mono);font-weight:500;">${formatRupiah(item.amount)}</td>
                  </tr>
                `).join("") : `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">Tidak ada item</td></tr>`}
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

      // Toggle detail row
      tr.addEventListener("click", (e) => {
        if (e.target.closest("button") || e.target.closest("a")) return;
        const isOpen = !trDetail.classList.contains("hidden");
        const icon   = document.getElementById(`icon-${bon.id}`);
        if (isOpen) {
          trDetail.classList.add("hidden");
          if (icon) icon.style.transform = "rotate(0deg)";
        } else {
          trDetail.classList.remove("hidden");
          if (icon) icon.style.transform = "rotate(90deg)";
        }
      });

      tbody.appendChild(tr);
      tbody.appendChild(trDetail);
    });
  } catch (err) {
    errorDiv.textContent = err.message;
    errorDiv.classList.remove("hidden");
    tbody.innerHTML = `<tr><td colspan="7" class="loading-row">Gagal memuat data.</td></tr>`;
  }
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

  if (["ppk","kalapas","bendahara","admin"].includes(user.role))
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
    title: `Tolak Bon (${role})`,
    html: `<label style="display:block;text-align:left;margin-bottom:6px;font-weight:600;color:#4a5568;">Alasan Penolakan <span style="color:#e53e3e;">*</span></label>
           <textarea id="swal-reject-reason" class="swal2-textarea" placeholder="Tuliskan alasan penolakan..." style="margin:0;height:100px;resize:vertical;"></textarea>`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#e53e3e",
    cancelButtonColor: "#718096",
    confirmButtonText: "Tolak Bon",
    cancelButtonText: "Batal",
    focusConfirm: false,
    preConfirm: () => {
      const reason = document.getElementById("swal-reject-reason").value.trim();
      if (!reason) {
        Swal.showValidationMessage("Alasan penolakan wajib diisi!");
        return false;
      }
      return reason;
    },
  });
  if (!result.isConfirmed) return;
  try {
    const API_BASE = "http://localhost:3000";
    const res = await fetch(`${API_BASE}/bon/${id}/reject`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: result.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal menolak bon.");
    await Swal.fire({ title: "Bon Ditolak", text: "Bon telah berhasil ditolak.", icon: "success", timer: 1800, showConfirmButton: false });
    loadBons();
  } catch (err) {
    Swal.fire({ title: "Error", text: err.message, icon: "error" });
  }
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


// ── Refresh & Init ────────────────────────────────────
document.getElementById("refreshBtn").addEventListener("click", loadBons);
loadBons();

// ═══════════════════════════════════════════════════
//  DASHBOARD BENDAHARA
// ═══════════════════════════════════════════════════

if (user.role === "bendahara") {
  const dashSection = document.getElementById("dashboardSection");
  dashSection.classList.remove("hidden");

  let allBons = [];
  let activeFilter = "all";

  const filterLabels = {
    all:             "Semua Pengajuan",
    submitted:       "Menunggu Persetujuan PPK",
    approved_ppk:    "Menunggu Persetujuan Kalapas",
    approved_kalapas:"Menunggu Pencairan Dana",
    disbursed_nolpj: "Belum Upload LPJ",
    completed:       "Sudah Upload LPJ",
    rejected:        "Ditolak",
  };

  async function loadDashboard() {
    document.getElementById("dashListBody").innerHTML =
      `<div class="dash-list-loading">Memuat data...</div>`;

    try {
      allBons = await sbGet("bon", "select=*,bon_items(id,name,amount,purpose)&order=created_at.desc");
      updateCounts();
      renderList(activeFilter);
    } catch (err) {
      document.getElementById("dashListBody").innerHTML =
        `<div class="dash-list-loading" style="color:var(--red);">Gagal memuat: ${err.message}</div>`;
    }
  }

  function filterBons(filter) {
    switch (filter) {
      case "submitted":        return allBons.filter(b => b.status === "submitted");
      case "approved_ppk":     return allBons.filter(b => b.status === "approved_ppk");
      case "approved_kalapas": return allBons.filter(b => b.status === "approved_kalapas");
      case "disbursed_nolpj":  return allBons.filter(b => b.status === "disbursed" && !b.lpj_file);
      case "completed":        return allBons.filter(b => b.status === "completed");
      case "rejected":         return allBons.filter(b => b.status === "rejected");
      default:                 return allBons;
    }
  }

  function updateCounts() {
    document.getElementById("countSubmitted").textContent        = allBons.filter(b => b.status === "submitted").length;
    document.getElementById("countApprovedPpk").textContent      = allBons.filter(b => b.status === "approved_ppk").length;
    document.getElementById("countApprovedKalapas").textContent  = allBons.filter(b => b.status === "approved_kalapas").length;
    document.getElementById("countNolpj").textContent            = allBons.filter(b => b.status === "disbursed" && !b.lpj_file).length;
    document.getElementById("countCompleted").textContent        = allBons.filter(b => b.status === "completed").length;
    document.getElementById("countRejected").textContent         = allBons.filter(b => b.status === "rejected").length;
  }

  function renderList(filter) {
    activeFilter = filter;
    const list = filterBons(filter);
    const body = document.getElementById("dashListBody");
    document.getElementById("dashListTitle").textContent = filterLabels[filter] || "Semua Pengajuan";
    document.getElementById("dashListCount").textContent = list.length + " pengajuan";

    if (!list.length) {
      body.innerHTML = `<div class="dash-list-loading">Tidak ada data untuk kategori ini.</div>`;
      return;
    }

    body.innerHTML = list.map(bon => `
      <div class="dash-list-item">
        <div class="dash-list-meta">
          <span class="dash-list-name">${escHtml(bon.applicant_name)}</span>
          ${bon.applicant_nip ? `<span class="dash-list-nip">NIP: ${escHtml(bon.applicant_nip)}</span>` : ""}
          <span class="dash-list-date">${formatDate(bon.created_at)}</span>
        </div>
        <div class="dash-list-right">
          <span class="dash-list-amount">${formatRupiah(bon.total_amount)}</span>
          <span class="badge badge-${bon.status}">${statusLabel(bon.status)}</span>
        </div>
      </div>
    `).join("");
  }

  // Tab click
  document.querySelectorAll(".dash-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".dash-tab").forEach(t => t.classList.remove("active"));
      btn.classList.add("active");
      // Sync stat card active state
      const filterMap = {
        submitted:        "statSubmitted",
        approved_ppk:     "statApprovedPpk",
        approved_kalapas: "statApprovedKalapas",
        disbursed_nolpj:  "statNolpj",
        completed:        "statCompleted",
        rejected:         "statRejected",
      };
      document.querySelectorAll(".dash-card").forEach(c => c.classList.remove("active"));
      const cardId = filterMap[btn.dataset.filter];
      if (cardId) document.getElementById(cardId)?.classList.add("active");
      renderList(btn.dataset.filter);
    });
  });

  // Stat card click → filter
  const cardFilterMap = {
    statSubmitted:        "submitted",
    statApprovedPpk:      "approved_ppk",
    statApprovedKalapas:  "approved_kalapas",
    statNolpj:            "disbursed_nolpj",
    statCompleted:        "completed",
    statRejected:         "rejected",
  };
  Object.entries(cardFilterMap).forEach(([cardId, filter]) => {
    document.getElementById(cardId)?.addEventListener("click", () => {
      // Sync tab
      document.querySelectorAll(".dash-tab").forEach(t => {
        t.classList.toggle("active", t.dataset.filter === filter);
      });
      document.querySelectorAll(".dash-card").forEach(c => c.classList.remove("active"));
      document.getElementById(cardId).classList.add("active");
      renderList(filter);
    });
  });

  document.getElementById("refreshDashboardBtn").addEventListener("click", loadDashboard);
  loadDashboard();
}