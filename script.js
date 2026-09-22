/* 결과 페이지 렌더링 — results-data.js 의 RESULTS 배열을 읽어 그립니다.
   이 파일은 수정할 필요가 없습니다. 결과 내용은 results-data.js 에서 관리하세요. */

(function () {
  const container = document.getElementById("resultsContainer");
  const filterRow = document.getElementById("filterRow");
  if (!container || typeof RESULTS === "undefined") return;

  const sports = ["전체", ...Array.from(new Set(RESULTS.map((g) => g.sport)))];

  // URL에 ?competition=대회명 이 있으면 해당 대회 탭을 자동으로 선택합니다.
  const preselected = new URLSearchParams(window.location.search).get("competition");
  let activeSport = sports.includes(preselected) ? preselected : "전체";

  function rankClass(rank) {
    if (rank === 1) return "gold";
    if (rank === 2) return "silver";
    if (rank === 3) return "bronze";
    return "";
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
      container.innerHTML = '<p class="empty-note">해당 종목의 결과가 없습니다.</p>';
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
        const table = document.createElement("table");
        table.className = "result-table";
        table.innerHTML = `
          <thead>
            <tr><th style="width:60px;">순위</th><th>이름 / 팀</th><th>비고</th></tr>
          </thead>
          <tbody>
            ${group.entries
              .map(
                (e) => `
              <tr>
                <td class="rank ${rankClass(e.rank)}">${e.rank}</td>
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

  renderFilters();
  renderResults();
})();
