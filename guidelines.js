// 대회요강 게시판 — Supabase의 guidelines 테이블과 storage 버킷(guideline-files)에서
// 관리자가 업로드한 문서를 읽어와 목록으로 보여줍니다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const listEl = document.getElementById("guidelinesList");

function fileUrl(filePath) {
  const { data } = supabase.storage.from("guideline-files").getPublicUrl(filePath);
  return data.publicUrl;
}

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

function isImageFile(name) {
  return /\.(png|jpe?g|gif|webp)$/i.test(name || "");
}

  listEl.innerHTML = data
    .map((g) => {
      const date = new Date(g.created_at).toLocaleDateString("ko-KR");
      const titleText = g.title || g.file_name || "제목 없음";

      if (g.file_path && isImageFile(g.file_name)) {
        return `
          <div class="board-photo-row">
            <div class="board-photo-head">
              <strong>${titleText}</strong>
              <span class="sub" style="margin:0;">${date}</span>
            </div>
            ${g.note ? `<p class="board-row-note">${g.note}</p>` : ""}
            <a href="${fileUrl(g.file_path)}" target="_blank" rel="noopener">
              <img src="${fileUrl(g.file_path)}" alt="${titleText}" class="board-photo">
            </a>
          </div>`;
      }

      const titleHtml = `<a href="${fileUrl(g.file_path)}" target="_blank" rel="noopener" style="color:inherit; text-decoration:none;">${titleText}</a>`;
      return `
        <div class="board-row">
          <div class="board-row-main">
            <strong>${titleHtml}</strong>
            ${g.note ? `<p class="board-row-note">${g.note}</p>` : ""}
          </div>
          <div class="board-row-side">
            <span class="sub" style="margin:0;">${date}</span>
            <a href="${fileUrl(g.file_path)}" class="btn btn-outline" target="_blank" rel="noopener">다운로드</a>
          </div>
        </div>`;
    })
    .join("");
}

loadGuidelines();
