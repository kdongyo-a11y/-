-- Phase 8: Platform Admin usage analytics
-- 001~014 실행 후. Supabase SQL Editor에서 수동 실행.
-- usage_events는 migration 적용 이후부터 수집됩니다.

-- ---------------------------------------------------------------------------
-- platform_admins — guild admin(members.role)과 완전 분리
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_admins IS 'Phase 8 — SaaS 운영자 (guild admin과 별도)';

CREATE INDEX IF NOT EXISTS platform_admins_auth_user_id_idx
  ON public.platform_admins (auth_user_id)
  WHERE status = 'active';

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_admins FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_admins TO service_role;

-- ---------------------------------------------------------------------------
-- usage_events — 서버-side 집계용 (client 직접 INSERT 금지)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  guild_id UUID REFERENCES public.guilds(id) ON DELETE SET NULL,
  member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.usage_events IS 'Phase 8 — business usage analytics (migration 적용 이후 수집)';

CREATE INDEX IF NOT EXISTS usage_events_created_at_idx
  ON public.usage_events (created_at DESC);

CREATE INDEX IF NOT EXISTS usage_events_event_type_created_at_idx
  ON public.usage_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS usage_events_guild_id_created_at_idx
  ON public.usage_events (guild_id, created_at DESC)
  WHERE guild_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS usage_events_member_id_created_at_idx
  ON public.usage_events (member_id, created_at DESC)
  WHERE member_id IS NOT NULL;

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.usage_events FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.usage_events TO service_role;

-- ---------------------------------------------------------------------------
-- service_role grants (014 패턴)
-- ---------------------------------------------------------------------------
GRANT ALL ON TABLE public.platform_admins TO service_role;
GRANT ALL ON TABLE public.usage_events TO service_role;
