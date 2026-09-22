// 결과 페이지 렌더링 — Supabase의 results 테이블에서 데이터를 읽어 그립니다.
// 결과 입력/수정은 관리자 페이지(admin.html)의 "대회 결과 관리" 탭에서 합니다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const container = document.getElementById("resultsContainer");
const filterRow = document.getElementById("filterRow");

if (container && filterRow) {
  let RESULTS = [];
  let sports = ["전체"];

  const preselected = new URLSearchParams(window.location.search).get("competition");
  let activeSport = "전체";

  function rankClass(rank) {
    if (rank === 1) return "gold";
    if (rank === 2) return "silver";
    if (rank === 3) return "bronze";
    return "";
  }

  function groupResults(rows) {
    // competition + division 조합별로 그룹핑
    const map = new Map();
    rows.forEach((r) => {
      const key = r.competition + "|||" + r.division;
      if (!map.has(key)) {
        map.set(key, {
          sport: r.competition,
          division: r.division,
          date: r.date,
          entries: [],
        });
      }
      map.get(key).entries.push({ rank: r.rank, name: r.name, note: r.note });
    });
    return Array.from(map.values());
  }

  function renderFilters() {
    filterRow.innerHTML = "";
    sports.forEach((sport) => {
      const btn = document.createElement("button");
      btn.className = "filter-btn" + (sport === activeSport ? " active" : "");
      btn.textContent = sport;
      btn.addEventListener("click", () => {
        activeSport = sport;
        renderFilters();
        renderResults();
      });
      filterRow.appendChild(btn);
    });
  }

  function renderResults() {
    container.innerHTML = "";
    const groups =
      activeSport === "전체"
        ? RESULTS
        : RESULTS.filter((g) => g.sport === activeSport);

    if (groups.length === 0) {
      container.innerHTML = '<p class="empty-note">아직 게시된 결과가 없습니다.</p>';
      return;
    }

    groups.forEach((group) => {
      const section = document.createElement("div");
      section.className = "result-group";

      const heading = document.createElement("h3");
      heading.innerHTML = `${group.sport} <span class="division">${group.division}${
        group.date ? " · " + group.date : ""
      }</span>`;
      section.appendChild(heading);

      if (!group.entries || group.entries.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-note";
        empty.textContent = "결과 발표 예정입니다.";
        section.appendChild(empty);
      } else {
        const sortedEntries = [...group.entries].sort((a, b) => (a.rank || 999) - (b.rank || 999));
        const table = document.createElement("table");
        table.className = "result-table";
        table.innerHTML = `
          <thead>
            <tr><th style="width:60px;">순위</th><th>이름 / 팀</th><th>비고</th></tr>
          </thead>
          <tbody>
            ${sortedEntries
              .map(
                (e) => `
              <tr>
                <td class="rank ${rankClass(e.rank)}">${e.rank ?? ""}</td>
                <td>${e.name}</td>
                <td style="color:var(--ink-soft);">${e.note || ""}</td>
              </tr>`
              )
              .join("")}
          </tbody>
        `;
        section.appendChild(table);
      }

      container.appendChild(section);
    });
  }

  async function loadResults() {
    container.innerHTML = '<p class="empty-note">불러오는 중…</p>';

    const { data, error } = await supabase
      .from("results")
      .select("*")
      .order("competition", { ascending: true })
      .order("division", { ascending: true })
      .order("rank", { ascending: true });

    if (error) {
      container.innerHTML = '<p class="empty-note">결과를 불러오지 못했습니다.</p>';
      return;
    }

    RESULTS = groupResults(data || []);
    sports = ["전체", ...Array.from(new Set(RESULTS.map((g) => g.sport)))];
    activeSport = sports.includes(preselected) ? preselected : "전체";

    renderFilters();
    renderResults();
  }

  loadResults();
}
