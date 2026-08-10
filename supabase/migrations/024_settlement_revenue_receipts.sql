-- Finance 2.0-A — 정산 수익 partial 입금 확인
-- 023 실행 후 SQL Editor에서 수동 실행.

CREATE TABLE IF NOT EXISTS public.settlement_revenue_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
  settlement_id UUID NOT NULL REFERENCES public.settlements(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL CHECK (amount > 0),
  received_at TIMESTAMPTZ NOT NULL,
  confirmed_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  memo TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS settlement_revenue_receipts_settlement_idx
  ON public.settlement_revenue_receipts (settlement_id);

CREATE INDEX IF NOT EXISTS settlement_revenue_receipts_guild_idx
  ON public.settlement_revenue_receipts (guild_id, settlement_id);

ALTER TABLE public.settlement_revenue_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settlement_revenue_receipts_select_manager"
  ON public.settlement_revenue_receipts;
CREATE POLICY "settlement_revenue_receipts_select_manager"
  ON public.settlement_revenue_receipts FOR SELECT TO authenticated
  USING (
    public.is_manager_or_admin()
    AND guild_id = public.current_member_guild_id()
  );

REVOKE ALL ON public.settlement_revenue_receipts FROM authenticated;
GRANT SELECT ON public.settlement_revenue_receipts TO authenticated;
GRANT ALL ON TABLE public.settlement_revenue_receipts TO service_role;

COMMENT ON TABLE public.settlement_revenue_receipts IS
  'Finance 2.0: 정산 total_income 대비 partial 입금 확인 — receipt 1건당 cash movement 1건';
