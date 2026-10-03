/* =====================================================================
   업무실(workroom.html) 공문 초안 → 한글(.hwpx) 만들기
   ---------------------------------------------------------------------
   - 빌드 도구 없이 브라우저에서 동작: JSZip(CDN) + DOMParser/XMLSerializer
   - 방식: templates/*.hwpx 를 불러와 Contents/section0.xml 의 문단·표만
     견본 문구 자리에 채워 넣고 다시 묶음(header.xml 등 나머지는 그대로)
   - 문서별 서식(스킬)
       운영(안)       buildPlan     templates/plan-template.hwpx    jecheon-sports-plan-doc
       세부운영계획   buildDetail   templates/detail-template.hwpx  jecheon-detailed-operation-plan
       결과보고       buildOnepage  templates/onepage-template.hwpx jecheon-onepage-report
   - 화면 미리보기(previewHtml)와 hwpx 는 같은 내용 모델(planModel 등)에서 만들어
     두 결과가 항상 같게 유지
   ===================================================================== */
(function (root) {
  'use strict';

  const HP = 'http://www.hancom.co.kr/hwpml/2011/paragraph';
  const TEMPLATES = {
    plan: 'templates/plan-template.hwpx',
    detail: 'templates/detail-template.hwpx',
    result: 'templates/onepage-template.hwpx'
  };
  const WD = ['일', '월', '화', '수', '목', '금', '토'];

  /* ============ 글자·날짜 도우미 ============ */
  const won = n => (Number(n) || 0).toLocaleString('ko-KR');
  const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
  const kdate = s => { if (!s) return ''; const d = new Date(s + 'T00:00:00'); return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.(${WD[d.getDay()]})`; };
  const todayParts = d => ({ y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), w: WD[d.getDay()] });
  const GANADA = '가나다라마바사아자차카타파하'.split('');
  const ganada = i => (GANADA[i] || String(i + 1)) + '.';
  const safeName = s => String(s).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

  // "08:30~09:00" → { range:'08:30 ~ 09:00', mins:30 }
  function timeRange(s) {
    const m = String(s || '').match(/(\d{1,2}):(\d{2})\s*[~∼\-–]\s*(\d{1,2}):(\d{2})/);
    if (!m) return { range: String(s || '').trim(), mins: null };
    const a = +m[1] * 60 + +m[2], b = +m[3] * 60 + +m[4];
    return { range: `${m[1].padStart(2, '0')}:${m[2]} ~ ${m[3].padStart(2, '0')}:${m[4]}`, mins: b > a ? b - a : null };
  }
  // 세부 일정 입력(시간 | 내용 | 비고) 한 줄 = 한 행
  function scheduleRows(s) {
    return lines(s).map(l => {
      const [t, c, n] = l.split('|').map(x => (x || '').trim());
      const tr = timeRange(t);
      return { time: tr.range, mins: tr.mins, items: String(c || '').split(/\s*\/\s*/).filter(Boolean), note: n || '' };
    });
  }

  /* ============ 신청 데이터 집계 (학생 이름은 쓰지 않음) ============ */
  function schoolStatus(comp, apps) {
    const as = (apps || []).filter(a => a.competition === comp);
    const map = {};
    as.forEach(a => {
      const k = a.class_no || '(미기재)';
      const s = map[k] = map[k] || { 남: 0, 여: 0 };
      if (a.gender === '남' || a.gender === '여') s[a.gender]++;
    });
    const rows = Object.entries(map).map(([school, v]) => ({ school, 남: v.남, 여: v.여, 계: v.남 + v.여 }))
      .sort((a, b) => b.계 - a.계 || a.school.localeCompare(b.school, 'ko'));
    const tot = rows.reduce((t, r) => ({ 남: t.남 + r.남, 여: t.여 + r.여, 계: t.계 + r.계 }), { 남: 0, 여: 0, 계: 0 });
    // 합계 검증: 학교별 남+여=계, 전체 계 = 남 합 + 여 합
    rows.forEach(r => { if (r.남 + r.여 !== r.계) throw new Error(`${r.school} 인원 합계가 맞지 않습니다`); });
    if (tot.남 + tot.여 !== tot.계) throw new Error('참가 현황 합계가 맞지 않습니다');
    const sports = {};
    as.forEach(a => { const k = a.sportShort || String(a.sport || '').split('(')[0].trim() || '기타'; sports[k] = (sports[k] || 0) + 1; });
    return { rows, tot, applicants: as.length, schools: rows.length, sports, noGender: as.length - tot.계 };
  }

  function budgetModel(rows, useSpent) {
    const items = (rows || []).map(b => ({
      item: b.item || '', category: b.category || '',
      calc: b.unit_price ? `${won(b.unit_price)}원*${b.qty || 0} =` : (b.memo || ''),
      amount: +(useSpent ? b.spent : b.planned) || 0,
      note: b.unit_price ? (b.memo || '') : ''
    }));
    return { items, total: items.reduce((s, b) => s + b.amount, 0), planned: (rows || []).reduce((s, b) => s + (+b.planned || 0), 0),
      spent: (rows || []).reduce((s, b) => s + (+b.spent || 0), 0) };
  }

  /* ============ 문서별 내용 모델 ============ */
  // 운영(안) — jecheon-sports-plan-doc
  function planModel(f, data) {
    const t = todayParts(data.today || new Date());
    const name = `${f.year}. ${f.title || '○○○'}`;
    const tg = lines(f.targets);
    const overview = [{ text: `행사명: ${name}` }];
    if (String(f.theme || '').trim()) overview.push({ text: `주제: ${f.theme.trim()}` });
    overview.push({ text: `일시: ${[kdate(f.date), f.time].filter(Boolean).join(' ')}` });
    overview.push({ text: `장소: ${f.place || ''}` });
    if (tg.length > 1) { overview.push({ text: '대상' }); tg.forEach(x => overview.push({ dash: true, text: x })); }
    else overview.push({ text: `대상: ${tg[0] || ''}` });
    overview.push({ text: `주최/주관: ${f.host || data.org}` });
    return {
      cover: [name, '운영(안)'], header: `${name} 운영(안)`, coverDate: `${t.y}.  ${t.m}.`,
      team: `${data.org} ${data.team}`,
      basis: lines(f.basis), purpose: lines(f.purpose), policy: lines(f.policy), effects: lines(f.effects),
      overview,
      divisions: lines(f.divisions).map(l => { if (!l.includes('|')) return l; const c = l.split('|').map(x => x.trim()); return c[0] + ': ' + c.slice(1).filter(Boolean).join(', '); }), apply: String(f.apply || '').trim(), method: `방법: ${data.site} 누리집 온라인 신청`,
      scheduleTitle: f.time ? `세부일정(${f.time})` : '세부일정',
      schedule: scheduleRows(f.schedule), scheduleNote: '현장 여건에 따라 일정이 변경될 수 있음',
      budget: budgetModel(data.budgetRows, false)
    };
  }

  // 세부운영계획 — jecheon-detailed-operation-plan (입력이 있는 항목만, 번호는 순서대로 다시 매김)
  function detailModel(f, data) {
    const t = todayParts(data.today || new Date());
    const name = `${f.year}. ${f.title || '○○○'}`;
    const items = [];
    const add = (head, sub) => items.push({ head, sub: sub || [] });
    add(`대회명: ${name}`);
    if (f.date || f.time) add(`대회일시: ${[kdate(f.date), f.time].filter(Boolean).join(' ')}`);
    if (String(f.place || '').trim()) add(`대회장소: ${f.place.trim()}`);
    add(`주최/주관: ${f.host || data.org}`);
    const tg = lines(f.targets); if (tg.length) add('대회개요', tg.map((x, i) => `${ganada(i)} ${x}`));
    const me = lines(f.method); if (me.length) add('경기방법', me.map((x, i) => `${ganada(i)} ${x}`));
    const dv = lines(f.divisions);
    let divTable = null;
    if (dv.length) {
      const tableRows = dv.filter(l => l.includes('|')).map(l => { const c = l.split('|').map(x => x.trim()); return [c[0] || '', c[1] || '', c[2] || '', c[3] || '']; });
      const paras = dv.filter(l => !l.includes('|')).map(x => `- ${x}`);
      if (tableRows.length) divTable = { head: ['종별', '학년', '종목', '비고'], rows: tableRows };
      add('종별 및 경기 종목', paras);
    }
    const aw = lines(f.awards); if (aw.length) add('시상', aw.map((x, i) => `${ganada(i)} ${x}`));
    const numbered = items.map((it, i) => ({ head: `${i + 1}. ${it.head}`, sub: it.sub, table: it.head === '종별 및 경기 종목' ? divTable : null }));
    const sched = scheduleRows(f.schedule).map(r => [r.time, r.items.join(', '), r.note]);
    const status = f.competition ? schoolStatus(f.competition, data.apps) : null;
    return {
      cover: [name, '세부운영계획'], header: `${name} 세부운영계획`, coverDate: `${t.y}.  ${t.m}.`,
      dept: '(교 육 과)', team: `${data.org} ${data.team}`,
      items: numbered,
      schedule: sched.length ? { title: '□ 경기 일정 안내', head: ['시간', '내용', '비고'], rows: sched } : null,
      admin: lines(f.admin).map(x => `○ ${x}`),
      status: status && status.rows.length ? {
        title: `□ 학교별 참가선수 현황(총 ${status.tot.계}명)`, head: ['순', '학교명', '남', '여', '계'],
        rows: status.rows.map((r, i) => [String(i + 1), r.school, String(r.남), String(r.여), String(r.계)]),
        foot: ['합 계', String(status.tot.남), String(status.tot.여), String(status.tot.계)],
        noGender: status.noGender
      } : null
    };
  }

  // 결과보고 — jecheon-onepage-report (유형 A 뼈대, 개조식)
  function onepageModel(f, data) {
    const t = todayParts(data.today || new Date());
    const name = `${f.year}. ${f.title || '○○○'}`;
    const secs = [];
    const tg = lines(f.targets);
    secs.push(['개요', [`행사명: ${name}`, `일시: ${[kdate(f.date), f.time].filter(Boolean).join(' ')}`, `장소: ${f.place || ''}`, `대상: ${tg.join(', ')}`]]);
    if (f.competition) {
      const st = schoolStatus(f.competition, data.apps);
      if (st.applicants) {
        const sp = Object.entries(st.sports).map(([k, n]) => `${k} ${n}명`).join(', ');
        secs.push(['참가 현황', [`총 ${st.schools}교 ${st.applicants}명 참가`].concat(sp ? [`부문별 인원(${sp})`] : [])]);
      }
    }
    const rs = lines(f.resultText); if (rs.length) secs.push(['운영 결과', rs]);
    const bm = budgetModel(data.budgetRows, true);
    if ((data.budgetRows || []).length) {
      const pct = bm.planned ? Math.round(bm.spent / bm.planned * 100) : 0;
      secs.push(['예산 집행', [`집행액 ${won(bm.spent)}원(예산 ${won(bm.planned)}원 대비 ${pct}%)`]]);
    }
    const im = lines(f.improve); if (im.length) secs.push(['성과 및 개선점', im]);
    const body = [];
    secs.forEach(([h, ls], i) => {
      if (i) body.push('');
      body.push(`${i + 1}. ${h}`);
      ls.forEach((l, j) => body.push(`  ${ganada(j)} ${l}`));
    });
    const today = `${t.y}. ${t.m}. ${t.d}.`;
    return { title: [name, '결과 보고'], date: `${today}(${t.w})`, dept: '체육교육팀', body, fileDate: today, est: estimateLines(body) };
  }

  // build_onepage.py 와 같은 분량 추정 (1쪽 약 30줄, 2쪽 약 68줄)
  const HEADING_RE = /^(\d+\.|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]\.?)\s*\S/;
  function estLines(text, cap) { const w = Array.from(text).reduce((s, c) => s + (c.charCodeAt(0) < 128 ? 0.5 : 1), 0); return Math.max(1, Math.ceil(w / (cap || 40))); }
  function estimateLines(body) {
    let est = 0;
    body.forEach(l => {
      if (l.trim() === '') est += 1;
      else if (!/^\s/.test(l) && HEADING_RE.test(l)) est += estLines(l, 34) * 1.1;
      else est += estLines(l);
    });
    return est;
  }

  const MODELS = { plan: planModel, detail: detailModel, result: onepageModel };
  const DOC_LABEL = { plan: '운영(안)', detail: '세부운영계획', result: '결과보고' };

  function fileName(type, f, model) {
    if (type === 'result') return safeName(`원페이지 보고 ${model.fileDate} ${f.year}. ${f.title || '초안'} 결과`) + '.hwpx';
    return safeName(`${f.year}. ${f.title || '초안'} ${DOC_LABEL[type]}`) + '.hwpx';
  }

  /* ============ 화면 미리보기 (hwpx 와 같은 모델) ============ */
  function previewHtml(type, f, data, esc) {
    const m = MODELS[type](f, data);
    const P = (cls, s) => `<p class="${cls}">${esc(s)}</p>`;
    const table = (head, rows, foot) => `<table><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map((c, i) => `<td${i && /^[\d,]+$/.test(c) ? ' style="text-align:right"' : ''}>${esc(c).replace(/\n/g, '<br>')}</td>`).join('')}</tr>`).join('')}${foot ? `<tr>${foot.map(c => `<th>${esc(c)}</th>`).join('')}</tr>` : ''}</table>`;
    if (type === 'plan') {
      const ov = m.overview.map(o => o.dash ? P('i2', `- ${o.text}`) : P('i1', `○ ${o.text}`)).join('');
      const bud = m.budget.items.length
        ? `<table><tr><th>품목</th><th>원가통계비목</th><th>산출내역</th><th>예산액(원)</th><th>비고</th></tr>${m.budget.items.map(b => `<tr><td>${esc(b.item)}</td><td>${esc(b.category)}</td><td>${esc(b.calc)}</td><td style="text-align:right">${won(b.amount)}</td><td>${esc(b.note)}</td></tr>`).join('')}<tr><th colspan="3">합 계</th><th style="text-align:right">${won(m.budget.total)}</th><th></th></tr></table>`
        : `<table><tr><th>품목</th><th>원가통계비목</th><th>산출내역</th><th>예산액(원)</th><th>비고</th></tr><tr><td>예산 미편성</td><td></td><td></td><td></td><td></td></tr><tr><th colspan="3">합 계</th><th style="text-align:right">0</th><th></th></tr></table>`;
      const sched = `<table><tr><th colspan="4">${esc(m.scheduleTitle)}</th></tr><tr><th>시간</th><th>소요(분)</th><th>주요 내용</th><th>비고</th></tr>${(m.schedule.length ? m.schedule : [{ time: '', mins: null, items: [], note: '' }]).map(r => `<tr><td>${esc(r.time)}</td><td>${r.mins ? r.mins + '분' : ''}</td><td style="text-align:left">${r.items.map(x => '▷ ' + esc(x)).join('<br>')}</td><td>${esc(r.note)}</td></tr>`).join('')}</table>`;
      return `<h3>${esc(m.cover[0])}<br>${esc(m.cover[1])}</h3><div class="team">${esc(m.coverDate)} (교 육 과) · ${esc(m.team)}</div>
        <h4>Ⅰ 추진 근거</h4>${m.basis.map(x => P('i1', '○ ' + x)).join('')}
        <h4>Ⅱ 추진 목적</h4>${m.purpose.map(x => P('i1', '○ ' + x)).join('')}
        <h4>Ⅲ 추진 방침</h4>${m.policy.map(x => P('i1', '○ ' + x)).join('')}
        <h4>Ⅳ 운영 개요</h4>${ov}
        <h4>Ⅴ 세부추진계획</h4>${m.divisions.length ? P('i1', '○ 참가 부문 및 제한') + m.divisions.map(x => P('i2', '- ' + x)).join('') : ''}
        ${P('i1', m.apply ? `○ 참가 신청: ${m.apply}` : '○ 참가 신청')}${P('i2', '- ' + m.method)}
        ${P('i1', '○ 세부일정표')}${sched}${P('i1', '※ ' + m.scheduleNote)}
        <h4>Ⅵ 예산집행계획</h4>${bud}
        <h4>Ⅶ 기대효과</h4>${m.effects.map(x => P('i1', '○ ' + x)).join('')}`;
    }
    if (type === 'detail') {
      return `<h3>${esc(m.cover[0])}<br>${esc(m.cover[1])}</h3><div class="team">${esc(m.coverDate)} ${esc(m.dept)} · ${esc(m.team)}</div>
        ${m.items.map(it => `<p><b>${esc(it.head)}</b></p>${it.sub.map(s => P(/^-/.test(s) ? 'i2' : 'i1', s)).join('')}${it.table ? table(it.table.head, it.table.rows) : ''}`).join('')}
        ${m.schedule ? `<h4>${esc(m.schedule.title)}</h4>${table(m.schedule.head, m.schedule.rows)}` : ''}
        ${m.admin.length ? `<h4>□ 행정사항</h4>${m.admin.map(x => P('i1', x)).join('')}` : ''}
        ${m.status ? `<h4>${esc(m.status.title)}</h4>${table(m.status.head, m.status.rows.concat([['', '이하 여백', '', '', '']]), m.status.foot.length === 4 ? [''].concat(m.status.foot) : m.status.foot)}` : ''}`;
    }
    return `<h3>${esc(m.title[0])}<br>${esc(m.title[1])}</h3><div class="team">일자 ${esc(m.date)} · 부서 ${esc(m.dept)}</div>
      ${m.body.map(l => l.trim() === '' ? '<p>&nbsp;</p>' : (!/^\s/.test(l) ? `<h4>${esc(l)}</h4>` : P('i1', l.trim()))).join('')}`;
  }

  /* ============ XML 도우미 (브라우저 DOM·xmldom 공통) ============ */
  const arr = nl => { const a = []; for (let i = 0; i < nl.length; i++) a.push(nl.item ? nl.item(i) : nl[i]); return a; };
  const kids = (el, name) => arr(el.childNodes).filter(n => n.nodeType === 1 && n.namespaceURI === HP && n.localName === name);
  const desc = (el, name) => arr(el.getElementsByTagNameNS(HP, name));
  const textOf = el => desc(el, 't').map(t => t.textContent || '').join('');
  const insertAfter = (ref, node) => ref.parentNode.insertBefore(node, ref.nextSibling);
  const remove = n => n && n.parentNode && n.parentNode.removeChild(n);
  function setT(t, s) { while (t.firstChild) t.removeChild(t.firstChild); if (s) t.appendChild(t.ownerDocument.createTextNode(s)); }
  const dropLsa = p => kids(p, 'linesegarray').forEach(remove);

  function makeCtx(doc) {
    const used = new Set(arr(doc.getElementsByTagName('*')).map(e => e.getAttribute && e.getAttribute('id')).filter(Boolean));
    let next = 1000000001;
    return { doc, newId() { while (used.has(String(next))) next++; used.add(String(next)); return String(next++); } };
  }
  // 복제한 문단(과 그 안의 문단)에 겹치지 않는 새 id
  function renewIds(ctx, node) {
    if (node.localName === 'p' && node.namespaceURI === HP) node.setAttribute('id', ctx.newId());
    desc(node, 'p').forEach(p => p.setAttribute('id', ctx.newId()));
    return node;
  }
  const cloneP = (ctx, p) => renewIds(ctx, p.cloneNode(true));

  // 문단 글자 바꾸기: 첫 <hp:t> 에 전체 글자, 나머지 <hp:t> 는 비움.
  // 단, 첫 <hp:t> 가 글머리("  ○ ")만 담고 있고 새 글자도 그 글머리로 시작하면 글머리 서식을 살려 둘째 <hp:t> 에 본문을 넣음.
  function setParaText(p, text) {
    const ts = kids(p, 'run').reduce((a, r) => a.concat(kids(r, 't')), []);
    if (!ts.length) {
      if (text) { let r = kids(p, 'run')[0]; if (!r) { r = p.ownerDocument.createElementNS(HP, 'hp:run'); r.setAttribute('charPrIDRef', '0'); p.insertBefore(r, p.firstChild); } const t = p.ownerDocument.createElementNS(HP, 'hp:t'); r.appendChild(t); setT(t, text); }
    } else {
      const pre = ts[0].textContent || '';
      if (ts.length > 1 && /^\s*([○❍※▷□◈-]|\d+\.|[가-하]\.)\s*$/.test(pre) && text.startsWith(pre)) {
        setT(ts[0], pre); setT(ts[1], text.slice(pre.length)); ts.slice(2).forEach(t => setT(t, ''));
      } else { setT(ts[0], text); ts.slice(1).forEach(t => setT(t, '')); }
    }
    dropLsa(p);
    return p;
  }
  // 칸(subList) 안 문단 수를 줄 수에 맞추고 글자 채우기
  function setLines(ctx, sub, ls) {
    ls = ls.length ? ls : [''];
    let ps = kids(sub, 'p');
    while (ps.length < ls.length) { insertAfter(ps[ps.length - 1], cloneP(ctx, ps[ps.length - 1])); ps = kids(sub, 'p'); }
    while (ps.length > ls.length) { remove(ps.pop()); }
    ps.forEach((p, i) => setParaText(p, ls[i]));
  }
  const cellSub = tc => kids(tc, 'subList')[0];
  const rowTexts = tr => kids(tr, 'tc').map(tc => textOf(tc).trim());
  // 표 행 맞추기: 앞 head 행 유지, proto 행을 복제해 데이터 행 생성, 뒤 foot 행 유지 → rowAddr·rowCnt·높이 정리
  function fillTable(ctx, tbl, head, rows, footCount, cellLines) {
    const trs = kids(tbl, 'tr');
    const proto = trs[head];
    const foots = trs.slice(trs.length - footCount);
    trs.slice(head, trs.length - footCount).forEach(remove);
    rows.forEach(r => {
      const tr = renewIds(ctx, proto.cloneNode(true));
      if (foots.length) tbl.insertBefore(tr, foots[0]); else tbl.appendChild(tr);
      kids(tr, 'tc').forEach((tc, i) => setLines(ctx, cellSub(tc), cellLines(r, i)));
    });
    fixTable(tbl);
  }
  function fixTable(tbl) {
    let h = 0;
    kids(tbl, 'tr').forEach((tr, ri) => {
      kids(tr, 'tc').forEach(tc => kids(tc, 'cellAddr').forEach(a => a.setAttribute('rowAddr', String(ri))));
      const sz = kids(kids(tr, 'tc')[0], 'cellSz')[0]; h += sz ? +sz.getAttribute('height') || 0 : 0;
      desc(tr, 'p').forEach(dropLsa);
    });
    tbl.setAttribute('rowCnt', String(kids(tbl, 'tr').length));
    const sz = kids(tbl, 'sz')[0]; if (sz && h) sz.setAttribute('height', String(h));
  }
  // 견본 문단 한 개를 여러 줄로 바꿈 (글머리는 견본 글자에서 가져옴)
  function fillList(ctx, proto, items, prefix) {
    let ref = proto;
    items.forEach(s => { const p = setParaText(cloneP(ctx, proto), prefix + s); insertAfter(ref, p); ref = p; });
    remove(proto);
    return ref;
  }
  const bulletPrefix = p => { const m = textOf(p).match(/^(\s*[○❍]\s)/); return m ? m[1] : '  ○ '; };
  const dashPrefix = p => { const m = textOf(p).match(/^(\s*-\s)/); return m ? m[1] : '    - '; };

  /* ============ 템플릿 열기 / 다시 묶기 ============ */
  async function loadTemplate(type, opts) {
    const fetchFn = (opts && opts.fetch) || root.fetch.bind(root);
    const res = await fetchFn(TEMPLATES[type]);
    if (!res.ok) throw new Error('서식 파일이 없습니다');
    const zip = await root.JSZip.loadAsync(await res.arrayBuffer());
    const xml = await zip.file('Contents/section0.xml').async('string');
    const doc = new root.DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('서식 파일을 읽지 못했습니다');
    return { zip, doc };
  }
  async function pack(zip, doc, prvText, type) {
    let xml = new root.XMLSerializer().serializeToString(doc).replace(/^<\?xml[^>]*\?>\s*/, '');
    xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>' + xml;
    const out = new root.JSZip();
    const names = Object.keys(zip.files).filter(n => !zip.files[n].dir);
    // mimetype 은 맨 앞·무압축(STORE), 나머지는 원래 순서대로
    out.file('mimetype', await zip.file('mimetype').async('uint8array'), { compression: 'STORE' });
    for (const n of names) {
      if (n === 'mimetype') continue;
      let data;
      if (n === 'Contents/section0.xml') data = xml;
      else if (n === 'Preview/PrvText.txt') data = prvText.replace(/\r?\n/g, '\r\n');
      else data = await zip.file(n).async('uint8array');
      out.file(n, data, { compression: 'DEFLATE' });
    }
    return out.generateAsync({ type: type || 'blob', mimeType: 'application/hwp+zip', compression: 'DEFLATE' });
  }
  const paras = doc => kids(doc.documentElement, 'p');
  const findP = (doc, re) => paras(doc).find(p => re.test(textOf(p)));
  // 표지 글상자(2줄 제목), 발행 연월, 본문 머리 제목표 — 운영(안)·세부운영계획 공통
  function fillCoverAndHeader(ctx, doc, m) {
    const cover = paras(doc).find(p => desc(p, 'subList').some(s => kids(s, 'p').length >= 2 && /○○○/.test(textOf(s))));
    if (!cover) throw new Error('표지 제목 자리를 찾지 못했습니다');
    setLines(ctx, desc(cover, 'subList').find(s => /○○○/.test(textOf(s))), m.cover);
    dropLsa(cover);
    const dp = findP(doc, /^\s*\d{4}\.\s+○\.\s*$/); if (dp) setParaText(dp, m.coverDate);
    const hp = paras(doc).find(p => kids(p, 'run').some(r => kids(r, 'tbl').length) && /○○○/.test(textOf(p)));
    if (hp) { const cp = desc(hp, 'p').find(p => /○○○/.test(textOf(p))); setParaText(cp, m.header); dropLsa(hp); }
  }

  /* ============ 운영(안) ============ */
  async function buildPlan(f, data, opts) {
    const m = planModel(f, data);
    const { zip, doc } = await loadTemplate('plan', opts);
    const ctx = makeCtx(doc);
    fillCoverAndHeader(ctx, doc, m);
    // 장 제목표(Ⅰ~Ⅶ) 사이의 견본 문단을 찾음
    const all = paras(doc);
    const headIdx = {};
    all.forEach((p, i) => { const tb = desc(p, 'tbl')[0]; const tx = textOf(p).trim(); if (tb && kids(tb, 'tr').length === 1) { const k = tx.charAt(0); if ('ⅠⅡⅢⅣⅤⅥⅦ'.includes(k)) headIdx[k] = i; } });
    const keys = 'ⅠⅡⅢⅣⅤⅥⅦ'.split('');
    if (keys.some(k => headIdx[k] == null)) throw new Error('서식 파일의 장 구성이 예상과 다릅니다');
    const sec = k => { const i = headIdx[k], j = keys.indexOf(k) < 6 ? headIdx[keys[keys.indexOf(k) + 1]] : all.length; return all.slice(i + 1, j); };
    const firstBullet = ps => ps.find(p => /^\s*[○❍]\s/.test(textOf(p)));
    [['Ⅰ', m.basis], ['Ⅱ', m.purpose], ['Ⅲ', m.policy], ['Ⅶ', m.effects]].forEach(([k, ls]) => { const p = firstBullet(sec(k)); fillList(ctx, p, ls, bulletPrefix(p)); });

    // Ⅳ 운영 개요
    const s4 = sec('Ⅳ');
    const lab = re => s4.find(p => re.test(textOf(p)));
    const pName = lab(/행사명:/), pTheme = lab(/주제:/), pDate = lab(/일시:/), pPlace = lab(/장소:/), pTarget = lab(/○\s*대상/), pDash = s4.find(p => /^\s*-\s/.test(textOf(p))), pHost = lab(/주최\/주관/);
    const pre = bulletPrefix(pName);
    const ovv = m.overview;
    setParaText(pName, pre + ovv[0].text);
    const theme = ovv.find(o => /^주제:/.test(o.text)); if (theme) setParaText(pTheme, pre + theme.text); else remove(pTheme);
    setParaText(pDate, pre + ovv.find(o => /^일시:/.test(o.text)).text);
    setParaText(pPlace, pre + ovv.find(o => /^장소:/.test(o.text)).text);
    const dashes = ovv.filter(o => o.dash).map(o => o.text);
    if (dashes.length) { setParaText(pTarget, pre + '대상'); fillList(ctx, pDash, dashes, dashPrefix(pDash)); }
    else { setParaText(pTarget, pre + ovv.find(o => /^대상/.test(o.text)).text); remove(pDash); }
    setParaText(pHost, pre + ovv[ovv.length - 1].text);

    // Ⅴ 세부추진계획: 참가 부문·신청·세부일정표·※
    const s5 = sec('Ⅴ');
    const pDiv = s5.find(p => /참가 부문/.test(textOf(p)));
    const pDash5 = s5.find(p => /^\s*-\s/.test(textOf(p)));
    const pApply = s5.find(p => /참가 신청/.test(textOf(p)));
    const pNote = s5.find(p => /^\s*※/.test(textOf(p)));
    const pSched = s5.find(p => desc(p, 'tbl').length);
    const dashProto = pDash5.cloneNode(true);
    const pre5 = bulletPrefix(pApply);
    if (m.divisions.length) fillList(ctx, pDash5, m.divisions, dashPrefix(pDash5)); else { remove(pDiv); remove(pDash5); }
    setParaText(pApply, m.apply ? `${pre5}참가 신청: ${m.apply}` : `${pre5}참가 신청`);
    insertAfter(pApply, setParaText(renewIds(ctx, dashProto), dashPrefix(dashProto) + m.method));
    const st = desc(pSched, 'tbl')[0];
    setLines(ctx, cellSub(kids(kids(st, 'tr')[0], 'tc')[0]), [m.scheduleTitle]);
    const srows = m.schedule.length ? m.schedule : [{ time: '', mins: null, items: [], note: '' }];
    fillTable(ctx, st, 2, srows, 0, (r, i) => [[r.time], [r.mins ? r.mins + '분' : ''], r.items.map(x => '▷ ' + x), [r.note]][i] || ['']);
    dropLsa(pSched);
    const np = (textOf(pNote).match(/^(\s*※\s)/) || [, '     ※ '])[1];
    setParaText(pNote, np + m.scheduleNote);

    // Ⅵ 예산집행계획
    const pBud = sec('Ⅵ').find(p => desc(p, 'tbl').length);
    const bt = desc(pBud, 'tbl')[0];
    const brows = m.budget.items.length ? m.budget.items : [{ item: '예산 미편성', category: '', calc: '', amount: null, note: '' }];
    fillTable(ctx, bt, 1, brows, 1, (b, i) => [[b.item], [b.category], [b.calc], [b.amount == null ? '' : won(b.amount)], [b.note]][i] || ['']);
    const foot = kids(bt, 'tr').pop();
    const fc = kids(foot, 'tc');
    setLines(ctx, cellSub(fc[0]), ['합 계']); setLines(ctx, cellSub(fc[fc.length - 2]), [won(m.budget.total)]); setLines(ctx, cellSub(fc[fc.length - 1]), ['']);
    dropLsa(pBud);

    const prv = [m.cover.join(' '), m.coverDate, m.header, m.team,
      'Ⅰ 추진 근거', ...m.basis.map(x => '○ ' + x), 'Ⅱ 추진 목적', ...m.purpose.map(x => '○ ' + x), 'Ⅲ 추진 방침', ...m.policy.map(x => '○ ' + x),
      'Ⅳ 운영 개요', ...m.overview.map(o => (o.dash ? '- ' : '○ ') + o.text), 'Ⅴ 세부추진계획', 'Ⅵ 예산집행계획', 'Ⅶ 기대효과', ...m.effects.map(x => '○ ' + x)].join('\n');
    return { blob: await pack(zip, doc, prv, opts && opts.type), name: fileName('plan', f, m), model: m };
  }

  /* ============ 세부운영계획 ============
     서식 파일 약속(templates/detail-template.hwpx, 견본 문구로 찾음):
       표지 글상자 2줄(○○○), '2026.  ○.', 머리 제목표(○○○),
       견본 문단 '1. ○○○' / '가. 내용' / '- 내용' / '□ ○○○' / '○ 내용' / '※ 내용',
       표 3개: 머리행에 '종별'(종별|학년|종목|비고), '시간'(시간|내용|비고), '학교명'(순|학교명|남|여|계 + 합계행)
       → 견본 문단·표가 처음 나오는 곳부터 끝까지를 지우고 순서대로 다시 만듦 */
  async function buildDetail(f, data, opts) {
    const m = detailModel(f, data);
    const { zip, doc } = await loadTemplate('detail', opts);
    const ctx = makeCtx(doc);
    fillCoverAndHeader(ctx, doc, m);
    const all = paras(doc);
    const proto = re => { const p = all.find(x => !desc(x, 'tbl').length && re.test(textOf(x).trim())); if (!p) throw new Error('세부운영계획 서식의 견본 문단이 없습니다'); return p; };
    const tblP = word => { const p = all.find(x => { const t = desc(x, 'tbl')[0]; return t && rowTexts(kids(t, 'tr')[0]).includes(word); }); if (!p) throw new Error('세부운영계획 서식의 표가 없습니다'); return p; };
    const P = { num: proto(/^1\.\s*○○○/), ga: proto(/^가\.\s*내용/), dash: proto(/^-\s*내용/), box: proto(/^□\s*○○○/), o: proto(/^○\s*내용/), note: proto(/^※\s*내용/),
      tDiv: tblP('종별'), tSch: tblP('시간'), tSt: tblP('학교명') };
    const protos = Object.values(P);
    const start = Math.min(...protos.map(p => all.indexOf(p)));
    const saved = {}; Object.entries(P).forEach(([k, p]) => { saved[k] = p.cloneNode(true); });
    let ref = all[start - 1];
    all.slice(start).forEach(remove);
    const put = (k, text) => { const p = renewIds(ctx, saved[k].cloneNode(true)); if (text != null) setParaText(p, text); insertAfter(ref, p); ref = p; return p; };
    const pre = k => (textOf(saved[k]).match(/^(\s*)/) || ['', ''])[1];
    const putTable = (k, rows, cols, foot) => {
      const p = put(k); dropLsa(p);
      const tbl = desc(p, 'tbl')[0];
      const head = rowTexts(kids(tbl, 'tr')[0]);
      const idx = cols.map(c => head.findIndex(h => h.replace(/\s/g, '').includes(c)));
      const foots = foot ? 1 : 0;
      fillTable(ctx, tbl, 1, rows, foots, (r, i) => { const j = idx.indexOf(i); return [j >= 0 ? (r[j] || '') : '']; });
      if (foot) { const fc = kids(kids(tbl, 'tr').pop(), 'tc'); const vals = foot.slice(1); fc.forEach((tc, i) => { const k2 = i - (fc.length - vals.length); setLines(ctx, cellSub(tc), [i === 0 ? foot[0] : k2 >= 0 ? vals[k2] : '']); }); }
    };
    m.items.forEach(it => {
      put('num', pre('num') + it.head);
      it.sub.forEach(s => /^-/.test(s) ? put('dash', pre('dash') + s) : put('ga', pre('ga') + s));
      if (it.table) putTable('tDiv', it.table.rows, ['종별', '학년', '종목', '비고']);
    });
    if (m.schedule) { put('box', pre('box') + m.schedule.title); putTable('tSch', m.schedule.rows, ['시간', '내용', '비고']); }
    if (m.admin.length) { put('box', pre('box') + '□ 행정사항'); m.admin.forEach(x => put('o', pre('o') + x)); }
    if (m.status) {
      put('box', pre('box') + m.status.title);
      putTable('tSt', m.status.rows.concat([['', '이하 여백', '', '', '']]), ['순', '학교명', '남', '여', '계'], m.status.foot);
      if (m.status.noGender) put('note', pre('note') + `※ 성별 미기재 ${m.status.noGender}명은 합계에서 제외`);
    }
    const prv = [m.cover.join(' '), m.coverDate, m.dept, m.team, ...m.items.map(it => [it.head].concat(it.sub).join('\n')),
      m.schedule ? m.schedule.title : '', m.admin.length ? '□ 행정사항\n' + m.admin.join('\n') : '', m.status ? m.status.title : ''].filter(Boolean).join('\n');
    return { blob: await pack(zip, doc, prv, opts && opts.type), name: fileName('detail', f, m), model: m };
  }

  /* ============ 결과보고 (build_onepage.py 를 그대로 옮김) ============
     서식 파일 약속: 본문 문단 [0]=제목표(제목 칸 colSpan≥6, '일자'·'부서' 칸), [1]=빈 줄,
     [2]=장 제목 견본, [3]=본문 견본, [5]=장 사이 빈 줄 견본 */
  async function buildOnepage(f, data, opts) {
    const m = onepageModel(f, data);
    const { zip, doc } = await loadTemplate('result', opts);
    const ctx = makeCtx(doc);
    const ps = paras(doc);
    if (ps.length < 6) throw new Error('원페이지 서식의 문단 구성이 예상과 다릅니다');
    const headP = ps[0], blankTop = ps[1];
    const hProto = ps[2].cloneNode(true), bProto = ps[3].cloneNode(true), blankProto = ps[5].cloneNode(true);
    const tbl = desc(headP, 'tbl')[0];
    if (!tbl) throw new Error('원페이지 서식의 제목표가 없습니다');
    const tcs = desc(tbl, 'tc');
    const titleTc = tcs.find(tc => +(kids(tc, 'cellSpan')[0] || { getAttribute: () => 1 }).getAttribute('colSpan') >= 6);
    if (!titleTc) throw new Error('원페이지 서식의 제목 칸이 없습니다');
    setLines(ctx, cellSub(titleTc), m.title);
    const nextOf = label => { const i = tcs.findIndex(tc => textOf(tc).trim() === label); if (i < 0) throw new Error(`원페이지 서식의 '${label}' 칸이 없습니다`); return tcs[i + 1]; };
    setLines(ctx, cellSub(nextOf('일자')), [m.date]);
    setLines(ctx, cellSub(nextOf('부서')), [m.dept]);
    desc(headP, 'p').forEach(dropLsa);
    ps.slice(2).forEach(remove);
    let anchor = blankTop;
    m.body.forEach(line => {
      let n;
      if (line.trim() === '') n = blankProto.cloneNode(true);
      else if (!/^\s/.test(line) && HEADING_RE.test(line)) n = setParaText(hProto.cloneNode(true), line);
      else n = setParaText(bProto.cloneNode(true), line);
      renewIds(ctx, n); dropLsa(n);
      insertAfter(anchor, n); anchor = n;
    });
    const prv = m.title.join('\n') + '\n' + m.date + '\n' + m.body.join('\n') + '\n';
    return { blob: await pack(zip, doc, prv, opts && opts.type), name: fileName('result', f, m), model: m, est: m.est };
  }

  const BUILDERS = { plan: buildPlan, detail: buildDetail, result: buildOnepage };
  const tplCache = {};
  async function hasTemplate(type, opts) {
    if (tplCache[type] != null) return tplCache[type];
    try { const r = await ((opts && opts.fetch) || root.fetch.bind(root))(TEMPLATES[type], { method: 'HEAD', cache: 'no-store' }); tplCache[type] = r.ok; }
    catch (e) { tplCache[type] = false; }
    return tplCache[type];
  }

  const api = { TEMPLATES, DOC_LABEL, buildPlan, buildDetail, buildOnepage, build: (type, f, data, opts) => BUILDERS[type](f, data, opts),
    hasTemplate, previewHtml, planModel, detailModel, onepageModel, schoolStatus, scheduleRows, timeRange, estimateLines, fileName };
  root.HwpxDocs = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
