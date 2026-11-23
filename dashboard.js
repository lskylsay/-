// 현황 대시보드 (공개) — RPC get_public_team_trend / get_public_teams / get_public_awards 만 사용.
// 개인정보(학생·지도자 이름, 기록, 예상 메달)는 사용하지 않는다.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { diagnose } from "./pathway-diag.js";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const root = document.getElementById("dashApp");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ko = (a, b) => String(a).localeCompare(String(b), "ko");
const MEDALS = ["금", "은", "동"];
const MCOLOR = { 금: "#C9A227", 은: "#9AA3AD", 동: "#B26B3A" };
const MCLASS = { 금: "medal-gold", 은: "medal-silver", 동: "medal-bronze" };
const BIG = ["전국소년체육대회", "전국체육대회"];
const css = (v, fb) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb;
const NAVY = css("--navy", "#16233F"), CLAY = css("--clay", "#C1502E"), SOFT = css("--ink-soft", "#6B6B66");
const total = (t) => (t.players_m || 0) + (t.players_f || 0);
const PENDING = '<p class="empty-note">자료를 준비 중입니다.</p>';
const charts = [];

let trend = [], teams = [], awards = [], brokenCount = null;
let chartComp = "";
let yearSel = "";

async function rpc(name, args) {
  try {
    const { data, error } = await supabase.rpc(name, args || {});
    return error || !Array.isArray(data) ? [] : data;
  } catch (e) { return []; }
}

async function loadBroken() {
  try {
    if (!teams.length) return;
    const pw = await supabase.from("sport_pathways").select("*");
    if (pw.error || !Array.isArray(pw.data)) return;
    brokenCount = diagnose(teams, pw.data).filter((d) => d.broken.length).length;
    render();
  } catch (e) { /* 연계 정보가 없으면 이 줄은 숨김 */ }
}

async function init() {
  [trend, teams, awards] = await Promise.all([rpc("get_public_team_trend"), rpc("get_public_teams", { p_year: null }), rpc("get_public_awards", {})]);
  trend.sort((a, b) => a.year - b.year);
  const years = [...new Set(awards.map((r) => r.year))].sort((a, b) => b - a);
  yearSel = years.length ? String(years[0]) : "";
  render();
  loadBroken();   // 연계 단절 종목 수는 화면을 먼저 그린 뒤 채움 (테이블이 없거나 느려도 대시보드는 그대로)
}

// 표로 보기(접근성) 보조
function tableHtml(head, body) {
  return `<details><summary>표로 보기</summary><div class="ts-scroll"><table class="result-table"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>`;
}
function panel(id, title, unit, inner) {
  return `<section class="dash-panel" aria-labelledby="${id}-t"><h3 id="${id}-t">${esc(title)}</h3><p class="unit">${esc(unit)}</p>${inner}</section>`;
}
function canvasBox(id, label) { return `<div class="dash-canvas"><canvas id="${id}" role="img" aria-label="${esc(label)}"></canvas></div>`; }
function draw(id, cfg) {
  const el = document.getElementById(id);
  if (!el) return;
  if (typeof window.Chart === "undefined") { el.parentElement.innerHTML = '<p class="empty-note">그래프를 불러오지 못했습니다. 아래 표로 확인해 주세요.</p>'; return; }
  charts.push(new window.Chart(el, cfg));
}
const medalCount = (rs, m) => rs.filter((r) => r.medal === m).length;
const diff = (cur, prev) => (prev == null ? "" : `<small>지난해보다 ${cur - prev > 0 ? "+" : cur - prev < 0 ? "−" : "±"}${Math.abs(cur - prev)}</small>`);

function render() {
  charts.splice(0).forEach((c) => c.destroy());
  const hasTeams = teams.length > 0, hasAwards = awards.length > 0;
  if (!hasTeams && !hasAwards && !trend.length) { root.innerHTML = '<p class="empty-note">자료를 준비 중입니다. 자료가 등록되면 이곳에 그래프가 나타납니다.</p>'; return; }

  // ---- 숫자 요약 6칸
  const tYear = hasTeams ? Number(teams[0].year) : null;
  const prevT = tYear ? trend.find((t) => t.year === tYear - 1) : null;
  const schools = new Set(teams.map((t) => t.school)).size;
  const pm = teams.reduce((a, t) => a + (t.players_m || 0), 0), pf = teams.reduce((a, t) => a + (t.players_f || 0), 0);
  const aYear = hasAwards ? Math.max(...awards.map((r) => r.year)) : null;
  const cur = hasAwards ? awards.filter((r) => r.year === aYear) : [];
  const prevA = hasAwards && awards.some((r) => r.year === aYear - 1) ? awards.filter((r) => r.year === aYear - 1) : null;
  const cards = [
    `<div><b>${hasTeams ? teams.length : "-"}</b><span>운동부${tYear ? ` (${tYear}학년도)` : ""}</span>${hasTeams && prevT ? diff(teams.length, prevT.teams) : ""}</div>`,
    `<div><b>${hasTeams ? schools : "-"}</b><span>운영 학교</span>${hasTeams && prevT ? diff(schools, prevT.schools) : ""}</div>`,
    `<div><b>${hasTeams ? pm + pf : "-"}</b><span>학생선수${hasTeams ? ` (남 ${pm} · 여 ${pf})` : ""}</span>${hasTeams && prevT ? diff(pm + pf, (prevT.players_m || 0) + (prevT.players_f || 0)) : ""}</div>`,
    ...MEDALS.map((m) => `<div class="${MCLASS[m]}"><b>${hasAwards ? medalCount(cur, m) : "-"}</b><span>${aYear ? aYear + "년 " : "올해 "}${m}메달</span>${prevA ? diff(medalCount(cur, m), medalCount(prevA, m)) : ""}</div>`),
  ];

  // ---- 연도별 메달 추이
  const awYears = [...new Set(awards.map((r) => r.year))].sort((a, b) => a - b);
  const comps = ["", ...BIG.filter((c) => awards.some((r) => r.competition === c))];
  if (chartComp && !comps.includes(chartComp)) chartComp = "";
  const byYear = (y) => awards.filter((r) => r.year === y && (!chartComp || r.competition === chartComp));
  const p1 = hasAwards ? panel("c1", "연도별 메달 추이", "단위: 개", `
      <div class="filter-row">${comps.map((c) => `<button type="button" class="filter-btn${chartComp === c ? " active" : ""}" data-comp="${esc(c)}">${c || "전체 대회"}</button>`).join("")}</div>
      ${canvasBox("c1cv", "연도별 금은동 메달 개수 쌓은 막대 그래프")}${tableHtml(["연도", "금", "은", "동", "합계"], awYears.map((y) => [y, ...MEDALS.map((m) => medalCount(byYear(y), m)), MEDALS.reduce((a, m) => a + medalCount(byYear(y), m), 0)]))}`)
    : panel("c1", "연도별 메달 추이", "단위: 개", PENDING);

  // ---- 종목별 메달 + 학교별 순위 (연도 선택 공유)
  const yearOpts = `<div class="ts-row"><label for="dashYear">연도</label><select id="dashYear"><option value=""${yearSel === "" ? " selected" : ""}>전체</option>${[...awYears].reverse().map((y) => `<option${String(y) === yearSel ? " selected" : ""}>${y}</option>`).join("")}</select><span class="sub">(종목별 그래프와 학교별 순위에 적용)</span></div>`;
  const ysAw = awards.filter((r) => r.medal && (!yearSel || String(r.year) === yearSel));
  const sportRows = [...new Set(ysAw.map((r) => r.sport))].map((s) => ({ s, m: MEDALS.map((m) => ysAw.filter((r) => r.sport === s && r.medal === m).length) }))
    .sort((a, b) => b.m.reduce((x, y) => x + y, 0) - a.m.reduce((x, y) => x + y, 0) || ko(a.s, b.s));
  const schoolRows = [...new Set(ysAw.map((r) => r.school))].map((s) => ({ s, level: ysAw.find((r) => r.school === s).school_level || "", m: MEDALS.map((m) => ysAw.filter((r) => r.school === s && r.medal === m).length) }))
    .sort((a, b) => b.m[0] - a.m[0] || b.m[1] - a.m[1] || b.m[2] - a.m[2] || ko(a.s, b.s));
  const p2 = hasAwards ? panel("c2", "종목별 메달", "단위: 개", yearOpts + (sportRows.length ? canvasBox("c2cv", "종목별 금은동 메달 가로 쌓은 막대 그래프").replace('class="dash-canvas"', `class="dash-canvas" style="height:${Math.max(220, sportRows.length * 34 + 60)}px"`) + tableHtml(["종목", "금", "은", "동", "합계"], sportRows.map((r) => [r.s, ...r.m, r.m.reduce((a, b) => a + b, 0)])) : '<p class="empty-note">이 연도의 메달 기록이 없습니다.</p>'))
    : panel("c2", "종목별 메달", "단위: 개", PENDING);
  const p3 = hasAwards ? panel("c3", "학교별 메달 순위", "금 → 은 → 동 순 (올림픽 방식)", schoolRows.length ? `<div class="ts-scroll"><table class="result-table"><thead><tr><th>순위</th><th>학교</th><th>학교급</th><th>금</th><th>은</th><th>동</th><th>합계</th></tr></thead><tbody>
      ${schoolRows.map((r, i) => `<tr><td>${i + 1}</td><td style="text-align:left;">${esc(r.s)}</td><td>${esc(r.level)}</td><td>${r.m[0]}</td><td>${r.m[1]}</td><td>${r.m[2]}</td><td><b>${r.m[0] + r.m[1] + r.m[2]}</b></td></tr>`).join("")}</tbody></table></div>` : '<p class="empty-note">이 연도의 메달 기록이 없습니다.</p>')
    : panel("c3", "학교별 메달 순위", "금 → 은 → 동 순", PENDING);

  // ---- 운동부·선수 수 추이
  const p4 = trend.length >= 2 ? panel("c4", "운동부·선수 수 추이", "단위: 운동부 수는 곳, 선수 수는 명", canvasBox("c4cv", "학년도별 운동부 수와 남녀 선수 수 선 그래프") + tableHtml(["학년도", "운동부", "학교", "종목", "선수(남)", "선수(여)"], trend.map((t) => [t.year, t.teams, t.schools, t.sports, t.players_m, t.players_f])))
    : panel("c4", "운동부·선수 수 추이", "단위: 운동부 수는 곳, 선수 수는 명", trend.length === 1 ? '<p class="empty-note">추이는 2개 학년도 이상 자료가 쌓이면 보입니다.</p>' : PENDING);

  // ---- 학교급별 분포
  const lv = ["초", "중", "고"].map((l) => ({ l, t: teams.filter((t) => t.level === l).length, p: teams.filter((t) => t.level === l).reduce((a, t) => a + total(t), 0) }));
  const p5 = hasTeams ? panel("c5", "학교급별 분포", `단위: 운동부 수는 곳, 선수 수는 명 (${tYear}학년도)`, canvasBox("c5cv", "학교급별 운동부 수와 선수 수 막대 그래프") + tableHtml(["학교급", "운동부", "선수"], lv.map((x) => [x.l, x.t, x.p])))
    : panel("c5", "학교급별 분포", "단위: 곳, 명", PENDING);

  const pwLine = brokenCount == null ? "" : `<p style="margin:10px 0 0;">연계 단절 종목 <b>${brokenCount}개</b> → <a href="pathways.html">연계 경로도 보기</a></p>`;
  root.innerHTML = `<div class="dash-grid-6">${cards.join("")}</div>${pwLine}${p1}${p2}${p3}${p4}${p5}`;

  // ---- 그래프 그리기
  const stackOpts = (extra) => ({ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, ...extra });
  if (hasAwards) {
    draw("c1cv", { type: "bar", data: { labels: awYears.map((y) => y + "년"), datasets: MEDALS.map((m) => ({ label: m + "메달", data: awYears.map((y) => medalCount(byYear(y), m)), backgroundColor: MCOLOR[m] })) },
      options: stackOpts({ scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "메달 수(개)" } } } }) });
    if (sportRows.length) draw("c2cv", { type: "bar", data: { labels: sportRows.map((r) => r.s), datasets: MEDALS.map((m, i) => ({ label: m + "메달", data: sportRows.map((r) => r.m[i]), backgroundColor: MCOLOR[m] })) },
      options: stackOpts({ indexAxis: "y", scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "메달 수(개)" } }, y: { stacked: true } } }) });
  }
  if (trend.length >= 2) draw("c4cv", { type: "line", data: { labels: trend.map((t) => t.year + "학년도"), datasets: [
      { label: "운동부 수(곳)", data: trend.map((t) => t.teams), borderColor: NAVY, backgroundColor: NAVY, yAxisID: "y" },
      { label: "선수 수-남(명)", data: trend.map((t) => t.players_m), borderColor: "#3B6FB6", backgroundColor: "#3B6FB6", yAxisID: "y1" },
      { label: "선수 수-여(명)", data: trend.map((t) => t.players_f), borderColor: CLAY, backgroundColor: CLAY, yAxisID: "y1" }] },
    options: stackOpts({ scales: { y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "운동부(곳)" } }, y1: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: "선수(명)" } } } }) });
  if (hasTeams) draw("c5cv", { type: "bar", data: { labels: lv.map((x) => x.l), datasets: [
      { label: "운동부 수(곳)", data: lv.map((x) => x.t), backgroundColor: NAVY, yAxisID: "y" },
      { label: "선수 수(명)", data: lv.map((x) => x.p), backgroundColor: CLAY, yAxisID: "y1" }] },
    options: stackOpts({ scales: { y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "운동부(곳)" } }, y1: { position: "right", beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: "선수(명)" } } } }) });

  root.querySelectorAll("[data-comp]").forEach((b) => b.addEventListener("click", () => { chartComp = b.dataset.comp; render(); }));
  root.querySelector("#dashYear")?.addEventListener("change", (e) => { yearSel = e.target.value; render(); });
}

init();
