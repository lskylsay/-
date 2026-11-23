// 학교운동부 운영 현황 (공개) — RPC get_public_teams / get_public_team_years 만 사용.
// 학생·지도자 이름, 기록, 예상 메달은 RPC가 주지 않으며 이 화면에서도 다루지 않는다.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enrich, ORDER_LABELS } from "./squad-lib.js";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const root = document.getElementById("teamsStatus");
const LEVELS = ["초", "중", "고"];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ko = (a, b) => String(a).localeCompare(String(b), "ko");
const total = (t) => (t.players_m || 0) + (t.players_f || 0);

let rows = [];
let years = [];
let year = null;
let fLevel = "";
let fSport = "";
const rosterCache = new Map();   // 학년도 → Promise<{ athletes: 배열|null, staff: 배열|null }> (RPC 오류면 null → 모달에서 '준비 중')

function loadRoster(y) {
  const key = String(y);
  if (!rosterCache.has(key)) {
    const get = async (fn) => { try { const r = await supabase.rpc(fn, { p_year: y ?? null }); return r.error || !Array.isArray(r.data) ? null : r.data; } catch (e) { return null; } };
    rosterCache.set(key, Promise.all([get("get_public_athletes"), get("get_public_staff")]).then(([athletes, staff]) => ({ athletes, staff })));
  }
  return rosterCache.get(key);
}

function notReady() {
  root.innerHTML = '<p class="empty-note">현황 자료를 준비 중입니다.</p>';
}

async function load(y) {
  const { data, error } = await supabase.rpc("get_public_teams", { p_year: y ?? null });
  if (error || !Array.isArray(data) || !data.length) return null;
  return data;
}

async function init() {
  try {
    const yr = await supabase.rpc("get_public_team_years");
    if (yr.error) return notReady();
    years = (yr.data || []).map((r) => (typeof r === "object" ? Object.values(r)[0] : r)).map(Number).filter(Boolean);
    const data = await load(years[0] ?? null);
    if (!data) return notReady();
    rows = data;
    year = Number(rows[0].year);
    loadRoster(year);
    render();
  } catch (e) { notReady(); }
}

async function changeYear(y) {
  const data = await load(y);
  if (!data) return;
  rows = data; year = y; fLevel = ""; fSport = "";
  loadRoster(y);
  render();
}

function render() {
  const sports = [...new Set(rows.map((r) => r.sport))].sort(ko);
  if (fSport && !sports.includes(fSport)) fSport = "";
  const vis = rows.filter((r) => (!fLevel || r.level === fLevel) && (!fSport || r.sport === fSport));
  const schools = [...new Set(vis.map((r) => r.school))].map((s) => ({ s, level: vis.find((r) => r.school === s).level }))
    .sort((a, b) => (LEVELS.indexOf(a.level) + 1 || 9) - (LEVELS.indexOf(b.level) + 1 || 9) || ko(a.s, b.s)).map((x) => x.s);
  const cols = [...new Set(vis.map((r) => r.sport))].sort(ko);
  const m = vis.reduce((a, r) => a + (r.players_m || 0), 0), f = vis.reduce((a, r) => a + (r.players_f || 0), 0);
  const cell = (s, sp) => vis.find((r) => r.school === s && r.sport === sp);

  root.innerHTML = `
    ${years.length > 1 ? `<div class="ts-row"><label for="tsYearSel">학년도</label><select id="tsYearSel">${years.map((y) => `<option value="${y}"${y === year ? " selected" : ""}>${y}학년도</option>`).join("")}</select></div>` : `<p class="sub" style="margin:0 0 10px;">${year}학년도 기준</p>`}
    <div class="ts-summary">
      <div><b>${vis.length}</b><span>운동부</span></div>
      <div><b>${schools.length}</b><span>운영 학교</span></div>
      <div><b>${cols.length}</b><span>종목</span></div>
      <div><b>${m + f}</b><span>학생선수 (남 ${m} · 여 ${f})</span></div>
    </div>
    <div class="ts-row">
      <span>학교급</span>
      ${["", ...LEVELS].map((l) => `<button type="button" class="filter-btn${fLevel === l ? " active" : ""}" data-level="${l}">${l || "전체"}</button>`).join("")}
      <label for="tsSportSel" style="margin-left:12px;">종목</label>
      <select id="tsSportSel"><option value="">전체</option>${sports.map((s) => `<option${s === fSport ? " selected" : ""}>${esc(s)}</option>`).join("")}</select>
    </div>
    ${vis.length ? `
    <div class="ts-scroll"><table class="result-table ts-table">
      <thead><tr><th class="ts-sticky">학교</th>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}<th>합계</th></tr></thead>
      <tbody>
      ${schools.map((s) => `<tr><th class="ts-sticky"><button type="button" class="ts-link" data-school="${esc(s)}">${esc(s)}</button></th>
        ${cols.map((c) => { const t = cell(s, c); return t ? `<td><button type="button" class="ts-link" data-school="${esc(s)}">${total(t)}명</button></td>` : "<td></td>"; }).join("")}
        <td><b>${vis.filter((r) => r.school === s).reduce((a, r) => a + total(r), 0)}명</b></td></tr>`).join("")}
      </tbody>
      <tfoot><tr><th class="ts-sticky">합계</th>${cols.map((c) => `<td><b>${vis.filter((r) => r.sport === c).reduce((a, r) => a + total(r), 0)}명</b></td>`).join("")}<td><b>${m + f}명</b></td></tr></tfoot>
    </table></div>
    <h3 style="margin:28px 0 10px;">종목별 요약</h3>
    <div class="ts-cards">
      ${cols.map((c) => { const rs = vis.filter((r) => r.sport === c); const n = (l) => rs.filter((r) => r.level === l).length;
        return `<div class="ts-card"><strong>${esc(c)}</strong><p>운영 학교 ${new Set(rs.map((r) => r.school)).size}곳 · 선수 ${rs.reduce((a, r) => a + total(r), 0)}명</p><p class="sub">초 ${n("초")} · 중 ${n("중")} · 고 ${n("고")}</p></div>`; }).join("")}
    </div>` : '<p class="empty-note">조건에 맞는 운동부가 없습니다.</p>'}`;

  root.querySelector("#tsYearSel")?.addEventListener("change", (e) => changeYear(Number(e.target.value)));
  root.querySelectorAll("[data-level]").forEach((b) => b.addEventListener("click", () => { fLevel = b.dataset.level; render(); }));
  root.querySelector("#tsSportSel").addEventListener("change", (e) => { fSport = e.target.value; render(); });
  root.querySelectorAll("[data-school]").forEach((b) => b.addEventListener("click", () => openCard(b.dataset.school)));
}

const SOFT_NOTE = "개인정보 보호를 위해 성명은 일부 가려 표시하며, 기록·지원 내용은 공개하지 않습니다.";

// 한 운동부의 '선수 구성'(학년별 남·여 막대 + 선수 목록)과 지도자 줄
function squadHtml(t, roster) {
  if (!roster || !roster.athletes) return '<p class="sub" style="margin:8px 0 0;">선수 구성: 자료를 준비 중입니다.</p>';
  const list = enrich(roster.athletes.filter((a) => a.school === t.school && a.sport === t.sport), rows)
    .sort((a, b) => (a.ord ?? 99) - (b.ord ?? 99) || String(a.name).localeCompare(String(b.name), "ko"));
  if (!list.length) return '<p class="sub" style="margin:8px 0 0;">선수 구성: 등록된 명단이 없습니다.</p>';
  const groups = [];
  list.forEach((a) => { let g = groups.find((x) => x.label === a.gradeLabel); if (!g) { g = { label: a.gradeLabel, ord: a.ord ?? 99, m: 0, f: 0 }; groups.push(g); } if (a.gender === "남") g.m++; else if (a.gender === "여") g.f++; });
  groups.sort((a, b) => a.ord - b.ord);
  const max = Math.max(...groups.map((g) => g.m + g.f), 1);
  const bars = groups.map((g) => `<div class="sq-bar-row"><span class="sq-bar-label">${esc(g.label)}</span>
    <span class="sq-bar-track"><i class="sq-m" style="width:${(g.m / max) * 100}%"></i><i class="sq-f" style="width:${(g.f / max) * 100}%"></i></span>
    <span class="sq-bar-num">남 ${g.m} · 여 ${g.f}</span></div>`).join("");
  return `<p style="margin:10px 0 4px;"><b>선수 구성</b> <span class="sub"><i class="sq-dot sq-m"></i>남 <i class="sq-dot sq-f"></i>여</span></p>${bars}
    <div class="ts-scroll" style="margin-top:8px;"><table class="result-table sq-table"><thead><tr><th>이름</th><th>성별</th><th>학년</th><th>세부종목·포지션</th></tr></thead><tbody>
    ${list.map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(a.gender)}</td><td>${esc(a.gradeLabel)}</td><td>${esc(a.detail || "")}</td></tr>`).join("")}</tbody></table></div>`;
}
function staffHtml(t, roster) {
  if (!roster || !roster.staff) return "";
  const rank = { 감독: 0, 코치: 1 };
  const list = roster.staff.filter((x) => x.school === t.school && x.sport === t.sport).sort((a, b) => (rank[a.role] ?? 9) - (rank[b.role] ?? 9) || String(a.name).localeCompare(String(b.name), "ko"));
  if (!list.length) return "";
  return `<p style="margin:8px 0 0;"><b>지도자</b> ${list.map((x) => `${esc(x.role || "")} ${esc(x.name)}${x.status ? `(${esc(x.status)})` : ""}`).join(" · ")}</p>`;
}

async function openCard(school) {
  const list = rows.filter((r) => r.school === school).sort((a, b) => ko(a.sport, b.sport));
  const modal = document.createElement("div");
  modal.className = "pdf-modal";
  const card = (t, roster) => `<div class="ts-card" style="margin-bottom:12px;">
          <strong>${esc(t.sport)}</strong> <span class="sub">${esc(t.kind || "")}</span>
          <p style="margin:4px 0;">${esc(t.team_name || "")}${t.founded ? ` · ${t.founded}년 창단 (창단 ${Math.max(1, year - t.founded + 1)}년째)` : ""}</p>
          <p style="margin:4px 0;">선수 ${total(t)}명 (남 ${t.players_m || 0} · 여 ${t.players_f || 0})</p>
          <p style="margin:4px 0;">감독 ${t.directors || 0}명 · 코치 ${t.coaches || 0}명</p>
          ${t.training_place ? `<p style="margin:4px 0;">훈련 장소: ${esc(t.training_place)}</p>` : ""}
          ${roster === undefined ? '<p class="sub" style="margin:8px 0 0;">선수 구성을 불러오는 중…</p>' : staffHtml(t, roster) + squadHtml(t, roster)}
        </div>`;
  const body = (roster) => `${list.map((t) => card(t, roster)).join("")}<p class="sub" style="margin:4px 0 0;">${SOFT_NOTE}</p>`;
  modal.innerHTML = `
    <div class="pdf-modal-box" role="dialog" aria-modal="true" style="height:auto; max-height:100%; max-width:640px;">
      <div class="pdf-modal-head"><strong class="pdf-modal-title">${esc(school)} 운동부</strong>
        <div class="pdf-modal-actions"><button type="button" class="pdf-modal-close" aria-label="닫기">✕</button></div></div>
      <div class="ts-modal-body" style="padding:16px 20px; overflow:auto;">${body(undefined)}</div>
    </div>`;
  const close = () => { modal.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  modal.addEventListener("click", (e) => { if (e.target === modal || e.target.closest(".pdf-modal-close")) close(); });
  document.body.appendChild(modal);
  const roster = await loadRoster(year);
  const box = modal.querySelector(".ts-modal-body");
  if (box) box.innerHTML = body(roster);
}

init();
