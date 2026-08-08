-- Phase 1: guilds 테이블, members.guild_id, guild 단위 UNIQUE, members RLS prototype
-- 신규 SaaS Supabase 전용. 운영 redone DB에는 실행하지 마세요.
-- 001~006 실행 후 본 파일을 실행하세요.

-- ---------------------------------------------------------------------------
-- guilds (테넌트 루트)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guilds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_name TEXT NOT NULL,
  guild_code TEXT NOT NULL,
  guild_mark_path TEXT,
  status TEXT NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('provisioning', 'active', 'suspended', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT guilds_guild_code_unique UNIQUE (guild_code),
  CONSTRAINT guilds_guild_code_format CHECK (guild_code ~ '^[A-Za-z0-9_-]{2,32}$')
);

CREATE INDEX IF NOT EXISTS guilds_status_idx ON public.guilds (status);

DROP TRIGGER IF EXISTS guilds_set_updated_at ON public.guilds;
CREATE TRIGGER guilds_set_updated_at
  BEFORE UPDATE ON public.guilds
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.guilds IS '멀티테넌트 혈맹(테넌트) 루트';
COMMENT ON COLUMN public.guilds.guild_code IS '로그인/가입용 전역 고유 혈맹 코드';
COMMENT ON COLUMN public.guilds.status IS 'provisioning → active (온보딩), suspended/archived';

-- ---------------------------------------------------------------------------
-- members.guild_id + guild 단위 nickname UNIQUE
-- ---------------------------------------------------------------------------
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS guild_id UUID REFERENCES public.guilds(id) ON DELETE CASCADE;

-- 기존 단일혈맹 데이터가 없는 신규 SaaS DB 전제: NOT NULL 적용
-- (데이터가 있으면 별도 backfill 후 NOT NULL)
ALTER TABLE public.members
  ALTER COLUMN guild_id SET NOT NULL;

DROP INDEX IF EXISTS members_nickname_idx;

ALTER TABLE public.members
  DROP CONSTRAINT IF EXISTS members_nickname_key;

CREATE UNIQUE INDEX IF NOT EXISTS members_guild_nickname_unique
  ON public.members (guild_id, nickname);

CREATE INDEX IF NOT EXISTS members_guild_id_idx ON public.members (guild_id);

-- ---------------------------------------------------------------------------
-- guild_finance_settings: singleton → guild당 1 row
-- ---------------------------------------------------------------------------
ALTER TABLE public.guild_finance_settings
  DROP CONSTRAINT IF EXISTS guild_finance_settings_id_check;

DELETE FROM public.guild_finance_settings;

ALTER TABLE public.guild_finance_settings
  ADD COLUMN IF NOT EXISTS guild_id UUID REFERENCES public.guilds(id) ON DELETE CASCADE;

ALTER TABLE public.guild_finance_settings
  DROP CONSTRAINT IF EXISTS guild_finance_settings_pkey;

ALTER TABLE public.guild_finance_settings
  DROP COLUMN IF EXISTS id;

ALTER TABLE public.guild_finance_settings
  ADD PRIMARY KEY (guild_id);

-- ---------------------------------------------------------------------------
-- contribution_score_settings: guild 단위 effective_from UNIQUE
-- ---------------------------------------------------------------------------
ALTER TABLE public.contribution_score_settings
  ADD COLUMN IF NOT EXISTS guild_id UUID REFERENCES public.guilds(id) ON DELETE CASCADE;

DELETE FROM public.contribution_score_settings;

ALTER TABLE public.contribution_score_settings
  DROP CONSTRAINT IF EXISTS contribution_score_settings_effective_from_unique;

ALTER TABLE public.contribution_score_settings
  ALTER COLUMN guild_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS contribution_score_settings_guild_effective_unique
  ON public.contribution_score_settings (guild_id, effective_from);

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_member_guild_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT guild_id
  FROM public.members
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_member_guild_id() TO authenticated;

-- ---------------------------------------------------------------------------
-- guilds RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.guilds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guilds_select_own" ON public.guilds;
CREATE POLICY "guilds_select_own"
  ON public.guilds
  FOR SELECT
  TO authenticated
  USING (id = public.current_member_guild_id());

REVOKE INSERT, UPDATE, DELETE ON public.guilds FROM authenticated;

-- ---------------------------------------------------------------------------
-- members RLS prototype — 동일 guild만 SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "members_select_authenticated" ON public.members;
CREATE POLICY "members_select_same_guild"
  ON public.members
  FOR SELECT
  TO authenticated
  USING (guild_id = public.current_member_guild_id());

-- Service Role / onboarding API는 RLS bypass

GRANT ALL ON TABLE public.guilds TO service_role;
