-- صلاحيات الدول: الأدوار، وعزل الدول، والعينان — إثبات
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a9700000-0000-4000-8000-000000000001', 'cs-admin@example.test', '{}'::jsonb),
  ('a9700000-0000-4000-8000-000000000002', 'cs-sup1@example.test', '{}'::jsonb),
  ('a9700000-0000-4000-8000-000000000003', 'cs-sup2@example.test', '{}'::jsonb),
  ('a9700000-0000-4000-8000-000000000004', 'cs-entry@example.test', '{}'::jsonb),
  ('a9700000-0000-4000-8000-000000000005', 'cs-viewer@example.test', '{}'::jsonb),
  ('a9700000-0000-4000-8000-000000000006', 'cs-thai@example.test', '{}'::jsonb);
INSERT INTO public.user_roles (user_id, role) VALUES ('a9700000-0000-4000-8000-000000000001', 'admin');

CREATE OR REPLACE FUNCTION pg_temp.as_user(_n INT) RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    format('{"sub":"a9700000-0000-4000-8000-00000000000%s","role":"authenticated"}', _n), true);
$$;
CREATE OR REPLACE FUNCTION pg_temp.denied(_sql TEXT) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN false;
EXCEPTION WHEN insufficient_privilege THEN RETURN true;
END $$;

DO $$
DECLARE _r JSONB; _o UUID; _c UUID; _a UUID;
BEGIN
  -- الإدارة تعيّن الفريق
  PERFORM pg_temp.as_user(1);
  PERFORM public.country_staff_set('SD', 'cs-sup1@example.test', 'supervisor');
  PERFORM public.country_staff_set('SD', 'CS-SUP2@example.test', 'supervisor');
  PERFORM public.country_staff_set('SD', 'cs-entry@example.test', 'data_entry');
  PERFORM public.country_staff_set('TH', 'cs-thai@example.test', 'supervisor');
  _r := public.country_staff_set('SD', 'nobody@example.test', 'viewer');
  IF _r->>'code' <> 'user_not_found' THEN RAISE EXCEPTION 'FAIL — بريدٌ مجهول: %', _r; END IF;

  -- المشرف يضيف مطّلعاً، ولا يعيّن مشرفاً ولا يمسّ نفسه ولا مشرفاً آخر
  PERFORM pg_temp.as_user(2);
  _r := public.country_staff_set('SD', 'cs-viewer@example.test', 'viewer');
  IF NOT (_r->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL — المشرف لم يضف مطّلعاً: %', _r; END IF;
  IF public.country_staff_set('SD', 'cs-thai@example.test', 'supervisor')->>'code' <> 'role_forbidden'
     OR public.country_staff_set('SD', 'cs-sup1@example.test', NULL)->>'code' <> 'role_forbidden'
     OR public.country_staff_set('SD', 'cs-sup2@example.test', 'viewer')->>'code' <> 'role_forbidden' THEN
    RAISE EXCEPTION 'FAIL — المشرف تجاوز حدّه';
  END IF;
  IF NOT pg_temp.denied($q$SELECT public.country_staff_set('TH', 'cs-viewer@example.test', 'viewer')$q$)
     OR NOT pg_temp.denied($q$SELECT public.admin_country_source_set('SD', NULL, 'none')$q$) THEN
    RAISE EXCEPTION 'FAIL — المشرف أدار دولةً أخرى أو غيّر وضع المكتب';
  END IF;
  RAISE NOTICE 'PASS — الإدارة تعيّن المشرفين، والمشرف يدير المدخلين والمطّلعين في دولته وحدها';

  -- المدخل يرفع ولا يحسم
  PERFORM pg_temp.as_user(4);
  _r := public.admin_golden_import('wamy', 'SD', NULL,
    '[{"external_ref":"sd-1","observed_at":"2026-11-01T00:00:00Z",
       "fields":{"display_name":"آمنة يوسف","birth_date":"2013-02-01","gender":"female"}}]'::jsonb);
  IF (_r->>'unlinked')::int <> 1 THEN RAISE EXCEPTION 'FAIL — رفع المدخل: %', _r; END IF;
  IF NOT pg_temp.denied($q$SELECT public.admin_link_create_unmatched('SD')$q$)
     OR NOT pg_temp.denied($q$SELECT public.admin_golden_import('wamy', 'TH', NULL, '[{"external_ref":"x","fields":{"city":"y"}}]'::jsonb)$q$) THEN
    RAISE EXCEPTION 'FAIL — المدخل حسم أو رفع لدولةٍ أخرى';
  END IF;
  PERFORM pg_temp.as_user(2);
  PERFORM public.admin_link_create_unmatched('SD');
  SELECT orphan_id INTO _o FROM public.orphan_source_links WHERE source = 'wamy' AND external_ref = 'sd-1';

  -- المدخل يرفع تغييراً حرجاً: لا يحسمه، والمشرف يحسمه
  PERFORM pg_temp.as_user(4);
  PERFORM public.admin_golden_import('wamy', 'SD', NULL,
    '[{"external_ref":"sd-1","observed_at":"2026-11-02T00:00:00Z","fields":{"birth_date":"2013-03-01"}}]'::jsonb);
  SELECT id INTO _c FROM public.data_conflicts WHERE orphan_id = _o AND field = 'birth_date' AND status = 'open';
  IF NOT pg_temp.denied(format($q$SELECT public.admin_conflict_resolve(%L, 'accept')$q$, _c)) THEN
    RAISE EXCEPTION 'FAIL — المدخل حسم تعارضاً';
  END IF;
  PERFORM pg_temp.as_user(2);
  IF NOT (public.admin_conflict_resolve(_c, 'accept')->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL — المشرف لم يحسم'; END IF;
  RAISE NOTICE 'PASS — المدخل يرفع ولا يحسم، والمشرف يحسم في دولته';

  -- العينان: ما رفعه المشرف بنفسه يحسمه مشرفٌ آخر
  PERFORM public.admin_golden_import('wamy', 'SD', NULL,
    '[{"external_ref":"sd-1","observed_at":"2026-11-03T00:00:00Z","fields":{"birth_date":"2007-01-01"}}]'::jsonb);
  SELECT id INTO _c FROM public.data_conflicts WHERE orphan_id = _o AND field = 'birth_date' AND status = 'open';
  SELECT id INTO _a FROM public.data_alerts WHERE orphan_id = _o AND code = 'age_shift' AND status = 'open';
  IF public.admin_conflict_resolve(_c, 'accept')->>'code' <> 'four_eyes_required'
     OR public.admin_alert_resolve(_a, 'reviewed')->>'code' <> 'four_eyes_required' THEN
    RAISE EXCEPTION 'FAIL — المشرف اعتمد ما رفعه';
  END IF;
  IF (SELECT raised_by FROM public.data_alerts WHERE id = _a) <> 'a9700000-0000-4000-8000-000000000002'
     OR (SELECT received_by FROM public.orphan_field_history WHERE orphan_id = _o AND field = 'birth_date'
          ORDER BY id DESC LIMIT 1) <> 'a9700000-0000-4000-8000-000000000002' THEN
    RAISE EXCEPTION 'FAIL — الرافع لم يُسجَّل';
  END IF;
  PERFORM pg_temp.as_user(3);
  IF NOT (public.admin_alert_resolve(_a, 'reviewed')->>'ok')::boolean
     OR NOT (public.admin_conflict_resolve(_c, 'keep')->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL — المشرف الثاني لم يحسم';
  END IF;
  RAISE NOTICE 'PASS — العينان: من رفع التغيير الحرج لا يعتمده، ويحسمه مشرفٌ آخر، والرافع مسجَّل';

  -- العزل: مشرف تايلاند لا يرى السودان، والمطّلع يرى ولا يرفع
  PERFORM pg_temp.as_user(6);
  IF NOT pg_temp.denied($q$SELECT public.admin_conflicts('SD')$q$)
     OR NOT pg_temp.denied($q$SELECT public.admin_alerts(NULL)$q$)
     OR NOT pg_temp.denied(format($q$SELECT public.admin_conflict_resolve(%L, 'keep')$q$, _c))
     OR (SELECT array_agg(x->>'code') FROM jsonb_array_elements(public.admin_data_health()) x) <> ARRAY['TH'] THEN
    RAISE EXCEPTION 'FAIL — مشرف تايلاند رأى السودان';
  END IF;
  PERFORM pg_temp.as_user(5);
  IF (SELECT array_agg(x->>'code') FROM jsonb_array_elements(public.admin_data_health()) x) <> ARRAY['SD']
     OR NOT pg_temp.denied($q$SELECT public.admin_golden_import('wamy', 'SD', NULL, '[{"external_ref":"x","fields":{"city":"y"}}]'::jsonb)$q$)
     OR (public.my_country_access()->'countries'->0->>'role') <> 'viewer' THEN
    RAISE EXCEPTION 'FAIL — المطّلع';
  END IF;
  RAISE NOTICE 'PASS — كل فريقٍ يرى دولته وحدها، والمطّلع يرى ولا يرفع';
END $$;
DO $$ BEGIN RAISE NOTICE '── جميع فحوص صلاحيات الدول اجتازت ──'; END $$;
ROLLBACK;
