-- Phase 9c — 운영 정책 version / effective_from
-- SQL Editor에서 수동 실행. 자동 migration runner 사용 금지.

CREATE TABLE IF NOT EXISTS public.guild_operation_policy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  effective_from TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  change_reason TEXT NOT NULL DEFAULT '',
  policy_snapshot JSONB NOT NULL,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  cancel_reason TEXT,
  CONSTRAINT guild_operation_policy_versions_guild_version_unique UNIQUE (guild_id, version)
);

CREATE INDEX IF NOT EXISTS guild_operation_policy_versions_guild_effective_idx
  ON public.guild_operation_policy_versions (guild_id, effective_from DESC, version DESC);

CREATE INDEX IF NOT EXISTS guild_operation_policy_versions_guild_active_idx
  ON public.guild_operation_policy_versions (guild_id, effective_from)
  WHERE cancelled_at IS NULL;

COMMENT ON TABLE public.guild_operation_policy_versions IS
  'Phase 9c: 혈맹 운영 정책 version (effective_from 기준 event 적용)';

COMMENT ON COLUMN public.guild_operation_policy_versions.policy_snapshot IS
  '확장 가능 snapshot JSON (schemaVersion + finance 등)';

COMMENT ON COLUMN public.guild_operation_policy_versions.cancelled_at IS
  '예약 정책 취소 시각 (시행 전만 허용)';

-- Phase 9b row → version 1 seed (system migration 예외: 과거 effective_from)
INSERT INTO public.guild_operation_policy_versions (
  guild_id,
  version,
  effective_from,
  change_reason,
  policy_snapshot,
  created_at
)
SELECT
  gos.guild_id,
  1,
  TIMESTAMPTZ '2000-01-01 00:00:00+09',
  'Phase 9c migration seed from guild_operation_settings',
  jsonb_build_object(
    'schemaVersion', 1,
    'finance', jsonb_build_object(
      'managementFeeMode', gos.management_fee_mode,
      'managementFeePercentage',
        CASE
          WHEN gos.management_fee_mode = 'percentage' THEN gos.management_fee_percentage
          ELSE NULL
        END,
      'reserveMode', gos.reserve_mode,
      'reservePercentage',
        CASE
          WHEN gos.reserve_mode = 'percentage' THEN gos.reserve_percentage
          ELSE NULL
        END,
      'allocations', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object('memberId', a.member_id, 'ratioBp', a.ratio_bp)
            ORDER BY a.member_id
          )
          FROM public.guild_management_fee_allocations a
          WHERE a.guild_id = gos.guild_id
        ),
        '[]'::jsonb
      )
    )
  ),
  COALESCE(gos.updated_at, now())
FROM public.guild_operation_settings gos
ON CONFLICT (guild_id, version) DO NOTHING;

-- settings row 없는 guild — default policy seed
INSERT INTO public.guild_operation_policy_versions (
  guild_id,
  version,
  effective_from,
  change_reason,
  policy_snapshot
)
SELECT
  g.id,
  1,
  TIMESTAMPTZ '2000-01-01 00:00:00+09',
  'Phase 9c migration default seed',
  jsonb_build_object(
    'schemaVersion', 1,
    'finance', jsonb_build_object(
      'managementFeeMode', 'none',
      'managementFeePercentage', NULL,
      'reserveMode', 'manual_per_settlement',
      'reservePercentage', NULL,
      'allocations', '[]'::jsonb
    )
  )
FROM public.guilds g
WHERE NOT EXISTS (
  SELECT 1
  FROM public.guild_operation_policy_versions v
  WHERE v.guild_id = g.id AND v.version = 1
);

ALTER TABLE public.guild_operation_policy_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guild_operation_policy_versions_select_manager_admin"
  ON public.guild_operation_policy_versions;
CREATE POLICY "guild_operation_policy_versions_select_manager_admin"
  ON public.guild_operation_policy_versions FOR SELECT TO authenticated
  USING (public.is_manager_or_admin());

REVOKE ALL ON public.guild_operation_policy_versions FROM authenticated;
GRANT SELECT ON public.guild_operation_policy_versions TO authenticated;
GRANT ALL ON TABLE public.guild_operation_policy_versions TO service_role;
