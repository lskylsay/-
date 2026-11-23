// 종목별 초→중→고 연계 진단 (공개 pathways.js · 관리자 보고서가 같이 씀)
// teams: { sport, school, level('초'|'중'|'고'), players_m, players_f } 배열 (한 학년도)
// pathways: { sport, from_school, to_school } 배열
export const LEVELS = ["초", "중", "고"];
export const LEVEL_NAME = { 초: "초등학교", 중: "중학교", 고: "고등학교" };
const ORDER = { 초: 0, 중: 1, 고: 2 };
export const levelOrder = (l) => (l in ORDER ? ORDER[l] : 9);

export function diagnose(teams, pathways) {
  const sports = [...new Set(teams.map((t) => t.sport))].sort((a, b) => String(a).localeCompare(String(b), "ko"));
  return sports.map((sport) => {
    const ts = teams.filter((t) => t.sport === sport);
    const edges = (pathways || []).filter((p) => p.sport === sport);
    const levelOf = {};
    ts.forEach((t) => (levelOf[t.school] = t.level));
    const counts = { 초: 0, 중: 0, 고: 0 };
    ts.forEach((t) => { if (t.level in counts) counts[t.level]++; });
    const broken = [];
    if (counts.초 > 0 && counts.중 === 0) broken.push("중학교 연계 단절");
    if (counts.중 > 0 && counts.고 === 0) broken.push("고등학교 연계 단절");
    // 초→중, 중→고 연결이 한 학교를 거쳐 이어지는지 (팀이 있는 학교끼리만)
    const e = (a, b) => edges.some((p) => levelOf[p.from_school] === a && levelOf[p.to_school] === b);
    const chain = edges.some((p1) => levelOf[p1.from_school] === "초" && levelOf[p1.to_school] === "중"
      && edges.some((p2) => p2.from_school === p1.to_school && levelOf[p2.to_school] === "고"));
    const allLevels = counts.초 > 0 && counts.중 > 0 && counts.고 > 0;
    const linked = allLevels && chain && e("초", "중") && e("중", "고");
    const touched = new Set();
    edges.forEach((p) => { touched.add(p.from_school); touched.add(p.to_school); });
    const unregistered = ts.filter((t) => !touched.has(t.school)).map((t) => t.school);
    return { sport, counts, broken, linked, allLevels, unregistered, teams: ts };
  });
}
