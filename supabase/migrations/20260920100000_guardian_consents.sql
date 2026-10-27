-- =====================================================================
-- كهاتين — مساحة الوليّ: أين وصل طفله، وما المطلوب منه، والموافقة بضغطة
-- ---------------------------------------------------------------------
-- الموافقة «بضغطة» ليست موافقةً بلا وثيقة: كل ضغطةٍ تكتب سجلّ موافقةٍ
-- إلكترونية (من، متى، على أيّ نصّ بالحرف) يصير هو الوثيقة. والقيود
-- القائمة (موافقة الصورة الكاملة تحتاج وثيقة، والموافقة للوليّ والوصي
-- وحدهما) تبقى كما هي — والسجلّ يحقّقها.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.guardian_e_consents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  orphan_id   UUID NOT NULL REFERENCES public.orphans(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL CHECK (subject IN ('enrollment', 'photo')),
  subject_ref UUID,
  decision    TEXT NOT NULL,
  statement   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.guardian_e_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gec_read ON public.guardian_e_consents;
CREATE POLICY gec_read ON public.guardian_e_consents FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_orphan(orphan_id));
GRANT SELECT ON public.guardian_e_consents TO authenticated;

CREATE OR REPLACE FUNCTION public.consent_statement(_subject TEXT, _decision TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE _subject || ':' || _decision
    WHEN 'enrollment:granted' THEN 'أوافق بصفتي وليّاً على التحاق الطفل ببرنامج بناء الأهلية، وعلى أن يُقاس تقدّمه وتُرصد سماته، ويُعرض ذلك لمن تأذن له الإدارة.'
    WHEN 'photo:face_hidden' THEN 'أوافق على نشر صورٍ للطفل لا يظهر فيها وجهه.'
    WHEN 'photo:granted' THEN 'أوافق على نشر صورٍ للطفل يظهر فيها وجهه، وأعلم أنني أستطيع سحب الموافقة متى شئت فتُحذف الصورة.'
    WHEN 'photo:withdrawn' THEN 'أسحب موافقتي على نشر صور الطفل.'
    ELSE NULL END;
$fn$;


CREATE OR REPLACE FUNCTION public.guardian_children_overview()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', o.id, 'name', o.display_name, 'code', o.code, 'status', o.status,
    'photo_consent', o.photo_consent,
    'enrollment', (SELECT jsonb_build_object(
                     'program', pr.title, 'stage', e.stage,
                     'accepted', (SELECT count(*) FROM public.enrollment_units u
                                   WHERE u.enrollment_id = e.id AND u.status = 'accepted'),
                     'total', (SELECT count(*) FROM public.program_units pu
                                WHERE pu.program_id = e.program_id AND pu.active),
                     'next', (SELECT pu.title FROM public.program_units pu
                               LEFT JOIN public.enrollment_units u ON u.unit_id = pu.id AND u.enrollment_id = e.id
                              WHERE pu.program_id = e.program_id AND pu.active
                                AND COALESCE(u.status::text, 'pending') <> 'accepted'
                              ORDER BY pu.ordinal LIMIT 1))
                     FROM public.program_enrollments e JOIN public.programs pr ON pr.id = e.program_id
                    WHERE e.orphan_id = o.id AND e.status IN ('proposed', 'funded')
                    ORDER BY e.created_at DESC LIMIT 1),
    'pending_consents', COALESCE((SELECT jsonb_agg(jsonb_build_object('role_id', r.id, 'program', pr.title))
                          FROM public.enrollment_roles r
                          JOIN public.program_enrollments e ON e.id = r.enrollment_id
                          JOIN public.programs pr ON pr.id = e.program_id
                         WHERE e.orphan_id = o.id AND r.role IN ('guardian', 'trustee')
                           AND r.ended_at IS NULL AND r.consent_at IS NULL
                           AND r.person_id = auth.uid()), '[]'::jsonb)
  ) ORDER BY o.created_at DESC), '[]'::jsonb)
  FROM public.orphans o
  WHERE o.guardian_id = auth.uid() AND auth.uid() IS NOT NULL;
$fn$;
REVOKE ALL ON FUNCTION public.guardian_children_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardian_children_overview() TO authenticated;


CREATE OR REPLACE FUNCTION public.guardian_consent_enrollment(_role UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _r public.enrollment_roles; _orphan UUID; _id UUID;
BEGIN
  SELECT * INTO _r FROM public.enrollment_roles WHERE id = _role;
  IF _r.id IS NULL OR _r.person_id IS DISTINCT FROM auth.uid() OR _r.role NOT IN ('guardian', 'trustee')
     OR _r.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'consent_denied' USING ERRCODE = '42501';
  END IF;
  SELECT orphan_id INTO _orphan FROM public.program_enrollments WHERE id = _r.enrollment_id;
  INSERT INTO public.guardian_e_consents (user_id, orphan_id, subject, subject_ref, decision, statement)
  VALUES (auth.uid(), _orphan, 'enrollment', _role, 'granted', public.consent_statement('enrollment', 'granted'))
  RETURNING id INTO _id;
  UPDATE public.enrollment_roles SET consent_at = now(), consent_document = 'e-consent:' || _id
   WHERE id = _role;
  RETURN _id;
END $fn$;
REVOKE ALL ON FUNCTION public.guardian_consent_enrollment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardian_consent_enrollment(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.guardian_set_photo_consent(_orphan UUID, _state TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orphans WHERE id = _orphan AND guardian_id = auth.uid()) THEN
    RAISE EXCEPTION 'consent_denied' USING ERRCODE = '42501';
  END IF;
  IF public.consent_statement('photo', _state) IS NULL THEN RAISE EXCEPTION 'invalid_state'; END IF;
  INSERT INTO public.guardian_e_consents (user_id, orphan_id, subject, decision, statement)
  VALUES (auth.uid(), _orphan, 'photo', _state, public.consent_statement('photo', _state))
  RETURNING id INTO _id;
  UPDATE public.orphans
     SET photo_consent = _state::public.photo_consent_state,
         photo_consent_at = now(), photo_consent_by = auth.uid(),
         photo_consent_doc = 'e-consent:' || _id
   WHERE id = _orphan;
  RETURN _id;
END $fn$;
REVOKE ALL ON FUNCTION public.guardian_set_photo_consent(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardian_set_photo_consent(UUID, TEXT) TO authenticated;
