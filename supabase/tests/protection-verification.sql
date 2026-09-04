-- =====================================================================
-- حاجب الأطفال — إثبات
-- ---------------------------------------------------------------------
-- الحاجب يُختبر من الباب الخلفي لا من الأمامي: لا يُسأل «هل تُخفي
-- الواجهةُ القصّة؟» بل «هل يقرؤها من يخاطب القاعدة مباشرةً؟» —
-- فالمفتاح منشورٌ في المتصفّح، والنداء المباشر متاحٌ لكل أحد.
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('e1000000-0000-4000-8000-000000000001', 'p-admin@example.test', '{}'::jsonb),
  ('e1000000-0000-4000-8000-000000000002', 'p-org@example.test', '{"role":"care_org"}'::jsonb),
  ('e1000000-0000-4000-8000-000000000003', 'p-stranger@example.test', '{}'::jsonb),
  ('e1000000-0000-4000-8000-000000000004', 'p-sponsor@example.test', '{}'::jsonb),
  ('e1000000-0000-4000-8000-000000000005', 'p-guardian@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role)
VALUES ('e1000000-0000-4000-8000-000000000001', 'admin');

INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('e2000000-0000-4000-8000-00000000000a',
        'e1000000-0000-4000-8000-000000000002', 'جهة الحماية', 'approved');

INSERT INTO public.orphans
  (id, code, display_name, gender, birth_date, city, country, region, story,
   education_stage, org_id, created_by, guardian_id, monthly_need, status, approved_at)
VALUES
  ('e3000000-0000-4000-8000-00000000000b', 'PR-1', 'طفل . أ', 'male',
   CURRENT_DATE - interval '9 years', 'حيّ النرجس بالرياض', 'السعودية', 'الرياض',
   'قصّةٌ فيها تفاصيل أسرته وظروف فقده لوالده.',
   'ابتدائي', 'e2000000-0000-4000-8000-00000000000a',
   'e1000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000005',
   200, 'approved', now() - interval '100 days'),
  ('e3000000-0000-4000-8000-00000000000c', 'PR-2', 'طفلة . ب', 'female',
   CURRENT_DATE - interval '16 years', 'جدة', 'اليمن', 'حضرموت',
   'قصّةٌ أخرى.', 'ثانوي', 'e2000000-0000-4000-8000-00000000000a',
   'e1000000-0000-4000-8000-000000000002', NULL,
   300, 'approved', now() - interval '10 days');

/* صورةٌ مأذونٌ بها بإخفاء الوجه — وهي الحالة المسموحة بلا وثيقة.
   ووجودُها شرطٌ لأن يقيس فحصُ الصورة شيئاً: بحقلٍ فارغٍ يمرّ الفحص
   لأن لا صورة، لا لأن الحاجب عمل. */
UPDATE public.orphans
   SET photo_url = 'media/pr-1.jpg', photo_consent = 'face_hidden'
 WHERE id = 'e3000000-0000-4000-8000-00000000000b';

DO $$
BEGIN
  IF (SELECT photo_url FROM public.orphans
       WHERE id = 'e3000000-0000-4000-8000-00000000000b') IS NULL THEN
    RAISE EXCEPTION 'FAIL — الفحص لا يقيس شيئاً: لا صورة مسجّلة';
  END IF;
END $$;

INSERT INTO public.sponsorships (sponsor_id, orphan_id, amount, currency, status)
VALUES ('e1000000-0000-4000-8000-000000000004',
        'e3000000-0000-4000-8000-00000000000b', 50, 'USD', 'active');


-- ---------------------------------------------------------------------
-- الأساس: الأعمدة المُعرِّفة محجوبةٌ عن الجميع
-- ---------------------------------------------------------------------
DO $$
DECLARE _col TEXT; _blocked INTEGER := 0;
BEGIN
  FOREACH _col IN ARRAY ARRAY['story','city','birth_date','photo_url'] LOOP
    BEGIN
      SET LOCAL ROLE authenticated;
      SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
      EXECUTE format('SELECT %I FROM public.orphans LIMIT 1', _col);
      RESET ROLE;
      RAISE EXCEPTION 'FAIL — المسجَّل يقرأ العمود المُعرِّف «%»', _col;
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
      _blocked := _blocked + 1;
    END;
  END LOOP;
  IF _blocked <> 4 THEN
    RAISE EXCEPTION 'FAIL — الفحص لا يقيس شيئاً (% من ٤)', _blocked;
  END IF;
  RAISE NOTICE 'PASS — القصّة والمدينة وتاريخ الميلاد والصورة محجوبة عن المسجَّل';
END $$;

-- ومعرّفات البالغين كذلك: كشفُها يربط شخصاً حقيقياً بطفلٍ بعينه.
DO $$
DECLARE _col TEXT; _blocked INTEGER := 0;
BEGIN
  FOREACH _col IN ARRAY ARRAY['guardian_id','created_by','reviewed_by','photo_consent_doc'] LOOP
    BEGIN
      SET LOCAL ROLE authenticated;
      SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
      EXECUTE format('SELECT %I FROM public.orphans LIMIT 1', _col);
      RESET ROLE;
      RAISE EXCEPTION 'FAIL — المسجَّل يقرأ «%»', _col;
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
      _blocked := _blocked + 1;
    END;
  END LOOP;
  IF _blocked <> 4 THEN
    RAISE EXCEPTION 'FAIL — الفحص لا يقيس شيئاً (% من ٤)', _blocked;
  END IF;
  RAISE NOTICE 'PASS — معرّفات البالغين محجوبة';
END $$;

-- والزائر أضيق: لا يقرأ حتى أعمدة الإدارة.
DO $$
BEGIN
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM rejection_reason FROM public.orphans LIMIT 1;
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — الزائر يقرأ سبب الرفض';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — أعمدة الإدارة محجوبة عن الزائر';
  END;
END $$;

-- والبطاقة تبقى مقروءةً: الحجب ليس إغلاقاً للدليل.
DO $$
DECLARE _n INTEGER;
BEGIN
  SET LOCAL ROLE anon;
  SELECT count(*) INTO _n FROM public.orphans
   WHERE status = 'approved' AND display_name IS NOT NULL AND country IS NOT NULL;
  RESET ROLE;
  IF _n < 2 THEN
    RAISE EXCEPTION 'FAIL — البطاقة نفسها صارت محجوبة (%)', _n;
  END IF;
  RAISE NOTICE 'PASS — البطاقة مقروءة للزائر (% ملفاً)', _n;
END $$;


-- ---------------------------------------------------------------------
-- الفلترة — والفئة العمرية تُحسب ولا يُكشف التاريخ
-- ---------------------------------------------------------------------
DO $$
DECLARE _j JSONB; _row JSONB;
BEGIN
  SET LOCAL ROLE anon;
  _j := public.list_orphan_cards();
  RESET ROLE;

  _row := (SELECT r FROM jsonb_array_elements(_j->'rows') r
            WHERE r->>'code' = 'PR-1');
  IF _row IS NULL THEN
    RAISE EXCEPTION 'FAIL — الملفّ غائب عن الدليل';
  END IF;
  IF _row ? 'story' OR _row ? 'city' OR _row ? 'birth_date' OR _row ? 'photo_url' THEN
    RAISE EXCEPTION 'FAIL — البطاقة تحمل حقلاً مُعرِّفاً: %', _row;
  END IF;
  IF _row->>'age_band' <> 'age_6_11' THEN
    RAISE EXCEPTION 'FAIL — الفئة العمرية % لا age_6_11', _row->>'age_band';
  END IF;
  RAISE NOTICE 'PASS — البطاقة تحمل فئةً عمرية ولا تحمل تاريخ ميلاد';
END $$;

/* التوكيد بالاحتواء لا بالمساواة: بيانات العرض المبذورة تقع في بعض
   هذه الفئات، فمساواةٌ تامّة تكسر الفحص بلا عيبٍ في المفلتِر. وملفّا
   الفحص يفترقان في كل بُعدٍ من الأربعة، فالاحتواء والاستبعاد معاً
   يُثبتان الفرز. */
DO $$
DECLARE _d TEXT; _keep TEXT; _drop TEXT; _j JSONB; _has BOOLEAN; _hasnt BOOLEAN;
BEGIN
  SET LOCAL ROLE anon;
  FOREACH _d IN ARRAY ARRAY['country','age','gender','stage'] LOOP
    _keep := CASE _d WHEN 'stage' THEN 'PR-1' ELSE 'PR-2' END;
    _drop := CASE _d WHEN 'stage' THEN 'PR-2' ELSE 'PR-1' END;

    _j := CASE _d
      WHEN 'country' THEN public.list_orphan_cards(_country => 'اليمن', _limit => 60)
      WHEN 'age'     THEN public.list_orphan_cards(_age_band => 'age_15_17', _limit => 60)
      WHEN 'gender'  THEN public.list_orphan_cards(_gender => 'female', _limit => 60)
      ELSE                public.list_orphan_cards(_education_stage => 'ابتدائي', _limit => 60)
    END;

    SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(_j->'rows') r WHERE r->>'code' = _keep),
           NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_j->'rows') r WHERE r->>'code' = _drop)
      INTO _has, _hasnt;

    IF NOT _has THEN
      RAISE EXCEPTION 'FAIL — الفلترة بـ«%» أسقطت % وهو مطابق', _d, _keep;
    END IF;
    IF NOT _hasnt THEN
      RAISE EXCEPTION 'FAIL — الفلترة بـ«%» أبقت % وهو غير مطابق', _d, _drop;
    END IF;
  END LOOP;
  RESET ROLE;
  RAISE NOTICE 'PASS — الفلترة بالبلد والعمر والجنس والمرحلة تعمل كلٌّ على حدة';
END $$;

-- والبحث لا يكشف ما حُجب: اسمُ المدينة لا يُطابق شيئاً.
DO $$
DECLARE _j JSONB; _n INTEGER;
BEGIN
  SET LOCAL ROLE anon;
  _j := public.list_orphan_cards(_search => 'النرجس');
  _n := jsonb_array_length(_j->'rows');
  RESET ROLE;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'FAIL — البحث بالمدينة كشف ما حُجب (% نتيجة)', _n;
  END IF;
  RAISE NOTICE 'PASS — البحث بالمدينة لا يكشف ساكنيها';
END $$;

/* ومحارف البدل تُنزع في القاعدة: كان التنظيف في الخادم، وقد انتقل
   البحث إلى الدالّة — فلو بقي بلا تنظيف صار «%» يعني «كل شيء». */
DO $$
DECLARE _all INTEGER; _wild INTEGER; _under INTEGER;
BEGIN
  SET LOCAL ROLE anon;
  _all   := (public.list_orphan_cards(_limit => 60)->>'total')::int;
  _wild  := (public.list_orphan_cards(_search => '%', _limit => 60)->>'total')::int;
  _under := (public.list_orphan_cards(_search => '_ــ_', _limit => 60)->>'total')::int;
  RESET ROLE;

  IF _all < 2 THEN
    RAISE EXCEPTION 'FAIL — الفحص لا يقيس شيئاً: لا ملفّات منشورة';
  END IF;
  IF _wild <> 0 THEN
    RAISE EXCEPTION 'FAIL — «%%» عمل عمل البدل فأعاد % من %', _wild, _all;
  END IF;
  IF _under <> 0 THEN
    RAISE EXCEPTION 'FAIL — «_» عمل عمل البدل فأعاد %', _under;
  END IF;
  RAISE NOTICE 'PASS — محارف البدل تُنزع فلا يُقرأ «%%» بحثاً عن كل شيء';
END $$;

-- والعدد الكلّي يُعاد مع الصفحة: صفحةٌ بلا عددٍ لا يُبنى عليها ترقيم.
DO $$
DECLARE _j JSONB;
BEGIN
  SET LOCAL ROLE anon;
  _j := public.list_orphan_cards(_limit => 1);
  RESET ROLE;
  IF jsonb_array_length(_j->'rows') <> 1 THEN
    RAISE EXCEPTION 'FAIL — الحدّ لم يُطبَّق';
  END IF;
  IF (_j->>'total')::int < 2 THEN
    RAISE EXCEPTION 'FAIL — العدد الكلّي % وهو أكبر', _j->>'total';
  END IF;
  RAISE NOTICE 'PASS — الصفحة محدودة والعدد الكلّي معها';
END $$;


-- ---------------------------------------------------------------------
-- الحاجب: الغريب يرى البطاقة ولا يرى الملفّ
-- ---------------------------------------------------------------------
DO $$
DECLARE _v JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  _v := public.orphan_view('e3000000-0000-4000-8000-00000000000b');
  RESET ROLE;

  IF (_v->>'may_view_detail')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL — أُذن للغريب بلا طلب';
  END IF;
  IF _v ? 'detail' THEN
    RAISE EXCEPTION 'FAIL — التفاصيل معروضةٌ بلا إذن';
  END IF;
  IF _v->>'display_name' IS NULL OR _v->>'country' IS NULL THEN
    RAISE EXCEPTION 'FAIL — حُجبت البطاقة نفسها';
  END IF;
  /* ولا صورةَ في أيّ موضعٍ من المُعاد: الصورة تفصيلٌ لا بطاقة. */
  IF _v::text LIKE '%photo%' THEN
    RAISE EXCEPTION 'FAIL — تسرّبت الصورة إلى بطاقة الغريب';
  END IF;
  RAISE NOTICE 'PASS — الغريب يرى الاسم والبلد، ولا يرى الملفّ ولا الصورة';
END $$;

-- ومن له علاقةٌ قائمة لا يستأذن.
DO $$
DECLARE _sponsor JSONB; _org JSONB; _guardian JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}';
  _sponsor := public.orphan_view('e3000000-0000-4000-8000-00000000000b');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  _org := public.orphan_view('e3000000-0000-4000-8000-00000000000b');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000005","role":"authenticated"}';
  _guardian := public.orphan_view('e3000000-0000-4000-8000-00000000000b');
  RESET ROLE;

  IF NOT (_sponsor ? 'detail') THEN
    RAISE EXCEPTION 'FAIL — الكافل الحاليّ حُجب عن ملفّ من يكفله';
  END IF;
  IF NOT (_org ? 'detail') THEN
    RAISE EXCEPTION 'FAIL — الجهة الراعية حُجبت عن ملفّها';
  END IF;
  IF NOT (_guardian ? 'detail') THEN
    RAISE EXCEPTION 'FAIL — الوليّ حُجب عن ملفّ من يليه';
  END IF;
  RAISE NOTICE 'PASS — الكافل والجهة والوليّ لا يستأذنون';
END $$;


-- ---------------------------------------------------------------------
-- الطلب والقرار
-- ---------------------------------------------------------------------
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  BEGIN
    PERFORM public.request_orphan_access('e3000000-0000-4000-8000-00000000000b', 'أريد');
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — قُبل طلبٌ بلا سببٍ مكتوب';
  EXCEPTION WHEN check_violation THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — الطلب يحتاج سبباً مكتوباً';
  END;
END $$;

DO $$
DECLARE _r JSONB; _who UUID;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  _r := public.request_orphan_access('e3000000-0000-4000-8000-00000000000b',
        'أنوي كفالة هذا الملفّ وأحتاج الاطّلاع على تفاصيله قبل القرار.');
  RESET ROLE;

  IF _r->>'status' <> 'pending' THEN
    RAISE EXCEPTION 'FAIL — الطلب لم يُسجَّل معلّقاً (%)', _r;
  END IF;

  -- والطالب يُقرأ من الجلسة لا من الوسائط: لا وسيطَ له أصلاً.
  SELECT requester_id INTO _who FROM public.orphan_access_requests
   WHERE id = (_r->>'request_id')::uuid;
  IF _who <> 'e1000000-0000-4000-8000-000000000003' THEN
    RAISE EXCEPTION 'FAIL — نُسب الطلب لغير صاحب الجلسة (%)', _who;
  END IF;
  RAISE NOTICE 'PASS — الطلب يُسجَّل باسم صاحب الجلسة';
END $$;

-- وطلبٌ حيٌّ واحد: تكرارُه ضغطٌ على الإدارة لا حقّ.
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  BEGIN
    PERFORM public.request_orphan_access('e3000000-0000-4000-8000-00000000000b',
      'طلبٌ ثانٍ بنفس السبب المكتوب الطويل بما يكفي.');
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — قُبل طلبٌ ثانٍ وأوّلُه معلّق';
  EXCEPTION WHEN unique_violation THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — طلبٌ حيٌّ واحد لكل ملفّ';
  END;
END $$;

-- والقرار للإدارة وحدها — لا لجهة الرعاية.
DO $$
DECLARE _req UUID;
BEGIN
  SELECT id INTO _req FROM public.orphan_access_requests
   WHERE requester_id = 'e1000000-0000-4000-8000-000000000003' AND status = 'pending';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
  BEGIN
    PERFORM public.decide_orphan_access(_req, 'approved');
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — أذنت جهةُ الرعاية في ملفّها';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS — الإذن للإدارة وحدها لا لجهة الرعاية';
  END;
END $$;

-- والإذن يفتح الملفّ، ولا يفتح الصورة: إذنان مختلفان لصاحبين مختلفين.
DO $$
DECLARE _req UUID; _r JSONB; _v JSONB;
BEGIN
  SELECT id INTO _req FROM public.orphan_access_requests
   WHERE requester_id = 'e1000000-0000-4000-8000-000000000003' AND status = 'pending';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  _r := public.decide_orphan_access(_req, 'approved', 'كافلٌ محتمل', 30);
  RESET ROLE;

  IF _r->>'expires_at' IS NULL THEN
    RAISE EXCEPTION 'FAIL — أُذن بلا انقضاء: إذنٌ أبديّ نسخةٌ دائمة';
  END IF;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  _v := public.orphan_view('e3000000-0000-4000-8000-00000000000b');
  RESET ROLE;

  IF NOT (_v ? 'detail') THEN
    RAISE EXCEPTION 'FAIL — الإذن لم يفتح الملفّ';
  END IF;
  IF _v->'detail'->>'story' IS NULL OR _v->'detail'->>'city' IS NULL THEN
    RAISE EXCEPTION 'FAIL — الملفّ مفتوحٌ وتفاصيله فارغة';
  END IF;
  /* والصورة المأذون بها تُعرض لمن أُذن له — تضييقٌ دون سياسة المنصّة
     يُخفي صوراً مسموحة بلا سبب. */
  IF _v->'detail'->>'photo_url' IS NULL THEN
    RAISE EXCEPTION 'FAIL — حُجبت صورةٌ مأذونٌ بها عمّن أُذن له';
  END IF;
  RAISE NOTICE 'PASS — الإذن يفتح الملفّ وصورتَه المأذون بها';
END $$;

-- والإذن ينقضي.
DO $$
DECLARE _v JSONB;
BEGIN
  UPDATE public.orphan_access_requests
     SET expires_at = now() - interval '1 day'
   WHERE requester_id = 'e1000000-0000-4000-8000-000000000003' AND status = 'approved';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  _v := public.orphan_view('e3000000-0000-4000-8000-00000000000b');
  RESET ROLE;

  IF _v ? 'detail' THEN
    RAISE EXCEPTION 'FAIL — الإذن المنقضي ما زال يفتح الملفّ';
  END IF;
  RAISE NOTICE 'PASS — الإذن ينقضي فيُغلق الملفّ';

  UPDATE public.orphan_access_requests
     SET expires_at = now() + interval '30 days'
   WHERE requester_id = 'e1000000-0000-4000-8000-000000000003' AND status = 'approved';
END $$;

-- والسحب يُغلق فوراً.
DO $$
DECLARE _req UUID; _v JSONB;
BEGIN
  SELECT id INTO _req FROM public.orphan_access_requests
   WHERE requester_id = 'e1000000-0000-4000-8000-000000000003' AND status = 'approved';

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';
  PERFORM public.revoke_orphan_access(_req, 'انتهى الغرض');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  _v := public.orphan_view('e3000000-0000-4000-8000-00000000000b');
  RESET ROLE;

  IF _v ? 'detail' THEN
    RAISE EXCEPTION 'FAIL — السحب لم يُغلق الملفّ';
  END IF;
  RAISE NOTICE 'PASS — سحب الإذن يُغلق الملفّ فوراً';
END $$;

-- وطابور الإدارة للإدارة وحدها، وطلباتي لي وحدي.
DO $$
DECLARE _j JSONB;
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}';
  BEGIN
    PERFORM public.admin_access_requests();
    RESET ROLE;
    RAISE EXCEPTION 'FAIL — قرأ غيرُ الإدارة طابورَ الأذونات';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;

  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"e1000000-0000-4000-8000-000000000004","role":"authenticated"}';
  _j := public.my_access_requests();
  RESET ROLE;
  IF jsonb_array_length(_j) <> 0 THEN
    RAISE EXCEPTION 'FAIL — رأى كافلٌ طلباتِ غيره (%)', _j;
  END IF;
  RAISE NOTICE 'PASS — الطابور للإدارة، والطلبات لأصحابها';
END $$;

-- وكلُّ قرارٍ يترك أثراً: الإذن بملفّ طفلٍ لا يمرّ بلا سجلّ.
DO $$
DECLARE _n INTEGER;
BEGIN
  SELECT count(*) INTO _n FROM public.audit_log
   WHERE action IN ('orphan.access_requested','orphan.access_approved','orphan.access_revoked')
     AND entity_id = 'e3000000-0000-4000-8000-00000000000b';
  IF _n < 3 THEN
    RAISE EXCEPTION 'FAIL — أثر الأذونات % سطراً لا ثلاثة على الأقلّ', _n;
  END IF;
  RAISE NOTICE 'PASS — الطلب والإذن والسحب كلٌّ يترك أثراً';
END $$;

DO $$ BEGIN RAISE NOTICE '── جميع فحوص حاجب الأطفال اجتازت ──'; END $$;

ROLLBACK;
