-- Phase 9c — 혈맹 공지사항 (guild_notices)
-- SQL Editor에서 수동 실행. 자동 migration runner 사용 금지.

CREATE TABLE IF NOT EXISTS public.guild_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
  content TEXT NOT NULL CHECK (char_length(trim(content)) > 0),
  is_important BOOLEAN NOT NULL DEFAULT false,
  publish_from TIMESTAMPTZ NOT NULL,
  publish_until TIMESTAMPTZ,
  created_by_member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT guild_notices_publish_until_after_from CHECK (
    publish_until IS NULL OR publish_until > publish_from
  )
);

CREATE INDEX IF NOT EXISTS guild_notices_guild_publish_idx
  ON public.guild_notices (guild_id, publish_from DESC);

CREATE INDEX IF NOT EXISTS guild_notices_guild_active_idx
  ON public.guild_notices (guild_id, is_important DESC, publish_from DESC)
  WHERE archived_at IS NULL;

COMMENT ON TABLE public.guild_notices IS
  'Phase 9c: 혈맹 공지 (communication — 운영정책 version과 source of truth 분리)';

ALTER TABLE public.guild_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guild_notices_select_same_guild" ON public.guild_notices;
CREATE POLICY "guild_notices_select_same_guild"
  ON public.guild_notices FOR SELECT TO authenticated
  USING (
    guild_id IN (
      SELECT m.guild_id
      FROM public.members m
      WHERE m.auth_user_id = auth.uid()
        AND m.status = '활동'
    )
  );

REVOKE ALL ON public.guild_notices FROM authenticated;
GRANT SELECT ON public.guild_notices TO authenticated;
GRANT ALL ON TABLE public.guild_notices TO service_role;
