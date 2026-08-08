-- Phase 5.5: game_servers + guilds.server_id + login identity (server_id + guild_name)
-- 001~011 및 010_fix 실행 후. Supabase SQL Editor에서 수동 실행.

-- ---------------------------------------------------------------------------
-- game_servers (master)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.game_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_servers_status_sort_idx
  ON public.game_servers (status, sort_order);

DROP TRIGGER IF EXISTS game_servers_set_updated_at ON public.game_servers;
CREATE TRIGGER game_servers_set_updated_at
  BEFORE UPDATE ON public.game_servers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.game_servers IS 'Phase 5.5 — 게임 서버 master (로그인/혈맹 생성 서버 선택)';

-- ---------------------------------------------------------------------------
-- 31개 서버 seed (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO public.game_servers (server_name, sort_order) VALUES
  ('데포루쥬', 1),
  ('켄라우헬', 2),
  ('질리언', 3),
  ('이실로테', 4),
  ('조우', 5),
  ('하딘', 6),
  ('케레니스', 7),
  ('오웬', 8),
  ('크리스터', 9),
  ('아툰', 10),
  ('가드리아', 11),
  ('군터', 12),
  ('아스테어', 13),
  ('듀크데필', 14),
  ('발센', 15),
  ('어레인', 16),
  ('캐스톨', 17),
  ('세바스챤', 18),
  ('데컨', 19),
  ('아인하사드', 20),
  ('파아그리오', 21),
  ('에바', 22),
  ('사이하', 23),
  ('마프르', 24),
  ('린델', 25),
  ('하이네', 26),
  ('로엔그린', 27),
  ('발라카스', 28),
  ('오렌', 29),
  ('안타라스', 30),
  ('글루디오', 31)
ON CONFLICT (server_name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- guilds.server_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.guilds
  ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES public.game_servers(id);

-- 테스트 fixture RED/BLUE/GREEN → 데포루쥬 서버 + guild_name 로그인용 정리
UPDATE public.guilds g
SET server_id = s.id,
    guild_name = CASE g.guild_code
      WHEN 'RED' THEN '레드'
      WHEN 'BLUE' THEN '블루'
      WHEN 'GREEN' THEN '그린'
      ELSE g.guild_name
    END
FROM public.game_servers s
WHERE s.server_name = '데포루쥬'
  AND g.guild_code IN ('RED', 'BLUE', 'GREEN');

-- 혹시 남은 orphan guild (server_id NULL) → 데포루쥬
UPDATE public.guilds g
SET server_id = s.id
FROM public.game_servers s
WHERE s.server_name = '데포루쥬'
  AND g.server_id IS NULL;

ALTER TABLE public.guilds
  ALTER COLUMN server_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS guilds_server_id_idx ON public.guilds (server_id);

-- 전역 guild_code UNIQUE 제거 → (server_id, guild_code) 내부 식별용 UNIQUE
ALTER TABLE public.guilds
  DROP CONSTRAINT IF EXISTS guilds_guild_code_unique;

DROP INDEX IF EXISTS guilds_server_guild_code_unique;
CREATE UNIQUE INDEX IF NOT EXISTS guilds_server_guild_code_unique
  ON public.guilds (server_id, guild_code);

-- 로그인 identity: (server_id, guild_name) UNIQUE
DROP INDEX IF EXISTS guilds_server_guild_name_unique;
CREATE UNIQUE INDEX guilds_server_guild_name_unique
  ON public.guilds (server_id, guild_name);

COMMENT ON COLUMN public.guilds.server_id IS 'Phase 5.5 — game_servers.id';
COMMENT ON COLUMN public.guilds.guild_name IS '로그인 identity (server_id + guild_name) — 생성 후 변경 불가';
COMMENT ON COLUMN public.guilds.guild_code IS '내부 식별용 코드 — 로그인/UI에 미노출';

-- ---------------------------------------------------------------------------
-- game_servers RLS — active 목록 public read
-- ---------------------------------------------------------------------------
ALTER TABLE public.game_servers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "game_servers_select_active" ON public.game_servers;
CREATE POLICY "game_servers_select_active"
  ON public.game_servers
  FOR SELECT
  TO anon, authenticated
  USING (status = 'active');

REVOKE INSERT, UPDATE, DELETE ON public.game_servers FROM anon, authenticated;
GRANT SELECT ON TABLE public.game_servers TO anon, authenticated;
GRANT ALL ON TABLE public.game_servers TO service_role;
