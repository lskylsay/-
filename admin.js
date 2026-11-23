// 관리자 페이지 로직 — GitHub 로그인(Supabase Auth) 후 본인 이메일이
// config.js 의 ADMIN_EMAIL 과 일치할 때만 신청 목록을 불러와 보여줍니다.
// 실제 데이터 접근 차단은 Supabase의 RLS 정책이 담당하므로,
// 이 파일의 이메일 체크는 화면 표시용 2차 확인입니다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { initDropzone } from "./dropzone.js";
import { safeStorageKey } from "./storage-key.js";
import { diagnose, levelOrder, LEVEL_NAME } from "./pathway-diag.js";

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
          <td style="white-space:nowrap;">${r.type === "bulk" ? "" : `<button type="button" class="btn btn-outline roster-edit-btn" data-idx="${idx}" style="font-size:0.78rem; padding:5px 10px; margin-right:6px;" title="이 학생의 종목·정보 수정">수정</button>`}<button type="button" class="row-remove-btn roster-delete-btn" data-idx="${idx}" title="삭제">×</button></td>
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

  tableBody.querySelectorAll(".roster-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => openStudentEditor(rows[Number(btn.dataset.idx)]));
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


/* ============ 학생 종목·정보 수정 (신청 명단의 [수정] 버튼) ============ */
// 같은 대회·학교·이름의 신청(종목마다 1건)을 한 창에서 고침: 종목 이름 수정, 종목 추가, 종목 삭제, 이름·학교·학년 수정
function openStudentEditor(row) {
  const base = row.raw;
  const siblings = allRows
    .filter((r) => r.type === "individual" && r.raw.competition === base.competition && r.raw.class_no === base.class_no && r.raw.leader_name === base.leader_name)
    .map((r) => r.raw)
    .sort((a, b) => a.id - b.id);
  const sportSuggestions = Array.from(new Set(allRows.filter((r) => r.type === "individual" && r.raw.competition === base.competition).map((r) => r.raw.sport).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let items = siblings.map((r) => ({ id: r.id, sport: r.sport || "", orig: r.sport || "", removed: false }));

  const m = document.createElement("div");
  m.className = "pdf-modal";
  m.innerHTML = `
    <div class="pdf-modal-box" role="dialog" aria-modal="true" style="height:auto; max-height:92vh; max-width:620px;">
      <div class="pdf-modal-head"><strong class="pdf-modal-title">학생 종목·정보 수정</strong>
        <div class="pdf-modal-actions"><button type="button" class="pdf-modal-close" data-act="close" aria-label="닫기">✕</button></div></div>
      <div style="padding:16px 22px; overflow:auto;">
        <p class="sub" style="margin:0 0 12px;">${esc(base.competition)} · 이 학생의 신청 ${siblings.length}건</p>
        <div class="form-row">
          <div class="field"><label>이름</label><input type="text" id="seName" value="${esc(base.leader_name)}"></div>
          <div class="field"><label>학교</label><input type="text" id="seSchool" value="${esc(base.class_no)}"></div>
          <div class="field"><label>학년</label><input type="text" id="seGrade" value="${esc(base.grade)}" placeholder="예: 4학년"></div>
        </div>
        <label class="field-label" style="margin-top:6px;">출전 종목</label>
        <p class="sub" style="margin:0 0 8px;">형식: <b>종목 부별</b> (예: 200m 남초4, 800m 남초4) · 계주는 <b>4x100mR 초등</b>처럼 급별로 적습니다.</p>
        <datalist id="seSportList">${sportSuggestions.map((v) => `<option value="${esc(v)}">`).join("")}</datalist>
        <div id="seItems"></div>
        <button type="button" class="btn btn-outline" data-act="add" style="margin-top:8px;">+ 종목 추가</button>
        <p id="seMsg" class="form-status" style="margin-top:10px;"></p>
      </div>
      <div style="padding:10px 22px 18px; display:flex; gap:10px; justify-content:flex-end;">
        <button type="button" class="btn btn-ghost" data-act="close" style="color:var(--ink); border-color:var(--line);">취소</button>
        <button type="button" class="btn btn-primary" data-act="save">저장</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  const $ = (sel) => m.querySelector(sel);
  const close = () => { m.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  const setMsg = (t, ok) => { const el = $("#seMsg"); el.textContent = t; el.className = "form-status " + (ok ? "success" : "error"); };

  function renderItems() {
    $("#seItems").innerHTML = items
      .map((it, i) => it.removed ? "" : `
        <div style="display:flex; gap:8px; margin-bottom:8px;">
          <input type="text" list="seSportList" data-i="${i}" value="${esc(it.sport)}" placeholder="종목 부별" style="flex:1; padding:10px 12px; border:1px solid ${it.id && it.sport !== it.orig ? "var(--clay)" : "var(--line)"}; border-radius:6px; font:inherit; background:#fff;">
          <button type="button" class="row-remove-btn" data-rm="${i}" title="이 종목 삭제">×</button>
        </div>`).join("") || '<p class="sub">출전 종목이 없습니다. [+ 종목 추가]로 넣어 주세요.</p>';
    m.querySelectorAll("[data-i]").forEach((inp) => inp.addEventListener("input", () => { items[Number(inp.dataset.i)].sport = inp.value; }));
    m.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => { items[Number(b.dataset.rm)].removed = true; renderItems(); }));
  }
  renderItems();

  m.addEventListener("click", async (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (e.target === m || act === "close") return close();
    if (act === "add") { items.push({ id: null, sport: "", orig: "", removed: false }); renderItems(); const ins = m.querySelectorAll("[data-i]"); ins[ins.length - 1]?.focus(); return; }
    if (act !== "save") return;

    const name = $("#seName").value.trim(), school = $("#seSchool").value.trim(), grade = $("#seGrade").value.trim();
    const active = items.filter((it) => !it.removed).map((it) => ({ ...it, sport: it.sport.trim().replace(/\s+/g, " ") }));
    if (!name || !school) return setMsg("이름과 학교는 비워 둘 수 없습니다.", false);
    if (active.some((it) => !it.sport)) return setMsg("비어 있는 종목 칸이 있습니다. 채우거나 × 로 지워 주세요.", false);
    if (new Set(active.map((it) => it.sport)).size !== active.length) return setMsg("같은 종목이 두 번 들어 있습니다.", false);
    const removed = items.filter((it) => it.removed && it.id);
    const infoChanged = name !== base.leader_name || school !== base.class_no || grade !== (base.grade || "");

    const saveBtn = $('[data-act="save"]');
    saveBtn.disabled = true;
    try {
      // 삭제할 종목에 이미 입력된 기록이 있으면 확인
      if (removed.length) {
        const { count } = await supabase.from("results").select("id", { count: "exact", head: true }).in("applications_id", removed.map((it) => it.id));
        if (count > 0 && !confirm(`삭제하는 종목 중 기록이 이미 입력된 것이 ${count}건 있습니다. 삭제하면 그 기록도 사라지거나 연결이 끊길 수 있습니다. 계속할까요?`)) { saveBtn.disabled = false; return; }
      }
      const failures = [];
      // 1) 기존 종목 수정 (종목 이름이 바뀌었거나 이름·학교·학년이 바뀐 경우)
      for (const it of active.filter((x) => x.id)) {
        if (it.sport === it.orig && !infoChanged) continue;
        const patch = { sport: it.sport, leader_name: name, class_no: school, grade: grade || null };
        const { data, error } = await supabase.from("applications").update(patch).eq("id", it.id).select("id");
        if (error || !data || !data.length) failures.push(`수정 실패: ${it.orig}${error ? " (" + error.message + ")" : " (권한 확인 필요)"}`);
      }
      // 2) 새 종목 추가 (이 학생의 기존 신청 정보를 복사)
      const adds = active.filter((x) => !x.id).map((it) => ({
        competition: base.competition, sport: it.sport, class_no: school, grade: grade || null, leader_name: name,
        contact: base.contact ?? null, members: base.members ?? null, note: base.note ?? null, bib_number: base.bib_number ?? null,
      }));
      if (adds.length) {
        const { data, error } = await supabase.from("applications").insert(adds).select("id");
        if (error || !data || data.length !== adds.length) failures.push("종목 추가 실패" + (error ? ": " + error.message : ""));
      }
      // 3) 지운 종목 삭제
      if (removed.length) {
        const { data, error } = await supabase.from("applications").delete().in("id", removed.map((it) => it.id)).select("id");
        if (error || !data || data.length !== removed.length) failures.push("종목 삭제 실패" + (error ? ": " + error.message : " (권한 확인 필요)"));
      }
      if (failures.length) { setMsg(failures.join(" / ") + " — 목록을 새로고침해 확인해 주세요.", false); saveBtn.disabled = false; loadRoster(); return; }
      close();
      loadRoster();
    } catch (err) {
      setMsg("저장 중 오류: " + (err.message || err), false);
      saveBtn.disabled = false;
    }
  });
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

// ---- 참가 및 수요조사표 형식(순·급별·학교명·학년·성명·첫번째/두번째·계주·성별 …) ----
// 육상대회 학교별 취합 파일(예: '각종 수요(버스, 숙박, 육상복)조사표' 시트)을 읽어
// 학생 1명이 출전하는 종목마다 신청 1건으로 만듭니다. 종목 이름은 "100m 남초5"(종목 + 부별)로 만들어
// 대회 현황 페이지에서 종목·부별로 나뉘어 보이게 합니다.
// 연락처·육상복 사이즈·버스·숙박 정보는 가져오지 않습니다(개인정보 최소화).
const SURVEY_SHEET_RE = /조사표|수요.*조사/;
const normText = (v) => String(v == null ? "" : v).replace(/[\s　]+/g, " ").trim();
const normHead = (v) => String(v == null ? "" : v).replace(/[\s　]+/g, "");

function parseSurveySheet(sheet) {
  const rows2D = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const hi = rows2D.findIndex((r) => {
    const h = r.map(normHead);
    return h.includes("학교명") && h.includes("성명") && (h.includes("급별") || h.includes("학년"));
  });
  if (hi === -1) return null;
  const head = rows2D[hi].map(normHead);
  const col = (re) => head.findIndex((h) => re.test(h));
  const c = {
    level: col(/^급별$/), school: col(/^학교명$/), grade: col(/^학년$/), name: col(/^성명$/), gender: col(/^성별/),
    events: head.map((h, i) => (/^(첫번째|두번째|참가종목)$/.test(h) ? i : -1)).filter((i) => i >= 0),
    relays: head.map((h, i) => {
      if (/4x100m?R?/i.test(h)) return { i, label: "4x100mR" };
      if (/4x400m?R?/i.test(h)) return { i, label: "4x400mR" };
      if (/mixed|혼성/i.test(h)) return { i, label: "혼성계주" };
      return null;
    }).filter(Boolean),
  };
  const isOn = (v) => { const t = normText(v).toUpperCase(); return t === "1" || t === "O" || t === "○" || t === "Y"; };
  const students = []; let skipped = 0;
  rows2D.slice(hi + 1).forEach((r) => {
    const no = normText(r[0]);
    if (/예시/.test(no) || /예시/.test(normText(r[c.school]))) return;
    const name = normText(r[c.name]);
    if (!name) return;
    const school = normText(r[c.school]);
    if (!school) { skipped++; return; }
    const level = c.level >= 0 ? normText(r[c.level]).charAt(0) : "";        // 초 / 중 / 고
    const gradeNum = c.grade >= 0 ? normText(r[c.grade]).replace(/학년$/, "") : "";
    const gender = c.gender >= 0 ? normText(r[c.gender]).charAt(0) : "";      // 남 / 여
    const bu = `${gender}${level}${gradeNum}`;                                // 부별: 남초5
    const events = c.events.map((i) => normText(r[i])).filter(Boolean);
    const relays = c.relays.filter((x) => isOn(r[x.i])).map((x) => x.label);
    students.push({ school, name, level, gradeNum, gender, bu, events, relays });
  });
  return { students, skipped };
}

function surveyToApplications(students, competition) {
  const out = [];
  students.forEach((s) => {
    const sports = [
      ...s.events.map((e) => (s.bu ? `${e} ${s.bu}` : e)),
      ...s.relays.map((l) => `${l} ${s.level === "초" ? "초등" : s.level === "중" ? "중등" : s.level === "고" ? "고등" : ""}`.trim()),
    ];
    if (!sports.length) sports.push("종목 미기재");
    sports.forEach((sport) => out.push({
      competition, sport, class_no: s.school,
      grade: s.gradeNum ? `${s.gradeNum}학년` : null,
      leader_name: s.name, contact: null,
      members: [s.gradeNum && `${s.gradeNum}학년`, s.gender, s.bu].filter(Boolean).join(" · ") || null,
      note: null, bib_number: null,
    }));
  });
  return out;
}

// 같은 대회에 신청이 이미 있을 때: 교체(기존 삭제 후 새로 등록) / 추가 / 취소 선택창
function askUploadMode({ competition, existing, incoming, recorded }) {
  return new Promise((resolve) => {
    const m = document.createElement("div");
    m.className = "pdf-modal";
    m.innerHTML = `
      <div class="pdf-modal-box" role="dialog" aria-modal="true" style="height:auto; max-width:560px;">
        <div class="pdf-modal-head"><strong class="pdf-modal-title">이미 등록된 신청이 있습니다</strong></div>
        <div style="padding:18px 22px 6px; line-height:1.7;">
          <p style="margin:0 0 14px;"><b>${competition}</b>에 <b>${existing}건</b>이 등록되어 있습니다. 이번 파일(<b>${incoming}건</b>)을 어떻게 등록할까요?</p>
          <button type="button" class="btn btn-primary" data-mode="replace" style="display:block; width:100%; margin-bottom:6px;">기존 ${existing}건 삭제 후 새 파일로 교체</button>
          <p class="sub" style="margin:0 0 14px;">같은 파일을 고쳐서 다시 올릴 때 알맞습니다. 새 파일을 먼저 등록한 뒤 이전 신청을 지웁니다.</p>
          <button type="button" class="btn btn-outline" data-mode="add" style="display:block; width:100%; margin-bottom:6px;">기존 자료는 두고 이번 파일 추가</button>
          <p class="sub" style="margin:0 0 6px;">다른 학교 명단을 이어서 올릴 때 알맞습니다. 같은 파일을 다시 올리면 중복됩니다.</p>
          ${recorded ? `<p style="margin:10px 0 0; color:var(--clay); font-size:0.9rem;">⚠ 이 대회에는 이미 입력된 기록이 ${recorded}건 있습니다. 교체하면 지워진 신청에 연결된 기록은 사라지거나 연결이 끊길 수 있습니다.</p>` : ""}
        </div>
        <div style="padding:10px 22px 18px; text-align:right;"><button type="button" class="btn btn-ghost" data-mode="cancel" style="color:var(--ink); border-color:var(--line);">취소</button></div>
      </div>`;
    const done = (v) => { m.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape") done("cancel"); };
    document.addEventListener("keydown", onKey);
    m.addEventListener("click", (e) => {
      const b = e.target.closest("[data-mode]");
      if (b) {
        if (b.dataset.mode === "replace" && !confirm(`정말 기존 ${existing}건을 삭제하고 새 파일로 교체할까요?\n삭제한 신청은 되돌릴 수 없습니다.`)) return;
        done(b.dataset.mode);
      } else if (e.target === m) done("cancel");
    });
    document.body.appendChild(m);
  });
}

// 동의서 보관 확인을 체크하기 전에는 업로드할 수 없음
const rosterConsent = document.getElementById("rosterConsent");
rosterConsent.addEventListener("change", () => { rosterUploadBtn.disabled = !rosterConsent.checked; });

rosterUploadBtn.addEventListener("click", async () => {
  if (!rosterConsent.checked) {
    rosterUploadStatus.textContent = "학생(보호자) 동의서를 받아 학교에 보관하고 있음을 체크해 주세요.";
    rosterUploadStatus.className = "form-status error";
    return;
  }
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

    // 참가·수요조사표 형식 시트가 있으면 그 시트만 읽음(같은 파일의 시간표·명단 시트와 중복 등록 방지)
    const surveySheets = workbook.SheetNames.filter((n) => SURVEY_SHEET_RE.test(n));
    let surveyMode = false;
    surveySheets.forEach((sheetName) => {
      const r = parseSurveySheet(workbook.Sheets[sheetName]);
      if (!r) return;
      surveyMode = true;
      const apps = surveyToApplications(r.students, competition);
      parsed.push(...apps);
      totalSkipped += r.skipped;
      sheetSummaries.push(`${sheetName}: 학생 ${r.students.length}명 → 종목별 ${apps.length}건`);
    });

    if (!surveyMode) workbook.SheetNames.forEach((sheetName) => {
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
      rosterUploadStatus.textContent = surveyMode
        ? "등록할 신청자가 없습니다. 조사표에 학생 이름이 입력된 행이 있는지 확인해 주세요. ((예시) 행은 제외됩니다)"
        : "유효한 행이 없습니다. '배번/소속/성명' 또는 '학교명/성명/급별' 등의 열 제목이 있는 시트인지 확인해 주세요.";
      rosterUploadStatus.className = "form-status error";
      rosterUploadBtn.disabled = !rosterConsent.checked;
      return;
    }

    // 같은 대회에 이미 등록된 신청이 있으면 "교체(기존 삭제 후 새로 등록)" / "추가" / 취소 중에서 고르게 함
    const { count: existing } = await supabase.from("applications").select("id", { count: "exact", head: true }).eq("competition", competition);
    let mode = "add";
    let oldIds = [];
    if (existing > 0) {
      const { count: recorded } = await supabase.from("results").select("id", { count: "exact", head: true }).eq("competition", competition);
      mode = await askUploadMode({ competition, existing, incoming: parsed.length, recorded: recorded || 0 });
      if (mode === "cancel") {
        rosterUploadStatus.textContent = "등록을 취소했습니다.";
        rosterUploadStatus.className = "form-status";
        rosterUploadBtn.disabled = !rosterConsent.checked;
        return;
      }
      if (mode === "replace") {
        // 새 파일을 먼저 등록한 뒤 옛 신청만 지움 (등록이 실패하면 기존 자료는 그대로 남음)
        for (let from = 0; ; from += 1000) {
          const { data: part, error: idErr } = await supabase.from("applications").select("id").eq("competition", competition).range(from, from + 999);
          if (idErr) throw idErr;
          oldIds.push(...part.map((r) => r.id));
          if (part.length < 1000) break;
        }
      }
    }

    rosterUploadStatus.textContent = "등록 중…";
    const { error } = await supabase.from("applications").insert(parsed);

    if (error) {
      rosterUploadBtn.disabled = !rosterConsent.checked;
      rosterUploadStatus.textContent = "업로드 실패: " + error.message + (mode === "replace" ? " (기존 자료는 그대로 남아 있습니다)" : "");
      rosterUploadStatus.className = "form-status error";
      return;
    }

    let replaceNote = "";
    if (mode === "replace" && oldIds.length) {
      let deleted = 0;
      let delErr = null;
      for (let i = 0; i < oldIds.length; i += 200) {
        const chunk = oldIds.slice(i, i + 200);
        const { data: gone, error: e2 } = await supabase.from("applications").delete().in("id", chunk).select("id");
        if (e2) { delErr = e2; break; }
        deleted += (gone || []).length;
      }
      if (delErr || deleted < oldIds.length) {
        replaceNote = ` ⚠ 기존 ${oldIds.length}건 중 ${deleted}건만 삭제되었습니다${delErr ? " (" + delErr.message + ")" : " (삭제 권한 확인 필요)"}. 목록에서 중복된 이전 자료를 확인해 주세요.`;
      } else {
        replaceNote = ` (기존 ${deleted}건은 삭제하고 새 파일로 교체했습니다)`;
      }
    }

    rosterUploadBtn.disabled = !rosterConsent.checked;

    rosterUploadStatus.textContent =
      `총 ${parsed.length}명 등록 완료 [${sheetSummaries.join(", ")}]` +
      (totalSkipped ? ` (소속 누락 등으로 ${totalSkipped}건 건너뜀)` : "") + replaceNote;
    rosterUploadStatus.className = "form-status success";
    rosterUploadFile.value = "";
    document.getElementById("rosterUploadFileName").textContent = "";
    document.getElementById("rosterUploadDropzone").classList.remove("has-file");
    loadRoster();
  } catch (err) {
    rosterUploadBtn.disabled = !rosterConsent.checked;
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
const adminTeamsTabBtn = document.getElementById("adminTeamsTabBtn");
const adminActivityTabBtn = document.getElementById("adminActivityTabBtn");
const adminPolicyTabBtn = document.getElementById("adminPolicyTabBtn");
const adminContestGroupBtn = document.getElementById("adminContestGroupBtn");
const adminContestSubRow = document.getElementById("adminContestSubRow");
let lastContestTab = "roster";
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
// 선택 3·4·5 관리 탭은 학교체육업무지원 관리 화면을 카테고리 하나로 고정해서 씁니다.
const SP_SINGLE_TABS = ["teams", "activity", "policy"];

function showAdminTab(tab) {
  const isContestTab = ["roster", "results", "guidelines"].includes(tab);
  if (isContestTab) lastContestTab = tab;
  adminContestGroupBtn.classList.toggle("active", isContestTab);
  adminContestSubRow.style.display = isContestTab ? "" : "none";
  adminRosterTabBtn.classList.toggle("active", tab === "roster");
  adminResultsTabBtn.classList.toggle("active", tab === "results");
  adminGuidelinesTabBtn.classList.toggle("active", tab === "guidelines");
  adminSchoolpeTabBtn.classList.toggle("active", tab === "schoolpe");
  adminTeamsTabBtn.classList.toggle("active", tab === "teams");
  adminActivityTabBtn.classList.toggle("active", tab === "activity");
  adminPolicyTabBtn.classList.toggle("active", tab === "policy");
  rosterAdminSection.style.display = tab === "roster" ? "" : "none";
  resultsAdminSection.style.display = tab === "results" ? "" : "none";
  guidelinesAdminSection.style.display = tab === "guidelines" ? "" : "none";
  const isBoardTab = tab === "schoolpe" || SP_SINGLE_TABS.includes(tab);
  schoolpeAdminSection.style.display = isBoardTab ? "" : "none";

  if (tab === "results" && !resultsLoaded) loadResultsAdmin();
  if (tab === "guidelines" && !guidelinesLoaded) loadGuidelinesAdmin();
  if (isBoardTab) {
    setSpMode(tab === "schoolpe" ? null : tab);
    if (!schoolpeLoaded) loadSchoolpeAdmin();
  }
}

adminContestGroupBtn.addEventListener("click", () => showAdminTab(lastContestTab));
adminRosterTabBtn.addEventListener("click", () => showAdminTab("roster"));
adminResultsTabBtn.addEventListener("click", () => showAdminTab("results"));
adminGuidelinesTabBtn.addEventListener("click", () => showAdminTab("guidelines"));
adminSchoolpeTabBtn.addEventListener("click", () => showAdminTab("schoolpe"));
adminTeamsTabBtn.addEventListener("click", () => showAdminTab("teams"));
adminActivityTabBtn.addEventListener("click", () => showAdminTab("activity"));
adminPolicyTabBtn.addEventListener("click", () => showAdminTab("policy"));

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

// 대회 → 종목/부문 → 배번 오름차순 (배번 없는 행은 같은 종목 맨 뒤, 그다음 이름 순)
function sortResults(rows) {
  const ko = (a, b) => String(a ?? "").localeCompare(String(b ?? ""), "ko");
  const bn = (r) => (r.bib == null || r.bib === "" || isNaN(Number(r.bib)) ? Infinity : Number(r.bib));
  return rows.slice().sort((a, b) => {
    const c = ko(a.competition, b.competition) || ko(a.division, b.division);
    if (c) return c;
    const ba = bn(a), bb = bn(b);
    if (ba !== bb) return ba < bb ? -1 : 1;
    return ko(a.name, b.name);
  });
}

// 결과 행의 applications_id 로 신청자의 배번·학교를 한꺼번에 불러와 bib·school 로 붙임
async function attachApplicationInfo(rows) {
  const ids = Array.from(new Set(rows.map((r) => r.applications_id).filter((v) => v != null && v !== "")));
  const info = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from("applications").select("id, bib_number, class_no, members").in("id", ids.slice(i, i + 200));
    if (error) throw error;
    (data || []).forEach((a) => info.set(String(a.id), a));
  }
  return rows.map((r) => {
    const a = info.get(String(r.applications_id));
    // 배번 칸이 비어 있으면 신청 시 적힌 'members' 글자("… · 배번 287(핑크) · …")에서 읽음 ('배번색 노랑'은 번호가 아니므로 제외)
    const fromMembers = a && /배번\s*(\d+)/.exec(a.members || "");
    const bib = a && a.bib_number != null && a.bib_number !== "" ? a.bib_number : fromMembers ? Number(fromMembers[1]) : null;
    return { ...r, bib, school: (a && a.class_no) || "" };
  });
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
  // 체크가 생기면 내려받기 범위를 '체크한 기록만'으로, 체크가 없어지면 '대회 전체'로
  if (n > 0 && lastSelectedCount === 0) exportScope.value = "selected";
  else if (n === 0 && exportScope.value === "selected") exportScope.value = "all";
  lastSelectedCount = n;
  resultsSelectedLabel.textContent = n > 0 ? `${n}건 선택됨` : "";
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
        <td style="white-space:nowrap;">${r.bib == null ? "-" : escapeHtml(r.bib)}</td>
        <td>${escapeHtml(r.school)}</td>
        <td>${escapeHtml(r.name)}</td>
        <td style="font-family:var(--font-mono); white-space:nowrap;">${escapeHtml(r.record_time)}</td>
        <td>${escapeHtml(r.date)}</td>
        <td class="rank">${escapeHtml(r.rank)}</td>
        <td>${escapeHtml(r.note)}</td>
        <td style="white-space:nowrap;">
          <input type="checkbox" class="res-select" data-id="${escapeHtml(r.id)}" aria-label="${escapeHtml(r.name)} 결과 선택" style="accent-color:var(--clay);">
          <button type="button" class="row-remove-btn" data-id="${escapeHtml(r.id)}" title="삭제">×</button>
        </td>
      </tr>`
    )
    .join("");

  resultsTableBody.querySelectorAll(".res-select").forEach((box) => box.addEventListener("change", updateResultsSelection));
  fillExportScope(rows);
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

/* ---- 결과 내려받기 (엑셀 / 한글) ---- */
const exportScope = document.getElementById("resultsExportScope");
const resultsSelectedLabel = document.getElementById("resultsSelectedLabel");
const resultsExportStatus = document.getElementById("resultsExportStatus");
let lastSelectedCount = 0;

// 범위 선택 칸: 대회 전체 + 대회별 + 체크한 기록만
function fillExportScope(rows) {
  const prev = exportScope.value;
  const comps = Array.from(new Set(rows.map((r) => r.competition).filter(Boolean)));
  exportScope.innerHTML =
    `<option value="all">대회 전체</option>` +
    comps.map((c) => `<option value="comp:${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("") +
    `<option value="selected">체크한 기록만</option>`;
  exportScope.value = Array.from(exportScope.options).some((o) => o.value === prev) ? prev : "all";
}

function showExportStatus(text, ok) {
  resultsExportStatus.textContent = text;
  resultsExportStatus.className = "form-status " + (ok ? "success" : "error");
}

// 고른 범위의 결과(표와 같은 순서)와 파일 이름에 쓸 말
function exportSelection() {
  const v = exportScope.value;
  if (v === "selected") {
    const ids = new Set(selectedResultIds());
    return { rows: currentResults.filter((r) => ids.has(String(r.id))), label: "선택" };
  }
  if (v.startsWith("comp:")) {
    const c = v.slice(5);
    return { rows: currentResults.filter((r) => r.competition === c), label: c };
  }
  return { rows: currentResults, label: "전체" };
}

function exportFileName(label, ext) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `대회결과_${label}_${ymd}.${ext}`.replace(/[\\/:*?"<>|]+/g, " ");
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 엑셀 시트 이름: []:*?/\ 제거, 31자 이내, 겹치면 번호 붙임
function sheetName(raw, used) {
  let base = String(raw || "시트").replace(/[\[\]:*?/\\]/g, "").trim().slice(0, 31) || "시트";
  let name = base, n = 2;
  while (used.has(name)) {
    const suffix = ` (${n++})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name);
  return name;
}

function exportXlsx(rows, label) {
  const head = ["순번", "대회", "종목/부문", "배번", "학교", "이름", "기록", "순위", "날짜", "비고"];
  const toAoa = (list) => [
    head,
    ...list.map((r, i) => [
      i + 1,
      r.competition ?? "",
      r.division ?? "",
      r.bib == null ? "-" : isNaN(Number(r.bib)) ? String(r.bib) : Number(r.bib),
      r.school ?? "",
      r.name ?? "",
      String(r.record_time ?? ""), // '13:48' 글자 그대로
      r.rank == null ? "" : r.rank,
      r.date ?? "",
      r.note ?? "",
    ]),
  ];
  const widthOf = (v) => Array.from(String(v ?? "")).reduce((s, c) => s + (c.charCodeAt(0) > 255 ? 2 : 1), 0);
  const addSheet = (wb, name, aoa) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = head.map((_, c) => ({ wch: Math.min(40, Math.max(6, ...aoa.map((row) => widthOf(row[c]))) + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  const wb = XLSX.utils.book_new();
  const used = new Set();
  addSheet(wb, sheetName("전체", used), toAoa(rows));
  const byDivision = new Map();
  rows.forEach((r) => {
    const k = r.division ?? "";
    if (!byDivision.has(k)) byDivision.set(k, []);
    byDivision.get(k).push(r);
  });
  byDivision.forEach((list, k) => addSheet(wb, sheetName(k, used), toAoa(list)));
  XLSX.writeFile(wb, exportFileName(label, "xlsx"));
}

document.getElementById("resultsExportXlsxBtn").addEventListener("click", () => {
  const { rows, label } = exportSelection();
  if (!rows.length) return showExportStatus("내려받을 기록이 없습니다", false);
  try {
    exportXlsx(rows, label);
    showExportStatus(`${rows.length}건을 엑셀로 내려받았습니다.`, true);
  } catch (e) {
    showExportStatus("엑셀 만들기 실패: " + e.message, false);
  }
});

document.getElementById("resultsExportHwpxBtn").addEventListener("click", async () => {
  const { rows, label } = exportSelection();
  if (!rows.length) return showExportStatus("내려받을 기록이 없습니다", false);
  if (!window.HwpxDocs || !window.JSZip) return showExportStatus("한글 파일 도구를 불러오지 못했습니다. 새로고침해 주세요.", false);
  showExportStatus("한글 파일 만드는 중…", true);
  try {
    const { blob } = await window.HwpxDocs.buildResults(rows, { today: new Date() });
    downloadBlob(blob, exportFileName(label, "hwpx"));
    showExportStatus(`${rows.length}건을 한글 파일로 내려받았습니다.`, true);
  } catch (e) {
    showExportStatus("한글 파일 만들기 실패: " + e.message, false);
  }
});

async function loadResultsAdmin() {
  const { data, error } = await supabase
    .from("results")
    .select("*")
    .order("competition", { ascending: true })
    .order("division", { ascending: true });

  if (error) {
    resultsCountLabel.textContent = "불러오기 실패: " + error.message;
    return;
  }

  let rows = data || [];
  try {
    rows = await attachApplicationInfo(rows);
  } catch (e) {
    // 배번·학교를 못 불러와도 결과 표는 보여줌
    rows = rows.map((r) => ({ ...r, bib: null, school: "" }));
    showResultsDeleteStatus("배번·학교를 불러오지 못했습니다: " + e.message, false);
  }
  resultsLoaded = true;
  renderResultsTable(sortResults(rows));
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
  teams: "학교운동부 운영 현황",
  activity: "학교체육활성화 현황",
  policy: "학교체육 정책 현황",
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
let spMode = null; // null = 기존 5개 게시판, 그 외 = 해당 카테고리 하나만

// 종목 아래 학교별 팀 (teams.html의 window.SCHOOLPE_SUBS와 같게 유지)
const TEAM_SCHOOLS = { "롤러(빙상)": ["동명초", "제천중", "제천여중", "제천고", "제천여고"] };

function spCategoryKeys() {
  return spMode ? [spMode] : Object.keys(CATEGORY_LABELS).filter((k) => !SP_SINGLE_TABS.includes(k));
}

function setSpMode(mode) {
  spMode = mode;
  spActiveCategory = "전체";
  const keys = spCategoryKeys();
  spCategory.innerHTML = (mode ? "" : '<option value="">선택</option>') +
    keys.map((k) => `<option value="${k}">${CATEGORY_LABELS[k]}</option>`).join("");
  spCategory.value = mode || "";
  spCategory.disabled = !!mode;
  document.getElementById("spFormTitle").textContent = mode ? `${CATEGORY_LABELS[mode]} — 새 자료 등록` : "새 게시물 등록";
  spFilterRow.style.display = mode ? "none" : "";
  document.getElementById("spSportField").style.display = mode === "teams" ? "" : "none";
  document.getElementById("spSampleLink").style.display = "none";   // 샘플 다운로드는 조사표 영역으로 이동
  document.getElementById("teamsSurveySection").style.display = mode === "teams" ? "" : "none";
  document.getElementById("awardsSection").style.display = mode === "teams" ? "" : "none";
  document.getElementById("teamsGeoSection").style.display = mode === "teams" ? "" : "none";
  if (mode === "teams") { tsLoadList(); axLoadAll(); geoInit(); }
  document.getElementById("spSampleNote").style.display = mode === "teams" ? "" : "none";   // 학교운동부 운영 현황은 종목별 탭으로 나뉨
  if (schoolpeLoaded) { renderSpFilters(); renderSpList(); }
}

schoolpeRefreshBtn.addEventListener("click", loadSchoolpeAdmin);

// 종목을 고르면 그 종목의 학교(팀) 선택이 나타남 (학교별 하위 항목이 있는 종목만)
document.getElementById("spSport").addEventListener("change", (e) => {
  const schools = TEAM_SCHOOLS[e.target.value] || [];
  const sel = document.getElementById("spSchool");
  sel.innerHTML = '<option value="">(종목 공통)</option>' + schools.map((s) => `<option value="${s}">${s}</option>`).join("");
  document.getElementById("spSchoolField").style.display = schools.length ? "" : "none";
});

function renderSpFilters() {
  const cats = ["전체", ...spCategoryKeys()];
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
  const allowed = spCategoryKeys();
  const scoped = spAllRows.filter((r) => allowed.includes(r.category));
  const rows = spActiveCategory === "전체" ? scoped : scoped.filter((r) => r.category === spActiveCategory);
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
  // 학교운동부 운영 현황: 종목을 골라야 하고, 제목 앞에 [종목]을 붙여 종목 탭에 모이게 함
  const sportSel = document.getElementById("spSport");
  const teamSport = category === "teams" ? sportSel.value : "";
  const teamSchool = teamSport ? document.getElementById("spSchool").value : "";
  if (category === "teams" && !teamSport) {
    spUploadStatus.textContent = "종목을 선택해 주세요.";
    spUploadStatus.className = "form-status error";
    return;
  }
  const fullTitle = teamSport ? `[${teamSport}${teamSchool ? "·" + teamSchool : ""}] ${title}` : title;

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
      title: fullTitle,
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
  spCategory.value = spMode || "";
  document.getElementById("spSport").value = "";
  document.getElementById("spSchoolField").style.display = "none";
  loadSchoolpeAdmin();
});

// ================= 운동부 현황 조사표 업로드 (선택3) =================
// 테이블: sport_teams / sport_staff / sport_athletes (관리자 전용 RLS). 학년도는 파일이 아니라 화면 입력값을 씀.
const tsYearEl = document.getElementById("tsYear");
const tsFile = document.getElementById("tsFile");
const tsStatus = document.getElementById("tsStatus");
const tsPreviewEl = document.getElementById("tsPreview");
const tsSaveBtn = document.getElementById("tsSaveBtn");
initDropzone(document.getElementById("tsDropzone"), tsFile, document.getElementById("tsFileName"));

let tsParsed = null;
const tsNorm = (v) => String(v ?? "").replace(/[\s ]+/g, "");
const tsText = (v) => String(v ?? "").trim();
const tsEsc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const TS_EXAMPLE_MARK = /[○△◇]/;

function tsSetStatus(msg, kind) { tsStatus.textContent = msg; tsStatus.className = "form-status" + (kind ? " " + kind : ""); }
function tsNum(v, label) {
  const t = tsText(v);
  if (t === "") return null;
  const n = Number(t.replace(/[,년명]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`${label}이(가) 숫자가 아닙니다 (${t})`);
  return n;
}
function tsLevel(raw, school) {
  const t = tsText(raw) || school;
  const m = t.match(/초|중|고/);
  if (tsText(raw)) return m ? m[0] : tsText(raw);
  const e = school.match(/(초|중|고)(등학교|학교)?$/);
  return e ? e[1] : null;
}

// 시트 하나 읽기: 머리글 행을 이름으로 찾고(공백·줄바꿈 제거 후 비교) 그 아래 행부터 읽음
// cols: [필드, 머리글 조각] — 조각이 ^로 시작하면 "그걸로 시작", 아니면 "포함". 한 열은 한 필드에만 연결
function tsReadSheet(wb, nameKey, cols, required, build, out, sheetLabel) {
  const sn = wb.SheetNames.find((n) => tsNorm(n).includes(nameKey));
  if (!sn) { out.errors.push({ sheet: sheetLabel, row: "-", reason: "시트를 찾을 수 없습니다" }); return []; }
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: "" });
  const test = (cell, key) => (key.startsWith("^") ? cell.startsWith(key.slice(1)) : cell.includes(key));
  let hIdx = -1;
  for (let i = 0; i < Math.min(aoa.length, 20); i++) {
    const cells = aoa[i].map(tsNorm);
    if (required.every((k) => cells.some((c) => test(c, k)))) { hIdx = i; break; }
  }
  if (hIdx < 0) { out.errors.push({ sheet: sheetLabel, row: "-", reason: "머리글 행을 찾지 못했습니다 (" + required.join("·") + ")" }); return []; }
  const heads = aoa[hIdx].map(tsNorm);
  const used = new Set(); const col = {};
  cols.forEach(([f, key]) => { const i = heads.findIndex((c, ix) => !used.has(ix) && c && test(c, key)); if (i >= 0) { col[f] = i; used.add(i); } });
  const rows = [];
  for (let r = hIdx + 1; r < aoa.length; r++) {
    const line = aoa[r];
    const g = (f) => (col[f] == null ? "" : tsText(line[col[f]]));
    const sport = g("sport"), school = g("school");
    const rowNo = r + 1;
    if (!sport && !school) continue;                       // 빈 행
    if (g("note") === "예시" || TS_EXAMPLE_MARK.test(school)) { out.skippedExamples++; continue; }
    if (!sport || !school) { out.errors.push({ sheet: sheetLabel, row: rowNo, reason: !sport ? "종목이 비어 있습니다" : "학교명이 비어 있습니다" }); continue; }
    try { rows.push(build(g, line, col, { sport, school })); }
    catch (e) { out.errors.push({ sheet: sheetLabel, row: rowNo, reason: e.message }); }
  }
  return rows;
}

function parseTeamsSurvey(wb, year) {
  const out = { year, teams: [], staff: [], athletes: [], errors: [], warnings: [], skippedExamples: 0 };
  const seen = new Set();
  const teamRows = tsReadSheet(wb, "운동부현황",
    [["sport", "^종목"], ["kind", "^구분"], ["school", "^학교명"], ["level", "^학교급"], ["team_name", "운동부명칭"], ["founded", "창단"],
     ["m", "선수수(남)"], ["f", "선수수(여)"], ["place", "훈련장소"], ["gold", "예상금메달"], ["silver", "예상은메달"], ["bronze", "예상동메달"],
     ["exp_note", "실적설명"], ["note", "^비고"]],
    ["^종목", "^학교명"],
    (g, line, col, { sport, school }) => ({
      year, sport, kind: g("kind") || null, school: school.trim(), level: tsLevel(g("level"), school),
      team_name: g("team_name") || null, founded: tsNum(g("founded"), "창단 연도"),
      players_m: tsNum(g("m"), "선수 수(남)"), players_f: tsNum(g("f"), "선수 수(여)"),
      training_place: g("place") || null,
      exp_gold: tsNum(g("gold"), "예상 금메달"), exp_silver: tsNum(g("silver"), "예상 은메달"), exp_bronze: tsNum(g("bronze"), "예상 동메달"),
      exp_note: g("exp_note") || null, note: g("note") || null,
    }), out, "운동부 현황");
  teamRows.forEach((t) => {
    const k = t.school + "|" + t.sport;
    if (seen.has(k)) { out.errors.push({ sheet: "운동부 현황", row: "-", reason: `같은 학교·종목이 두 번 있어 뒤의 줄은 제외 (${t.school} ${t.sport})` }); return; }
    seen.add(k); out.teams.push(t);
  });
  out.staff = tsReadSheet(wb, "감독", 
    [["sport", "^종목"], ["school", "^학교명"], ["role", "^구분"], ["name", "^성명"], ["status", "^신분"], ["career", "지도경력"], ["qual", "주요자격"], ["note", "^비고"]],
    ["^종목", "^학교명"],
    (g, line, col, { sport, school }) => ({ year, sport, school: school.trim(), role: g("role") || null, name: g("name") || null, status: g("status") || null,
      career_years: tsNum(g("career"), "지도 경력"), qualification: g("qual") || null, note: g("note") || null }), out, "감독·코치");
  const ath = (nameKey, type, label, extra) => tsReadSheet(wb, nameKey,
    [["sport", "^종목"], ["school", "^학교명"], ["name", "^성명"], ["gender", "^성별"], ["grade", "학년"], ...extra.cols, ["note", "^비고"]],
    ["^종목", "^학교명", "^성명"],
    (g, line, col, { sport, school }) => {
      let grade = g("grade"); if (/^\d+$/.test(grade)) grade += "학년";
      return { year, sport, school: school.trim(), team_type: type, name: g("name") || null, gender: g("gender") || null, grade: grade || null, ...extra.map(g) };
    }, out, label);
  out.athletes = [
    ...ath("개인종목", "개인", "개인종목 선수", {
      cols: [["detail", "세부종목"], ["cur", "현재기록"], ["pg", "금기록"], ["ps", "은기록"], ["pb", "동기록"], ["target", "목표기록"], ["exp", "예상실적"], ["support", "맞춤지원"]],
      map: (g) => ({ detail: g("detail") || null, current_record: g("cur") || null, prev_gold: g("pg") || null, prev_silver: g("ps") || null, prev_bronze: g("pb") || null, target_record: g("target") || null, expected: g("exp") || null, support: g("support") || null }),
    }),
    ...ath("단체종목", "단체", "단체종목 선수", {
      cols: [["detail", "포지션"], ["feature", "기량특징"], ["support", "맞춤지원"]],
      map: (g) => ({ detail: g("detail") || null, feature: g("feature") || null, support: g("support") || null }),
    }),
  ];
  // 학교명 표기 섞임 경고: 같은 학교로 보이는 이름이 둘 이상
  const groups = {};
  [...out.teams, ...out.staff, ...out.athletes].forEach((r) => {
    const key = r.school.replace(/(초등학교|중학교|고등학교|초|중|고)$/, "");
    (groups[key + "|" + (r.school.match(/(초|중|고)(등학교|학교)?$/)?.[1] || "")] ||= new Set()).add(r.school);
  });
  Object.values(groups).forEach((set) => { if (set.size > 1) out.warnings.push(`같은 학교로 보이는 이름이 여러 개입니다: ${[...set].join(" / ")} — 하나로 통일해 주세요`); });
  const teamKeys = new Set(out.teams.map((t) => t.school + "|" + t.sport));
  const orphan = new Set([...out.staff, ...out.athletes].filter((r) => !teamKeys.has(r.school + "|" + r.sport)).map((r) => `${r.school} ${r.sport}`));
  if (orphan.size) out.warnings.push(`'운동부 현황'에 없는 학교·종목의 지도자/선수가 있습니다: ${[...orphan].slice(0, 8).join(", ")}${orphan.size > 8 ? " …" : ""}`);
  return out;
}

tsFile.addEventListener("change", () => { tsParsed = null; tsSaveBtn.disabled = true; tsPreviewEl.innerHTML = ""; });
tsYearEl.addEventListener("change", () => { tsParsed = null; tsSaveBtn.disabled = true; tsLoadList(); });

document.getElementById("tsPreviewBtn").addEventListener("click", async () => {
  const file = tsFile.files[0];
  const year = Number(tsYearEl.value);
  if (!year) return tsSetStatus("학년도를 입력해 주세요.", "error");
  if (!file) return tsSetStatus("조사표 파일(.xlsx)을 선택해 주세요.", "error");
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    tsParsed = parseTeamsSurvey(wb, year);
  } catch (e) { tsParsed = null; return tsSetStatus("파일을 읽지 못했습니다: " + e.message, "error"); }
  const p = tsParsed;
  const all = [...p.teams, ...p.staff, ...p.athletes];
  const schools = new Set(all.map((r) => r.school));
  const sports = new Set(all.map((r) => r.sport));
  const m = p.teams.reduce((a, t) => a + (t.players_m || 0), 0), f = p.teams.reduce((a, t) => a + (t.players_f || 0), 0);
  tsPreviewEl.innerHTML = `
    <div style="margin:12px 0; line-height:1.7;">
      <b>${year}학년도</b> — 운동부 현황 ${p.teams.length}행 · 감독·코치 ${p.staff.length}행 · 개인종목 선수 ${p.athletes.filter((a) => a.team_type === "개인").length}행 · 단체종목 선수 ${p.athletes.filter((a) => a.team_type === "단체").length}행<br>
      학교 ${schools.size}곳 · 종목 ${sports.size}개 · 선수 수 ${m + f}명 (남 ${m} / 여 ${f}) · 예시 행 제외 ${p.skippedExamples}행
    </div>
    ${p.warnings.map((w) => `<p style="color:var(--clay); margin:4px 0;">⚠ ${tsEsc(w)}</p>`).join("")}
    ${p.errors.length ? `<details open style="margin:8px 0;"><summary style="color:var(--clay);">읽지 못한 행 ${p.errors.length}건</summary><ul>${p.errors.map((e) => `<li>${tsEsc(e.sheet)} ${e.row}행: ${tsEsc(e.reason)}</li>`).join("")}</ul></details>` : ""}
    <div style="overflow-x:auto;"><table class="result-table"><thead><tr><th>학교</th><th>종목</th><th>구분</th><th>급</th><th>운동부 명칭</th><th>창단</th><th>남</th><th>여</th><th>계</th><th>훈련 장소</th><th>예상 금/은/동</th></tr></thead><tbody>
    ${p.teams.map((t) => `<tr><td>${tsEsc(t.school)}</td><td>${tsEsc(t.sport)}</td><td>${tsEsc(t.kind)}</td><td>${tsEsc(t.level)}</td><td>${tsEsc(t.team_name)}</td><td>${tsEsc(t.founded)}</td><td>${t.players_m ?? 0}</td><td>${t.players_f ?? 0}</td><td>${(t.players_m || 0) + (t.players_f || 0)}</td><td>${tsEsc(t.training_place)}</td><td>${t.exp_gold ?? 0}/${t.exp_silver ?? 0}/${t.exp_bronze ?? 0}</td></tr>`).join("")}
    </tbody></table></div>`;
  tsSaveBtn.disabled = !all.length;
  tsSetStatus(all.length ? "미리보기를 확인한 뒤 [저장]을 누르세요." : "저장할 행이 없습니다.", all.length ? "" : "error");
});

const TS_TABLES = ["sport_teams", "sport_staff", "sport_athletes"];
async function tsOldIds(table, year, schools) {
  const ids = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select("id").eq("year", year).order("id").range(from, from + 999);
    if (schools) q = q.in("school", schools);
    const { data, error } = await q;
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    ids.push(...data.map((r) => r.id));
    if (data.length < 1000) break;
  }
  return ids;
}
async function tsChunked(rows, fn) { for (let i = 0; i < rows.length; i += 200) await fn(rows.slice(i, i + 200)); }

tsSaveBtn.addEventListener("click", async () => {
  const p = tsParsed;
  if (!p) return;
  const mode = document.querySelector('input[name="tsMode"]:checked').value;
  const schools = [...new Set([...p.teams, ...p.staff, ...p.athletes].map((r) => r.school))];
  if (mode === "year" && !confirm(`${p.year}학년도 운동부 자료 전체를 지우고 이 파일로 교체합니다.\n파일에 없는 학교의 자료도 모두 사라집니다. 계속할까요?`)) return;
  if (mode === "schools" && !confirm(`${p.year}학년도 ${schools.length}개 학교(${schools.slice(0, 5).join(", ")}${schools.length > 5 ? " 외" : ""})의 기존 자료를 지우고 이 파일로 교체할까요?`)) return;

  tsSaveBtn.disabled = true;
  tsSetStatus("저장 중…");
  const inserted = { sport_staff: [], sport_athletes: [] };
  try {
    // 1) 지울 대상(옛 자료) id를 먼저 기억
    const scope = mode === "year" ? null : schools;
    const old = {};
    for (const t of TS_TABLES) old[t] = await tsOldIds(t, p.year, scope);

    // 2) 새 자료를 먼저 넣음 (운동부는 학년도·학교·종목이 같으면 덮어씀)
    const now = new Date().toISOString();
    const keepIds = new Set();
    await tsChunked(p.teams.map((t) => ({ ...t, updated_at: now })), async (chunk) => {
      const { data, error } = await supabase.from("sport_teams").upsert(chunk, { onConflict: "year,school,sport" }).select("id");
      if (error) throw new Error("운동부 현황 저장 실패: " + error.message);
      if (!data || data.length !== chunk.length) throw new Error(`운동부 현황 저장 건수가 맞지 않습니다 (${data ? data.length : 0}/${chunk.length})`);
      data.forEach((r) => keepIds.add(r.id));
    });
    for (const [table, rows] of [["sport_staff", p.staff], ["sport_athletes", p.athletes]]) {
      await tsChunked(rows, async (chunk) => {
        const { data, error } = await supabase.from(table).insert(chunk).select("id");
        if (error) throw new Error(`${table} 저장 실패: ${error.message}`);
        if (!data || data.length !== chunk.length) throw new Error(`${table} 저장 건수가 맞지 않습니다 (${data ? data.length : 0}/${chunk.length})`);
        data.forEach((r) => { inserted[table].push(r.id); keepIds.add(r.id); });
      });
    }

    // 3) 새 자료가 모두 들어간 뒤에야 옛 자료를 지움
    let deleted = 0, failed = 0;
    for (const t of TS_TABLES) {
      const gone = old[t].filter((id) => !keepIds.has(id));
      await tsChunked(gone, async (chunk) => {
        const { data, error } = await supabase.from(t).delete().in("id", chunk).select("id");
        const n = error ? 0 : (data || []).length;
        deleted += n; failed += chunk.length - n;
      });
    }
    const msg = `저장 완료: 운동부 ${p.teams.length} · 지도자 ${p.staff.length} · 선수 ${p.athletes.length}건 등록, 옛 자료 ${deleted}건 정리`;
    if (failed) tsSetStatus(msg + ` (옛 자료 ${failed}건은 지우지 못했습니다 — 권한을 확인하세요)`, "error");
    else tsSetStatus(msg, "success");
    tsParsed = null;
  } catch (e) {
    // 새로 넣던 지도자·선수 자료는 되돌림(옛 자료는 아직 지우지 않은 상태)
    for (const table of Object.keys(inserted)) {
      await tsChunked(inserted[table], (chunk) => supabase.from(table).delete().in("id", chunk));
    }
    tsSetStatus(e.message + " — 기존 자료는 지우지 않았습니다.", "error");
    tsSaveBtn.disabled = false;
  }
  tsLoadList();
});

// ---- 등록된 운동부 목록 ----
let tsData = { teams: [], staff: [], athletes: [] };
const tsSchoolFilter = document.getElementById("tsSchoolFilter");
async function tsFetchAll(table, year) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select("*").eq("year", year).order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}
async function tsLoadList() {
  const year = Number(tsYearEl.value);
  document.getElementById("tsListYear").textContent = `(${year}학년도)`;
  try {
    const [teams, staff, athletes] = await Promise.all(TS_TABLES.map((t) => tsFetchAll(t, year)));
    tsData = { teams, staff, athletes };
  } catch (e) { document.getElementById("tsListCount").textContent = "불러오기 실패: " + e.message; return; }
  const cur = tsSchoolFilter.value;
  const schools = [...new Set(tsData.teams.map((t) => t.school))].sort((a, b) => a.localeCompare(b, "ko"));
  tsSchoolFilter.innerHTML = '<option value="">전체</option>' + schools.map((s) => `<option>${tsEsc(s)}</option>`).join("");
  tsSchoolFilter.value = schools.includes(cur) ? cur : "";
  tsRenderList();
}
tsSchoolFilter.addEventListener("change", tsRenderList);

function tsRenderList() {
  const lv = { 초: 0, 중: 1, 고: 2 };
  const rows = tsData.teams.filter((t) => !tsSchoolFilter.value || t.school === tsSchoolFilter.value)
    .sort((a, b) => (lv[a.level] ?? 9) - (lv[b.level] ?? 9) || a.school.localeCompare(b.school, "ko") || a.sport.localeCompare(b.sport, "ko"));
  document.getElementById("tsListCount").textContent = `운동부 ${rows.length}곳`;
  const host = document.getElementById("tsList");
  if (!rows.length) { host.innerHTML = '<p class="empty-note">등록된 운동부가 없습니다.</p>'; return; }
  const same = (r, t) => r.school === t.school && r.sport === t.sport;
  host.innerHTML = `<table class="result-table"><thead><tr><th>학교</th><th>종목</th><th>구분</th><th>남</th><th>여</th><th>계</th><th>감독</th><th>코치</th><th>예상 금/은/동</th><th></th></tr></thead><tbody>` +
    rows.map((t, i) => {
      const st = tsData.staff.filter((s) => same(s, t)), at = tsData.athletes.filter((a) => same(a, t));
      return `<tr><td>${tsEsc(t.school)}</td><td>${tsEsc(t.sport)}</td><td>${tsEsc(t.kind)}</td><td>${t.players_m ?? 0}</td><td>${t.players_f ?? 0}</td><td>${(t.players_m || 0) + (t.players_f || 0)}</td>
        <td>${st.filter((s) => s.role === "감독").length}</td><td>${st.filter((s) => s.role === "코치").length}</td><td>${t.exp_gold ?? 0}/${t.exp_silver ?? 0}/${t.exp_bronze ?? 0}</td>
        <td style="white-space:nowrap;"><button type="button" class="btn btn-ghost" style="color:var(--ink); border-color:var(--line);" data-ts-view="${i}">명단 보기</button>
        <button type="button" class="btn btn-ghost" style="color:var(--ink); border-color:var(--line);" data-ts-del="${i}">삭제</button></td></tr>
        <tr id="tsRoster${i}" style="display:none;"><td colspan="10" style="background:#FAFAF6;">
          <b>지도자 ${st.length}명</b>: ${st.map((s) => `${tsEsc(s.role)} ${tsEsc(s.name)}${s.status ? "(" + tsEsc(s.status) + ")" : ""}${s.career_years != null ? " " + s.career_years + "년" : ""}${s.qualification ? " · " + tsEsc(s.qualification) : ""}`).join(" / ") || "-"}<br>
          <b>학생선수 ${at.length}명</b>: ${at.map((a) => `${tsEsc(a.name)}(${tsEsc(a.gender)}${a.grade ? " " + tsEsc(a.grade) : ""}${a.detail ? " · " + tsEsc(a.detail) : ""}${a.current_record ? " · " + tsEsc(a.current_record) : ""})`).join(", ") || "-"}
        </td></tr>`;
    }).join("") + "</tbody></table>";
  host.querySelectorAll("[data-ts-view]").forEach((b) => b.addEventListener("click", () => {
    const r = document.getElementById("tsRoster" + b.dataset.tsView);
    r.style.display = r.style.display === "none" ? "" : "none";
  }));
  host.querySelectorAll("[data-ts-del]").forEach((b) => b.addEventListener("click", async () => {
    const t = rows[Number(b.dataset.tsDel)];
    if (!confirm(`${t.school} ${t.sport} 운동부와 그 지도자·학생선수 명단을 모두 삭제할까요?\n되돌릴 수 없습니다.`)) return;
    for (const table of ["sport_athletes", "sport_staff", "sport_teams"]) {
      const q = supabase.from(table).delete().eq("year", t.year).eq("school", t.school).eq("sport", t.sport);
      const { data, error } = await q.select("id");
      if (error) return alert("삭제 실패: " + error.message);
      if (table === "sport_teams" && !(data || []).length) return alert("삭제되지 않았습니다. 권한을 확인하세요.");
    }
    tsLoadList();
  }));
}

// ================= 성과 기록 관리 (선택3) — sport_awards =================
// 선수명(athlete)은 관리자 전용 칸이며 공개 RPC get_public_awards 는 이 칸을 주지 않음.
const axFile = document.getElementById("axFile");
const axStatus = document.getElementById("axStatus");
const axPreviewEl = document.getElementById("axPreview");
const axSaveBtn = document.getElementById("axSaveBtn");
initDropzone(document.getElementById("axDropzone"), axFile, document.getElementById("axFileName"));

const AX_MEDAL_BY_PLACE = { 1: "금", 2: "은", 3: "동" };
const AX_COMP_BIG = ["전국소년체육대회", "전국체육대회"];
let axParsed = null;
let axRows = [];
let axEditId = null;
function axSet(el, msg, kind) { el.textContent = msg; el.className = "form-status" + (kind ? " " + kind : ""); }

function axDate(v) {
  const t = tsText(v);
  if (!t) return null;
  if (/^\d{5}$/.test(t)) return new Date(Math.round((Number(t) - 25569) * 86400000)).toISOString().slice(0, 10);   // 엑셀 날짜 숫자
  const m = t.match(/^(\d{4})[-./\s]+(\d{1,2})[-./\s]+(\d{1,2})/);
  if (!m) throw new Error(`대회 일자를 읽지 못했습니다 (${t})`);
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}
function axEnum(v, list, label) {
  const t = tsText(v);
  if (!t) return null;
  if (!list.includes(t)) throw new Error(`${label}은(는) ${list.join("/")} 중 하나여야 합니다 (${t})`);
  return t;
}
// 메달 칸 → 금/은/동, 비어 있으면 순위 1·2·3위로 계산
function axMedal(rawMedal, place) {
  const t = tsText(rawMedal);
  if (t) {
    const m = t[0];
    if (!["금", "은", "동"].includes(m)) throw new Error(`메달은 금/은/동 중 하나여야 합니다 (${t})`);
    return m;
  }
  return AX_MEDAL_BY_PLACE[place] || null;
}

function parseAwards(wb) {
  const out = { errors: [], skippedExamples: 0 };
  const rows = tsReadSheet(wb, "입상기록",
    [["year", "^연도"], ["comp", "^대회명"], ["clevel", "^대회수준"], ["date", "^대회일자"], ["sport", "^종목"], ["detail", "^세부종목"],
     ["school", "^학교명"], ["slevel", "^학교급"], ["gender", "^성별"], ["type", "^구분"], ["place", "^순위"], ["medal", "^메달"],
     ["athlete", "^선수명"], ["record", "^기록"], ["note", "^비고"]],
    ["^연도", "^대회명", "^종목", "^학교명"],
    (g, line, col, { sport, school }) => {
      const year = tsNum(g("year"), "연도");
      if (year == null) throw new Error("연도가 비어 있습니다");
      if (!g("comp")) throw new Error("대회명이 비어 있습니다");
      const place = tsNum(g("place"), "순위");
      const medal = axMedal(g("medal"), place);
      if (place == null && !medal) throw new Error("순위 또는 메달이 필요합니다");
      return {
        year, competition: g("comp"), comp_level: axEnum(g("clevel"), ["전국", "도", "시군"], "대회 수준"), event_date: axDate(g("date")),
        sport, detail: g("detail") || null, school: school.trim(), school_level: axEnum(g("slevel"), ["초", "중", "고"], "학교급") || tsLevel("", school.trim()),
        gender: axEnum(g("gender"), ["남", "여", "혼성"], "성별"), team_type: axEnum(g("type"), ["개인", "단체"], "구분"),
        place, medal, athlete: g("athlete") || null, record: g("record") || null, note: g("note") || null,
      };
    }, out, "입상 기록");
  out.rows = rows;
  return out;
}
const axCount = (rows) => ({ 금: rows.filter((r) => r.medal === "금").length, 은: rows.filter((r) => r.medal === "은").length, 동: rows.filter((r) => r.medal === "동").length });

axFile.addEventListener("change", () => { axParsed = null; axSaveBtn.disabled = true; axPreviewEl.innerHTML = ""; });
document.getElementById("axPreviewBtn").addEventListener("click", async () => {
  const file = axFile.files[0];
  if (!file) return axSet(axStatus, "성과 기록 파일(.xlsx)을 선택해 주세요.", "error");
  try { axParsed = parseAwards(XLSX.read(await file.arrayBuffer(), { type: "array" })); }
  catch (e) { axParsed = null; return axSet(axStatus, "파일을 읽지 못했습니다: " + e.message, "error"); }
  const p = axParsed, c = axCount(p.rows);
  axPreviewEl.innerHTML = `
    <div style="margin:12px 0; line-height:1.7;"><b>${p.rows.length}건</b> 읽음 — 금 ${c.금} · 은 ${c.은} · 동 ${c.동} (메달 없음 ${p.rows.length - c.금 - c.은 - c.동}) · 예시 행 제외 ${p.skippedExamples}행</div>
    ${p.errors.length ? `<details open style="margin:8px 0;"><summary style="color:var(--clay);">읽지 못한 행 ${p.errors.length}건</summary><ul>${p.errors.map((e) => `<li>${tsEsc(e.sheet)} ${e.row}행: ${tsEsc(e.reason)}</li>`).join("")}</ul></details>` : ""}
    <div style="overflow-x:auto;"><table class="result-table"><thead><tr><th>연도</th><th>대회</th><th>종목</th><th>세부</th><th>학교</th><th>성별</th><th>구분</th><th>순위</th><th>메달</th><th>선수명</th><th>기록</th></tr></thead><tbody>
    ${p.rows.map((r) => `<tr><td>${r.year}</td><td>${tsEsc(r.competition)}</td><td>${tsEsc(r.sport)}</td><td>${tsEsc(r.detail)}</td><td>${tsEsc(r.school)}</td><td>${tsEsc(r.gender)}</td><td>${tsEsc(r.team_type)}</td><td>${r.place ?? ""}</td><td>${tsEsc(r.medal)}</td><td>${tsEsc(r.athlete)}</td><td>${tsEsc(r.record)}</td></tr>`).join("")}
    </tbody></table></div>`;
  axSaveBtn.disabled = !p.rows.length;
  axSet(axStatus, p.rows.length ? "미리보기를 확인한 뒤 [저장]을 누르세요." : "저장할 행이 없습니다.", p.rows.length ? "" : "error");
});

async function axOldIds(year, comp) {
  const ids = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("sport_awards").select("id").eq("year", year).eq("competition", comp).order("id").range(from, from + 999);
    if (error) throw new Error("기존 기록 조회 실패: " + error.message);
    ids.push(...data.map((r) => r.id));
    if (data.length < 1000) break;
  }
  return ids;
}
axSaveBtn.addEventListener("click", async () => {
  const p = axParsed;
  if (!p) return;
  const mode = document.querySelector('input[name="axMode"]:checked').value;
  const combos = [...new Map(p.rows.map((r) => [r.year + "|" + r.competition, r])).values()];
  if (mode === "replace" && !confirm(`다음 연도·대회의 기존 기록을 지우고 이 파일로 교체할까요?\n${combos.map((r) => `${r.year} ${r.competition}`).join("\n")}`)) return;
  axSaveBtn.disabled = true;
  axSet(axStatus, "저장 중…");
  const inserted = [];
  try {
    let old = [];
    if (mode === "replace") for (const r of combos) old.push(...(await axOldIds(r.year, r.competition)));   // 지울 옛 id를 먼저 기억
    await tsChunked(p.rows, async (chunk) => {                                                               // 새 기록을 먼저 넣음
      const { data, error } = await supabase.from("sport_awards").insert(chunk).select("id");
      if (error) throw new Error("저장 실패: " + error.message);
      if (!data || data.length !== chunk.length) throw new Error(`저장 건수가 맞지 않습니다 (${data ? data.length : 0}/${chunk.length})`);
      inserted.push(...data.map((r) => r.id));
    });
    old = [...new Set(old)];
    let deleted = 0, failed = 0;
    await tsChunked(old, async (chunk) => {                                                                  // 다 들어간 뒤에 옛 기록 삭제
      const { data, error } = await supabase.from("sport_awards").delete().in("id", chunk).select("id");
      const n = error ? 0 : (data || []).length;
      deleted += n; failed += chunk.length - n;
    });
    const msg = `저장 완료: ${p.rows.length}건 등록` + (mode === "replace" ? `, 옛 기록 ${deleted}건 정리` : "");
    axSet(axStatus, failed ? msg + ` (옛 기록 ${failed}건은 지우지 못했습니다 — 권한을 확인하세요)` : msg, failed ? "error" : "success");
    axParsed = null;
  } catch (e) {
    await tsChunked(inserted, (chunk) => supabase.from("sport_awards").delete().in("id", chunk));
    axSet(axStatus, e.message + " — 기존 기록은 지우지 않았습니다.", "error");
    axSaveBtn.disabled = false;
  }
  axLoadAll();
});

// ---- 직접 입력 / 수정 ----
const axf = (id) => document.getElementById("axf" + id);
function axFormClear() {
  axEditId = null;
  ["Comp", "Date", "Sport", "Detail", "School", "Place", "Athlete", "Record", "Note"].forEach((k) => (axf(k).value = ""));
  ["LevelC", "Level", "Gender", "Type", "Medal"].forEach((k) => (axf(k).value = ""));
  document.getElementById("axFormTitle").textContent = "한 건 직접 입력";
  axf("SaveBtn").textContent = "등록";
  axf("CancelBtn").style.display = "none";
}
axf("CancelBtn").addEventListener("click", () => { axFormClear(); axSet(axf("Status"), ""); });
axf("SaveBtn").addEventListener("click", async () => {
  const st = axf("Status");
  const v = (k) => axf(k).value.trim();
  const year = Number(v("Year")), place = v("Place") === "" ? null : Number(v("Place"));
  if (!year || !v("Comp") || !v("Sport") || !v("School")) return axSet(st, "연도·대회명·종목·학교명은 필수입니다.", "error");
  if (place != null && !(place >= 1)) return axSet(st, "순위는 1 이상의 숫자로 적어 주세요.", "error");
  const medal = v("Medal") || AX_MEDAL_BY_PLACE[place] || null;
  if (place == null && !medal) return axSet(st, "순위 또는 메달을 적어 주세요.", "error");
  const row = { year, competition: v("Comp"), comp_level: v("LevelC") || null, event_date: v("Date") || null, sport: v("Sport"), detail: v("Detail") || null,
    school: v("School"), school_level: v("Level") || tsLevel("", v("School")), gender: v("Gender") || null, team_type: v("Type") || null,
    place, medal, athlete: v("Athlete") || null, record: v("Record") || null, note: v("Note") || null };
  axf("SaveBtn").disabled = true;
  const q = axEditId ? supabase.from("sport_awards").update(row).eq("id", axEditId).select("id") : supabase.from("sport_awards").insert([row]).select("id");
  const { data, error } = await q;
  axf("SaveBtn").disabled = false;
  if (error) return axSet(st, "저장 실패: " + error.message, "error");
  if (!data || data.length !== 1) return axSet(st, "저장되지 않았습니다. 권한을 확인하세요.", "error");
  axSet(st, axEditId ? "수정되었습니다." : "등록되었습니다.", "success");
  axFormClear();
  axLoadAll();
});

// ---- 목록 ----
async function axFetchAll() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("sport_awards").select("*").order("year", { ascending: false }).order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}
async function axLoadAll() {
  try { axRows = await axFetchAll(); } catch (e) { document.getElementById("axlCount").textContent = "불러오기 실패: " + e.message; return; }
  const fill = (id, vals) => { const el = document.getElementById(id), cur = el.value; el.innerHTML = '<option value="">전체</option>' + vals.map((x) => `<option>${tsEsc(x)}</option>`).join(""); el.value = vals.map(String).includes(cur) ? cur : ""; };
  fill("axlYear", [...new Set(axRows.map((r) => r.year))].sort((a, b) => b - a));
  fill("axlComp", [...new Set(axRows.map((r) => r.competition))].sort((a, b) => a.localeCompare(b, "ko")));
  fill("axlSchool", [...new Set(axRows.map((r) => r.school))].sort((a, b) => a.localeCompare(b, "ko")));
  axRenderList();
  axRenderExpect();
  try {   // 자동완성 목록 (sport_teams)
    const { data } = await supabase.from("sport_teams").select("school,sport").range(0, 999);
    const u = (k) => [...new Set((data || []).map((r) => r[k]))].sort((a, b) => a.localeCompare(b, "ko")).map((x) => `<option value="${tsEsc(x)}">`).join("");
    document.getElementById("axSchoolList").innerHTML = u("school");
    document.getElementById("axSportList").innerHTML = u("sport");
  } catch (e) { /* 자동완성은 없어도 됨 */ }
}
["axlYear", "axlComp", "axlSchool"].forEach((id) => document.getElementById(id).addEventListener("change", axRenderList));

function axRenderList() {
  const y = document.getElementById("axlYear").value, c = document.getElementById("axlComp").value, sc = document.getElementById("axlSchool").value;
  const rows = axRows.filter((r) => (!y || String(r.year) === y) && (!c || r.competition === c) && (!sc || r.school === sc));
  const shown = rows.slice(0, 500);
  document.getElementById("axlCount").textContent = `총 ${rows.length}건` + (rows.length > shown.length ? ` (앞 ${shown.length}건만 표시 — 필터로 좁혀 보세요)` : "");
  const host = document.getElementById("axlList");
  if (!rows.length) { host.innerHTML = '<p class="empty-note">기록이 없습니다.</p>'; return; }
  host.innerHTML = `<table class="result-table"><thead><tr><th><input type="checkbox" id="axlAll" aria-label="전체선택"></th><th>연도</th><th>대회</th><th>종목</th><th>세부</th><th>학교</th><th>성별</th><th>구분</th><th>순위</th><th>메달</th><th>선수명</th><th>기록</th><th></th></tr></thead><tbody>` +
    shown.map((r) => `<tr><td><input type="checkbox" class="axlChk" value="${r.id}"></td><td>${r.year}</td><td>${tsEsc(r.competition)}</td><td>${tsEsc(r.sport)}</td><td>${tsEsc(r.detail)}</td><td>${tsEsc(r.school)}</td><td>${tsEsc(r.gender)}</td><td>${tsEsc(r.team_type)}</td><td>${r.place ?? ""}</td><td>${tsEsc(r.medal)}</td><td>${tsEsc(r.athlete)}</td><td>${tsEsc(r.record)}</td>
      <td style="white-space:nowrap;"><button type="button" class="btn btn-ghost" style="color:var(--ink); border-color:var(--line);" data-ax-edit="${r.id}">수정</button> <button type="button" class="btn btn-ghost" style="color:var(--ink); border-color:var(--line);" data-ax-del="${r.id}">삭제</button></td></tr>`).join("") + "</tbody></table>";
  document.getElementById("axlAll").addEventListener("change", (e) => host.querySelectorAll(".axlChk").forEach((b) => (b.checked = e.target.checked)));
  host.querySelectorAll("[data-ax-del]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("이 기록을 삭제할까요?")) return;
    const n = await axDelete([b.dataset.axDel]);
    if (n !== 1) alert("삭제되지 않았습니다. 권한을 확인하세요.");
    axLoadAll();
  }));
  host.querySelectorAll("[data-ax-edit]").forEach((b) => b.addEventListener("click", () => {
    const r = axRows.find((x) => String(x.id) === b.dataset.axEdit);
    if (!r) return;
    axEditId = r.id;
    const set = { Year: r.year, Comp: r.competition, LevelC: r.comp_level, Date: r.event_date, Sport: r.sport, Detail: r.detail, School: r.school, Level: r.school_level, Gender: r.gender, Type: r.team_type, Place: r.place, Medal: r.medal, Athlete: r.athlete, Record: r.record, Note: r.note };
    Object.entries(set).forEach(([k, val]) => (axf(k).value = val ?? ""));
    document.getElementById("axFormTitle").textContent = "기록 수정";
    axf("SaveBtn").textContent = "수정 저장";
    axf("CancelBtn").style.display = "";
    axf("Year").scrollIntoView({ block: "center" });
  }));
}
async function axDelete(ids) {
  let n = 0;
  await tsChunked(ids, async (chunk) => {
    const { data, error } = await supabase.from("sport_awards").delete().in("id", chunk).select("id");
    if (!error) n += (data || []).length;
  });
  return n;
}
document.getElementById("axlDelSel").addEventListener("click", async () => {
  const ids = [...document.querySelectorAll(".axlChk:checked")].map((b) => b.value);
  if (!ids.length) return alert("삭제할 기록을 체크해 주세요.");
  if (!confirm(`체크한 ${ids.length}건을 삭제할까요? 되돌릴 수 없습니다.`)) return;
  const n = await axDelete(ids);
  if (n !== ids.length) alert(`${ids.length}건 중 ${n}건만 삭제되었습니다. 권한을 확인하세요.`);
  axLoadAll();
});

// ---- 예상 대비 실적 ----
const axSchoolKey = (s) => tsNorm(s).replace(/학교$/, "");   // '○○중학교' / '○○중' 을 같게 봄
const axeYear = document.getElementById("axeYear");
axeYear.addEventListener("change", axRenderExpect);
async function axRenderExpect() {
  const box = document.getElementById("axeBox");
  const year = Number(axeYear.value);
  if (!year) { box.innerHTML = ""; return; }
  let teams = [], awards = [];
  try {
    teams = await tsFetchAll("sport_teams", year);
    const { data, error } = await supabase.from("sport_awards").select("*").eq("year", year).in("competition", AX_COMP_BIG).range(0, 4999);
    if (error) throw new Error(error.message);
    awards = data || [];
  } catch (e) { box.innerHTML = `<p class="empty-note">불러오기 실패: ${tsEsc(e.message)}</p>`; return; }
  const map = new Map();
  const slot = (school, sport) => {
    const k = axSchoolKey(school) + "|" + tsNorm(sport);
    if (!map.has(k)) map.set(k, { school, sport, e: [0, 0, 0], a: [0, 0, 0] });
    return map.get(k);
  };
  teams.forEach((t) => { const r = slot(t.school, t.sport); r.school = t.school; r.e = [t.exp_gold || 0, t.exp_silver || 0, t.exp_bronze || 0]; });
  awards.forEach((a) => { const i = ["금", "은", "동"].indexOf(a.medal); if (i >= 0) slot(a.school, a.sport).a[i]++; });
  const rows = [...map.values()].sort((x, y) => x.school.localeCompare(y.school, "ko") || x.sport.localeCompare(y.sport, "ko"));
  if (!rows.length) { box.innerHTML = '<p class="empty-note">이 연도에 비교할 자료가 없습니다.</p>'; return; }
  const sum = (k) => [0, 1, 2].map((i) => rows.reduce((a, r) => a + r[k][i], 0));
  const E = sum("e"), A = sum("a");
  const d = (a, e) => { const x = a - e; return x > 0 ? `+${x}` : x < 0 ? `−${Math.abs(x)}` : "0"; };
  const dcls = (a, e) => (a - e > 0 ? "color:#2E7D32;" : a - e < 0 ? "color:var(--clay);" : "");
  const cells = (e, a) => [0, 1, 2].map((i) => `<td>${e[i]}</td>`).join("") + [0, 1, 2].map((i) => `<td>${a[i]}</td>`).join("") + [0, 1, 2].map((i) => `<td style="${dcls(a[i], e[i])}">${d(a[i], e[i])}</td>`).join("");
  box.innerHTML = `<table class="result-table"><thead>
    <tr><th rowspan="2">학교</th><th rowspan="2">종목</th><th colspan="3">예상</th><th colspan="3">실적</th><th colspan="3">차이(실적−예상)</th></tr>
    <tr><th>금</th><th>은</th><th>동</th><th>금</th><th>은</th><th>동</th><th>금</th><th>은</th><th>동</th></tr></thead><tbody>
    <tr style="font-weight:700; background:#F4F4EE;"><td colspan="2">합계</td>${cells(E, A)}</tr>
    ${rows.map((r) => `<tr><td>${tsEsc(r.school)}</td><td>${tsEsc(r.sport)}</td>${cells(r.e, r.a)}</tr>`).join("")}
    </tbody></table>`;
}

// ================= 학교 위치 · 진학 연계 · 현황 보고서 (선택3) =================
// sport_schools(name PK, level, address, lat, lng, updated_at) / sport_pathways(id, sport, from_school, to_school, note) — 모든 저장·삭제는 .select()로 건수 확인
const geoStatus = document.getElementById("geoStatus");
let geoSchools = [], geoMap = null, geoMarker = null, geoPick = null, geoInited = false;
const geoSet = (msg, kind) => { geoStatus.textContent = msg; geoStatus.className = "form-status" + (kind ? " " + kind : ""); };
const teamsOfYear = async (y) => tsFetchAll("sport_teams", y);

function geoInit() {
  if (geoInited) { geoReload(); return; }
  geoInited = true;
  if (window.L) {
    geoMap = window.L.map("geoMap").setView([37.132, 128.191], 12);
    window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap 기여자" }).addTo(geoMap);
    geoMap.on("click", (e) => {
      if (!document.getElementById("geoSchool").value) return geoSet("먼저 학교를 선택해 주세요.", "error");
      geoPick = { lat: Number(e.latlng.lat.toFixed(6)), lng: Number(e.latlng.lng.toFixed(6)) };
      geoShowPick();
    });
    setTimeout(() => geoMap.invalidateSize(), 200);
  } else document.getElementById("geoMap").innerHTML = '<p class="empty-note">지도를 불러오지 못했습니다.</p>';
  geoReload();
  pwInit();
}
function geoShowPick() {
  document.getElementById("geoLL").textContent = geoPick ? `${geoPick.lat}, ${geoPick.lng}` : "-";
  if (!geoMap) return;
  if (geoMarker) geoMap.removeLayer(geoMarker);
  geoMarker = geoPick ? window.L.marker([geoPick.lat, geoPick.lng]).addTo(geoMap) : null;
}
async function geoReload() {
  const { data, error } = await supabase.from("sport_schools").select("*").order("name");
  if (error) { geoSet("학교 목록을 불러오지 못했습니다: " + error.message, "error"); return; }
  geoSchools = data || [];
  const cur = document.getElementById("geoSchool").value;
  document.getElementById("geoSchool").innerHTML = '<option value="">(선택)</option>' + geoSchools.map((s) => `<option value="${tsEsc(s.name)}">${tsEsc(s.name)}${s.lat == null ? " (위치 없음)" : ""}</option>`).join("");
  document.getElementById("geoSchool").value = geoSchools.some((s) => s.name === cur) ? cur : "";
  const miss = geoSchools.filter((s) => s.lat == null || s.lng == null);
  document.getElementById("geoCount").textContent = `등록 학교 ${geoSchools.length}교 · 위치 없는 학교 ${miss.length}교`;
  document.getElementById("geoMissing").textContent = miss.length ? "위치 없음: " + miss.map((s) => s.name).join(", ") : "";
}
document.getElementById("geoSchool").addEventListener("change", (e) => {
  const s = geoSchools.find((x) => x.name === e.target.value);
  document.getElementById("geoAddr").value = s?.address || "";
  geoPick = s && s.lat != null ? { lat: Number(s.lat), lng: Number(s.lng) } : null;
  geoShowPick();
  if (geoPick && geoMap) geoMap.setView([geoPick.lat, geoPick.lng], 15);
});
document.getElementById("geoLoadBtn").addEventListener("click", async () => {
  try {
    const year = Number(tsYearEl.value);
    const teams = await teamsOfYear(year);
    const have = new Set(geoSchools.map((s) => s.name));
    const add = [];
    teams.forEach((t) => { if (!have.has(t.school) && !add.some((a) => a.name === t.school)) add.push({ name: t.school, level: t.level || tsLevel("", t.school) }); });
    if (!add.length) return geoSet(`${year}학년도 운동부 학교는 모두 등록되어 있습니다.`, "success");
    const { data, error } = await supabase.from("sport_schools").insert(add).select("name");
    if (error) throw new Error(error.message);
    if (!data || data.length !== add.length) throw new Error(`추가 건수가 맞지 않습니다 (${data ? data.length : 0}/${add.length})`);
    geoSet(`${add.length}개 학교를 추가했습니다.`, "success");
    geoReload(); pwFillSports();
  } catch (e) { geoSet("학교 불러오기 실패: " + e.message, "error"); }
});
document.getElementById("geoSaveBtn").addEventListener("click", async () => {
  const name = document.getElementById("geoSchool").value;
  if (!name) return geoSet("학교를 선택해 주세요.", "error");
  if (!geoPick) return geoSet("지도에서 위치를 눌러 주세요.", "error");
  const { data, error } = await supabase.from("sport_schools").update({ address: document.getElementById("geoAddr").value.trim() || null, lat: geoPick.lat, lng: geoPick.lng, updated_at: new Date().toISOString() }).eq("name", name).select("name");
  if (error) return geoSet("저장 실패: " + error.message, "error");
  if (!data || data.length !== 1) return geoSet("저장되지 않았습니다. 권한을 확인하세요.", "error");
  geoSet(`${name} 위치를 저장했습니다.`, "success");
  geoReload();
});

// ---- 진학 연계 ----
const pwStatus = document.getElementById("pwStatus");
const pwSet = (msg, kind) => { pwStatus.textContent = msg; pwStatus.className = "form-status" + (kind ? " " + kind : ""); };
let pwTeams = [], pwRows = [];
async function pwInit() { await pwFillSports(); }
async function pwFillSports() {
  try { pwTeams = await teamsOfYear(Number(tsYearEl.value)); } catch (e) { return pwSet("운동부 목록을 불러오지 못했습니다: " + e.message, "error"); }
  const sports = [...new Set(pwTeams.map((t) => t.sport))].sort((a, b) => a.localeCompare(b, "ko"));
  const el = document.getElementById("pwSport"), cur = el.value;
  el.innerHTML = '<option value="">(선택)</option>' + sports.map((s) => `<option>${tsEsc(s)}</option>`).join("");
  el.value = sports.includes(cur) ? cur : "";
  pwRender();
}
document.getElementById("pwSport").addEventListener("change", pwRender);
async function pwRender() {
  const sport = document.getElementById("pwSport").value;
  const board = document.getElementById("pwBoard"), from = document.getElementById("pwFrom"), to = document.getElementById("pwTo");
  if (!sport) { board.innerHTML = ""; from.innerHTML = to.innerHTML = ""; return; }
  const ts = pwTeams.filter((t) => t.sport === sport).sort((a, b) => levelOrder(a.level) - levelOrder(b.level) || a.school.localeCompare(b.school, "ko"));
  const opt = ts.map((t) => `<option value="${tsEsc(t.school)}">${tsEsc(t.school)} (${tsEsc(t.level)})</option>`).join("");
  from.innerHTML = opt; to.innerHTML = opt;
  const { data, error } = await supabase.from("sport_pathways").select("*").eq("sport", sport).order("id");
  if (error) { board.innerHTML = `<p class="empty-note">연계 목록을 불러오지 못했습니다: ${tsEsc(error.message)}</p>`; return; }
  pwRows = data || [];
  const col = (l) => `<div><b>${LEVEL_NAME[l]}</b><ul style="margin:4px 0; padding-left:18px;">${ts.filter((t) => t.level === l).map((t) => `<li>${tsEsc(t.school)}</li>`).join("") || "<li class='sub'>없음</li>"}</ul></div>`;
  board.innerHTML = `<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px;">${col("초")}${col("중")}${col("고")}</div>
    <p style="margin:10px 0 4px;"><b>등록된 연계 ${pwRows.length}건</b></p>
    ${pwRows.length ? `<table class="result-table"><thead><tr><th>보내는 학교</th><th>받는 학교</th><th>비고</th><th></th></tr></thead><tbody>${pwRows.map((r) => `<tr><td>${tsEsc(r.from_school)}</td><td>${tsEsc(r.to_school)}</td><td>${tsEsc(r.note)}</td><td><button type="button" class="btn btn-ghost" style="color:var(--ink); border-color:var(--line);" data-pw-del="${r.id}">삭제</button></td></tr>`).join("")}</tbody></table>` : ""}`;
  board.querySelectorAll("[data-pw-del]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("이 연계를 삭제할까요?")) return;
    const { data: d, error: er } = await supabase.from("sport_pathways").delete().eq("id", b.dataset.pwDel).select("id");
    if (er) return pwSet("삭제 실패: " + er.message, "error");
    if (!d || d.length !== 1) return pwSet("삭제되지 않았습니다. 권한을 확인하세요.", "error");
    pwSet("삭제했습니다.", "success"); pwRender();
  }));
}
document.getElementById("pwAddBtn").addEventListener("click", async () => {
  const sport = document.getElementById("pwSport").value, from = document.getElementById("pwFrom").value, to = document.getElementById("pwTo").value;
  if (!sport || !from || !to) return pwSet("종목과 보내는·받는 학교를 선택해 주세요.", "error");
  const lv = (n) => pwTeams.find((t) => t.sport === sport && t.school === n)?.level;
  const a = levelOrder(lv(from)), b = levelOrder(lv(to));
  if (a === b) return pwSet("같은 학교급끼리는 연결할 수 없습니다.", "error");
  if (a > b) return pwSet("거꾸로(상급 → 하급) 연결은 할 수 없습니다. 초 → 중 → 고 방향으로 선택해 주세요.", "error");
  const { data, error } = await supabase.from("sport_pathways").insert([{ sport, from_school: from, to_school: to, note: document.getElementById("pwNote").value.trim() || null }]).select("id");
  if (error) return pwSet(/duplicate|unique/i.test(error.message) ? "이미 등록된 연계입니다." : "추가 실패: " + error.message, "error");
  if (!data || data.length !== 1) return pwSet("추가되지 않았습니다. 권한을 확인하세요.", "error");
  document.getElementById("pwNote").value = "";
  pwSet("연계를 추가했습니다.", "success"); pwRender();
});

// ---- 현황 보고서 (hwpx) ----
const rpStatus = document.getElementById("rpStatus");
const rpSet = (msg, kind) => { rpStatus.textContent = msg; rpStatus.className = "form-status" + (kind ? " " + kind : ""); };
let rpData = null, rpModel = null;
async function rpFetchAwards(y) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("sport_awards").select("year,competition,sport,school,medal,place").eq("year", y).order("id").range(from, from + 999);
    if (error) throw new Error("성과 기록: " + error.message);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}
function rpRender() {
  rpModel = window.HwpxDocs.teamReportModel(rpData);
  document.getElementById("rpPreview").innerHTML = window.HwpxDocs.teamReportPreview(rpModel, tsEsc);
  document.getElementById("rpInsightBox").style.display = "";
  document.getElementById("rpInsights").value = rpModel.insights.join("\n");
  document.getElementById("rpDownloadBtn").disabled = false;
}
document.getElementById("rpPreviewBtn").addEventListener("click", async () => {
  const year = Number(document.getElementById("rpYear").value), awardYear = Number(document.getElementById("rpAwardYear").value);
  if (!year || !awardYear) return rpSet("학년도와 성과 연도를 입력해 주세요.", "error");
  if (!window.HwpxDocs) return rpSet("한글 파일 도구를 불러오지 못했습니다.", "error");
  rpSet("자료를 모으는 중…");
  try {
    const teams = await tsFetchAll("sport_teams", year);
    if (!teams.length) return rpSet(`${year}학년도 운동부 자료가 없습니다.`, "error");
    const prevTeams = await tsFetchAll("sport_teams", year - 1);
    const awards = await rpFetchAwards(awardYear);
    const pw = await supabase.from("sport_pathways").select("*");
    const prev = prevTeams.length ? { teams: prevTeams.length, schools: new Set(prevTeams.map((t) => t.school)).size, players: prevTeams.reduce((a, t) => a + (t.players_m || 0) + (t.players_f || 0), 0) } : null;
    const diag = pw.error ? [] : diagnose(teams, pw.data || []);
    rpData = { year, awardYear, teams, prev, awards, diag, today: new Date() };
    rpRender();
    rpSet(pw.error ? "연계 정보(sport_pathways)를 읽지 못해 3장은 '자료 없음'으로 표시했습니다." : "미리보기를 확인하고 시사점을 고친 뒤 [한글 내려받기]를 누르세요.", pw.error ? "error" : "");
  } catch (e) { rpSet("자료를 불러오지 못했습니다: " + e.message, "error"); }
});
document.getElementById("rpApplyBtn").addEventListener("click", () => {
  if (!rpData) return;
  rpData.insights = document.getElementById("rpInsights").value.split("\n").map((x) => x.trim()).filter(Boolean);
  const keep = rpData.insights; rpRender(); document.getElementById("rpInsights").value = keep.join("\n");
});
document.getElementById("rpDownloadBtn").addEventListener("click", async () => {
  if (!rpData) return;
  rpData.insights = document.getElementById("rpInsights").value.split("\n").map((x) => x.trim()).filter(Boolean);
  try {
    const { blob, model } = await window.HwpxDocs.buildTeamReport(window.HwpxDocs.teamReportModel(rpData), { today: new Date() });
    downloadBlob(blob, window.HwpxDocs.teamReportFileName(model));
    rpSet("한글 파일을 만들었습니다. 한글에서 열어 표·줄바꿈·쪽수를 꼭 확인해 주세요.", "success");
  } catch (e) { rpSet("한글 파일 만들기 실패: " + e.message, "error"); }
});

// ================= 개인정보 파기 · 업로드 원본 파일 관리 =================
const purgeSel = document.getElementById("purgeCompetition");
const purgeStatus = document.getElementById("purgeStatus");
const purgeRunBtn = document.getElementById("purgeRunBtn");
let purgeCounts = null;
const purgeSet = (msg, kind) => { purgeStatus.textContent = msg; purgeStatus.className = "form-status" + (kind ? " " + kind : ""); };
const PURGE_TABLES = [["results", "대회 결과(results)"], ["applications", "신청자(applications)"], ["bulk_applications", "교사 일괄 신청(bulk_applications)"]];
purgeSel.addEventListener("change", () => { purgeCounts = null; purgeRunBtn.disabled = true; document.getElementById("purgeResult").innerHTML = ""; });

async function purgeCount(table, comp) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("competition", comp);
  if (error) throw new Error(`${table} 건수 확인 실패: ${error.message}`);
  return count || 0;
}
document.getElementById("purgeCheckBtn").addEventListener("click", async () => {
  const comp = purgeSel.value;
  if (!comp) return purgeSet("대회를 선택해 주세요.", "error");
  purgeSet("건수를 확인하는 중…");
  try {
    const c = {};
    for (const [t] of PURGE_TABLES) c[t] = await purgeCount(t, comp);
    purgeCounts = { comp, ...c };
    document.getElementById("purgeResult").innerHTML = `<p><b>${tsEsc(comp)}</b> 파기 대상: ${PURGE_TABLES.map(([t, l]) => `${l} ${c[t]}건`).join(" · ")}</p>`;
    const sum = PURGE_TABLES.reduce((a, [t]) => a + c[t], 0);
    purgeRunBtn.disabled = sum === 0;
    purgeSet(sum ? "대상을 확인한 뒤 [파기 실행]을 누르세요." : "파기할 자료가 없습니다.", sum ? "" : "success");
  } catch (e) { purgeSet(e.message, "error"); }
});

async function purgeDeleteAll(table, comp) {
  const ids = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select("id").eq("competition", comp).order("id").range(from, from + 999);
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
    ids.push(...data.map((r) => r.id));
    if (data.length < 1000) break;
  }
  let deleted = 0;
  await tsChunked(ids, async (chunk) => {
    const { data, error } = await supabase.from(table).delete().in("id", chunk).select("id");
    if (error) throw new Error(`${table} 삭제 실패: ${error.message}`);
    deleted += (data || []).length;
  });
  return { found: ids.length, deleted };
}
purgeRunBtn.addEventListener("click", async () => {
  const pc = purgeCounts;
  if (!pc) return;
  const sumTxt = PURGE_TABLES.map(([t, l]) => `${l} ${pc[t]}건`).join("\n");
  if (!confirm(`[${pc.comp}] 다음 자료를 완전히 삭제합니다.\n${sumTxt}\n\n되돌릴 수 없습니다. 계속할까요?`)) return;
  const typed = prompt(`한 번 더 확인합니다. 파기하려면 '파기'라고 입력하세요.`);
  if (typed !== "파기") return purgeSet("입력이 달라 파기를 취소했습니다.", "error");
  purgeRunBtn.disabled = true;
  purgeSet("파기 중…");
  const done = {}; const when = new Date();
  try {
    for (const [t] of PURGE_TABLES) done[t] = await purgeDeleteAll(t, pc.comp);   // 결과 → 신청 → 일괄 신청 순
  } catch (e) { purgeSet(e.message + " — 일부만 삭제되었을 수 있으니 [파기 대상 확인]으로 다시 확인하세요.", "error"); return; }
  const short = PURGE_TABLES.filter(([t]) => done[t].deleted !== done[t].found);
  const stamp = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}-${String(when.getDate()).padStart(2, "0")} ${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;
  document.getElementById("purgeResult").innerHTML = `<p><b>파기 결과</b> — 대회: ${tsEsc(pc.comp)} · 일시: ${stamp}</p>
    <ul>${PURGE_TABLES.map(([t, l]) => `<li>${l}: 대상 ${done[t].found}건 → 삭제 ${done[t].deleted}건</li>`).join("")}</ul>
    <button type="button" class="btn btn-outline" id="purgeCsvBtn">파기 기록(건수) CSV 내려받기</button>`;
  document.getElementById("purgeCsvBtn").addEventListener("click", () => {
    const csv = "﻿일시,대회,구분,대상 건수,삭제 건수\n" + PURGE_TABLES.map(([t]) => `${stamp},"${pc.comp}",${t},${done[t].found},${done[t].deleted}`).join("\n") + "\n";
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `개인정보파기기록_${pc.comp}_${stamp.replace(/[- :]/g, "").slice(0, 12)}.csv`);
  });
  purgeCounts = null;
  purgeSet(short.length ? `일부가 삭제되지 않았습니다(${short.map(([, l]) => l).join(", ")}) — 권한을 확인하세요.` : "파기를 마쳤습니다. 아래 기록을 내려받아 보관하세요.", short.length ? "error" : "success");
  loadRoster();
});

// ---- bulk-uploads 저장소 원본 파일 ----
const fileStatus = document.getElementById("fileStatus");
const fileDelBtn = document.getElementById("fileDelBtn");
const fileSet = (msg, kind) => { fileStatus.textContent = msg; fileStatus.className = "form-status" + (kind ? " " + kind : ""); };
document.getElementById("fileListBtn").addEventListener("click", loadStorageFiles);
async function loadStorageFiles() {
  fileSet("불러오는 중…");
  const { data, error } = await supabase.storage.from("bulk-uploads").list("", { limit: 1000, sortBy: { column: "created_at", order: "desc" } });
  if (error) return fileSet("목록을 불러오지 못했습니다: " + error.message, "error");
  const files = (data || []).filter((f) => f.id);   // 폴더 제외
  let names = {};
  try {
    const { data: b } = await supabase.from("bulk_applications").select("file_path,file_name,competition,school");
    (b || []).forEach((r) => (names[r.file_path] = r));
  } catch (e) { /* 원래 이름은 없어도 됨 */ }
  const host = document.getElementById("fileList");
  if (!files.length) { host.innerHTML = '<p class="empty-note">저장된 원본 파일이 없습니다.</p>'; fileSet(""); fileDelBtn.disabled = true; return; }
  host.innerHTML = `<table class="result-table"><thead><tr><th><input type="checkbox" id="fileAll" aria-label="전체선택"></th><th>파일</th><th>원래 이름</th><th>대회·학교</th><th>크기</th><th>올린 일시</th></tr></thead><tbody>` +
    files.map((f) => { const n = names[f.name]; const kb = f.metadata && f.metadata.size ? Math.ceil(f.metadata.size / 1024) + "KB" : "";
      return `<tr><td><input type="checkbox" class="fileChk" value="${tsEsc(f.name)}"></td><td>${tsEsc(f.name)}</td><td>${tsEsc(n ? n.file_name : "(연결된 신청 없음)")}</td><td>${tsEsc(n ? [n.competition, n.school].filter(Boolean).join(" · ") : "")}</td><td>${kb}</td><td>${tsEsc(f.created_at ? new Date(f.created_at).toLocaleString("ko-KR") : "")}</td></tr>`; }).join("") + "</tbody></table>";
  fileSet(`파일 ${files.length}개`);
  fileDelBtn.disabled = false;
  document.getElementById("fileAll").addEventListener("change", (e) => host.querySelectorAll(".fileChk").forEach((c) => (c.checked = e.target.checked)));
}
fileDelBtn.addEventListener("click", async () => {
  const names = [...document.querySelectorAll(".fileChk:checked")].map((c) => c.value);
  if (!names.length) return fileSet("삭제할 파일을 체크해 주세요.", "error");
  if (!confirm(`체크한 원본 파일 ${names.length}개를 삭제할까요? 되돌릴 수 없습니다.`)) return;
  let deleted = 0;
  for (let i = 0; i < names.length; i += 100) {
    const { data, error } = await supabase.storage.from("bulk-uploads").remove(names.slice(i, i + 100));
    if (error) return fileSet("삭제 실패: " + error.message, "error");
    deleted += (data || []).length;
  }
  if (deleted !== names.length) fileSet(`${names.length}개 중 ${deleted}개만 삭제되었습니다. 권한을 확인하세요.`, "error");
  else fileSet(`${deleted}개를 삭제했습니다.`, "success");
  const keep = fileStatus.textContent, kind = fileStatus.className;
  await loadStorageFiles();
  fileStatus.textContent = keep; fileStatus.className = kind;
});

checkAuthAndRender();
