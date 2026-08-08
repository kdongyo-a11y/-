-- Phase 4: admin settings / guild profile tenant isolation
-- 신규 SaaS Supabase 전용. 001~009 실행 후 본 파일을 실행하세요.
-- guild_profile_settings singleton은 DROP하지 않고 deprecated 처리 (앱은 guilds 사용)

-- ---------------------------------------------------------------------------
-- contribution_score_settings — same-guild SELECT (005 global policy 대체)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "contribution_score_settings_select_authenticated" ON public.contribution_score_settings;
CREATE POLICY "contribution_score_settings_select_same_guild"
  ON public.contribution_score_settings FOR SELECT TO authenticated
  USING (guild_id = public.current_member_guild_id());

-- ---------------------------------------------------------------------------
-- guild_profile_settings — deprecated (Phase 4: source of truth = guilds)
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.guild_profile_settings IS
  'DEPRECATED Phase 4 — SaaS uses guilds.guild_name / guilds.guild_mark_path. App no longer reads this table.';

DROP POLICY IF EXISTS "guild_profile_settings_select_authenticated" ON public.guild_profile_settings;
REVOKE SELECT ON public.guild_profile_settings FROM authenticated;

COMMENT ON COLUMN public.guilds.guild_mark_path IS
  'Supabase Storage path (bucket guild-assets): guilds/{guild_id}/marks/{timestamp}.{ext}';

-- ---------------------------------------------------------------------------
-- Storage: tenant path convention (writes via Service Role API + path validation)
-- Public read on guild-assets bucket unchanged (006)
-- ---------------------------------------------------------------------------
COMMENT ON TABLE storage.objects IS
  'Guild marks use path prefix guilds/{guild_id}/marks/ — API validates actor guild on write/delete';
