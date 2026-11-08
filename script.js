// 결과 페이지 렌더링 — Supabase RPC get_public_results(comp)로 대회별 참가자 전체와 기록을 읽어
// 종목(sport)별로 배번순 표를 그립니다. 기록이 없는 참가자도 함께 표시됩니다.
// 배번·이름을 누르면 기념촬영용 전체화면 기록 카드가 열립니다.
// - 이름은 표와 카드 모두 실명 표시. MASK_PUBLIC_NAMES 를 true 로 바꾸면 가운데 글자를 가림 (홍길동 → 홍O동). 검색은 실명으로 동작
// - 이 스크립트보다 먼저 window.RESULTS_SHOW_FULL_NAMES = true 를 두면 가림 설정과 관계없이 실명 표시 (경기기록원 결과 탭)
// - window에 "results:reload" 이벤트를 보내면 보고 있던 종목을 유지한 채 결과를 다시 불러옴

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MASK_PUBLIC_NAMES = false; // true로 바꾸면 공개 페이지에서 이름 가운데 글자를 O로 가림

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const container = document.getElementById("resultsContainer");
const filterRow = document.getElementById("filterRow");
const sportFilterRow = document.getElementById("sportFilterRow");
const searchInput = document.getElementById("resultsSearch");

// 항상 보여줄 대회 목록 (데이터가 아직 없어도 버튼은 보이도록 고정 목록으로 관리)
const KNOWN_COMPETITIONS = [
  "트랙마라톤 축제",
  "충북교육감기 육상대회",
  "제43회 교육장기 육상경기대회",
];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function byBib(a, b) {
  if (a.bib_number == null && b.bib_number == null) return a.application_id - b.application_id;
  if (a.bib_number == null) return 1;
  if (b.bib_number == null) return -1;
  return a.bib_number - b.bib_number;
}

/* ============ 기념촬영용 전체화면 기록 카드 ============ */

// 기록 카드 맨 위에 보여줄 대회 표기 이름 (DB 대회명 → 화면 표기)
// 여기에 없는 대회는 DB 대회명을 그대로 보여줍니다.
const COMPETITION_DISPLAY_NAMES = {
  "트랙마라톤 축제": "2026. 제천 학교스포츠클럽 트랙마라톤 축제",
  // 예) "충북교육감기 육상대회": "2026. 충북교육감기 육상대회",
};

// 이름의 첫·마지막 글자만 남기고 가운데를 O로 가림 (MASK_PUBLIC_NAMES 가 true 일 때 공개 화면에서 사용)
// (홍길동 → 홍O동, 이소 → 이O, 남궁민수 → 남OO수). 이름 중간의 띄어쓰기는 그대로 둠
function maskName(name) {
  const chars = Array.from(String(name ?? "").trim().replace(/\s+/g, " "));
  if (chars.length <= 1) return chars.join("");
  if (chars.length === 2) return chars[0] + "O";
  const last = chars.length - 1;
  return chars.map((c, i) => (i === 0 || i === last || c === " " ? c : "O")).join("");
}

// 이름 가림이 필요한 대회 (개인정보 보호): 공개 화면에서 성명의 두 번째 글자를 O로 바꿔 보여줌
// (홍길동 → 홍O동, 이소 → 이O, 남궁민수 → 남O민수). 경기기록원 결과 탭(RESULTS_SHOW_FULL_NAMES)은 실명 그대로
const MASKED_COMPETITIONS = ["트랙마라톤 축제"];
function maskSecondChar(name) {
  const chars = Array.from(String(name ?? "").trim().replace(/\s+/g, " "));
  if (chars.length >= 2 && chars[1] !== " ") chars[1] = "O";
  return chars.join("");
}

// 화면에 보여줄 이름: 기본은 실명. MASK_PUBLIC_NAMES 가 true 이면 모든 대회 가운데 글자 가림,
// MASKED_COMPETITIONS 에 있는 대회는 두 번째 글자 가림. RESULTS_SHOW_FULL_NAMES 이면 언제나 실명
function displayName(name, competition) {
  if (window.RESULTS_SHOW_FULL_NAMES === true) return String(name ?? "").trim();
  if (MASK_PUBLIC_NAMES) return maskName(name);
  if (MASKED_COMPETITIONS.includes(competition)) return maskSecondChar(name);
  return String(name ?? "").trim();
}

function competitionDisplayName(name) {
  return COMPETITION_DISPLAY_NAMES[name] || name || "";
}

const overlay = document.getElementById("recordOverlay");
const overlayCard = document.getElementById("recordCard");
const overlayBody = document.getElementById("recordOverlayBody");
const closeBtn = document.getElementById("recordOverlayClose");
const fullscreenBtn = document.getElementById("recordOverlayFullscreen");
const overlayStatus = document.getElementById("recordOverlayStatus");
const overlayFields = {
  competition: document.getElementById("recordOverlayCompetition"),
  sport: document.getElementById("recordOverlaySport"),
  bib: document.getElementById("recordOverlayBib"),
  school: document.getElementById("recordOverlaySchool"),
  name: document.getElementById("recordOverlayName"),
  time: document.getElementById("recordOverlayTime"),
};
const TRANSITION_MS = 220;
let overlayList = []; // 좌우 이동 대상 (현재 화면에 보이는 참가자, 표시 순서대로)
let overlayIndex = -1;
let lastFocused = null;
let closeTimer = null;
let savedScrollY = 0;
let fullscreenExitedAt = 0;

// 전체화면 API (iPhone Safari 등 미지원 브라우저에서는 버튼 숨김)
const fullscreenSupported = !!(
  document.fullscreenEnabled ||
  document.webkitFullscreenEnabled
);

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function enterFullscreen() {
  const req = overlay.requestFullscreen || overlay.webkitRequestFullscreen;
  if (!req) return;
  try {
    const result = req.call(overlay);
    if (result && result.catch) result.catch(() => {});
  } catch (_) {
    /* 전체화면 거부 시 무시 */
  }
}

function exitFullscreen() {
  if (!fullscreenElement()) return;
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  if (!exit) return;
  try {
    const result = exit.call(document);
    if (result && result.catch) result.catch(() => {});
  } catch (_) {
    /* 무시 */
  }
}

function updateFullscreenButton() {
  if (!fullscreenBtn) return;
  const active = fullscreenElement() === overlay;
  const label = active ? "전체화면 종료" : "전체화면";
  fullscreenBtn.classList.toggle("is-active", active);
  fullscreenBtn.setAttribute("aria-label", label);
  fullscreenBtn.title = label;
  fullscreenBtn.setAttribute("aria-pressed", String(active));
}

// 뒤 화면 스크롤 잠금 (iOS Safari에서도 동작하도록 body를 고정)
function lockScroll() {
  savedScrollY = window.scrollY;
  const scrollbar = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.top = `-${savedScrollY}px`;
  if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
  document.body.classList.add("overlay-open");
}

function unlockScroll() {
  document.body.classList.remove("overlay-open");
  document.body.style.top = "";
  document.body.style.paddingRight = "";
  // 부드러운 스크롤 설정이 있어도 원래 위치로 즉시 복귀
  const html = document.documentElement;
  const prev = html.style.scrollBehavior;
  html.style.scrollBehavior = "auto";
  window.scrollTo(0, savedScrollY);
  html.style.scrollBehavior = prev;
}

function fillOverlay(row) {
  overlayFields.competition.textContent = competitionDisplayName(row.competition);
  overlayFields.sport.textContent = row.sport || "";
  overlayFields.bib.textContent = row.bib_number ?? "";
  overlayFields.bib.hidden = row.bib_number == null;
  overlayFields.bib.setAttribute("aria-label", row.bib_number != null ? `배번 ${row.bib_number}` : "");
  overlayFields.school.textContent = [row.school, row.grade].filter(Boolean).join(" ");
  overlayFields.name.textContent = displayName(row.name, row.competition);
  overlayFields.time.textContent = row.record_time || "기록 입력 전";
  overlayFields.time.classList.toggle("pending", !row.record_time);
  if (overlayStatus && overlayList.length > 1) {
    overlayStatus.textContent = `${overlayList.length}명 중 ${overlayIndex + 1}번째`;
  }
}

function showAt(index, direction) {
  if (index < 0 || index >= overlayList.length) return;
  overlayIndex = index;
  fillOverlay(overlayList[index]);
  // 이전/다음 이동 시 살짝 미끄러지는 효과
  overlayBody.classList.remove("slide-next", "slide-prev");
  if (direction) {
    void overlayBody.offsetWidth; // 애니메이션 재시작
    overlayBody.classList.add(direction > 0 ? "slide-next" : "slide-prev");
  }
}

function step(delta) {
  if (overlay.hidden || overlayList.length < 2) return;
  showAt(overlayIndex + delta, delta);
}

function openOverlay(row, list) {
  overlayList = list && list.length ? list : [row];
  overlayIndex = Math.max(0, overlayList.indexOf(row));
  if (overlayStatus) overlayStatus.textContent = "";
  showAt(overlayIndex, 0);

  clearTimeout(closeTimer);
  if (overlay.hidden) {
    lastFocused = document.activeElement;
    lockScroll();
    overlay.hidden = false;
    void overlay.offsetWidth; // 표시 후 다음 프레임에 전환 효과 시작
  }
  overlay.classList.add("is-open");
  updateFullscreenButton();
  closeBtn.focus();
}

function closeOverlay() {
  if (overlay.hidden || !overlay.classList.contains("is-open")) return;
  exitFullscreen();
  overlay.classList.remove("is-open");
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    overlay.hidden = true;
    unlockScroll();
    if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
  }, TRANSITION_MS);
}

if (overlay) {
  closeBtn.addEventListener("click", closeOverlay);

  if (fullscreenBtn && fullscreenSupported) {
    fullscreenBtn.hidden = false;
    fullscreenBtn.addEventListener("click", () => {
      if (fullscreenElement()) exitFullscreen();
      else enterFullscreen();
    });
  }

  // 전체화면이 풀려도(ESC 포함) 오버레이는 그대로 유지
  const onFullscreenChange = () => {
    if (!fullscreenElement()) fullscreenExitedAt = Date.now();
    updateFullscreenButton();
  };
  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("webkitfullscreenchange", onFullscreenChange);

  // 카드 바깥(어두운 배경)을 누르면 닫힘
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeOverlay();
  });

  document.addEventListener("keydown", (e) => {
    if (overlay.hidden) return;
    if (e.key === "Escape") {
      // 전체화면 상태의 ESC는 브라우저가 전체화면만 해제 → 오버레이는 닫지 않음
      if (fullscreenElement() || Date.now() - fullscreenExitedAt < 500) return;
      e.preventDefault();
      closeOverlay();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    } else if (e.key === "Tab") {
      // 포커스가 카드 밖으로 나가지 않도록
      const focusables = Array.from(overlayCard.querySelectorAll("button")).filter((b) => !b.hidden);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!overlayCard.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // 휴대폰: 좌우로 밀어서 이전·다음 참가자
  let touchX = null;
  let touchY = null;
  overlayCard.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return (touchX = null);
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }, { passive: true });
  overlayCard.addEventListener("touchend", (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    touchX = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  }, { passive: true });
}

/* ============ 대회/종목 선택 및 표 ============ */

if (container && filterRow) {
  const preselected = new URLSearchParams(window.location.search).get("competition");
  let activeCompetition = KNOWN_COMPETITIONS.includes(preselected) ? preselected : KNOWN_COMPETITIONS[0];
  let activeSport = "";
  let rows = []; // 현재 대회의 참가자 전체
  let sports = [];
  let query = "";
  let loadToken = 0;
  let visibleRows = []; // 현재 화면에 표시된 참가자 (기록 카드 좌우 이동용)

  // ---- 보기 방식: 종목별 보기(종목 → 부별) / 시간별 보기(경기 시간표, timetables.json) ----
  let viewMode = "sport";
  let activeEvent = "";
  let timetable = null;        // 현재 대회의 시간표 (없으면 null → '시간별 보기' 숨김)
  let activeDay = 0;
  let activeKind = "전체";
  const modeRow = document.createElement("div");
  modeRow.className = "filter-row view-mode-row";
  const subRow = document.createElement("div");
  subRow.className = "filter-row filter-row-sub";
  if (sportFilterRow) {
    sportFilterRow.parentNode.insertBefore(modeRow, sportFilterRow);
    sportFilterRow.parentNode.insertBefore(subRow, sportFilterRow.nextSibling);
  }
  let initialView = new URLSearchParams(window.location.search).get("view"); // ?view=time → 시간별 보기로 바로 열기
  let timetablesPromise = null;
  const loadTimetables = () => (timetablesPromise ||= fetch("timetables.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
  const eventOf = (sport) => String(sport).split(" ")[0];
  const buOf = (sport) => String(sport).split(" ").slice(1).join(" ");
  // 종목 아래 부별이 있어 묶을 수 있을 때만 2단(종목 → 부별)으로 보여줌
  const isGrouped = () => new Set(sports.map(eventOf)).size < sports.length;
  const WDAY = ["일", "월", "화", "수", "목", "금", "토"];
  const dayLabel = (iso) => { const d = new Date(iso + "T00:00:00"); return `${d.getMonth() + 1}/${d.getDate()}(${WDAY[d.getDay()]})`; };
  // 시간표의 (종목, 부별) → 참가자 명단의 종목 이름 (계주는 급별로 묶여 있음)
  function sportKeyOf(t) {
    const mix = /mix/i.test(t.bu);
    const level = /초/.test(t.bu) ? "초등" : /중/.test(t.bu) ? "중등" : /고/.test(t.bu) ? "고등" : "";
    if (/R$/.test(t.event)) return mix ? `혼성계주 ${level}` : `${t.event} ${level}`;
    return `${t.event} ${t.bu}`;
  }

  function renderButtons(target, items, active, onSelect) {
    target.innerHTML = "";
    items.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "filter-btn" + (item === active ? " active" : "");
      btn.textContent = item;
      btn.addEventListener("click", () => onSelect(item));
      target.appendChild(btn);
    });
  }

  function renderFilters() {
    renderButtons(filterRow, KNOWN_COMPETITIONS, activeCompetition, (comp) => {
      if (comp === activeCompetition) return;
      activeCompetition = comp;
      const url = new URL(window.location.href);
      url.searchParams.set("competition", comp);
      history.replaceState(null, "", url);
      loadResults();
    });
    // 보기 방식 선택 (시간표가 있는 대회만)
    modeRow.style.display = timetable && !query ? "" : "none";
    renderButtons(modeRow, timetable ? ["종목별 보기", "시간별 보기"] : [], viewMode === "time" ? "시간별 보기" : "종목별 보기", (label) => {
      viewMode = label === "시간별 보기" ? "time" : "sport";
      renderFilters();
      renderResults();
    });
    modeRow.querySelectorAll(".filter-btn").forEach((b) => b.classList.add("filter-btn-mode"));

    const hideSports = query || viewMode === "time";
    if (!hideSports && isGrouped()) {
      const events = Array.from(new Set(sports.map(eventOf)));
      renderButtons(sportFilterRow, events, activeEvent, (ev) => {
        activeEvent = ev;
        activeSport = sports.find((sp) => eventOf(sp) === ev) || "";
        renderFilters();
        renderResults();
      });
      const subs = sports.filter((sp) => eventOf(sp) === activeEvent);
      renderButtons(subRow, subs.map(buOf), buOf(activeSport), (bu) => {
        activeSport = `${activeEvent} ${bu}`;
        renderFilters();
        renderResults();
      });
      subRow.style.display = "";
    } else {
      subRow.style.display = "none";
      renderButtons(sportFilterRow, hideSports ? [] : sports, activeSport, (sport) => {
        activeSport = sport;
        activeEvent = eventOf(sport);
        renderFilters();
        renderResults();
      });
    }
  }

  function matchesQuery(row) {
    if (!query) return true;
    if (/^\d+$/.test(query)) return String(row.bib_number ?? "").startsWith(query);
    return String(row.name || "").replace(/\s/g, "").includes(query.replace(/\s/g, ""));
  }

  function renderTable(groupRows) {
    return `
      <div style="overflow-x:auto;">
        <table class="result-table public-result-table">
          <thead>
            <tr><th style="width:70px;">배번</th><th>학교</th><th style="width:80px;">학년</th><th>이름</th><th style="width:100px;">기록</th><th>비고</th></tr>
          </thead>
          <tbody>
            ${groupRows
              .map(
                (r) => `
              <tr>
                <td>${r.bib_number != null ? `<button type="button" class="record-link bib-link" data-id="${r.application_id}">${r.bib_number}</button>` : ""}</td>
                <td>${escapeHtml(r.school)}</td>
                <td>${escapeHtml(r.grade)}</td>
                <td><button type="button" class="record-link" data-id="${r.application_id}">${escapeHtml(displayName(r.name, r.competition)) || "(이름 없음)"}</button></td>
                <td class="record-cell${r.record_time ? "" : " empty"}">${r.record_time ? escapeHtml(r.record_time) : "-"}</td>
                <td style="color:var(--ink-soft);">${escapeHtml(r.note)}</td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>`;
  }

  function renderResults() {
    visibleRows = [];
    if (rows.length === 0) {
      container.innerHTML = '<p class="empty-note">아직 이 대회의 참가자 명단이 없습니다.</p>';
      return;
    }

    if (viewMode === "time" && timetable && !query) { renderTimetable(); return; }

    // 검색 중에는 종목과 상관없이 대회 전체에서 찾음
    const targetSports = query ? sports : [activeSport];
    const groups = targetSports
      .map((sport) => ({ sport, items: rows.filter((r) => r.sport === sport && matchesQuery(r)) }))
      .filter((g) => g.items.length > 0);

    if (groups.length === 0) {
      container.innerHTML = `<p class="empty-note">"${escapeHtml(query)}"에 해당하는 참가자를 찾을 수 없습니다.</p>`;
      return;
    }

    visibleRows = groups.flatMap((g) => g.items);
    container.innerHTML = groups
      .map((g) => {
        const recorded = g.items.filter((r) => r.record_time).length;
        const summary = query ? `검색 결과 ${g.items.length}명` : `참가 ${g.items.length}명 · 기록 ${recorded}명`;
        return `
        <div class="result-group">
          <h3>${escapeHtml(g.sport)} <span class="division">${summary}</span></h3>
          ${renderTable(g.items)}
        </div>`;
      })
      .join("");
  }

  // 시간별 보기: 일차 탭 + 구분(트랙/필드) 필터 + 시간순 경기 시간표
  function renderTimetable() {
    const t = timetable;
    const days = Array.from(new Set(t.rows.map((r) => r.date))).sort();
    if (!days.includes(activeDay)) {
      const today = new Date().toISOString().slice(0, 10);
      activeDay = days.includes(today) ? today : days[0];
    }
    const counts = {};
    const people = {};   // 종목 → 참가 학생 명단
    rows.forEach((r) => { counts[r.sport] = (counts[r.sport] || 0) + 1; (people[r.sport] ||= []).push(r); });
    const peopleHtml = (key) => (people[key] || []).map((r) => {
      const info = [r.school, r.grade].filter(Boolean).join(" ");
      return `<span class="tt-person">${escapeHtml(displayName(r.name, r.competition))}${info ? ` <small>${escapeHtml(info)}</small>` : ""}</span>`;
    }).join("");
    const list = t.rows.filter((r) => r.date === activeDay && (activeKind === "전체" || r.kind === activeKind));
    const kinds = ["전체", "트랙", "필드"];
    container.innerHTML = `
      <div class="timetable-head">
        <h3>${escapeHtml(t.title || "경기 시간표")}</h3>
        ${t.place ? `<span class="division">${escapeHtml(t.place)}</span>` : ""}
        <button type="button" class="filter-btn" id="ttExcel" style="margin-left:auto;">엑셀 내려받기</button>
      </div>
      <div class="filter-row" id="ttDays">${days.map((d, i) => `<button type="button" class="filter-btn${d === activeDay ? " active" : ""}" data-day="${d}">${i + 1}일차 ${dayLabel(d)}</button>`).join("")}</div>
      <div class="filter-row filter-row-sub" id="ttKinds">${kinds.map((k) => `<button type="button" class="filter-btn${k === activeKind ? " active" : ""}" data-kind="${k}">${k}</button>`).join("")}</div>
      <div style="overflow-x:auto;">
        <table class="result-table public-result-table timetable">
          <thead><tr><th style="width:70px;">시간</th><th style="width:60px;">구분</th><th>종목</th><th>부별</th><th>참가 학생 (학교·학년)</th><th style="width:64px;">단계</th><th style="width:60px;">인원</th></tr></thead>
          <tbody>${list.length ? list.map((r) => {
            const key = sportKeyOf(r);
            const n = counts[key] || 0;
            const link = n ? ` class="tt-row tt-link" data-sport="${escapeHtml(key)}" title="참가자 보기"` : ` class="tt-row"`;
            return `<tr${link}><td class="tt-time">${r.time}</td><td><span class="tt-kind tt-${r.kind === "필드" ? "field" : "track"}">${escapeHtml(r.kind)}</span></td><td><strong>${escapeHtml(r.event)}</strong></td><td>${escapeHtml(r.bu)}</td><td class="tt-people">${n ? peopleHtml(key) : '<span class="tt-none">-</span>'}</td><td>${escapeHtml(r.stage)}</td><td>${n ? n + "명" : "-"}</td></tr>`;
          }).join("") : '<tr><td colspan="7" style="color:var(--ink-soft);">해당 경기가 없습니다.</td></tr>'}</tbody>
        </table>
      </div>
      ${t.note ? `<p class="sub" style="margin-top:14px;">※ ${escapeHtml(t.note)}</p>` : ""}`;
    const excelBtn = container.querySelector("#ttExcel");
    if (excelBtn) excelBtn.addEventListener("click", () => downloadTimetableExcel(excelBtn));
    container.querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => { activeDay = b.dataset.day; renderTimetable(); }));
    container.querySelectorAll("[data-kind]").forEach((b) => b.addEventListener("click", () => { activeKind = b.dataset.kind; renderTimetable(); }));
    container.querySelectorAll("tr.tt-link").forEach((tr) => tr.addEventListener("click", () => {
      activeSport = tr.dataset.sport; activeEvent = eventOf(activeSport); viewMode = "sport";
      renderFilters(); renderResults(); window.scrollTo({ top: 0, behavior: "smooth" });
    }));
  }

  // 시간별 출전선수 명단을 엑셀로 내려받기 (일차별 시트, 선수 1명당 1줄)
  function loadSheetJs() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
      el.onload = () => resolve(window.XLSX);
      el.onerror = () => reject(new Error("엑셀 도구를 불러오지 못했습니다."));
      document.head.appendChild(el);
    });
  }

  async function downloadTimetableExcel(btn) {
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = "만드는 중…";
    try {
      const XLSX = await loadSheetJs();
      const people = {};
      rows.forEach((r) => { (people[r.sport] ||= []).push(r); });
      const days = Array.from(new Set(timetable.rows.map((r) => r.date))).sort();
      const wb = XLSX.utils.book_new();
      const head = ["시간", "구분", "종목", "부별", "단계", "이름", "학교", "학년", "배번"];
      days.forEach((d, i) => {
        const data = [head];
        timetable.rows.filter((r) => r.date === d).forEach((r) => {
          const list = people[sportKeyOf(r)] || [];
          if (!list.length) { data.push([r.time, r.kind, r.event, r.bu, r.stage, "", "", "", ""]); return; }
          list.forEach((p) => data.push([r.time, r.kind, r.event, r.bu, r.stage, displayName(p.name, p.competition), p.school || "", p.grade || "", p.bib_number || ""]));
        });
        const ws = XLSX.utils.aoa_to_sheet(data);
        ws["!cols"] = [8, 6, 14, 8, 8, 12, 16, 8, 8].map((w) => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws, `${i + 1}일차 ${dayLabel(d).replace("/", "-")}`.replace(/[()]/g, ""));
      });
      const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      XLSX.writeFile(wb, `${activeCompetition}_출전선수명단_${ymd}.xlsx`);
    } catch (err) {
      alert(err.message || "엑셀을 만들지 못했습니다.");
    } finally {
      btn.disabled = false; btn.textContent = label;
    }
  }

  container.addEventListener("click", (e) => {
    const link = e.target.closest(".record-link");
    if (!link) return;
    const row = visibleRows.find((r) => String(r.application_id) === link.dataset.id);
    if (row) openOverlay(row, visibleRows);
  });

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      query = searchInput.value.trim();
      renderFilters();
      renderResults();
    });
  }

  // keepSport: 다시 불러올 때 보고 있던 종목을 유지 (results:reload)
  async function loadResults({ keepSport = false } = {}) {
    const token = ++loadToken;
    const prevSport = keepSport ? activeSport : "";
    if (!keepSport) {
      rows = [];
      sports = [];
      activeSport = "";
      activeEvent = "";
      timetable = null;
      viewMode = "sport";
      renderFilters();
      container.innerHTML = '<p class="empty-note">불러오는 중…</p>';
    }

    const { data, error } = await supabase.rpc("get_public_results", { comp: activeCompetition });
    if (token !== loadToken) return; // 그 사이 다른 대회를 선택한 경우 무시

    if (error) {
      container.innerHTML =
        '<p class="empty-note">결과를 불러오지 못했습니다. (관리자에게 문의해 주세요: ' + escapeHtml(error.message) + ")</p>";
      return;
    }

    rows = (data || []).map((r) => ({ ...r, sport: r.sport || "기타" })).sort(byBib);
    sports = Array.from(new Set(rows.map((r) => r.sport))).sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
    activeSport = sports.includes(prevSport) ? prevSport : sports[0] || "";
    activeEvent = eventOf(activeSport);

    const tts = await loadTimetables();
    if (token !== loadToken) return;
    timetable = (tts && tts[activeCompetition]) || null;
    if (!timetable) viewMode = "sport";
    else if (initialView === "time") viewMode = "time";
    initialView = null;

    renderFilters();
    renderResults();
  }

  window.addEventListener("results:reload", () => loadResults({ keepSport: true }));

  loadResults();
}
