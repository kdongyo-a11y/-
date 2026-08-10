-- Phase 9c extension — 동일 effective_from 중복 예약 방지 + 혈맹원 조회 RLS
-- SQL Editor에서 수동 실행. 자동 migration runner 사용 금지.

CREATE UNIQUE INDEX IF NOT EXISTS guild_operation_policy_versions_guild_effective_active_unique
  ON public.guild_operation_policy_versions (guild_id, effective_from)
  WHERE cancelled_at IS NULL;

COMMENT ON INDEX public.guild_operation_policy_versions_guild_effective_active_unique IS
  '동일 guild·시행 시각의 활성(미취소) 예약 정책 중복 금지';

-- authenticated 혈맹원: 같은 guild 정책 version 조회 허용 (수정은 service_role 전용)
DROP POLICY IF EXISTS "guild_operation_policy_versions_select_same_guild"
  ON public.guild_operation_policy_versions;
CREATE POLICY "guild_operation_policy_versions_select_same_guild"
  ON public.guild_operation_policy_versions FOR SELECT TO authenticated
  USING (
    guild_id IN (
      SELECT m.guild_id
      FROM public.members m
      WHERE m.auth_user_id = auth.uid()
        AND m.status = '활동'
    )
  );
