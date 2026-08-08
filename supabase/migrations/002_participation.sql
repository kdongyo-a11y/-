-- 레드원 혈맹 관리 — 보스타임 / 공성 참여 기록
-- Supabase Dashboard → SQL Editor에서 001_members.sql 실행 후 본 파일을 실행하세요.
-- 기존 members / Auth 데이터는 변경·삭제하지 않습니다.

-- ---------------------------------------------------------------------------
-- boss_events — 날짜별 실제 보스타임 이벤트 (시간표 정의는 코드 상수)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.boss_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date DATE NOT NULL,
  slot_hour INTEGER NOT NULL CHECK (slot_hour >= 0 AND slot_hour <= 23),
  slot_type TEXT NOT NULL CHECK (slot_type IN ('general', 'main')),
  participation_status TEXT NOT NULL DEFAULT 'idle'
    CHECK (participation_status IN ('idle', 'open', 'closed')),
  check_code TEXT,
  check_started_at TIMESTAMPTZ,
  check_closed_at TIMESTAMPTZ,
  income_status TEXT NOT NULL DEFAULT 'unprocessed'
    CHECK (income_status IN ('unprocessed', 'no_income', 'income_declared')),
  extra_main_bosses TEXT[] NOT NULL DEFAULT '{}',
  income_closed_at TIMESTAMPTZ,
  income_closed_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT boss_events_date_hour_unique UNIQUE (event_date, slot_hour)
);

CREATE INDEX IF NOT EXISTS boss_events_event_date_idx ON public.boss_events (event_date);
CREATE INDEX IF NOT EXISTS boss_events_participation_status_idx ON public.boss_events (participation_status);

DROP TRIGGER IF EXISTS boss_events_set_updated_at ON public.boss_events;
CREATE TRIGGER boss_events_set_updated_at
  BEFORE UPDATE ON public.boss_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- boss_participations — 보스타임 참여자
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.boss_participations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boss_event_id UUID NOT NULL REFERENCES public.boss_events(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('code', 'manual')),
  status TEXT NOT NULL DEFAULT 'participated'
    CHECK (status IN ('participated', 'excluded')),
  memo TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT boss_participations_event_member_unique UNIQUE (boss_event_id, member_id)
);

CREATE INDEX IF NOT EXISTS boss_participations_member_id_idx ON public.boss_participations (member_id);
CREATE INDEX IF NOT EXISTS boss_participations_boss_event_id_idx ON public.boss_participations (boss_event_id);

DROP TRIGGER IF EXISTS boss_participations_set_updated_at ON public.boss_participations;
CREATE TRIGGER boss_participations_set_updated_at
  BEFORE UPDATE ON public.boss_participations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- boss_participation_logs — 관리자 수동 추가/제외 기록
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.boss_participation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boss_event_id UUID NOT NULL REFERENCES public.boss_events(id) ON DELETE CASCADE,
  target_member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  before_state TEXT NOT NULL CHECK (before_state IN ('미참여', '참여')),
  after_state TEXT NOT NULL CHECK (after_state IN ('미참여', '참여')),
  memo TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL CHECK (action IN ('수동추가', '수동제외')),
  created_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS boss_participation_logs_event_idx ON public.boss_participation_logs (boss_event_id);

-- ---------------------------------------------------------------------------
-- boss_event_spawns — 메인타임 추가 스폰 보스 (선택적 기록)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.boss_event_spawns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  boss_event_id UUID NOT NULL REFERENCES public.boss_events(id) ON DELETE CASCADE,
  boss_name TEXT NOT NULL,
  spawned BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT boss_event_spawns_unique UNIQUE (boss_event_id, boss_name)
);

-- ---------------------------------------------------------------------------
-- siege_events — 공성 이벤트 (주차별)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.siege_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date DATE NOT NULL,
  start_time TIME NOT NULL DEFAULT '20:00',
  end_time TIME NOT NULL DEFAULT '21:00',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'survey_open', 'survey_closed', 'attendance_confirming',
      'attendance_confirmed', 'settling', 'completed'
    )),
  survey_opened_at TIMESTAMPTZ,
  survey_closed_at TIMESTAMPTZ,
  attendance_confirmed_at TIMESTAMPTZ,
  income_status TEXT NOT NULL DEFAULT 'unprocessed'
    CHECK (income_status IN ('unprocessed', 'no_income', 'income_declared')),
  settlement_status TEXT NOT NULL DEFAULT 'none'
    CHECK (settlement_status IN ('none', 'in_progress', 'completed')),
  settlement_source_key TEXT,
  memo TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT siege_events_event_date_unique UNIQUE (event_date)
);

CREATE INDEX IF NOT EXISTS siege_events_event_date_idx ON public.siege_events (event_date);
CREATE INDEX IF NOT EXISTS siege_events_status_idx ON public.siege_events (status);

DROP TRIGGER IF EXISTS siege_events_set_updated_at ON public.siege_events;
CREATE TRIGGER siege_events_set_updated_at
  BEFORE UPDATE ON public.siege_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- siege_surveys — 공성 사전 참여조사 (기여도/분배 대상 아님)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.siege_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  siege_event_id UUID NOT NULL REFERENCES public.siege_events(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  response TEXT NOT NULL CHECK (response IN ('attending', 'not_attending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT siege_surveys_event_member_unique UNIQUE (siege_event_id, member_id)
);

CREATE INDEX IF NOT EXISTS siege_surveys_member_id_idx ON public.siege_surveys (member_id);

DROP TRIGGER IF EXISTS siege_surveys_set_updated_at ON public.siege_surveys;
CREATE TRIGGER siege_surveys_set_updated_at
  BEFORE UPDATE ON public.siege_surveys
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- siege_participations — 공성 실제 참여 (기여도 +2 / 분배 대상)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.siege_participations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  siege_event_id UUID NOT NULL REFERENCES public.siege_events(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'participated'
    CHECK (status IN ('participated', 'excluded')),
  source TEXT NOT NULL CHECK (source IN ('confirmed', 'manual')),
  memo TEXT,
  was_survey_intended BOOLEAN NOT NULL DEFAULT false,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT siege_participations_event_member_unique UNIQUE (siege_event_id, member_id)
);

CREATE INDEX IF NOT EXISTS siege_participations_member_id_idx ON public.siege_participations (member_id);

DROP TRIGGER IF EXISTS siege_participations_set_updated_at ON public.siege_participations;
CREATE TRIGGER siege_participations_set_updated_at
  BEFORE UPDATE ON public.siege_participations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- siege_admin_logs — 사전조사 관리자 수정
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.siege_admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  siege_event_id UUID NOT NULL REFERENCES public.siege_events(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('survey', 'attendance')),
  target_member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  before_state TEXT NOT NULL DEFAULT '',
  after_state TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- siege_attendance_logs — 참여확정 후 ADD/REMOVE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.siege_attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  siege_event_id UUID NOT NULL REFERENCES public.siege_events(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK (change_type IN ('ADD', 'REMOVE')),
  before_state TEXT NOT NULL DEFAULT '',
  after_state TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES public.members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- RLS — authenticated: SELECT only / writes: Service Role API
-- ---------------------------------------------------------------------------
ALTER TABLE public.boss_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boss_participations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boss_participation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boss_event_spawns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siege_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siege_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siege_participations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siege_admin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siege_attendance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "boss_events_select_authenticated" ON public.boss_events;
CREATE POLICY "boss_events_select_authenticated"
  ON public.boss_events FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "boss_participations_select_authenticated" ON public.boss_participations;
CREATE POLICY "boss_participations_select_authenticated"
  ON public.boss_participations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "boss_participation_logs_select_authenticated" ON public.boss_participation_logs;
CREATE POLICY "boss_participation_logs_select_authenticated"
  ON public.boss_participation_logs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "boss_event_spawns_select_authenticated" ON public.boss_event_spawns;
CREATE POLICY "boss_event_spawns_select_authenticated"
  ON public.boss_event_spawns FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "siege_events_select_authenticated" ON public.siege_events;
CREATE POLICY "siege_events_select_authenticated"
  ON public.siege_events FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "siege_surveys_select_authenticated" ON public.siege_surveys;
CREATE POLICY "siege_surveys_select_authenticated"
  ON public.siege_surveys FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "siege_participations_select_authenticated" ON public.siege_participations;
CREATE POLICY "siege_participations_select_authenticated"
  ON public.siege_participations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "siege_admin_logs_select_authenticated" ON public.siege_admin_logs;
CREATE POLICY "siege_admin_logs_select_authenticated"
  ON public.siege_admin_logs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "siege_attendance_logs_select_authenticated" ON public.siege_attendance_logs;
CREATE POLICY "siege_attendance_logs_select_authenticated"
  ON public.siege_attendance_logs FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.boss_events FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.boss_participations FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.boss_participation_logs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.boss_event_spawns FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.siege_events FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.siege_surveys FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.siege_participations FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.siege_admin_logs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.siege_attendance_logs FROM authenticated;

COMMENT ON TABLE public.boss_events IS '날짜별 보스타임 운영 이벤트 (시간표는 lib/boss-time-slots.ts)';
COMMENT ON TABLE public.siege_events IS '주차별 공성 운영 이벤트';
COMMENT ON TABLE public.siege_surveys IS '공성 사전조사 — 기여도/분배 대상 아님';
