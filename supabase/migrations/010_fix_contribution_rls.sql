-- Phase 4 보정: contribution_score_settings same-guild RLS only
-- 010_admin_settings_multitenant_phase4.sql 전체 재실행 금지 — 본 파일만 SQL Editor에서 실행.
-- 001~009 (+ 010 partial) 실행 후 사용. storage / guild_profile_settings / guilds COMMENT 미포함.

-- Legacy global SELECT (005)
DROP POLICY IF EXISTS "contribution_score_settings_select_authenticated"
  ON public.contribution_score_settings;

-- Idempotent re-run: drop target policy if already created by partial 010 apply
DROP POLICY IF EXISTS "contribution_score_settings_select_same_guild"
  ON public.contribution_score_settings;

CREATE POLICY "contribution_score_settings_select_same_guild"
  ON public.contribution_score_settings
  FOR SELECT
  TO authenticated
  USING (guild_id = public.current_member_guild_id());

-- authenticated: SELECT only (005 GRANT unchanged). INSERT/UPDATE/DELETE 미부여.
-- service_role: RLS bypass + 기존 GRANT ALL 유지.
