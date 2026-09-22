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

  if (!data || data.length === 0) {
    listEl.innerHTML = '<p class="empty-note">등록된 게시물이 없습니다.</p>';
    return;
  }

  listEl.innerHTML = data
    .map((p) => {
      const date = new Date(p.created_at).toLocaleDateString("ko-KR");
      return `
        <div class="board-row">
          <div class="board-row-main">
            <strong>${p.title || p.file_name || "제목 없음"}</strong>
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
