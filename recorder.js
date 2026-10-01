// 경기기록원 페이지 로직
// - PIN(6680)은 간단한 입장 장치일 뿐, 실제 보안은 Supabase 쪽 권한 설계로 처리됩니다.
// - 참가자 명단은 개인정보(연락처 등)를 제외하고 get_recorder_roster() 함수를 통해서만 읽어옵니다.
// - 입력한 기록은 results 테이블에 applications_id 기준으로 upsert 됩니다.
// - 기록 칸을 비우고 저장하면 이미 저장된 results 행을 삭제합니다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const RECORDER_PIN = "6680";

const pinGate = document.getElementById("pinGate");
const pinInput = document.getElementById("pinInput");
const pinSubmitBtn = document.getElementById("pinSubmitBtn");
const pinError = document.getElementById("pinError");
const recorderApp = document.getElementById("recorderApp");

function tryEnter() {
  if (pinInput.value.trim() === RECORDER_PIN) {
    pinGate.style.display = "none";
    recorderApp.style.display = "";
  } else {
    pinError.textContent = "비밀번호가 올바르지 않습니다.";
  }
}

pinSubmitBtn.addEventListener("click", tryEnter);
pinInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") tryEnter();
});

/* ============ 탭: 기록 입력 / 대회 결과 (실명 확인) ============ */

const recInputTabBtn = document.getElementById("recInputTabBtn");
const recResultsTabBtn = document.getElementById("recResultsTabBtn");
const recInputSection = document.getElementById("recInputSection");
const recResultsSection = document.getElementById("recResultsSection");

function showRecorderTab(tab) {
  recInputTabBtn.classList.toggle("active", tab === "input");
  recResultsTabBtn.classList.toggle("active", tab === "results");
  recInputSection.style.display = tab === "input" ? "" : "none";
  recResultsSection.style.display = tab === "results" ? "" : "none";
  // 결과 탭을 열 때마다 다시 불러와 방금 입력한 기록까지 반영 (script.js가 처리)
  if (tab === "results") window.dispatchEvent(new Event("results:reload"));
}

recInputTabBtn.addEventListener("click", () => showRecorderTab("input"));
recResultsTabBtn.addEventListener("click", () => showRecorderTab("results"));

/* ============ 대회/종목 선택 및 명단 로딩 ============ */

const recCompetition = document.getElementById("recCompetition");
const recSport = document.getElementById("recSport");
const recRefreshBtn = document.getElementById("recRefreshBtn");
const recSaveAllBtn = document.getElementById("recSaveAllBtn");
const recStatus = document.getElementById("recStatus");
const recTableBody = document.getElementById("recTableBody");
const recBibSearch = document.getElementById("recBibSearch");

let rosterByCompetition = []; // 현재 선택된 대회의 전체 참가자 (종목 선택용)
let currentRows = []; // 현재 선택된 대회+종목의 명단 (결과 매칭 포함)
let bibFilter = "";

async function loadRosterForCompetition() {
  const competition = recCompetition.value;
  recSport.innerHTML = '<option value="">선택</option>';
  recSport.disabled = true;
  recTableBody.innerHTML = "";

  if (!competition) return;

  const { data, error } = await supabase.rpc("get_recorder_roster", { comp: competition });

  if (error) {
    recStatus.textContent = "명단을 불러오지 못했습니다: " + error.message;
    recStatus.className = "form-status error";
    return;
  }

  rosterByCompetition = data || [];
  const sports = Array.from(new Set(rosterByCompetition.map((r) => r.sport).filter(Boolean)));

  if (sports.length === 0) {
    recSport.innerHTML = '<option value="">해당 대회의 참가 신청이 아직 없습니다</option>';
    return;
  }

  sports.forEach((s) => {
    const o = document.createElement("option");
    o.value = s;
    o.textContent = s;
    recSport.appendChild(o);
  });
  recSport.disabled = false;
}

async function loadRowsForSport() {
  const competition = recCompetition.value;
  const sport = recSport.value;
  recTableBody.innerHTML = "";

  if (!competition || !sport) return;

  recStatus.textContent = "명단 불러오는 중…";
  recStatus.className = "form-status";

  const roster = rosterByCompetition.filter((r) => r.sport === sport);

  const { data: existingResults, error } = await supabase
    .from("results")
    .select("*")
    .eq("competition", competition)
    .eq("division", sport);

  if (error) {
    recStatus.textContent = "기존 기록을 불러오지 못했습니다: " + error.message;
    recStatus.className = "form-status error";
  } else {
    recStatus.textContent = "";
  }

  const resultsByAppId = new Map();
  (existingResults || []).forEach((r) => {
    if (r.applications_id != null) resultsByAppId.set(r.applications_id, r);
  });

  currentRows = roster
    .map((r) => {
      const existing = resultsByAppId.get(r.id);
      return {
        applications_id: r.id,
        bib: r.bib_number,
        school: r.school,
        name: r.name,
        rank: existing ? (existing.record_time || existing.rank || "") : "",
        note: existing ? existing.note || "" : "",
        resultId: existing ? existing.id : null,
      };
    })
    .sort((a, b) => {
      if (a.bib == null && b.bib == null) return 0;
      if (a.bib == null) return 1;
      if (b.bib == null) return -1;
      return a.bib - b.bib;
    });

  bibFilter = "";
  recBibSearch.value = "";
  renderRecTable();
}

function renderRecTable() {
  const filtered = bibFilter
    ? currentRows.filter((r) => String(r.bib ?? "").startsWith(bibFilter))
    : currentRows;

  if (filtered.length === 0) {
    const msg = bibFilter
      ? `배번 "${bibFilter}"에 해당하는 참가자를 찾을 수 없습니다. (현재 명단 총 ${currentRows.length}명 중)`
      : "이 종목에 해당하는 참가자가 없습니다.";
    recTableBody.innerHTML = `<tr><td colspan="6" class="empty-note">${msg}</td></tr>`;
    return;
  }

  recTableBody.innerHTML = filtered
    .map((row) => {
      const idx = currentRows.indexOf(row);
      return `
      <tr${bibFilter && String(row.bib ?? "") === bibFilter ? ' style="background:#FBF0EC;"' : ""}>
        <td style="font-family:var(--font-mono); font-weight:700;">${row.bib ?? ""}</td>
        <td>${row.school || ""}</td>
        <td>${row.name || ""}</td>
        <td><input type="text" inputmode="numeric" placeholder="예: 1212" class="rec-rank-input" data-idx="${idx}" value="${row.rank}" style="width:90px; padding:6px; border:1px solid var(--line); border-radius:4px;"></td>
        <td><input type="text" class="rec-note-input" data-idx="${idx}" value="${row.note}" style="width:100%; padding:6px; border:1px solid var(--line); border-radius:4px;"></td>
        <td><button type="button" class="btn btn-outline rec-save-btn" data-idx="${idx}" style="font-size:0.78rem; padding:6px 10px;">저장</button></td>
      </tr>`;
    })
    .join("");

  recTableBody.querySelectorAll(".rec-save-btn").forEach((btn) => {
    btn.addEventListener("click", () => saveRow(Number(btn.dataset.idx)));
  });

  recTableBody.querySelectorAll(".rec-rank-input").forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveRowAndAdvance(Number(input.dataset.idx));
      }
    });
  });

  // 검색어와 정확히 일치하는 배번이 하나면 기록 입력란에 바로 포커스
  if (bibFilter && filtered.length >= 1) {
    const exactIdx = currentRows.indexOf(filtered[0]);
    const rankInput = recTableBody.querySelector(`.rec-rank-input[data-idx="${exactIdx}"]`);
    if (rankInput) {
      rankInput.focus();
      rankInput.select();
    }
  }
}

async function saveRowAndAdvance(idx) {
  await saveRow(idx);
  bibFilter = "";
  recBibSearch.value = "";
  renderRecTable();
  recBibSearch.focus();
}

function sanitizeSearchInput() {
  const digitsOnly = recBibSearch.value.replace(/\D/g, "");
  if (digitsOnly !== recBibSearch.value) recBibSearch.value = digitsOnly;
}

function runSearch() {
  sanitizeSearchInput();
  bibFilter = recBibSearch.value;
  renderRecTable();
}

recBibSearch.addEventListener("input", sanitizeSearchInput);
recBibSearch.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runSearch();
});
document.getElementById("recBibSearchBtn").addEventListener("click", runSearch);

// "1212" → "12:12", "11212" → "1:12:12" 처럼 숫자만 입력해도 시:분:초 형식으로 변환
function parseTimeInput(raw) {
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;

  let h = 0, m = 0, s = 0;
  if (digits.length <= 2) {
    s = parseInt(digits, 10);
  } else if (digits.length <= 4) {
    const padded = digits.padStart(4, "0");
    m = parseInt(padded.slice(0, 2), 10);
    s = parseInt(padded.slice(2), 10);
  } else {
    s = parseInt(digits.slice(-2), 10);
    m = parseInt(digits.slice(-4, -2), 10);
    h = parseInt(digits.slice(0, -4), 10);
  }

  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

// 기록 칸을 비우고 저장한 행의 results 를 applications_id 기준으로 삭제합니다.
// RLS 로 삭제가 막히면 Supabase 는 오류 없이 0건만 삭제하므로, 삭제된 행을 돌려받아
// 실제로 지워진 applications_id 목록을 반환합니다.
async function deleteResults(appIds) {
  const { data, error } = await supabase
    .from("results")
    .delete()
    .in("applications_id", appIds)
    .select("applications_id");

  if (error) return { deletedIds: [], error };
  return { deletedIds: (data || []).map((r) => r.applications_id), error: null };
}

const DELETE_BLOCKED_MSG = "삭제 권한이 없어 기록을 지우지 못했습니다. (Supabase results 테이블 삭제 정책 확인 필요)";

function clearRowInputs(row, rankInput, noteInput) {
  row.rank = "";
  row.note = "";
  row.resultId = null;
  if (rankInput) rankInput.value = "";
  if (noteInput) noteInput.value = "";
}

async function saveRow(idx) {
  const row = currentRows[idx];
  const rankInput = recTableBody.querySelector(`.rec-rank-input[data-idx="${idx}"]`);
  const noteInput = recTableBody.querySelector(`.rec-note-input[data-idx="${idx}"]`);
  const rawInput = rankInput.value.trim();
  const note = noteInput.value;

  if (!rawInput) {
    // 저장된 기록이 없으면 입력칸만 비우고 조용히 넘어감
    if (row.resultId == null) {
      clearRowInputs(row, rankInput, noteInput);
      recStatus.textContent = "";
      recStatus.className = "form-status";
      return;
    }

    const { deletedIds, error } = await deleteResults([row.applications_id]);

    if (error) {
      recStatus.textContent = `${row.name} 기록 삭제 실패: ` + error.message;
      recStatus.className = "form-status error";
      return;
    }
    if (deletedIds.length === 0) {
      recStatus.textContent = `${row.name}: ` + DELETE_BLOCKED_MSG;
      recStatus.className = "form-status error";
      return;
    }

    clearRowInputs(row, rankInput, noteInput);
    recStatus.textContent = `${row.name} 기록 삭제 완료.`;
    recStatus.className = "form-status success";
    return;
  }

  const recordTime = parseTimeInput(rawInput);
  rankInput.value = recordTime; // 입력창에도 변환된 시간 형식을 그대로 보여줌

  const payload = {
    competition: recCompetition.value,
    division: recSport.value,
    rank: null,
    record_time: recordTime,
    name: row.name,
    note: note || null,
    applications_id: row.applications_id,
  };

  const { data, error } = await supabase
    .from("results")
    .upsert(payload, { onConflict: "applications_id" })
    .select();

  if (error) {
    recStatus.textContent = `${row.name} 저장 실패: ` + error.message;
    recStatus.className = "form-status error";
    return;
  }

  if (data && data[0]) {
    row.resultId = data[0].id;
    row.rank = recordTime;
    row.note = note;
  }

  recStatus.textContent = `${row.name} 저장 완료.`;
  recStatus.className = "form-status success";
}

recSaveAllBtn.addEventListener("click", async () => {
  const rowsToSave = [];
  const rowsToDelete = [];

  currentRows.forEach((row, idx) => {
    const rankInput = recTableBody.querySelector(`.rec-rank-input[data-idx="${idx}"]`);
    const noteInput = recTableBody.querySelector(`.rec-note-input[data-idx="${idx}"]`);
    if (!rankInput) return; // 배번 검색으로 화면에 없는 행은 건드리지 않음

    if (rankInput.value.trim()) {
      rowsToSave.push({ row, rankInput, noteInput });
    } else if (row.resultId != null) {
      rowsToDelete.push({ row, rankInput, noteInput });
    } else {
      clearRowInputs(row, rankInput, noteInput);
    }
  });

  if (rowsToSave.length === 0 && rowsToDelete.length === 0) {
    recStatus.textContent = "저장하거나 삭제할 기록이 없습니다.";
    recStatus.className = "form-status";
    return;
  }

  recStatus.textContent = "저장 중…";
  recStatus.className = "form-status";

  const messages = [];
  const errors = [];

  if (rowsToSave.length > 0) {
    const payload = rowsToSave.map(({ row, rankInput, noteInput }) => ({
      competition: recCompetition.value,
      division: recSport.value,
      rank: null,
      record_time: parseTimeInput(rankInput.value),
      name: row.name,
      note: noteInput.value || null,
      applications_id: row.applications_id,
    }));

    const { error } = await supabase.from("results").upsert(payload, { onConflict: "applications_id" });
    if (error) errors.push("일괄 저장 실패: " + error.message);
    else messages.push(`${rowsToSave.length}명 저장 완료`);
  }

  if (rowsToDelete.length > 0) {
    const { deletedIds, error } = await deleteResults(rowsToDelete.map(({ row }) => row.applications_id));
    if (error) {
      errors.push("기록 삭제 실패: " + error.message);
    } else {
      const deleted = new Set(deletedIds);
      const blocked = rowsToDelete.length - deleted.size;
      if (deleted.size > 0) messages.push(`${deleted.size}명 기록 삭제 완료`);
      if (blocked > 0) errors.push(`${blocked}명 ` + DELETE_BLOCKED_MSG);
    }
  }

  // 명단을 다시 불러오면 상태 문구가 초기화되므로, 다시 불러온 뒤 결과를 표시
  await loadRowsForSport();

  recStatus.textContent = [...errors, ...messages].join(" / ") + ".";
  recStatus.className = errors.length > 0 ? "form-status error" : "form-status success";
});

recCompetition.addEventListener("change", loadRosterForCompetition);
recSport.addEventListener("change", loadRowsForSport);
recRefreshBtn.addEventListener("click", () => {
  if (recSport.value) loadRowsForSport();
  else if (recCompetition.value) loadRosterForCompetition();
});
