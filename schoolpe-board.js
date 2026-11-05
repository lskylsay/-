// 학교체육업무지원 게시판 — window.SCHOOLPE_CATEGORY 값에 해당하는 게시글만
// Supabase의 school_pe_posts 테이블에서 읽어와 목록으로 보여줍니다.
// 각 카테고리 페이지(schoolpe-*.html)는 이 파일을 불러오기 전에
// window.SCHOOLPE_CATEGORY 를 지정합니다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const listEl = document.getElementById("boardList");

function fileUrl(filePath) {
  const { data } = supabase.storage.from("schoolpe-files").getPublicUrl(filePath);
  return data.publicUrl;
}

async function loadPosts() {
  const { data, error } = await supabase
    .from("school_pe_posts")
    .select("*")
    .eq("category", window.SCHOOLPE_CATEGORY)
    .order("created_at", { ascending: false });

  if (error) {
    listEl.innerHTML = '<p class="empty-note">목록을 불러오지 못했습니다.</p>';
    return;
  }

  allPosts = data || [];
  if (!SPORTS) { renderPosts(allPosts, window.SCHOOLPE_EMPTY_TEXT || "등록된 게시물이 없습니다."); return; }
  const [hTab, hSub] = decodeURIComponent((location.hash || "").slice(1)).split("/");
  activeTab = SPORTS.includes(hTab) || hTab === "공통" ? hTab : SPORTS[0];
  activeSub = hSub && (SUBS[activeTab] || []).includes(hSub) ? hSub : "전체";
  showTab();
}

// 종목 탭(window.SCHOOLPE_SPORTS)이 있는 게시판: 게시물 제목이 "[종목] 제목" 형식이면 그 종목 탭에 모아 보여줍니다.
// 종목 아래 학교별 하위 탭(window.SCHOOLPE_SUBS = { 종목: [학교, …] })이 있으면 "[종목·학교] 제목" 형식으로 학교 탭에 모읍니다.
// (관리자 화면의 종목·학교 선택이 제목 앞에 붙여 등록합니다. [종목]이 없는 글은 '공통' 탭에 나옵니다.)
const SPORTS = window.SCHOOLPE_SPORTS || null;
const SUBS = window.SCHOOLPE_SUBS || {};
const tabsEl = document.getElementById("boardTabs");
const subTabsEl = document.getElementById("boardSubTabs");
let allPosts = [];
let activeTab = null;
let activeSub = "전체";

// "[종목]" 또는 "[종목·학교]" → { sport, school }
function tagOf(p) {
  const m = String(p.title || "").match(/^\[([^\]]+)\]\s*/);
  if (!m || !SPORTS) return null;
  const [sport, school] = m[1].split("·").map((x) => x.trim());
  return SPORTS.includes(sport) ? { sport, school: school || "" } : null;
}
const sportOf = (p) => { const t = tagOf(p); return t ? t.sport : null; };
const stripSport = (p) => (tagOf(p) ? { ...p, title: p.title.replace(/^\[[^\]]+\]\s*/, "") } : p);

function setHash() {
  const h = activeSub !== "전체" ? `${activeTab}/${activeSub}` : activeTab;
  history.replaceState(null, "", "#" + encodeURIComponent(h));
}

function renderTabs() {
  if (!SPORTS || !tabsEl) return;
  const hasCommon = allPosts.some((p) => !sportOf(p));
  const tabs = hasCommon ? [...SPORTS, "공통"] : SPORTS;
  tabsEl.innerHTML = "";
  tabs.forEach((t) => {
    const n = allPosts.filter((p) => (t === "공통" ? !sportOf(p) : sportOf(p) === t)).length;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "filter-btn" + (t === activeTab ? " active" : "");
    b.textContent = n ? `${t} ${n}` : t;
    b.addEventListener("click", () => { activeTab = t; activeSub = "전체"; setHash(); showTab(); });
    tabsEl.appendChild(b);
  });
}

// 종목 아래 학교별 하위 탭 (롤러(빙상): 동명초·제천중·제천여중·제천고·제천여고)
function renderSubTabs() {
  if (!subTabsEl) return;
  const schools = SUBS[activeTab];
  if (!schools || !schools.length) { subTabsEl.style.display = "none"; subTabsEl.innerHTML = ""; return; }
  subTabsEl.style.display = "";
  subTabsEl.innerHTML = "";
  ["전체", ...schools].forEach((sc) => {
    const n = allPosts.filter((p) => { const t = tagOf(p); return t && t.sport === activeTab && (sc === "전체" || t.school === sc); }).length;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "filter-btn filter-btn-sub" + (sc === activeSub ? " active" : "");
    b.textContent = n ? `${sc} ${n}` : sc;
    b.addEventListener("click", () => { activeSub = sc; setHash(); showTab(); });
    subTabsEl.appendChild(b);
  });
}

function showTab() {
  renderTabs();
  renderSubTabs();
  const list = allPosts.filter((p) => {
    if (activeTab === "공통") return !sportOf(p);
    const t = tagOf(p);
    return t && t.sport === activeTab && (activeSub === "전체" || t.school === activeSub);
  }).map(stripSport);
  const base = window.SCHOOLPE_EMPTY_TEXT || "등록된 게시물이 없습니다.";
  let label = activeTab;
  if (activeTab !== "공통" && activeSub !== "전체") label = `${activeSub} ${activeTab}팀`;
  renderPosts(list, activeTab === "공통" ? base : base.replace("등록된 자료", `등록된 ${label} 자료`));
}

function renderPosts(data, emptyText) {
  if (!data || data.length === 0) {
    listEl.innerHTML = `<p class="empty-note">${emptyText}</p>`;
    return;
  }

function isImageFile(name) {
  return /\.(png|jpe?g|gif|webp)$/i.test(name || "");
}

  listEl.innerHTML = data
    .map((p) => {
      const date = new Date(p.created_at).toLocaleDateString("ko-KR");
      const titleText = p.title || p.file_name || "제목 없음";

      if (p.file_path && isImageFile(p.file_name)) {
        return `
          <div class="board-photo-row">
            <div class="board-photo-head">
              <strong>${titleText}</strong>
              <span class="sub" style="margin:0;">${date}</span>
            </div>
            ${p.content ? `<p class="board-row-note">${p.content.replace(/\n/g, "<br>")}</p>` : ""}
            <a href="${fileUrl(p.file_path)}" target="_blank" rel="noopener">
              <img src="${fileUrl(p.file_path)}" alt="${titleText}" class="board-photo">
            </a>
          </div>`;
      }

      const titleHtml = p.file_path
        ? `<a href="${fileUrl(p.file_path)}" target="_blank" rel="noopener" style="color:inherit; text-decoration:none;">${titleText}</a>`
        : titleText;
      return `
        <div class="board-row">
          <div class="board-row-main">
            <strong>${titleHtml}</strong>
            ${p.content ? `<p class="board-row-note">${p.content.replace(/\n/g, "<br>")}</p>` : ""}
            ${p.file_name ? `<p class="board-row-note">${p.file_name}</p>` : ""}
          </div>
          <div class="board-row-side">
            <span class="sub" style="margin:0;">${date}</span>
            ${
              p.file_path
                ? `<a href="${fileUrl(p.file_path)}" class="btn btn-outline" target="_blank" rel="noopener">다운로드</a>`
                : ""
            }
          </div>
        </div>`;
    })
    .join("");
}


loadPosts();
