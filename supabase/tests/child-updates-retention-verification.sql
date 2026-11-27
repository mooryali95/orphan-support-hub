-- =====================================================================
-- استبقاء وسائط تحديثات الطفل — إثبات (هجرة 20261202100000_child_updates_retention)
-- ---------------------------------------------------------------------
--   الرفض يُعيد مسارات الملفّ لحذفها؛ المرفوض يُمحى بعد 30 يوماً؛ تحديثات
--   الطفل المؤرشَف بلا كفالةٍ قائمة تُمحى بعد المدّة المضبوطة؛ والدوالّ لعميل
--   الخدمة وحده. كل شيء داخل معاملة تنتهي بـ ROLLBACK.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('c2a00000-0000-4000-8000-000000000001', 'cr-super@example.test', '{}'::jsonb),
  ('c2a00000-0000-4000-8000-000000000002', 'cr-entry@example.test', '{}'::jsonb),
  ('c2a00000-0000-4000-8000-000000000003', 'cr-sponsor@example.test', '{}'::jsonb);
INSERT INTO public.country_staff (country_code, user_id, role) VALUES
  ('SN', 'c2a00000-0000-4000-8000-000000000001', 'supervisor'),
  ('SN', 'c2a00000-0000-4000-8000-000000000002', 'data_entry');

-- أطفالٌ بتواريخ قديمة: المحفّزات تكتب updated_at = now()، فتُعطَّل للتهيئة وحدها.
SET LOCAL session_replication_role = replica;
INSERT INTO public.orphans (id, code, display_name, monthly_need, currency, status, approved_at, country, country_code, updated_at) VALUES
  ('c2c00000-0000-4000-8000-000000000001', 'CR-LIVE', 'طفلٌ قائم', 100, 'USD', 'approved', now(), 'SN', 'SN', now()),
  ('c2c00000-0000-4000-8000-000000000002', 'CR-OLD', 'طفلٌ مؤرشَف قديماً', 100, 'USD', 'archived', now(), 'SN', 'SN', now() - interval '400 days'),
  ('c2c00000-0000-4000-8000-000000000003', 'CR-NEW', 'طفلٌ مؤرشَف حديثاً', 100, 'USD', 'archived', now(), 'SN', 'SN', now() - interval '40 days'),
  ('c2c00000-0000-4000-8000-000000000004', 'CR-SPON', 'مؤرشَفٌ بكفالةٍ قائمة', 100, 'USD', 'archived', now(), 'SN', 'SN', now() - interval '400 days');
INSERT INTO public.sponsorships (sponsor_id, orphan_id, amount, currency, status, started_at, ended_at, updated_at) VALUES
  ('c2a00000-0000-4000-8000-000000000003', 'c2c00000-0000-4000-8000-000000000002', 50, 'USD', 'cancelled', now() - interval '800 days', now() - interval '500 days', now() - interval '500 days'),
  ('c2a00000-0000-4000-8000-000000000003', 'c2c00000-0000-4000-8000-000000000004', 50, 'USD', 'active', now() - interval '800 days', NULL, now() - interval '500 days');
INSERT INTO public.child_updates (id, orphan_id, country_code, kind, storage_path, poster_path, duration_seconds,
                                  caption_ar, guardian_consent, uploaded_by, status, reviewed_by, reviewed_at, reject_reason, created_at) VALUES
  -- قيد الحسم: يُرفض في الفحص الأوّل
  ('c2e00000-0000-4000-8000-000000000001', 'c2c00000-0000-4000-8000-000000000001', 'SN', 'video',
   'c2c00000-0000-4000-8000-000000000001/a1111111-1111-4111-8111-111111111111.mp4',
   'c2c00000-0000-4000-8000-000000000001/a2222222-2222-4222-8222-222222222222.jpg', 20,
   'مقطع', true, 'c2a00000-0000-4000-8000-000000000002', 'pending', NULL, NULL, NULL, now()),
  -- مرفوضٌ قديم ← يُمحى
  ('c2e00000-0000-4000-8000-000000000002', 'c2c00000-0000-4000-8000-000000000001', 'SN', 'photo',
   'c2c00000-0000-4000-8000-000000000001/b1111111-1111-4111-8111-111111111111.jpg', NULL, NULL,
   'صورة', true, 'c2a00000-0000-4000-8000-000000000002', 'rejected', 'c2a00000-0000-4000-8000-000000000001',
   now() - interval '31 days', 'سبب', now() - interval '40 days'),
  -- مرفوضٌ حديث ← يبقى
  ('c2e00000-0000-4000-8000-000000000003', 'c2c00000-0000-4000-8000-000000000001', 'SN', 'note', NULL, NULL, NULL,
   'ملاحظة', false, 'c2a00000-0000-4000-8000-000000000002', 'rejected', 'c2a00000-0000-4000-8000-000000000001',
   now() - interval '5 days', 'سبب', now() - interval '6 days'),
  -- معتمدٌ لطفلٍ قائم ← يبقى
  ('c2e00000-0000-4000-8000-000000000004', 'c2c00000-0000-4000-8000-000000000001', 'SN', 'photo',
   'c2c00000-0000-4000-8000-000000000001/c1111111-1111-4111-8111-111111111111.jpg', NULL, NULL,
   'صورة', true, 'c2a00000-0000-4000-8000-000000000002', 'approved', 'c2a00000-0000-4000-8000-000000000001',
   now() - interval '700 days', NULL, now() - interval '700 days'),
  -- معتمدٌ لمؤرشَفٍ قديم بلا كفالة ← يُمحى
  ('c2e00000-0000-4000-8000-000000000005', 'c2c00000-0000-4000-8000-000000000002', 'SN', 'photo',
   'c2c00000-0000-4000-8000-000000000002/d1111111-1111-4111-8111-111111111111.jpg', NULL, NULL,
   'صورة', true, 'c2a00000-0000-4000-8000-000000000002', 'approved', 'c2a00000-0000-4000-8000-000000000001',
   now() - interval '600 days', NULL, now() - interval '600 days'),
  -- مؤرشَفٌ حديثاً ← يبقى بالمدّة الافتراضية
  ('c2e00000-0000-4000-8000-000000000006', 'c2c00000-0000-4000-8000-000000000003', 'SN', 'note', NULL, NULL, NULL,
   'ملاحظة', false, 'c2a00000-0000-4000-8000-000000000002', 'approved', 'c2a00000-0000-4000-8000-000000000001',
   now() - interval '600 days', NULL, now() - interval '600 days'),
  -- مؤرشَفٌ بكفالةٍ قائمة ← يبقى
  ('c2e00000-0000-4000-8000-000000000007', 'c2c00000-0000-4000-8000-000000000004', 'SN', 'note', NULL, NULL, NULL,
   'ملاحظة', false, 'c2a00000-0000-4000-8000-000000000002', 'approved', 'c2a00000-0000-4000-8000-000000000001',
   now() - interval '600 days', NULL, now() - interval '600 days');
SET LOCAL session_replication_role = origin;

DO $$
DECLARE _r JSONB; _ids UUID[]; _n INT;
  _sup TEXT := '{"sub":"c2a00000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';
BEGIN
  -- ١) الرفض يُعيد مسارَي المقطع وغلافه لحذفهما من الخزنة، والاعتماد لا يُعيد شيئاً
  PERFORM set_config('request.jwt.claims', _sup, true);
  _r := public.child_update_review('c2e00000-0000-4000-8000-000000000001', 'reject', 'وجهٌ غير الطفل');
  IF NOT (_r->>'ok')::boolean OR jsonb_array_length(_r->'purge') <> 2
     OR NOT (_r->'purge') ? 'c2c00000-0000-4000-8000-000000000001/a2222222-2222-4222-8222-222222222222.jpg' THEN
    RAISE EXCEPTION 'FAIL — الرفض لم يُعِد مسارات الحذف: %', _r;
  END IF;
  RAISE NOTICE 'PASS — الرفض يُعيد مسار الوسيط وغلافه لحذفهما فوراً';

  -- ٢) الدوالّ لعميل الخدمة وحده
  IF has_function_privilege('authenticated', 'public.child_updates_retention_due(integer, integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.child_updates_retention_done(uuid[], integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.child_updates_retention_ids(integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.child_updates_retention_due(integer, integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.child_updates_retention_done(uuid[], integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL — دوالّ الاستبقاء ليست لعميل الخدمة وحده';
  END IF;
  IF public.child_updates_retention_due(7)->>'code' IS DISTINCT FROM 'archive_days_invalid' THEN
    RAISE EXCEPTION 'FAIL — مدّةٌ أقصر من 30 يوماً قُبلت';
  END IF;
  RAISE NOTICE 'PASS — الاستبقاء لعميل الخدمة وحده، ولا مدّة أقلّ من 30 يوماً';

  -- ٣) المستحقّ بالمدّة الافتراضية: المرفوض القديم، ومؤرشَفٌ قديم بلا كفالة
  _r := public.child_updates_retention_due();
  SELECT array_agg((x->>'id')::uuid ORDER BY x->>'id') INTO _ids FROM jsonb_array_elements(_r->'items') x
   WHERE (x->>'id')::uuid::text LIKE 'c2e00000%';
  IF _ids IS DISTINCT FROM ARRAY['c2e00000-0000-4000-8000-000000000002', 'c2e00000-0000-4000-8000-000000000005']::uuid[] THEN
    RAISE EXCEPTION 'FAIL — المستحقّ غير المتوقّع: %', _ids;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_r->'items') x
                  WHERE x->>'id' = 'c2e00000-0000-4000-8000-000000000005'
                    AND x->'paths' = '["c2c00000-0000-4000-8000-000000000002/d1111111-1111-4111-8111-111111111111.jpg"]'::jsonb) THEN
    RAISE EXCEPTION 'FAIL — مسارات المستحقّ ناقصة';
  END IF;
  RAISE NOTICE 'PASS — يُسرد المرفوض بعد 30 يوماً وتحديثات المؤرشَف بلا كفالة بعد 365، بمساراتها';

  -- ٤) المدّة قابلةٌ للضبط: 30 يوماً تشمل المؤرشَف حديثاً، لا من له كفالةٌ قائمة
  _r := public.child_updates_retention_due(30);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_r->'items') x WHERE x->>'id' = 'c2e00000-0000-4000-8000-000000000006')
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(_r->'items') x WHERE x->>'id' = 'c2e00000-0000-4000-8000-000000000007') THEN
    RAISE EXCEPTION 'FAIL — المدّة المضبوطة لم تُطبَّق كما يجب';
  END IF;
  RAISE NOTICE 'PASS — المدّة قابلةٌ للضبط، والكفالة القائمة تحمي الوسائط';

  -- ٥) المحو: ما سُرد ومستحقّ وحده، ويُسجَّل
  _r := public.child_updates_retention_done(ARRAY[
          'c2e00000-0000-4000-8000-000000000002', 'c2e00000-0000-4000-8000-000000000005',
          'c2e00000-0000-4000-8000-000000000003', 'c2e00000-0000-4000-8000-000000000004']::uuid[]);
  SELECT count(*) INTO _n FROM public.child_updates WHERE id::text LIKE 'c2e00000%';
  IF (_r->>'deleted')::int <> 2 OR _n <> 5
     OR EXISTS (SELECT 1 FROM public.child_updates WHERE id IN ('c2e00000-0000-4000-8000-000000000002', 'c2e00000-0000-4000-8000-000000000005')) THEN
    RAISE EXCEPTION 'FAIL — المحو تجاوز المستحقّ أو قصّر عنه: % / %', _r, _n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE action = 'child_updates_retention') THEN
    RAISE EXCEPTION 'FAIL — المحو لم يُسجَّل';
  END IF;
  RAISE NOTICE 'PASS — المحو يقتصر على المستحقّ ويُسجَّل في audit_log';
END $$;
ROLLBACK;
