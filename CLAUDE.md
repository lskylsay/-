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
| `index.html` | — | 홈 (대회 소개, 일정, 종목). 히어로 오른쪽 위에 "트랙마라톤 축제 대회 결과" 바로가기 QR카드(`.hero-qr`, `qr-trackmarathon-results.svg` → `results.html?competition=트랙마라톤 축제`). 휴대폰(640px 이하)에서는 환영 문구 아래로 내려 가로 배치. 히어로 가운데 위에는 앱 아이콘 묶음 `.hero-apps`(스톱워치 → 대진표 순, 둘 다 `.hero-stopwatch` 구조: 흰 원 + 글자)가 있고 누르면 각각 claude.ai 스톱워치 / 충청북도 학교스포츠클럽 대진표 생성 페이지가 새 창으로 열림. 위치는 `.hero-apps`가 담당(묶음 가운데가 가로 60%). 휴대폰에서는 QR카드 아래에 두 아이콘이 가로로 나란히 |
| `contest.html` | — | 대회 안내 |
| `apply.html` | `apply.js` | 참가 신청 (개인 / 트랙마라톤 교사 일괄 엑셀 신청) → `applications`, `bulk_applications`, storage `bulk-uploads` |
| `admin.html` | `admin.js` | 관리자 (GitHub OAuth 로그인, `ADMIN_EMAIL`만): 신청 관리·배번 등록, 대회 결과 관리(엑셀 업로드; 결과 표 열 순서는 대회·종목/부문·배번·학교·이름·기록·날짜·순위·비고·선택이며, 배번·학교는 결과의 `applications_id`로 `applications`(`bib_number`, `class_no`)를 200건씩 나눠 불러와 붙임(없으면 '-'), 정렬은 대회→종목/부문→배번(없으면 맨 뒤). '총 N건' 아래 줄에서 범위(대회 전체/대회별/체크한 기록만 — 체크하면 자동으로 '체크한 기록만', 체크가 없으면 '대회 전체')를 골라 **엑셀(.xlsx)**(SheetJS; '전체' 시트 + 종목/부문별 시트, 기록은 글자 그대로)·**한글(.hwpx)**(`HwpxDocs.buildResults`)로 내려받음, 0건이면 "내려받을 기록이 없습니다", 파일명 `대회결과_{대회명|전체|선택}_{YYYYMMDD}`. 맨 오른쪽 '전체선택' 체크 + '선택 삭제'로 한꺼번에 삭제 — 200건씩 나눠 지우고 실제 삭제된 행 수를 확인해 권한 문제로 0건 처리되면 알림), 대회요강·학교체육 게시글 업로드 |
| `workroom.html` | (파일 안에 내장) + `hwpx-docs.js` | 관리자 업무실 (admin.html 탭 줄의 "업무실" 링크). 단독 페이지로 자체 CONFIG(같은 Supabase 프로젝트·관리자 이메일)와 supabase-js UMD 사용. 사업·워크플로우, 일정·할일, 공문 초안, 대회 관리, 예산 → 테이블 `admin_projects`, `admin_tasks`, `admin_workflows`, `admin_budget`, `admin_documents` (모두 관리자 전용 RLS). 대회 관리에는 "경기기록원 기록 입력: 항상 가능" 안내만 표시. 사업·워크플로우 화면: '+ 새 사업'은 제목 줄 오른쪽에 두어 목록·상세·워크플로우 탭 어디서나 보임. 메뉴로 들어오면 항상 목록부터(`go('projects')`가 `S.selProject` 초기화), 오늘 화면에서 사업을 누르면 `go('projects', 사업id)`로 그 사업 상세 |
| `recorder.html` | `recorder.js` + `script.js` | 경기기록원 (PIN 입장, 로그인 없이 anon 키로 동작). 탭: 기록 입력 / 대회 결과(실명 확인) |
| `results.html` | `script.js` | 대회 결과 공개 조회 (RPC `get_public_results`) |
| `guidelines.html` | `guidelines.js` | 대회요강 게시판 (`guidelines`, storage `guideline-files`). `preview_path`(미리보기용 PDF)가 있으면 제목 클릭 시 화면 안 모달로 PDF 표시(원본 다운로드·닫기·Esc), 없으면 바로 다운로드 |
| `schoolpe.html`, `schoolpe-*.html` | `schoolpe-board.js` | 학교체육업무지원 게시판. 각 페이지가 `window.SCHOOLPE_CATEGORY`를 지정 (`school_pe_posts`, storage `schoolpe-files`) |

공통 파일:
- `config.js` — `window.SUPABASE_URL`, `SUPABASE_ANON_KEY`(publishable 키, 공개돼도 되는 값), `ADMIN_EMAIL`. 모든 데이터 페이지에서 모듈 스크립트보다 먼저 `<script src="config.js">`로 로드.
- `dropzone.js` — 드래그앤드롭 파일 첨부 유틸 (`initDropzone`)
- `storage-key.js` — Storage 키를 영문·숫자로 안전하게 생성 (`safeStorageKey`), 원래 파일명은 DB `file_name`에 저장
- `style.css` — 전체 공통 스타일 (CSS 변수 `--ink`, `--line`, `--font-mono` 등)
- `*-template.xlsx` — 신청/결과 업로드용 엑셀 양식 (admin에서 SheetJS `xlsx@0.18.5` CDN 사용)

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
- 대회 버튼 → `get_public_results` 로 참가자 전체 로드 → 종목(`sport`) 버튼 → 배번순 표 (배번/학교/이름/기록/비고, 기록 없으면 `-`)
- 이름은 표와 기념촬영 카드 모두 실명 표시 (`displayName`). 검색도 실명으로 동작
  - `script.js` 위쪽 `const MASK_PUBLIC_NAMES = false;`를 `true`로 바꾸면 `maskName`으로 가운데 글자를 O로 가림 (홍길동 → 홍O동, 이소 → 이O, 남궁민수 → 남OO수)
  - `script.js`보다 먼저 `window.RESULTS_SHOW_FULL_NAMES = true`를 두면 가림 설정과 관계없이 실명 (경기기록원 결과 탭에서 사용)
  - 이름 가림은 화면 표시만의 처리이며, `get_public_results`는 실명을 그대로 돌려줌
- window에 `results:reload` 이벤트를 보내면 보고 있던 종목을 유지한 채 다시 불러옴
- `?competition=대회명` 쿼리로 대회 미리 선택 (`contest.html`의 "결과보기" 링크가 사용)
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
