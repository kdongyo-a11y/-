-- 레드원 혈맹 관리 — 보스/공성 정산
-- 002_participation.sql 실행 후 본 파일을 실행하세요.

CREATE TABLE IF NOT EXISTS public.settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN ('boss', 'siege')),
  source_id TEXT NOT NULL,
  total_income BIGINT NOT NULL DEFAULT 0 CHECK (total_income >= 0),
  guild_base_amount BIGINT NOT NULL DEFAULT 0 CHECK (guild_base_amount >= 0),
  distributable_amount BIGINT NOT NULL DEFAULT 0 CHECK (distributable_amount >= 0),
  per_member_amount BIGINT NOT NULL DEFAULT 0 CHECK (per_member_amount >= 0),
  remainder_amount BIGINT NOT NULL DEFAULT 0 CHECK (remainder_amount >= 0),
  final_guild_amount BIGINT NOT NULL DEFAULT 0 CHECK (final_guild_amount >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revision_in_progress', 'completed')),
  memo TEXT NOT NULL DEFAULT '',
  display_title TEXT NOT NULL DEFAULT '',
  display_sub TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT settlements_source_unique UNIQUE (source_type, source_id)
);

CREATE INDEX IF NOT EXISTS settlements_source_idx ON public.settlements (source_type, source_id);

DROP TRIGGER IF EXISTS settlements_set_updated_at ON public.settlements;
CREATE TRIGGER settlements_set_updated_at
  BEFORE UPDATE ON public.settlements
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.settlement_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES public.settlements(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  final_amount BIGINT NOT NULL DEFAULT 0 CHECK (final_amount >= 0),
  paid_amount BIGINT NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  admin_paid BOOLEAN NOT NULL DEFAULT false,
  admin_paid_at TIMESTAMPTZ,
  member_received BOOLEAN NOT NULL DEFAULT false,
  member_received_at TIMESTAMPTZ,
  adjustment_amount BIGINT NOT NULL DEFAULT 0,
  adjustment_type TEXT NOT NULL DEFAULT 'none'
    CHECK (adjustment_type IN ('none', 'return', 'additional', 'new_payout')),
  return_amount BIGINT NOT NULL DEFAULT 0 CHECK (return_amount >= 0),
  member_return_confirmed BOOLEAN NOT NULL DEFAULT false,
  member_return_confirmed_at TIMESTAMPTZ,
  admin_return_confirmed BOOLEAN NOT NULL DEFAULT false,
  admin_return_confirmed_at TIMESTAMPTZ,
  additional_amount BIGINT NOT NULL DEFAULT 0 CHECK (additional_amount >= 0),
  additional_admin_paid BOOLEAN NOT NULL DEFAULT false,
  additional_admin_paid_at TIMESTAMPTZ,
  additional_member_received BOOLEAN NOT NULL DEFAULT false,
  additional_member_received_at TIMESTAMPTZ,
  personal_status TEXT NOT NULL DEFAULT 'pending_payment',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT settlement_members_unique UNIQUE (settlement_id, member_id)
);

CREATE INDEX IF NOT EXISTS settlement_members_settlement_idx ON public.settlement_members (settlement_id);
CREATE INDEX IF NOT EXISTS settlement_members_member_idx ON public.settlement_members (member_id);

DROP TRIGGER IF EXISTS settlement_members_set_updated_at ON public.settlement_members;
CREATE TRIGGER settlement_members_set_updated_at
  BEFORE UPDATE ON public.settlement_members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.settlement_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES public.settlements(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  previous_participant_count INTEGER NOT NULL DEFAULT 0,
  new_participant_count INTEGER NOT NULL DEFAULT 0,
  previous_per_member_amount BIGINT NOT NULL DEFAULT 0,
  new_per_member_amount BIGINT NOT NULL DEFAULT 0,
  previous_guild_amount BIGINT NOT NULL DEFAULT 0,
  new_guild_amount BIGINT NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  snapshot_json JSONB NOT NULL DEFAULT '{}',
  member_adjustments_json JSONB NOT NULL DEFAULT '[]',
  created_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT settlement_revisions_unique UNIQUE (settlement_id, revision)
);

CREATE TABLE IF NOT EXISTS public.settlement_modification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES public.settlements(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  before_status TEXT NOT NULL DEFAULT '',
  after_status TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- manager/admin 판별 — settlement/due RLS 정책 공통 사용 (001_members.sql 이후)
CREATE OR REPLACE FUNCTION public.is_manager_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.members
    WHERE auth_user_id = auth.uid()
      AND role IN ('manager', 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_manager_or_admin() TO authenticated;

ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_modification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settlements_select_authenticated" ON public.settlements;
CREATE POLICY "settlements_select_authenticated"
  ON public.settlements FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "settlement_members_select_authenticated" ON public.settlement_members;

DROP POLICY IF EXISTS "settlement_members_select_own" ON public.settlement_members;
CREATE POLICY "settlement_members_select_own"
  ON public.settlement_members FOR SELECT TO authenticated
  USING (
    member_id IN (SELECT id FROM public.members WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "settlement_members_select_manager_admin" ON public.settlement_members;
CREATE POLICY "settlement_members_select_manager_admin"
  ON public.settlement_members FOR SELECT TO authenticated
  USING (public.is_manager_or_admin());

DROP POLICY IF EXISTS "settlement_revisions_select_authenticated" ON public.settlement_revisions;
DROP POLICY IF EXISTS "settlement_revisions_select_manager_admin" ON public.settlement_revisions;
CREATE POLICY "settlement_revisions_select_manager_admin"
  ON public.settlement_revisions FOR SELECT TO authenticated
  USING (public.is_manager_or_admin());

DROP POLICY IF EXISTS "settlement_modification_logs_select_authenticated" ON public.settlement_modification_logs;

DROP POLICY IF EXISTS "settlement_modification_logs_select_own" ON public.settlement_modification_logs;
CREATE POLICY "settlement_modification_logs_select_own"
  ON public.settlement_modification_logs FOR SELECT TO authenticated
  USING (
    member_id IN (SELECT id FROM public.members WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "settlement_modification_logs_select_manager_admin" ON public.settlement_modification_logs;
CREATE POLICY "settlement_modification_logs_select_manager_admin"
  ON public.settlement_modification_logs FOR SELECT TO authenticated
  USING (public.is_manager_or_admin());

REVOKE INSERT, UPDATE, DELETE ON public.settlements FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.settlement_members FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.settlement_revisions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.settlement_modification_logs FROM authenticated;

COMMENT ON TABLE public.settlements IS '보스/공성 공통 정산 헤더';
COMMENT ON TABLE public.settlement_members IS '정산 개인별 분배/지급/반환 상태';
