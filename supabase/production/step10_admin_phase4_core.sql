-- Production Step 10 (대체): 010_admin_settings_multitenant_phase4.sql 의 owner-safe 부분만
-- 010 전체 실행 시 `COMMENT ON TABLE storage.objects` 에서 42501 owner 오류가 나면
-- 본 파일만 실행한 뒤 Step 11(010_fix)로 진행하세요.
-- storage.objects COMMENT 는 문서용이며 보안/스키마에 필수 아님.

-- contribution_score_settings — same-guild SELECT
DROP POLICY IF EXISTS "contribution_score_settings_select_authenticated" ON public.contribution_score_settings;
CREATE POLICY "contribution_score_settings_select_same_guild"
  ON public.contribution_score_settings FOR SELECT TO authenticated
  USING (guild_id = public.current_member_guild_id());

-- guild_profile_settings — deprecated
COMMENT ON TABLE public.guild_profile_settings IS
  'DEPRECATED Phase 4 — SaaS uses guilds.guild_name / guilds.guild_mark_path. App no longer reads this table.';

DROP POLICY IF EXISTS "guild_profile_settings_select_authenticated" ON public.guild_profile_settings;
REVOKE SELECT ON public.guild_profile_settings FROM authenticated;

COMMENT ON COLUMN public.guilds.guild_mark_path IS
  'Supabase Storage path (bucket guild-assets): guilds/{guild_id}/marks/{timestamp}.{ext}';
