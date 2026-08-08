-- Phase 5: onboarding wizard 상태 (guilds)
-- 001~010_fix 실행 후. 기존 RED/BLUE 테스트 guild는 wizard skip 처리.

ALTER TABLE public.guilds
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.guilds
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.guilds.onboarding_completed IS '최초 설정 wizard 완료 여부 — Phase 5';
COMMENT ON COLUMN public.guilds.onboarding_completed_at IS 'wizard 완료 시각';

-- 기존 SaaS 테스트 guild (RED/BLUE) — wizard 미표시
UPDATE public.guilds
SET onboarding_completed = true,
    onboarding_completed_at = COALESCE(onboarding_completed_at, now())
WHERE guild_code IN ('RED', 'BLUE')
  AND onboarding_completed = false;
