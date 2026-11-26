-- مركز عمل فريق الدولة: الحسم الجماعي وملف الطفل — إثبات
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a9800000-0000-4000-8000-000000000001', 'cw-admin@example.test', '{}'::jsonb),
  ('a9800000-0000-4000-8000-000000000002', 'cw-sup1@example.test', '{}'::jsonb),
  ('a9800000-0000-4000-8000-000000000003', 'cw-sup2@example.test', '{}'::jsonb),
  ('a9800000-0000-4000-8000-000000000004', 'cw-entry@example.test', '{}'::jsonb),
  ('a9800000-0000-4000-8000-000000000005', 'cw-viewer@example.test', '{}'::jsonb),
  ('a9800000-0000-4000-8000-000000000006', 'cw-thai@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES ('a9800000-0000-4000-8000-000000000001', 'admin');
INSERT INTO public.operating_platforms (key, name, country_code) VALUES ('cw-sd-office', 'منصّة مكتب السودان', 'SD')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.as_user(_n INT) RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    format('{"sub":"a9800000-0000-4000-8000-00000000000%s","role":"authenticated"}', _n), true);
$$;
CREATE OR REPLACE FUNCTION pg_temp.denied(_sql TEXT) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN false;
EXCEPTION WHEN insufficient_privilege THEN RETURN true;
END $$;

DO $$
DECLARE _r JSONB; _o1 UUID; _o2 UUID; _q UUID; _low UUID[]; _crit UUID; _f JSONB; _res JSONB;
BEGIN
  PERFORM pg_temp.as_user(1);
  PERFORM public.country_staff_set('SD', 'cw-sup1@example.test', 'supervisor');
  PERFORM public.country_staff_set('SD', 'cw-sup2@example.test', 'supervisor');
  PERFORM public.country_staff_set('SD', 'cw-entry@example.test', 'data_entry');
  PERFORM public.country_staff_set('SD', 'cw-viewer@example.test', 'viewer');
  PERFORM public.country_staff_set('TH', 'cw-thai@example.test', 'supervisor');
  PERFORM public.admin_country_source_set('SD', 'cw-sd-office', 'shadow');

  -- الندوة: ملفّان؛ ثم المكتب يخالف في المرحلة والمدينة (منخفض) وتاريخ الميلاد (حرج)
  PERFORM pg_temp.as_user(4);
  PERFORM public.admin_golden_import('wamy', 'SD', NULL,
    '[{"external_ref":"cw-1","observed_at":"2026-11-01T00:00:00Z",
       "fields":{"display_name":"مريم عبد الرحمن","birth_date":"2014-05-01","gender":"female","education_stage":"الصف الثالث","city":"كسلا"}},
      {"external_ref":"cw-2","observed_at":"2026-11-01T00:00:00Z",
       "fields":{"display_name":"حمزة الطيب","birth_date":"2012-01-09","gender":"male","education_stage":"الصف الخامس"}}]'::jsonb);
  PERFORM pg_temp.as_user(2);
  PERFORM public.admin_link_create_unmatched('SD');
  SELECT orphan_id INTO _o1 FROM public.orphan_source_links WHERE source = 'wamy' AND external_ref = 'cw-1';
  SELECT orphan_id INTO _o2 FROM public.orphan_source_links WHERE source = 'wamy' AND external_ref = 'cw-2';
  PERFORM pg_temp.as_user(4);
  PERFORM public.admin_golden_import('office', 'SD', 'cw-sd-office',
    '[{"external_ref":"of-1","observed_at":"2026-11-05T00:00:00Z",
       "fields":{"display_name":"مريم عبد الرحمن","gender":"female","birth_date":"2014-06-01","education_stage":"الصف الرابع","city":"القضارف"}},
      {"external_ref":"of-2","observed_at":"2026-11-05T00:00:00Z",
       "fields":{"display_name":"حمزة الطيب","gender":"male","education_stage":"الصف السادس"}}]'::jsonb);
  PERFORM pg_temp.as_user(2);
  FOR _q IN SELECT id FROM public.source_link_queue WHERE source = 'cw-sd-office' AND status = 'pending' LOOP
    PERFORM public.admin_link_resolve(_q, 'link',
      CASE (SELECT external_ref FROM public.source_link_queue WHERE id = _q) WHEN 'of-1' THEN _o1 ELSE _o2 END);
  END LOOP;
  SELECT array_agg(id) INTO _low FROM public.data_conflicts
   WHERE orphan_id IN (_o1, _o2) AND status = 'open' AND risk <> 'critical' AND kind = 'disagreement';
  SELECT id INTO _crit FROM public.data_conflicts
   WHERE orphan_id = _o1 AND field = 'birth_date' AND status = 'open';
  IF cardinality(_low) <> 3 OR _crit IS NULL THEN
    RAISE EXCEPTION 'FAIL — التهيئة: % فروق منخفضة، حرج %', cardinality(_low), _crit;
  END IF;

  -- العزل: مشرف دولةٍ أخرى والمدخل والمطّلع لا يحسمون شيئاً، ولا يعرفون حالة البند
  PERFORM pg_temp.as_user(6);
  _r := public.admin_conflicts_resolve_bulk(_low || _crit, 'use_office');
  IF (_r->>'done')::int <> 0
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(_r->'results') x WHERE x->>'code' <> 'country_forbidden') THEN
    RAISE EXCEPTION 'FAIL — مشرف تايلاند حسم أو عرف حالة البند: %', _r;
  END IF;
  PERFORM pg_temp.as_user(4);
  IF (public.admin_conflicts_resolve_bulk(_low, 'keep')->>'done')::int <> 0 THEN RAISE EXCEPTION 'FAIL — المدخل حسم'; END IF;
  PERFORM pg_temp.as_user(5);
  IF (public.admin_conflicts_resolve_bulk(_low, 'keep')->>'done')::int <> 0 THEN RAISE EXCEPTION 'FAIL — المطّلع حسم'; END IF;
  IF EXISTS (SELECT 1 FROM public.data_conflicts WHERE id = ANY(_low) AND status <> 'open') THEN
    RAISE EXCEPTION 'FAIL — تغيّر بندٌ بلا صلاحية';
  END IF;
  RAISE NOTICE 'PASS — الحسم الجماعي بنطاق الدولة: غير المشرف ودولةٌ أخرى لا يحسمون ولا يعرفون الحالة';

  -- الحرج لا يُحسم جماعياً، حتى للإدارة
  PERFORM pg_temp.as_user(1);
  _r := public.admin_conflicts_resolve_bulk(ARRAY[_crit], 'keep');
  IF _r->'results'->0->>'code' <> 'critical_not_bulk'
     OR (SELECT status FROM public.data_conflicts WHERE id = _crit) <> 'open' THEN
    RAISE EXCEPTION 'FAIL — حُسم بندٌ حرج جماعياً: %', _r;
  END IF;
  IF public.admin_conflicts_resolve_bulk(_low, 'accept')->>'code' <> 'choice_unknown'
     OR public.admin_conflicts_resolve_bulk('{}', 'keep')->>'code' <> 'nothing_selected' THEN
    RAISE EXCEPTION 'FAIL — خيارٌ غير مسموح أو قائمة فارغة';
  END IF;
  RAISE NOTICE 'PASS — البند الحرج يُرفض جماعياً حتى للإدارة، والخيار مقصورٌ على الندوة/المكتب/الإبقاء';

  -- المشرف يحسم الفروق المنخفضة معاً بالباب نفسه، والحرج في الدفعة يُرفض وحده
  PERFORM pg_temp.as_user(2);
  _r := public.admin_conflicts_resolve_bulk(_low || _crit, 'use_office');
  IF (_r->>'done')::int <> 3 OR (_r->>'failed')::int <> 1 THEN RAISE EXCEPTION 'FAIL — الحسم الجماعي: %', _r; END IF;
  IF (SELECT education_stage FROM public.orphans WHERE id = _o2) <> 'الصف السادس'
     OR (SELECT from_role FROM public.orphan_field_state WHERE orphan_id = _o1 AND field = 'city') <> 'office'
     OR (SELECT count(*) FROM public.audit_log WHERE action = 'golden_conflict_resolve' AND entity_id IN (_o1, _o2)) < 3
     OR (SELECT status FROM public.data_conflicts WHERE id = _crit) <> 'open' THEN
    RAISE EXCEPTION 'FAIL — الحسم الجماعي لم يمرّ بالباب نفسه';
  END IF;
  _r := public.admin_conflicts_resolve_bulk(_low, 'keep');
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(_r->'results') x WHERE x->>'code' <> 'conflict_closed') THEN
    RAISE EXCEPTION 'FAIL — إعادة الحسم: %', _r;
  END IF;
  RAISE NOTICE 'PASS — المشرف يحسم الفروق معاً بقواعد الحسم الفردي، ونتيجةٌ لكل بند';

  -- ملف الطفل: المطّلع في دولته يرى القيمة ومصدرها والمصدرين والتاريخ
  PERFORM pg_temp.as_user(5);
  _f := public.country_child_file(_o1);
  SELECT x INTO _res FROM jsonb_array_elements(_f->'fields') x WHERE x->>'field' = 'city';
  IF _f->>'code' IS NULL OR _res->>'from_role' <> 'office' OR _res->'wamy'->>'value' <> 'كسلا'
     OR _res->'office'->>'value' <> 'القضارف'
     OR NOT (SELECT (x->>'open_conflict')::boolean FROM jsonb_array_elements(_f->'fields') x WHERE x->>'field' = 'birth_date')
     OR jsonb_array_length(_f->'history') < 5 THEN
    RAISE EXCEPTION 'FAIL — ملف الطفل: %', _f;
  END IF;
  IF _f::text ~ '(photo|latitude|longitude|guardian_phone)' THEN RAISE EXCEPTION 'FAIL — الملف كشف خاصّاً'; END IF;
  RAISE NOTICE 'PASS — ملف الطفل: القيمة المعتمدة ومصدرها والمصدران والتاريخ، بلا صور ولا مواقع';

  -- دولةٌ أخرى لا ترى شيئاً، ولا تفرّق بين ملفٍّ موجود ومجهول
  PERFORM pg_temp.as_user(6);
  IF NOT pg_temp.denied(format($q$SELECT public.country_child_file(%L)$q$, _o1))
     OR NOT pg_temp.denied(format($q$SELECT public.country_child_file(%L)$q$, gen_random_uuid())) THEN
    RAISE EXCEPTION 'FAIL — مشرف تايلاند رأى ملف طفلٍ في السودان';
  END IF;
  PERFORM set_config('request.jwt.claims', '{"sub":"a9800000-0000-4000-8000-0000000000ff","role":"authenticated"}', true);
  IF NOT pg_temp.denied(format($q$SELECT public.country_child_file(%L)$q$, _o1)) THEN
    RAISE EXCEPTION 'FAIL — مستخدمٌ بلا فريق رأى الملف';
  END IF;
  PERFORM pg_temp.as_user(1);
  IF public.country_child_file(gen_random_uuid())->>'code' <> 'orphan_unknown' THEN
    RAISE EXCEPTION 'FAIL — الإدارة وملفٌّ مجهول';
  END IF;
  RAISE NOTICE 'PASS — ملف الطفل مقصورٌ على فريق دولته، والدولة الأخرى لا تعرف حتى وجوده';
END $$;

-- الزائر لا ينفّذ البابين
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.admin_conflicts_resolve_bulk(uuid[], text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.country_child_file(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL — الزائر ينفّذ أبواب الفريق';
  END IF;
  RAISE NOTICE 'PASS — البابان للمسجّلين وحدهم، والقاعدة تفحص الدور';
END $$;
ROLLBACK;
