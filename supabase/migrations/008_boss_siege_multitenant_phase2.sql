-- Phase 2: boss / siege 멀티테넌트 — guild_id on root events + same-guild RLS
-- 신규 SaaS Supabase 전용. 001~007 실행 후 본 파일을 실행하세요.
-- 전제: boss/siege 테이블에 기존 데이터 없음 (신규 SaaS DB)

-- ---------------------------------------------------------------------------
-- boss_events.guild_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.boss_events
  ADD COLUMN IF NOT EXISTS guild_id UUID REFERENCES public.guilds(id) ON DELETE CASCADE;

-- 신규 SaaS DB: boss_events 비어 있음 → NOT NULL 즉시 적용
ALTER TABLE public.boss_events
  ALTER COLUMN guild_id SET NOT NULL;

ALTER TABLE public.boss_events
  DROP CONSTRAINT IF EXISTS boss_events_date_hour_unique;

ALTER TABLE public.boss_events
  ADD CONSTRAINT boss_events_guild_date_hour_unique
  UNIQUE (guild_id, event_date, slot_hour);

CREATE INDEX IF NOT EXISTS boss_events_guild_id_idx ON public.boss_events (guild_id);
CREATE INDEX IF NOT EXISTS boss_events_guild_event_date_idx
  ON public.boss_events (guild_id, event_date);

-- ---------------------------------------------------------------------------
-- siege_events.guild_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.siege_events
  ADD COLUMN IF NOT EXISTS guild_id UUID REFERENCES public.guilds(id) ON DELETE CASCADE;

ALTER TABLE public.siege_events
  ALTER COLUMN guild_id SET NOT NULL;

ALTER TABLE public.siege_events
  DROP CONSTRAINT IF EXISTS siege_events_event_date_unique;

ALTER TABLE public.siege_events
  ADD CONSTRAINT siege_events_guild_event_date_unique
  UNIQUE (guild_id, event_date);

CREATE INDEX IF NOT EXISTS siege_events_guild_id_idx ON public.siege_events (guild_id);
CREATE INDEX IF NOT EXISTS siege_events_guild_event_date_idx
  ON public.siege_events (guild_id, event_date);

-- ---------------------------------------------------------------------------
-- RLS: root events — guild_id = current_member_guild_id()
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "boss_events_select_authenticated" ON public.boss_events;
CREATE POLICY "boss_events_select_same_guild"
  ON public.boss_events
  FOR SELECT
  TO authenticated
  USING (guild_id = public.current_member_guild_id());

DROP POLICY IF EXISTS "siege_events_select_authenticated" ON public.siege_events;
CREATE POLICY "siege_events_select_same_guild"
  ON public.siege_events
  FOR SELECT
  TO authenticated
  USING (guild_id = public.current_member_guild_id());

-- ---------------------------------------------------------------------------
-- RLS: child tables — parent event guild via EXISTS (denormalized guild_id 없음)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "boss_participations_select_authenticated" ON public.boss_participations;
CREATE POLICY "boss_participations_select_same_guild"
  ON public.boss_participations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.boss_events e
      WHERE e.id = boss_event_id
        AND e.guild_id = public.current_member_guild_id()
    )
  );

DROP POLICY IF EXISTS "boss_participation_logs_select_authenticated" ON public.boss_participation_logs;
CREATE POLICY "boss_participation_logs_select_same_guild"
  ON public.boss_participation_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.boss_events e
      WHERE e.id = boss_event_id
        AND e.guild_id = public.current_member_guild_id()
    )
  );

DROP POLICY IF EXISTS "boss_event_spawns_select_authenticated" ON public.boss_event_spawns;
CREATE POLICY "boss_event_spawns_select_same_guild"
  ON public.boss_event_spawns
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.boss_events e
      WHERE e.id = boss_event_id
        AND e.guild_id = public.current_member_guild_id()
    )
  );

DROP POLICY IF EXISTS "siege_surveys_select_authenticated" ON public.siege_surveys;
CREATE POLICY "siege_surveys_select_same_guild"
  ON public.siege_surveys
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.siege_events e
      WHERE e.id = siege_event_id
        AND e.guild_id = public.current_member_guild_id()
    )
  );

DROP POLICY IF EXISTS "siege_participations_select_authenticated" ON public.siege_participations;
CREATE POLICY "siege_participations_select_same_guild"
  ON public.siege_participations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.siege_events e
      WHERE e.id = siege_event_id
        AND e.guild_id = public.current_member_guild_id()
    )
  );

DROP POLICY IF EXISTS "siege_admin_logs_select_authenticated" ON public.siege_admin_logs;
CREATE POLICY "siege_admin_logs_select_same_guild"
  ON public.siege_admin_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.siege_events e
      WHERE e.id = siege_event_id
        AND e.guild_id = public.current_member_guild_id()
    )
  );

DROP POLICY IF EXISTS "siege_attendance_logs_select_authenticated" ON public.siege_attendance_logs;
CREATE POLICY "siege_attendance_logs_select_same_guild"
  ON public.siege_attendance_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.siege_events e
      WHERE e.id = siege_event_id
        AND e.guild_id = public.current_member_guild_id()
    )
  );

COMMENT ON COLUMN public.boss_events.guild_id IS '테넌트(혈맹) — Phase 2';
COMMENT ON COLUMN public.siege_events.guild_id IS '테넌트(혈맹) — Phase 2';
