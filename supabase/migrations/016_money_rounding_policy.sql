-- Phase 9a — 1,000원 단위 절사 / 짜투리 혈맹 귀속
-- SQL Editor에서 수동 실행. 자동 migration runner 사용 금지.

ALTER TABLE public.guild_finance_settings
  ADD COLUMN IF NOT EXISTS rounding_remainder_balance BIGINT NOT NULL DEFAULT 0
    CHECK (rounding_remainder_balance >= 0 AND rounding_remainder_balance < 1000);

ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS rounding_unit INTEGER
    CHECK (rounding_unit IS NULL OR rounding_unit > 0);

ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS rounding_policy TEXT;

ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS guild_share_ledger_amount BIGINT
    CHECK (guild_share_ledger_amount IS NULL OR guild_share_ledger_amount >= 0);

ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS guild_share_sub_thousand BIGINT
    CHECK (guild_share_sub_thousand IS NULL OR (guild_share_sub_thousand >= 0 AND guild_share_sub_thousand < 1000));

COMMENT ON COLUMN public.guild_finance_settings.rounding_remainder_balance IS
  'Phase 9a: 1,000원 미만 짜투리 누적 (ledger 000 단위 유지)';

COMMENT ON COLUMN public.settlements.rounding_unit IS
  'Phase 9a snapshot: NULL=legacy 1원 단위, 1000=천원 절사';

-- 기존 settlement row는 NULL 유지 (재계산/backfill 없음)
