-- =====================================================================
-- مصدر الجغرافيا — إثبات
-- ---------------------------------------------------------------------
-- الخطر: خارطةٌ تكشف ما يحجبه الدليل — رقمٌ صغير يدلّ على طفل، أو
-- تقسيمٌ «مكفول/ينتظر» يكشف حال طفلٍ بعينه، أو ملفٌّ غير معتمد يُعَدّ.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('ae100000-0000-4000-8000-000000000001', 'geo-org@example.test', '{"role":"care_org"}'::jsonb);
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('ae200000-0000-4000-8000-000000000001', 'ae100000-0000-4000-8000-000000000001', 'جهة الخارطة', 'approved');

-- تيرانا: ٨ معتمدون (٥ مكفولون، ٣ ينتظرون). دوريس: ٦ معتمدون، كلّهم ينتظرون.
-- كوكش: ٢. وملفّان قيد المراجعة في تيرانا لا يُعدّان.
INSERT INTO public.orphans (code, display_name, org_id, created_by, country, region, monthly_need, status, approved_at)
SELECT 'GEO-' || g, 'طفل ' || g, 'ae200000-0000-4000-8000-000000000001', 'ae100000-0000-4000-8000-000000000001',
       'ألبانيا', r, 100, s::orphan_status, now()
  FROM (VALUES
    (1,'Tirana','fully_sponsored'),(2,'Tirana','fully_sponsored'),(3,'Tirana','fully_sponsored'),
    (4,'Tirana','fully_sponsored'),(5,'Tirana','fully_sponsored'),(6,'Tirana','approved'),
    (7,'Tirana','approved'),(8,'Tirana','approved'),
    (9,'Durrës','approved'),(10,'Durrës','approved'),(11,'Durrës','approved'),
    (12,'Durrës','approved'),(13,'Durrës','approved'),(14,'Durrës','approved'),
    (15,'Kukës','approved'),(16,'Kukës','approved'),
    (17,'Tirana','under_review'),(18,'Tirana','draft')
  ) v(g, r, s);
-- دولة بملفّين فقط.
INSERT INTO public.orphans (code, display_name, org_id, created_by, country, region, monthly_need, status, approved_at)
VALUES ('GEO-K1','ك١','ae200000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000001','كوسوفو','Peja',100,'approved',now()),
       ('GEO-K2','ك٢','ae200000-0000-4000-8000-000000000001','ae100000-0000-4000-8000-000000000001','كوسوفو','Peja',100,'approved',now());

DO $$
DECLARE g JSONB; al JSONB; tir JSONB; dur JSONB; kuk JSONB; xk JSONB;
BEGIN
  SET LOCAL ROLE anon;
  g := public.geo_stats();
  RESET ROLE;

  SELECT c INTO al FROM jsonb_array_elements(g->'countries') c WHERE c->>'country' = 'ألبانيا';
  SELECT c INTO xk FROM jsonb_array_elements(g->'countries') c WHERE c->>'country' = 'كوسوفو';
  SELECT r INTO tir FROM jsonb_array_elements(al->'regions') r WHERE r->>'region' = 'Tirana';
  SELECT r INTO dur FROM jsonb_array_elements(al->'regions') r WHERE r->>'region' = 'Durrës';
  SELECT r INTO kuk FROM jsonb_array_elements(al->'regions') r WHERE r->>'region' = 'Kukës';

  IF (al->>'total')::int <> 16 OR (tir->>'total')::int <> 8 THEN
    RAISE EXCEPTION 'FAIL — العدّ خاطئ أو شمل ملفّاتٍ غير معتمدة: %', al;
  END IF;
  RAISE NOTICE 'PASS — الزائر يرى أعداد المعتمد وحده';

  IF (kuk->>'small')::boolean IS NOT TRUE OR kuk->'total' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL — منطقةٌ دون الحدّ كُشف رقمها: %', kuk;
  END IF;
  IF (xk->>'small')::boolean IS NOT TRUE OR xk->'total' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL — دولةٌ دون الحدّ كُشف رقمها: %', xk;
  END IF;
  RAISE NOTICE 'PASS — ما دون حدّ الحشد يُعاد «صغيراً» بلا رقم، دولةً ومنطقة';

  IF tir->'sponsored' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL — تقسيمٌ بشقٍّ صغير كُشف (٣ ينتظرون): %', tir;
  END IF;
  IF dur->'sponsored' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL — تقسيمٌ بشقٍّ صفريّ كُشف: %', dur;
  END IF;
  RAISE NOTICE 'PASS — «مكفول/ينتظر» يُحجب إن صغر أحد شقّيه';

  IF g::text LIKE '%GEO-%' OR g::text LIKE '%طفل %' THEN
    RAISE EXCEPTION 'FAIL — رمز ملفٍّ أو اسمٌ تسرّب إلى الخارطة';
  END IF;
  RAISE NOTICE 'PASS — لا أسماء ولا رموز: أعدادٌ فقط';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص الخارطة اجتازت ──'; END $$;
ROLLBACK;
