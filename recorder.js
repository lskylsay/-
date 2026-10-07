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

  return formatRecord(h, m, s);
}

// 시·분·초 → "12:12" / "1:12:12" (기록 칸·DB에 저장되는 형식)
function formatRecord(h, m, s) {
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

// 저장 오류를 쉬운 말로 (권한 정책에 막힌 경우)
function friendlyError(error) {
  const msg = String((error && error.message) || error || "");
  return /row-level security/i.test(msg) ? "저장 권한 오류가 났습니다. 관리자에게 알려 주세요." : msg;
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
      recStatus.textContent = `${row.name} 기록 삭제 실패: ` + friendlyError(error);
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
    recStatus.textContent = `${row.name} 저장 실패: ` + friendlyError(error);
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
  // 붙여넣기 상자에 아직 채우지 않은(또는 채운 뒤 바뀐) 내용이 있으면 먼저 기록 칸에 채운 뒤 이어서 저장
  // 이미 채운 내용과 같으면 다시 채우지 않음 — 채운 뒤 표에서 직접 고친 값을 덮어쓰지 않기 위해
  const pastedFromBox = recPasteText.value.trim() !== "";
  if (pastedFromBox && pasteKey() !== lastAppliedPaste) {
    const filled = applyPastedRecords();
    if (filled === 0) {
      const msg = "붙여넣은 기록을 기록 칸에 채우지 못했습니다. 대회·종목/부문 선택과 배번을 확인하세요.";
      recPasteResult.prepend(pasteResultLine({ text: msg, tone: "error" }));
      recStatus.textContent = msg;
      recStatus.className = "form-status error";
      return;
    }
  }

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
    recStatus.textContent = "기록 칸이 비어 있습니다. 기록을 입력하거나, 붙여넣기 후 [기록 칸에 채우기]를 누르세요.";
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
    if (error) errors.push("일괄 저장 실패: " + friendlyError(error));
    else messages.push(`${rowsToSave.length}명 저장 완료`);
  }

  if (rowsToDelete.length > 0) {
    const { deletedIds, error } = await deleteResults(rowsToDelete.map(({ row }) => row.applications_id));
    if (error) {
      errors.push("기록 삭제 실패: " + friendlyError(error));
    } else {
      const deleted = new Set(deletedIds);
      const blocked = rowsToDelete.length - deleted.size;
      if (deleted.size > 0) messages.push(`${deleted.size}명 기록 삭제 완료`);
      if (blocked > 0) errors.push(`${blocked}명 ` + DELETE_BLOCKED_MSG);
    }
  }

  // 저장에 실패한 게 하나라도 있으면 명단을 다시 불러오지 않음 — 입력한 기록을 지우지 않고 그대로 둠
  // 모두 성공했을 때만 다시 불러와 저장된 값으로 표를 새로 그림 (분홍색 표시도 이때 원래 색으로 돌아감)
  // 명단을 다시 불러오면 상태 문구가 초기화되므로, 다시 불러온 뒤 결과를 표시
  if (errors.length === 0) {
    await loadRowsForSport();
    if (rowsToSave.length > 0 && (pastedFromBox || recPasteResult.childElementCount > 0)) {
      showPasteResult([{ text: `${rowsToSave.length}명 저장 완료`, tone: "ok" }]);
    }
  }

  recStatus.textContent = [...errors, ...messages].join(" / ").replace(/\.?$/, ".");
  recStatus.className = errors.length > 0 ? "form-status error" : "form-status success";
});

/* ============ 기록 한꺼번에 붙여넣기 ============ */
// 여러 기록원이 모은 결과표(순위 / 이름·번호 / 기록 / 1위와 차이)를 붙여넣으면
// 이름/번호 칸의 숫자를 배번으로 보고, 기록은 소수점 아래를 버려 초 단위까지만 기록 칸에 채웁니다.
// [기록 칸에 채우기]는 저장하지 않습니다 — 확인 후 "입력한 기록 전체 저장"으로 저장합니다.
// [기록 칸에 채우기]를 누르지 않고 바로 "입력한 기록 전체 저장"을 눌러도 먼저 채운 뒤 저장합니다.

const recPasteText = document.getElementById("recPasteText");
const recPasteResult = document.getElementById("recPasteResult");

// 마지막으로 기록 칸에 채운 붙여넣기 내용 (대회·종목/부문 포함). 같은 내용이면 저장할 때 다시 채우지 않음
let lastAppliedPaste = null;
function pasteKey() {
  return [recCompetition.value, recSport.value, recPasteText.value.trim()].join("\n");
}

// 기록: 12:34.56 / 1:02:03.4 / 12:34 (소수점은 있어도 되고 없어도 됨)
const PASTE_TIME_RE = /(\d+):(\d{1,2})(?::(\d{1,2}))?(?:[.,]\d+)?/;

// 이름/번호 칸 글자 → { bib } | { error }
// 이름이 같이 적혀 있어도 번호(숫자)만 배번으로 뽑음: "홍길동 12", "12 홍길동", "홍길동(12)", "12번 홍길동", "#12" → 12
function extractBib(text) {
  // 번호라고 표시된 숫자가 있으면 그것을 우선: 14번 / #14 / No.14 / 번호 14
  const tagged = /(\d+)\s*번|(?:#|\bno\.?|번호)\s*[:：]?\s*(\d+)/i.exec(text);
  if (tagged) return { bib: parseInt(tagged[1] ?? tagged[2], 10) };

  const runs = text.match(/\d+/g) || [];
  if (runs.length === 0) return { error: "이름/번호 칸에서 배번 숫자를 찾지 못함" };
  // 숫자가 여러 개인데 번호 표시도 없으면 엉뚱한 선수에게 들어갈 수 있어 추측하지 않음
  if (runs.length > 1) return { error: "이름/번호 칸에 숫자가 여러 개라 어느 것이 배번인지 알 수 없음" };
  return { bib: parseInt(runs[0], 10) };
}

// 한 줄 → { bib, record } | { header: true } | { error }
function parsePastedLine(line) {
  const tm = PASTE_TIME_RE.exec(line);
  if (!tm) {
    // "순위 이름/번호 기록 1위와 차이" 같은 제목 줄은 조용히 건너뜀
    return /순위|이름|번호|기록/.test(line) ? { header: true } : { error: "기록 시간을 찾지 못함" };
  }

  // 기록 앞쪽 글자들(순위·이름·번호). 탭으로 나뉜 표면 칸 단위로, 아니면 공백 단위로 나눔
  let before;
  if (line.includes("\t")) {
    const cells = line.split("\t").map((c) => c.trim());
    const ti = cells.findIndex((c) => PASTE_TIME_RE.test(c));
    before = ti > 0 ? cells.slice(0, ti) : [];
  } else {
    before = line.slice(0, tm.index).trim().split(/\s+/).filter(Boolean);
  }
  // 맨 앞이 순위(1, 2, 1위…)면 뺌. 앞쪽 글자가 그것뿐이면 배번일 수 있어 그대로 둠
  if (before.length > 1 && /^\d+\s*[위등]?$/.test(before[0])) before.shift();

  const found = extractBib(before.join(" "));
  if (found.error) return { error: found.error };

  let h = 0, m, s;
  if (tm[3] !== undefined) {
    h = parseInt(tm[1], 10); m = parseInt(tm[2], 10); s = parseInt(tm[3], 10);
  } else {
    m = parseInt(tm[1], 10); s = parseInt(tm[2], 10);
  }
  const total = h * 3600 + m * 60 + s; // 소수점 아래는 이미 버려진 상태
  return {
    bib: found.bib,
    record: formatRecord(Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60),
  };
}

function pasteResultLine({ text, tone }) {
  const p = document.createElement("p");
  p.style.margin = "0 0 4px";
  p.style.color =
    tone === "ok" ? "var(--pine)" : tone === "warn" ? "var(--clay-dark)" : tone === "error" ? "#C62828" : "var(--ink)";
  if (tone === "error") p.style.fontWeight = "700";
  p.textContent = text; // 붙여넣은 글자는 HTML이 아니라 글자 그대로 표시
  return p;
}

function showPasteResult(lines) {
  recPasteResult.replaceChildren(...lines.map(pasteResultLine));
}

// 붙여넣은 기록을 기록 칸에 채우고, 채운 사람 수를 돌려줌
function applyPastedRecords() {
  if (!recCompetition.value || !recSport.value) {
    showPasteResult([{ text: "먼저 위에서 대회와 종목/부문을 선택하세요.", tone: "warn" }]);
    return 0;
  }
  if (!recPasteText.value.trim()) {
    showPasteResult([{ text: "붙여넣은 내용이 없습니다.", tone: "warn" }]);
    return 0;
  }

  const records = new Map(); // 배번 → 기록 (같은 배번이 또 나오면 첫 번째만)
  const duplicates = [];
  const skipped = [];
  recPasteText.value.split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    const parsed = parsePastedLine(line);
    if (parsed.header) return;
    if (parsed.error) {
      skipped.push(`"${line.length > 40 ? line.slice(0, 40) + "…" : line}" — ${parsed.error}`);
    } else if (records.has(parsed.bib)) {
      duplicates.push(parsed.bib);
    } else {
      records.set(parsed.bib, parsed.record);
    }
  });

  // 배번 검색으로 일부 행만 보이는 중이면 모든 행이 보이도록 검색을 풀고 다시 그림
  if (bibFilter) {
    bibFilter = "";
    recBibSearch.value = "";
    renderRecTable();
  }

  let filled = 0;
  let overwritten = 0;
  const missing = [];
  records.forEach((record, bib) => {
    const idx = currentRows.findIndex((r) => r.bib != null && Number(r.bib) === bib);
    const input = idx >= 0 ? recTableBody.querySelector(`.rec-rank-input[data-idx="${idx}"]`) : null;
    if (!input) {
      missing.push(bib);
      return;
    }
    const before = input.value.trim();
    if (before && before !== record) overwritten++;
    input.value = record;
    input.style.background = "#FBF0EC"; // 방금 채운 칸 표시
    filled++;
  });

  const lines = [];
  lines.push(
    filled > 0
      ? { text: `${filled}명의 기록을 기록 칸에 채웠습니다. 맞는지 확인한 뒤 [입력한 기록 전체 저장]을 눌러 저장하세요.`, tone: "ok" }
      : { text: "기록 칸에 채워진 기록이 없습니다.", tone: "warn" }
  );
  if (overwritten > 0) lines.push({ text: `이미 입력돼 있던 기록 ${overwritten}건은 붙여넣은 기록으로 바꿨습니다.`, tone: "warn" });
  if (missing.length > 0) lines.push({ text: `이 종목 명단에 없는 배번: ${missing.join(", ")} — 종목/부문을 잘못 골랐는지 확인하세요.`, tone: "warn" });
  if (duplicates.length > 0) lines.push({ text: `같은 배번이 여러 번 나와 첫 번째 기록만 썼습니다: ${Array.from(new Set(duplicates)).join(", ")}`, tone: "warn" });
  skipped.slice(0, 5).forEach((s) => lines.push({ text: `읽지 못한 줄: ${s}`, tone: "warn" }));
  if (skipped.length > 5) lines.push({ text: `…읽지 못한 줄이 ${skipped.length - 5}개 더 있습니다.`, tone: "warn" });
  showPasteResult(lines);
  if (filled > 0) lastAppliedPaste = pasteKey();
  return filled;
}

document.getElementById("recPasteApplyBtn").addEventListener("click", applyPastedRecords);
document.getElementById("recPasteClearBtn").addEventListener("click", () => {
  recPasteText.value = "";
  lastAppliedPaste = null;
  recPasteResult.replaceChildren();
});

recCompetition.addEventListener("change", loadRosterForCompetition);
recSport.addEventListener("change", loadRowsForSport);
recRefreshBtn.addEventListener("click", () => {
  if (recSport.value) loadRowsForSport();
  else if (recCompetition.value) loadRosterForCompetition();
});
