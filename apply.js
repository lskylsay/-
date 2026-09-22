// 신청 폼 제출 로직
// - 대회를 선택하면 종목/참가유형 select가 자동으로 채워집니다.
// - 트랙마라톤 축제는 "개인 신청"과 "교사 일괄 신청(학교 단위)" 두 가지 모드를 지원합니다.
// - 최종 데이터는 config.js 의 값을 이용해 Supabase에 바로 저장됩니다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// 대회별 종목/참가유형 목록
const SPORT_OPTIONS = {
  "트랙마라톤 축제": [
    "3km 마라톤 (초등학교 4·5·6학년 및 초등학교 교직원부)",
    "5km 마라톤 (중고등학생 및 중고등학교 교직원)",
  ],
  "충북교육감기 육상대회": [
    "숙박형",
    "1일 왕복형",
  ],
};

// 육상대회의 희망 참가일 목록 (참가유형에 따라 다름)
const DATE_OPTIONS = {
  "숙박형": ["11.9(월)", "11.10(화)", "11.11(수)", "11.9(월)~11.10(화)", "11.10(화)~11.11(수)", "11.9(월)~11.11(수) 전체"],
  "1일 왕복형": ["11.10(화)", "11.11(수)", "11.12(목)", "11.10(화)~11.11(수)", "11.11(수)~11.12(목)", "11.10(화)~11.12(목) 전체"],
};

// 교사 일괄 신청은 트랙마라톤 축제에서만 지원합니다 (제공된 신청서 양식 기준).
const BULK_ENABLED_COMPETITIONS = ["트랙마라톤 축제"];

const competitionSelect = document.getElementById("competition");
const sportSelect = document.getElementById("sport");
const preferredDatesField = document.getElementById("preferredDatesField");
const preferredDatesSelect = document.getElementById("preferredDates");

function fillSelect(select, options, placeholder) {
  select.innerHTML = "";
  const ph = document.createElement("option");
  ph.value = "";
  ph.textContent = placeholder;
  select.appendChild(ph);
  options.forEach((opt) => {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    select.appendChild(o);
  });
}

competitionSelect.addEventListener("change", () => {
  const comp = competitionSelect.value;
  const sports = SPORT_OPTIONS[comp] || [];

  if (sports.length) {
    fillSelect(sportSelect, sports, "선택");
    sportSelect.disabled = false;
  } else {
    fillSelect(sportSelect, [], "먼저 대회를 선택하세요");
    sportSelect.disabled = true;
  }

  preferredDatesField.style.display = "none";
  preferredDatesSelect.required = false;
  fillSelect(preferredDatesSelect, [], "선택");

  updateModeToggleVisibility();
});

sportSelect.addEventListener("change", () => {
  const sport = sportSelect.value;
  const dates = DATE_OPTIONS[sport];

  if (dates) {
    fillSelect(preferredDatesSelect, dates, "선택");
    preferredDatesField.style.display = "";
    preferredDatesSelect.required = true;
  } else {
    preferredDatesField.style.display = "none";
    preferredDatesSelect.required = false;
    fillSelect(preferredDatesSelect, [], "선택");
  }
});

/* ============ 개인 신청 / 교사 일괄 신청 모드 전환 ============ */

const modeToggleRow = document.getElementById("modeToggleRow");
const modeIndividualBtn = document.getElementById("modeIndividualBtn");
const modeBulkBtn = document.getElementById("modeBulkBtn");
const individualFields = document.getElementById("individualFields");
const bulkFields = document.getElementById("bulkFields");

let currentMode = "individual";

function setRequired(container, isRequired) {
  container.querySelectorAll("input, select, textarea").forEach((el) => {
    if (el.dataset.optional === "true") return; // 선택 입력은 건드리지 않음
    el.required = isRequired;
  });
}

function updateModeToggleVisibility() {
  const comp = competitionSelect.value;
  const bulkAllowed = BULK_ENABLED_COMPETITIONS.includes(comp);
  modeToggleRow.style.display = bulkAllowed ? "" : "none";
  if (!bulkAllowed) setMode("individual");
}

function setMode(mode) {
  currentMode = mode;
  const isBulk = mode === "bulk";

  individualFields.style.display = isBulk ? "none" : "";
  bulkFields.style.display = isBulk ? "" : "none";

  modeIndividualBtn.classList.toggle("active", !isBulk);
  modeBulkBtn.classList.toggle("active", isBulk);

  setRequired(individualFields, !isBulk);
  document.getElementById("bulkSchool").required = isBulk;
  document.getElementById("bulkTeacherName").required = isBulk;
  document.getElementById("bulkTeacherContact").required = isBulk;
}

modeIndividualBtn.addEventListener("click", () => setMode("individual"));
modeBulkBtn.addEventListener("click", () => setMode("bulk"));

/* ============ 교사 일괄 신청: 참가자 행 관리 ============ */

const bulkTableBody = document.getElementById("bulkTableBody");
const addRowBtn = document.getElementById("addRowBtn");
let rowCount = 0;

function addParticipantRow() {
  rowCount += 1;
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td class="row-num">${rowCount}</td>
    <td>
      <select class="p-type">
        <option value="학생">학생</option>
        <option value="교직원">교직원</option>
      </select>
    </td>
    <td><input type="text" class="p-grade" placeholder="예: 5"></td>
    <td><input type="text" class="p-class" placeholder="예: 3"></td>
    <td><input type="text" class="p-name" placeholder="성명"></td>
    <td>
      <select class="p-gender">
        <option value="남">남</option>
        <option value="여">여</option>
      </select>
    </td>
    <td><input type="text" class="p-note" placeholder="교직원인 경우 직위"></td>
    <td><button type="button" class="row-remove-btn" title="행 삭제">×</button></td>
  `;
  tr.querySelector(".row-remove-btn").addEventListener("click", () => {
    tr.remove();
    renumberRows();
  });
  bulkTableBody.appendChild(tr);
}

function renumberRows() {
  bulkTableBody.querySelectorAll("tr").forEach((tr, i) => {
    tr.querySelector(".row-num").textContent = i + 1;
  });
}

addRowBtn.addEventListener("click", addParticipantRow);

// 초기 5행 생성
for (let i = 0; i < 5; i++) addParticipantRow();

function collectParticipants() {
  const rows = Array.from(bulkTableBody.querySelectorAll("tr"));
  return rows
    .map((tr) => ({
      type: tr.querySelector(".p-type").value,
      grade: tr.querySelector(".p-grade").value.trim(),
      class_no: tr.querySelector(".p-class").value.trim(),
      name: tr.querySelector(".p-name").value.trim(),
      gender: tr.querySelector(".p-gender").value,
      note: tr.querySelector(".p-note").value.trim(),
    }))
    .filter((p) => p.name); // 성명이 입력된 행만 유효한 참가자로 인정
}

/* ============ URL의 ?competition= 값으로 대회 고정 ============ */

const preselectedCompetition = new URLSearchParams(window.location.search).get("competition");

const COMPETITION_LABELS = {
  "트랙마라톤 축제": "2026. 제천 학교스포츠클럽 트랙마라톤 축제",
  "충북교육감기 육상대회": "제48회 충청북도교육감기 육상대회",
};

if (preselectedCompetition && SPORT_OPTIONS[preselectedCompetition]) {
  competitionSelect.value = preselectedCompetition;
  competitionSelect.dispatchEvent(new Event("change"));

  document.getElementById("competitionField").style.display = "none";
  const lockedNote = document.getElementById("lockedCompetitionNote");
  lockedNote.textContent = "신청 대회: " + COMPETITION_LABELS[preselectedCompetition];
  lockedNote.style.display = "";

  document.getElementById("pageBib").textContent = preselectedCompetition + " 신청";
  document.getElementById("pageTitle").textContent = COMPETITION_LABELS[preselectedCompetition] + " 신청";
  document.getElementById("pageSub").textContent = "아래 양식을 작성해 제출하면 접수가 완료됩니다.";

  document.querySelectorAll("#noticeList li[data-comp]").forEach((li) => {
    if (li.dataset.comp !== preselectedCompetition) li.style.display = "none";
  });
} else {
  updateModeToggleVisibility();
}

/* ============ 제출 처리 ============ */

const form = document.getElementById("applyForm");
const statusEl = document.getElementById("formStatus");
const submitBtn = document.getElementById("submitBtn");

async function getClientIp() {
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const data = await res.json();
    return data.ip || null;
  } catch {
    return null;
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (currentMode === "bulk") {
    const participants = collectParticipants();
    if (participants.length === 0) {
      statusEl.textContent = "참가자 명단을 최소 1명 이상 입력해 주세요.";
      statusEl.className = "form-status error";
      return;
    }
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "제출 중…";
  statusEl.textContent = "";
  statusEl.className = "form-status";

  const ip = await getClientIp();
  let error;

  if (currentMode === "bulk") {
    const payload = {
      competition: competitionSelect.value,
      sport: sportSelect.value,
      school: document.getElementById("bulkSchool").value,
      principal_name: document.getElementById("bulkPrincipal").value || null,
      teacher_name: document.getElementById("bulkTeacherName").value,
      teacher_contact: document.getElementById("bulkTeacherContact").value,
      requested_count: document.getElementById("bulkCapacity").value || null,
      participants: collectParticipants(),
      ip_address: ip,
    };
    ({ error } = await supabase.from("bulk_applications").insert([payload]));
  } else {
    const data = new FormData(form);
    const payload = {
      competition: data.get("competition"),
      sport: data.get("sport"),
      preferred_dates: data.get("preferredDates") || null,
      class_no: data.get("school"),
      grade: data.get("grade"),
      leader_name: data.get("leaderName"),
      contact: data.get("contact"),
      members: data.get("members") || null,
      note: data.get("note") || null,
      ip_address: ip,
    };
    ({ error } = await supabase.from("applications").insert([payload]));
  }

  if (error) {
    statusEl.textContent = "제출에 실패했습니다. 잠시 후 다시 시도해 주세요. (" + error.message + ")";
    statusEl.classList.add("error");
    submitBtn.disabled = false;
    submitBtn.textContent = "신청서 제출";
    return;
  }

  statusEl.textContent = "신청이 접수되었습니다. 감사합니다!";
  statusEl.classList.add("success");
  form.reset();

  if (currentMode === "bulk") {
    bulkTableBody.innerHTML = "";
    rowCount = 0;
    for (let i = 0; i < 5; i++) addParticipantRow();
  } else {
    fillSelect(sportSelect, [], "먼저 대회를 선택하세요");
    sportSelect.disabled = true;
    preferredDatesField.style.display = "none";
  }

  submitBtn.disabled = false;
  submitBtn.textContent = "신청서 제출";
});
