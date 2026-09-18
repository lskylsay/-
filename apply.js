// 신청 폼 제출 로직 — config.js 의 값을 읽어 Supabase에 바로 저장합니다.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const form = document.getElementById("applyForm");
const statusEl = document.getElementById("formStatus");
const submitBtn = document.getElementById("submitBtn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  submitBtn.textContent = "제출 중…";
  statusEl.textContent = "";
  statusEl.className = "form-status";

  const data = new FormData(form);
  const payload = {
    grade: data.get("grade"),
    class_no: data.get("classNo"),
    sport: data.get("sport"),
    leader_name: data.get("leaderName"),
    contact: data.get("contact"),
    members: data.get("members") || null,
    note: data.get("note") || null,
  };

  const { error } = await supabase.from("applications").insert([payload]);

  if (error) {
    statusEl.textContent = "제출에 실패했습니다. 잠시 후 다시 시도해 주세요. (" + error.message + ")";
    statusEl.classList.add("error");
    submitBtn.disabled = false;
    submitBtn.textContent = "신청서 제출";
    return;
  }

  statusEl.textContent = "신청이 접수되었습니다. 감사합니다!";
  statusEl.classList.add("success");
  form.reset();
  submitBtn.disabled = false;
  submitBtn.textContent = "신청서 제출";
});
