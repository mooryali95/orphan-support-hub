-- =====================================================================
-- استرجاع إصلاح H2، وإصلاح مسار أثر التدقيق
-- ---------------------------------------------------------------------
-- هجرتا 20260824024543/024557 (تدقيق أمني آلي) صحّتا نيّةً وأخطأتا أثراً:
--
--   1) `GRANT SELECT ON public.orphans TO anon` منحٌ على مستوى الجدول،
--      وهو بالضبط ما أزالته المرحلة صفر في H2. المنح الشامل يكشف
--      `guardian_id` و`created_by` و`external_ref` و`rejection_reason`
--      عبر REST المباشر مهما اختارت دوال الخادم من أعمدة.
--
--   2) `REVOKE EXECUTE ON write_audit FROM authenticated` يقطع كتابة
--      الأثر. فـ`create_orphan_intake` و`review_orphan` و`review_organization`
--      و`submit_progress_report` وأخواتها **SECURITY INVOKER** عمداً —
--      لتبقى RLS فاعلة على المستدعي — فيجري نداؤها لـ`write_audit`
--      بحقوق المستدعي. بلا المنح ينهار الإدخال والمراجعة والتقارير كلها.
--
-- والقصد من المنع وجيه: ألّا يزوّر مستخدمٌ مسجَّل سطر تدقيق. لكن المنع
-- ليس أداته، لأنه يقطع النداء المشروع والمزوَّر معاً. والأداة هي التمييز
-- بين الاثنين: نداءٌ من داخل دالة أخرى مشروع، ونداءٌ مباشر من العميل لا.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) H2 — المنح العمودي يعود
-- ---------------------------------------------------------------------
-- الأعمدة هي نفسها PUBLIC_COLUMNS في src/lib/orphans.functions.ts،
-- وتشمل ما تحتاجه سياسات RLS وشروط WHERE/ORDER BY.

REVOKE SELECT ON public.orphans FROM anon;
GRANT SELECT (
  id, code, display_name, gender, birth_date, city, region, story,
  photo_url, education_stage, monthly_need, funded_monthly, currency,
  status, org_id, created_at
) ON public.orphans TO anon;

-- ونفس المعالجة لجهات الرعاية إن كان منحها قد اتّسع.
REVOKE SELECT ON public.care_organizations FROM anon;
GRANT SELECT (
  id, name, city, region, about, logo_url, status
) ON public.care_organizations TO anon;


-- ---------------------------------------------------------------------
-- 2) أثر التدقيق — يُكتب من الدوال، ولا يُكتب من العميل
-- ---------------------------------------------------------------------
-- الفاعل غير قابل للتزوير أصلاً: `auth.uid()` تُقرأ من الجلسة لا من
-- الوسائط. المتبقّي هو الفعل والكيان، وهذا ما يحرسه الفحص أدناه.
--
-- `PG_CONTEXT` تُرجع مكدّس النداء. النداء المباشر من العميل يعطي إطار
-- `write_audit` وحده؛ والنداء من دالة أخرى يضيف إطارها فوقه. فوجود
-- إطارين فأكثر دليلٌ على أن النداء داخلي — ولا يستطيع العميل تزويره،
-- إذ المكدّس يبنيه المحرّك لا الطلب.

CREATE OR REPLACE FUNCTION public.write_audit(
  _action TEXT, _entity TEXT, _entity_id UUID, _meta JSONB DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _ctx TEXT; _frames INTEGER;
BEGIN
  GET DIAGNOSTICS _ctx = PG_CONTEXT;
  _frames := (SELECT count(*) FROM regexp_matches(_ctx, 'PL/pgSQL function', 'g'));

  IF _frames < 2 THEN
    RAISE EXCEPTION 'write_audit: يُكتب الأثر من الدوال لا من العميل'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), _action, _entity, _entity_id, _meta);
END; $fn$;

REVOKE ALL ON FUNCTION public.write_audit(TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon;
-- المنح يعود، والحارس داخل الدالة هو ما يمنع الاستعمال المباشر.
GRANT EXECUTE ON FUNCTION public.write_audit(TEXT, TEXT, UUID, JSONB) TO authenticated;
