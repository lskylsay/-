// 연계 경로도 (공개) — 운동부는 RPC get_public_teams, 연계는 sport_pathways(누구나 읽기)만 사용. 학교·선수 수만 다룸.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { diagnose, LEVELS, LEVEL_NAME, levelOrder } from "./pathway-diag.js";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const root = document.getElementById("pwApp");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ko = (a, b) => String(a).localeCompare(String(b), "ko");
const total = (t) => (t.players_m || 0) + (t.players_f || 0);

let teams = [], paths = [], pathsOk = true, diag = [], cur = "";

function notReady() { root.innerHTML = '<p class="empty-note">자료를 준비 중입니다.</p>'; }

async function init() {
  try {
    const r = await supabase.rpc("get_public_teams", { p_year: null });
    if (r.error || !Array.isArray(r.data) || !r.data.length) return notReady();
    teams = r.data;
    try {
      const p = await supabase.from("sport_pathways").select("*");
      if (p.error || !Array.isArray(p.data)) pathsOk = false; else paths = p.data;
    } catch (e) { pathsOk = false; }
    diag = diagnose(teams, paths);
    const h = decodeURIComponent(location.hash.slice(1));
    cur = diag.some((d) => d.sport === h) ? h : diag[0].sport;
    render();
    window.addEventListener("resize", drawLines);
    window.addEventListener("hashchange", () => { const x = decodeURIComponent(location.hash.slice(1)); if (diag.some((d) => d.sport === x)) { cur = x; render(); } });
  } catch (e) { notReady(); }
}

function badges(d) {
  const out = [];
  d.broken.forEach((b) => out.push(`<span class="pw-badge bad">${b}</span>`));
  if (pathsOk && d.linked) out.push('<span class="pw-badge ok">초·중·고 연계</span>');
  else if (pathsOk && d.allLevels && !d.broken.length) out.push('<span class="pw-badge warn">연계 확인 필요</span>');
  return out.join("");
}
const diagText = (d) => (d.broken.length ? d.broken.join(" · ") : pathsOk && d.linked ? "초·중·고 연계" : pathsOk && d.allLevels ? "연계 확인 필요" : "-");

function render() {
  const d = diag.find((x) => x.sport === cur);
  const yr = teams[0].year;
  root.innerHTML = `
    <p class="sub" style="margin:0 0 10px;">${yr}학년도 기준${pathsOk ? "" : " · 연계 정보는 준비 중입니다"}</p>
    <div class="ts-scroll"><table class="result-table pw-sum"><thead><tr><th style="text-align:left;">종목</th><th>초 팀 수</th><th>중 팀 수</th><th>고 팀 수</th><th>진단</th></tr></thead><tbody>
      ${diag.map((x) => `<tr data-sport="${esc(x.sport)}"${x.sport === cur ? ' style="font-weight:700;"' : ""}><td style="text-align:left;">${esc(x.sport)}</td><td>${x.counts.초}</td><td>${x.counts.중}</td><td>${x.counts.고}</td><td>${esc(diagText(x))}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="filter-row" style="margin-top:18px;">${diag.map((x) => `<button type="button" class="filter-btn${x.sport === cur ? " active" : ""}" data-tab="${esc(x.sport)}">${esc(x.sport)}</button>`).join("")}</div>
    <h3 id="pwTitle" style="margin:6px 0 0;">${esc(cur)} ${badges(d)}</h3>
    <div class="pw-wrap" id="pwWrap"><svg class="pw-svg" id="pwSvg" aria-hidden="true"></svg>
      <div class="pw-cols">${LEVELS.map((l) => {
        const list = d.teams.filter((t) => t.level === l).sort((a, b) => ko(a.school, b.school));
        return `<div class="pw-col lv-${l}"><h4>${LEVEL_NAME[l]}</h4>${list.length ? list.map((t) => cardHtml(t, d)).join("") : '<div class="pw-empty">운동부 없음</div>'}</div>`;
      }).join("")}</div></div>`;
  root.querySelectorAll("[data-sport]").forEach((r) => r.addEventListener("click", () => select(r.dataset.sport, true)));
  root.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => select(b.dataset.tab, false)));
  drawLines();
}

function cardHtml(t, d) {
  const outs = paths.filter((p) => p.sport === t.sport && p.from_school === t.school).map((p) => p.to_school);
  const unreg = pathsOk && d.unregistered.includes(t.school);
  return `<div class="pw-card" data-school="${esc(t.school)}"><strong>${esc(t.school)}${unreg ? '<span class="pw-tag">연계 미등록</span>' : ""}</strong>
    <span class="sub">선수 ${total(t)}명 (남 ${t.players_m || 0} · 여 ${t.players_f || 0})</span>
    ${outs.length ? `<span class="pw-link">→ 진학 연계: ${outs.map(esc).join(", ")}</span>` : ""}</div>`;
}

function select(sport, scroll) {
  cur = sport;
  history.replaceState(null, "", "#" + encodeURIComponent(sport));
  render();
  if (scroll) document.getElementById("pwTitle")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// 카드 사이 곡선(SVG). 휴대폰(세로 배치)에서는 CSS로 숨기고 글자로 대신 보여 줌
function drawLines() {
  const svg = document.getElementById("pwSvg"), wrap = document.getElementById("pwWrap");
  if (!svg || !wrap) return;
  svg.innerHTML = "";
  if (getComputedStyle(svg).display === "none") return;
  const box = wrap.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
  const at = (school) => [...wrap.querySelectorAll(".pw-card")].find((c) => c.dataset.school === school);
  const levelOf = {};
  teams.filter((t) => t.sport === cur).forEach((t) => (levelOf[t.school] = t.level));
  paths.filter((p) => p.sport === cur).forEach((p) => {
    const a = at(p.from_school), b = at(p.to_school);
    if (!a || !b || levelOrder(levelOf[p.from_school]) >= levelOrder(levelOf[p.to_school])) return;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const x1 = ra.right - box.left, y1 = ra.top + ra.height / 2 - box.top, x2 = rb.left - box.left, y2 = rb.top + rb.height / 2 - box.top;
    const dx = Math.max(30, (x2 - x1) / 2);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#C1502E");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("class", "pw-line");
    svg.appendChild(path);
    [[x1, y1], [x2, y2]].forEach(([x, y]) => {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", "4"); c.setAttribute("fill", "#C1502E");
      svg.appendChild(c);
    });
  });
}

init();
