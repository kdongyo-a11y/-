-- 레드원 혈맹 관리 — 혈맹 기본정보 (혈맹명 · 혈맹마크)
-- 005_admin_settings.sql 실행 후 본 파일을 실행하세요.

CREATE TABLE IF NOT EXISTS public.guild_profile_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  guild_name TEXT NOT NULL,
  guild_mark_path TEXT,
  updated_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.guild_profile_settings (id, guild_name, guild_mark_path)
VALUES (1, '레드원 혈맹', NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.guild_profile_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guild_profile_settings_select_authenticated" ON public.guild_profile_settings;
CREATE POLICY "guild_profile_settings_select_authenticated"
  ON public.guild_profile_settings FOR SELECT TO authenticated
  USING (true);

REVOKE ALL ON public.guild_profile_settings FROM authenticated;
GRANT SELECT ON public.guild_profile_settings TO authenticated;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON TABLE public.guild_profile_settings TO service_role;

-- Supabase Storage: 혈맹마크 공개 읽기, 쓰기는 Service Role(API) 전용
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'guild-assets',
  'guild-assets',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "guild_assets_public_read" ON storage.objects;
CREATE POLICY "guild_assets_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'guild-assets');

COMMENT ON TABLE public.guild_profile_settings IS '혈맹명·혈맹마크 singleton 설정 (id=1)';
COMMENT ON COLUMN public.guild_profile_settings.guild_mark_path IS 'Supabase Storage object path (bucket: guild-assets)';
