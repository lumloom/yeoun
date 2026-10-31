# Yeoun (여운)

> 경험이 지나간 자리에 남는 것들.  
> A quiet home for what stays with you.

책, 영화, 시리즈, 게임을 경험한 뒤 남은 생각을 여러 개의 기록으로 쌓는 로컬 우선 개인 아카이브입니다. 로그인 없이도 브라우저 안에서 작동하며, 원할 때 Lumloom 계정 동기화를 사용할 수 있습니다.

**서비스:** https://lumloom.github.io/yeoun/

## 구현된 기능

- Books / Movies / Series / Games 통합 라이브러리와 반응형 이미지 카드
- 차분한 `서재 모드`와 밝은 `상큼 모드` 전환 및 선택 기억
- 제목만으로 가능한 작품 등록, 수정, 삭제
- 모바일 카메라 촬영·사진 보관함 업로드(IndexedDB Blob), 외부 이미지 URL, 유형별 기본 커버
- 작품별 여러 기록의 생성, 조회, 수정, 삭제
- 기록 유형, 날짜, 선택 제목, Markdown을 쓸 수 있는 일반 텍스트 본문
- 새 기록 작성 중 브라우저 임시 저장
- 제목·태그 검색, 미디어 필터, 최근 기록·제목·등록일 정렬
- 작품별 Markdown 내보내기(업로드 이미지가 있으면 ZIP)
- Obsidian 저장 성공 콜백과 `Lumloom` Vault 확인 실패 안내
- 전체 라이브러리의 Obsidian 호환 Markdown ZIP 내보내기
- 이미지까지 포함하는 전체 JSON 백업과 교체 복원
- Lumloom 계정 로그인, 기존 기록 수동 업로드, 충돌 선택 및 기록·표지 사진 기기간 동기화
- 모바일·태블릿 전체 화면 등록/작성 흐름, 고정 저장 버튼 및 키보드 접근성

## 기술과 파일 구조

```text
Yeoun/
├─ src/
│  ├─ App.tsx          # 라이브러리, 상세, 작품/기록 편집 UI
│  ├─ db.ts            # IndexedDB 저장 계층과 연쇄 삭제
│  ├─ exporters.ts     # Markdown, ZIP, JSON 백업/복원
│  ├─ obsidianHandoff.ts # Obsidian 저장 요청과 성공 콜백 확인
│  ├─ sync.ts          # Lumloom 계정 기록·이미지 동기화
│  ├─ exporters.test.ts
│  ├─ types.ts         # MediaItem, MediaNote, StoredAsset 모델
│  └─ styles.css       # 브랜드 스타일과 반응형 레이아웃
├─ .openai/hosting.json
├─ index.html
├─ package.json
└─ vite.config.ts
```

`MediaItem`과 `MediaNote`는 ID로 연결하고, 이미지 Blob은 IndexedDB의 `assets` 저장소에 별도로 둡니다. 따라서 이미지 때문에 localStorage 용량이 급격히 소모되지 않습니다. Lumloom 계정으로 로그인하면 작품·기록 데이터와 업로드한 표지 이미지가 Supabase에 동기화됩니다.

## 실행 및 빌드

PowerShell 또는 cmd에서 가상환경 활성화 없이 다음 명령을 실행합니다.

```powershell
cd C:\Users\lmj89\Documents\Codex\Yeoun
npm.cmd install
npm.cmd run dev
```

프로덕션 빌드:

```powershell
npm.cmd run build
```

결과는 `dist/`에 생성됩니다. 단위 테스트는 `npm.cmd test`로 실행합니다.

## 저장, Markdown, JSON

- 앱 데이터는 브라우저별 IndexedDB `yeoun-archive`에 저장됩니다.
- Markdown은 작품 메타데이터를 YAML frontmatter로, 모든 기록을 날짜순 본문으로 만듭니다.
- 전체 ZIP은 `Books`, `Movies`, `Series`, `Games`, `assets` 폴더를 만들며 중복 제목도 덮어쓰지 않습니다.
- 업로드 이미지는 ZIP에 실제 파일로 포함되고 Markdown은 상대 경로를 사용합니다.
- 외부 이미지 URL은 원격 링크로 남습니다. 원격 서버 정책 때문에 이미지를 ZIP에 강제로 내려받지는 않습니다.
- JSON은 앱을 그대로 복원하기 위한 형식이며 이미지 Blob도 데이터 URL로 직렬화합니다. Markdown은 장기 열람 및 Obsidian 이동용입니다.
- Markdown은 공통 `lumloom-record/v1` frontmatter와 작품별 안정적인 `lumloom_id`를 사용합니다.
- `Obsidian에 저장`은 작품의 텍스트 기록을 `Lumloom` Vault의 `01. 수집함/Yeoun`에 새 파일로 요청합니다.
- 로컬 Blob 표지는 Obsidian URI에 실을 수 없습니다. 사진까지 보존하려면 작품 ZIP 또는 전체 Markdown ZIP을 사용합니다.
- 저장 요청의 고유한 `x-success` 콜백이 돌아오면 완료를 알립니다. 콜백이 없으면 Vault 이름 불일치, URI 차단, 사용자 취소 등을 구분할 수 없으므로 Markdown 저장 대안을 안내합니다.

## Lumloom 계정 동기화

- 로그인하지 않으면 모든 기록과 이미지는 현재 브라우저의 IndexedDB에만 남습니다.
- 처음 로그인한 뒤 `기존 기록 올리기`를 눌러야 이 기기의 기존 자료가 클라우드에 등록됩니다.
- 같은 기록이 기기와 클라우드에서 모두 바뀌면 어느 쪽을 유지할지 앱에서 직접 선택합니다.
- 삭제 상태도 동기화되며, 기록과 업로드 표지 이미지는 기기 간에 복원됩니다.
- Markdown/ZIP/JSON 백업과 Obsidian 저장은 계정 동기화와 별도로 계속 사용할 수 있습니다.

## 외부 API와 후속 범위

Open Library, TMDB, 게임 메타데이터 검색 같은 외부 콘텐츠 API 없이도 핵심 기록 기능을 사용할 수 있습니다. 이 검색 기능들은 후속 범위로 남아 있습니다. TMDB처럼 비밀 키가 필요한 API를 추가할 때는 프런트엔드에 키를 넣지 말고 서버 프록시 또는 안전한 런타임 비밀 환경 변수를 사용해야 합니다.

후속 후보는 표지 검색, PWA/오프라인 셸, 고급 기록 탐색, 대용량 검색 인덱스입니다. 현재 Obsidian 연동은 사용자 클릭으로 URI를 여는 단방향 저장이며, Vault 파일을 읽거나 양방향 동기화하지 않습니다.

## Lumloom 홈페이지 연결

Yeoun은 독립적인 정적 웹앱입니다. Lumloom 프로젝트 목록에는 아래 메타데이터와 배포 URL만 추가하면 됩니다.

- Project: `Yeoun`
- Korean name: `여운`
- Category: `Personal Archive / Media Journal`
- English: `A quiet home for what stays with you.`
- Korean: `경험이 지나간 자리에 남는 것들.`

홈페이지 자체의 코드는 이번 범위에서 수정하지 않았습니다.
