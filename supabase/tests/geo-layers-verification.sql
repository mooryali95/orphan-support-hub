-- =====================================================================
-- طبقات الخارطة (الفجوة والتسليمات) — إثبات
-- ---------------------------------------------------------------------
-- الخطر: فجوةٌ لمنطقةٍ صغيرة تدلّ على حاجة طفلٍ بعينه، أو عدد تسليماتٍ
-- يكشف من وصله الدعم ومن لم يصله، أو خلطُ عملاتٍ في رقمٍ واحد.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('ae100000-0000-4000-8000-000000000002', 'geo-layers@example.test', '{"role":"care_org"}'::jsonb);
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('ae200000-0000-4000-8000-000000000002', 'ae100000-0000-4000-8000-000000000002', 'جهة الطبقات', 'approved');

-- تيرانا: ٨ معتمدون بحاجة ١٠٠ ومغطّى ٤٠ (فجوة ٦٠ لكلّ)، أحدهم باليورو لا يُجمع.
-- دوريس: ٦ بحاجة ٨٠ بلا تغطية. كوكش: ٢ (صغيرة).
INSERT INTO public.orphans (code, display_name, org_id, created_by, country, region, monthly_need, funded_monthly, currency, status, approved_at)
SELECT 'GL-' || g, 'طفل ' || g, 'ae200000-0000-4000-8000-000000000002', 'ae100000-0000-4000-8000-000000000002',
       'ألبانيا', r, need, funded, cur, 'approved'::orphan_status, now()
  FROM (VALUES
    (1,'Tirana',100,40,'USD'),(2,'Tirana',100,40,'USD'),(3,'Tirana',100,40,'USD'),
    (4,'Tirana',100,40,'USD'),(5,'Tirana',100,40,'USD'),(6,'Tirana',100,40,'USD'),
    (7,'Tirana',100,40,'USD'),(8,'Tirana',100,40,'EUR'),
    (9,'Durrës',80,0,'USD'),(10,'Durrës',80,0,'USD'),(11,'Durrës',80,0,'USD'),
    (12,'Durrës',80,0,'USD'),(13,'Durrës',80,0,'USD'),(14,'Durrës',80,0,'USD'),
    (15,'Kukës',100,0,'USD'),(16,'Kukës',100,0,'USD')
  ) v(g, r, need, funded, cur);

-- تسليمٌ موثّق خلال ٩٠ يوماً لخمسةٍ من تيرانا، وقديمٌ لسادس، وبلا إثباتٍ (محوَّل) لسابع.
INSERT INTO public.disbursements (org_id, orphan_id, amount, status, delivered_at, delivery_proof_path)
SELECT 'ae200000-0000-4000-8000-000000000002', o.id, 50, 'delivered', now() - interval '10 days', 'proof/' || o.code
  FROM public.orphans o WHERE o.code IN ('GL-1','GL-2','GL-3','GL-4','GL-5');
INSERT INTO public.disbursements (org_id, orphan_id, amount, status, delivered_at, delivery_proof_path)
SELECT 'ae200000-0000-4000-8000-000000000002', o.id, 50, 'delivered', now() - interval '200 days', 'proof/' || o.code
  FROM public.orphans o WHERE o.code = 'GL-6';
INSERT INTO public.disbursements (org_id, orphan_id, amount, status)
SELECT 'ae200000-0000-4000-8000-000000000002', o.id, 50, 'transferred'
  FROM public.orphans o WHERE o.code = 'GL-7';

DO $$
DECLARE g JSONB; al JSONB; tir JSONB; dur JSONB; kuk JSONB;
BEGIN
  SET LOCAL ROLE anon;
  g := public.geo_stats();
  RESET ROLE;

  SELECT c INTO al FROM jsonb_array_elements(g->'countries') c WHERE c->>'country' = 'ألبانيا';
  SELECT r INTO tir FROM jsonb_array_elements(al->'regions') r WHERE r->>'region' = 'Tirana';
  SELECT r INTO dur FROM jsonb_array_elements(al->'regions') r WHERE r->>'region' = 'Durrës';
  SELECT r INTO kuk FROM jsonb_array_elements(al->'regions') r WHERE r->>'region' = 'Kukës';

  -- تيرانا: ٧ × ٦٠ بالدولار = ٤٢٠؛ اليورو لا يُخلط. دوريس: ٦ × ٨٠ = ٤٨٠.
  IF (tir->>'gap')::numeric <> 420 OR tir->>'currency' <> 'USD' THEN
    RAISE EXCEPTION 'FAIL — فجوة تيرانا خاطئة أو خُلطت العملات: %', tir;
  END IF;
  IF (dur->>'gap')::numeric <> 480 THEN
    RAISE EXCEPTION 'FAIL — فجوة دوريس خاطئة: %', dur;
  END IF;
  -- الدولة: ١٥ بالدولار = ٤٢٠ + ٤٨٠ + ٢٠٠ (كوكش تدخل في مجموع الدولة لأنّ حشد الدولة كبير).
  IF (al->>'gap')::numeric <> 1100 OR al->>'currency' <> 'USD' THEN
    RAISE EXCEPTION 'FAIL — فجوة الدولة خاطئة: %', al;
  END IF;
  RAISE NOTICE 'PASS — الفجوة تُجمع بالعملة الغالبة وحدها، منطقةً ودولة';

  IF kuk->'gap' <> 'null'::jsonb OR kuk->'currency' <> 'null'::jsonb OR kuk->'delivered' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL — منطقةٌ صغيرة كُشفت فجوتها أو تسليماتها: %', kuk;
  END IF;
  RAISE NOTICE 'PASS — ما دون حدّ الحشد بلا فجوةٍ ولا تسليمات';

  -- تيرانا: ٥ وصلهم تسليمٌ حديث من ٨ → المتبقّي ٣ < الحدّ → يُحجب.
  IF tir->'delivered' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL — تسليماتٌ بشقٍّ صغير كُشفت: %', tir;
  END IF;
  -- الدولة: ٥ من ١٦ → المتبقّي ١١ → يُكشف، ولا يُحسب القديم ولا غير الموثّق.
  IF (al->>'delivered')::int <> 5 THEN
    RAISE EXCEPTION 'FAIL — عدّ التسليمات خاطئ (المتوقّع ٥ حديثةٌ موثّقة): %', al;
  END IF;
  RAISE NOTICE 'PASS — التسليمات: الموثّق خلال ٩٠ يوماً فقط، وبحماية التقسيم';

  IF g::text LIKE '%GL-%' OR g::text LIKE '%proof/%' THEN
    RAISE EXCEPTION 'FAIL — رمزٌ أو مسار إثباتٍ تسرّب';
  END IF;
  RAISE NOTICE 'PASS — لا رموز ولا مسارات إثبات';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص طبقات الخارطة اجتازت ──'; END $$;
ROLLBACK;
