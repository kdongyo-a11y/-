-- Phase 3: settlement / dues / expense / ledger 멀티테넌트
-- 신규 SaaS Supabase 전용. 001~008 실행 후 본 파일을 실행하세요.
-- 전제: settlements/dues/expenses/ledger_entries 비어 있음 (신규 SaaS DB)

-- ---------------------------------------------------------------------------
-- settlements.guild_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS guild_id UUID REFERENCES public.guilds(id) ON DELETE CASCADE;

ALTER TABLE public.settlements
  ALTER COLUMN guild_id SET NOT NULL;

ALTER TABLE public.settlements
  DROP CONSTRAINT IF EXISTS settlements_source_unique;

ALTER TABLE public.settlements
  ADD CONSTRAINT settlements_guild_source_unique
  UNIQUE (guild_id, source_type, source_id);

DROP INDEX IF EXISTS settlements_source_idx;
CREATE INDEX IF NOT EXISTS settlements_guild_source_idx
  ON public.settlements (guild_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS settlements_guild_id_idx ON public.settlements (guild_id);

-- ---------------------------------------------------------------------------
-- dues.guild_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.dues
  ADD COLUMN IF NOT EXISTS guild_id UUID REFERENCES public.guilds(id) ON DELETE CASCADE;

ALTER TABLE public.dues
  ALTER COLUMN guild_id SET NOT NULL;

ALTER TABLE public.dues
  DROP CONSTRAINT IF EXISTS dues_month_unique;

ALTER TABLE public.dues
  ADD CONSTRAINT dues_guild_month_unique
  UNIQUE (guild_id, dues_month);

CREATE INDEX IF NOT EXISTS dues_guild_id_idx ON public.dues (guild_id);

-- ---------------------------------------------------------------------------
-- expenses.guild_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS guild_id UUID REFERENCES public.guilds(id) ON DELETE CASCADE;

ALTER TABLE public.expenses
  ALTER COLUMN guild_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS expenses_guild_id_idx ON public.expenses (guild_id);
CREATE INDEX IF NOT EXISTS expenses_guild_expense_date_idx
  ON public.expenses (guild_id, expense_date);

-- ---------------------------------------------------------------------------
-- ledger_entries.guild_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS guild_id UUID REFERENCES public.guilds(id) ON DELETE CASCADE;

ALTER TABLE public.ledger_entries
  ALTER COLUMN guild_id SET NOT NULL;

ALTER TABLE public.ledger_entries
  DROP CONSTRAINT IF EXISTS ledger_entries_source_unique;

ALTER TABLE public.ledger_entries
  ADD CONSTRAINT ledger_entries_guild_source_unique
  UNIQUE (guild_id, source_type, source_id, entry_type);

DROP INDEX IF EXISTS ledger_entries_source_idx;
CREATE INDEX IF NOT EXISTS ledger_entries_guild_source_idx
  ON public.ledger_entries (guild_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS ledger_entries_guild_id_idx ON public.ledger_entries (guild_id);
CREATE INDEX IF NOT EXISTS ledger_entries_guild_transaction_date_idx
  ON public.ledger_entries (guild_id, transaction_date);

-- ---------------------------------------------------------------------------
-- guild_finance_setting_logs.guild_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.guild_finance_setting_logs
  ADD COLUMN IF NOT EXISTS guild_id UUID REFERENCES public.guilds(id) ON DELETE CASCADE;

ALTER TABLE public.guild_finance_setting_logs
  ALTER COLUMN guild_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS guild_finance_setting_logs_guild_id_idx
  ON public.guild_finance_setting_logs (guild_id);

-- guild_finance_settings: guild_id PK — Phase 1(007) 완료, RLS만 갱신

-- ---------------------------------------------------------------------------
-- RLS: root tables — guild_id = current_member_guild_id()
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "settlements_select_authenticated" ON public.settlements;
CREATE POLICY "settlements_select_same_guild"
  ON public.settlements FOR SELECT TO authenticated
  USING (guild_id = public.current_member_guild_id());

DROP POLICY IF EXISTS "dues_select_authenticated" ON public.dues;
CREATE POLICY "dues_select_same_guild"
  ON public.dues FOR SELECT TO authenticated
  USING (guild_id = public.current_member_guild_id());

DROP POLICY IF EXISTS "expenses_select_authenticated" ON public.expenses;
CREATE POLICY "expenses_select_same_guild"
  ON public.expenses FOR SELECT TO authenticated
  USING (guild_id = public.current_member_guild_id());

DROP POLICY IF EXISTS "ledger_entries_select_authenticated" ON public.ledger_entries;
CREATE POLICY "ledger_entries_select_same_guild"
  ON public.ledger_entries FOR SELECT TO authenticated
  USING (guild_id = public.current_member_guild_id());

DROP POLICY IF EXISTS "guild_finance_settings_select_authenticated" ON public.guild_finance_settings;
CREATE POLICY "guild_finance_settings_select_same_guild"
  ON public.guild_finance_settings FOR SELECT TO authenticated
  USING (guild_id = public.current_member_guild_id());

-- ---------------------------------------------------------------------------
-- RLS: settlement child — parent settlements EXISTS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "settlement_members_select_own" ON public.settlement_members;
CREATE POLICY "settlement_members_select_own"
  ON public.settlement_members FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM public.members WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "settlement_members_select_manager_admin" ON public.settlement_members;
CREATE POLICY "settlement_members_select_same_guild_manager"
  ON public.settlement_members FOR SELECT TO authenticated
  USING (
    public.is_manager_or_admin()
    AND EXISTS (
      SELECT 1 FROM public.settlements s
      WHERE s.id = settlement_id
        AND s.guild_id = public.current_member_guild_id()
    )
  );

DROP POLICY IF EXISTS "settlement_revisions_select_manager_admin" ON public.settlement_revisions;
CREATE POLICY "settlement_revisions_select_same_guild"
  ON public.settlement_revisions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.settlements s
      WHERE s.id = settlement_id
        AND s.guild_id = public.current_member_guild_id()
    )
  );

DROP POLICY IF EXISTS "settlement_modification_logs_select_own" ON public.settlement_modification_logs;
CREATE POLICY "settlement_modification_logs_select_own"
  ON public.settlement_modification_logs FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM public.members WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "settlement_modification_logs_select_manager_admin" ON public.settlement_modification_logs;
CREATE POLICY "settlement_modification_logs_select_same_guild_manager"
  ON public.settlement_modification_logs FOR SELECT TO authenticated
  USING (
    public.is_manager_or_admin()
    AND EXISTS (
      SELECT 1 FROM public.settlements s
      WHERE s.id = settlement_id
        AND s.guild_id = public.current_member_guild_id()
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: dues child
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "due_members_select_own" ON public.due_members;
CREATE POLICY "due_members_select_own"
  ON public.due_members FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM public.members WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "due_members_select_manager_admin" ON public.due_members;
CREATE POLICY "due_members_select_same_guild_manager"
  ON public.due_members FOR SELECT TO authenticated
  USING (
    public.is_manager_or_admin()
    AND EXISTS (
      SELECT 1 FROM public.dues d
      WHERE d.id = due_id
        AND d.guild_id = public.current_member_guild_id()
    )
  );

DROP POLICY IF EXISTS "due_change_logs_select_own" ON public.due_change_logs;
CREATE POLICY "due_change_logs_select_own"
  ON public.due_change_logs FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM public.members WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "due_change_logs_select_manager_admin" ON public.due_change_logs;
CREATE POLICY "due_change_logs_select_same_guild_manager"
  ON public.due_change_logs FOR SELECT TO authenticated
  USING (
    public.is_manager_or_admin()
    AND EXISTS (
      SELECT 1 FROM public.dues d
      WHERE d.id = due_id
        AND d.guild_id = public.current_member_guild_id()
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: expense child
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "expense_change_logs_select_authenticated" ON public.expense_change_logs;
CREATE POLICY "expense_change_logs_select_same_guild"
  ON public.expense_change_logs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_id
        AND e.guild_id = public.current_member_guild_id()
    )
  );

-- ---------------------------------------------------------------------------
-- RLS: guild_finance_setting_logs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "guild_finance_setting_logs_select_manager_admin" ON public.guild_finance_setting_logs;
CREATE POLICY "guild_finance_setting_logs_select_same_guild"
  ON public.guild_finance_setting_logs FOR SELECT TO authenticated
  USING (
    public.is_manager_or_admin()
    AND guild_id = public.current_member_guild_id()
  );

COMMENT ON COLUMN public.settlements.guild_id IS '테넌트(혈맹) — Phase 3';
COMMENT ON COLUMN public.dues.guild_id IS '테넌트(혈맹) — Phase 3';
COMMENT ON COLUMN public.expenses.guild_id IS '테넌트(혈맹) — Phase 3';
COMMENT ON COLUMN public.ledger_entries.guild_id IS '테넌트(혈맹) — Phase 3';
