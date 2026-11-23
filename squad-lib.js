// 선수 구성 공용 함수 (공개 teams-status.js · squad.js · dashboard.js가 같이 씀). 이름은 RPC가 이미 가려서 줌.
export const LEVELS = ["초", "중", "고"];
export const MAX_GRADE = { 초: 6, 중: 3, 고: 3 };
const BASE = { 초: 0, 중: 6, 고: 9 };
export const ORDER_LABELS = [...[1, 2, 3, 4, 5, 6].map((n) => "초" + n), ...[1, 2, 3].map((n) => "중" + n), ...[1, 2, 3].map((n) => "고" + n)];

// '2학년', '2', '중2', '중학교 2학년', '초등 6학년' → { lv: '초'|'중'|'고'|null, n: 숫자|null }
export function parseGrade(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return { lv: null, n: null };
  const m = t.match(/^(초|중|고)/);
  const d = t.match(/(\d+)/);
  return { lv: m ? m[1] : null, n: d ? Number(d[1]) : null };
}

// 학교명 끝 글자로 학교급 추정 (제천중→중, 제천여고→고, 동명초등학교→초)
export function levelBySchoolName(school) {
  const m = String(school ?? "").trim().match(/(초|중|고)(등학교|학교)?$/);
  return m ? m[1] : null;
}

// sport_teams(get_public_teams)의 level을 학교·종목으로 붙여 찾고, 없으면 같은 학교의 다른 종목, 그래도 없으면 학교명 끝 글자
export function makeLevelFinder(teams) {
  const byKey = new Map(), bySchool = new Map();
  (teams || []).forEach((t) => {
    if (!LEVELS.includes(t.level)) return;
    byKey.set(t.school + "\u0001" + t.sport, t.level);
    if (!bySchool.has(t.school)) bySchool.set(t.school, t.level);
  });
  return (school, sport) => byKey.get(school + "\u0001" + sport) || bySchool.get(school) || levelBySchoolName(school) || null;
}

// 선수 목록에 학교급(lv)·학년 숫자(n)·한 줄 순서(ord: 초1=0 … 고3=11, 읽지 못하면 null)·표시 라벨을 붙임
export function enrich(athletes, teams) {
  const find = makeLevelFinder(teams);
  return (athletes || []).map((a) => {
    const g = parseGrade(a.grade);
    const lv = find(a.school, a.sport) || g.lv;
    const ok = lv && g.n != null && g.n >= 1 && g.n <= MAX_GRADE[lv];
    return { ...a, lv, n: ok ? g.n : null, ord: ok ? BASE[lv] + g.n - 1 : null, gradeLabel: ok ? `${lv === "초" ? "초" : lv}${g.n}` : (String(a.grade ?? "").trim() || "-") };
  });
}

// 팀(학교·종목)별 졸업·공백: 최고 학년(초6·중3·고3) 졸업 예정, 남는 인원 ≤3 공백 주의, 0 팀 유지 위험
export function gapReport(enriched) {
  const map = new Map();
  enriched.forEach((a) => {
    const k = a.school + "\u0001" + a.sport;
    if (!map.has(k)) map.set(k, { school: a.school, sport: a.sport, lv: a.lv, total: 0, grads: 0, unknown: 0 });
    const t = map.get(k);
    t.total++;
    if (a.n == null) t.unknown++;
    else if (a.n === MAX_GRADE[a.lv]) t.grads++;
  });
  return [...map.values()].map((t) => {
    const remain = t.total - t.grads;
    return { ...t, remain, flag: remain === 0 ? "risk" : remain <= 3 ? "warn" : "" };
  }).sort((a, b) => (a.remain - b.remain) || (b.grads - a.grads) || String(a.school).localeCompare(b.school, "ko") || String(a.sport).localeCompare(b.sport, "ko"));
}
