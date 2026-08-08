-- 002_participation.sql 실행 후에도 PGRST205(테이블 없음) 오류가 남을 때 SQL Editor에서 실행하세요.
-- PostgREST API 스키마 캐시를 새로고침합니다.

NOTIFY pgrst, 'reload schema';

-- 아래 SELECT로 boss_events 테이블 존재 여부를 확인할 수 있습니다.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'boss_events',
    'boss_participations',
    'boss_participation_logs',
    'siege_events'
  )
ORDER BY table_name;
