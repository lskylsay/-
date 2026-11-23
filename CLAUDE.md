# CLAUDE.md — sportsclub.my (마이스포츠클럽)

제천 지역 학교스포츠클럽·육상대회 안내/신청/기록 사이트. **빌드 과정 없는 순수 정적 사이트**(HTML + CSS + ES module JS)이며, 데이터는 브라우저에서 Supabase로 직접 읽고 씁니다.

## 배포

- `main` 브랜치에 커밋/푸시하면 **Vercel이 자동 배포**합니다 (운영 도메인 `sportsclub.my`). main 푸시는 곧 운영 반영이므로 주의.
- `claude/` 브랜치에 푸시하면 GitHub Actions(`.github/workflows/auto-merge-claude.yml`)가 main으로 PR을 만들고 자동 병합합니다 → 곧바로 운영 배포됩니다.
- `package.json`, 번들러, 테스트 프레임워크 없음. 로컬 확인은 정적 서버(`python3 -m http.server`)로 페이지를 열면 됩니다.
- JS 문법 확인: `node --input-type=module --check < 파일.js`

## 파일 구조

| 페이지 | 스크립트 | 역할 |
|---|---|---|
| `index.html` | — | 홈. 선택 카드 5개(`.gateway-card`; 1·2 `.gateway-lg` 6칸 중 3칸씩, 3·4·5 `.gateway-sm` 2칸씩, 태블릿 2열, 640px 이하 1열): 학교체육업무지원 / 대회 참가현황 및 결과 공유(contest.html) / 학교운동부 / 학교체육활성화 / 정책 현황. **한시 노란 배너**(`#heroBanner`, 제목 아래): 한국 시간 2026-11-05~11-12(시작·끝 날짜 포함)에만 보이고(index.html 아래쪽 스크립트의 `START`/`END`), '교육감기 육상대회 시간별 출전선수 현황보기' → `results.html?competition=충북교육감기 육상대회&view=time`(`view=time`이면 시간별 보기로 바로 열림). 기간이 지나면 저절로 사라짐. 히어로 안(`.wrap.hero-with-apps`)에 앱 아이콘 묶음 `.hero-apps`(스톱워치 → 대진표 → 스코어보드 순, 모두 `.hero-stopwatch` 구조: 흰 원 + 글자)가 있고 누르면 각각 claude.ai 스톱워치 / 충청북도 학교스포츠클럽 대진표 생성 / 스코어보드(`claude.ai/artifact/Sj5rWFNS7xpvwJ5BwM2VmD`) 페이지가 새 창으로 열림. 위치는 `.hero-apps`가 담당(묶음 가운데가 가로 65%). 휴대폰(640px 이하)에서는 "홈페이지 방문을 환영합니다" 바로 아래에 세 아이콘이 원 아래 글자 세로형으로 한 줄에 나란히 |
| `contest.html` | — | 제천 관내 행사 안내(두 대회 카드: 신청하기 버튼 없음, '현황보기'→results.html). 참가 신청은 관리자 페이지 '대회별 신청자명단관리'의 엑셀 일괄 등록으로 받음. 맨 아래 '대회 일정'은 오늘 날짜 기준으로 '지난 일정'(최근순) / '다음 일정'(D-day·진행 중 표시) 두 칸으로 자동 분리(업무실에서 '대회 일정에 공개'로 체크한 사업·할 일을 RPC `get_public_schedule()`로 불러와 표시 — 공개 항목이 없거나 RPC가 없으면 파일 안 `EVENTS` 기본 목록, CSS `.sched-*`), 휴대폰은 1열 |
| `apply.html` | `apply.js` | 참가 신청 (개인 / 트랙마라톤 교사 일괄 엑셀 신청) → `applications`, `bulk_applications`, storage `bulk-uploads` |
| `admin.html` | `admin.js` | 관리자 (GitHub OAuth 로그인, `ADMIN_EMAIL`만): 신청 관리·배번 등록, 대회 결과 관리(엑셀 업로드; 결과 표 열 순서는 대회·종목/부문·배번·학교·이름·기록·날짜·순위·비고·선택이며, 배번·학교는 결과의 `applications_id`로 `applications`(`bib_number`, `class_no`; `bib_number`가 비어 있으면 `members` 글자의 "배번 N"에서 읽음 — 운영 DB는 대부분 이 방식)를 200건씩 나눠 불러와 붙임(없으면 '-'), 정렬은 대회→종목/부문→배번(없으면 맨 뒤). '총 N건' 아래 줄에서 범위(대회 전체/대회별/체크한 기록만 — 체크하면 자동으로 '체크한 기록만', 체크가 없으면 '대회 전체')를 골라 **엑셀(.xlsx)**(SheetJS; '전체' 시트 + 종목/부문별 시트, 기록은 글자 그대로)·**한글(.hwpx)**(`HwpxDocs.buildResults`)로 내려받음, 0건이면 "내려받을 기록이 없습니다", 파일명 `대회결과_{대회명|전체|선택}_{YYYYMMDD}`. 맨 오른쪽 '전체선택' 체크 + '선택 삭제'로 한꺼번에 삭제 — 200건씩 나눠 지우고 실제 삭제된 행 수를 확인해 권한 문제로 0건 처리되면 알림), 대회요강·학교체육 게시글 업로드. **신청자 엑셀 일괄 등록**: 시트 이름에 '조사표'(예: '각종 수요(버스, 숙박, 육상복)조사표')가 있으면 `parseSurveySheet`로 그 시트만 읽음(순·급별·학교명·학년·성명·첫번째/두번째(또는 참가종목)·4x100mR/4x400mR/Mixed R·성별 열; '(예시)' 행·이름 없는 행 제외; 연락처·사이즈·버스·숙박은 가져오지 않음) → 학생 1명이 출전하는 종목마다 `applications` 1건, `sport`="종목 부별"(예: `100m 남초5`, 계주는 `4x100mR 초등`, 혼성계주), `class_no`=학교, `grade`='N학년'. 그 외 형식은 기존 방식(배번/소속/성명 열, 시트 이름=종목). 같은 대회에 이미 신청이 있으면 선택창(`askUploadMode`): **기존 삭제 후 새 파일로 교체**(새 파일을 먼저 등록한 뒤 옛 신청 id만 200건씩 삭제·삭제 수 확인, 등록 실패 시 기존 자료 유지, 이미 입력된 기록이 있으면 경고 + 한 번 더 확인) / **기존에 추가** / 취소. **학생 종목·정보 수정**: 신청 명단 각 행(개인 신청)의 '수정' 버튼 → `openStudentEditor` 창. 같은 대회·학교·이름의 신청(종목마다 1건)을 모아 보여주고 종목 이름 수정·종목 추가(기존 신청 정보 복사)·종목 삭제(기록이 있으면 확인)·이름/학교/학년 수정을 한 번에 저장(수정·추가·삭제 모두 `.select()`로 처리 건수 확인). 종목 형식은 "종목 부별"(계주는 `4x100mR 초등`). **관리자 탭 구조**: 맨 위 줄 '선택 1 학교체육업무지원'(`adminSchoolpeTabBtn`) / '선택 2 대회 참가현황 및 결과 공유'(`adminContestGroupBtn`) / 선택 3·4·5 (업무실 링크는 처음화면 하단으로 이동). 선택 2를 누르면 아래 하위 탭 줄(`#adminContestSubRow`: 대회별 신청자명단관리·대회결과관리·대회요강관리)이 나타나고 마지막에 보던 하위 탭을 기억(`lastContestTab`) |
| `workroom.html` | (파일 안에 내장) + `hwpx-docs.js` | 관리자 업무실 (처음화면 맨 아래 "업무실" 링크로 들어감 — 관리자 탭에서는 분리됨; 왼쪽 메뉴 맨 아래 "처음화면" 링크(`.nav-home`)로 index.html 복귀; 처음화면 하단의 경기기록원 링크는 삭제, recorder.html 주소는 그대로 존재). 단독 페이지로 자체 CONFIG(같은 Supabase 프로젝트·관리자 이메일)와 supabase-js UMD 사용. 사업·워크플로우, 일정·할일, 공문 초안, 대회 관리, 예산 → 테이블 `admin_projects`, `admin_tasks`, `admin_workflows`, `admin_budget`, `admin_documents` (모두 관리자 전용 RLS). 대회 관리에는 "경기기록원 기록 입력: 항상 가능" 안내만 표시. 오늘 탭: 추진 중인 사업 목록(상태가 완료·보류가 아닌 사업, 행사일 순 표) + 캘린더(`calPanelHtml`/`bindCal`, 일정·할일 탭과 같은 캘린더; 다시 그리기는 `S.calBack`) + 처리할 일·신청 현황·예산. 일정·할일 캘린더: 배너(할 일·사업 제목)를 누르면 세부 내용 창(`eventDetail`; 할 일은 [수정], 사업은 [사업 상세 보기]), 캘린더 오른쪽 위 '+'(`#cadd`)로 새 일정(할 일) 등록, 날짜 칸을 누르면 그날 기한으로 추가. 사업·워크플로우 화면: **'📄 운영계획(hwpx) 불러오기'**(`importPlan`) — 운영(안) hwpx를 올리면 `HwpxDocs.parsePlan`(hwpx-docs.js)이 본문 문단·표에서 사업명(행사명:)·행사일(일시:)·장소·대상·주제·주최/주관·예산표(머리행 이름으로 열 찾기)·세부일정표를 읽어 확인 창에 채워 주고, 고친 뒤 '새 사업' 또는 '기존 사업'에 반영(사업 정보 + 예산 항목 `admin_budget` 등록, 주제·주최·세부일정은 메모). 못 찾은 항목은 안내. '+ 새 사업'은 제목 줄 오른쪽에 두어 목록·상세·워크플로우 탭 어디서나 보임. 메뉴로 들어오면 항상 목록부터(`go('projects')`가 `S.selProject` 초기화), 오늘 화면에서 사업을 누르면 `go('projects', 사업id)`로 그 사업 상세 |
| `recorder.html` | `recorder.js` + `script.js` | 경기기록원 (PIN 입장, 로그인 없이 anon 키로 동작). 탭: 기록 입력 / 대회 결과(실명 확인) |
| `results.html` | `script.js` | 대회 결과 공개 조회 (RPC `get_public_results`) |
| `guidelines.html` | `guidelines.js` | 대회요강 게시판 (`guidelines`, storage `guideline-files`). `preview_path`(미리보기용 PDF)가 있으면 제목 클릭 시 화면 안 모달로 PDF 표시(원본 다운로드·닫기·Esc), 없으면 바로 다운로드 |
| `awards.html`, `dashboard.html` | `awards.js`, `dashboard.js` | 학교운동부 성과 기록 / 현황 대시보드 (아래 "성과 기록·현황 대시보드" 참고) |
| `pathways.html`, `map.html` | `pathways.js`, `map.js`, `pathway-diag.js` | 학교운동부 연계 경로도 / 학교 지도 (아래 "연계 경로도·지도·현황 보고서 (3단계)" 참고) |
| `schoolpe.html`, `schoolpe-*.html` | `schoolpe-board.js` | 학교체육업무지원 게시판. 각 페이지가 `window.SCHOOLPE_CATEGORY`를 지정 (`school_pe_posts`, storage `schoolpe-files`). **엑셀(.xlsx/.xls/.csv) 첨부는 화면에서 바로 열람**: 제목 또는 '내용 보기' 버튼 → 모달(`openSheetViewer`, pdf-modal 스타일 재사용·`.sheet-*`), SheetJS(`xlsx@0.18.5` CDN, 처음 열 때만 로드)로 파일을 읽어 표로 보여주고 **시트는 아래쪽 탭**으로 전환(숨김 시트 제외, 최대 1000행·60열, 제목 줄은 가로 병합 표시), '다운로드' 버튼·Esc·바깥 클릭 닫기. 모든 게시판 페이지 공통 |
| `teams.html`, `activity.html`, `policy.html` | `schoolpe-board.js` | 처음화면 선택 3·4·5 게시판 (학교운동부 운영 현황 / 학교체육활성화 현황 / 학교체육 정책 현황). schoolpe 게시판과 같은 구조, `window.SCHOOLPE_CATEGORY` = `teams` / `activity` / `policy`, 같은 `school_pe_posts`·`schoolpe-files` 사용. 글이 없을 때 문구는 `window.SCHOOLPE_EMPTY_TEXT`로 지정. **teams.html은 종목 탭**(`window.SCHOOLPE_SPORTS` = 육상·역도·하키·기계체조·배구·탁구·축구·롤러(빙상)·태권도, 주소 `#육상` 형식으로 탭 기억, `[종목]`이 없는 글은 '공통' 탭이 있을 때만 표시) — 글 제목이 `[종목] 제목` 형식이면 그 종목 탭에 모임(관리자 '선택3' 탭의 종목 선택이 자동으로 붙임). **학교별 하위 탭**: `window.SCHOOLPE_SUBS`(teams.html)·`TEAM_SCHOOLS`(admin.js)에 종목별 학교 목록 — 지금은 롤러(빙상) → 동명초·제천중·제천여중·제천고·제천여고. 제목 `[롤러(빙상)·동명초] 제목` 형식이면 그 학교 탭에 모임(주소 `#롤러(빙상)/동명초`), 학교 없이 `[롤러(빙상)]`만 있으면 '전체' 탭에만 나옴. 관리자 '선택3' 탭은 종목을 고르면 학교(팀) 선택이 나타남. 다른 종목에 학교를 추가하려면 두 파일의 같은 목록에 추가. 관리자 '선택3' 탭의 '샘플 파일 다운로드'는 루트의 `teams-sample.xlsx` = 단위학교 운동부 **조사표** 양식(2027학년도 기준 학년; 시트: 작성 안내 / 운동부 현황[선수 수, 2027 전국체전(소체) 예상 금·은·동 메달 수·입상 계·설명] / 감독·코치 / 개인종목 선수[현재기록·전년도 전국체전 금·은·동 기록·소체 목표기록·예상실적·맞춤 지원] / 단체종목 선수[포지션·기량 특징 서술]; 예시 데이터는 모두 가짜). 학생 성명 등 개인정보가 들어가므로 공개 게시판에 올리지 않도록 안내 문구 표시. 종목 아래 학교별 운동부 현황·학생선수 개인카드는 별도 테이블이 필요해 이후 확장 예정. admin.html 탭 '선택3 학교운동부 운영 현황 관리' / '선택4 학교체육활성화 현황 관리' / '선택5 학교체육 정책 현황 관리'에서 각각 업로드·삭제(학교체육업무지원 관리 화면을 카테고리 하나로 고정해 재사용, `setSpMode`; '학교체육업무지원 관리' 탭은 기존 5개 게시판만 표시) |

공통 파일:
- **사이트·앱 아이콘**: 처음화면 히어로 사진(`hero-runners.jpg`)의 학생 4명을 정사각형으로 잘라 만든 `favicon.ico`·`favicon-32.png`(브라우저 탭), `apple-touch-icon.png`(아이폰 홈 화면), `icon-192.png`·`icon-512.png`·`icon-maskable-512.png`(안드로이드 설치용, maskable은 둥근 마스크용 여백판). `manifest.webmanifest`(이름 '마이스포츠클럽', standalone, 남색 `#16233F`)와 함께 모든 루트 html의 `<head>`에 링크됨. 아이콘 이미지를 바꾸려면 같은 파일명으로 교체(홈 화면에 이미 설치한 앱은 지웠다가 다시 설치해야 새 아이콘이 반영됨)
- `config.js` — `window.SUPABASE_URL`, `SUPABASE_ANON_KEY`(publishable 키, 공개돼도 되는 값), `ADMIN_EMAIL`. 모든 데이터 페이지에서 모듈 스크립트보다 먼저 `<script src="config.js">`로 로드.
- `dropzone.js` — 드래그앤드롭 파일 첨부 유틸 (`initDropzone`)
- `storage-key.js` — Storage 키를 영문·숫자로 안전하게 생성 (`safeStorageKey`), 원래 파일명은 DB `file_name`에 저장
- `style.css` — 전체 공통 스타일 (CSS 변수 `--ink`, `--line`, `--font-mono` 등)
- `*-template.xlsx` — 신청/결과 업로드용 엑셀 양식 (admin에서 SheetJS `xlsx@0.18.5` CDN 사용)

## 학교운동부 현황 (선택3, 1단계)
- **테이블**(관리자 전용 RLS, 읽기·쓰기 모두 관리자 이메일만): `sport_teams`(year, sport, kind, school, level, team_name, founded, players_m/f, training_place, exp_gold/silver/bronze, exp_note, note, updated_at; unique(year, school, sport)) / `sport_staff`(year, sport, school, role, name, status, career_years, qualification, note) / `sport_athletes`(year, sport, school, team_type, name, gender, grade, detail, current_record, prev_gold/silver/bronze, target_record, expected, feature, support). 세 테이블 모두 `id` 칸으로 삭제·교체 처리.
- **공개 RPC**: `get_public_teams(p_year int default null)`(null이면 최근 학년도; year, sport, kind, school, level, team_name, founded, players_m, players_f, training_place, directors, coaches) / `get_public_team_years()`(학년도 목록, 최신순).
- **공개/비공개 원칙**: 학생·지도자 이름, 기록, 예상 메달은 공개 화면에 절대 보이지 않음. 공개 화면(`teams.html` + `teams-status.js`)은 위 RPC만 쓰고 테이블을 직접 읽지 않음. 이름·기록 등은 관리자 화면(admin.html 선택3)에서만 실명으로 봄.
- **`teams-status.js`**: teams.html 맨 위 '운동부 현황'(학년도 선택[여러 해일 때만], 숫자 요약 4칸, 학교급·종목 필터, 학교×종목 표[첫 열 고정·가로 스크롤·합계 행/열], 학교 카드 모달[pdf-modal 재사용, Esc·바깥 클릭], 종목별 요약). 종목은 DB 값 기준(`SCHOOLPE_SPORTS`와 무관). RPC 오류·자료 없음이면 "현황 자료를 준비 중입니다". 아래 '자료실'은 기존 종목 탭 게시판. CSS `.ts-*`.
- **관리자 조사표 업로드**(admin.html '선택3' 탭 위쪽 `#teamsSurveySection`, admin.js 맨 아래 `ts*` 함수): 학년도(기본 2027) + `.xlsx` 끌어놓기 → [미리보기](시트별 행 수·학교·종목·선수 수·학교명 표기 경고·읽지 못한 행) → [저장]. 시트·열 대응(머리글을 공백·줄바꿈 제거 후 이름으로 찾음, 그 아래 행부터):
  - '운동부 현황' → `sport_teams`: 종목·구분(개인/단체)·학교명·학교급·운동부 명칭·창단 연도·선수 수(남/여)·훈련 장소·예상 금/은/동·예상 실적 설명·비고. 선수 수(계)·입상 계는 수식이라 읽지 않음.
  - '감독·코치' → `sport_staff`: 종목·학교명·구분(role)·성명·신분·지도 경력·주요 자격·경력·비고
  - '개인종목 선수' → `sport_athletes`(team_type='개인'): 세부종목(체급)→detail, 현재 기록, 전년도 금/은/동 기록, 목표 기록, 예상 실적, 맞춤 지원
  - '단체종목 선수' → `sport_athletes`(team_type='단체'): 포지션→detail, 기량 특징→feature, 맞춤 지원→support
  - 건너뜀: 비고가 '예시'인 행, 학교명에 ○△◇가 든 행, 종목·학교명이 빈 행. 학교명은 앞뒤 공백 제거(표기가 섞이면 미리보기에서 경고만).
  - 저장 방식: **이 학교 것만 교체**(기본; 파일에 나온 학교의 그 학년도 자료만) / **이 학년도 전체 교체**(확인 한 번 더). 순서: 지울 옛 id 기억 → 새 자료 넣기(운동부는 `year,school,sport` upsert, 지도자·선수는 insert; 모두 `.select()`로 건수 확인) → 새 자료가 다 들어간 뒤 옛 id만 삭제. 도중 실패하면 새로 넣은 지도자·선수는 되돌리고 옛 자료는 그대로.
  - 아래 목록: 학교 필터, 행별 삭제(그 학교·종목의 지도자·선수 명단 포함), '명단 보기'(관리자 실명 표시). '샘플 파일 다운로드'(`teams-sample.xlsx`)는 이 영역에 있음.

## 성과 기록·현황 대시보드 (2단계)
- **테이블** `sport_awards`(id, year, competition, comp_level[전국/도/시군], event_date, sport, detail[세부종목·체급], school, school_level[초/중/고], gender[남/여/혼성], team_type[개인/단체], place[순위 int], medal[금/은/동/null], athlete[**선수 이름 — 관리자 전용**], record, note, created_at). 관리자 전용 RLS.
- **공개 RPC**: `get_public_awards(p_from int, p_to int)` — athlete만 뺀 모든 칸 / `get_public_team_trend()` — year, teams, schools, sports, players_m, players_f (sport_teams 학년도별 집계). RPC가 없거나 오류면 해당 영역에 "자료를 준비 중입니다"만 보임.
- **공개/비공개 원칙**: 선수명·학생·지도자 이름·예상 메달(`exp_*`)은 공개 화면(awards/dashboard)에 쓰지 않음. 공개 페이지는 위 RPC만 사용(테이블 직접 읽기 금지). 예상 대비 실적 표와 선수명은 관리자 화면에서만.
- **새 페이지**: `awards.html`+`awards.js`(성과 기록: 연도·대회·종목·학교급·학교·메달 필터[휴대폰은 접이식], 금·은·동 개수, 연도→대회별 표, 가로 스크롤) / `dashboard.html`+`dashboard.js`(숫자 6칸, 연도별 메달 추이[대회 필터], 종목별 메달, 학교별 메달 순위[금→은→동], 운동부·선수 수 추이[학년도 1개면 안내 문구], 학교급별 분포; **Chart.js 4.4.1 UMD**(cdn.jsdelivr) 사용, 그래프마다 '표로 보기', 자료가 없으면 안내 문구, '올해'는 sport_awards의 가장 최근 연도). 메달 색 금 `#C9A227` / 은 `#9AA3AD` / 동 `#B26B3A`(CSS `.medal-*`, `.aw-*`, `.dash-*`). teams·awards·dashboard 세 페이지 맨 위에 같은 메뉴 줄 `.ts-nav`(운동부 현황 / 성과 기록 / 현황 대시보드).
- **엑셀 양식 `awards-template.xlsx`**(시트 '입상 기록' + '작성 안내'; 대회명·수준·학교급·성별·구분·메달 칸에 데이터 유효성 목록). 열 → `sport_awards`: 연도→year | 대회명→competition | 대회 수준→comp_level | 대회 일자→event_date(엑셀 날짜·'2026-05-30' 모두 가능) | 종목→sport | 세부종목(체급)→detail | 학교명→school | 학교급→school_level(비면 학교명 끝 글자로 추정) | 성별→gender | 구분→team_type | 순위→place | 메달→medal | 선수명→athlete(단체는 쉼표) | 기록→record | 비고→note. 건너뜀: 비고 '예시', 학교명에 ○△◇, 종목·학교명이 빈 행. 필수: 연도·대회명·종목·학교명·(순위 또는 메달).
- **메달 계산 규칙**: 메달 칸이 비면 순위 1·2·3 → 금·은·동, 4위 이하는 메달 없음(null). 구기 공동 3위는 3위 2줄(각각 동메달 1개). 단체종목은 팀당 1줄 = 메달 1개.
- **관리자 성과 기록 관리**(admin.html 선택3 탭 `#awardsSection`, admin.js `ax*` 함수; 조사표 파서 `tsReadSheet` 재사용): 엑셀 업로드(미리보기: 건수·금은동·읽지 못한 행) — 저장 방식 **추가**(기본) / **이 연도·대회 교체**(파일의 연도+대회명 조합의 기존 기록 id를 먼저 기억 → 새 기록 먼저 insert → 다 들어간 뒤 옛 id 삭제, 모두 `.select()`로 건수 확인, 실패하면 새로 넣은 것을 되돌림). 한 건 직접 입력(학교·종목 자동완성은 sport_teams 값), 기록 목록(연도/대회/학교 필터, 수정·삭제·체크 선택 삭제), **예상 대비 실적 표**(학년도=연도 입력 → sport_teams 예상 금·은·동 vs 같은 연도 '전국소년체육대회'·'전국체육대회' 실제 개수, 학교·종목별, 합계 줄 + 차이 +/−; 학교명은 공백 제거 후 끝의 '학교'를 뗀 값으로 맞춤).

## 연계 경로도·지도·현황 보고서 (3단계)
- **테이블**: `sport_schools`(name PK = sport_teams.school과 같은 이름, level[초/중/고], address[메모용 글자], lat, lng, updated_at) / `sport_pathways`(id, sport, from_school, to_school, note; unique(sport, from_school, to_school)). 둘 다 **누구나 읽기·관리자만 쓰기** → 공개 페이지가 직접 select(운동부 정보는 계속 `get_public_teams`만). 테이블이 없거나 오류면 "자료를 준비 중입니다"(연계 정보만 오류면 경로도는 카드만 보이고 연계 줄·미등록·연계 배지는 숨김).
- **메뉴 줄 `.ts-nav`**: 다섯 페이지(운동부 현황 teams / 성과 기록 awards / 현황 대시보드 dashboard / 연계 경로도 pathways / 학교 지도 map) 모두 같은 줄. 휴대폰은 가로 스크롤. 페이지를 더하면 5개 html의 메뉴 줄을 함께 고칠 것.
- **진단 규칙(`pathway-diag.js`의 `diagnose`, 공개 pathways.js·dashboard.js·관리자 보고서가 같이 씀)**: 종목별로 최근 학년도 운동부의 학교급(초/중/고) 팀 수를 센다. 초 팀이 있는데 중 팀이 없으면 '중학교 연계 단절', 중 팀이 있는데 고 팀이 없으면 '고등학교 연계 단절'. 세 학교급이 모두 있고 sport_pathways로 초→중, 중→고가 한 학교를 거쳐 이어지면 '초·중·고 연계'(모두 있는데 안 이어지면 '연계 확인 필요'). 연결이 하나도 없는 학교(그 종목)는 카드에 '연계 미등록'.
- **pathways.html + pathways.js**: 종목별 요약 표(행 클릭 → 그 종목) + 종목 탭(주소 `#종목`) + 3단 카드(초/중/고) + SVG 곡선(라이브러리 없음, 창 크기 바뀌면 다시 그림). 640px 이하는 세로 쌓기 + 카드 안 '→ 진학 연계: ○○중' 글자(SVG 숨김). 학교·선수 수만 표시. 대시보드 숫자 요약 아래에 '연계 단절 종목 N개 → 연계 경로도 보기'.
- **map.html + map.js**: Leaflet 1.9.4(unpkg, js·css 버전 고정) + OpenStreetMap 타일, 출처 '© OpenStreetMap 기여자' 표기 필수. 처음 위치 제천 시내(37.132, 128.191) 확대 12, 학교급 색은 style.css `--level-cho/jung/go`, 학교급·종목 필터, 팝업(종목·선수 남/여·감독/코치 수·`pathways.html#종목` 링크), 좌표 없는 학교는 '위치 미등록 학교' 목록.
- **관리자(선택3 탭 `#teamsGeoSection`, admin.js 아래쪽 `geo*`·`pw*`·`rp*` 함수)**: '학교 위치'(현재 학년도 sport_teams 학교 중 sport_schools에 없는 학교를 학교급과 함께 추가 → 학교 선택 후 작은 Leaflet 지도를 눌러 lat/lng 저장, 주소는 메모, 위치 없는 학교 수 표시) / '진학 연계'(종목 선택 → 초/중/고 열 표시, 보내는·받는 학교 선택·비고로 추가, 같은 학교급·거꾸로 연결 차단, 삭제) — 모든 저장·삭제는 `.select()`로 건수 확인.
- **현황 보고서(.hwpx)**: 같은 탭 '현황 보고서 만들기' — 학년도(sport_teams)·성과 연도(sport_awards) → [미리보기] → 시사점 글상자 직접 수정 → [한글(.hwpx) 내려받기], 파일명 `제천 관내 학교운동부 운영 현황_{학년도}학년도_{YYYYMMDD}.hwpx`. `hwpx-docs.js`의 `teamReportModel`(내용 모델)·`teamReportPreview`·`buildTeamReport`·`teamReportFileName`. 문체는 jecheon-onepage-report 스킬(개조식, 명사형, 일자 `2026. 11. 23.(월)`, 결론 먼저, 학생 이름 없음, 2쪽 이내 목표). 구성: 1. 운영 현황(가. 학교급별 표[학교급|운동부|학교|남|여], 나. 종목별 표[종목|운동부|초·중·고 팀 수|남|여]; 전 학년도 대비 증감) / 2. 주요 성과(성과 연도 전국소년체육대회·전국체육대회 금·은·동, 종목별 표[종목|금|은|동|계], 예상 대비 실적 ※ 한 줄) / 3. 연계 육성 현황(연계 단절 종목, 연계 미등록 운동부·학교 수) / 4. 시사점 및 향후 계획(수치로 자동 초안 2~4줄, 직접 수정 가능). 표는 모두 5열.
  - `templates/team-report-template.hwpx` 약속(results-template을 바탕으로 정리, 견본 문구만·메타데이터 없음·Preview 비움): 본문 문단 [0]=구역 설정, [1]=머리 제목표(○○○), 견본 문단 '2026. ○. ○.(○)  체육교육팀' · '1. ○○○' · '  가. 내용' · '    - 내용' · '  ※ 내용', 마지막이 5열 표(머리행 + 견본행). 문단·표를 복제해 쓰고 바꾼 문단은 linesegarray 삭제·id 새로·표 rowAddr·rowCnt 맞춤. 한글 프로그램이 없어 화면 확인 못 함 → 한글에서 표·쪽수 확인 필요.

## 개인정보 규칙 (개인정보 보호법 준수)
- **운영 목적**: 학교체육 활성화를 위한 공익 목적의 학교스포츠클럽·체육대회 운영(참가 신청·경기 기록·결과 안내)과 제천 관내 학교운동부 현황 안내.
- **저장·공개 기준**: DB에는 성명·학년 실명 저장. 공개 화면은 성명 가운데 O·학년·학교·배번·기록만, 반 비공개(`get_public_results_safe`, 자세한 규칙은 아래 "대회 결과" 절). 실명은 관리자(로그인)와 경기기록원(DB가 비밀번호 확인)만. 학교운동부 조사의 학생선수·지도자 이름, 입상 기록의 선수명은 관리자만(공개 RPC가 주지 않음).
- **국외 이전**: Supabase(일본 도쿄, DB·파일), Vercel(미국, 호스팅) → 처리방침 ⑤ 표에 업체·국가·항목·시기와 방법·보유기간 공개.
- **`privacy.html` 개인정보 처리방침**: 개인정보보호위원회 표준 작성지침 순서 ①처리 목적 ②처리 항목 ③보유기간 ④제3자 제공(없음) ⑤처리위탁·국외 이전 ⑥만 14세 미만(보호자 동의는 소속 학교가 받아 보관) ⑦공개 범위 ⑧파기 ⑨권리 행사 ⑩안전성 확보 조치 ⑪보호책임자 ⑫권익침해 구제 ⑬변경·시행일. 운영자가 채울 **노란 자리표시 `.ph`**: `[보유기간: 예) 대회 종료 후 1년]`(처리방침 ③·⑤, apply.html 동의 문구·일괄 신청 안내, 동의서 양식 2개에 같은 문구), `[책임자 성명]`·`[소속]`·`[연락처]`, `[시행일]`. 보유기간을 정하면 이 문구를 모두 같은 값으로 바꿀 것. **모든 페이지 바닥글**(workroom.html 제외)에 굵은 '개인정보 처리방침' 링크(`.footer-privacy`) — 새 페이지를 만들면 바닥글에 같은 링크를 넣을 것.
- **수집 최소화**: apply.js의 IP 주소 수집(`api.ipify.org`, `ip_address` 저장)은 삭제됨. 다시 넣지 말 것(관리자 신청 표의 IP 열은 예전 자료 표시용으로만 남아 있음).
- **동의 문구·확인**: apply.html 동의 문구는 처리방침과 같은 표현(항목·목적·보유기간·거부 권리와 불이익·공개 범위·국외 이전). **교사 일괄 신청(apply.html `#bulkGuardianConsent`)과 관리자 신청자 엑셀 일괄 등록(admin.html `#rosterConsent`)은 필수 체크** — "참가 학생(만 14세 미만은 보호자 포함)의 개인정보 수집·이용, 국외 보관 및 결과 공개(성명 일부 가림) 동의서를 받아 학교에 보관하고 있습니다." 체크 전에는 제출·업로드 버튼이 꺼짐. 동의서 양식 `athletics-privacy-consent-template.xlsx`·`marathon-privacy-consent-template.xlsx`에는 공개 범위·국외 보관·법정대리인 동의 안내 행과 보유기간 자리표시가 있음.
- **파기 기능**(admin '대회별 신청자명단관리' 위쪽 `#purgeBox`, admin.js `purge*`·`loadStorageFiles`): 대회 선택 → [파기 대상 확인](results·applications·bulk_applications 건수) → 확인창 + '파기' 입력(두 번 확인) → 200건씩 삭제하며 `.select()`로 실제 삭제 건수 확인 → 대회·일시·대상/삭제 건수 표시 + 건수만 담은 CSV 내려받기. 같은 영역에서 `bulk-uploads` 저장소 원본 파일 목록·선택 삭제(`remove` 반환 건수 확인).
- 저장소(공개 경로)에는 실명·연락처·작성자 메타데이터 파일을 두지 않는다(양식·템플릿은 가짜 예시·자리표시만).

## 업무실 공문 초안 → 한글(.hwpx) 내려받기
- `workroom.html` 공문 초안 탭의 "한글(.hwpx) 내려받기" 버튼 → `hwpx-docs.js`(`window.HwpxDocs`). JSZip은 CDN(`jszip@3.10.1`), 빌드 도구 없음
- 방식: `templates/*.hwpx` fetch → JSZip → `Contents/section0.xml`을 DOMParser로 수정 → 다시 zip(mimetype 맨 앞·STORE, `header.xml` 등 나머지 그대로). 바꾼·복제한 문단은 `<hp:linesegarray>` 삭제, 복제 문단 id 새로 부여, 표 행 수정 시 `rowAddr`·`rowCnt` 맞춤, `Preview/PrvText.txt`는 새 본문
- 문서별 대응 (서식 = 스킬)
  | 탭 | 함수 | 서식 파일 | 스킬 |
  |---|---|---|---|
  | 운영(안) | `buildPlan` | `templates/plan-template.hwpx` | jecheon-sports-plan-doc |
  | 세부운영계획 | `buildDetail` | `templates/detail-template.hwpx` (**아직 없음**) | jecheon-detailed-operation-plan |
  | 결과보고 | `buildOnepage` | `templates/onepage-template.hwpx` (**아직 없음**) | jecheon-onepage-report (build_onepage.py 이식) |
  | 대회 결과표 (admin.html 대회결과관리) | `buildResults(rows, opts)` | `templates/results-template.hwpx` | — (plan-template 바탕) |
  | 학교운동부 현황 보고서 (admin.html 선택3) | `buildTeamReport(model, opts)` | `templates/team-report-template.hwpx` | jecheon-onepage-report 문체 |
  - `results-template.hwpx` 약속: 본문 문단 [0]=구역 설정, [1]=머리 제목표(○○○), [2]='○ 내용' 견본, [3]=7열 표(머리행 순위|배번|학교|이름|기록|비고|확인 + 견본행). 문서 = 제목(`{대회명} 경기 결과`, 여러 대회면 '대회 결과') + 종목/부문마다 '○ 종목 (N명)' 문단·표(기록 빠른 순, 기록 없으면 배번 순, 순위는 results.rank 우선 없으면 기록 순서·같은 기록 같은 순위) + 맨 아래 '※ 기록은 초 단위(소수점 이하 버림)'. admin.html은 JSZip CDN과 `hwpx-docs.js`를 불러옴
- 서식 파일이 없으면 그 탭의 버튼은 "서식 파일 필요"로 꺼짐 (`HwpxDocs.hasTemplate`)
- 화면 미리보기(`genDoc` → `HwpxDocs.previewHtml`)와 hwpx는 같은 모델(`planModel`/`detailModel`/`onepageModel`)에서 만들어 내용이 같음
- `templates/`는 누구나 받을 수 있는 경로 → **견본 문구('○○○', '내용')만 남긴 정리본**만 둔다. 실명·학교 명단·연락처·작성자 메타데이터(`content.hpf`) 금지, `Preview/PrvText.txt` 비움, `Preview/PrvImage.png` 흰 그림
  - `plan-template.hwpx`: 스킬 assets/template.hwpx를 정리 — 표지(글상자 2줄 '○○○'), '2026.  ○.', 머리 제목표, Ⅰ~Ⅶ 장 제목표마다 견본 문단 1개, Ⅳ 라벨 문단(행사명·주제·일시·장소·대상·- 내용·주최/주관), Ⅴ(참가 부문 및 제한 / - 내용 / 참가 신청 / 세부일정표 + 표[제목행·머리행·견본행] / ※), Ⅵ 예산표[머리행·견본행·합계행]
  - `detail-template.hwpx` 약속: 표지 글상자 2줄(○○○), '2026.  ○.', 머리 제목표(○○○), 견본 문단 '1. ○○○' '가. 내용' '- 내용' '□ ○○○' '○ 내용' '※ 내용', 머리행에 '종별'·'시간'·'학교명'이 있는 표 3개(학교명 표는 마지막 행이 합계행)
  - `onepage-template.hwpx` 약속(스킬과 같음): 본문 문단 [0]=제목표(제목 칸 colSpan≥6, '일자'·'부서' 칸) [1]=빈 줄 [2]=장 제목 견본 [3]=본문 견본 [5]=장 사이 빈 줄
- 한글 프로그램이 없는 환경이라 화면 확인은 못 함 → 만든 파일은 한글에서 표·줄바꿈·쪽수 확인 필요

> `README.md`는 초기 설정 안내서이며 일부 내용(`results-data.js` 등)은 현재 구조와 다릅니다. 결과는 이제 Supabase `results` 테이블로 관리됩니다.

## Supabase

- 프로젝트 ref: `whlkngqhbszxxdmhnilx`
- 클라이언트: `import { createClient } from "https://esm.sh/@supabase/supabase-js@2"` (각 JS에서 개별 생성)
- 테이블: `applications`, `bulk_applications`, `results`, `guidelines`, `school_pe_posts`
- RPC: `get_recorder_roster(comp)` — 기록원용 명단(개인정보 제외, `id, sport, bib_number, school, name`)
- RPC: `get_public_schedule()` — contest.html 대회 일정용. `admin_projects`·`admin_tasks` 중 `is_public = true`이고 날짜가 있는 행만 `title, event_date, place, kind, source`로 반환(SECURITY DEFINER). 두 테이블에 `is_public boolean default false` 칸 필요. 업무실 사업 상세 화면(`#pubnow`, 누르면 바로 저장)과 사업·할 일 수정 창(`pubBox`)에 '홈페이지 대회 일정에 공개' 체크 — 칸이 있을 때만 표시(`S.pubCol`: loadAll에서 `select('is_public')`로 확인)
- RPC: `get_public_results(comp)` — 결과 페이지용. applications ⟕ results, 반환 `application_id, competition, sport, bib_number, school, name, grade, rank, record_time, note` (배번순)
- 권한은 **RLS 정책이 실제 보안**이며, 화면의 이메일 체크·PIN은 보조 장치일 뿐입니다.
  - 관리자 전용 작업: `authenticated` + `auth.jwt() ->> 'email' = 'dkjy0906@gmail.com'`
  - `results`: SELECT 공개, DELETE는 관리자 전용(기록원 삭제를 쓰려면 별도 정책 필요). INSERT/UPDATE는 관리자 + 기록원(public) 항상 허용 — `recorder_open()`이 항상 true. 기간 제한을 다시 쓰려면 함수 본문을 `recorder_windows` 기간 검사로 되돌리면 됨
- **주의:** RLS로 UPDATE/DELETE가 막히면 Supabase는 오류 없이 0건만 처리합니다. 결과 확인이 필요하면 `.select()`로 처리된 행을 돌려받아 개수를 확인하세요.

### `results` 테이블 요점
- 주요 컬럼: `id`, `competition`(대회명), `division`(종목/부문), `rank`, `record_time`, `name`, `note`, `applications_id`
- `applications_id`에 UNIQUE 제약 → 기록원 페이지는 `upsert(..., { onConflict: "applications_id" })`로 저장
- 대회명 목록은 `recorder.html` select, `script.js`의 `KNOWN_COMPETITIONS`, `apply.js`의 `SPORT_OPTIONS`에 각각 하드코딩되어 있어 대회 추가 시 모두 수정해야 합니다.

## 경기기록원(`recorder.html` + `recorder.js`) 동작
- 기록 저장은 항상 가능 (PIN으로만 입장). 저장 오류에 'row-level security'가 나오면 "저장 권한 오류가 났습니다. 관리자에게 알려 주세요."로 표시(`friendlyError`)
- PIN(6680) 입장 후 맨 위 탭 2개(`filter-btn`): "기록 입력" / "대회 결과 (실명 확인)"
- "대회 결과 (실명 확인)" 탭은 results.html과 같은 마크업(검색칸·대회/종목 버튼·표·`#recordOverlay`)에 `script.js`를 그대로 불러옴. 그 앞에 `window.RESULTS_SHOW_FULL_NAMES = true`를 두어 표·카드 모두 실명 표시. 탭을 열 때마다 `results:reload` 이벤트로 다시 불러와 방금 입력한 기록 반영
- 대회 선택 → RPC로 명단 로드 → 종목 선택 → 기존 `results`와 `applications_id`로 매칭해 배번순 표시
- 기록 입력은 숫자만: `1212` → `12:12`, `11212` → `1:12:12` (`parseTimeInput`)
- 기록 칸을 비우고 저장(개별/전체)하면 저장된 `results` 행을 삭제하고 입력칸·비고칸을 비움. 저장된 행이 없으면 조용히 넘어감.
- 배번 검색 중에는 화면에 표시된 행만 "전체 저장" 대상
- 기록 한꺼번에 붙여넣기(`recPasteText`): [기록 칸에 채우기](`applyPastedRecords`, 채운 인원 수 반환)는 저장하지 않음. [입력한 기록 전체 저장]을 누를 때 붙여넣기 상자에 아직 채우지 않았거나 채운 뒤 바뀐 내용이 있으면 먼저 채운 뒤 이어서 저장 (`lastAppliedPaste`에 대회·종목·내용을 기억해 같은 내용이면 다시 채우지 않음 → 채운 뒤 표에서 고친 값 유지). 붙여넣기 내용이 있는데 0명 채워지면 저장하지 않고 빨간 안내
- 전체 저장: 오류가 하나라도 있으면 명단을 다시 불러오지 않아 입력값이 그대로 남음. 모두 성공했을 때만 다시 불러오고(분홍 표시 해제) 붙여넣기 안내도 "○명 저장 완료"로 바꿈
- "기록 한꺼번에 붙여넣기"(접이식 `#recPaste`): 여러 기록원이 모은 결과표(순위·이름/번호·기록·1위와 차이)를 붙여넣고 "기록 칸에 채우기" → `applyPastedRecords`. 이름/번호 칸에 이름이 같이 적혀 있어도 번호(숫자)만 배번으로 뽑음(`extractBib`): `14번`·`#14`·`No.14`·`번호 14`처럼 표시된 숫자를 우선, 없으면 숫자가 하나일 때만 사용(여럿이면 추측하지 않고 "읽지 못한 줄"로 안내). 맨 앞 순위(`1`, `1위`)는 제외하고, 이름·번호가 다른 칸에 나뉘어 있어도 됨. 기록(`12:34.56`, `1:02:03.4`)은 소수점 아래를 **버려** 초 단위로 변환(`12:34`, `1:02:03`; `formatRecord`는 `parseTimeInput`과 같은 표기). 선택한 종목 명단에서 배번이 같은 행의 기록 칸에만 채우고 **저장은 하지 않음**(확인 후 "전체 저장"). 제목 줄은 무시, 명단에 없는 배번·중복 배번·읽지 못한 줄·덮어쓴 기존 기록은 안내 문구로 표시. 배번 검색 중이면 검색을 풀고 채움

## 대회 결과(`results.html` + `script.js`) 동작
- **보기 방식**: 시간표(`timetables.json`)가 있는 대회(지금은 '충북교육감기 육상대회')만 대회 버튼 아래에 '종목별 보기' / '시간별 보기' 버튼이 생김(없는 대회는 기존처럼 종목 버튼만). 종목별 보기: 종목 이름이 "종목 부별"(예: `100m 남초5`)이고 종목이 여러 부별로 나뉘면 2단(종목 버튼 → 부별 버튼)으로 정리, 아니면 기존 한 줄. 시간별 보기(`renderTimetable`): 일차 탭 + 구분(전체/트랙/필드) + 시간순 표(시간·구분·종목·부별·**참가 학생(이름+학교·학년)**·단계·인원), 행을 누르면 그 종목 참가자 목록으로 이동(계주는 `4x100mR 초등`·`혼성계주 초등` 식으로 급별에 연결 — `sportKeyOf`). 시간표 데이터 형식: `{"대회명": {title, place, note, rows:[{day,date,kind,time,event,bu,stage}]}}`, 원본은 '경기일정표' 시트를 변환한 것이라 일정이 바뀌면 이 파일을 갱신. 이 동작은 recorder.html 결과 탭에도 똑같이 적용
- 대회 버튼 → `get_public_results` 로 참가자 전체 로드 → 종목(`sport`) 버튼 → 배번순 표 (배번/학교/학년/이름/기록/비고, 기록 없으면 `-`; 학년은 RPC의 `grade`, 기념촬영 카드에는 학교 옆에 함께 표시)
- **공개 기준(모든 대회 공통, 개인정보 보호)**: 성명은 첫·끝 글자만 남기고 가운데 모두 O(`maskName`: 홍길동→홍O동, 이소→이O, 남궁민수→남OO수; 이미 가린 값은 그대로), 학년은 공개·**반은 비공개**(`gradeOnly`: "5학년 2반"→"5학년", "5-2"→"5학년"), 소속 학교·배번은 공개. 표·기념촬영 카드·시간표·출전선수 엑셀(이름·학교·학년·배번 열, 반 열 없음)이 모두 `displayName`/`gradeText`를 거침. 검색도 가린 이름 기준(예: `홍O동`). DB에는 실명이 그대로 있고 경기기록원·관리자·업무실은 업무용이라 실명.
  - 데이터 호출: 공개 화면은 RPC `get_public_results_safe(comp)`(가린 이름·반 뺀 학년, 모든 칸 text). **없거나 오류이면 `get_public_results`로 다시 불러오고 화면에서 같은 기준으로 가림(예비 처리)**. `window.RESULTS_SHOW_FULL_NAMES = true`(경기기록원 결과 탭)이면 `get_public_results` + 실명·원래 학년(`FULL`).
  - 칸이 text 로 오므로 `normRow`가 배번은 숫자(`normBib`)·application_id 는 문자열로 맞추고 `byBib`가 숫자로 정렬(1·2·10 순). 예전 대회별 가림 설정(`MASKED_COMPETITIONS`·`maskSecondChar`·`MASK_PUBLIC_NAMES`)은 삭제.
  - 공개 화면의 '누구나 기록 입력'은 가린 이름으로 DB 실명을 덮어쓰지 않도록 이름 없이 기존 `results` 행만 update(행이 없을 때만 insert), `FULL`(기록원 탭)은 기존대로 upsert.
  - results.html 아래에 개인정보 안내 문구(`.privacy-note`) 표시.
- window에 `results:reload` 이벤트를 보내면 보고 있던 종목을 유지한 채 다시 불러옴
- `?competition=대회명` 쿼리로 대회 미리 선택 (`contest.html`의 "현황보기" 링크가 사용), `&view=time`을 더하면 시간표가 있는 대회에서 시간별 보기로 바로 열림(처음화면 한시 배너가 사용)
- 검색칸: 숫자는 배번 앞자리 일치, 그 외는 이름 포함 검색. 검색 중에는 종목과 관계없이 대회 전체에서 찾음
- 배번·이름 클릭 → 기념촬영용 전체화면 카드(`#recordOverlay`, CSS `.record-*`). 닫기 버튼·ESC·바깥 클릭으로 닫힘, 휴대폰 가로 화면은 2열 배치
  - 카드 맨 위 대회 표기는 `script.js`의 `COMPETITION_DISPLAY_NAMES`(DB 대회명 → 표기 이름)에서 지정, 없으면 DB 대회명 그대로
  - 전체화면 버튼(Fullscreen API, 미지원 브라우저에서는 숨김). 전체화면 중 ESC는 전체화면만 해제하고 카드는 유지
  - 좌/우 화살표·좌우 스와이프로 현재 표에 보이는 참가자 사이 이동, 열린 동안 뒤 화면 스크롤 잠금, 인쇄 시 카드만 출력

## 작업 규칙
- 사용자 대상 문구·주석은 한국어로 작성 (기존 코드 스타일 유지)
- 의존성 추가/빌드 도구 도입 없이 정적 파일만으로 유지
- DB 스키마·RLS 변경은 코드 커밋으로 반영되지 않으므로 필요한 SQL을 별도로 안내/적용

## 화면 캡처 기반 수정 요청 처리 절차
사용자가 사이트 화면 캡처와 함께 수정을 요청하면 다음 순서로 끝까지 진행합니다.
1. **페이지 찾기** — 캡처의 제목·버튼 문구·주소(URL)로 위 "파일 구조" 표에서 해당 HTML/JS/CSS 파일을 찾습니다. 애매하면 문구를 `grep`으로 검색합니다.
2. **수정** — 해당 파일만 최소한으로 고칩니다. JS를 고쳤으면 `node --input-type=module --check < 파일.js`로 문법 확인.
3. **브라우저 확인** — `python3 -m http.server`로 띄운 뒤 Playwright(설치된 Chromium)로 해당 페이지를 열어 바뀐 화면·동작을 확인하고 스크린샷을 찍습니다. Supabase 접속이 안 되는 환경이면 `page.route`로 응답을 흉내 내어 확인합니다. 휴대폰 화면(가로 390px 안팎)도 함께 봅니다.
4. **커밋·PR·병합** — 작업 브랜치(`claude/...`)에 커밋하고 푸시합니다. 푸시하면 `.github/workflows/auto-merge-claude.yml`이 PR을 만들고 main에 자동 병합하며, Vercel이 자동 배포합니다. 워크플로가 실패하면 직접 PR을 만들어 병합합니다. 병합 후 Actions 결과와 main 반영 여부를 확인합니다.
5. **보고** — 결과는 쉬운 말로 짧게 알려줍니다. (무엇을 바꿨는지, 어디서 확인하면 되는지, 1~3줄. 코드 용어는 되도록 쓰지 않음)

> DB(Supabase) 구조나 권한 변경이 필요한 수정은 자동 병합 전에 사용자에게 먼저 알립니다.
