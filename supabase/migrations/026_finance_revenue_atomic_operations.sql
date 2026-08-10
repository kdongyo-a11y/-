-- Finance 2.0-A+ — atomic revenue item / receipt operations (025 이후 실행)
-- 025 = schema, 026 = transaction functions

-- ---------------------------------------------------------------------------
-- insert_settlement_revenue_items_batch
-- 정산 생성 직후 revenue items 일괄 insert (단일 transaction)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.insert_settlement_revenue_items_batch(
  p_guild_id UUID,
  p_settlement_id UUID,
  p_actor_id UUID,
  p_items JSONB
)
RETURNS SETOF public.settlement_revenue_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_income BIGINT;
  v_existing_count INT;
  v_batch_count INT;
  v_amount_sum BIGINT;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'empty_items_batch';
  END IF;

  SELECT s.total_income INTO v_total_income
  FROM public.settlements s
  WHERE s.id = p_settlement_id
    AND s.guild_id = p_guild_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'settlement_not_found';
  END IF;

  SELECT COUNT(*) INTO v_existing_count
  FROM public.settlement_revenue_items
  WHERE settlement_id = p_settlement_id
    AND guild_id = p_guild_id;

  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'revenue_items_already_exist';
  END IF;

  SELECT COUNT(*) INTO v_batch_count
  FROM jsonb_array_elements(p_items) elem;

  SELECT COALESCE(SUM((elem->>'amount')::BIGINT), 0) INTO v_amount_sum
  FROM jsonb_array_elements(p_items) elem
  WHERE COALESCE(trim(elem->>'description'), '') <> ''
    AND (elem->>'amount')::BIGINT > 0;

  IF v_batch_count <> (
    SELECT COUNT(*)
    FROM jsonb_array_elements(p_items) elem
    WHERE COALESCE(trim(elem->>'description'), '') <> ''
      AND (elem->>'amount')::BIGINT > 0
  ) THEN
    RAISE EXCEPTION 'invalid_item_row';
  END IF;

  IF v_amount_sum <> v_total_income THEN
    RAISE EXCEPTION 'amount_sum_mismatch';
  END IF;

  RETURN QUERY
  INSERT INTO public.settlement_revenue_items (
    guild_id,
    settlement_id,
    description,
    quantity,
    unit_price,
    amount,
    memo,
    sort_order,
    created_by
  )
  SELECT
    p_guild_id,
    p_settlement_id,
    trim(elem->>'description'),
    NULLIF(elem->>'quantity', '')::NUMERIC,
    NULLIF(elem->>'unit_price', '')::BIGINT,
    (elem->>'amount')::BIGINT,
    COALESCE(trim(elem->>'memo'), ''),
    COALESCE((elem->>'sort_order')::INT, ordinality - 1),
    p_actor_id
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(elem, ordinality)
  RETURNING *;
END;
$$;

-- ---------------------------------------------------------------------------
-- update_settlement_revenue_item_amounts
-- 전체 item amount batch UPDATE (단일 transaction, settlement row lock)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_settlement_revenue_item_amounts(
  p_guild_id UUID,
  p_settlement_id UUID,
  p_amount_items JSONB
)
RETURNS SETOF public.settlement_revenue_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_income BIGINT;
  v_receipt_sum BIGINT;
  v_item_count INT;
  v_matched_count INT;
  v_amount_sum BIGINT;
BEGIN
  IF p_amount_items IS NULL OR jsonb_typeof(p_amount_items) <> 'array' OR jsonb_array_length(p_amount_items) = 0 THEN
    RAISE EXCEPTION 'empty_amount_batch';
  END IF;

  SELECT s.total_income INTO v_total_income
  FROM public.settlements s
  WHERE s.id = p_settlement_id
    AND s.guild_id = p_guild_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'settlement_not_found';
  END IF;

  SELECT COALESCE(SUM(r.amount), 0) INTO v_receipt_sum
  FROM public.settlement_revenue_receipts r
  WHERE r.settlement_id = p_settlement_id
    AND r.guild_id = p_guild_id;

  IF v_receipt_sum > 0 THEN
    RAISE EXCEPTION 'receipts_exist';
  END IF;

  SELECT COUNT(*) INTO v_item_count
  FROM public.settlement_revenue_items
  WHERE settlement_id = p_settlement_id
    AND guild_id = p_guild_id;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'no_revenue_items';
  END IF;

  IF jsonb_array_length(p_amount_items) <> v_item_count THEN
    RAISE EXCEPTION 'incomplete_amount_batch';
  END IF;

  SELECT COUNT(*), COALESCE(SUM((elem->>'amount')::BIGINT), 0)
  INTO v_matched_count, v_amount_sum
  FROM jsonb_array_elements(p_amount_items) elem
  INNER JOIN public.settlement_revenue_items i
    ON i.id = (elem->>'id')::UUID
   AND i.settlement_id = p_settlement_id
   AND i.guild_id = p_guild_id
  WHERE (elem->>'amount')::BIGINT > 0;

  IF v_matched_count <> v_item_count THEN
    RAISE EXCEPTION 'invalid_item_ids';
  END IF;

  IF v_amount_sum <> v_total_income THEN
    RAISE EXCEPTION 'amount_sum_mismatch';
  END IF;

  PERFORM i.id
  FROM public.settlement_revenue_items i
  WHERE i.settlement_id = p_settlement_id
    AND i.guild_id = p_guild_id
  FOR UPDATE;

  UPDATE public.settlement_revenue_items i
  SET
    amount = (elem->>'amount')::BIGINT,
    updated_at = now()
  FROM jsonb_array_elements(p_amount_items) elem
  WHERE i.id = (elem->>'id')::UUID
    AND i.settlement_id = p_settlement_id
    AND i.guild_id = p_guild_id;

  RETURN QUERY
  SELECT *
  FROM public.settlement_revenue_items
  WHERE settlement_id = p_settlement_id
    AND guild_id = p_guild_id
  ORDER BY sort_order;
END;
$$;

-- ---------------------------------------------------------------------------
-- insert_settlement_revenue_receipt_locked
-- receipt insert + total_income cap (settlement row lock, 단일 transaction)
-- cash movement는 API(service_role)에서 receipt id 기준으로 후속 insert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.insert_settlement_revenue_receipt_locked(
  p_guild_id UUID,
  p_settlement_id UUID,
  p_actor_id UUID,
  p_amount BIGINT,
  p_received_at TIMESTAMPTZ,
  p_memo TEXT DEFAULT ''
)
RETURNS public.settlement_revenue_receipts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_income BIGINT;
  v_received_sum BIGINT;
  v_row public.settlement_revenue_receipts;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_receipt_amount';
  END IF;

  SELECT s.total_income INTO v_total_income
  FROM public.settlements s
  WHERE s.id = p_settlement_id
    AND s.guild_id = p_guild_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'settlement_not_found';
  END IF;

  SELECT COALESCE(SUM(r.amount), 0) INTO v_received_sum
  FROM public.settlement_revenue_receipts r
  WHERE r.settlement_id = p_settlement_id
    AND r.guild_id = p_guild_id;

  IF v_received_sum + p_amount > v_total_income THEN
    RAISE EXCEPTION 'receipt_exceeds_total_income';
  END IF;

  INSERT INTO public.settlement_revenue_receipts (
    guild_id,
    settlement_id,
    amount,
    received_at,
    confirmed_by,
    memo
  )
  VALUES (
    p_guild_id,
    p_settlement_id,
    p_amount,
    p_received_at,
    p_actor_id,
    COALESCE(trim(p_memo), '')
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- rollback_settlement_create
-- revenueItems create 실패 시 compensating delete (단일 transaction)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rollback_settlement_create(
  p_guild_id UUID,
  p_settlement_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.settlements
    WHERE id = p_settlement_id AND guild_id = p_guild_id
  ) THEN
    RETURN;
  END IF;

  DELETE FROM public.settlement_revenue_items
  WHERE settlement_id = p_settlement_id AND guild_id = p_guild_id;

  DELETE FROM public.settlement_revenue_receipts
  WHERE settlement_id = p_settlement_id AND guild_id = p_guild_id;

  DELETE FROM public.settlement_management_payments
  WHERE settlement_id = p_settlement_id AND guild_id = p_guild_id;

  DELETE FROM public.settlement_members
  WHERE settlement_id = p_settlement_id;

  DELETE FROM public.settlement_revisions
  WHERE settlement_id = p_settlement_id;

  DELETE FROM public.settlement_modification_logs
  WHERE settlement_id = p_settlement_id;

  DELETE FROM public.settlements
  WHERE id = p_settlement_id AND guild_id = p_guild_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_settlement_revenue_items_batch(UUID, UUID, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_settlement_revenue_item_amounts(UUID, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_settlement_revenue_receipt_locked(UUID, UUID, UUID, BIGINT, TIMESTAMPTZ, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rollback_settlement_create(UUID, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.insert_settlement_revenue_items_batch(UUID, UUID, UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_settlement_revenue_item_amounts(UUID, UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.insert_settlement_revenue_receipt_locked(UUID, UUID, UUID, BIGINT, TIMESTAMPTZ, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.rollback_settlement_create(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.insert_settlement_revenue_items_batch IS
  'Finance 2.0-A+: 정산 생성 직후 revenue items atomic insert';
COMMENT ON FUNCTION public.update_settlement_revenue_item_amounts IS
  'Finance 2.0-A+: revenue item amount batch UPDATE — receipt 존재 시 reject, SUM invariant';
COMMENT ON FUNCTION public.insert_settlement_revenue_receipt_locked IS
  'Finance 2.0-A+: settlement lock 하 receipt insert — concurrent over-total 방지';
COMMENT ON FUNCTION public.rollback_settlement_create IS
  'Finance 2.0-A+: revenueItems create 실패 compensating delete (단일 transaction)';
