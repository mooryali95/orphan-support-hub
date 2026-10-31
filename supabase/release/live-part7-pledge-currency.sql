-- =====================================================================
-- «ادعم في دقيقتين»: التعهّد بعملة الفجوة، وقياس الزمن حتى التسجيل
-- ---------------------------------------------------------------------
-- المبلغ المقترح يأتي من فجوة المكان بعملتها (geo_stats.gap/currency)،
-- فيحمل التعهّد العملة نفسها بدل EUR الافتراضية. والزمن من أوّل فتحٍ
-- للمسار حتى التسجيل يُحفظ بالثواني ليُقاس المقياس «≤ ١٢٠ ثانية».
-- الدالة تُستبدل بتوقيعٍ أوسع (معاملان اختياريان) فتبقى النداءات القديمة
-- صالحة؛ ويُحذف التوقيع القديم فلا يلتبس التحليل.
-- =====================================================================

ALTER TABLE public.support_pledges
  ADD COLUMN IF NOT EXISTS elapsed_seconds INTEGER
    CHECK (elapsed_seconds IS NULL OR (elapsed_seconds >= 0 AND elapsed_seconds <= 86400));
ALTER TABLE public.support_pledges
  DROP CONSTRAINT IF EXISTS ck_pledge_currency;
ALTER TABLE public.support_pledges
  ADD CONSTRAINT ck_pledge_currency CHECK (currency ~ '^[A-Z]{3}$');

DROP FUNCTION IF EXISTS public.create_support_pledge(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_support_pledge(
  _kind TEXT, _target_type TEXT, _target TEXT, _amount NUMERIC,
  _country TEXT DEFAULT NULL, _note TEXT DEFAULT NULL,
  _currency TEXT DEFAULT 'EUR', _elapsed INTEGER DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _uid UUID := auth.uid();
  _id UUID;
  _orphan UUID; _group UUID; _org UUID; _region TEXT; _cc TEXT;
  _cur TEXT := upper(btrim(COALESCE(_currency, 'EUR')));
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;
  IF _cur !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'invalid_currency'; END IF;

  IF _target_type = 'orphan' THEN
    -- يتيمٌ معتمدٌ فقط؛ ودولته من مجموعته إن كانت مرآة، وإلا ما مُرّر.
    SELECT o.id, g.country_code INTO _orphan, _cc
      FROM public.orphans o LEFT JOIN public.mirror_groups g ON g.id = o.group_id
     WHERE o.id = _target::UUID AND o.status = 'approved';
    IF _orphan IS NULL THEN RAISE EXCEPTION 'target_not_found'; END IF;
    _cc := COALESCE(_cc, _country);
  ELSIF _target_type = 'group' THEN
    SELECT g.id, g.country_code INTO _group, _cc FROM public.mirror_groups g
     WHERE g.id = _target::UUID AND g.deleted_at IS NULL;
    IF _group IS NULL THEN RAISE EXCEPTION 'target_not_found'; END IF;
  ELSIF _target_type = 'institution' THEN
    SELECT c.id INTO _org FROM public.care_organizations c
     WHERE c.id = _target::UUID AND c.status = 'approved';
    IF _org IS NULL THEN RAISE EXCEPTION 'target_not_found'; END IF;
    _cc := _country;
  ELSIF _target_type = 'region' THEN
    _region := NULLIF(btrim(_target), '');
    IF _region IS NULL THEN RAISE EXCEPTION 'target_not_found'; END IF;
    _cc := _country;
  ELSIF _target_type = 'country' THEN
    _cc := COALESCE(NULLIF(btrim(_target), ''), _country);
  ELSE
    RAISE EXCEPTION 'invalid_target_type';
  END IF;

  -- الدعم لا يُفتح إلا في دولةٍ مفعّلة.
  IF _cc IS NULL OR NOT EXISTS (SELECT 1 FROM public.countries WHERE code = _cc AND status = 'active') THEN
    RAISE EXCEPTION 'country_not_active';
  END IF;

  INSERT INTO public.support_pledges
    (supporter_id, kind, target_type, orphan_id, group_id, org_id, country_code, region,
     amount, currency, note, elapsed_seconds)
  VALUES (_uid, _kind, _target_type, _orphan, _group, _org, _cc, _region,
          _amount, _cur, NULLIF(btrim(_note), ''),
          CASE WHEN _elapsed IS NULL THEN NULL ELSE LEAST(86400, GREATEST(0, _elapsed)) END)
  RETURNING id INTO _id;
  RETURN _id;
END $fn$;
REVOKE ALL ON FUNCTION public.create_support_pledge(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_support_pledge(TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, INTEGER)
  TO authenticated;
