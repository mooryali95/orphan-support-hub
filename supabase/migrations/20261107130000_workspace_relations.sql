-- =====================================================================
-- الدفعة ٢ — بواباتٌ لما يملكه الحساب فعلاً (UX-16)
-- ---------------------------------------------------------------------
-- «الإشراف» يظهر لكلّ حساب ويفتح «لستَ مشرفاً معتمَداً بعد» بلا طريق،
-- والمترجم لا مدخل له إلى /translate إلا من لوحة الإدارة، وعنوان الدور
-- في الرأس «كافل» للمشرف وعضو المكتب والمترجم لأنه يُقرأ من user_roles وحده.
--
-- `my_workspaces` بتوقيعه، ومعه ما ينقص الواجهة لتعرض الأبواب الصحيحة:
--   supervisor        — اعتماد إشرافٍ نشط (كما يفحصه إسناد المشرف)
--   translator_locales — اللغات التي يراجعها الحساب
--   care_org_status   — حال جهته إن كانت له جهة (لا يكفي «له جهة»: المعلّقة
--                       بابها طلب الاعتماد لا الملفات)
-- كلّها عن الحساب نفسه وحده.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.my_workspaces()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'admin', public.is_admin(),
    'offices', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'role', m.role,
                                                             'country', o.country_code, 'region', o.region)
                                          ORDER BY o.name)
                           FROM public.office_members m JOIN public.offices o ON o.id = m.office_id
                          WHERE m.user_id = auth.uid() AND o.active), '[]'::jsonb),
    'donor_entities', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name,
                                                                    'status', e.status, 'role', m.role)
                                                 ORDER BY e.name)
                                  FROM public.donor_members m JOIN public.donor_entities e ON e.id = m.entity_id
                                 WHERE m.user_id = auth.uid()), '[]'::jsonb),
    'care_org', EXISTS (SELECT 1 FROM public.care_organizations WHERE owner_id = auth.uid()),
    'care_org_status', (SELECT status::text FROM public.care_organizations WHERE owner_id = auth.uid()),
    'guardian', EXISTS (SELECT 1 FROM public.orphans WHERE guardian_id = auth.uid()),
    'supervisor', EXISTS (SELECT 1 FROM public.supervisor_profiles s
                           WHERE s.user_id = auth.uid() AND s.active),
    'translator_locales', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', l.code, 'name', l.name)
                                                     ORDER BY l.code)
                                      FROM public.ui_locale_reviewers r
                                      JOIN public.ui_locales l ON l.code = r.locale
                                     WHERE r.user_id = auth.uid()), '[]'::jsonb),
    'pledges', (SELECT count(*) FROM public.support_pledges WHERE supporter_id = auth.uid()));
$function$;
REVOKE ALL ON FUNCTION public.my_workspaces() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_workspaces() TO authenticated;
