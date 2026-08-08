# redone-clan-manager-saas

멀티테넌트 SaaS 버전 (Phase 1: guilds / onboarding / login / RLS prototype)

> **운영 `redone-clan-manager` 및 운영 Supabase는 수정하지 마세요.**

## Phase 1 범위

- `guilds` 테이블 + `members.guild_id`
- `guild_code + nickname + password` 로그인
- 온보딩 Saga (DB → Auth API → DB, compensating rollback)
- `TenantContext` 기본 구조
- `members` RLS prototype (동일 guild만 SELECT)

## Supabase 설정

1. **신규 Supabase 프로젝트** 생성
2. SQL Editor에서 `supabase/migrations/001` ~ `007` 순서 실행
3. `.env.local.example` → `.env.local` 복사 후 API 키 입력

## Phase 1 테스트

```bash
npm install
npm run phase1:seed-test-guilds   # RED, BLUE + 각 "군주" 생성
npm run phase1:verify-isolation # 로그인 + RLS 격리 검증
```

## 온보딩 API

`POST /api/onboarding/create-guild`

```json
{
  "guildName": "레드 혈맹",
  "guildCode": "RED",
  "adminNickname": "군주",
  "password": "your-password"
}
```

## Auth identifier

- Supabase Auth email: `{memberUUID}@redone.local` (전역 UNIQUE, UI 비노출)
- 로그인 식별: `guild_code` + `nickname` → member 조회 → internal_email로 signIn
