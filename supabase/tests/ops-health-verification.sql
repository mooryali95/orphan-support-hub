-- =====================================================================
-- صحّة التشغيل — إثبات
-- الخطر: عطلٌ لا يراه أحد (حدث دفعٍ فشل، سلسلةٌ انكسرت، تعارضٌ قديم)، أو
-- تنبيهٌ يتكرّر في كل تشغيلٍ حتى يُتجاهَل، أو غير مشرفٍ يقرأ الحال.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('bb100000-0000-4000-8000-000000000001', 'oh-admin1@example.test', '{}'::jsonb),
  ('bb100000-0000-4000-8000-000000000002', 'oh-admin2@example.test', '{}'::jsonb),
  ('bb100000-0000-4000-8000-000000000003', 'oh-user@example.test', '{}'::jsonb);
-- قاعدةٌ نظيفة لهذا الفحص: مشرفو المجموعات السابقة خارج المعاملة أصلاً.
INSERT INTO public.user_roles (user_id, role) VALUES
  ('bb100000-0000-4000-8000-000000000001', 'admin'), ('bb100000-0000-4000-8000-000000000002', 'admin');

DO $$
DECLARE _v JSONB; _n INT; _admins INT;
BEGIN
  SELECT count(*) INTO _admins FROM public.user_roles WHERE role = 'admin';

  -- ١) غير المشرف لا يقرأ الحال
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"bb100000-0000-4000-8000-000000000003","role":"authenticated"}';
  BEGIN
    PERFORM public.ops_health();
    RAISE EXCEPTION 'FAIL — غير مشرفٍ قرأ صحّة التشغيل';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.ops_record_run();
    RAISE EXCEPTION 'FAIL — مستخدمٌ شغّل الفحص الدوري';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  RAISE NOTICE 'PASS — صحّة التشغيل للمشرفين وحدهم، والتشغيل الدوري للخادم وحده';

  -- ٢) المشرف يرى ثمانية فحوص، والنصاب ناقص بمشرفَين
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"bb100000-0000-4000-8000-000000000001","role":"authenticated"}';
  _v := public.ops_health();
  RESET ROLE;
  IF jsonb_array_length(_v->'checks') <> 8 THEN RAISE EXCEPTION 'FAIL — عدد الفحوص: %', _v->'checks'; END IF;
  IF _admins < 3 AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_v->'checks') c
                                  WHERE c->>'key' = 'admin_quorum' AND c->>'level' = 'warn') THEN
    RAISE EXCEPTION 'FAIL — نقص النصاب لم يُنبَّه إليه';
  END IF;
  RAISE NOTICE 'PASS — ثمانية فحوص، ونقص النصاب يظهر تنبيهاً';

  -- ٣) حدث دفعٍ فاشل يجعل الحال حرجاً، وينبّه كل مشرف
  INSERT INTO public.payment_events (provider, provider_event_id, event_type, payload, error)
  VALUES ('creem', 'evt_oh_1', 'checkout.completed', '{}'::jsonb, 'sponsorship_not_found');
  _v := public.ops_record_run();
  IF _v->>'level' <> 'critical' THEN RAISE EXCEPTION 'FAIL — حدث دفعٍ فاشل لم يجعل الحال حرجاً: %', _v; END IF;
  IF (_v->>'notified')::int <> _admins THEN RAISE EXCEPTION 'FAIL — لم يُنبَّه كل المشرفين: %', _v->>'notified'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = 'bb100000-0000-4000-8000-000000000002'
                   AND entity = 'ops_run' AND body LIKE '%حدثَ دفعٍ%') THEN
    RAISE EXCEPTION 'FAIL — نصّ التنبيه لا يسمّي العطل';
  END IF;
  RAISE NOTICE 'PASS — حدث دفعٍ فاشل → حالٌ حرج وتنبيهٌ يسمّيه لكل مشرف';

  -- ٤) نفس الحال في التشغيل التالي: لا تنبيهٌ مكرّر
  _v := public.ops_record_run();
  IF (_v->>'notified')::int <> 0 THEN RAISE EXCEPTION 'FAIL — التنبيه تكرّر بلا جديد'; END IF;
  RAISE NOTICE 'PASS — الحال نفسه لا يكرّر التنبيه';

  -- ٥) تغيّر الحال (تعارضٌ جديد) ينبّه من جديد
  INSERT INTO public.integrity_discrepancies (orphan_id, source, changes)
  SELECT id, 'rowad-albania', '{"region":{"was":"A","proposed":"B"}}'::jsonb FROM public.orphans LIMIT 1;
  IF FOUND THEN
    _v := public.ops_record_run();
    IF (_v->>'notified')::int = 0 THEN RAISE EXCEPTION 'FAIL — تغيّر الحال لم ينبّه'; END IF;
    RAISE NOTICE 'PASS — تعارضٌ جديد يغيّر البصمة فينبّه';
  END IF;

  -- ٦) سجلّ التشغيلات إلحاقٌ فقط
  BEGIN
    DELETE FROM public.ops_runs;
    RAISE EXCEPTION 'FAIL — سجلّ التشغيلات حُذف';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RAISE NOTICE 'PASS — سجلّ التشغيلات لا يُعدَّل ولا يُحذف';

  -- ٧) سلسلةٌ مكسورة تُكتشف (العبث يحتاج تعطيل الحارس، ويعود في ROLLBACK)
  PERFORM public.log_integrity('ops_probe', NULL, '{"n":1}'::jsonb);
  ALTER TABLE public.integrity_log DISABLE TRIGGER integrity_log_frozen;
  UPDATE public.integrity_log SET detail = '{"n":2}'::jsonb WHERE kind = 'ops_probe';
  ALTER TABLE public.integrity_log ENABLE TRIGGER integrity_log_frozen;
  SELECT count(*) INTO _n FROM jsonb_array_elements(public._ops_checks()) c
   WHERE c->>'key' = 'integrity_chain' AND c->>'level' = 'critical';
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL — كسر السلسلة لم يُكتشف'; END IF;
  RAISE NOTICE 'PASS — كسر سلسلة السلامة يُكتشف حرجاً';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص صحّة التشغيل اجتازت ──'; END $$;
ROLLBACK;
