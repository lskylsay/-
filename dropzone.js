// 드래그 앤 드롭 파일 첨부 공통 유틸리티
// dropzoneEl: 드롭 영역 div, fileInputEl: 숨겨진 실제 file input, fileNameEl: 파일명 표시용 요소(선택)

export function initDropzone(dropzoneEl, fileInputEl, fileNameEl) {
  function updateDisplay() {
    const file = fileInputEl.files[0];
    if (fileNameEl) {
      fileNameEl.textContent = file ? "선택된 파일: " + file.name : "";
    }
    dropzoneEl.classList.toggle("has-file", !!file);
  }

  dropzoneEl.addEventListener("click", () => fileInputEl.click());

  dropzoneEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInputEl.click();
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
      fileInputEl.files = dt.files;
      updateDisplay();
    }
  });

  fileInputEl.addEventListener("change", updateDisplay);
}
