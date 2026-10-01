// 경기기록원 페이지 로직
// - PIN(6680)은 간단한 입장 장치일 뿐, 실제 보안은 Supabase 쪽 권한 설계로 처리됩니다.
// - 참가자 명단은 개인정보(연락처 등)를 제외하고 get_recorder_roster() 함수를 통해서만 읽어옵니다.
// - 입력한 순위는 results 테이블에 applications_id 기준으로 upsert 됩니다.

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

/* ============ 대회/종목 선택 및 명단 로딩 ============ */

const recCompetition = document.getElementById("recCompetition");
const recSport = document.getElementById("recSport");
const recRefreshBtn = document.getElementById("recRefreshBtn");
const recSaveAllBtn = document.getElementById("recSaveAllBtn");
const recStatus = document.getElementById("recStatus");
const recTableBody = document.getElementById("recTableBody");

let rosterByCompetition = []; // 현재 선택된 대회의 전체 참가자 (종목 선택용)
let currentRows = []; // 현재 선택된 대회+종목의 명단 (결과 매칭 포함)

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
        rank: existing ? existing.rank : "",
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

  renderRecTable();
}

function renderRecTable() {
  recTableBody.innerHTML = currentRows
    .map(
      (row, idx) => `
      <tr>
        <td style="font-family:var(--font-mono); font-weight:700;">${row.bib ?? ""}</td>
        <td>${row.school || ""}</td>
        <td>${row.name || ""}</td>
        <td><input type="number" min="1" class="rec-rank-input" data-idx="${idx}" value="${row.rank}" style="width:70px; padding:6px; border:1px solid var(--line); border-radius:4px;"></td>
        <td><input type="text" class="rec-note-input" data-idx="${idx}" value="${row.note}" style="width:100%; padding:6px; border:1px solid var(--line); border-radius:4px;"></td>
        <td><button type="button" class="btn btn-outline rec-save-btn" data-idx="${idx}" style="font-size:0.78rem; padding:6px 10px;">저장</button></td>
      </tr>`
    )
    .join("");

  recTableBody.querySelectorAll(".rec-save-btn").forEach((btn) => {
    btn.addEventListener("click", () => saveRow(Number(btn.dataset.idx)));
  });
}

async function saveRow(idx) {
  const row = currentRows[idx];
  const rankInput = recTableBody.querySelector(`.rec-rank-input[data-idx="${idx}"]`);
  const noteInput = recTableBody.querySelector(`.rec-note-input[data-idx="${idx}"]`);
  const rank = rankInput.value;
  const note = noteInput.value;

  if (!rank) {
    recStatus.textContent = `${row.name}: 순위를 입력해 주세요.`;
    recStatus.className = "form-status error";
    return;
  }

  const payload = {
    competition: recCompetition.value,
    division: recSport.value,
    rank: Number(rank),
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
    row.rank = rank;
    row.note = note;
  }

  recStatus.textContent = `${row.name} 저장 완료.`;
  recStatus.className = "form-status success";
}

recSaveAllBtn.addEventListener("click", async () => {
  const rowsToSave = currentRows
    .map((row, idx) => ({ row, idx }))
    .filter(({ idx }) => {
      const rankInput = recTableBody.querySelector(`.rec-rank-input[data-idx="${idx}"]`);
      return rankInput && rankInput.value;
    });

  if (rowsToSave.length === 0) {
    recStatus.textContent = "입력된 순위가 없습니다.";
    recStatus.className = "form-status error";
    return;
  }

  recStatus.textContent = `${rowsToSave.length}명 저장 중…`;
  recStatus.className = "form-status";

  const payload = rowsToSave.map(({ row, idx }) => {
    const rankInput = recTableBody.querySelector(`.rec-rank-input[data-idx="${idx}"]`);
    const noteInput = recTableBody.querySelector(`.rec-note-input[data-idx="${idx}"]`);
    return {
      competition: recCompetition.value,
      division: recSport.value,
      rank: Number(rankInput.value),
      name: row.name,
      note: noteInput.value || null,
      applications_id: row.applications_id,
    };
  });

  const { error } = await supabase.from("results").upsert(payload, { onConflict: "applications_id" });

  if (error) {
    recStatus.textContent = "일괄 저장 실패: " + error.message;
    recStatus.className = "form-status error";
    return;
  }

  recStatus.textContent = `${rowsToSave.length}명 저장 완료.`;
  recStatus.className = "form-status success";
  loadRowsForSport();
});

recCompetition.addEventListener("change", loadRosterForCompetition);
recSport.addEventListener("change", loadRowsForSport);
recRefreshBtn.addEventListener("click", () => {
  if (recSport.value) loadRowsForSport();
  else if (recCompetition.value) loadRosterForCompetition();
});
