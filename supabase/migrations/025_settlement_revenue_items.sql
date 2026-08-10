-- Finance 2.0-A+ — 정산 수익 발생 근거 (receipt와 분리)
-- 024 실행 후 SQL Editor에서 수동 실행.

CREATE TABLE IF NOT EXISTS public.settlement_revenue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
  settlement_id UUID NOT NULL REFERENCES public.settlements(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC NULL,
  unit_price BIGINT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  memo TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS settlement_revenue_items_settlement_idx
  ON public.settlement_revenue_items (settlement_id, sort_order);

CREATE INDEX IF NOT EXISTS settlement_revenue_items_guild_idx
  ON public.settlement_revenue_items (guild_id, settlement_id);

DROP TRIGGER IF EXISTS settlement_revenue_items_set_updated_at
  ON public.settlement_revenue_items;
CREATE TRIGGER settlement_revenue_items_set_updated_at
  BEFORE UPDATE ON public.settlement_revenue_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.settlement_revenue_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settlement_revenue_items_select_manager"
  ON public.settlement_revenue_items;
CREATE POLICY "settlement_revenue_items_select_manager"
  ON public.settlement_revenue_items FOR SELECT TO authenticated
  USING (
    public.is_manager_or_admin()
    AND guild_id = public.current_member_guild_id()
  );

REVOKE ALL ON public.settlement_revenue_items FROM authenticated;
GRANT SELECT ON public.settlement_revenue_items TO authenticated;
GRANT ALL ON TABLE public.settlement_revenue_items TO service_role;

COMMENT ON TABLE public.settlement_revenue_items IS
  'Finance 2.0-A+: 수익 발생 근거 — amount가 회계 기준, quantity/unit_price는 설명용';
