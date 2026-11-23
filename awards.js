// 성과 기록 (공개) — RPC get_public_awards 만 사용. 선수 이름은 RPC가 주지 않으며 이 화면에서도 다루지 않는다.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const root = document.getElementById("awardsApp");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ko = (a, b) => String(a).localeCompare(String(b), "ko");
const MEDAL_CLASS = { 금: "medal-gold", 은: "medal-silver", 동: "medal-bronze" };
const F = { year: "", comp: "", sport: "", level: "", school: "", medal: "" };
let rows = [];

function notReady() { root.innerHTML = '<p class="empty-note">자료를 준비 중입니다.</p>'; }

async function init() {
  try {
    const { data, error } = await supabase.rpc("get_public_awards", {});
    if (error || !Array.isArray(data) || !data.length) return notReady();
    rows = data;
    render();
  } catch (e) { notReady(); }
}

function opts(key, label, vals, cur) {
  return `<div><label for="awf_${key}">${label}</label><select id="awf_${key}" data-f="${key}"><option value="">전체</option>${vals.map((v) => `<option${String(v) === String(cur) ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></div>`;
}

function render() {
  const uniq = (k, desc) => [...new Set(rows.map((r) => r[k]).filter((v) => v != null && v !== ""))].sort(desc ? (a, b) => b - a : ko);
  const vis = rows.filter((r) => (!F.year || String(r.year) === F.year) && (!F.comp || r.competition === F.comp) && (!F.sport || r.sport === F.sport)
    && (!F.level || r.school_level === F.level) && (!F.school || r.school === F.school) && (!F.medal || r.medal === F.medal));
  const n = (m) => vis.filter((r) => r.medal === m).length;
  const open = window.matchMedia("(min-width: 641px)").matches;
  const keepOpen = document.getElementById("awFilters");
  const isOpen = keepOpen ? keepOpen.open : open;

  const years = [...new Set(vis.map((r) => r.year))].sort((a, b) => b - a);
  const body = years.map((y) => {
    const comps = [...new Set(vis.filter((r) => r.year === y).map((r) => r.competition))]
      .map((c) => ({ c, d: vis.filter((r) => r.year === y && r.competition === c).map((r) => r.event_date).filter(Boolean).sort()[0] || "9999" }))
      .sort((a, b) => a.d.localeCompare(b.d) || ko(a.c, b.c));
    return `<h2 class="aw-year">${y}년</h2>` + comps.map(({ c }) => {
      const list = vis.filter((r) => r.year === y && r.competition === c)
        .sort((a, b) => ko(a.sport, b.sport) || ko(a.detail || "", b.detail || "") || (a.place ?? 99) - (b.place ?? 99) || ko(a.school, b.school));
      const lvl = list[0].comp_level, date = list.map((r) => r.event_date).filter(Boolean).sort()[0];
      return `<div class="aw-group"><h3>${esc(c)}${lvl ? ` <span class="sub">· ${esc(lvl)}</span>` : ""}${date ? ` <span class="sub">· ${esc(date)}</span>` : ""}</h3>
        <div class="ts-scroll"><table class="result-table aw-table"><thead><tr><th>종목</th><th>세부종목</th><th>학교</th><th>성별</th><th>구분</th><th>순위</th><th>메달</th><th>기록</th><th>비고</th></tr></thead><tbody>
        ${list.map((r) => `<tr><td>${esc(r.sport)}</td><td>${esc(r.detail)}</td><td>${esc(r.school)}</td><td>${esc(r.gender)}</td><td>${esc(r.team_type)}</td><td>${r.place ?? ""}</td>
          <td>${r.medal ? `<span class="medal-badge ${MEDAL_CLASS[r.medal]}">${esc(r.medal)}</span>` : ""}</td><td>${esc(r.record)}</td><td style="white-space:normal;">${esc(r.note)}</td></tr>`).join("")}
        </tbody></table></div></div>`;
    }).join("");
  }).join("");

  root.innerHTML = `
    <details class="aw-filters" id="awFilters"${isOpen ? " open" : ""}><summary>필터 (연도·대회·종목·학교급·학교·메달)</summary>
      <div class="aw-filter-grid">
        ${opts("year", "연도", uniq("year", true), F.year)}${opts("comp", "대회", uniq("competition"), F.comp)}${opts("sport", "종목", uniq("sport"), F.sport)}
        ${opts("level", "학교급", ["초", "중", "고"].filter((l) => rows.some((r) => r.school_level === l)), F.level)}${opts("school", "학교", uniq("school"), F.school)}${opts("medal", "메달", ["금", "은", "동"], F.medal)}
      </div></details>
    <div class="aw-sum">
      <div class="medal-gold"><b>${n("금")}</b><span>금메달</span></div>
      <div class="medal-silver"><b>${n("은")}</b><span>은메달</span></div>
      <div class="medal-bronze"><b>${n("동")}</b><span>동메달</span></div>
      <div><b>${n("금") + n("은") + n("동")}</b><span>메달 합계 (조건에 맞는 기록 ${vis.length}건)</span></div>
    </div>
    ${vis.length ? body : '<p class="empty-note">조건에 맞는 기록이 없습니다.</p>'}`;
  root.querySelectorAll("select[data-f]").forEach((s) => s.addEventListener("change", () => { F[s.dataset.f] = s.value; render(); }));
}

init();
