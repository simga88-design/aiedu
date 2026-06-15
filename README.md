# AI 아이디어 캔버스

AI 교육 시간에 약 25명의 수강생이 아이디어를 올리고, 서로 이어 쓰고, AI 프롬프트로 발전시키는 실시간 협업 보드입니다.

## 핵심 흐름

- 수강생이 이름, 한 줄 생각, 짧은 설명을 입력해 아이디어를 올립니다.
- 다른 수강생은 선택한 아이디어에 이어 쓰면서 새 가지를 만듭니다.
- 선택한 아이디어는 AI 프롬프트로 바로 다듬을 수 있습니다.
- 수정과 실험 완료 기록이 남아 수업 중 발전 과정을 함께 볼 수 있습니다.
- Supabase 환경 변수가 없으면 로컬 미리보기 데이터로 동작합니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## Supabase 설정

1. Supabase 프로젝트를 만듭니다.
2. Supabase SQL Editor에서 `supabase-schema.sql`을 실행합니다.
3. Vercel 프로젝트 환경 변수에 아래 값을 추가합니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_CLASS_ROOM_ID=ai-class-live
```

`NEXT_PUBLIC_CLASS_ROOM_ID`를 수업마다 다르게 지정하면 수업별 보드를 분리할 수 있습니다.

## Vercel 배포

1. 저장소를 GitHub에 올립니다.
2. Vercel에서 프로젝트를 연결합니다.
3. Supabase 환경 변수를 Vercel 프로젝트에 등록합니다.
4. 배포 URL을 수강생에게 공유합니다.

## 주요 파일

- `app/page.tsx`: 수강생 중심 실시간 아이디어 캔버스 UI
- `app/globals.css`: 반응형 레이아웃과 인터랙션 스타일
- `lib/realtime-board.ts`: Supabase 클라이언트, 타입, 로컬 미리보기 데이터
- `supabase-schema.sql`: Supabase 테이블, RLS 정책, Realtime 설정
