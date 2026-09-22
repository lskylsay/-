// 관리자 페이지 로직 — GitHub 로그인(Supabase Auth) 후 본인 이메일이
// config.js 의 ADMIN_EMAIL 과 일치할 때만 신청 목록을 불러와 보여줍니다.
// 실제 데이터 접근 차단은 Supabase의 RLS 정책이 담당하므로,
// 이 파일의 이메일 체크는 화면 표시용 2차 확인입니다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const loginView = document.getElementById("loginView");
const deniedView = document.getElementById("deniedView");
const adminView = document.getElementById("adminView");
const deniedEmail = document.getElementById("deniedEmail");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const logoutBtnDenied = document.getElementById("logoutBtnDenied");
const refreshBtn = document.getElementById("refreshBtn");
const filterRow = document.getElementById("filterRow");
const tableBody = document.getElementById("appTableBody");
const countLabel = document.getElementById("countLabel");

let allRows = [];
let activeCompetition = "전체";

function showView(view) {
  loginView.style.display = view === "login" ? "" : "none";
  deniedView.style.display = view === "denied" ? "" : "none";
  adminView.style.display = view === "admin" ? "" : "none";
}

loginBtn.addEventListener("click", async () => {
  await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: window.location.href },
  });
});

async function doLogout() {
  await supabase.auth.signOut();
  showView("login");
}
logoutBtn.addEventListener("click", doLogout);
logoutBtnDenied.addEventListener("click", doLogout);

refreshBtn.addEventListener("click", loadApplications);

function renderFilters() {
  const competitions = ["전체", ...Array.from(new Set(allRows.map((r) => r.competition).filter(Boolean)))];
  filterRow.innerHTML = "";
  competitions.forEach((comp) => {
    const btn = document.createElement("button");
    btn.className = "filter-btn" + (comp === activeCompetition ? " active" : "");
    btn.textContent = comp;
    btn.addEventListener("click", () => {
      activeCompetition = comp;
      renderFilters();
      renderTable();
    });
    filterRow.appendChild(btn);
  });
}

function renderTable() {
  const rows =
    activeCompetition === "전체" ? allRows : allRows.filter((r) => r.competition === activeCompetition);

  countLabel.textContent = `총 ${rows.length}건`;

  tableBody.innerHTML = rows
    .map((r) => {
      const date = new Date(r.created_at).toLocaleString("ko-KR");
      return `
        <tr>
          <td>${date}</td>
          <td>${r.competition || ""}</td>
          <td>${r.sport || ""}</td>
          <td>${r.preferred_dates || ""}</td>
          <td>${r.class_no || ""}</td>
          <td>${r.grade || ""}</td>
          <td>${r.leader_name || ""}</td>
          <td>${r.contact || ""}</td>
          <td>${r.members || ""}</td>
          <td>${r.note || ""}</td>
          <td style="font-family:var(--font-mono); font-size:0.82rem; color:var(--ink-soft);">${r.ip_address || ""}</td>
        </tr>`;
    })
    .join("");
}

async function loadApplications() {
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    countLabel.textContent = "불러오기 실패: " + error.message;
    return;
  }

  allRows = data || [];
  renderFilters();
  renderTable();
}

async function checkAuthAndRender() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    showView("login");
    return;
  }

  const email = session.user.email;

  if (email !== window.ADMIN_EMAIL) {
    deniedEmail.textContent = email || "(이메일 없음)";
    showView("denied");
    return;
  }

  showView("admin");
  loadApplications();
}

supabase.auth.onAuthStateChange(() => {
  checkAuthAndRender();
});

/* ============ 개인 신청 / 교사 일괄 신청 / 대회 결과 탭 전환 ============ */

const adminIndividualTabBtn = document.getElementById("adminIndividualTabBtn");
const adminBulkTabBtn = document.getElementById("adminBulkTabBtn");
const adminResultsTabBtn = document.getElementById("adminResultsTabBtn");
const adminGuidelinesTabBtn = document.getElementById("adminGuidelinesTabBtn");
const individualAdminSection = document.getElementById("individualAdminSection");
const bulkAdminSection = document.getElementById("bulkAdminSection");
const resultsAdminSection = document.getElementById("resultsAdminSection");
const guidelinesAdminSection = document.getElementById("guidelinesAdminSection");
const logoutBtn2 = document.getElementById("logoutBtn2");
const logoutBtn3 = document.getElementById("logoutBtn3");
const logoutBtn4 = document.getElementById("logoutBtn4");
const bulkRefreshBtn = document.getElementById("bulkRefreshBtn");
const bulkCountLabel = document.getElementById("bulkCountLabel");
const bulkListContainer = document.getElementById("bulkListContainer");

let bulkLoaded = false;
let resultsLoaded = false;
let guidelinesLoaded = false;

function showAdminTab(tab) {
  adminIndividualTabBtn.classList.toggle("active", tab === "individual");
  adminBulkTabBtn.classList.toggle("active", tab === "bulk");
  adminResultsTabBtn.classList.toggle("active", tab === "results");
  adminGuidelinesTabBtn.classList.toggle("active", tab === "guidelines");
  individualAdminSection.style.display = tab === "individual" ? "" : "none";
  bulkAdminSection.style.display = tab === "bulk" ? "" : "none";
  resultsAdminSection.style.display = tab === "results" ? "" : "none";
  guidelinesAdminSection.style.display = tab === "guidelines" ? "" : "none";

  if (tab === "bulk" && !bulkLoaded) loadBulkApplications();
  if (tab === "results" && !resultsLoaded) loadResultsAdmin();
  if (tab === "guidelines" && !guidelinesLoaded) loadGuidelinesAdmin();
}

adminIndividualTabBtn.addEventListener("click", () => showAdminTab("individual"));
adminBulkTabBtn.addEventListener("click", () => showAdminTab("bulk"));
adminResultsTabBtn.addEventListener("click", () => showAdminTab("results"));
adminGuidelinesTabBtn.addEventListener("click", () => showAdminTab("guidelines"));

logoutBtn2.addEventListener("click", doLogout);
logoutBtn3.addEventListener("click", doLogout);
logoutBtn4.addEventListener("click", doLogout);
bulkRefreshBtn.addEventListener("click", loadBulkApplications);

function renderBulkList(rows) {
  bulkCountLabel.textContent = `총 ${rows.length}건`;

  bulkListContainer.innerHTML = rows
    .map((r, idx) => {
      const date = new Date(r.created_at).toLocaleString("ko-KR");
      return `
        <div class="bulk-admin-card">
          <div class="bulk-admin-head">
            <div>
              <strong>${r.school || ""}</strong>
              <span class="sub" style="margin:0;">${r.competition || ""} · ${r.sport || ""}</span>
            </div>
            <span class="sub" style="margin:0;">${date}</span>
          </div>
          <dl class="privacy-dl" style="margin-top:12px;">
            <dt>학교장</dt><dd>${r.principal_name || "-"}</dd>
            <dt>담당교사</dt><dd>${r.teacher_name || ""} (${r.teacher_contact || ""})</dd>
            <dt>신청인원</dt><dd>${r.requested_count || "-"}</dd>
            <dt>IP</dt><dd style="font-family:var(--font-mono); font-size:0.82rem;">${r.ip_address || ""}</dd>
          </dl>
          <button type="button" class="btn btn-outline bulk-download-btn" data-idx="${idx}" style="margin-top:8px;">
            ${r.file_name || "첨부파일"} 다운로드
          </button>
        </div>`;
    })
    .join("");

  bulkListContainer.querySelectorAll(".bulk-download-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = rows[Number(btn.dataset.idx)];
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = "링크 생성 중…";

      const { data, error } = await supabase.storage
        .from("bulk-uploads")
        .createSignedUrl(row.file_path, 60);

      btn.disabled = false;
      btn.textContent = originalText;

      if (error || !data) {
        alert("다운로드 링크 생성에 실패했습니다: " + (error ? error.message : "알 수 없는 오류"));
        return;
      }
      window.open(data.signedUrl, "_blank");
    });
  });
}

async function loadBulkApplications() {
  const { data, error } = await supabase
    .from("bulk_applications")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    bulkCountLabel.textContent = "불러오기 실패: " + error.message;
    return;
  }

  bulkLoaded = true;
  renderBulkList(data || []);
}

/* ============ 대회 결과 관리 ============ */

const resultsRefreshBtn = document.getElementById("resultsRefreshBtn");
const resultsCountLabel = document.getElementById("resultsCountLabel");
const resultsTableBody = document.getElementById("resultsTableBody");
const resAddBtn = document.getElementById("resAddBtn");
const resAddStatus = document.getElementById("resAddStatus");
const resultsFileInput = document.getElementById("resultsFileInput");
const resultsUploadBtn = document.getElementById("resultsUploadBtn");
const resultsUploadStatus = document.getElementById("resultsUploadStatus");

resultsRefreshBtn.addEventListener("click", loadResultsAdmin);

function renderResultsTable(rows) {
  resultsCountLabel.textContent = `총 ${rows.length}건`;
  resultsTableBody.innerHTML = rows
    .map(
      (r) => `
      <tr>
        <td>${r.competition || ""}</td>
        <td>${r.division || ""}</td>
        <td>${r.date || ""}</td>
        <td class="rank">${r.rank ?? ""}</td>
        <td>${r.name || ""}</td>
        <td>${r.note || ""}</td>
        <td><button type="button" class="row-remove-btn" data-id="${r.id}" title="삭제">×</button></td>
      </tr>`
    )
    .join("");

  resultsTableBody.querySelectorAll(".row-remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("이 결과를 삭제할까요?")) return;
      const { error } = await supabase.from("results").delete().eq("id", btn.dataset.id);
      if (error) {
        alert("삭제 실패: " + error.message);
        return;
      }
      loadResultsAdmin();
    });
  });
}

async function loadResultsAdmin() {
  const { data, error } = await supabase
    .from("results")
    .select("*")
    .order("competition", { ascending: true })
    .order("division", { ascending: true })
    .order("rank", { ascending: true });

  if (error) {
    resultsCountLabel.textContent = "불러오기 실패: " + error.message;
    return;
  }

  resultsLoaded = true;
  renderResultsTable(data || []);
}

// 직접 입력으로 한 건 추가
resAddBtn.addEventListener("click", async () => {
  const competition = document.getElementById("resCompetition").value;
  const division = document.getElementById("resDivision").value.trim();
  const date = document.getElementById("resDate").value.trim();
  const rank = document.getElementById("resRank").value;
  const name = document.getElementById("resName").value.trim();
  const note = document.getElementById("resNote").value.trim();

  if (!competition || !division || !rank || !name) {
    resAddStatus.textContent = "대회, 종목/부문, 순위, 이름은 필수입니다.";
    resAddStatus.className = "form-status error";
    return;
  }

  resAddBtn.disabled = true;
  const { error } = await supabase.from("results").insert([
    {
      competition,
      division,
      date: date || null,
      rank: Number(rank),
      name,
      note: note || null,
    },
  ]);
  resAddBtn.disabled = false;

  if (error) {
    resAddStatus.textContent = "추가 실패: " + error.message;
    resAddStatus.className = "form-status error";
    return;
  }

  resAddStatus.textContent = "추가되었습니다.";
  resAddStatus.className = "form-status success";
  document.getElementById("resDivision").value = "";
  document.getElementById("resDate").value = "";
  document.getElementById("resRank").value = "";
  document.getElementById("resName").value = "";
  document.getElementById("resNote").value = "";
  loadResultsAdmin();
});

// 엑셀 업로드로 한 번에 추가
resultsUploadBtn.addEventListener("click", async () => {
  const file = resultsFileInput.files[0];
  if (!file) {
    resultsUploadStatus.textContent = "업로드할 파일을 선택해 주세요.";
    resultsUploadStatus.className = "form-status error";
    return;
  }

  resultsUploadBtn.disabled = true;
  resultsUploadStatus.textContent = "읽는 중…";
  resultsUploadStatus.className = "form-status";

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });

    const validCompetitions = ["트랙마라톤 축제", "충북교육감기 육상대회"];
    const parsed = [];
    const skipped = [];

    rows.forEach((row) => {
      const competition = String(row["대회"] || "").trim();
      const division = String(row["종목/부문"] || "").trim();
      const rank = Number(row["순위"]);
      const name = String(row["이름"] || "").trim();

      if (!competition || !division || !name || !rank || !validCompetitions.includes(competition)) {
        skipped.push(row);
        return;
      }

      parsed.push({
        competition,
        division,
        date: String(row["날짜"] || "").trim() || null,
        rank,
        name,
        note: String(row["비고"] || "").trim() || null,
      });
    });

    if (parsed.length === 0) {
      resultsUploadStatus.textContent = "유효한 행이 없습니다. 양식의 헤더(대회/종목·부문/날짜/순위/이름/비고)와 대회명을 확인해 주세요.";
      resultsUploadStatus.className = "form-status error";
      resultsUploadBtn.disabled = false;
      return;
    }

    const { error } = await supabase.from("results").insert(parsed);

    resultsUploadBtn.disabled = false;

    if (error) {
      resultsUploadStatus.textContent = "업로드 실패: " + error.message;
      resultsUploadStatus.className = "form-status error";
      return;
    }

    resultsUploadStatus.textContent =
      `${parsed.length}건 업로드 완료.` + (skipped.length ? ` (형식이 맞지 않아 ${skipped.length}건 건너뜀)` : "");
    resultsUploadStatus.className = "form-status success";
    resultsFileInput.value = "";
    loadResultsAdmin();
  } catch (err) {
    resultsUploadBtn.disabled = false;
    resultsUploadStatus.textContent = "파일을 읽는 중 오류가 발생했습니다: " + err.message;
    resultsUploadStatus.className = "form-status error";
  }
});

/* ============ 대회요강 관리 ============ */

const guidelinesRefreshBtn = document.getElementById("guidelinesRefreshBtn");
const gCountLabel = document.getElementById("gCountLabel");
const gListContainer = document.getElementById("gListContainer");
const gTitle = document.getElementById("gTitle");
const gFile = document.getElementById("gFile");
const gNote = document.getElementById("gNote");
const gUploadBtn = document.getElementById("gUploadBtn");
const gUploadStatus = document.getElementById("gUploadStatus");

guidelinesRefreshBtn.addEventListener("click", loadGuidelinesAdmin);

function renderGuidelinesAdminList(rows) {
  gCountLabel.textContent = `총 ${rows.length}건`;

  gListContainer.innerHTML = rows
    .map((g, idx) => {
      const date = new Date(g.created_at).toLocaleString("ko-KR");
      return `
        <div class="board-row">
          <div class="board-row-main">
            <strong>${g.title || g.file_name || "제목 없음"}</strong>
            ${g.note ? `<p class="board-row-note">${g.note}</p>` : ""}
            <p class="board-row-note">${date} · ${g.file_name || ""}</p>
          </div>
          <div class="board-row-side">
            <button type="button" class="btn btn-ghost" style="color:var(--ink); border-color:var(--line);" data-idx="${idx}" data-action="delete">삭제</button>
          </div>
        </div>`;
    })
    .join("");

  gListContainer.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = rows[Number(btn.dataset.idx)];
      if (!confirm(`"${row.title || row.file_name}" 문서를 삭제할까요?`)) return;

      await supabase.storage.from("guideline-files").remove([row.file_path]);
      const { error } = await supabase.from("guidelines").delete().eq("id", row.id);

      if (error) {
        alert("삭제 실패: " + error.message);
        return;
      }
      loadGuidelinesAdmin();
    });
  });
}

async function loadGuidelinesAdmin() {
  const { data, error } = await supabase
    .from("guidelines")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    gCountLabel.textContent = "불러오기 실패: " + error.message;
    return;
  }

  guidelinesLoaded = true;
  renderGuidelinesAdminList(data || []);
}

gUploadBtn.addEventListener("click", async () => {
  const title = gTitle.value.trim();
  const file = gFile.files[0];
  const note = gNote.value.trim();

  if (!title || !file) {
    gUploadStatus.textContent = "제목과 파일을 모두 입력해 주세요.";
    gUploadStatus.className = "form-status error";
    return;
  }

  gUploadBtn.disabled = true;
  gUploadStatus.textContent = "업로드 중…";
  gUploadStatus.className = "form-status";

  const filePath = `${Date.now()}_${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("guideline-files")
    .upload(filePath, file);

  if (uploadError) {
    gUploadBtn.disabled = false;
    gUploadStatus.textContent = "파일 업로드 실패: " + uploadError.message;
    gUploadStatus.className = "form-status error";
    return;
  }

  const { error } = await supabase.from("guidelines").insert([
    {
      title,
      note: note || null,
      file_path: filePath,
      file_name: file.name,
    },
  ]);

  gUploadBtn.disabled = false;

  if (error) {
    gUploadStatus.textContent = "등록 실패: " + error.message;
    gUploadStatus.className = "form-status error";
    return;
  }

  gUploadStatus.textContent = "업로드되었습니다.";
  gUploadStatus.className = "form-status success";
  gTitle.value = "";
  gNote.value = "";
  gFile.value = "";
  loadGuidelinesAdmin();
});

checkAuthAndRender();
