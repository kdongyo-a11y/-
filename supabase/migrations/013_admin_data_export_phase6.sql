-- Phase 6: admin data export audit log
-- 001~012 실행 후. Supabase SQL Editor에서 수동 실행.

CREATE TABLE IF NOT EXISTS public.guild_export_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id UUID NOT NULL REFERENCES public.guilds(id) ON DELETE CASCADE,
  exported_by UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL,
  date_from DATE,
  date_to DATE,
  datasets JSONB NOT NULL DEFAULT '[]'::jsonb,
  format TEXT NOT NULL DEFAULT 'xlsx',
  row_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guild_export_logs_guild_id_created_idx
  ON public.guild_export_logs (guild_id, created_at DESC);

COMMENT ON TABLE public.guild_export_logs IS 'Phase 6 — 최고관리자 XLSX export audit (파일 본문 미저장)';

ALTER TABLE public.guild_export_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.guild_export_logs FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.guild_export_logs TO service_role;
