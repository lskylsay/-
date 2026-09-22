// 신청 폼 제출 로직
// - 대회를 선택하면 종목/참가유형 select가 자동으로 채워집니다.
// - 육상대회는 참가 가능일을 추가로 선택합니다.
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
});

// URL에 ?competition=대회명 이 있으면 해당 대회로 고정하고,
// 대회 선택 필드는 숨긴 뒤 안내 문구/제목을 그 대회에 맞게 바꿉니다.
// (홈페이지 대회 카드의 "신청하기" 버튼에서 넘어온 경우)
const preselectedCompetition = new URLSearchParams(window.location.search).get("competition");

const COMPETITION_LABELS = {
  "트랙마라톤 축제": "2026. 제천 학교스포츠클럽 트랙마라톤 축제",
  "충북교육감기 육상대회": "제48회 충청북도교육감기 육상대회",
};

if (preselectedCompetition && SPORT_OPTIONS[preselectedCompetition]) {
  competitionSelect.value = preselectedCompetition;
  competitionSelect.dispatchEvent(new Event("change"));

  // 대회 선택 필드를 숨기고, 고정된 대회명을 안내 문구로 대체
  document.getElementById("competitionField").style.display = "none";
  const lockedNote = document.getElementById("lockedCompetitionNote");
  lockedNote.textContent = "신청 대회: " + COMPETITION_LABELS[preselectedCompetition];
  lockedNote.style.display = "";

  // 페이지 제목/배지/부제도 해당 대회에 맞게 변경
  document.getElementById("pageBib").textContent = preselectedCompetition + " 신청";
  document.getElementById("pageTitle").textContent = COMPETITION_LABELS[preselectedCompetition] + " 신청";
  document.getElementById("pageSub").textContent = "아래 양식을 작성해 제출하면 접수가 완료됩니다.";

  // 신청 전 확인 목록에서도 다른 대회의 접수 기간 안내는 숨김
  document.querySelectorAll("#noticeList li[data-comp]").forEach((li) => {
    if (li.dataset.comp !== preselectedCompetition) li.style.display = "none";
  });
}

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

const form = document.getElementById("applyForm");
const statusEl = document.getElementById("formStatus");
const submitBtn = document.getElementById("submitBtn");

// 공인 IP 조회 (조회 실패 시 null로 처리하고 제출은 그대로 진행)
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
  submitBtn.disabled = true;
  submitBtn.textContent = "제출 중…";
  statusEl.textContent = "";
  statusEl.className = "form-status";

  const ip = await getClientIp();

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

  const { error } = await supabase.from("applications").insert([payload]);

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
  fillSelect(sportSelect, [], "먼저 대회를 선택하세요");
  sportSelect.disabled = true;
  preferredDatesField.style.display = "none";
  submitBtn.disabled = false;
  submitBtn.textContent = "신청서 제출";
});
