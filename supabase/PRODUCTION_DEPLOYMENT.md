# Production Deployment — Fresh Supabase SQL Package

> **대상:** 신규 빈 Supabase 프로젝트 (production SaaS)  
> **금지:** 운영 redone DB, 현재 테스트 DB에 대한 자동 migration / seed  
> **원칙:** SQL Editor **수동 실행**, 파일 **전체** 복사·실행, **오류 시 중단**

---

## 실행 전 checklist

1. Supabase Dashboard → 새 프로젝트 생성 (production 전용)
2. Vercel production env에 아래 3개만 설정 (테스트 password env 불필요):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. `.env.local`은 **로컬 개발/테스트** 전용 — production URL/키와 분리
4. **fixture seed 스크립트 실행 금지** (`npm run phase1:seed-test-guilds` 등)

---

## “이미 존재” / 재실행 원칙

| 상황 | 조치 |
|------|------|
| `relation already exists`, `policy already exists` (IF NOT EXISTS / DROP IF EXISTS 후) | 해당 step이 **완전히** idempotent하면 계속. **확실하지 않으면 중단** |
| `duplicate key`, `constraint violation`, `column already exists` (다른 정의) | **즉시 중단** — 부분 적용 상태. 수동 inventory 후 해당 step만 보정 |
| Step 10에서 `42501 must be owner of relation objects` | **정상 대응 가능** — 아래 Step 10b 참고. **010 전체 재실행 금지** |
| 중간 step 실패 후 처음부터 재실행 | **금지** — 성공한 step은 건너뛰고 실패 step부터 |

---

## 최종 실행 순서 (16 steps)

| Step | 파일 | 중단 여부 | 기대 성공 상태 |
|------|------|-----------|----------------|
| **1** | `001_members.sql` | 오류 시 중단 | `members` 테이블, `set_updated_at()`, members RLS |
| **2** | `002_participation.sql` | 오류 시 중단 | boss/siege 참여 테이블, `members` FK |
| **3** | `003_settlements.sql` | 오류 시 중단 | `settlements` 계열, `is_manager_or_admin()` |
| **4** | `004_finance.sql` | 오류 시 중단 | finance 테이블 + **legacy singleton** `guild_finance_settings` id=1 |
| **5** | `005_admin_settings.sql` | 오류 시 중단 | contribution 테이블 + **legacy default row** |
| **6** | `006_guild_profile_settings.sql` | 오류 시 중단 | **legacy** `guild_profile_settings`, `guild-assets` bucket |
| **7** | `007_guilds_multitenant_phase1.sql` | 오류 시 중단 | `guilds`, `members.guild_id` NOT NULL, singleton → `guild_id` PK, `current_member_guild_id()` |
| **8** | `008_boss_siege_multitenant_phase2.sql` | 오류 시 중단 | boss/siege `guild_id` NOT NULL + same-guild RLS |
| **9** | `009_finance_settlement_multitenant_phase3.sql` | 오류 시 중단 | settlement/finance `guild_id` NOT NULL + same-guild RLS |
| **10** | `010_admin_settings_multitenant_phase4.sql` | **42501 시 Step 10b** | contribution same-guild policy, guild_profile deprecated |
| **10b** | `production/step10_admin_phase4_core.sql` | Step 10이 42501일 때만 | Step 10의 owner-safe 부분 (storage COMMENT 제외) |
| **11** | `010_fix_contribution_rls.sql` | 오류 시 중단 | contribution `USING(true)` 제거 + same-guild policy (**production 필수**) |
| **12** | `011_onboarding_phase5.sql` | 오류 시 중단 | `onboarding_completed` 컬럼 (빈 DB에서 RED/BLUE UPDATE는 0 rows no-op) |
| **13** | `012_game_servers_guild_identity_phase55.sql` | 오류 시 중단 | **`game_servers` 31 rows**, `guilds.server_id` NOT NULL |
| **14** | `013_admin_data_export_phase6.sql` | 오류 시 중단 | `guild_export_logs` |
| **15** | `014_production_service_role_grants.sql` | 오류 시 중단 | 전 테이블 + RLS helper function `service_role` GRANT |
| **16** | `015_platform_usage_analytics.sql` | 오류 시 중단 | `platform_admins`, `usage_events` (Phase 8 analytics) |

### Step 10 owner-sensitive 처리

`010_admin_settings_multitenant_phase4.sql` 마지막 줄:

```sql
COMMENT ON TABLE storage.objects IS '...';
```

fresh Supabase SQL Editor에서 **42501 (must be owner of relation objects)** 가 날 수 있습니다.

- **보안 영향:** 없음 (문서용 COMMENT)
- **실패 지점 이전** (contribution policy, guild_profile revoke, guilds COMMENT)은 이미 적용됨
- **조치:** Step 10b (`production/step10_admin_phase4_core.sql`) 실행 후 Step 11 진행
- **금지:** 010 전체 재실행 (policy duplicate / partial state 위험)

---

## ⚠️ 파일명 함정: `002_fix_service_role_grants.sql`

**Step 2가 아닙니다.** 파일명이 `002`이지만 **004 이후**에만 실행 가능합니다.

| 참조 객체 | 생성 migration |
|-----------|----------------|
| `settlements`, `settlement_*` | 003 |
| `guild_finance_settings`, `dues`, `expenses`, `ledger_entries` | 004 |
| `is_manager_or_admin()` | 003 |

**Production 권장:** Step 15 (`014_production_service_role_grants.sql`) 사용 — `members`, `guilds`, `game_servers`, `guild_export_logs` 포함.

`002_fix_service_role_grants.sql`은 014 **미적용** 시 fallback으로만 Step 15 대신 사용.

---

## 선택 실행

| 파일 | 용도 |
|------|------|
| `002_reload_schema.sql` | PostgREST schema cache 갱신 (migration 후 API가 테이블 못 찾을 때) |

---

## Production vs Test 데이터 분리

### Migration만 실행 시 **자동 생성됨** (production OK)

| 데이터 | 출처 |
|--------|------|
| `game_servers` 31개 | 012 |

### Migration **절대 생성 안 함** (production 목표: 0 rows)

| 데이터 | 생성 경로 |
|--------|-----------|
| RED / BLUE / GREEN guild | `npm run phase1:seed-test-guilds` |
| 레드 / 블루 / 그린 / 레드원 / 블루원 | 테스트 스크립트 |
| test members / auth users | seed 스크립트 |
| boss / siege / finance / export test data | `phase2~6:seed-*`, verify 스크립트 |

### Legacy singleton (004~006) → 최종 상태 (007 이후)

| 테이블 | 004~006 | 007 처리 | 최종 |
|--------|---------|----------|------|
| `guild_finance_settings` | id=1 singleton INSERT | DELETE + PK=`guild_id` | guild당 row (production: 0 until onboarding) |
| `contribution_score_settings` | default row INSERT | DELETE + `guild_id` NOT NULL | guild당 row |
| `guild_profile_settings` | id=1 '레드원 혈맹' INSERT | 테이블 유지, 010 deprecated | **앱 미사용** — `guilds`가 source of truth |

011/012의 `UPDATE ... WHERE guild_code IN ('RED','BLUE'...)` 는 **guild 0건이면 no-op** — production safe.

---

## Migration 적용 후 검증 (read-only)

로컬에서 production env:

```bash
# .env.production.local 작성 후
ALLOW_PRODUCTION_MIGRATE=YES npm run production:migrate
npm run production:verify-schema:prod   # WARN 0 필수 (exit 1 if warn)
```

또는 SQL Editor 수동 실행 (위 Step 1~15).

정적 migration 분석 (DB 미접속):

```bash
npm run migration:static-audit
```

---

## Production Supabase 생성 후 수동 단계

1. 위 Step 1~15 SQL Editor 순차 실행
2. `npm run production:verify-schema` (production 키로)
3. Vercel production env 3종 설정 후 deploy
4. **첫 혈맹**은 앱 onboarding wizard로 생성 (seed 스크립트 사용 금지)
5. Auth: Dashboard → Authentication → Email provider 활성화
6. (선택) Storage `guild-assets` bucket public read 확인 (006에서 생성)

---

## Dependency graph (요약)

```
001 set_updated_at, members
 └─ 002_participation (members FK)
     └─ 003_settlements (members FK, is_manager_or_admin)
         └─ 004_finance (members FK, singleton seed)
             └─ 005_admin_settings (members FK, contribution seed)
                 └─ 006_guild_profile (members FK, storage bucket)
                     └─ 007_guilds (guilds, members.guild_id, current_member_guild_id)
                         └─ 008 boss/siege guild_id
                             └─ 009 settlement/finance guild_id
                                 └─ 010 admin policy (uses current_member_guild_id, contribution, guild_profile, guilds)
                                     └─ 010_fix contribution RLS (idempotent)
                                         └─ 011 onboarding columns
                                             └─ 012 game_servers + guilds.server_id
                                                 └─ 013 guild_export_logs (guilds FK)
                                                     └─ 014 service_role grants (all tables)

002_fix_service_role_grants ──► requires 003+004 tables (NOT step 2)
002_reload_schema ──► optional anytime after DDL
```
