-- Finance 2.0-A — 실보유액 baseline (go-forward checkpoint)
-- 021 실행 후 SQL Editor에서 수동 실행.

CREATE TABLE IF NOT EXISTS public.guild_cash_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
  effective_at TIMESTAMPTZ NOT NULL,
  opening_cash_balance BIGINT NOT NULL,
  created_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  memo TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT guild_cash_checkpoints_guild_effective_unique UNIQUE (guild_id, effective_at)
);

CREATE INDEX IF NOT EXISTS guild_cash_checkpoints_guild_effective_idx
  ON public.guild_cash_checkpoints (guild_id, effective_at DESC);

ALTER TABLE public.guild_cash_checkpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guild_cash_checkpoints_select_same_guild"
  ON public.guild_cash_checkpoints;
CREATE POLICY "guild_cash_checkpoints_select_same_guild"
  ON public.guild_cash_checkpoints FOR SELECT TO authenticated
  USING (
    guild_id IN (
      SELECT m.guild_id FROM public.members m
      WHERE m.auth_user_id = auth.uid() AND m.status = '활동'
    )
  );

REVOKE ALL ON public.guild_cash_checkpoints FROM authenticated;
GRANT SELECT ON public.guild_cash_checkpoints TO authenticated;
GRANT ALL ON TABLE public.guild_cash_checkpoints TO service_role;

COMMENT ON TABLE public.guild_cash_checkpoints IS
  'Finance 2.0: 실보유액 baseline — immutable, 재기준 시 신규 insert';
