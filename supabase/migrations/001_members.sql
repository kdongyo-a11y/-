-- 레드원 혈맹 관리 — members 테이블, RLS, 컬럼 단위 UPDATE 권한
-- Supabase Dashboard → SQL Editor에서 실행하세요.
--
-- 보안 모델:
--   authenticated (클라이언트): SELECT 전체 + 본인 row의 class_name, level만 UPDATE
--   manager/admin 관리 수정: 클라이언트 UPDATE 불가 → 서버 API(Service Role) 전용
--   INSERT / DELETE / 민감 컬럼 수정: Service Role 전용

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  internal_email TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL UNIQUE,
  class_name TEXT NOT NULL CHECK (class_name IN ('군주', '기사', '마법사', '요정')),
  level INTEGER NOT NULL CHECK (level >= 1 AND level <= 999),
  position TEXT NOT NULL CHECK (position IN ('군주', '부군주', '운영진', '일반')),
  join_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT '활동' CHECK (status IN ('활동', '휴면', '탈퇴')),
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'manager', 'admin')),
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('inactive', 'active', 'locked')),
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS members_nickname_idx ON public.members (nickname);
CREATE INDEX IF NOT EXISTS members_auth_user_id_idx ON public.members (auth_user_id);
CREATE INDEX IF NOT EXISTS members_status_idx ON public.members (status);

DROP TRIGGER IF EXISTS members_set_updated_at ON public.members;
CREATE TRIGGER members_set_updated_at
  BEFORE UPDATE ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자: 혈맹원 목록 조회 (roster / 관리자 목록)
DROP POLICY IF EXISTS "members_select_authenticated" ON public.members;
CREATE POLICY "members_select_authenticated"
  ON public.members
  FOR SELECT
  TO authenticated
  USING (true);

-- 본인 row UPDATE — RLS는 row 범위만 제한 (컬럼은 GRANT로 제한)
DROP POLICY IF EXISTS "members_update_own" ON public.members;
CREATE POLICY "members_update_own"
  ON public.members
  FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- manager/admin용 클라이언트 UPDATE 정책은 두지 않음 (서버 Service Role API 전용)
DROP POLICY IF EXISTS "members_update_manager_admin" ON public.members;

-- INSERT / DELETE: 클라이언트 RLS 정책 없음 → Service Role(API Route) 전용

-- ---------------------------------------------------------------------------
-- Column-level UPDATE privileges (authenticated)
-- ---------------------------------------------------------------------------
-- authenticated의 members 전체 UPDATE 권한 제거 후 class_name, level만 허용
REVOKE UPDATE ON public.members FROM authenticated;
GRANT UPDATE (class_name, level) ON public.members TO authenticated;

-- INSERT / DELETE도 클라이언트에서 불가
REVOKE INSERT, DELETE ON public.members FROM authenticated;

COMMENT ON TABLE public.members IS '레드원 혈맹원 프로필 및 계정 상태';
COMMENT ON COLUMN public.members.internal_email IS 'Supabase Auth 내부용 가상 이메일 (UI 비노출)';
COMMENT ON COLUMN public.members.must_change_password IS 'true면 최초 로그인 비밀번호 변경 필수';
