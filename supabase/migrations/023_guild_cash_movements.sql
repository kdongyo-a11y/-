-- Finance 2.0-A — cash IN/OUT 전용 ledger (accrual ledger_entries와 분리)
-- 022 실행 후 SQL Editor에서 수동 실행.

CREATE TABLE IF NOT EXISTS public.guild_cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
  movement_at TIMESTAMPTZ NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL CHECK (category IN (
    'revenue_received',
    'dues_received',
    'return_received',
    'participant_paid',
    'management_paid',
    'period_paid',
    'expense',
    'manual_adjustment'
  )),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  cancelled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT guild_cash_movements_idempotent UNIQUE (guild_id, source_type, source_id, category)
);

CREATE INDEX IF NOT EXISTS guild_cash_movements_guild_movement_at_idx
  ON public.guild_cash_movements (guild_id, movement_at);

CREATE INDEX IF NOT EXISTS guild_cash_movements_guild_source_idx
  ON public.guild_cash_movements (guild_id, source_type, source_id);

ALTER TABLE public.guild_cash_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guild_cash_movements_select_same_guild"
  ON public.guild_cash_movements;
CREATE POLICY "guild_cash_movements_select_same_guild"
  ON public.guild_cash_movements FOR SELECT TO authenticated
  USING (
    guild_id IN (
      SELECT m.guild_id FROM public.members m
      WHERE m.auth_user_id = auth.uid() AND m.status = '활동'
    )
  );

REVOKE ALL ON public.guild_cash_movements FROM authenticated;
GRANT SELECT ON public.guild_cash_movements TO authenticated;
GRANT ALL ON TABLE public.guild_cash_movements TO service_role;

COMMENT ON TABLE public.guild_cash_movements IS
  'Finance 2.0: 실제 입출금 — checkpoint.effective_at 이후 movement만 cashBalance에 합산';
