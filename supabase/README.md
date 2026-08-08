# Supabase 설정 가이드

## 1. Supabase 프로젝트 생성

1. [Supabase Dashboard](https://supabase.com/dashboard)에서 새 프로젝트를 만듭니다.
2. **Project Settings → API**에서 아래 값을 복사합니다.
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (서버 전용, 절대 클라이언트에 노출 금지)

## 2. 환경변수

프로젝트 루트에 `.env.local` 파일을 만들고 `.env.local.example`을 참고해 값을 채웁니다.

```bash
cp .env.local.example .env.local
```

## 3. DB 마이그레이션

### Production (신규 빈 Supabase)

**→ [`PRODUCTION_DEPLOYMENT.md`](./PRODUCTION_DEPLOYMENT.md)** — Step 1~15 전체 순서, Step 10 owner 오류 대응, test seed 분리.

적용 후 검증:

```bash
npm run production:verify-schema
npm run migration:static-audit
```

### 로컬 / 테스트 DB (개발용)

Supabase Dashboard → **SQL Editor**에서 migration을 **순서대로** 실행합니다.  
`002_fix_service_role_grants.sql`은 **004 이후** (파일명 002 ≠ 실행 순서 2).  
Production에서는 Step 15 `014_production_service_role_grants.sql` 권장.

> **SaaS 전용:** 007~014는 **신규 Supabase 프로젝트**에만 실행하세요. 운영 redone DB에는 실행하지 마세요.

### 참여체크 시작 실패 시

「시작에 실패했습니다」 또는 `PGRST205 — Could not find the table 'public.boss_events'` 가 뜨면 **002_participation.sql 이 아직 실행되지 않은 상태**입니다.

1. Supabase Dashboard → **SQL Editor** → **New query**
2. 로컬 `supabase/migrations/002_participation.sql` **파일 전체**를 복사해 붙여넣기
3. **Run** 실행 (성공 메시지 확인)
4. (선택) **002_fix_service_role_grants.sql** 실행
5. 앱 페이지 **새로고침** 후 참여체크 다시 시작

**002를 실행했는데도** `PGRST205` / `boss_events 테이블이 없습니다` 가 계속 나오면:

1. `.env.local` 의 `NEXT_PUBLIC_SUPABASE_URL` 이 **migration을 실행한 Supabase 프로젝트**와 같은지 확인
2. SQL Editor에서 **002_reload_schema.sql** 실행 (스키마 캐시 갱신 + 테이블 목록 확인)
3. 위 SELECT 결과에 `boss_events` 가 **없으면** 002_participation.sql 이 실패한 것 — SQL Editor 하단 **에러 메시지** 확인 후 다시 실행

추가 확인:

1. `.env.local` 의 **SUPABASE_SERVICE_ROLE_KEY** 가 Dashboard → API → **service_role** 키인지 (anon 키 아님)
2. 개발 서버(`npm run dev`) 재시작

### 현재 코드 연결 상태

| 영역 | DB migration | 앱 연결 |
|------|-------------|---------|
| members / Auth | 001 | ✅ 연결됨 |
| 보스타임 참여 | 002 | ✅ 연결됨 |
| 공성 참여 | 002 | ✅ 연결됨 |
| 정산 | 003 | ✅ 연결됨 |
| 혈비 / 지출 / 장부 | 004 | ✅ 연결됨 |

## 4. 운영 배포 전 초기화

테스트 데이터 전체 삭제 및 운영 최고관리자 1명 생성:

```bash
# 1) 삭제 예정 row count 확인 (실제 삭제 없음)
npm run prepare-production

# 2) 승인 후 실행 (.env.local에 INITIAL_ADMIN_PASSWORD 등 설정)
ALLOW_PRODUCTION_RESET=YES_DELETE_TEST_DATA npm run prepare-production -- --execute
```

- 비밀번호·reset flag는 `.env.local`에만 두고 Git commit 하지 마세요.
- 공개 bootstrap/reset API는 제공하지 않습니다.

## 5. 최초 관리자 계정 (수동)

운영 환경에서는 `/api/bootstrap/first-admin` API를 제공하지 않습니다.

최초 admin 계정은 **로컬 개발 시 Supabase Dashboard**에서 Auth 사용자와 `members` 레코드를 직접 준비하거나, 이미 admin으로 로그인한 상태에서 **관리자 → 혈맹원 추가**로 생성합니다.

신규 admin 혈맹원 추가 시 프로그램 권한을 `admin`으로 설정하면 됩니다.

## 5. Auth 설정 (Supabase Dashboard)

**Authentication → Providers → Email** 에서 Email provider가 활성화되어 있어야 합니다.

가상 이메일(`*@redone.local`)은 사용자에게 노출되지 않으며, **혈맹 코드 + 캐릭터명** 로그인만 UI에 표시됩니다.

## 7. Phase 1 테스트 (RED / BLUE)

```bash
npm run phase1:seed-test-guilds
npm run phase1:verify-isolation
```

문서 본문 §24 (A~J) 시나리오를 순서대로 진행합니다.
