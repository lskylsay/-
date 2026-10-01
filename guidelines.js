// 대회요강 게시판 — Supabase의 guidelines 테이블과 storage 버킷(guideline-files)에서
// 관리자가 업로드한 문서를 읽어와 목록으로 보여줍니다.
// 미리보기용 PDF(preview_path)가 있는 문서는 제목을 누르면 화면 안 모달 창으로 보여주고,
// 없는 문서는 지금처럼 바로 다운로드합니다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const listEl = document.getElementById("guidelinesList");

function fileUrl(filePath, downloadName) {
  const options = downloadName ? { download: downloadName } : undefined;
  const { data } = supabase.storage.from("guideline-files").getPublicUrl(filePath, options);
  return data.publicUrl;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function isImageFile(name) {
  return /\.(png|jpe?g|gif|webp)$/i.test(name || "");
}

/* ============ PDF 미리보기 모달 ============ */

const modal = document.getElementById("pdfModal");
const modalTitle = document.getElementById("pdfModalTitle");
const modalFrame = document.getElementById("pdfModalFrame");
const modalDownload = document.getElementById("pdfModalDownload");
const modalNewTab = document.getElementById("pdfModalNewTab");
const modalClose = document.getElementById("pdfModalClose");
let lastFocused = null;

function openPreview(g) {
  const titleText = g.title || g.file_name || "제목 없음";
  const previewUrl = fileUrl(g.preview_path);
  lastFocused = document.activeElement;
  modalTitle.textContent = titleText;
  modalFrame.title = `${titleText} 미리보기`;
  modalFrame.src = previewUrl;
  modalNewTab.href = previewUrl;
  modalDownload.href = fileUrl(g.file_path, g.file_name || true);
  modal.hidden = false;
  document.body.classList.add("modal-open");
  modalClose.focus();
}

function closePreview() {
  if (modal.hidden) return;
  modal.hidden = true;
  modalFrame.src = "about:blank";
  document.body.classList.remove("modal-open");
  if (lastFocused) lastFocused.focus();
}

modalClose.addEventListener("click", closePreview);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closePreview();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.hidden) closePreview();
});

/* ============ 목록 ============ */

async function loadGuidelines() {
  const { data, error } = await supabase
    .from("guidelines")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    listEl.innerHTML = '<p class="empty-note">목록을 불러오지 못했습니다.</p>';
    return;
  }

  if (!data || data.length === 0) {
    listEl.innerHTML = '<p class="empty-note">등록된 요강 문서가 없습니다.</p>';
    return;
  }

  listEl.innerHTML = data
    .map((g, idx) => {
      const date = new Date(g.created_at).toLocaleDateString("ko-KR");
      const titleText = escapeHtml(g.title || g.file_name || "제목 없음");
      const noteHtml = g.note ? `<p class="board-row-note">${escapeHtml(g.note)}</p>` : "";

      if (g.file_path && isImageFile(g.file_name)) {
        return `
          <div class="board-photo-row">
            <div class="board-photo-head">
              <strong>${titleText}</strong>
              <span class="sub" style="margin:0;">${date}</span>
            </div>
            ${noteHtml}
            <a href="${fileUrl(g.file_path)}" target="_blank" rel="noopener">
              <img src="${fileUrl(g.file_path)}" alt="${titleText}" class="board-photo">
            </a>
          </div>`;
      }

      const titleHtml = g.preview_path
        ? `<button type="button" class="board-title-btn" data-preview="${idx}">${titleText}<span class="preview-badge">미리보기</span></button>`
        : `<a href="${fileUrl(g.file_path)}" target="_blank" rel="noopener" style="color:inherit; text-decoration:none;">${titleText}</a>`;
      return `
        <div class="board-row">
          <div class="board-row-main">
            <strong>${titleHtml}</strong>
            ${noteHtml}
          </div>
          <div class="board-row-side">
            <span class="sub" style="margin:0;">${date}</span>
            <a href="${fileUrl(g.file_path)}" class="btn btn-outline" target="_blank" rel="noopener">다운로드</a>
          </div>
        </div>`;
    })
    .join("");

  listEl.querySelectorAll("[data-preview]").forEach((btn) => {
    btn.addEventListener("click", () => openPreview(data[Number(btn.dataset.preview)]));
  });
}

loadGuidelines();
