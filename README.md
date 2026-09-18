# 마이스포츠클럽 — 학교스포츠클럽대회 사이트

정적 HTML 사이트입니다. 별도 빌드 과정이 없어 GitHub에 올리고 Vercel에 연결하면 바로 배포됩니다.

## 파일 구성

- `index.html` — 홈 (대회 소개, 일정, 종목)
- `apply.html` — 참가 신청 (구글폼 연결)
- `results.html` — 대회 결과 (종목별 필터)
- `results-data.js` — **결과를 올릴 때 이 파일만 수정하면 됩니다**
- `style.css`, `script.js` — 디자인 및 결과 페이지 동작 (수정 불필요)

## 1. 구글폼 연결하기 (참가 신청)

1. https://forms.google.com 에서 신청서를 만듭니다.
2. 완성 후 우측 상단 **보내기** → **미리보기(<>) 아이콘** 클릭
3. 표시되는 `<iframe src="...">` 코드에서 `src="..."` 안의 주소만 복사
4. `apply.html` 파일을 열어 주석 처리된 iframe 블록에서:
   - `SRC_HERE` 를 복사한 주소로 교체
   - 그 위/아래에 있는 `<!--`, `-->` 주석 기호를 지워서 iframe이 보이게 함
   - `<div class="placeholder">...</div>` 블록은 삭제

## 2. 대회 결과 올리기

`results-data.js` 파일만 열어서 수정하면 됩니다. 코드 지식이 없어도 아래 패턴을 복사-붙여넣기 하면 됩니다.

```js
{
  sport: "축구",           // 종목명
  division: "남자부",       // 부문 (없으면 빈 문자열 "")
  date: "2026.04.15",      // 경기 날짜
  entries: [
    { rank: 1, name: "3학년 2반", note: "결승 3:1 승" },
    { rank: 2, name: "3학년 5반", note: "" },
  ],
},
```

- 아직 결과가 없는 종목은 `entries: []` 로 두면 "결과 발표 예정"이 자동 표시됩니다.
- 저장 후 GitHub에 다시 업로드(커밋)하면 Vercel이 자동으로 재배포합니다.

## 3. GitHub에 올리기

1. https://github.com 에서 새 저장소(New repository)를 만듭니다. (Public/Private 무관)
2. 이 폴더의 파일 전체를 저장소에 업로드합니다.
   - GitHub 웹사이트에서 "Add file → Upload files"로 드래그 앤 드롭 해도 되고,
   - git 명령어를 쓸 줄 안다면 `git init` → `git add .` → `git commit` → `git push` 로 진행해도 됩니다.

## 4. Vercel로 배포하기

1. https://vercel.com 에서 GitHub 계정으로 가입/로그인
2. 대시보드에서 **Add New → Project**
3. 방금 만든 저장소를 선택해 Import
4. Framework Preset은 **Other**(정적 사이트) 그대로 두고 **Deploy** 클릭
5. 배포가 끝나면 `프로젝트명.vercel.app` 주소로 접속되는지 확인

## 5. 가비아 도메인 연결하기

1. Vercel 프로젝트 → **Settings → Domains** → 구매한 도메인 입력 후 Add
2. Vercel이 안내하는 A레코드(보통 `76.76.21.21`)와 www용 CNAME(`cname.vercel-dns.com`) 값 확인
3. 가비아 → My가비아 → **DNS 관리툴** → 해당 도메인 **설정 → 레코드 수정 → 레코드 추가**
   - 호스트 `@` / 타입 `A` / 값 `76.76.21.21`
   - 호스트 `www` / 타입 `CNAME` / 값 `cname.vercel-dns.com`
4. 저장 후 Vercel Domains 탭에서 상태가 **Valid Configuration**으로 바뀌는지 확인 (최대 24~48시간 소요 가능)
5. 구매한 도메인으로 접속해 정상 작동하는지 테스트

## 앞으로 대회 종목/일정을 바꾸려면

`index.html`의 "참가 종목", "주요 일정" 부분 텍스트를 직접 수정하면 됩니다. 구조를 바꾸지 않고 글자만 고치는 정도는 메모장으로도 가능합니다.
