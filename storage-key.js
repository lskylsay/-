// Supabase Storage 키는 한글/공백/괄호 등이 섞이면 "Invalid key" 오류가 날 수 있어
// 저장용 경로는 항상 영문·숫자로만 안전하게 만들고, 원래 파일명은 DB의 file_name
// 컬럼에 그대로 저장해 화면 표시·다운로드 시 사용합니다.

export function safeStorageKey(file) {
  const extMatch = file.name.match(/\.[a-zA-Z0-9]+$/);
  const ext = extMatch ? extMatch[0] : "";
  const random = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${random}${ext}`;
}
