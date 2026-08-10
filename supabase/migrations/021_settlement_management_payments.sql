-- Phase 9d — 정산 관리비 지급 추적
-- SQL Editor에서 수동 실행. 자동 migration runner 사용 금지.

CREATE TABLE IF NOT EXISTS public.settlement_management_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
  settlement_id UUID NOT NULL REFERENCES public.settlements(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  snapshot_nickname TEXT NOT NULL,
  ratio_bp INTEGER NOT NULL CHECK (ratio_bp > 0 AND ratio_bp <= 10000),
  amount BIGINT NOT NULL CHECK (amount >= 0),
  admin_paid BOOLEAN NOT NULL DEFAULT false,
  admin_paid_at TIMESTAMPTZ,
  admin_paid_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  member_confirmed BOOLEAN NOT NULL DEFAULT false,
  member_confirmed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'confirmed')),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT settlement_management_payments_unique UNIQUE (settlement_id, member_id)
);

CREATE INDEX IF NOT EXISTS settlement_management_payments_settlement_idx
  ON public.settlement_management_payments (settlement_id);

CREATE INDEX IF NOT EXISTS settlement_management_payments_guild_idx
  ON public.settlement_management_payments (guild_id, settlement_id);

CREATE INDEX IF NOT EXISTS settlement_management_payments_member_idx
  ON public.settlement_management_payments (member_id);

DROP TRIGGER IF EXISTS settlement_management_payments_set_updated_at
  ON public.settlement_management_payments;
CREATE TRIGGER settlement_management_payments_set_updated_at
  BEFORE UPDATE ON public.settlement_management_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.settlement_management_payment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES public.settlement_management_payments(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  before_json JSONB NOT NULL DEFAULT '{}',
  after_json JSONB NOT NULL DEFAULT '{}',
  actor_member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS settlement_management_payment_logs_payment_idx
  ON public.settlement_management_payment_logs (payment_id, created_at DESC);

ALTER TABLE public.settlement_management_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_management_payment_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settlement_management_payments_select_own"
  ON public.settlement_management_payments;
CREATE POLICY "settlement_management_payments_select_own"
  ON public.settlement_management_payments FOR SELECT TO authenticated
  USING (
    member_id IN (SELECT id FROM public.members WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "settlement_management_payments_select_same_guild"
  ON public.settlement_management_payments;
CREATE POLICY "settlement_management_payments_select_same_guild"
  ON public.settlement_management_payments FOR SELECT TO authenticated
  USING (
    guild_id IN (
      SELECT m.guild_id FROM public.members m
      WHERE m.auth_user_id = auth.uid() AND m.status = '활동'
    )
  );

DROP POLICY IF EXISTS "settlement_management_payment_logs_select_manager"
  ON public.settlement_management_payment_logs;
CREATE POLICY "settlement_management_payment_logs_select_manager"
  ON public.settlement_management_payment_logs FOR SELECT TO authenticated
  USING (
    public.is_manager_or_admin()
    AND guild_id = public.current_member_guild_id()
  );

REVOKE ALL ON public.settlement_management_payments FROM authenticated;
GRANT SELECT ON public.settlement_management_payments TO authenticated;
GRANT ALL ON TABLE public.settlement_management_payments TO service_role;

REVOKE ALL ON public.settlement_management_payment_logs FROM authenticated;
GRANT SELECT ON public.settlement_management_payment_logs TO authenticated;
GRANT ALL ON TABLE public.settlement_management_payment_logs TO service_role;

COMMENT ON TABLE public.settlement_management_payments IS
  'Phase 9d: 정산 관리비 지급/수령 추적 (snapshot 금액 고정)';
