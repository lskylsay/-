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

      const sheetFile = p.file_path && isSheetFile(p.file_name);
      const titleHtml = sheetFile
        ? `<a href="#" data-view="${p.id}" style="color:inherit; text-decoration:none;">${titleText}</a>`   // 엑셀: 제목을 누르면 화면에서 바로 열람
        : p.file_path
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
            ${sheetFile ? `<button type="button" class="btn btn-primary" data-view="${p.id}">내용 보기</button>` : ""}
            ${
              p.file_path
                ? `<a href="${fileUrl(p.file_path)}" class="btn btn-outline" target="_blank" rel="noopener">다운로드</a>`
                : ""
            }
          </div>
        </div>`;
    })
    .join("");

  // 엑셀 파일 "내용 보기" / 제목 클릭 → 화면 안 열람창
  listEl.querySelectorAll("[data-view]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const p = data.find((x) => String(x.id) === el.dataset.view);
      if (p) openSheetViewer(fileUrl(p.file_path), p.title || p.file_name || "파일", p.file_name);
    });
  });
}

// ---------- 엑셀(.xlsx/.xls/.csv) 화면 열람: 시트 탭으로 시트를 바꿔 가며 봄 ----------
const isSheetFile = (name) => /\.(xlsx|xlsm|xls|csv)$/i.test(name || "");
const SHEETJS_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
const MAX_ROWS = 1000, MAX_COLS = 60;
let xlsxPromise = null;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxPromise) {
    xlsxPromise = new Promise((resolve, reject) => {
      const sc = document.createElement("script");
      sc.src = SHEETJS_URL;
      sc.onload = () => resolve(window.XLSX);
      sc.onerror = () => { xlsxPromise = null; reject(new Error("표 보기 도구를 불러오지 못했습니다")); };
      document.head.appendChild(sc);
    });
  }
  return xlsxPromise;
}

let sheetModal = null;
function ensureSheetModal() {
  if (sheetModal) return sheetModal;
  const m = document.createElement("div");
  m.className = "pdf-modal sheet-modal";
  m.hidden = true;
  m.innerHTML = `
    <div class="pdf-modal-box" role="dialog" aria-modal="true" aria-label="파일 내용 보기">
      <div class="pdf-modal-head">
        <strong class="pdf-modal-title" id="sheetTitle"></strong>
        <div class="pdf-modal-actions">
          <a id="sheetDownload" class="btn btn-outline" target="_blank" rel="noopener">다운로드</a>
          <button type="button" class="pdf-modal-close" id="sheetClose" aria-label="닫기">✕</button>
        </div>
      </div>
      <div class="sheet-body" id="sheetBody"></div>
      <div class="sheet-tabs" id="sheetTabs" role="tablist" aria-label="시트 선택"></div>
      <p class="pdf-modal-foot" id="sheetFoot"></p>
    </div>`;
  document.body.appendChild(m);
  const close = () => { m.hidden = true; document.body.classList.remove("modal-open"); };
  m.querySelector("#sheetClose").addEventListener("click", close);
  m.addEventListener("click", (e) => { if (e.target === m) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !m.hidden) close(); });
  sheetModal = m;
  return m;
}

async function openSheetViewer(url, title, fileName) {
  const m = ensureSheetModal();
  const body = m.querySelector("#sheetBody"), tabs = m.querySelector("#sheetTabs"), foot = m.querySelector("#sheetFoot");
  m.querySelector("#sheetTitle").textContent = title;
  m.querySelector("#sheetDownload").href = url;
  body.innerHTML = '<p class="sheet-msg">불러오는 중…</p>';
  tabs.innerHTML = ""; foot.textContent = "";
  m.hidden = false;
  document.body.classList.add("modal-open");
  try {
    const [XLSX, buf] = await Promise.all([loadXlsx(), fetch(url).then((r) => { if (!r.ok) throw new Error("파일을 불러오지 못했습니다"); return r.arrayBuffer(); })]);
    const wb = XLSX.read(buf, { type: "array" });
    const hidden = (wb.Workbook && wb.Workbook.Sheets) || [];
    const names = wb.SheetNames.filter((n, i) => !(hidden[i] && hidden[i].Hidden));   // 숨김 시트는 제외
    if (!names.length) { body.innerHTML = '<p class="sheet-msg">표시할 시트가 없습니다.</p>'; return; }
    const show = (name) => {
      const ws = wb.Sheets[name];
      let note = "";
      if (ws["!ref"]) {
        const r = XLSX.utils.decode_range(ws["!ref"]);
        if (r.e.r - r.s.r + 1 > MAX_ROWS || r.e.c - r.s.c + 1 > MAX_COLS) {
          r.e.r = Math.min(r.e.r, r.s.r + MAX_ROWS - 1); r.e.c = Math.min(r.e.c, r.s.c + MAX_COLS - 1);
          ws["!ref"] = XLSX.utils.encode_range(r);
          note = `표가 커서 처음 ${MAX_ROWS}행·${MAX_COLS}열까지만 보여 드립니다. 전체는 다운로드해서 확인해 주세요.`;
        }
      }
      body.innerHTML = ws["!ref"] ? XLSX.utils.sheet_to_html(ws) : '<p class="sheet-msg">비어 있는 시트입니다.</p>';
      // 제목·안내처럼 첫 칸에만 글이 있는 줄은 가로로 합쳐서 보기 좋게
      body.querySelectorAll("tr").forEach((tr) => {
        const cells = Array.from(tr.children);
        if (cells.length > 1 && cells[0].textContent.trim() && cells.slice(1).every((c) => !c.textContent.trim())) {
          cells[0].colSpan = cells.length; cells[0].style.maxWidth = "none"; cells.slice(1).forEach((c) => c.remove());
        }
      });
      body.scrollTop = 0; body.scrollLeft = 0;
      foot.textContent = note || `${fileName || ""} · 시트 ${names.indexOf(name) + 1}/${names.length}`;
      tabs.querySelectorAll("button").forEach((b) => { const on = b.dataset.sheet === name; b.classList.toggle("active", on); b.setAttribute("aria-selected", on); });
    };
    names.forEach((n) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "sheet-tab"; b.dataset.sheet = n; b.textContent = n; b.setAttribute("role", "tab");
      b.addEventListener("click", () => show(n));
      tabs.appendChild(b);
    });
    show(names[0]);
  } catch (err) {
    body.innerHTML = `<p class="sheet-msg">${err.message || "파일을 열지 못했습니다."} 다운로드 버튼으로 받아서 확인해 주세요.</p>`;
  }
}

loadPosts();
