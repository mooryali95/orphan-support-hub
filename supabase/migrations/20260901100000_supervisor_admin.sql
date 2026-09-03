-- =====================================================================
-- إدارة المشرفين — الاعتماد والسحب
-- ---------------------------------------------------------------------
-- `certify_supervisor` بُنيت ومحروسة، ولا شاشة تستدعيها. والأثر أن
-- **لا مشرف معتمَد في النظام أصلاً**، فلا يُسنَد إشراف، فلا يتقدّم
-- برنامج — الحلقة مفتوحة من طرفها الأول.
--
-- وقراران هنا يستحقّان الوقوف:
--
-- (١) **الاعتماد بالبريد لا بتصفّح المستخدمين.** دالّةٌ تُعيد قائمة
--     المستخدمين تصير دليلَ حسابات، وهو ما لا تحتاجه الإدارة لتعتمد
--     مشرفاً: هي تعرف من تعتمد وتكتب بريده.
--
-- (٢) **سحب الاعتماد يُنهي الإشراف القائم.** الحارس يفحص عند الإسناد لا
--     بعده، فمشرفٌ يُسحب اعتماده يبقى مُشرفاً على من أُسندوا إليه — وهو
--     أسوأ من ألّا نسحب: اعتمادٌ منزوعٌ على الورق قائمٌ في الواقع. فيُنهى
--     إشرافه، وتقف برامج مستفيديه عن التقدّم حتى يُسنَد غيره — والوقوف
--     هنا **إظهارٌ للمشكلة لا تسبّبٌ فيها**.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) قائمة المشرفين — المعتمَدون وحدهم لا كل المستخدمين
-- ---------------------------------------------------------------------
-- تُعيد عدد من يُشرف عليهم كلٌّ منهم، ليُعرَف أثر السحب **قبل** الضغط
-- لا بعده.
CREATE OR REPLACE FUNCTION public.admin_supervisors()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'قائمة المشرفين للإدارة وحدها' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'user_id', s.user_id,
      'email', u.email,
      'level', s.level,
      'independence_index', s.independence_index,
      'independent', s.independence_index >= public.supervisor_independence_threshold(),
      'certified_at', s.certified_at,
      'active', s.active,
      'note', s.note,
      'assignments', (
        SELECT count(*) FROM public.enrollment_roles r
         WHERE r.person_id = s.user_id AND r.role = 'supervisor' AND r.ended_at IS NULL
      )
    ) ORDER BY s.active DESC, u.email)
    FROM public.supervisor_profiles s
    JOIN auth.users u ON u.id = s.user_id
  ), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_supervisors() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_supervisors() TO authenticated;


-- ---------------------------------------------------------------------
-- 2) الاعتماد بالبريد
-- ---------------------------------------------------------------------
-- بريدٌ لا حساب له يُرفض صراحةً: المشرف يحتاج حساباً ليرصد ويقيس، فقبولُ
-- بريدٍ مجهول هنا يُنشئ اعتماداً معلّقاً لا يُستعمل.
CREATE OR REPLACE FUNCTION public.certify_supervisor_by_email(
  _email TEXT,
  _level TEXT DEFAULT 'foundational',
  _independence INTEGER DEFAULT 0,
  _note TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _user UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'اعتماد المشرفين للإدارة وحدها' USING ERRCODE = '42501';
  END IF;

  SELECT u.id INTO _user FROM auth.users u
   WHERE lower(u.email) = lower(btrim(COALESCE(_email, '')));

  IF _user IS NULL THEN
    RAISE EXCEPTION 'لا حساب بهذا البريد. والمشرف يحتاج حساباً ليرصد ويقيس.'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN public.certify_supervisor(_user, _level, _independence, _note);
END $fn$;
REVOKE ALL ON FUNCTION public.certify_supervisor_by_email(TEXT, TEXT, INTEGER, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.certify_supervisor_by_email(TEXT, TEXT, INTEGER, TEXT)
  TO authenticated;


-- ---------------------------------------------------------------------
-- 3) سحب الاعتماد — وإنهاء ما ترتّب عليه
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_supervisor(_user UUID, _note TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _ended INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'سحب الاعتماد للإدارة وحدها' USING ERRCODE = '42501';
  END IF;

  UPDATE public.supervisor_profiles
     SET active = false, note = COALESCE(_note, note)
   WHERE user_id = _user;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'لا ملفّ اعتماد لهذا المستخدم' USING ERRCODE = 'no_data_found';
  END IF;

  /* الإشراف القائم يُنهى: اعتمادٌ منزوعٌ على الورق قائمٌ في الواقع أسوأ
     من عدم السحب. والملفّات تقف عن التقدّم حتى يُسنَد مشرفٌ غيره —
     وهو إظهارٌ للمشكلة لا تسبّبٌ فيها. */
  UPDATE public.enrollment_roles
     SET ended_at = now()
   WHERE person_id = _user AND role = 'supervisor' AND ended_at IS NULL;
  GET DIAGNOSTICS _ended = ROW_COUNT;

  RETURN jsonb_build_object('revoked', true, 'ended_assignments', _ended);
END $fn$;
REVOKE ALL ON FUNCTION public.revoke_supervisor(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_supervisor(UUID, TEXT) TO authenticated;
