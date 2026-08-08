-- Production Step 10 core — 010_admin_settings_multitenant_phase4.sql 실패 복구용
--
-- 010 전체 재실행 금지.
-- contribution RLS → Step 11 (010_fix_contribution_rls.sql) 에서 처리 (본 파일에 미포함).
-- storage.objects / COMMENT → 미포함 (owner-sensitive 또는 문서용).
--
-- 역할: deprecated guild_profile_settings 의 global SELECT(USING true) 차단

DROP POLICY IF EXISTS "guild_profile_settings_select_authenticated"
  ON public.guild_profile_settings;

REVOKE SELECT ON public.guild_profile_settings FROM authenticated;
