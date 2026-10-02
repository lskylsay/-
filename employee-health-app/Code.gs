/**
 * 직원 건강관리 앱 (Google Apps Script 웹앱)
 *
 * - 데이터는 구글 스프레드시트 2개 시트(직원 / 건강기록)에 저장합니다.
 * - 처음 한 번 setup() 을 실행하면 시트·트리거가 만들어집니다.
 * - 같은 Google Workspace 도메인 사용자는 이메일로 자동 로그인,
 *   그 외(개인 Gmail 등)는 관리자가 '직원' 시트에 등록한 이름 + PIN 으로 로그인합니다.
 */

const CONFIG = {
  APP_TITLE: '직원 건강관리',
  TIMEZONE: 'Asia/Seoul',
  ADMIN_EMAILS: [],        // 추가 관리자 이메일 (스크립트 소유자와 '직원' 시트 역할=관리자는 자동 관리자)
  FEVER_TEMP: 37.5,        // 이 체온 이상이면 주의
  LOW_CONDITION: 2,        // 컨디션이 이 값 이하면 주의 (1~5)
  HIGH_STRESS: 5,          // 스트레스가 이 값 이상이면 주의 (1~5)
  LOW_SLEEP: 4,            // 수면시간이 이 값 미만이면 주의
  REMINDER_HOUR: 10,       // 미제출자 알림 메일 시각 (평일)
  REPORT_HOUR: 15,         // 관리자 요약 메일 시각 (평일)
  SYMPTOMS: ['발열', '기침', '인후통', '콧물', '두통', '근육통', '설사·복통', '피로감', '호흡곤란', '미각·후각 이상'],
};

const SHEET = { STAFF: '직원', LOG: '건강기록' };
const STAFF_HEADERS = ['이메일', '이름', '부서', 'PIN', '역할', '활성'];
const LOG_HEADERS = ['날짜', '제출시각', '사용자키', '이름', '부서', '체온', '컨디션', '수면시간', '스트레스', '운동(분)', '증상', '메모', '주의'];

/* ───────────── 웹앱 진입 ───────────── */

function doGet() {
  const t = HtmlService.createTemplateFromFile('Index');
  t.appTitle = CONFIG.APP_TITLE;
  return t.evaluate()
    .setTitle(CONFIG.APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ───────────── 초기 설정 (편집기에서 1회 실행) ───────────── */

function setup() {
  const props = PropertiesService.getScriptProperties();
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    const id = props.getProperty('SHEET_ID');
    ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create(CONFIG.APP_TITLE + ' 데이터');
  }
  props.setProperty('SHEET_ID', ss.getId());

  const staff = ensureSheet_(ss, SHEET.STAFF, STAFF_HEADERS);
  const log = ensureSheet_(ss, SHEET.LOG, LOG_HEADERS);
  staff.getRange('D:D').setNumberFormat('@');   // PIN 앞자리 0 유지
  log.getRange('A:B').setNumberFormat('@');     // 날짜·시각을 글자로 저장

  const owner = (Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (owner && !readStaff_().some(s => s.email === owner)) {
    staff.appendRow([owner, '관리자', '', '', '관리자', 'Y']);
  }

  installTriggers_();
  Logger.log('준비 완료: ' + ss.getUrl());
}

function installTriggers_() {
  const handlers = ['sendReminders', 'sendAdminReport'];
  ScriptApp.getProjectTriggers()
    .filter(t => handlers.indexOf(t.getHandlerFunction()) >= 0)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendReminders').timeBased().everyDays(1).atHour(CONFIG.REMINDER_HOUR)
    .inTimezone(CONFIG.TIMEZONE).create();
  ScriptApp.newTrigger('sendAdminReport').timeBased().everyDays(1).atHour(CONFIG.REPORT_HOUR)
    .inTimezone(CONFIG.TIMEZONE).create();
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#eef2f7');
  sh.setFrozenRows(1);
  return sh;
}

/* ───────────── 클라이언트에서 부르는 함수 ───────────── */

function getInitData(auth) {
  const user = resolveUser_(auth);
  const today = today_();
  let todayRecord = null;
  if (user && user.registered) {
    todayRecord = readLogs_().find(l => l.key === user.key && l.date === today) || null;
  }
  return {
    appTitle: CONFIG.APP_TITLE,
    today: today,
    user: user,
    todayRecord: todayRecord,
    config: {
      symptoms: CONFIG.SYMPTOMS,
      feverTemp: CONFIG.FEVER_TEMP,
      lowCondition: CONFIG.LOW_CONDITION,
      highStress: CONFIG.HIGH_STRESS,
      lowSleep: CONFIG.LOW_SLEEP,
    },
  };
}

/** 도메인 이메일 사용자의 첫 등록 */
function registerProfile(name, dept) {
  const email = activeEmail_();
  if (!email) throw new Error('이메일 로그인 사용자만 직접 등록할 수 있습니다. 관리자에게 등록을 요청하세요.');
  name = clean_(name, 20);
  dept = clean_(dept, 30);
  if (!name) throw new Error('이름을 입력하세요.');
  withLock_(() => {
    if (readStaff_().some(s => s.email === email)) return;
    sheet_(SHEET.STAFF).appendRow([email, name, dept, '', '직원', 'Y']);
  });
  return getInitData(null);
}

function submitRecord(auth, data) {
  const user = requireUser_(auth);
  const rec = validateRecord_(data);
  const today = today_();
  const now = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'HH:mm:ss');
  const flags = flagReasons_(rec);
  const row = [
    today, now, user.key, user.name, user.dept,
    rec.temp, rec.condition, rec.sleep, rec.stress, rec.exercise,
    rec.symptoms.join(', '), rec.memo, flags.join(', '),
  ];

  withLock_(() => {
    const sh = sheet_(SHEET.LOG);
    const existing = readLogs_().find(l => l.key === user.key && l.date === today);
    if (existing) {
      sh.getRange(existing.row, 1, 1, row.length).setValues([row]);
    } else {
      sh.appendRow(row);
    }
  });

  return { ok: true, flags: flags, record: readLogs_().find(l => l.key === user.key && l.date === today) };
}

function getMyHistory(auth, days) {
  const user = requireUser_(auth);
  days = Math.min(Math.max(Number(days) || 30, 7), 365);
  const from = daysAgo_(days - 1);
  const list = readLogs_()
    .filter(l => l.key === user.key && l.date >= from)
    .sort((a, b) => a.date < b.date ? -1 : 1);
  return { from: from, to: today_(), days: days, records: list, stats: stats_(list) };
}

function getDashboard(auth, date) {
  const user = requireUser_(auth);
  if (!user.isAdmin) throw new Error('관리자만 볼 수 있습니다.');
  date = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : today_();

  const staff = readStaff_().filter(s => s.active).map(decorate_);
  const logs = readLogs_();
  const dayLogs = logs.filter(l => l.date === date);
  const submitted = {};
  dayLogs.forEach(l => { submitted[l.key] = true; });

  const symptomCount = {};
  dayLogs.forEach(l => l.symptoms.forEach(s => { symptomCount[s] = (symptomCount[s] || 0) + 1; }));

  const trend = [];
  for (let i = 13; i >= 0; i--) {
    const d = daysAgo_(i, date);
    const dl = logs.filter(l => l.date === d);
    trend.push({
      date: d,
      count: dl.length,
      rate: staff.length ? Math.round(dl.length / staff.length * 100) : 0,
      avgCondition: avg_(dl.map(l => l.condition)),
      flagged: dl.filter(l => l.flag).length,
    });
  }

  return {
    date: date,
    total: staff.length,
    submittedCount: dayLogs.length,
    rate: staff.length ? Math.round(dayLogs.length / staff.length * 100) : 0,
    flagged: dayLogs.filter(l => l.flag).sort((a, b) => a.dept < b.dept ? -1 : 1),
    notSubmitted: staff.filter(s => !submitted[s.key]).map(s => ({ name: s.name, dept: s.dept })),
    stats: stats_(dayLogs),
    symptoms: Object.keys(symptomCount).map(k => ({ name: k, count: symptomCount[k] }))
      .sort((a, b) => b.count - a.count),
    trend: trend,
    records: dayLogs.sort((a, b) => (a.dept + a.name) < (b.dept + b.name) ? -1 : 1),
  };
}

/* ───────────── 시간 트리거 (평일만) ───────────── */

function sendReminders() {
  if (isWeekend_()) return;
  const today = today_();
  const done = {};
  readLogs_().filter(l => l.date === today).forEach(l => { done[l.key] = true; });
  const url = ScriptApp.getService().getUrl() || '';
  readStaff_().map(decorate_)
    .filter(s => s.active && s.email && !done[s.key])
    .forEach(s => {
      if (MailApp.getRemainingDailyQuota() < 1) return;
      MailApp.sendEmail({
        to: s.email,
        subject: '[' + CONFIG.APP_TITLE + '] 오늘 건강 상태를 기록해 주세요',
        htmlBody: esc_(s.name) + ' 님, 오늘(' + today + ') 건강 기록이 아직 없습니다.<br>' +
          '1분이면 끝나요 → <a href="' + url + '">건강 기록하기</a>',
      });
    });
}

function sendAdminReport() {
  if (isWeekend_()) return;
  const owner = (Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const d = getDashboard({ asOwner: true }, today_());
  const admins = {};
  CONFIG.ADMIN_EMAILS.concat([owner]).forEach(e => { if (e) admins[e.toLowerCase()] = true; });
  readStaff_().forEach(s => { if (s.active && s.email && s.role === '관리자') admins[s.email] = true; });

  const flaggedRows = d.flagged.map(l =>
    '<tr><td>' + esc_(l.dept) + '</td><td>' + esc_(l.name) + '</td><td>' + esc_(l.flag) + '</td></tr>').join('');
  const html =
    '<h3>' + d.date + ' 건강 기록 요약</h3>' +
    '<p>제출 ' + d.submittedCount + ' / ' + d.total + '명 (' + d.rate + '%) · 주의 ' + d.flagged.length + '명</p>' +
    (flaggedRows ? '<table border="1" cellpadding="4" style="border-collapse:collapse">' +
      '<tr><th>부서</th><th>이름</th><th>주의 사유</th></tr>' + flaggedRows + '</table>' : '<p>주의 대상자가 없습니다.</p>') +
    (d.notSubmitted.length ? '<p>미제출: ' + d.notSubmitted.map(s => esc_(s.name)).join(', ') + '</p>' : '') +
    '<p><a href="' + (ScriptApp.getService().getUrl() || '') + '">관리자 화면 열기</a></p>';

  Object.keys(admins).forEach(to => {
    MailApp.sendEmail({ to: to, subject: '[' + CONFIG.APP_TITLE + '] ' + d.date + ' 요약', htmlBody: html });
  });
}

/* ───────────── 사용자 확인 ───────────── */

function activeEmail_() {
  return (Session.getActiveUser().getEmail() || '').toLowerCase();
}

function isAdminEmail_(email) {
  if (!email) return false;
  const owner = (Session.getEffectiveUser().getEmail() || '').toLowerCase();
  return email === owner || CONFIG.ADMIN_EMAILS.map(e => e.toLowerCase()).indexOf(email) >= 0;
}

function decorate_(s) {
  return {
    key: (s.email || ('pin:' + s.name + '/' + s.dept)).toLowerCase(),
    email: s.email,
    name: s.name,
    dept: s.dept,
    role: s.role,
    active: s.active,
    registered: true,
    isAdmin: s.role === '관리자' || isAdminEmail_(s.email),
    viaPin: !s.email,
  };
}

function resolveUser_(auth) {
  const staff = readStaff_();
  const email = activeEmail_();
  let found = null;

  if (email) {
    const s = staff.find(x => x.email === email);
    if (!s) return { email: email, registered: false, isAdmin: isAdminEmail_(email) };
    found = s;
  } else if (auth && auth.name && auth.pin) {
    const name = String(auth.name).trim();
    const pin = String(auth.pin).trim();
    found = staff.find(x => x.name === name && x.pin && x.pin === pin) || null;
    if (!found) throw new Error('이름 또는 PIN이 맞지 않습니다.');
  } else {
    return null;
  }

  if (!found.active) throw new Error('사용이 중지된 계정입니다. 관리자에게 문의하세요.');
  return decorate_(found);
}

function requireUser_(auth) {
  if (auth && auth.asOwner) {  // 트리거(서버 내부)에서만 사용
    return { key: 'system', name: 'system', dept: '', isAdmin: true, registered: true };
  }
  const user = resolveUser_(auth);
  if (!user || !user.registered) throw new Error('로그인이 필요합니다.');
  return user;
}

/* ───────────── 데이터 읽기·검증 ───────────── */

function ss_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('먼저 편집기에서 setup()을 실행해 주세요.');
}

function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('"' + name + '" 시트가 없습니다. setup()을 실행해 주세요.');
  return sh;
}

function readStaff_() {
  const values = sheet_(SHEET.STAFF).getDataRange().getValues();
  return values.slice(1).map((r, i) => ({
    row: i + 2,
    email: String(r[0]).trim().toLowerCase(),
    name: String(r[1]).trim(),
    dept: String(r[2]).trim(),
    pin: String(r[3]).trim(),
    role: String(r[4]).trim() || '직원',
    active: String(r[5]).trim().toUpperCase() !== 'N',
  })).filter(s => s.email || s.name);
}

function readLogs_() {
  const sh = sheet_(SHEET.LOG);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, LOG_HEADERS.length).getValues().map((r, i) => ({
    row: i + 2,
    date: fmtDate_(r[0]),
    time: fmtTime_(r[1]),
    key: String(r[2]).trim().toLowerCase(),
    name: String(r[3]),
    dept: String(r[4]),
    temp: num_(r[5]),
    condition: num_(r[6]),
    sleep: num_(r[7]),
    stress: num_(r[8]),
    exercise: num_(r[9]),
    symptoms: String(r[10]).trim() ? String(r[10]).split(',').map(s => s.trim()).filter(Boolean) : [],
    memo: String(r[11]),
    flag: String(r[12]),
  })).filter(l => l.date && l.key);
}

function validateRecord_(d) {
  d = d || {};
  const temp = Number(d.temp);
  const condition = Number(d.condition);
  const stress = Number(d.stress);
  const sleep = d.sleep === '' || d.sleep == null ? null : Number(d.sleep);
  const exercise = d.exercise === '' || d.exercise == null ? 0 : Number(d.exercise);

  if (!(temp >= 34 && temp <= 42)) throw new Error('체온은 34.0 ~ 42.0 사이로 입력하세요.');
  if ([1, 2, 3, 4, 5].indexOf(condition) < 0) throw new Error('컨디션을 선택하세요.');
  if ([1, 2, 3, 4, 5].indexOf(stress) < 0) throw new Error('스트레스 정도를 선택하세요.');
  if (sleep !== null && !(sleep >= 0 && sleep <= 24)) throw new Error('수면시간은 0 ~ 24 사이로 입력하세요.');
  if (!(exercise >= 0 && exercise <= 600)) throw new Error('운동 시간은 0 ~ 600분 사이로 입력하세요.');

  const symptoms = (Array.isArray(d.symptoms) ? d.symptoms : [])
    .filter(s => CONFIG.SYMPTOMS.indexOf(s) >= 0);

  return {
    temp: Math.round(temp * 10) / 10,
    condition: condition,
    stress: stress,
    sleep: sleep === null ? '' : Math.round(sleep * 10) / 10,
    exercise: Math.round(exercise),
    symptoms: symptoms,
    memo: clean_(d.memo, 300),
  };
}

function flagReasons_(r) {
  const f = [];
  if (r.temp >= CONFIG.FEVER_TEMP) f.push('발열(' + r.temp + '℃)');
  if (r.condition <= CONFIG.LOW_CONDITION) f.push('컨디션 저하');
  if (r.stress >= CONFIG.HIGH_STRESS) f.push('스트레스 높음');
  if (r.sleep !== '' && r.sleep < CONFIG.LOW_SLEEP) f.push('수면 부족');
  if (r.symptoms.length) f.push('증상: ' + r.symptoms.join('/'));
  return f;
}

function stats_(list) {
  return {
    count: list.length,
    avgTemp: avg_(list.map(l => l.temp)),
    avgCondition: avg_(list.map(l => l.condition)),
    avgSleep: avg_(list.map(l => l.sleep)),
    avgStress: avg_(list.map(l => l.stress)),
    totalExercise: list.reduce((s, l) => s + (l.exercise || 0), 0),
    flaggedDays: list.filter(l => l.flag).length,
  };
}

/* ───────────── 공통 도구 ───────────── */

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('잠시 후 다시 시도해 주세요. (동시 저장 중)');
  try { return fn(); } finally { lock.releaseLock(); }
}

function today_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

/** base(yyyy-MM-dd, 기본 오늘)에서 n일 전 날짜 */
function daysAgo_(n, base) {
  const b = base || today_();
  const p = b.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] - n));
  return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
}

function isWeekend_() {
  const day = Number(Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'u')); // 1=월 … 7=일
  return day >= 6;
}

function fmtDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  return String(v || '').trim();
}

function fmtTime_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, CONFIG.TIMEZONE, 'HH:mm:ss');
  return String(v || '').trim();
}

function num_(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function avg_(arr) {
  const xs = arr.filter(x => typeof x === 'number' && !isNaN(x));
  if (!xs.length) return null;
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 10) / 10;
}

function clean_(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
