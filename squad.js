// 선수 구성 분석 (공개) — RPC get_public_athletes / get_public_staff / get_public_teams / get_public_team_years 만 사용.
// 성명은 DB가 가려서 주며(홍O동), 기록·목표·예상·지원 내용·경력·자격은 받지 않는다. 그래프·표에는 이름이 없음.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enrich, gapReport, makeLevelFinder, LEVELS, ORDER_LABELS } from "./squad-lib.js";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const root = document.getElementById("squadApp");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ko = (a, b) => String(a).localeCompare(String(b), "ko");
const css = (v, fb) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb;
const C_M = css("--sq-male", "#3B6FB6"), C_F = css("--sq-female", "#C1502E"), NAVY = css("--navy", "#16233F");
const PENDING = '<p class="empty-note">자료를 준비 중입니다.</p>';
const charts = [];

let years = [], year = null, teams = [], athletesRaw = null, staff = null;
let F = { level: "", sport: "", school: "" };
let dSport = "";

async function rpc(name, args) {
  try { const r = await supabase.rpc(name, args || {}); return r.error || !Array.isArray(r.data) ? null : r.data; } catch (e) { return null; }
}
async function loadYear(y) {
  [teams, athletesRaw, staff] = await Promise.all([rpc("get_public_teams", { p_year: y ?? null }), rpc("get_public_athletes", { p_year: y ?? null }), rpc("get_public_staff", { p_year: y ?? null })]);
  teams = teams || [];
  year = y ?? (teams[0] ? Number(teams[0].year) : (athletesRaw && athletesRaw[0] ? Number(athletesRaw[0].year) : null));
}
async function init() {
  const yr = await rpc("get_public_team_years");
  years = (yr || []).map((r) => (typeof r === "object" ? Object.values(r)[0] : r)).map(Number).filter(Boolean);
  await loadYear(years[0] ?? null);
  if (!teams.length && !athletesRaw && !staff) { root.innerHTML = PENDING; return; }
  render();
}

function panel(id, title, unit, inner) {
  return `<section class="dash-panel" aria-labelledby="${id}-t"><h3 id="${id}-t">${esc(title)}</h3><p class="unit">${esc(unit)}</p>${inner}</section>`;
}
const canvasBox = (id, label, h) => `<div class="dash-canvas"${h ? ` style="height:${h}px"` : ""}><canvas id="${id}" role="img" aria-label="${esc(label)}"></canvas></div>`;
function tableHtml(head, body) {
  return `<details><summary>표로 보기</summary><div class="ts-scroll"><table class="result-table"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>`;
}
function draw(id, cfg) {
  const el = document.getElementById(id);
  if (!el) return;
  if (typeof window.Chart === "undefined") { el.parentElement.innerHTML = '<p class="empty-note">그래프를 불러오지 못했습니다. 아래 표로 확인해 주세요.</p>'; return; }
  charts.push(new window.Chart(el, cfg));
}

function render() {
  charts.splice(0).forEach((c) => c.destroy());
  const levelOf = makeLevelFinder(teams);
  const all = athletesRaw ? enrich(athletesRaw, teams) : null;
  const staffAll = staff ? staff.map((s) => ({ ...s, lv: levelOf(s.school, s.sport) })) : null;
  // 필터 목록
  const base = all || staffAll || [];
  const lvOk = (r) => !F.level || r.lv === F.level;
  const sports = [...new Set(base.filter(lvOk).map((r) => r.sport))].sort(ko);
  if (F.sport && !sports.includes(F.sport)) F.sport = "";
  const schools = [...new Set(base.filter((r) => lvOk(r) && (!F.sport || r.sport === F.sport)).map((r) => r.school))].sort(ko);
  if (F.school && !schools.includes(F.school)) F.school = "";
  const ok = (r) => lvOk(r) && (!F.sport || r.sport === F.sport) && (!F.school || r.school === F.school);
  const ath = all ? all.filter(ok) : null;
  const stf = staffAll ? staffAll.filter(ok) : null;
  const gaps = ath ? gapReport(ath) : null;
  const males = ath ? ath.filter((a) => a.gender === "남").length : 0, females = ath ? ath.filter((a) => a.gender === "여").length : 0;
  const grads = gaps ? gaps.reduce((a, g) => a + g.grads, 0) : 0;
  const warn = gaps ? gaps.filter((g) => g.flag).length : 0, risk = gaps ? gaps.filter((g) => g.flag === "risk").length : 0;
  const dirs = stf ? stf.filter((s) => s.role === "감독").length : 0, coaches = stf ? stf.filter((s) => s.role === "코치").length : 0;

  const cards = `<div class="dash-grid-6" style="grid-template-columns:repeat(4,1fr);">
    <div><b>${ath ? ath.length : "-"}</b><span>학생선수${ath ? ` (남 ${males} · 여 ${females})` : ""}</span></div>
    <div><b>${ath ? grads : "-"}</b><span>졸업 예정 인원 (초6·중3·고3)</span></div>
    <div class="medal-bronze"><b>${ath ? warn : "-"}</b><span>공백 주의 팀${ath && risk ? ` (팀 유지 위험 ${risk})` : ""}</span></div>
    <div><b>${stf ? dirs + coaches : "-"}</b><span>지도자${stf ? ` (감독 ${dirs} · 코치 ${coaches})` : ""}</span></div></div>`;

  const filters = `${years.length > 1 ? `<div class="ts-row"><label for="sqYear">학년도</label><select id="sqYear">${years.map((y) => `<option value="${y}"${y === year ? " selected" : ""}>${y}학년도</option>`).join("")}</select></div>` : (year ? `<p class="sub" style="margin:0 0 10px;">${year}학년도 기준</p>` : "")}
    <div class="ts-row"><span>학교급</span>${["", ...LEVELS].map((l) => `<button type="button" class="filter-btn${F.level === l ? " active" : ""}" data-level="${l}">${l || "전체"}</button>`).join("")}
      <label for="sqSport" style="margin-left:12px;">종목</label><select id="sqSport"><option value="">전체</option>${sports.map((s) => `<option${s === F.sport ? " selected" : ""}>${esc(s)}</option>`).join("")}</select>
      <label for="sqSchool">학교</label><select id="sqSchool"><option value="">전체</option>${schools.map((s) => `<option${s === F.school ? " selected" : ""}>${esc(s)}</option>`).join("")}</select></div>`;

  // a. 학년 구성
  let pa, dA = null;
  if (!ath) pa = panel("a", "학년 구성", "단위: 명", PENDING);
  else {
    const labelIdx = ORDER_LABELS.map((l, i) => i).filter((i) => !F.level || ORDER_LABELS[i].startsWith(F.level));
    const m = labelIdx.map((i) => ath.filter((a) => a.ord === i && a.gender === "남").length), f = labelIdx.map((i) => ath.filter((a) => a.ord === i && a.gender === "여").length);
    const unknown = ath.filter((a) => a.ord == null).length;
    pa = panel("a", "학년 구성", "단위: 명 (초1 → 고3 순, 남·여 쌓은 막대)", ath.length ? canvasBox("acv", "학년별 남녀 선수 수 쌓은 막대 그래프") + (unknown ? `<p class="sub" style="margin:6px 0 0;">학년을 읽지 못한 ${unknown}명은 그래프에서 제외했습니다.</p>` : "")
      + tableHtml(["학년", "남", "여", "계"], labelIdx.map((i, k) => [ORDER_LABELS[i], m[k], f[k], m[k] + f[k]])) : '<p class="empty-note">조건에 맞는 선수가 없습니다.</p>');
    dA = { labels: labelIdx.map((i) => ORDER_LABELS[i]), m, f };
  }
  // b. 졸업·공백 경고
  const pb = !ath ? panel("b", "내년 졸업·공백 경고", "팀(학교·종목)별 인원", PENDING)
    : panel("b", "내년 졸업·공백 경고", "단위: 명 · 졸업 후 남는 인원 3명 이하 '공백 주의', 0명 '팀 유지 위험' (위험 순)", gaps.length ? `<div class="ts-scroll"><table class="result-table"><thead><tr><th style="text-align:left;">팀</th><th>현재 인원</th><th>졸업 예정(최고 학년)</th><th>졸업 후 남는 인원</th><th>상태</th></tr></thead><tbody>
      ${gaps.map((g) => `<tr><td style="text-align:left;">${esc(g.school)} · ${esc(g.sport)}</td><td>${g.total}</td><td>${g.grads}</td><td>${g.remain}</td><td>${g.flag === "risk" ? '<span class="sq-badge risk">팀 유지 위험</span>' : g.flag === "warn" ? '<span class="sq-badge">공백 주의</span>' : ""}</td></tr>`).join("")}</tbody></table></div>
      <p class="sub" style="margin:6px 0 0;">최고 학년은 초6·중3·고3입니다. 학년을 읽지 못한 선수는 졸업 예정에 넣지 않았습니다.</p>` : '<p class="empty-note">조건에 맞는 팀이 없습니다.</p>');
  // c. 성별 구성
  let pc, dC = null;
  if (!ath) pc = panel("c", "성별 구성", "단위: % (종목별 남·여 100%)", PENDING);
  else {
    const sp = [...new Set(ath.map((a) => a.sport))].sort(ko).map((s) => { const r = ath.filter((a) => a.sport === s); const m = r.filter((a) => a.gender === "남").length, f = r.filter((a) => a.gender === "여").length; return { s, m, f, t: m + f }; }).filter((x) => x.t);
    pc = panel("c", "성별 구성", "단위: % (종목별 남·여 100%)", sp.length ? canvasBox("ccv", "종목별 남녀 비율 100퍼센트 쌓은 가로 막대 그래프", Math.max(200, sp.length * 34 + 70)) + tableHtml(["종목", "남(명)", "여(명)", "남(%)", "여(%)"], sp.map((x) => [x.s, x.m, x.f, Math.round((x.m / x.t) * 100), Math.round((x.f / x.t) * 100)])) : '<p class="empty-note">조건에 맞는 선수가 없습니다.</p>');
    dC = sp;
  }
  // d. 세부종목 분포
  let pd, dD = null;
  if (!ath) pd = panel("d", "세부종목·포지션 분포", "단위: 명", PENDING);
  else {
    const dSports = [...new Set(ath.map((a) => a.sport))].sort(ko);
    if (!dSports.includes(dSport)) dSport = F.sport && dSports.includes(F.sport) ? F.sport : dSports[0] || "";
    const det = {}; ath.filter((a) => a.sport === dSport).forEach((a) => { const k = String(a.detail || "").trim() || "미기재"; det[k] = (det[k] || 0) + 1; });
    const dr = Object.entries(det).sort((a, b) => b[1] - a[1] || ko(a[0], b[0]));
    pd = panel("d", "세부종목·포지션 분포", "단위: 명 (종목을 고르면 세부종목·포지션별 인원)", dSports.length ? `<div class="ts-row"><label for="sqDSport">종목</label><select id="sqDSport">${dSports.map((s) => `<option${s === dSport ? " selected" : ""}>${esc(s)}</option>`).join("")}</select></div>`
      + canvasBox("dcv", "세부종목별 선수 수 가로 막대 그래프", Math.max(200, dr.length * 30 + 60)) + tableHtml(["세부종목·포지션", "인원"], dr) : '<p class="empty-note">조건에 맞는 선수가 없습니다.</p>');
    dD = dr;
  }
  // e. 지도자 구성
  let pe, dE = null;
  if (!stf) pe = panel("e", "지도자 구성", "단위: 명", PENDING);
  else {
    const byLv = LEVELS.map((l) => ({ l, d: stf.filter((s) => s.lv === l && s.role === "감독").length, c: stf.filter((s) => s.lv === l && s.role === "코치").length }));
    const st = {}; stf.forEach((s) => { const k = String(s.status || "").trim() || "미기재"; st[k] = (st[k] || 0) + 1; });
    const sr = Object.entries(st).sort((a, b) => b[1] - a[1]);
    pe = panel("e", "지도자 구성", "단위: 명 (학교급별 감독·코치 / 신분 비율)", stf.length ? `<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px;"><div>${canvasBox("ecv1", "학교급별 감독과 코치 수 막대 그래프")}</div><div>${canvasBox("ecv2", "지도자 신분 비율 도넛 그래프")}</div></div>`
      + tableHtml(["학교급", "감독", "코치"], byLv.map((x) => [x.l, x.d, x.c])) + tableHtml(["신분", "인원"], sr) : '<p class="empty-note">조건에 맞는 지도자가 없습니다.</p>');
    dE = { byLv, sr };
  }

  root.innerHTML = filters + cards + [pa, pb, pc, pd, pe].join("");

  // 그래프 그리기
  const opt = (extra) => ({ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, ...extra });
  if (dA && ath.length) draw("acv", { type: "bar", data: { labels: dA.labels, datasets: [{ label: "남", data: dA.m, backgroundColor: C_M }, { label: "여", data: dA.f, backgroundColor: C_F }] },
    options: opt({ scales: { x: { stacked: true, title: { display: true, text: "학년" } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "선수 수(명)" } } } }) });
  if (dC && dC.length) draw("ccv", { type: "bar", data: { labels: dC.map((x) => x.s), datasets: [{ label: "남(%)", data: dC.map((x) => (x.m / x.t) * 100), backgroundColor: C_M }, { label: "여(%)", data: dC.map((x) => (x.f / x.t) * 100), backgroundColor: C_F }] },
    options: opt({ indexAxis: "y", scales: { x: { stacked: true, max: 100, title: { display: true, text: "비율(%)" } }, y: { stacked: true } } }) });
  if (dD && dD.length) draw("dcv", { type: "bar", data: { labels: dD.map((x) => x[0]), datasets: [{ label: "인원", data: dD.map((x) => x[1]), backgroundColor: NAVY }] },
    options: opt({ indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "인원(명)" } } } }) });
  if (dE && stf.length) {
    draw("ecv1", { type: "bar", data: { labels: dE.byLv.map((x) => x.l), datasets: [{ label: "감독", data: dE.byLv.map((x) => x.d), backgroundColor: NAVY }, { label: "코치", data: dE.byLv.map((x) => x.c), backgroundColor: "#9AA3AD" }] },
      options: opt({ scales: { x: { title: { display: true, text: "학교급" } }, y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "지도자 수(명)" } } } }) });
    draw("ecv2", { type: "doughnut", data: { labels: dE.sr.map((x) => x[0]), datasets: [{ data: dE.sr.map((x) => x[1]), backgroundColor: [NAVY, C_F, "#9AA3AD", "#C9A227", "#3B8E5A"] }] }, options: opt({}) });
  }

  // 이벤트
  root.querySelector("#sqYear")?.addEventListener("change", async (e) => { F = { level: "", sport: "", school: "" }; await loadYear(Number(e.target.value)); render(); });
  root.querySelectorAll("[data-level]").forEach((b) => b.addEventListener("click", () => { F.level = b.dataset.level; render(); }));
  root.querySelector("#sqSport").addEventListener("change", (e) => { F.sport = e.target.value; dSport = ""; render(); });
  root.querySelector("#sqSchool").addEventListener("change", (e) => { F.school = e.target.value; render(); });
  root.querySelector("#sqDSport")?.addEventListener("change", (e) => { dSport = e.target.value; render(); });
}

init();
