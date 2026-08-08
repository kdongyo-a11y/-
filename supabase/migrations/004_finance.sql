-- 레드원 혈맹 관리 — 혈비 / 지출 / 장부
-- 003_settlements.sql 실행 후 본 파일을 실행하세요.

CREATE TABLE IF NOT EXISTS public.guild_finance_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  opening_balance BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.guild_finance_settings (id, opening_balance)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.dues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dues_month TEXT NOT NULL,
  amount_per_member BIGINT NOT NULL CHECK (amount_per_member > 0),
  due_date DATE NOT NULL,
  memo TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dues_month_unique UNIQUE (dues_month)
);

DROP TRIGGER IF EXISTS dues_set_updated_at ON public.dues;
CREATE TRIGGER dues_set_updated_at
  BEFORE UPDATE ON public.dues
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.due_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  due_id UUID NOT NULL REFERENCES public.dues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (status IN ('unpaid', 'payment_reported', 'paid')),
  paid_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  memo TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT due_members_unique UNIQUE (due_id, member_id)
);

CREATE INDEX IF NOT EXISTS due_members_member_idx ON public.due_members (member_id);
CREATE INDEX IF NOT EXISTS due_members_due_idx ON public.due_members (due_id);

DROP TRIGGER IF EXISTS due_members_set_updated_at ON public.due_members;
CREATE TRIGGER due_members_set_updated_at
  BEFORE UPDATE ON public.due_members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.due_change_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  due_id UUID NOT NULL REFERENCES public.dues(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  memo TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date DATE NOT NULL,
  expense_type TEXT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  target TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_expense_date_idx ON public.expenses (expense_date);
CREATE INDEX IF NOT EXISTS expenses_status_idx ON public.expenses (status);

DROP TRIGGER IF EXISTS expenses_set_updated_at ON public.expenses;
CREATE TRIGGER expenses_set_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.expense_change_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  memo TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_date DATE NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('income', 'expense')),
  source_type TEXT NOT NULL
    CHECK (source_type IN ('boss_settlement', 'siege_settlement', 'dues', 'expense', 'manual', 'legacy')),
  source_id TEXT NOT NULL,
  amount BIGINT NOT NULL CHECK (amount >= 0),
  description TEXT NOT NULL DEFAULT '',
  cancelled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ledger_entries_source_unique UNIQUE (source_type, source_id, entry_type)
);

CREATE INDEX IF NOT EXISTS ledger_entries_transaction_date_idx ON public.ledger_entries (transaction_date);
CREATE INDEX IF NOT EXISTS ledger_entries_source_idx ON public.ledger_entries (source_type, source_id);

ALTER TABLE public.guild_finance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.due_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.due_change_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_change_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guild_finance_settings_select_authenticated" ON public.guild_finance_settings;
CREATE POLICY "guild_finance_settings_select_authenticated"
  ON public.guild_finance_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "dues_select_authenticated" ON public.dues;
CREATE POLICY "dues_select_authenticated"
  ON public.dues FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "due_members_select_authenticated" ON public.due_members;

DROP POLICY IF EXISTS "due_members_select_own" ON public.due_members;
CREATE POLICY "due_members_select_own"
  ON public.due_members FOR SELECT TO authenticated
  USING (
    member_id IN (SELECT id FROM public.members WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "due_members_select_manager_admin" ON public.due_members;
CREATE POLICY "due_members_select_manager_admin"
  ON public.due_members FOR SELECT TO authenticated
  USING (public.is_manager_or_admin());

DROP POLICY IF EXISTS "due_change_logs_select_authenticated" ON public.due_change_logs;

DROP POLICY IF EXISTS "due_change_logs_select_own" ON public.due_change_logs;
CREATE POLICY "due_change_logs_select_own"
  ON public.due_change_logs FOR SELECT TO authenticated
  USING (
    member_id IN (SELECT id FROM public.members WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "due_change_logs_select_manager_admin" ON public.due_change_logs;
CREATE POLICY "due_change_logs_select_manager_admin"
  ON public.due_change_logs FOR SELECT TO authenticated
  USING (public.is_manager_or_admin());

DROP POLICY IF EXISTS "expenses_select_authenticated" ON public.expenses;
CREATE POLICY "expenses_select_authenticated"
  ON public.expenses FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "expense_change_logs_select_authenticated" ON public.expense_change_logs;
CREATE POLICY "expense_change_logs_select_authenticated"
  ON public.expense_change_logs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ledger_entries_select_authenticated" ON public.ledger_entries;
CREATE POLICY "ledger_entries_select_authenticated"
  ON public.ledger_entries FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.guild_finance_settings FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dues FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.due_members FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.due_change_logs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.expenses FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.expense_change_logs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ledger_entries FROM authenticated;

COMMENT ON TABLE public.dues IS '월별 혈비 부과 (dues_month: YYYY-MM)';
COMMENT ON TABLE public.due_members IS '혈비 부과 시점 활동 혈원 스냅샷';
COMMENT ON TABLE public.ledger_entries IS '장부 원장 — source_type+source_id 중복 방지';
