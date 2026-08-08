-- Phase 7.2: Production-safe final service_role grants (idempotent)
-- 신규 production Supabase에서 001~013 실행 후 본 파일을 실행하세요.
-- owner-sensitive storage.objects COMMENT 미포함.
-- 002_fix_service_role_grants.sql (Step 15)와 중복 가능 — GRANT는 idempotent.

GRANT USAGE ON SCHEMA public TO service_role;

GRANT ALL ON TABLE public.members TO service_role;
GRANT ALL ON TABLE public.guilds TO service_role;
GRANT ALL ON TABLE public.game_servers TO service_role;

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
GRANT ALL ON TABLE public.guild_finance_setting_logs TO service_role;
GRANT ALL ON TABLE public.dues TO service_role;
GRANT ALL ON TABLE public.due_members TO service_role;
GRANT ALL ON TABLE public.due_change_logs TO service_role;
GRANT ALL ON TABLE public.expenses TO service_role;
GRANT ALL ON TABLE public.expense_change_logs TO service_role;
GRANT ALL ON TABLE public.ledger_entries TO service_role;

GRANT ALL ON TABLE public.contribution_score_settings TO service_role;
GRANT ALL ON TABLE public.guild_profile_settings TO service_role;
GRANT ALL ON TABLE public.guild_export_logs TO service_role;

GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_manager_or_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.current_member_guild_id() TO service_role;
