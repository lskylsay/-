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

/* ============ 개인 신청 / 교사 일괄 신청 탭 전환 ============ */

const adminIndividualTabBtn = document.getElementById("adminIndividualTabBtn");
const adminBulkTabBtn = document.getElementById("adminBulkTabBtn");
const individualAdminSection = document.getElementById("individualAdminSection");
const bulkAdminSection = document.getElementById("bulkAdminSection");
const logoutBtn2 = document.getElementById("logoutBtn2");
const bulkRefreshBtn = document.getElementById("bulkRefreshBtn");
const bulkCountLabel = document.getElementById("bulkCountLabel");
const bulkListContainer = document.getElementById("bulkListContainer");

let bulkLoaded = false;

adminIndividualTabBtn.addEventListener("click", () => {
  adminIndividualTabBtn.classList.add("active");
  adminBulkTabBtn.classList.remove("active");
  individualAdminSection.style.display = "";
  bulkAdminSection.style.display = "none";
});

adminBulkTabBtn.addEventListener("click", () => {
  adminBulkTabBtn.classList.add("active");
  adminIndividualTabBtn.classList.remove("active");
  individualAdminSection.style.display = "none";
  bulkAdminSection.style.display = "";
  if (!bulkLoaded) loadBulkApplications();
});

logoutBtn2.addEventListener("click", doLogout);
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

checkAuthAndRender();
