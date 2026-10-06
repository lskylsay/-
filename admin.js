// 관리자 페이지 로직 — GitHub 로그인(Supabase Auth) 후 본인 이메일이
// config.js 의 ADMIN_EMAIL 과 일치할 때만 신청 목록을 불러와 보여줍니다.
// 실제 데이터 접근 차단은 Supabase의 RLS 정책이 담당하므로,
// 이 파일의 이메일 체크는 화면 표시용 2차 확인입니다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { initDropzone } from "./dropzone.js";
import { safeStorageKey } from "./storage-key.js";

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
let sortMode = "date"; // "date" | "bib"

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

refreshBtn.addEventListener("click", loadRoster);

function renderSortRow() {
  const sortRow = document.getElementById("sortRow");
  sortRow.innerHTML = "";
  [
    { key: "date", label: "접수순" },
    { key: "bib", label: "배번순" },
  ].forEach(({ key, label }) => {
    const btn = document.createElement("button");
    btn.className = "filter-btn" + (key === sortMode ? " active" : "");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      sortMode = key;
      renderSortRow();
      renderTable();
    });
    sortRow.appendChild(btn);
  });
}

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

function extractBibNumber(r) {
  if (r.type !== "individual") return null;
  if (r.raw.bib_number != null) return Number(r.raw.bib_number);
  const m = (r.raw.members || "").match(/배번\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

function renderTable() {
  let rows =
    activeCompetition === "전체" ? allRows : allRows.filter((r) => r.competition === activeCompetition);

  rows = [...rows];
  if (sortMode === "bib") {
    rows.sort((a, b) => {
      const ba = extractBibNumber(a);
      const bb = extractBibNumber(b);
      if (ba == null && bb == null) return 0;
      if (ba == null) return 1;
      if (bb == null) return -1;
      return ba - bb;
    });
  }

  countLabel.textContent = `총 ${rows.length}건 (개인 ${rows.filter((r) => r.type === "individual").length}건 · 일괄 ${rows.filter((r) => r.type === "bulk").length}건)`;

  tableBody.innerHTML = rows
    .map((r, idx) => {
      const date = new Date(r.created_at).toLocaleString("ko-KR");
      const typeLabel = r.type === "bulk" ? "일괄" : "개인";
      const bibNumber = extractBibNumber(r);

      let detailCell;
      if (r.type === "bulk") {
        detailCell = `<button type="button" class="btn btn-outline roster-download-btn" data-idx="${idx}" style="font-size:0.78rem; padding:6px 12px;">${r.raw.file_name || "파일"} 다운로드</button>`;
      } else {
        detailCell = r.raw.members || "";
      }

      return `
        <tr>
          <td style="font-family:var(--font-mono); font-weight:700;">${bibNumber ?? ""}</td>
          <td>${date}</td>
          <td><span class="type-badge type-badge-${r.type}">${typeLabel}</span></td>
          <td>${r.competition || ""}</td>
          <td>${r.sport || ""}</td>
          <td>${r.school || ""}</td>
          <td>${r.contactName || ""}</td>
          <td>${r.contact || ""}</td>
          <td>${detailCell}</td>
          <td style="font-family:var(--font-mono); font-size:0.82rem; color:var(--ink-soft);">${r.ip_address || ""}</td>
          <td>${r.privacy_consent ? '<span class="type-badge type-badge-bulk">동의</span>' : '<span class="type-badge" style="background:#F3E3E1; color:var(--clay-dark);">미동의</span>'}</td>
          <td><button type="button" class="row-remove-btn roster-delete-btn" data-idx="${idx}" title="삭제">×</button></td>
        </tr>`;
    })
    .join("");

  tableBody.querySelectorAll(".roster-download-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = rows[Number(btn.dataset.idx)];
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = "링크 생성 중…";

      const { data, error } = await supabase.storage
        .from("bulk-uploads")
        .createSignedUrl(row.raw.file_path, 60);

      btn.disabled = false;
      btn.textContent = originalText;

      if (error || !data) {
        alert("다운로드 링크 생성에 실패했습니다: " + (error ? error.message : "알 수 없는 오류"));
        return;
      }
      window.open(data.signedUrl, "_blank");
    });
  });

  tableBody.querySelectorAll(".roster-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = rows[Number(btn.dataset.idx)];
      const label = row.contactName || row.school || "이 신청";
      if (!confirm(`"${label}" 건을 삭제할까요? 되돌릴 수 없습니다.`)) return;

      const tableName = row.type === "bulk" ? "bulk_applications" : "applications";
      if (row.type === "bulk" && row.raw.file_path) {
        await supabase.storage.from("bulk-uploads").remove([row.raw.file_path]);
      }
      const { data, error } = await supabase.from(tableName).delete().eq("id", row.raw.id).select();

      if (error) {
        alert("삭제 실패: " + error.message);
        return;
      }
      if (!data || data.length === 0) {
        alert("삭제되지 않았습니다. 관리자 권한(데이터베이스 삭제 정책)이 설정되어 있는지 확인이 필요합니다.");
        return;
      }
      loadRoster();
    });
  });
}

async function loadRoster() {
  countLabel.textContent = "불러오는 중…";

  const [individualRes, bulkRes] = await Promise.all([
    supabase.from("applications").select("*").order("created_at", { ascending: false }),
    supabase.from("bulk_applications").select("*").order("created_at", { ascending: false }),
  ]);

  if (individualRes.error || bulkRes.error) {
    countLabel.textContent = "불러오기 실패: " + (individualRes.error?.message || bulkRes.error?.message);
    return;
  }

  const individualNormalized = (individualRes.data || []).map((r) => ({
    type: "individual",
    id: "ind-" + r.id,
    created_at: r.created_at,
    competition: r.competition,
    sport: r.sport,
    school: r.class_no,
    contactName: r.leader_name,
    contact: r.contact,
    ip_address: r.ip_address,
    privacy_consent: r.privacy_consent,
    raw: r,
  }));

  const bulkNormalized = (bulkRes.data || []).map((r) => ({
    type: "bulk",
    id: "bulk-" + r.id,
    created_at: r.created_at,
    competition: r.competition,
    sport: r.sport,
    school: r.school,
    contactName: r.teacher_name,
    contact: r.teacher_contact,
    ip_address: r.ip_address,
    privacy_consent: r.privacy_consent,
    raw: r,
  }));

  allRows = [...individualNormalized, ...bulkNormalized].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );

  renderFilters();
  renderSortRow();
  renderTable();
}

/* ============ 취합된 신청자 명단 엑셀 일괄 등록 ============ */

const rosterUploadFile = document.getElementById("rosterUploadFile");
const rosterUploadBtn = document.getElementById("rosterUploadBtn");
const rosterUploadStatus = document.getElementById("rosterUploadStatus");
initDropzone(
  document.getElementById("rosterUploadDropzone"),
  rosterUploadFile,
  document.getElementById("rosterUploadFileName")
);

// 시트 이름 → 종목 자동 매핑 (일치하는 이름이 없으면 시트 이름을 그대로 종목으로 사용)
const SHEET_NAME_TO_SPORT = {
  "초등": "3km 마라톤 (초등학교 4·5·6학년 및 초등학교 교직원부)",
  "중등": "5km 마라톤 (중고등학생 및 중고등학교 교직원)",
};

function resolveSportFromSheetName(sheetName) {
  const trimmed = sheetName.trim();
  return SHEET_NAME_TO_SPORT[trimmed] || trimmed;
}

function parseRosterSheet(sheet) {
  const rows2D = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headerRowIdx = rows2D.findIndex((r) =>
    r.some((cell) => ["배번", "성명", "소속"].includes(String(cell).trim()))
  );
  if (headerRowIdx === -1) return { entries: [], skipped: 0, headerFound: false };

  const headers = rows2D[headerRowIdx].map((h) => String(h).trim());
  const dataRows2D = rows2D.slice(headerRowIdx + 1);

  const entries = [];
  let skipped = 0;

  dataRows2D.forEach((r) => {
    const row = {};
    headers.forEach((h, i) => {
      row[h] = r[i] !== undefined ? String(r[i]).trim() : "";
    });

    const name = row["성명"];
    if (!name) return;

    const school = row["소속"] || "";
    if (!school) {
      skipped++;
      return;
    }

    const grade = row["학년"] || "";
    const classNo = row["반"] || "";
    const gender = row["성별"] || "";
    const type = row["참가자 구분"] || row["참가자구분"] || "";
    const bib = row["배번"] || "";
    const bibColor = row["배번색"] || "";
    const startLoc = row["출발위치"] || "";

    const gradeDisplay = [grade && `${grade}학년`, classNo && `${classNo}반`].filter(Boolean).join(" ");
    const memberDetail = [gradeDisplay, gender, type, bibColor && `배번색 ${bibColor}`, startLoc]
      .filter(Boolean)
      .join(" · ");
    const bibNumber = bib && !isNaN(Number(bib)) ? Number(bib) : null;

    entries.push({ school, gradeDisplay, name, memberDetail, bibNumber });
  });

  return { entries, skipped, headerFound: true };
}

rosterUploadBtn.addEventListener("click", async () => {
  const file = rosterUploadFile.files[0];
  const competition = document.getElementById("rosterUploadCompetition").value;

  if (!file) {
    rosterUploadStatus.textContent = "업로드할 파일을 선택해 주세요.";
    rosterUploadStatus.className = "form-status error";
    return;
  }
  if (!competition) {
    rosterUploadStatus.textContent = "대회를 먼저 선택해 주세요.";
    rosterUploadStatus.className = "form-status error";
    return;
  }

  rosterUploadBtn.disabled = true;
  rosterUploadStatus.textContent = "읽는 중…";
  rosterUploadStatus.className = "form-status";

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });

    const parsed = [];
    let totalSkipped = 0;
    const sheetSummaries = [];

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const { entries, skipped, headerFound } = parseRosterSheet(sheet);
      if (!headerFound) return; // 표 형식이 아닌 시트는 조용히 건너뜀

      const sport = resolveSportFromSheetName(sheetName);
      entries.forEach((e) => {
        parsed.push({
          competition,
          sport,
          class_no: e.school,
          grade: e.gradeDisplay || null,
          leader_name: e.name,
          contact: null,
          members: e.memberDetail || null,
          note: null,
          bib_number: e.bibNumber,
        });
      });

      totalSkipped += skipped;
      if (entries.length > 0 || skipped > 0) {
        sheetSummaries.push(`${sheetName}(${sport}): ${entries.length}명`);
      }
    });

    if (parsed.length === 0) {
      rosterUploadStatus.textContent = "유효한 행이 없습니다. '배번/소속/성명' 등의 열 제목이 있는 시트인지 확인해 주세요.";
      rosterUploadStatus.className = "form-status error";
      rosterUploadBtn.disabled = false;
      return;
    }

    const { error } = await supabase.from("applications").insert(parsed);

    rosterUploadBtn.disabled = false;

    if (error) {
      rosterUploadStatus.textContent = "업로드 실패: " + error.message;
      rosterUploadStatus.className = "form-status error";
      return;
    }

    rosterUploadStatus.textContent =
      `총 ${parsed.length}명 등록 완료 [${sheetSummaries.join(", ")}]` +
      (totalSkipped ? ` (소속 누락 등으로 ${totalSkipped}건 건너뜀)` : "");
    rosterUploadStatus.className = "form-status success";
    rosterUploadFile.value = "";
    document.getElementById("rosterUploadFileName").textContent = "";
    document.getElementById("rosterUploadDropzone").classList.remove("has-file");
    loadRoster();
  } catch (err) {
    rosterUploadBtn.disabled = false;
    rosterUploadStatus.textContent = "파일을 읽는 중 오류가 발생했습니다: " + err.message;
    rosterUploadStatus.className = "form-status error";
  }
});

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
  loadRoster();
}

supabase.auth.onAuthStateChange(() => {
  checkAuthAndRender();
});

/* ============ 신청자명단관리 / 대회결과관리 / 대회요강관리 탭 전환 ============ */

const adminRosterTabBtn = document.getElementById("adminRosterTabBtn");
const adminResultsTabBtn = document.getElementById("adminResultsTabBtn");
const adminGuidelinesTabBtn = document.getElementById("adminGuidelinesTabBtn");
const adminSchoolpeTabBtn = document.getElementById("adminSchoolpeTabBtn");
const rosterAdminSection = document.getElementById("rosterAdminSection");
const resultsAdminSection = document.getElementById("resultsAdminSection");
const guidelinesAdminSection = document.getElementById("guidelinesAdminSection");
const schoolpeAdminSection = document.getElementById("schoolpeAdminSection");
const logoutBtn3 = document.getElementById("logoutBtn3");
const logoutBtn4 = document.getElementById("logoutBtn4");
const logoutBtn5 = document.getElementById("logoutBtn5");

let resultsLoaded = false;
let guidelinesLoaded = false;
let schoolpeLoaded = false;

function showAdminTab(tab) {
  adminRosterTabBtn.classList.toggle("active", tab === "roster");
  adminResultsTabBtn.classList.toggle("active", tab === "results");
  adminGuidelinesTabBtn.classList.toggle("active", tab === "guidelines");
  adminSchoolpeTabBtn.classList.toggle("active", tab === "schoolpe");
  rosterAdminSection.style.display = tab === "roster" ? "" : "none";
  resultsAdminSection.style.display = tab === "results" ? "" : "none";
  guidelinesAdminSection.style.display = tab === "guidelines" ? "" : "none";
  schoolpeAdminSection.style.display = tab === "schoolpe" ? "" : "none";

  if (tab === "results" && !resultsLoaded) loadResultsAdmin();
  if (tab === "guidelines" && !guidelinesLoaded) loadGuidelinesAdmin();
  if (tab === "schoolpe" && !schoolpeLoaded) loadSchoolpeAdmin();
}

adminRosterTabBtn.addEventListener("click", () => showAdminTab("roster"));
adminResultsTabBtn.addEventListener("click", () => showAdminTab("results"));
adminGuidelinesTabBtn.addEventListener("click", () => showAdminTab("guidelines"));
adminSchoolpeTabBtn.addEventListener("click", () => showAdminTab("schoolpe"));

logoutBtn3.addEventListener("click", doLogout);
logoutBtn4.addEventListener("click", doLogout);
logoutBtn5.addEventListener("click", doLogout);

/* ============ 대회 결과 관리 ============ */

const resultsRefreshBtn = document.getElementById("resultsRefreshBtn");
const resultsCountLabel = document.getElementById("resultsCountLabel");
const resultsTableBody = document.getElementById("resultsTableBody");
const resAddBtn = document.getElementById("resAddBtn");
const resAddStatus = document.getElementById("resAddStatus");
const resultsFileInput = document.getElementById("resultsFileInput");
const resultsFileName = document.getElementById("resultsFileName");
initDropzone(document.getElementById("resultsFileDropzone"), resultsFileInput, resultsFileName);
const resultsUploadBtn = document.getElementById("resultsUploadBtn");
const resultsUploadStatus = document.getElementById("resultsUploadStatus");

resultsRefreshBtn.addEventListener("click", loadResultsAdmin);

const resultsSelectAll = document.getElementById("resultsSelectAll");
const resultsDeleteSelectedBtn = document.getElementById("resultsDeleteSelectedBtn");
const resultsDeleteStatus = document.getElementById("resultsDeleteStatus");
let currentResults = []; // 지금 표에 보이는 결과 (삭제 확인 문구용)

// 이름 등 사용자가 입력한 글자를 HTML 로 해석하지 않고 그대로 보이게 함
function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// "12:12" / "1:12:12" → 초 (정렬용). 형식이 아니면 null
function recordToSeconds(t) {
  const m = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(String(t ?? "").trim());
  if (!m) return null;
  return m[3] !== undefined ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2];
}

// 같은 대회·종목 안에서 순위(없으면 뒤로) → 기록 빠른 순 → 이름 순. 대회·종목 순서는 그대로 둠
function sortWithinDivision(rows) {
  const cmp = (a, b) => {
    const ra = a.rank ?? Infinity, rb = b.rank ?? Infinity;
    if (ra !== rb) return ra < rb ? -1 : 1;
    const ta = recordToSeconds(a.record_time) ?? Infinity, tb = recordToSeconds(b.record_time) ?? Infinity;
    if (ta !== tb) return ta < tb ? -1 : 1;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""), "ko");
  };
  const out = [];
  let run = [];
  const flush = () => { run.sort(cmp); out.push(...run); run = []; };
  rows.forEach((r) => {
    if (run.length && (run[0].competition !== r.competition || run[0].division !== r.division)) flush();
    run.push(r);
  });
  flush();
  return out;
}

// 선택된 결과를 삭제하고, 실제로 지워진 id 를 돌려줌.
// RLS 로 삭제가 막히면 Supabase 는 오류 없이 0건만 지우므로 .select() 로 지워진 행을 확인함.
async function deleteResultsByIds(ids) {
  const deleted = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from("results").delete().in("id", ids.slice(i, i + 200)).select("id");
    if (error) return { deleted, error };
    deleted.push(...(data || []).map((r) => String(r.id)));
  }
  return { deleted, error: null };
}

function selectedResultIds() {
  return Array.from(resultsTableBody.querySelectorAll(".res-select:checked")).map((c) => c.dataset.id);
}

function updateResultsSelection() {
  const boxes = resultsTableBody.querySelectorAll(".res-select");
  const n = selectedResultIds().length;
  resultsSelectAll.disabled = boxes.length === 0;
  resultsSelectAll.checked = boxes.length > 0 && n === boxes.length;
  resultsSelectAll.indeterminate = n > 0 && n < boxes.length;
  resultsDeleteSelectedBtn.disabled = n === 0;
  resultsDeleteSelectedBtn.textContent = n > 0 ? `선택 삭제 (${n}건)` : "선택 삭제";
}

function showResultsDeleteStatus(text, ok) {
  resultsDeleteStatus.textContent = text;
  resultsDeleteStatus.className = "form-status " + (ok ? "success" : "error");
}

// 삭제 후 표를 다시 불러오고 결과 문구를 보여줌
async function finishResultsDelete(requested, deleted, error) {
  await loadResultsAdmin();
  if (error) showResultsDeleteStatus(`삭제 실패: ${error.message}` + (deleted.length ? ` (${deleted.length}건은 삭제됨)` : ""), false);
  else if (deleted.length < requested) showResultsDeleteStatus(`${requested}건 중 ${deleted.length}건만 삭제됐습니다. 삭제 권한(Supabase results 삭제 정책)을 확인해 주세요.`, false);
  else showResultsDeleteStatus(`${deleted.length}건을 삭제했습니다.`, true);
}

function renderResultsTable(rows) {
  currentResults = rows;
  resultsCountLabel.textContent = `총 ${rows.length}건`;
  resultsTableBody.innerHTML = rows
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(r.competition)}</td>
        <td>${escapeHtml(r.division)}</td>
        <td style="font-family:var(--font-mono); white-space:nowrap;">${escapeHtml(r.record_time)}</td>
        <td>${escapeHtml(r.date)}</td>
        <td class="rank">${escapeHtml(r.rank)}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.note)}</td>
        <td style="white-space:nowrap;">
          <input type="checkbox" class="res-select" data-id="${escapeHtml(r.id)}" aria-label="${escapeHtml(r.name)} 결과 선택" style="accent-color:var(--clay);">
          <button type="button" class="row-remove-btn" data-id="${escapeHtml(r.id)}" title="삭제">×</button>
        </td>
      </tr>`
    )
    .join("");

  resultsTableBody.querySelectorAll(".res-select").forEach((box) => box.addEventListener("change", updateResultsSelection));
  updateResultsSelection();

  resultsTableBody.querySelectorAll(".row-remove-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("이 결과를 삭제할까요?")) return;
      const { deleted, error } = await deleteResultsByIds([btn.dataset.id]);
      await finishResultsDelete(1, deleted, error);
    });
  });
}

resultsSelectAll.addEventListener("change", () => {
  resultsTableBody.querySelectorAll(".res-select").forEach((box) => { box.checked = resultsSelectAll.checked; });
  updateResultsSelection();
});

// 선택한 결과 한꺼번에 삭제
resultsDeleteSelectedBtn.addEventListener("click", async () => {
  const ids = selectedResultIds();
  if (ids.length === 0) return;

  // 어떤 대회·종목이 지워지는지 확인 문구에 요약
  const rowById = new Map(currentResults.map((r) => [String(r.id), r]));
  const groups = new Map();
  ids.forEach((id) => {
    const r = rowById.get(id);
    const key = r ? `${r.competition} · ${r.division}` : "(알 수 없음)";
    groups.set(key, (groups.get(key) || 0) + 1);
  });
  const lines = Array.from(groups).slice(0, 8).map(([k, n]) => `• ${k}: ${n}건`);
  if (groups.size > 8) lines.push(`• 그 밖의 ${groups.size - 8}개 종목…`);
  if (!confirm(`선택한 결과 ${ids.length}건을 삭제할까요?\n\n${lines.join("\n")}\n\n삭제하면 되돌릴 수 없습니다.`)) return;

  resultsDeleteSelectedBtn.disabled = true;
  showResultsDeleteStatus("삭제 중…", true);
  const { deleted, error } = await deleteResultsByIds(ids);
  await finishResultsDelete(ids.length, deleted, error);
});

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
  renderResultsTable(sortWithinDivision(data || []));
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

    const validCompetitions = ["트랙마라톤 축제", "충북교육감기 육상대회", "제43회 교육장기 육상경기대회"];
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
    resultsFileName.textContent = "";
    document.getElementById("resultsFileDropzone").classList.remove("has-file");
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
initDropzone(document.getElementById("gFileDropzone"), gFile, document.getElementById("gFileName"));
const gPreviewFile = document.getElementById("gPreviewFile");
initDropzone(document.getElementById("gPreviewDropzone"), gPreviewFile, document.getElementById("gPreviewFileName"));
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
            <p class="board-row-note">${date} · ${g.file_name || ""}${g.preview_path ? " · 미리보기 PDF 있음" : ""}</p>
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

      await supabase.storage
        .from("guideline-files")
        .remove([row.file_path, row.preview_path].filter(Boolean));
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
  const previewFile = gPreviewFile.files[0];
  const note = gNote.value.trim();

  if (!title || !file) {
    gUploadStatus.textContent = "제목과 파일을 모두 입력해 주세요.";
    gUploadStatus.className = "form-status error";
    return;
  }

  if (previewFile && !/\.pdf$/i.test(previewFile.name) && previewFile.type !== "application/pdf") {
    gUploadStatus.textContent = "미리보기 파일은 PDF만 올릴 수 있습니다.";
    gUploadStatus.className = "form-status error";
    return;
  }

  gUploadBtn.disabled = true;
  gUploadStatus.textContent = "업로드 중…";
  gUploadStatus.className = "form-status";

  const filePath = safeStorageKey(file);
  const { error: uploadError } = await supabase.storage
    .from("guideline-files")
    .upload(filePath, file);

  if (uploadError) {
    gUploadBtn.disabled = false;
    gUploadStatus.textContent = "파일 업로드 실패: " + uploadError.message;
    gUploadStatus.className = "form-status error";
    return;
  }

  // 미리보기용 PDF(선택)도 같은 버킷에 저장
  let previewPath = null;
  if (previewFile) {
    previewPath = safeStorageKey(previewFile);
    const { error: previewError } = await supabase.storage
      .from("guideline-files")
      .upload(previewPath, previewFile, { contentType: "application/pdf" });

    if (previewError) {
      await supabase.storage.from("guideline-files").remove([filePath]);
      gUploadBtn.disabled = false;
      gUploadStatus.textContent = "미리보기 PDF 업로드 실패: " + previewError.message;
      gUploadStatus.className = "form-status error";
      return;
    }
  }

  const row = {
    title,
    note: note || null,
    file_path: filePath,
    file_name: file.name,
  };
  if (previewPath) row.preview_path = previewPath;

  const { error } = await supabase.from("guidelines").insert([row]);

  gUploadBtn.disabled = false;

  if (error) {
    // 등록에 실패하면 방금 올린 파일은 지워 둠
    await supabase.storage.from("guideline-files").remove([filePath, previewPath].filter(Boolean));
    gUploadStatus.textContent = "등록 실패: " + error.message;
    gUploadStatus.className = "form-status error";
    return;
  }

  gUploadStatus.textContent = "업로드되었습니다.";
  gUploadStatus.className = "form-status success";
  gTitle.value = "";
  gNote.value = "";
  gFile.value = "";
  document.getElementById("gFileName").textContent = "";
  document.getElementById("gFileDropzone").classList.remove("has-file");
  gPreviewFile.value = "";
  document.getElementById("gPreviewFileName").textContent = "";
  document.getElementById("gPreviewDropzone").classList.remove("has-file");
  loadGuidelinesAdmin();
});

/* ============ 학교체육업무지원 관리 ============ */

const CATEGORY_LABELS = {
  plan: "가. 기본계획",
  notice: "나. 공지사항",
  club: "다. 학교스포츠클럽대회",
  youth: "라. 전국소년체육대회",
  national: "마. 전국체육대회",
};

const schoolpeRefreshBtn = document.getElementById("schoolpeRefreshBtn");
const spCategory = document.getElementById("spCategory");
const spTitle = document.getElementById("spTitle");
const spContent = document.getElementById("spContent");
const spFile = document.getElementById("spFile");
initDropzone(document.getElementById("spFileDropzone"), spFile, document.getElementById("spFileName"));
const spUploadBtn = document.getElementById("spUploadBtn");
const spUploadStatus = document.getElementById("spUploadStatus");
const spFilterRow = document.getElementById("spFilterRow");
const spCountLabel = document.getElementById("spCountLabel");
const spListContainer = document.getElementById("spListContainer");

let spAllRows = [];
let spActiveCategory = "전체";

schoolpeRefreshBtn.addEventListener("click", loadSchoolpeAdmin);

function renderSpFilters() {
  const cats = ["전체", ...Object.keys(CATEGORY_LABELS)];
  spFilterRow.innerHTML = "";
  cats.forEach((cat) => {
    const btn = document.createElement("button");
    btn.className = "filter-btn" + (cat === spActiveCategory ? " active" : "");
    btn.textContent = cat === "전체" ? "전체" : CATEGORY_LABELS[cat];
    btn.addEventListener("click", () => {
      spActiveCategory = cat;
      renderSpFilters();
      renderSpList();
    });
    spFilterRow.appendChild(btn);
  });
}

function renderSpList() {
  const rows = spActiveCategory === "전체" ? spAllRows : spAllRows.filter((r) => r.category === spActiveCategory);
  spCountLabel.textContent = `총 ${rows.length}건`;

  spListContainer.innerHTML = rows
    .map((r, idx) => {
      const date = new Date(r.created_at).toLocaleString("ko-KR");
      return `
        <div class="board-row">
          <div class="board-row-main">
            <strong>[${CATEGORY_LABELS[r.category] || r.category}] ${r.title || ""}</strong>
            ${r.content ? `<p class="board-row-note">${r.content}</p>` : ""}
            <p class="board-row-note">${date}${r.file_name ? " · " + r.file_name : ""}</p>
          </div>
          <div class="board-row-side">
            <button type="button" class="btn btn-ghost" style="color:var(--ink); border-color:var(--line);" data-idx="${idx}" data-action="delete">삭제</button>
          </div>
        </div>`;
    })
    .join("");

  spListContainer.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = rows[Number(btn.dataset.idx)];
      if (!confirm(`"${row.title}" 게시물을 삭제할까요?`)) return;

      if (row.file_path) {
        await supabase.storage.from("schoolpe-files").remove([row.file_path]);
      }
      const { error } = await supabase.from("school_pe_posts").delete().eq("id", row.id);

      if (error) {
        alert("삭제 실패: " + error.message);
        return;
      }
      loadSchoolpeAdmin();
    });
  });
}

async function loadSchoolpeAdmin() {
  const { data, error } = await supabase
    .from("school_pe_posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    spCountLabel.textContent = "불러오기 실패: " + error.message;
    return;
  }

  schoolpeLoaded = true;
  spAllRows = data || [];
  renderSpFilters();
  renderSpList();
}

spUploadBtn.addEventListener("click", async () => {
  const category = spCategory.value;
  const title = spTitle.value.trim();
  const content = spContent.value.trim();
  const file = spFile.files[0];

  if (!category || !title) {
    spUploadStatus.textContent = "게시판과 제목은 필수입니다.";
    spUploadStatus.className = "form-status error";
    return;
  }

  spUploadBtn.disabled = true;
  spUploadStatus.textContent = "등록 중…";
  spUploadStatus.className = "form-status";

  let filePath = null;
  let fileName = null;

  if (file) {
    filePath = safeStorageKey(file);
    fileName = file.name;
    const { error: uploadError } = await supabase.storage.from("schoolpe-files").upload(filePath, file);
    if (uploadError) {
      spUploadBtn.disabled = false;
      spUploadStatus.textContent = "파일 업로드 실패: " + uploadError.message;
      spUploadStatus.className = "form-status error";
      return;
    }
  }

  const { error } = await supabase.from("school_pe_posts").insert([
    {
      category,
      title,
      content: content || null,
      file_path: filePath,
      file_name: fileName,
    },
  ]);

  spUploadBtn.disabled = false;

  if (error) {
    spUploadStatus.textContent = "등록 실패: " + error.message;
    spUploadStatus.className = "form-status error";
    return;
  }

  spUploadStatus.textContent = "등록되었습니다.";
  spUploadStatus.className = "form-status success";
  spTitle.value = "";
  spContent.value = "";
  spFile.value = "";
  document.getElementById("spFileName").textContent = "";
  document.getElementById("spFileDropzone").classList.remove("has-file");
  spCategory.value = "";
  loadSchoolpeAdmin();
});

checkAuthAndRender();
