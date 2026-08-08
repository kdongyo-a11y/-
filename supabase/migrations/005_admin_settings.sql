-- 레드원 혈맹 관리 — 기초데이터 / 기여도 점수 설정
-- 004_finance.sql 실행 후 본 파일을 실행하세요.

CREATE TABLE IF NOT EXISTS public.guild_finance_setting_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  previous_opening_balance BIGINT NOT NULL,
  new_opening_balance BIGINT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guild_finance_setting_logs_created_at_idx
  ON public.guild_finance_setting_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS public.contribution_score_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  general_boss_score NUMERIC(5, 2) NOT NULL
    CHECK (general_boss_score >= 0 AND general_boss_score <= 100),
  main_boss_score NUMERIC(5, 2) NOT NULL
    CHECK (main_boss_score >= 0 AND main_boss_score <= 100),
  siege_score NUMERIC(5, 2) NOT NULL
    CHECK (siege_score >= 0 AND siege_score <= 100),
  effective_from DATE NOT NULL,
  created_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contribution_score_settings_effective_from_unique UNIQUE (effective_from)
);

CREATE INDEX IF NOT EXISTS contribution_score_settings_effective_from_idx
  ON public.contribution_score_settings (effective_from DESC);

INSERT INTO public.contribution_score_settings (
  general_boss_score,
  main_boss_score,
  siege_score,
  effective_from
)
VALUES (1, 1.5, 2, '2000-01-01')
ON CONFLICT (effective_from) DO NOTHING;

ALTER TABLE public.guild_finance_setting_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_score_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guild_finance_setting_logs_select_manager_admin" ON public.guild_finance_setting_logs;
CREATE POLICY "guild_finance_setting_logs_select_manager_admin"
  ON public.guild_finance_setting_logs FOR SELECT TO authenticated
  USING (public.is_manager_or_admin());

DROP POLICY IF EXISTS "contribution_score_settings_select_authenticated" ON public.contribution_score_settings;
CREATE POLICY "contribution_score_settings_select_authenticated"
  ON public.contribution_score_settings FOR SELECT TO authenticated
  USING (true);

REVOKE ALL ON public.guild_finance_setting_logs FROM authenticated;
GRANT SELECT ON public.guild_finance_setting_logs TO authenticated;

REVOKE ALL ON public.contribution_score_settings FROM authenticated;
GRANT SELECT ON public.contribution_score_settings TO authenticated;

GRANT USAGE ON SCHEMA public TO service_role;

GRANT ALL ON TABLE public.guild_finance_setting_logs TO service_role;
GRANT ALL ON TABLE public.contribution_score_settings TO service_role;
