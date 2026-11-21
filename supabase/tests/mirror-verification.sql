-- =====================================================================
-- كهاتين — المرآة ونموذج السمات وأهداف الدعم — إثبات
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('c1000000-0000-4000-8000-000000000001', 'mr-admin@example.test', '{}'::jsonb),
  ('c1000000-0000-4000-8000-000000000002', 'mr-org@example.test', '{"role":"care_org"}'::jsonb),
  ('c1000000-0000-4000-8000-000000000003', 'mr-granted@example.test', '{}'::jsonb),
  ('c1000000-0000-4000-8000-000000000004', 'mr-stranger@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES ('c1000000-0000-4000-8000-000000000001', 'admin');
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('c2000000-0000-4000-8000-00000000000a', 'c1000000-0000-4000-8000-000000000002', 'جهة المرآة', 'approved');

INSERT INTO public.mirror_groups (id, source, external_ref, name, country_code, region, supervisor_name)
VALUES ('c4000000-0000-4000-8000-00000000000c', 'rowad-albania', 'class-1', 'مجموعة النور', 'AL', 'تيرانا', 'المشرف أ');

INSERT INTO public.orphans (id, code, display_name, org_id, created_by, country, city, monthly_need, status, approved_at, group_id)
VALUES ('c3000000-0000-4000-8000-00000000000b', 'MR-1', 'طفل المرآة', 'c2000000-0000-4000-8000-00000000000a',
        'c1000000-0000-4000-8000-000000000002', 'ألبانيا', 'تيرانا', 100, 'approved', now(),
        'c4000000-0000-4000-8000-00000000000c');

INSERT INTO public.trait_dimensions (id, source, key, label_ar, sort_order)
VALUES ('c5000000-0000-4000-8000-000000000001', 'rowad-albania', 'DEEN', 'حفظ الدين', 1);
INSERT INTO public.trait_definitions (id, source, external_ref, dimension_id, name_ar, elements)
VALUES ('c6000000-0000-4000-8000-000000000001', 'rowad-albania', 'trait-1',
        'c5000000-0000-4000-8000-000000000001', 'المحافظة على الصلاة', '["يصلي في وقتها"]');
INSERT INTO public.orphan_trait_scores (source, external_ref, orphan_id, trait_id, score, scale_max, observed_at, note)
VALUES ('rowad-albania', 'ev-1', 'c3000000-0000-4000-8000-00000000000b', 'c6000000-0000-4000-8000-000000000001', 4, 10, now() - interval '30 days', 'ملاحظة سرية'),
       ('rowad-albania', 'ev-2', 'c3000000-0000-4000-8000-00000000000b', 'c6000000-0000-4000-8000-000000000001', 7, 10, now(), 'ملاحظة سرية');

-- منحة «traits» فقط للداعم المأذون.
INSERT INTO public.orphan_access_requests (id, orphan_id, requester_id, reason)
VALUES ('c7000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-00000000000b',
        'c1000000-0000-4000-8000-000000000003', 'أريد متابعة تطوّر سمات الطفل عن قرب.');
DO $$ BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  PERFORM public.decide_orphan_access('c7000000-0000-4000-8000-000000000001', 'approved', ARRAY['traits'], NULL, 30);
  RESET ROLE;
END $$;

DO $$
DECLARE _j JSONB; _n INTEGER; _ok BOOLEAN;
BEGIN
  -- النموذج عامّ
  SET LOCAL ROLE anon;
  _j := public.trait_model();
  RESET ROLE;
  IF jsonb_array_length(_j) <> 1 OR (_j->0->'traits'->0->>'name') <> 'المحافظة على الصلاة' THEN
    RAISE EXCEPTION 'FAIL — نموذج السمات لا يُعرض: %', _j;
  END IF;
  RAISE NOTICE 'PASS — نموذج السمات يُعرض للعموم أبعاداً وسماتٍ وعناصر';

  -- الدرجات تُقرأ بالخادم وحده (drizzle 0006): العميل لا ينفّذ الدالّتين أصلاً
  IF has_function_privilege('authenticated', 'public.orphan_traits(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.orphan_traits(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._orphan_traits_data(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public._orphan_traits_data(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL — دالّة درجات السمات ما زالت مفتوحةً للعميل';
  END IF;
  RAISE NOTICE 'PASS — دالّتا درجات السمات لمفتاح الخدمة وحده';

  -- الغريب: لا نطاق له (فلا يقرأ الخادم باسمه) ولا يرى الجدول
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000004","role":"authenticated"}';
  _ok := public.has_orphan_scope('c3000000-0000-4000-8000-00000000000b', 'traits');
  SELECT count(*) INTO _n FROM public.orphan_trait_scores;
  RESET ROLE;
  IF _ok OR _n <> 0 THEN
    RAISE EXCEPTION 'FAIL — غريبٌ رأى السمات (% / %)', _ok, _n;
  END IF;
  RAISE NOTICE 'PASS — درجات السمات مغلقة على من لا نطاق له';

  -- المأذون: نطاقه يُثبَت باسمه، ثم يقرأ الخادم الأول والأخير بلا ملاحظة المشرف
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  _ok := public.has_orphan_scope('c3000000-0000-4000-8000-00000000000b', 'traits');
  RESET ROLE;
  IF NOT _ok THEN
    RAISE EXCEPTION 'FAIL — المأذون لا يُثبَت له نطاق السمات';
  END IF;
  SET LOCAL ROLE service_role;
  _j := public._orphan_traits_data('c3000000-0000-4000-8000-00000000000b');
  RESET ROLE;
  IF (_j->0->>'first_percent')::numeric <> 40
     OR (_j->0->>'latest_percent')::numeric <> 70 THEN
    RAISE EXCEPTION 'FAIL — المأذون لا يرى تطوّر السمة: %', _j;
  END IF;
  IF _j::text LIKE '%سرية%' THEN
    RAISE EXCEPTION 'FAIL — تسرّبت ملاحظة المشرف';
  END IF;
  RAISE NOTICE 'PASS — نطاق traits يُظهر التطوّر (٤٠ → ٧٠) دون ملاحظة المشرف';

  -- نطاق traits لا يفتح group
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  _j := public.orphan_group('c3000000-0000-4000-8000-00000000000b');
  RESET ROLE;
  IF (_j->>'allowed')::boolean THEN
    RAISE EXCEPTION 'FAIL — نطاق السمات فتح المجموعة';
  END IF;
  RAISE NOTICE 'PASS — كل نطاقٍ يفتح بابه وحده';

  -- الدائرة (الجهة) ترى المجموعة ومشرفها
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  _j := public.orphan_group('c3000000-0000-4000-8000-00000000000b');
  RESET ROLE;
  IF (_j->'group'->>'supervisor') IS DISTINCT FROM 'المشرف أ' THEN
    RAISE EXCEPTION 'FAIL — الدائرة لا ترى المجموعة: %', _j;
  END IF;
  RAISE NOTICE 'PASS — المجموعة ومشرفها الأساسي ظاهران لمن له النطاق';
END $$;

-- أهداف الدعم
DO $$
DECLARE _id UUID; _ok BOOLEAN;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  PERFORM public.create_support_pledge('qualification', 'orphan', 'c3000000-0000-4000-8000-00000000000b', 50);
  PERFORM public.create_support_pledge('qualification', 'group', 'c4000000-0000-4000-8000-00000000000c', 50);
  PERFORM public.create_support_pledge('qualification', 'region', 'تيرانا', 50, 'AL');
  PERFORM public.create_support_pledge('qualification', 'country', 'AL', 50);
  PERFORM public.create_support_pledge('in_kind', 'institution', 'c2000000-0000-4000-8000-00000000000a', 50, 'AL');
  RESET ROLE;
  IF (SELECT count(*) FROM public.support_pledges WHERE supporter_id = 'c1000000-0000-4000-8000-000000000003') <> 5 THEN
    RAISE EXCEPTION 'FAIL — لم تُسجَّل الأهداف الخمسة';
  END IF;
  IF (SELECT country_code FROM public.support_pledges WHERE target_type = 'group' LIMIT 1) <> 'AL' THEN
    RAISE EXCEPTION 'FAIL — دولة المجموعة لم تُشتقّ';
  END IF;
  RAISE NOTICE 'PASS — التأهيل: يتيم | مجموعة | منطقة | دولة؛ والعيني يصل المؤسسة';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  PERFORM public.create_support_pledge('qualification', 'institution', 'c2000000-0000-4000-8000-00000000000a', 50, 'AL');
  RESET ROLE;
  RAISE NOTICE 'PASS — التأهيل يصل المؤسسة أيضاً (مركز، مكتب…)';

  INSERT INTO public.countries (code, name_ar) VALUES ('XK', 'كوسوفو');
  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000003","role":"authenticated"}';
    PERFORM public.create_support_pledge('qualification', 'country', 'XK', 50);
  EXCEPTION WHEN raise_exception THEN _ok := SQLERRM = 'country_not_active';
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — قُبل دعمٌ لدولةٍ غير مفعّلة'; END IF;
  RAISE NOTICE 'PASS — الدولة المخطّطة لا تستقبل دعماً حتى تُفعَّل';

  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000004","role":"authenticated"}';
    INSERT INTO public.support_pledges (supporter_id, kind, target_type, country_code, amount)
    VALUES ('c1000000-0000-4000-8000-000000000004', 'qualification', 'country', 'AL', 1);
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — إدراجٌ مباشر تجاوز الباب'; END IF;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"c1000000-0000-4000-8000-000000000004","role":"authenticated"}';
  IF EXISTS (SELECT 1 FROM public.support_pledges) THEN
    RESET ROLE; RAISE EXCEPTION 'FAIL — غريبٌ رأى تعهّدات غيره';
  END IF;
  RESET ROLE;
  RAISE NOTICE 'PASS — التعهّد بابه دالّة، ولا يراه إلا صاحبه';
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص المرآة اجتازت ──'; END $$;
ROLLBACK;
