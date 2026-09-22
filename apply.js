// 신청 폼 제출 로직
// - 대회를 선택하면 종목/참가유형 select가 자동으로 채워집니다.
// - 트랙마라톤 축제는 "개인 신청"과 "교사 일괄 신청(학교 단위, 엑셀 업로드)" 두 가지 모드를 지원합니다.
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

// 교사 일괄 신청을 지원하는 대회 목록과, 대회별 다운로드 양식 파일
const BULK_TEMPLATES = {
  "트랙마라톤 축제": {
    app: "marathon-application-template.xlsx",
    consent: "marathon-privacy-consent-template.xlsx",
  },
  "충북교육감기 육상대회": {
    app: "athletics-application-template.xlsx",
    consent: "athletics-privacy-consent-template.xlsx",
  },
};
const BULK_ENABLED_COMPETITIONS = Object.keys(BULK_TEMPLATES);

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

// 다운로드용 개인정보 동의서 양식의 "수집 목적" 문구와 동일한 표현을 사용합니다.
const COMPETITION_SHORT_LABELS = {
  "트랙마라톤 축제": "트랙마라톤 축제",
  "충북교육감기 육상대회": "충청북도교육감기 육상대회",
};

function updatePrivacyPurpose() {
  const comp = competitionSelect.value;
  const purposeEl = document.getElementById("privacyPurposeText");
  purposeEl.textContent = comp
    ? `학교스포츠클럽 대회(${COMPETITION_SHORT_LABELS[comp]}) 참가 신청 접수 및 대회 운영`
    : "학교스포츠클럽 대회 참가 신청 접수 및 대회 운영";
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
  updatePrivacyPurpose();
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
const individualPrivacyBox = document.getElementById("individualPrivacyBox");

let currentMode = "individual";

function setRequired(container, isRequired) {
  container.querySelectorAll("input, select, textarea").forEach((el) => {
    el.required = isRequired;
  });
}

function updateModeToggleVisibility() {
  const comp = competitionSelect.value;
  const bulkAllowed = BULK_ENABLED_COMPETITIONS.includes(comp);
  modeToggleRow.style.display = bulkAllowed ? "" : "none";
  if (!bulkAllowed) {
    setMode("individual");
    return;
  }
  const templates = BULK_TEMPLATES[comp];
  document.getElementById("bulkAppTemplateLink").href = templates.app;
  document.getElementById("bulkConsentTemplateLink").href = templates.consent;
}

function setMode(mode) {
  currentMode = mode;
  const isBulk = mode === "bulk";

  individualFields.style.display = isBulk ? "none" : "";
  bulkFields.style.display = isBulk ? "" : "none";

  const sportField = document.getElementById("sportField");
  sportField.style.display = isBulk ? "none" : "";
  sportSelect.required = !isBulk;

  modeIndividualBtn.classList.toggle("active", !isBulk);
  modeBulkBtn.classList.toggle("active", isBulk);

  setRequired(individualFields, !isBulk);
  document.getElementById("bulkSchool").required = isBulk;
  document.getElementById("bulkTeacherName").required = isBulk;
  document.getElementById("bulkTeacherContact").required = isBulk;
}

modeIndividualBtn.addEventListener("click", () => setMode("individual"));
modeBulkBtn.addEventListener("click", () => setMode("bulk"));

/* ============ 교사 일괄 신청: 업로드 파일 표시 ============ */

const bulkFileInput = document.getElementById("bulkFile");
const bulkFileName = document.getElementById("bulkFileName");

bulkFileInput.addEventListener("change", () => {
  const file = bulkFileInput.files[0];
  bulkFileName.textContent = file ? "선택된 파일: " + file.name : "";
});

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

  if (currentMode === "bulk" && !bulkFileInput.files[0]) {
    statusEl.textContent = "작성한 참가신청서 파일을 업로드해 주세요.";
    statusEl.className = "form-status error";
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "제출 중…";
  statusEl.textContent = "";
  statusEl.className = "form-status";

  const ip = await getClientIp();
  let error;

  if (currentMode === "bulk") {
    const file = bulkFileInput.files[0];
    const filePath = `${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("bulk-uploads")
      .upload(filePath, file);

    if (uploadError) {
      statusEl.textContent = "파일 업로드에 실패했습니다. (" + uploadError.message + ")";
      statusEl.classList.add("error");
      submitBtn.disabled = false;
      submitBtn.textContent = "신청서 제출";
      return;
    }

    const payload = {
      competition: competitionSelect.value,
      sport: sportSelect.value || null,
      school: document.getElementById("bulkSchool").value,
      principal_name: document.getElementById("bulkPrincipal").value || null,
      teacher_name: document.getElementById("bulkTeacherName").value,
      teacher_contact: document.getElementById("bulkTeacherContact").value,
      requested_count: document.getElementById("bulkCapacity").value || null,
      file_path: filePath,
      file_name: file.name,
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
  bulkFileName.textContent = "";

  if (currentMode !== "bulk") {
    fillSelect(sportSelect, [], "먼저 대회를 선택하세요");
    sportSelect.disabled = true;
    preferredDatesField.style.display = "none";
  }

  submitBtn.disabled = false;
  submitBtn.textContent = "신청서 제출";
});
