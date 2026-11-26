// 드래그 앤 드롭 파일 첨부 공통 유틸리티
// dropzoneEl: 드롭 영역 div, fileInputEl: 숨겨진 실제 file input, fileNameEl: 파일명 표시용 요소(선택)
//
// 옵션(4번째 인자)을 주지 않으면 예전처럼 파일 1개만 다룸(다른 화면은 그대로).
// 여러 파일 모드: initDropzone(dz, input, listEl, { multiple: true, max: 10, accept: (file) => bool, acceptMsg, onChange })
//   - 끌어놓기·클릭 선택 모두 여러 파일, 다시 넣으면 목록에 추가(합계 max개까지), 같은 파일(이름·크기·수정시각)은 하나만
//   - fileNameEl 자리에 파일 목록(파일명 | 크기 | 상태 | [빼기])과 [모두 지우기]를 그림
//   - 반환값: { getFiles(), setStatus(file, 상태), clear(), setLocked(bool) } — 상태: 대기·읽는 중·완료·오류

const escHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");

export function initDropzone(dropzoneEl, fileInputEl, fileNameEl, options) {
  const multi = !!(options && options.multiple);
  const max = (options && options.max) || 10;
  const accept = (options && options.accept) || (() => true);
  const acceptMsg = (options && options.acceptMsg) || "";
  let items = [];          // { file, key, status }
  let notice = "";
  let locked = false;

  function updateDisplay() {
    const file = fileInputEl.files[0];
    if (fileNameEl) {
      fileNameEl.textContent = file ? "선택된 파일: " + file.name : "";
    }
    dropzoneEl.classList.toggle("has-file", !!file);
  }

  const keyOf = (f) => f.name + "|" + f.size + "|" + f.lastModified;
  const STATUS_COLOR = { 오류: "#c0392b", 완료: "#1e7e34", "읽는 중": "#8a6d00" };

  function render() {
    dropzoneEl.classList.toggle("has-file", items.length > 0);
    if (!fileNameEl) return;
    let html = notice ? `<div class="mf-notice" style="color:#c0392b; margin:0 0 6px;">${escHtml(notice)}</div>` : "";
    if (items.length) {
      html += `<div style="overflow-x:auto;"><table class="result-table mf-list"><thead><tr><th>파일명</th><th>크기</th><th>상태</th><th></th></tr></thead><tbody>` +
        items.map((it, i) => `<tr><td style="word-break:break-all;">${escHtml(it.file.name)}</td><td style="white-space:nowrap;">${fmtSize(it.file.size)}</td>` +
          `<td style="white-space:nowrap; font-weight:700; color:${STATUS_COLOR[it.status] || "inherit"};">${it.status}</td>` +
          `<td><button type="button" class="btn btn-outline mf-remove" data-i="${i}" ${locked ? "disabled" : ""} style="padding:4px 10px;">빼기</button></td></tr>`).join("") +
        `</tbody></table></div>` +
        `<p style="margin:6px 0 0;"><span class="sub">${items.length}/${max}개</span> <button type="button" class="btn btn-outline mf-clear" ${locked ? "disabled" : ""} style="padding:4px 10px; margin-left:8px;">모두 지우기</button></p>`;
    }
    fileNameEl.innerHTML = html;
  }

  function changed() { render(); if (options && options.onChange) options.onChange(items.map((it) => it.file)); }

  function addFiles(fileList) {
    if (locked) return;
    const msgs = [];
    const notXls = [], dup = [];
    let over = false;
    for (const f of Array.from(fileList)) {
      if (!accept(f)) { notXls.push(f.name); continue; }
      if (items.some((it) => it.key === keyOf(f))) { dup.push(f.name); continue; }
      if (items.length >= max) { over = true; continue; }
      items.push({ file: f, key: keyOf(f), status: "대기" });
    }
    if (over) msgs.push(`한 번에 ${max}개까지 올릴 수 있습니다. 앞의 ${max}개만 받았습니다.`);
    if (notXls.length) msgs.push(`${acceptMsg || "올릴 수 없는 형식입니다"}: ${notXls.join(", ")}`);
    if (dup.length) msgs.push(`이미 목록에 있는 파일은 하나만 넣습니다: ${dup.join(", ")}`);
    notice = msgs.join(" / ");
    changed();
  }

  dropzoneEl.addEventListener("click", () => { if (!locked) fileInputEl.click(); });

  dropzoneEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!locked) fileInputEl.click();
    }
  });

  ["dragenter", "dragover"].forEach((evt) => {
    dropzoneEl.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzoneEl.classList.add("dragover");
    });
  });

  ["dragleave", "dragend"].forEach((evt) => {
    dropzoneEl.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzoneEl.classList.remove("dragover");
    });
  });

  dropzoneEl.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzoneEl.classList.remove("dragover");
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length) {
      if (multi) { addFiles(dt.files); return; }
      fileInputEl.files = dt.files;
      updateDisplay();
    }
  });

  if (!multi) {
    fileInputEl.addEventListener("change", updateDisplay);
    return;
  }

  fileInputEl.multiple = true;
  fileInputEl.addEventListener("change", () => {
    addFiles(fileInputEl.files);
    try { fileInputEl.value = ""; } catch (_) { /* 같은 파일을 다시 고를 수 있게 비움 */ }
  });
  if (fileNameEl) {
    fileNameEl.addEventListener("click", (e) => {
      if (locked) return;
      const rm = e.target.closest(".mf-remove");
      if (rm) { items.splice(Number(rm.dataset.i), 1); notice = ""; changed(); return; }
      if (e.target.closest(".mf-clear")) { items = []; notice = ""; changed(); }
    });
  }
  render();
  return {
    getFiles: () => items.map((it) => it.file),
    setStatus(file, status) { const it = items.find((x) => x.file === file); if (it) { it.status = status; render(); } },
    resetStatus() { items.forEach((it) => { it.status = "대기"; }); render(); },
    clear() { items = []; notice = ""; changed(); },
    setLocked(v) { locked = !!v; dropzoneEl.style.pointerEvents = locked ? "none" : ""; dropzoneEl.style.opacity = locked ? ".6" : ""; render(); },
  };
}
