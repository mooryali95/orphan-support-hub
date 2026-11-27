-- =====================================================================
-- سلامة الحقيقة — إثبات
-- ---------------------------------------------------------------------
-- الخطر: طفلٌ مكفول يُحذف أو تتغيّر هويته — من الإدارة، أو من المرآة،
-- أو بحذفٍ متسلسل — دون قرارٍ رسمي؛ أو قرارٌ رسمي يمرّره شخصٌ واحد؛ أو
-- سجلٌّ يُمحى فلا يُعرف ما جرى.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('af100000-0000-4000-8000-00000000000a', 'in-a@example.test', '{}'::jsonb),
  ('af100000-0000-4000-8000-00000000000b', 'in-b@example.test', '{}'::jsonb),
  ('af100000-0000-4000-8000-00000000000c', 'in-c@example.test', '{}'::jsonb),
  ('af100000-0000-4000-8000-000000000005', 'in-sponsor@example.test', '{}'::jsonb),
  ('af100000-0000-4000-8000-000000000006', 'in-org@example.test', '{"role":"care_org"}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES
  ('af100000-0000-4000-8000-00000000000a', 'admin'),
  ('af100000-0000-4000-8000-00000000000b', 'admin'),
  ('af100000-0000-4000-8000-00000000000c', 'admin');
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('af200000-0000-4000-8000-000000000001', 'af100000-0000-4000-8000-000000000006', 'جهة السلامة', 'approved');
UPDATE public.operating_platforms SET org_id = 'af200000-0000-4000-8000-000000000001' WHERE key = 'rowad-albania';
INSERT INTO public.api_clients (id, name, client_key, secret_hash, org_id, scopes, source) VALUES
  ('af300000-0000-4000-8000-000000000001', 'مزامنة', 'ck_live_integrity', 'x', NULL, ARRAY['mirror:write'], 'rowad-albania'),
  ('af300000-0000-4000-8000-000000000002', 'قراءة', 'ck_live_integrity_r', 'x', NULL, ARRAY['orphans:read'], NULL);

-- طفلان من المرآة، يُعتمدان، ويُكفل الأول.
SET LOCAL ROLE service_role;
SELECT public.mirror_apply('af300000-0000-4000-8000-000000000001', 'students',
  '[{"external_ref":"in-1","display_name":"طفل السلامة","gender":"male","age":9,"region":"Tirana"},
    {"external_ref":"in-2","display_name":"طفل الطوارئ","gender":"female","age":8,"region":"Durrës"}]'::jsonb);
SELECT public.mirror_apply('af300000-0000-4000-8000-000000000001', 'trait_dimensions', '[{"key":"NAFS","label_ar":"حفظ النفس"}]'::jsonb);
SELECT public.mirror_apply('af300000-0000-4000-8000-000000000001', 'traits',
  '[{"external_ref":"in-tr","dimension_key":"NAFS","name_ar":"الصبر"}]'::jsonb);
SELECT public.mirror_apply('af300000-0000-4000-8000-000000000001', 'trait_scores',
  '[{"external_ref":"in-ev","student_ref":"in-1","trait_ref":"in-tr","score":6,"scale_max":10,"observed_at":"2026-10-01T00:00:00Z"}]'::jsonb);
RESET ROLE;
UPDATE public.orphans SET status = 'approved', monthly_need = 100, approved_at = now()
 WHERE external_ref IN ('in-1', 'in-2');

DO $$
DECLARE _o UUID; _o2 UUID; _ok BOOLEAN; _req UUID; _r JSONB; _h1 TEXT; _h2 TEXT; _n INT;
BEGIN
  SELECT id INTO _o FROM public.orphans WHERE external_ref = 'in-1';
  SELECT id INTO _o2 FROM public.orphans WHERE external_ref = 'in-2';

  -- ١) الكفالة الفعّالة تقفل
  IF public.orphan_is_locked(_o) THEN RAISE EXCEPTION 'FAIL — قُفل قبل أي كفالة'; END IF;
  INSERT INTO public.sponsorships (sponsor_id, orphan_id, amount, status, started_at)
  VALUES ('af100000-0000-4000-8000-000000000005', _o, 50, 'active', now());
  IF NOT public.orphan_is_locked(_o)
     OR NOT EXISTS (SELECT 1 FROM public.integrity_log WHERE kind = 'locked' AND orphan_id = _o) THEN
    RAISE EXCEPTION 'FAIL — الكفالة الفعّالة لم تقفل الملفّ أو لم تُسجَّل';
  END IF;
  RAISE NOTICE 'PASS — أوّل كفالةٍ فعّالة تقفل الملفّ وتُسجَّل في السلسلة';

  -- ٢) لا حذف — مباشرةً، ولا للقفل نفسه، ولا من الإدارة
  _ok := false;
  BEGIN DELETE FROM public.orphans WHERE id = _o; EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — حُذف طفلٌ مكفول'; END IF;
  _ok := false;
  BEGIN DELETE FROM public.orphan_locks WHERE orphan_id = _o; EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — رُفع القفل بحذفٍ مباشر'; END IF;
  _ok := false;
  BEGIN DELETE FROM public.orphan_trait_scores WHERE orphan_id = _o; EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — حُذفت درجة طفلٍ مكفول'; END IF;
  _ok := false;
  BEGIN DELETE FROM auth.users WHERE id = 'af100000-0000-4000-8000-000000000005';
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok OR NOT EXISTS (SELECT 1 FROM public.sponsorships WHERE orphan_id = _o) THEN
    RAISE EXCEPTION 'FAIL — حذف حساب الكافل محا كفالةً لطفلٍ مكفول';
  END IF;
  -- منصّة التشغيل تشير إلى الجهة أيضاً؛ يُفكّ ذلك مؤقّتاً كي يكون الحارس وحده ما يمنع.
  UPDATE public.operating_platforms SET org_id = NULL WHERE key = 'rowad-albania';
  _ok := false;
  BEGIN DELETE FROM public.care_organizations WHERE id = 'af200000-0000-4000-8000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  UPDATE public.operating_platforms SET org_id = 'af200000-0000-4000-8000-000000000001' WHERE key = 'rowad-albania';
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — حذف الجهة فكّ ربط طفلٍ مكفول بها'; END IF;
  RAISE NOTICE 'PASS — المكفول لا يُحذف، ولا قفله، ولا درجاته، ولا كفالته بحذف حساب كافله أو جهته';

  -- ٣) الإدارة لا تغيّر الهوية مباشرة
  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"af100000-0000-4000-8000-00000000000a","role":"authenticated","aal":"aal2"}';
    UPDATE public.orphans SET display_name = 'اسمٌ آخر' WHERE id = _o;
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok AND (SELECT display_name FROM public.orphans WHERE id = _o) <> 'طفل السلامة' THEN
    RAISE EXCEPTION 'FAIL — تغيّر اسم طفلٍ مكفول بتعديلٍ مباشر';
  END IF;
  _ok := false;
  BEGIN UPDATE public.orphans SET status = 'archived' WHERE id = _o;
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — أُرشف طفلٌ مكفول بلا طلب'; END IF;
  -- الحقول غير الهويّة تبقى قابلة للتحديث (المرحلة الدراسية، التمويل)
  UPDATE public.orphans SET education_stage = 'الصفّ الرابع', funded_monthly = 50 WHERE id = _o;
  RAISE NOTICE 'PASS — الهوية والأرشفة مقفلتان، وما يتقدّم مع الطفل يبقى حرّاً';

  -- ٤) المرآة: التغيير يُمسَك ولا يُطبَّق، ولا تنكسر الدفعة
  SET LOCAL ROLE service_role;
  _r := public.mirror_apply('af300000-0000-4000-8000-000000000001', 'students',
          '[{"external_ref":"in-1","display_name":"اسمٌ من المصدر","region":"Shkodër"},
            {"external_ref":"in-2","display_name":"طفل الطوارئ","region":"Elbasan"}]'::jsonb, ARRAY['in-1']);
  _r := public.mirror_apply('af300000-0000-4000-8000-000000000001', 'trait_scores',
          '[{"external_ref":"in-ev","student_ref":"in-1","trait_ref":"in-tr","score":8,"scale_max":10,"observed_at":"2026-10-15T00:00:00Z"}]'::jsonb,
          ARRAY['in-ev']);
  RESET ROLE;
  IF (SELECT display_name FROM public.orphans WHERE id = _o) <> 'طفل السلامة'
     OR (SELECT region FROM public.orphans WHERE id = _o) <> 'Tirana'
     OR (SELECT external_deleted_at FROM public.orphans WHERE id = _o) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL — المرآة غيّرت هوية مكفولٍ أو حذفته';
  END IF;
  /* غير المكفول منشورٌ أيضاً، فتغييرُ منطقته من المصدر يُمسَك للمراجعة
     (مراجعة المرحلة صفر) — والمهمّ هنا أنّ الدفعة لم تنكسر عنده. */
  IF (SELECT changes->>'region' FROM public.orphan_pending_edits WHERE orphan_id = _o2)
       IS DISTINCT FROM 'Elbasan'
     OR (SELECT status FROM public.orphans WHERE id = _o2) <> 'approved' THEN
    RAISE EXCEPTION 'FAIL — الإمساك كسر بقية الدفعة (غير المكفول لم يُحدَّث)';
  END IF;
  IF (SELECT count(*) FROM public.integrity_discrepancies WHERE orphan_id = _o AND status = 'open') < 2 THEN
    RAISE EXCEPTION 'FAIL — التغيير الممسوك لم يُسجَّل اختلافاً';
  END IF;
  IF (SELECT deleted_at FROM public.orphan_trait_scores WHERE external_ref = 'in-ev') IS NOT NULL
     OR (SELECT score FROM public.orphan_trait_scores WHERE external_ref = 'in-ev') <> 8
     OR (SELECT was_score FROM public.trait_score_revisions WHERE orphan_id = _o) <> 6 THEN
    RAISE EXCEPTION 'FAIL — الدرجة: حذفٌ مرّ، أو تصحيحٌ بلا مراجعة محفوظة';
  END IF;
  RAISE NOTICE 'PASS — المرآة: الهوية والحذف يُمسكان اختلافاً، والتصحيح يحفظ الأصل، والدفعة تكمل';

  -- ٥) الفكّ: الطالب لا يوافق، وموافقةٌ واحدة لا تكفي، والتطبيق مرّة
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"af100000-0000-4000-8000-00000000000a","role":"authenticated","aal":"aal2"}';
  _req := public.admin_request_unlock(_o, 'edit', '{"display_name":"الاسم المصحَّح"}'::jsonb,
            'خطأ إملائي في الاسم بحسب الوثيقة الرسمية', 'doc://birth-cert');
  -- الرفض رمزٌ لا استثناء، فيبقى سطره في سجلّ السلامة.
  IF public.admin_approve_unlock(_req)->>'code' IS DISTINCT FROM 'four_eyes_required' THEN RAISE EXCEPTION 'FAIL — الطالب وافق على طلبه'; END IF;
  _ok := false;
  BEGIN PERFORM public.admin_request_unlock(_o, 'edit', '{"monthly_need":1}'::jsonb, 'تعديل حقلٍ غير مسموح به'); EXCEPTION WHEN OTHERS THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — طلبٌ فتح حقلاً خارج القائمة'; END IF;

  SET LOCAL request.jwt.claims = '{"sub":"af100000-0000-4000-8000-00000000000b","role":"authenticated","aal":"aal2"}';
  PERFORM public.admin_approve_unlock(_req);
  _ok := false;
  BEGIN PERFORM public.admin_approve_unlock(_req); EXCEPTION WHEN OTHERS THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — مسؤولٌ واحد وافق مرّتين'; END IF;
  _ok := false;
  BEGIN PERFORM public.admin_apply_unlock(_req); EXCEPTION WHEN OTHERS THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — طُبّق طلبٌ بموافقةٍ واحدة'; END IF;

  SET LOCAL request.jwt.claims = '{"sub":"af100000-0000-4000-8000-00000000000c","role":"authenticated","aal":"aal2"}';
  PERFORM public.admin_approve_unlock(_req);
  _r := public.admin_apply_unlock(_req);
  _ok := false;
  BEGIN PERFORM public.admin_apply_unlock(_req); EXCEPTION WHEN OTHERS THEN _ok := true; END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — طلبٌ طُبّق مرّتين'; END IF;
  IF (SELECT display_name FROM public.orphans WHERE id = _o) <> 'الاسم المصحَّح'
     OR (SELECT status FROM public.unlock_requests WHERE id = _req) <> 'applied'
     OR NOT EXISTS (SELECT 1 FROM public.integrity_log WHERE kind = 'unlock_applied'
                     AND detail->'changed' ? 'display_name') THEN
    RAISE EXCEPTION 'FAIL — الطلب المعتمد لم يُطبَّق أو لم يُسجَّل قبله وبعده';
  END IF;
  _ok := false;
  BEGIN UPDATE public.orphans SET display_name = 'مرّةً ثانية' WHERE id = _o;
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — بقي الملفّ مفتوحاً بعد تطبيق الطلب'; END IF;
  RAISE NOTICE 'PASS — الفكّ: لا يوافق الطالب، ولا تكفي موافقة، ويُطبَّق مرّة ثم يُغلق';

  -- ٦) النافذة تنتهي
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"af100000-0000-4000-8000-00000000000a","role":"authenticated","aal":"aal2"}';
  _req := public.admin_request_unlock(_o, 'archive', '{"exit_reason":"returned_to_family"}'::jsonb, 'انتقال الطفل إلى رعاية أسرته');
  SET LOCAL request.jwt.claims = '{"sub":"af100000-0000-4000-8000-00000000000b","role":"authenticated","aal":"aal2"}';
  PERFORM public.admin_approve_unlock(_req);
  SET LOCAL request.jwt.claims = '{"sub":"af100000-0000-4000-8000-00000000000c","role":"authenticated","aal":"aal2"}';
  PERFORM public.admin_approve_unlock(_req);
  RESET ROLE;
  ALTER TABLE public.unlock_requests DISABLE TRIGGER USER;
  UPDATE public.unlock_requests SET expires_at = now() - interval '1 minute' WHERE id = _req;
  ALTER TABLE public.unlock_requests ENABLE TRIGGER USER;
  SET LOCAL ROLE authenticated;
  _r := public.admin_apply_unlock(_req);
  RESET ROLE;
  IF (_r->>'ok')::boolean OR (SELECT status FROM public.orphans WHERE id = _o) = 'archived' THEN
    RAISE EXCEPTION 'FAIL — طُبّق طلبٌ انتهت نافذته';
  END IF;
  RAISE NOTICE 'PASS — الطلب المعتمد ينتهي بعد ربع ساعة ولا يُطبَّق بعدها';

  -- ٧) الإذن لمنصّة التشغيل
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"af100000-0000-4000-8000-00000000000a","role":"authenticated","aal":"aal2"}';
  _req := public.admin_request_unlock(_o, 'rowad_update', '{"group_id":null}'::jsonb, 'نقل الطفل إلى صفٍّ آخر في الرواد');
  SET LOCAL request.jwt.claims = '{"sub":"af100000-0000-4000-8000-00000000000b","role":"authenticated","aal":"aal2"}';
  PERFORM public.admin_approve_unlock(_req);
  SET LOCAL request.jwt.claims = '{"sub":"af100000-0000-4000-8000-00000000000c","role":"authenticated","aal":"aal2"}';
  PERFORM public.admin_approve_unlock(_req);
  _r := public.admin_grant_payload(_req);
  _ok := false;
  BEGIN PERFORM public.admin_grant_payload(_req); EXCEPTION WHEN OTHERS THEN _ok := true; END;
  RESET ROLE;
  IF _r->>'aud' <> 'rowad:AL' OR _r->>'sub' <> 'students/in-1' OR _r->>'op' <> 'update'
     OR jsonb_array_length(_r->'approved_by') <> 2 OR NOT _ok THEN
    RAISE EXCEPTION 'FAIL — حمولة الإذن خاطئة أو صدرت مرّتين: %', _r;
  END IF;
  RAISE NOTICE 'PASS — الإذن لمنصّة التشغيل: جمهوره ودولته وسجلّه، وموقّعاه، ويصدر مرّة';

  -- ٨) غير المسؤول لا يطلب
  _ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"af100000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal2"}';
    PERFORM public.admin_request_unlock(_o, 'unlock', '{}'::jsonb, 'محاولة من غير مسؤول');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  RESET ROLE;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — غير مسؤولٍ رفع طلب فكّ'; END IF;
  RAISE NOTICE 'PASS — طلب الفكّ للإدارة وحدها';

  -- ٩) السجلّ لا يُعدَّل ولا يُحذف، وسلسلته سليمة
  _ok := false;
  BEGIN UPDATE public.integrity_log SET kind = 'tampered' WHERE id = (SELECT min(id) FROM public.integrity_log);
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — عُدّل سطرٌ في سجلّ السلامة'; END IF;
  _ok := false;
  BEGIN DELETE FROM public.integrity_log; EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — حُذف سجلّ السلامة'; END IF;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"af100000-0000-4000-8000-00000000000a","role":"authenticated","aal":"aal2"}';
  _r := public.integrity_verify();
  RESET ROLE;
  IF NOT (_r->>'ok')::boolean OR (_r->>'checked')::int < 8 THEN
    RAISE EXCEPTION 'FAIL — سلسلة السجلّ لا تتحقّق: %', _r;
  END IF;
  -- العبث بتعطيل الحارس يُكتشف
  ALTER TABLE public.integrity_log DISABLE TRIGGER integrity_log_frozen;
  UPDATE public.integrity_log SET detail = '{"x":1}'::jsonb WHERE id = (SELECT min(id) FROM public.integrity_log WHERE kind = 'locked');
  ALTER TABLE public.integrity_log ENABLE TRIGGER integrity_log_frozen;
  SET LOCAL ROLE authenticated;
  _r := public.integrity_verify();
  RESET ROLE;
  IF (_r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL — العبث بسطرٍ لم يكسر السلسلة'; END IF;
  RAISE NOTICE 'PASS — السجلّ إلحاقٌ فقط، والعبث به ولو بتعطيل حارسه يكسر السلسلة ويُكتشف';

  -- ١٠) سلسلة دفعات المزامنة
  SET LOCAL ROLE service_role;
  _h1 := public.mirror_log_batch('af300000-0000-4000-8000-000000000001', 'students', 2, 0, repeat('a', 64));
  _h2 := public.mirror_log_batch('af300000-0000-4000-8000-000000000001', 'students', 1, 1, repeat('b', 64));
  _ok := false;
  BEGIN PERFORM public.mirror_log_batch('af300000-0000-4000-8000-000000000002', 'students', 1, 0, repeat('c', 64));
  EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  RESET ROLE;
  IF NOT _ok OR (SELECT prev_hash FROM public.mirror_batches WHERE hash = _h2) <> _h1 THEN
    RAISE EXCEPTION 'FAIL — سلسلة الدفعات: مفتاحٌ بلا صلاحية كتب، أو الحلقة لا ترتبط بسابقتها';
  END IF;
  _ok := false;
  BEGIN DELETE FROM public.mirror_batches; EXCEPTION WHEN insufficient_privilege THEN _ok := true; END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — حُذفت دفعات المزامنة'; END IF;
  RAISE NOTICE 'PASS — كل دفعةٍ مربوطةٌ ببصمة سابقتها، ولا تُحذف';

  -- ١١) الطوارئ توقف الكفالة الجديدة
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"af100000-0000-4000-8000-00000000000a","role":"authenticated","aal":"aal2"}';
  PERFORM public.admin_set_country_emergency('AL', true, 'انقطاع المكتب الوطني');
  RESET ROLE;
  _ok := false;
  BEGIN
    INSERT INTO public.sponsorships (sponsor_id, orphan_id, amount, status)
    VALUES ('af100000-0000-4000-8000-000000000005', _o2, 30, 'pending_payment');
  EXCEPTION WHEN insufficient_privilege THEN _ok := true;
  END;
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL — كفالةٌ جديدة في دولةٍ في وضع الطوارئ'; END IF;
  SET LOCAL ROLE authenticated;
  PERFORM public.admin_set_country_emergency('AL', false, NULL);
  RESET ROLE;
  INSERT INTO public.sponsorships (sponsor_id, orphan_id, amount, status)
  VALUES ('af100000-0000-4000-8000-000000000005', _o2, 30, 'pending_payment');
  RAISE NOTICE 'PASS — الطوارئ توقف الكفالة الجديدة، ورفعها يعيدها';

  -- ١٢) لا تفعيل لمصدرٍ قبل اكتمال قائمته
  SET LOCAL ROLE authenticated;
  _r := public.admin_set_source('rowad-albania', 'active');
  RESET ROLE;
  IF (_r->>'ok')::boolean OR NOT (_r->'missing') ? 'reconciled' THEN
    RAISE EXCEPTION 'FAIL — فُعّل مصدرٌ قبل مطابقته: %', _r;
  END IF;
  RAISE NOTICE 'PASS — المصدر لا يُفعَّل قبل المطابقة ومراجعة المكتب وربط المناطق';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص سلامة الحقيقة اجتازت ──'; END $$;
ROLLBACK;
