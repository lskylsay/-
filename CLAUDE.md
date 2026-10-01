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
| `index.html` | — | 홈 (대회 소개, 일정, 종목) |
| `contest.html` | — | 대회 안내 |
| `apply.html` | `apply.js` | 참가 신청 (개인 / 트랙마라톤 교사 일괄 엑셀 신청) → `applications`, `bulk_applications`, storage `bulk-uploads` |
| `admin.html` | `admin.js` | 관리자 (GitHub OAuth 로그인, `ADMIN_EMAIL`만): 신청 관리·배번 등록, 대회 결과 관리(엑셀 업로드), 대회요강·학교체육 게시글 업로드 |
| `recorder.html` | `recorder.js` | 경기기록원 기록 입력 (PIN 입장, 로그인 없이 anon 키로 동작) |
| `results.html` | `script.js` | 대회 결과 공개 조회 (RPC `get_public_results`) |
| `guidelines.html` | `guidelines.js` | 대회요강 게시판 (`guidelines`, storage `guideline-files`) |
| `schoolpe.html`, `schoolpe-*.html` | `schoolpe-board.js` | 학교체육업무지원 게시판. 각 페이지가 `window.SCHOOLPE_CATEGORY`를 지정 (`school_pe_posts`, storage `schoolpe-files`) |

공통 파일:
- `config.js` — `window.SUPABASE_URL`, `SUPABASE_ANON_KEY`(publishable 키, 공개돼도 되는 값), `ADMIN_EMAIL`. 모든 데이터 페이지에서 모듈 스크립트보다 먼저 `<script src="config.js">`로 로드.
- `dropzone.js` — 드래그앤드롭 파일 첨부 유틸 (`initDropzone`)
- `storage-key.js` — Storage 키를 영문·숫자로 안전하게 생성 (`safeStorageKey`), 원래 파일명은 DB `file_name`에 저장
- `style.css` — 전체 공통 스타일 (CSS 변수 `--ink`, `--line`, `--font-mono` 등)
- `*-template.xlsx` — 신청/결과 업로드용 엑셀 양식 (admin에서 SheetJS `xlsx@0.18.5` CDN 사용)

> `README.md`는 초기 설정 안내서이며 일부 내용(`results-data.js` 등)은 현재 구조와 다릅니다. 결과는 이제 Supabase `results` 테이블로 관리됩니다.

## Supabase

- 프로젝트 ref: `whlkngqhbszxxdmhnilx`
- 클라이언트: `import { createClient } from "https://esm.sh/@supabase/supabase-js@2"` (각 JS에서 개별 생성)
- 테이블: `applications`, `bulk_applications`, `results`, `guidelines`, `school_pe_posts`
- RPC: `get_recorder_roster(comp)` — 기록원용 명단(개인정보 제외, `id, sport, bib_number, school, name`)
- RPC: `get_public_results(comp)` — 결과 페이지용. applications ⟕ results, 반환 `application_id, competition, sport, bib_number, school, name, grade, rank, record_time, note` (배번순)
- 권한은 **RLS 정책이 실제 보안**이며, 화면의 이메일 체크·PIN은 보조 장치일 뿐입니다.
  - 관리자 전용 작업: `authenticated` + `auth.jwt() ->> 'email' = 'dkjy0906@gmail.com'`
  - `results`: SELECT 공개, INSERT/UPDATE는 기록원용으로 public 허용, DELETE는 관리자 전용(기록원 삭제를 쓰려면 별도 정책 필요)
- **주의:** RLS로 UPDATE/DELETE가 막히면 Supabase는 오류 없이 0건만 처리합니다. 결과 확인이 필요하면 `.select()`로 처리된 행을 돌려받아 개수를 확인하세요.

### `results` 테이블 요점
- 주요 컬럼: `id`, `competition`(대회명), `division`(종목/부문), `rank`, `record_time`, `name`, `note`, `applications_id`
- `applications_id`에 UNIQUE 제약 → 기록원 페이지는 `upsert(..., { onConflict: "applications_id" })`로 저장
- 대회명 목록은 `recorder.html` select, `script.js`의 `KNOWN_COMPETITIONS`, `apply.js`의 `SPORT_OPTIONS`에 각각 하드코딩되어 있어 대회 추가 시 모두 수정해야 합니다.

## 경기기록원(`recorder.js`) 동작
- 대회 선택 → RPC로 명단 로드 → 종목 선택 → 기존 `results`와 `applications_id`로 매칭해 배번순 표시
- 기록 입력은 숫자만: `1212` → `12:12`, `11212` → `1:12:12` (`parseTimeInput`)
- 기록 칸을 비우고 저장(개별/전체)하면 저장된 `results` 행을 삭제하고 입력칸·비고칸을 비움. 저장된 행이 없으면 조용히 넘어감.
- 배번 검색 중에는 화면에 표시된 행만 "전체 저장" 대상

## 대회 결과(`results.html` + `script.js`) 동작
- 대회 버튼 → `get_public_results` 로 참가자 전체 로드 → 종목(`sport`) 버튼 → 배번순 표 (배번/학교/이름/기록/비고, 기록 없으면 `-`)
- 표의 이름은 `maskName`으로 가운데 글자를 O로 가림 (홍길동 → 홍O동, 이소 → 이O, 남궁민수 → 남OO수). 검색은 실제 이름으로, 기념촬영 카드는 전체 이름 표시
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
