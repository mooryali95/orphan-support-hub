-- =====================================================================
-- مسار أثر التدقيق، وثبات إصلاح H2
-- ---------------------------------------------------------------------
-- هذه الفحوص وُلدت من عطبٍ حقيقي: دفعة تدقيق آلي منحت anon قراءةً على
-- مستوى الجدول (فألغت H2 وكشفت `guardian_id`)، ومنعت `authenticated` من
-- `write_audit` (فقطعت كتابة الأثر في الإدخال والمراجعة والتقارير).
--
-- فالغرض هنا ليس توثيق ما نعرفه، بل أن يسقط البناء إن تكرّر أيّهما.
--
-- ملاحظة على الشكل: هذه المجموعة **بلا BEGIN/ROLLBACK** خلافاً لأخواتها،
-- لأن أحد فحوصها نداءٌ مجرّد يُتوقَّع فشله، وفشلُ عبارة داخل معاملة يُجهضها
-- فيتعذّر ما بعده. فتنظّف المجموعة أثرها بنفسها في آخرها.
-- =====================================================================


-- ── H2: العمود الخاص محجوب، والعمود العام مقروء ──────────────────────
DO $$
DECLARE _n INTEGER;
BEGIN
  SET LOCAL ROLE anon;

  BEGIN
    EXECUTE 'SELECT guardian_id FROM public.orphans LIMIT 1';
    RAISE EXCEPTION 'FAIL — anon يقرأ orphans.guardian_id (انتكس إصلاح H2)';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS — guardian_id ما زال محجوباً عن الزائر';
  END;

  BEGIN
    EXECUTE 'SELECT created_by FROM public.orphans LIMIT 1';
    RAISE EXCEPTION 'FAIL — anon يقرأ orphans.created_by';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS — created_by ما زال محجوباً عن الزائر';
  END;

  -- والحجب ليس غايةً بذاته: الدليل العام يجب أن يبقى عاملاً.
  EXECUTE 'SELECT count(*) FROM public.orphans' INTO _n;
  RAISE NOTICE 'PASS — الدليل العام ما زال مقروءاً للزائر (% ملفاً)', _n;
END $$;
RESET ROLE;


-- ── السالب: النداء المباشر من العميل يُرفض ───────────────────────────
-- مجرّدٌ على مستوى psql عمداً — وهو بالضبط ما يرسله PostgREST عند
-- استدعاء دالة. وأي تغليف (DO، أو EXECUTE داخل DO) يفتح إطار PL/pgSQL
-- يُحسب في المكدّس فيُبطل ما نقيسه؛ وهذا ما أوقع صياغةً أولى لهذا الفحص
-- في نتيجةٍ كاذبة بالمرور.
\set ON_ERROR_STOP 0
SET ROLE authenticated;
SELECT public.write_audit('forged.action', 'orphan', gen_random_uuid(), NULL);
RESET ROLE;
\set ON_ERROR_STOP 1

DO $$
DECLARE _forged INTEGER;
BEGIN
  SELECT count(*) INTO _forged FROM public.audit_log WHERE action = 'forged.action';
  IF _forged > 0 THEN
    RAISE EXCEPTION 'FAIL — العميل كتب سطر تدقيق مباشرةً (% سطراً)', _forged;
  END IF;
  RAISE NOTICE 'PASS — النداء المباشر من العميل مرفوض ولا يترك أثراً';
END $$;


-- ── الموجب: النداء من داخل دالة يمرّ ─────────────────────────────────
-- بلا هذا الفحص يكفي حذف `write_audit` كلها ليمرّ الفحص السابق: نثبت هنا
-- أن المنع انتقائيّ لا شامل، وأن مسار الكتابة المشروع سليم.
CREATE OR REPLACE FUNCTION public._audit_probe() RETURNS VOID
LANGUAGE plpgsql AS $fn$
BEGIN
  PERFORM public.write_audit('probe.internal', 'orphan', gen_random_uuid(), NULL);
END; $fn$;
GRANT EXECUTE ON FUNCTION public._audit_probe() TO authenticated;

SET ROLE authenticated;
SELECT public._audit_probe();
RESET ROLE;

DO $$
DECLARE _n INTEGER;
BEGIN
  SELECT count(*) INTO _n FROM public.audit_log WHERE action = 'probe.internal';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'FAIL — النداء الداخلي لم يكتب الأثر (% سطراً)', _n;
  END IF;
  RAISE NOTICE 'PASS — الدوال تكتب الأثر، والفاعل يُقرأ من الجلسة لا من الوسائط';
END $$;


-- ── تنظيف ما خلّفته المجموعة ─────────────────────────────────────────
DROP FUNCTION IF EXISTS public._audit_probe();
DELETE FROM public.audit_log WHERE action IN ('probe.internal', 'forged.action');

DO $$ BEGIN RAISE NOTICE '── جميع فحوص مسار الأثر اجتازت ──'; END $$;
