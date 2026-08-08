-- boss/finance API 쓰기 실패(permission denied) 시 SQL Editor에서 실행하세요.
-- 002_participation.sql, 003_settlements.sql, 004_finance.sql 실행 후 필요 시 본 파일을 실행합니다.

GRANT USAGE ON SCHEMA public TO service_role;

GRANT ALL ON TABLE public.boss_events TO service_role;
GRANT ALL ON TABLE public.boss_participations TO service_role;
GRANT ALL ON TABLE public.boss_participation_logs TO service_role;
GRANT ALL ON TABLE public.boss_event_spawns TO service_role;
GRANT ALL ON TABLE public.siege_events TO service_role;
GRANT ALL ON TABLE public.siege_surveys TO service_role;
GRANT ALL ON TABLE public.siege_participations TO service_role;
GRANT ALL ON TABLE public.siege_admin_logs TO service_role;
GRANT ALL ON TABLE public.siege_attendance_logs TO service_role;

GRANT ALL ON TABLE public.settlements TO service_role;
GRANT ALL ON TABLE public.settlement_members TO service_role;
GRANT ALL ON TABLE public.settlement_revisions TO service_role;
GRANT ALL ON TABLE public.settlement_modification_logs TO service_role;

GRANT ALL ON TABLE public.guild_finance_settings TO service_role;
GRANT ALL ON TABLE public.dues TO service_role;
GRANT ALL ON TABLE public.due_members TO service_role;
GRANT ALL ON TABLE public.due_change_logs TO service_role;
GRANT ALL ON TABLE public.expenses TO service_role;
GRANT ALL ON TABLE public.expense_change_logs TO service_role;
GRANT ALL ON TABLE public.ledger_entries TO service_role;

GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;
