-- =====================================================================
-- ربط منصّة التشغيل — إثبات
-- ---------------------------------------------------------------------
-- الخطر: مصدرٌ لا يُفعَّل أبداً لأنّ مطابقته النظيفة تُعدّ انحرافاً؛ دفعةٌ
-- تُعاد فتُضاعف الطفل أو قياسه؛ دفعةٌ نصفها فاسد فيُطبَّق نصفها الآخر؛
-- مفتاحُ مصدرٍ يكتب أطفال مصدرٍ آخر.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a0100000-0000-4000-8000-00000000000a', 'ol-admin@example.test', '{}'::jsonb),
  ('a0100000-0000-4000-8000-000000000006', 'ol-org@example.test', '{"role":"care_org"}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES
  ('a0100000-0000-4000-8000-00000000000a', 'admin');
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('a0200000-0000-4000-8000-000000000001', 'a0100000-0000-4000-8000-000000000006', 'جهة الربط', 'approved');
UPDATE public.operating_platforms SET org_id = 'a0200000-0000-4000-8000-000000000001' WHERE key = 'rowad-albania';
INSERT INTO public.countries (code, name_ar, status) VALUES ('XK', 'كوسوفو', 'planned') ON CONFLICT (code) DO NOTHING;
INSERT INTO public.operating_platforms (key, name, country_code, org_id)
VALUES ('rowad-kosovo', 'الرواد كوسوفو', 'XK', 'a0200000-0000-4000-8000-000000000001');
INSERT INTO public.api_clients (id, name, client_key, secret_hash, org_id, scopes, source) VALUES
  ('a0300000-0000-4000-8000-000000000001', 'مزامنة ألبانيا', 'ck_live_ol_al', 'x', NULL, ARRAY['mirror:write'], 'rowad-albania'),
  ('a0300000-0000-4000-8000-000000000002', 'مزامنة كوسوفو', 'ck_live_ol_xk', 'x', NULL, ARRAY['mirror:write'], 'rowad-kosovo');

DO $$
DECLARE _r JSONB; _ok BOOLEAN; _h1 TEXT; _h2 TEXT; _n INTEGER;
  _al CONSTANT UUID := 'a0300000-0000-4000-8000-000000000001';
  _xk CONSTANT UUID := 'a0300000-0000-4000-8000-000000000002';
  _admin CONSTANT TEXT := '{"sub":"a0100000-0000-4000-8000-00000000000a","role":"authenticated"}';
BEGIN
  -- ١) الدفعة المُعادة حرفاً بحرف لا تُضاعف طفلاً ولا مجموعةً ولا قياساً
  SET LOCAL ROLE service_role;
  FOR _n IN 1..2 LOOP
    PERFORM public.mirror_apply(_al, 'groups', '[{"external_ref":"ol-g1","name":"مجموعة الربط","region":"تيرانا"}]'::jsonb);
    PERFORM public.mirror_apply(_al, 'students',
      '[{"external_ref":"ol-s1","display_name":"طفل الربط","gender":"male","age":10,"group_ref":"ol-g1"}]'::jsonb);
    PERFORM public.mirror_apply(_al, 'trait_dimensions', '[{"key":"AQL","label_ar":"حفظ العقل"}]'::jsonb);
    PERFORM public.mirror_apply(_al, 'traits', '[{"external_ref":"ol-t1","dimension_key":"AQL","name_ar":"التركيز"}]'::jsonb);
    PERFORM public.mirror_apply(_al, 'trait_scores',
      '[{"external_ref":"ol-e1","student_ref":"ol-s1","trait_ref":"ol-t1","score":4,"scale_max":10,"observed_at":"2026-09-01T00:00:00Z"},
        {"external_ref":"ol-e2","student_ref":"ol-s1","trait_ref":"ol-t1","score":7,"scale_max":10,"observed_at":"2026-11-01T00:00:00Z"}]'::jsonb);
  END LOOP;
  RESET ROLE;
  IF (SELECT count(*) FROM public.orphans WHERE external_source = 'rowad-albania' AND external_ref = 'ol-s1') <> 1
     OR (SELECT count(*) FROM public.mirror_groups WHERE source = 'rowad-albania' AND external_ref = 'ol-g1') <> 1
     OR (SELECT count(*) FROM public.orphan_trait_scores WHERE source = 'rowad-albania' AND external_ref IN ('ol-e1', 'ol-e2')) <> 2 THEN
    RAISE EXCEPTION 'FAIL — الدفعة المُعادة ضاعفت سجلّاً';
  END IF;
  IF (SELECT status FROM public.orphans WHERE external_ref = 'ol-s1') <> 'under_review' THEN
    RAISE EXCEPTION 'FAIL — إعادة الدفعة غيّرت حالة الطفل';
  END IF;
  RAISE NOTICE 'PASS — الدفعة المُعادة تُحدِّث بمفتاحها (source, external_ref) ولا تُضاعف، والطفل يبقى قيد المراجعة';

  -- ٢) إيصال الدفعة: سلسلةٌ لكل مصدر؛ الإعادة حلقةٌ جديدة لا تمحو السابقة
  SET LOCAL ROLE service_role;
  _h1 := public.mirror_log_batch(_al, 'students', 1, 0, repeat('a', 64));
  _h2 := public.mirror_log_batch(_al, 'students', 1, 0, repeat('a', 64));
  RESET ROLE;
  IF _h1 = _h2 OR (SELECT prev_hash FROM public.mirror_batches WHERE hash = _h2) <> _h1 THEN
    RAISE EXCEPTION 'FAIL — سلسلة الدفعات لم تربط الحلقة بسابقتها';
  END IF;
  _ok := false;
  BEGIN
    DELETE FROM public.mirror_batches WHERE hash = _h1;
  EXCEPTION WHEN OTHERS THEN _ok := true;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — حُذفت حلقةٌ من سلسلة الدفعات'; END IF;
  RAISE NOTICE 'PASS — كل دفعةٍ مقبولة حلقةٌ في سلسلةٍ لا تُحذف، والمُعادة تُسجَّل ولا تُخفى';

  -- ٣) دفعةٌ فيها سجلٌّ فاسد تُرفض كلّها: لا يُطبَّق نصفها
  _ok := false;
  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM public.mirror_apply(_al, 'students',
      '[{"external_ref":"ol-s2","display_name":"سليم","age":9},
        {"external_ref":"ol-s3","display_name":"فاسد","age":"تسع"}]'::jsonb);
  EXCEPTION WHEN OTHERS THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok OR EXISTS (SELECT 1 FROM public.orphans WHERE external_ref IN ('ol-s2', 'ol-s3')) THEN
    RAISE EXCEPTION 'FAIL — دفعةٌ فاسدة طُبِّق بعضها';
  END IF;
  RAISE NOTICE 'PASS — الدفعة ذرّية: سجلٌّ فاسد يُسقطها كلّها ولا يبقى منها شيء';

  -- ٤) مفتاح مصدرٍ لا يمسّ أطفال مصدرٍ آخر، والمرجع نفسه في مصدرين طفلان
  SET LOCAL ROLE service_role;
  PERFORM public.mirror_apply(_xk, 'students',
    '[{"external_ref":"ol-s1","display_name":"طفلٌ آخر بالمرجع نفسه","age":8}]'::jsonb);
  PERFORM public.mirror_apply(_xk, 'students', '[]'::jsonb, ARRAY['ol-s1']);
  RESET ROLE;
  IF (SELECT count(*) FROM public.orphans WHERE external_ref = 'ol-s1') <> 2
     OR (SELECT display_name FROM public.orphans WHERE external_source = 'rowad-albania' AND external_ref = 'ol-s1') <> 'طفل الربط'
     OR (SELECT external_deleted_at FROM public.orphans WHERE external_source = 'rowad-albania' AND external_ref = 'ol-s1') IS NOT NULL
     OR (SELECT external_deleted_at FROM public.orphans WHERE external_source = 'rowad-kosovo' AND external_ref = 'ol-s1') IS NULL THEN
    RAISE EXCEPTION 'FAIL — مصدرٌ كتب أو حذف في أطفال مصدرٍ آخر';
  END IF;
  RAISE NOTICE 'PASS — كل مفتاحٍ يكتب مصدره وحده؛ المرجع نفسه في مصدرين طفلان مستقلّان';

  -- ٥) المطابقة النظيفة تُكمل شرطها، والانحراف يُسقطه
  SET LOCAL ROLE service_role;
  PERFORM public.mirror_reconcile(_al, 'groups', ARRAY['ol-g1']);
  PERFORM public.mirror_reconcile(_al, 'students', ARRAY['ol-s1']);
  PERFORM public.mirror_mark_reconciled(_al);
  RESET ROLE;
  IF NOT (public.source_checklist('rowad-albania')->>'reconciled')::boolean THEN
    RAISE EXCEPTION 'FAIL — مطابقةٌ نظيفة لم تُحسب: %', public.source_checklist('rowad-albania');
  END IF;
  SET LOCAL ROLE service_role;
  PERFORM public.mirror_reconcile(_al, 'students', ARRAY['ol-s1', 'ol-s9']);
  RESET ROLE;
  IF (public.source_checklist('rowad-albania')->>'reconciled')::boolean THEN
    RAISE EXCEPTION 'FAIL — انحرافٌ (طالبٌ ناقص هنا) حُسب مطابقةً نظيفة';
  END IF;
  SET LOCAL ROLE service_role;
  PERFORM public.mirror_reconcile(_al, 'students', ARRAY[]::text[]);
  RESET ROLE;
  IF (public.source_checklist('rowad-albania')->>'reconciled')::boolean THEN
    RAISE EXCEPTION 'FAIL — انحرافٌ (طالبٌ زائد هنا) حُسب مطابقةً نظيفة';
  END IF;
  RAISE NOTICE 'PASS — المطابقة النظيفة تُحسب، والناقص هنا أو الزائد هنا يُسقطها';

  -- ٦) بعد المطابقة النظيفة ومراجعة المكتب وربط المناطق يُفعَّل المصدر
  SET LOCAL ROLE service_role;
  PERFORM public.mirror_reconcile(_al, 'students', ARRAY['ol-s1']);
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', _admin, true);
  _r := public.admin_set_source('rowad-albania', 'active', true, true);
  RESET ROLE;
  IF NOT (_r->>'ok')::boolean
     OR (SELECT status FROM public.operating_platforms WHERE key = 'rowad-albania') <> 'active' THEN
    RAISE EXCEPTION 'FAIL — مصدرٌ اكتملت قائمته لم يُفعَّل: %', _r;
  END IF;
  SET LOCAL ROLE authenticated;
  _r := public.admin_set_source('rowad-kosovo', 'active', true, true);
  RESET ROLE;
  IF (_r->>'ok')::boolean OR NOT (_r->'missing') ? 'reconciled' THEN
    RAISE EXCEPTION 'FAIL — فُعّل مصدرٌ لم يُطابَق: %', _r;
  END IF;
  RAISE NOTICE 'PASS — المصدر يُفعَّل حين تكتمل قائمته، ولا يُفعَّل مصدرٌ لم يُطابَق';

  -- ٧) ما يراه العموم عن الربط مجاميع فقط
  _r := public.public_operating_links();
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_r) l WHERE l->>'country' = 'AL' AND (l->>'orphans')::int = 1)
     OR _r::text LIKE '%طفل الربط%' OR _r::text LIKE '%ol-s1%' THEN
    RAISE EXCEPTION 'FAIL — روابط التشغيل العامّة ناقصة أو تكشف طفلاً: %', _r;
  END IF;
  RAISE NOTICE 'PASS — روابط التشغيل العامّة: دولةٌ ومجاميع، بلا اسمٍ ولا مرجع';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص ربط منصّة التشغيل اجتازت ──'; END $$;
ROLLBACK;
