// 학교운동부 지도 (공개) — 운동부는 RPC get_public_teams, 학교 위치는 sport_schools(누구나 읽기). Leaflet 1.9.4 + OpenStreetMap.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const root = document.getElementById("mapApp");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ko = (a, b) => String(a).localeCompare(String(b), "ko");
const total = (t) => (t.players_m || 0) + (t.players_f || 0);
const css = (v, fb) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb;
const COLOR = { 초: css("--level-cho", "#3B8E5A"), 중: css("--level-jung", "#3B6FB6"), 고: css("--level-go", "#C1502E") };
const LEVEL_NAME = { 초: "초등학교", 중: "중학교", 고: "고등학교" };

let teams = [], schools = [], map = null, layer = null;
const F = { level: "", sport: "" };

function notReady() { root.innerHTML = '<p class="empty-note">자료를 준비 중입니다.</p>'; }

async function init() {
  try {
    const r = await supabase.rpc("get_public_teams", { p_year: null });
    if (r.error || !Array.isArray(r.data) || !r.data.length) return notReady();
    teams = r.data;
    try {
      const s = await supabase.from("sport_schools").select("*");
      schools = !s.error && Array.isArray(s.data) ? s.data : [];
    } catch (e) { schools = []; }
    if (typeof window.L === "undefined") { root.innerHTML = '<p class="empty-note">지도를 불러오지 못했습니다. 잠시 후 다시 열어 주세요.</p>'; return; }
    build();
  } catch (e) { notReady(); }
}

function build() {
  const sports = [...new Set(teams.map((t) => t.sport))].sort(ko);
  root.innerHTML = `
    <div class="ts-row"><span>학교급</span>
      ${["", "초", "중", "고"].map((l) => `<button type="button" class="filter-btn${F.level === l ? " active" : ""}" data-level="${l}">${l || "전체"}</button>`).join("")}
      <label for="mapSport" style="margin-left:12px;">종목</label>
      <select id="mapSport"><option value="">전체</option>${sports.map((s) => `<option>${esc(s)}</option>`).join("")}</select></div>
    <div class="map-legend">${["초", "중", "고"].map((l) => `<span><i style="background:${COLOR[l]}"></i>${LEVEL_NAME[l]}</span>`).join("")}</div>
    <div id="mapBox" class="map-box" role="application" aria-label="학교운동부 지도"></div>
    <p class="sub" style="margin:6px 0 0;">지도 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap 기여자</a></p>
    <div id="mapMissing"></div>`;
  map = window.L.map("mapBox").setView([37.132, 128.191], 12);
  window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap 기여자" }).addTo(map);
  layer = window.L.layerGroup().addTo(map);
  root.querySelectorAll("[data-level]").forEach((b) => b.addEventListener("click", () => { F.level = b.dataset.level; root.querySelectorAll("[data-level]").forEach((x) => x.classList.toggle("active", x === b)); draw(); }));
  root.querySelector("#mapSport").addEventListener("change", (e) => { F.sport = e.target.value; draw(); });
  draw();
}

function popup(name, level, list) {
  return `<div style="min-width:200px"><strong>${esc(name)}</strong> <span class="sub">${esc(LEVEL_NAME[level] || level || "")}</span>
    ${list.map((t) => `<div style="margin-top:6px;"><b>${esc(t.sport)}</b> · 선수 ${total(t)}명 (남 ${t.players_m || 0} · 여 ${t.players_f || 0})<br>감독 ${t.directors || 0}명 · 코치 ${t.coaches || 0}명
      <br><a href="pathways.html#${encodeURIComponent(t.sport)}">연계 경로도에서 보기</a></div>`).join("")}</div>`;
}

function draw() {
  layer.clearLayers();
  const visTeams = teams.filter((t) => (!F.level || t.level === F.level) && (!F.sport || t.sport === F.sport));
  const names = [...new Set(visTeams.map((t) => t.school))].sort(ko);
  const missing = [];
  names.forEach((name) => {
    const list = visTeams.filter((t) => t.school === name).sort((a, b) => ko(a.sport, b.sport));
    const sc = schools.find((s) => s.name === name);
    const level = list[0].level || sc?.level;
    if (sc && sc.lat != null && sc.lng != null && Number.isFinite(Number(sc.lat)) && Number.isFinite(Number(sc.lng))) {
      window.L.circleMarker([Number(sc.lat), Number(sc.lng)], { radius: 9, color: "#fff", weight: 2, fillColor: COLOR[level] || "#666", fillOpacity: 0.95 })
        .bindPopup(popup(name, level, list)).addTo(layer);
    } else missing.push({ name, level });
  });
  document.getElementById("mapMissing").innerHTML = missing.length
    ? `<h3 style="margin:18px 0 8px;">위치 미등록 학교 (${missing.length}교)</h3><ul class="map-missing">${missing.map((m) => `<li>${esc(m.name)} <span class="sub">${esc(LEVEL_NAME[m.level] || "")}</span></li>`).join("")}</ul>` : "";
}

init();
