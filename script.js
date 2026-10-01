// 결과 페이지 렌더링 — Supabase RPC get_public_results(comp)로 대회별 참가자 전체와 기록을 읽어
// 종목(sport)별로 배번순 표를 그립니다. 기록이 없는 참가자도 함께 표시됩니다.
// 배번·이름을 누르면 기념촬영용 전체화면 기록 카드가 열립니다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const overlay = document.getElementById("recordOverlay");
const overlayFields = {
  competition: document.getElementById("recordOverlayCompetition"),
  sport: document.getElementById("recordOverlaySport"),
  bib: document.getElementById("recordOverlayBib"),
  school: document.getElementById("recordOverlaySchool"),
  name: document.getElementById("recordOverlayName"),
  time: document.getElementById("recordOverlayTime"),
};
let lastFocused = null;

function openOverlay(row) {
  overlayFields.competition.textContent = row.competition || "";
  overlayFields.sport.textContent = row.sport || "";
  overlayFields.bib.textContent = row.bib_number ?? "";
  overlayFields.bib.hidden = row.bib_number == null;
  overlayFields.school.textContent = row.school || "";
  overlayFields.name.textContent = row.name || "";
  overlayFields.time.textContent = row.record_time || "기록 입력 전";
  overlayFields.time.classList.toggle("pending", !row.record_time);

  lastFocused = document.activeElement;
  overlay.hidden = false;
  document.body.classList.add("overlay-open");
  document.getElementById("recordOverlayClose").focus();
}

function closeOverlay() {
  if (overlay.hidden) return;
  overlay.hidden = true;
  document.body.classList.remove("overlay-open");
  if (lastFocused) lastFocused.focus();
}

if (overlay) {
  document.getElementById("recordOverlayClose").addEventListener("click", closeOverlay);
  // 카드 바깥(어두운 배경)을 누르면 닫힘
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeOverlay();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeOverlay();
  });
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
    renderButtons(sportFilterRow, query ? [] : sports, activeSport, (sport) => {
      activeSport = sport;
      renderFilters();
      renderResults();
    });
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
            <tr><th style="width:70px;">배번</th><th>학교</th><th>이름</th><th style="width:100px;">기록</th><th>비고</th></tr>
          </thead>
          <tbody>
            ${groupRows
              .map(
                (r) => `
              <tr>
                <td>${r.bib_number != null ? `<button type="button" class="record-link bib-link" data-id="${r.application_id}">${r.bib_number}</button>` : ""}</td>
                <td>${escapeHtml(r.school)}</td>
                <td><button type="button" class="record-link" data-id="${r.application_id}">${escapeHtml(r.name) || "(이름 없음)"}</button></td>
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
    if (rows.length === 0) {
      container.innerHTML = '<p class="empty-note">아직 이 대회의 참가자 명단이 없습니다.</p>';
      return;
    }

    // 검색 중에는 종목과 상관없이 대회 전체에서 찾음
    const targetSports = query ? sports : [activeSport];
    const groups = targetSports
      .map((sport) => ({ sport, items: rows.filter((r) => r.sport === sport && matchesQuery(r)) }))
      .filter((g) => g.items.length > 0);

    if (groups.length === 0) {
      container.innerHTML = `<p class="empty-note">"${escapeHtml(query)}"에 해당하는 참가자를 찾을 수 없습니다.</p>`;
      return;
    }

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

  container.addEventListener("click", (e) => {
    const link = e.target.closest(".record-link");
    if (!link) return;
    const row = rows.find((r) => String(r.application_id) === link.dataset.id);
    if (row) openOverlay(row);
  });

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      query = searchInput.value.trim();
      renderFilters();
      renderResults();
    });
  }

  async function loadResults() {
    const token = ++loadToken;
    rows = [];
    sports = [];
    activeSport = "";
    renderFilters();
    container.innerHTML = '<p class="empty-note">불러오는 중…</p>';

    const { data, error } = await supabase.rpc("get_public_results", { comp: activeCompetition });
    if (token !== loadToken) return; // 그 사이 다른 대회를 선택한 경우 무시

    if (error) {
      container.innerHTML =
        '<p class="empty-note">결과를 불러오지 못했습니다. (관리자에게 문의해 주세요: ' + escapeHtml(error.message) + ")</p>";
      return;
    }

    rows = (data || []).map((r) => ({ ...r, sport: r.sport || "기타" })).sort(byBib);
    sports = Array.from(new Set(rows.map((r) => r.sport))).sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
    activeSport = sports[0] || "";

    renderFilters();
    renderResults();
  }

  loadResults();
}
