-- Phase 9b — 운영 정책 (관리비 / 혈맹 비축 / 관리자 배분)
-- SQL Editor에서 수동 실행. 자동 migration runner 사용 금지.

CREATE TABLE IF NOT EXISTS public.guild_operation_settings (
  guild_id UUID PRIMARY KEY REFERENCES public.guilds(id) ON DELETE CASCADE,
  management_fee_mode TEXT NOT NULL DEFAULT 'none'
    CHECK (management_fee_mode IN ('none', 'percentage', 'manual_per_settlement')),
  management_fee_percentage NUMERIC(5, 2)
    CHECK (
      management_fee_percentage IS NULL
      OR (management_fee_percentage >= 0 AND management_fee_percentage <= 100)
    ),
  reserve_mode TEXT NOT NULL DEFAULT 'manual_per_settlement'
    CHECK (reserve_mode IN ('none', 'percentage', 'manual_per_settlement')),
  reserve_percentage NUMERIC(5, 2)
    CHECK (
      reserve_percentage IS NULL
      OR (reserve_percentage >= 0 AND reserve_percentage <= 100)
    ),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guild_management_fee_allocations (
  guild_id UUID NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  ratio_bp INTEGER NOT NULL CHECK (ratio_bp > 0 AND ratio_bp <= 10000),
  PRIMARY KEY (guild_id, member_id)
);

CREATE INDEX IF NOT EXISTS guild_management_fee_allocations_guild_id_idx
  ON public.guild_management_fee_allocations (guild_id);

CREATE TABLE IF NOT EXISTS public.guild_operation_setting_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
  previous_snapshot JSONB NOT NULL DEFAULT '{}',
  new_snapshot JSONB NOT NULL DEFAULT '{}',
  reason TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guild_operation_setting_logs_guild_id_idx
  ON public.guild_operation_setting_logs (guild_id, created_at DESC);

ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS reserve_mode_applied TEXT;

ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS reserve_percentage_applied NUMERIC(5, 2);

ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS management_fee_mode_applied TEXT;

ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS management_fee_percentage_applied NUMERIC(5, 2);

ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS management_fee_total BIGINT
    CHECK (management_fee_total IS NULL OR management_fee_total >= 0);

ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS management_fee_manual_input BIGINT
    CHECK (management_fee_manual_input IS NULL OR management_fee_manual_input >= 0);

ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS operation_policy_snapshot JSONB;

COMMENT ON TABLE public.guild_operation_settings IS
  'Phase 9b: 혈맹 운영 정책 (관리비·비축 산정 방식)';

COMMENT ON COLUMN public.guild_management_fee_allocations.ratio_bp IS
  '관리비 배분 비율 (basis points, 합계 10000 = 100%)';

COMMENT ON COLUMN public.settlements.operation_policy_snapshot IS
  'Phase 9b: 정산 생성 시점 정책·관리비 배분 snapshot (불변)';

ALTER TABLE public.guild_operation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guild_management_fee_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guild_operation_setting_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guild_operation_settings_select_manager_admin" ON public.guild_operation_settings;
CREATE POLICY "guild_operation_settings_select_manager_admin"
  ON public.guild_operation_settings FOR SELECT TO authenticated
  USING (public.is_manager_or_admin());

DROP POLICY IF EXISTS "guild_management_fee_allocations_select_manager_admin" ON public.guild_management_fee_allocations;
CREATE POLICY "guild_management_fee_allocations_select_manager_admin"
  ON public.guild_management_fee_allocations FOR SELECT TO authenticated
  USING (public.is_manager_or_admin());

DROP POLICY IF EXISTS "guild_operation_setting_logs_select_manager_admin" ON public.guild_operation_setting_logs;
CREATE POLICY "guild_operation_setting_logs_select_manager_admin"
  ON public.guild_operation_setting_logs FOR SELECT TO authenticated
  USING (public.is_manager_or_admin());

REVOKE ALL ON public.guild_operation_settings FROM authenticated;
GRANT SELECT ON public.guild_operation_settings TO authenticated;

REVOKE ALL ON public.guild_management_fee_allocations FROM authenticated;
GRANT SELECT ON public.guild_management_fee_allocations TO authenticated;

REVOKE ALL ON public.guild_operation_setting_logs FROM authenticated;
GRANT SELECT ON public.guild_operation_setting_logs TO authenticated;

GRANT ALL ON TABLE public.guild_operation_settings TO service_role;
GRANT ALL ON TABLE public.guild_management_fee_allocations TO service_role;
GRANT ALL ON TABLE public.guild_operation_setting_logs TO service_role;
