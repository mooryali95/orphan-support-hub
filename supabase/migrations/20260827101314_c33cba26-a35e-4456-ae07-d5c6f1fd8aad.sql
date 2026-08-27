DO $$ BEGIN
  CREATE TYPE public.notification_kind AS ENUM (
    'welcome',
    'orphan_approved', 'orphan_rejected',
    'organization_approved', 'organization_rejected',
    'sponsorship_started', 'payment_succeeded', 'payment_failed',
    'report_published', 'report_rejected',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.email_state AS ENUM ('pending', 'sent', 'failed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS kind public.notification_kind NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS entity TEXT,
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS email_state public.email_state NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS email_attempts SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_error TEXT,
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_outbox
  ON public.notifications(email_state, created_at)
  WHERE email_state = 'pending';

CREATE OR REPLACE FUNCTION public.notify(
  _user UUID,
  _kind public.notification_kind,
  _title TEXT,
  _body TEXT DEFAULT NULL,
  _link TEXT DEFAULT NULL,
  _entity TEXT DEFAULT NULL,
  _entity_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _id UUID;
BEGIN
  IF _user IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.notifications (user_id, kind, title, body, link, entity, entity_id)
  VALUES (_user, _kind, _title, _body, _link, _entity, _entity_id)
  RETURNING id INTO _id;
  RETURN _id;
END $fn$;
REVOKE ALL ON FUNCTION public.notify(UUID, public.notification_kind, TEXT, TEXT, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.write_timeline(
  _orphan UUID, _event_type TEXT, _detail TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO public.timeline_events (orphan_id, actor_id, event_type, detail)
  VALUES (_orphan, auth.uid(), _event_type, _detail);
END $fn$;
REVOKE ALL ON FUNCTION public.write_timeline(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.orphan_sponsor_ids(_orphan UUID)
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT DISTINCT sponsor_id FROM public.sponsorships
   WHERE orphan_id = _orphan AND status IN ('active', 'paused');
$fn$;
REVOKE ALL ON FUNCTION public.orphan_sponsor_ids(UUID) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.progress_reports
  ADD COLUMN IF NOT EXISTS attachments TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_report_orphan_period
  ON public.progress_reports(orphan_id, period);

CREATE OR REPLACE FUNCTION public.submit_progress_report(_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _orphan UUID := (_payload->>'orphan_id')::uuid;
  _period TEXT := _payload->>'period';
  _id UUID;
  _org UUID;
BEGIN
  IF _orphan IS NULL OR COALESCE(_period, '') = '' THEN
    RAISE EXCEPTION 'report: orphan_id and period are required' USING ERRCODE = '22023';
  END IF;
  IF _period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'report: period must be YYYY-MM, got %', _period USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_manage_orphan(_orphan) THEN
    RAISE EXCEPTION 'report: not yours to report on' USING ERRCODE = '42501';
  END IF;

  SELECT org_id INTO _org FROM public.orphans WHERE id = _orphan;

  INSERT INTO public.progress_reports (
    orphan_id, org_id, period, education_note, health_note, living_note,
    summary, attachments, status, created_by
  ) VALUES (
    _orphan, _org, _period,
    NULLIF(_payload->>'education_note', ''),
    NULLIF(_payload->>'health_note', ''),
    NULLIF(_payload->>'living_note', ''),
    NULLIF(_payload->>'summary', ''),
    COALESCE(
      (SELECT array_agg(value::text) FROM jsonb_array_elements_text(_payload->'attachments')),
      '{}'
    ),
    'submitted', auth.uid()
  )
  ON CONFLICT (orphan_id, period) DO UPDATE SET
    education_note = EXCLUDED.education_note,
    health_note    = EXCLUDED.health_note,
    living_note    = EXCLUDED.living_note,
    summary        = EXCLUDED.summary,
    attachments    = EXCLUDED.attachments,
    status         = 'submitted',
    review_note    = NULL,
    reviewed_by    = NULL,
    reviewed_at    = NULL,
    updated_at     = now()
  WHERE public.progress_reports.status <> 'approved'
  RETURNING id INTO _id;

  IF _id IS NULL THEN
    RAISE EXCEPTION 'report: an approved report for % cannot be edited', _period
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.write_timeline(_orphan, 'report.submitted', _period);
  PERFORM public.write_audit('report.submitted', 'progress_report', _id,
    jsonb_build_object('orphan_id', _orphan, 'period', _period));

  RETURN jsonb_build_object('id', _id);
END $fn$;
REVOKE ALL ON FUNCTION public.submit_progress_report(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_progress_report(JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_progress_report(
  _id UUID, _decision TEXT, _note TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _orphan UUID; _period TEXT; _name TEXT; _sponsor UUID; _org_owner UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'review_progress_report: not authorised' USING ERRCODE = '42501';
  END IF;
  IF _decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'review_progress_report: unknown decision %', _decision USING ERRCODE = '22023';
  END IF;
  IF _decision = 'rejected' AND COALESCE(_note, '') = '' THEN
    RAISE EXCEPTION 'review_progress_report: rejection requires a note' USING ERRCODE = '22023';
  END IF;

  UPDATE public.progress_reports SET
    status = _decision::public.report_status,
    review_note = _note,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    published_at = CASE WHEN _decision = 'approved' THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = _id
  RETURNING orphan_id, period INTO _orphan, _period;

  IF _orphan IS NULL THEN
    RAISE EXCEPTION 'review_progress_report: no report %', _id USING ERRCODE = 'P0002';
  END IF;

  SELECT display_name INTO _name FROM public.orphans WHERE id = _orphan;

  IF _decision = 'approved' THEN
    PERFORM public.write_timeline(_orphan, 'report.published', _period);
    FOR _sponsor IN SELECT public.orphan_sponsor_ids(_orphan) LOOP
      PERFORM public.notify(
        _sponsor, 'report_published',
        'تقرير جديد عن ' || COALESCE(_name, 'من تكفله'),
        'صدر تقرير الأثر لفترة ' || _period || '.',
        '/dashboard', 'progress_report', _id);
    END LOOP;
  ELSE
    PERFORM public.write_timeline(_orphan, 'report.rejected', _period);
    SELECT co.owner_id INTO _org_owner
      FROM public.orphans o JOIN public.care_organizations co ON co.id = o.org_id
     WHERE o.id = _orphan;
    PERFORM public.notify(
      _org_owner, 'report_rejected',
      'أُعيد تقرير ' || _period,
      COALESCE(_note, 'يُرجى المراجعة وإعادة الإرسال.'),
      '/org', 'progress_report', _id);
  END IF;

  PERFORM public.write_audit('report.' || _decision, 'progress_report', _id,
    jsonb_build_object('orphan_id', _orphan, 'period', _period, 'note', _note));
END $fn$;
REVOKE ALL ON FUNCTION public.review_progress_report(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_progress_report(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_orphan(
  _id UUID, _decision TEXT, _code public.rejection_code DEFAULT NULL, _reason TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _prev public.orphan_status; _owner UUID; _name TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'review_orphan: not authorised' USING ERRCODE = '42501';
  END IF;
  IF _decision NOT IN ('approved', 'rejected', 'under_review') THEN
    RAISE EXCEPTION 'review_orphan: unknown decision %', _decision USING ERRCODE = '22023';
  END IF;
  IF _decision = 'rejected' AND _code IS NULL THEN
    RAISE EXCEPTION 'review_orphan: rejection requires a structured code' USING ERRCODE = '22023';
  END IF;

  SELECT status, display_name INTO _prev, _name FROM public.orphans WHERE id = _id;
  IF _prev IS NULL THEN
    RAISE EXCEPTION 'review_orphan: no orphan %', _id USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.orphans SET
    status = _decision::public.orphan_status,
    approved_at = CASE WHEN _decision = 'approved' THEN now() ELSE NULL END,
    rejection_code = CASE WHEN _decision = 'rejected' THEN _code ELSE NULL END,
    rejection_reason = CASE WHEN _decision = 'rejected' THEN _reason ELSE NULL END,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  WHERE id = _id;

  SELECT co.owner_id INTO _owner
    FROM public.orphans o JOIN public.care_organizations co ON co.id = o.org_id
   WHERE o.id = _id;

  IF _decision = 'approved' THEN
    PERFORM public.write_timeline(_id, 'orphan.approved', NULL);
    PERFORM public.notify(_owner, 'orphan_approved',
      'اعتُمد ملف ' || COALESCE(_name, ''),
      'صار الملف منشوراً وقابلاً للكفالة.', '/org', 'orphan', _id);
  ELSIF _decision = 'rejected' THEN
    PERFORM public.write_timeline(_id, 'orphan.rejected', _code::text);
    PERFORM public.notify(_owner, 'orphan_rejected',
      'أُعيد ملف ' || COALESCE(_name, ''),
      COALESCE(_reason, 'يُرجى مراجعة سبب الرفض في مساحة الجهة.'),
      '/org', 'orphan', _id);
  END IF;

  PERFORM public.write_audit('orphan.' || _decision, 'orphan', _id,
    jsonb_build_object('from', _prev, 'to', _decision, 'code', _code, 'reason', _reason));
END $fn$;
REVOKE ALL ON FUNCTION public.review_orphan(UUID, TEXT, public.rejection_code, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_orphan(UUID, TEXT, public.rejection_code, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_organization(_id UUID, _decision TEXT, _reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _prev TEXT; _owner UUID; _name TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'review_organization: not authorised' USING ERRCODE = '42501';
  END IF;
  IF _decision NOT IN ('approved', 'rejected', 'suspended') THEN
    RAISE EXCEPTION 'review_organization: unknown decision %', _decision USING ERRCODE = '22023';
  END IF;

  SELECT status::text, owner_id, name INTO _prev, _owner, _name
    FROM public.care_organizations WHERE id = _id;
  IF _prev IS NULL THEN
    RAISE EXCEPTION 'review_organization: no organisation %', _id USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.care_organizations
     SET status = _decision::public.org_status, updated_at = now()
   WHERE id = _id;

  PERFORM public.notify(_owner,
    CASE WHEN _decision = 'approved' THEN 'organization_approved'::public.notification_kind
         ELSE 'organization_rejected'::public.notification_kind END,
    CASE WHEN _decision = 'approved' THEN 'اعتُمدت جهتك ' || COALESCE(_name, '')
         ELSE 'قرار بشأن جهتك ' || COALESCE(_name, '') END,
    CASE WHEN _decision = 'approved' THEN 'يمكنك الآن رفع ملفات الأيتام.'
         ELSE COALESCE(_reason, 'يُرجى التواصل مع الإدارة.') END,
    '/org', 'care_organization', _id);

  PERFORM public.write_audit('organization.' || _decision, 'care_organization', _id,
    jsonb_build_object('from', _prev, 'to', _decision, 'reason', _reason));
END $fn$;
REVOKE ALL ON FUNCTION public.review_organization(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_organization(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.announce_payment(
  _sponsorship UUID, _succeeded BOOLEAN, _amount NUMERIC, _currency TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _sponsor UUID; _orphan UUID; _name TEXT; _first BOOLEAN;
BEGIN
  SELECT s.sponsor_id, s.orphan_id, o.display_name
    INTO _sponsor, _orphan, _name
    FROM public.sponsorships s JOIN public.orphans o ON o.id = s.orphan_id
   WHERE s.id = _sponsorship;

  IF _sponsor IS NULL THEN RETURN; END IF;

  IF _succeeded THEN
    SELECT count(*) = 1 INTO _first
      FROM public.sponsorship_payments
     WHERE sponsorship_id = _sponsorship AND status = 'paid';

    IF _first THEN
      PERFORM public.write_timeline(_orphan, 'sponsorship.started', NULL);
      PERFORM public.notify(_sponsor, 'sponsorship_started',
        'بدأت كفالتك لـ' || COALESCE(_name, ''),
        'وصلت دفعتك الأولى. ستصلك تقارير الأثر دورياً.',
        '/dashboard', 'sponsorship', _sponsorship);
    ELSE
      PERFORM public.notify(_sponsor, 'payment_succeeded',
        'وصلت دفعتك الشهرية',
        'كفالة ' || COALESCE(_name, '') || ' مستمرّة.',
        '/dashboard', 'sponsorship', _sponsorship);
    END IF;
  ELSE
    PERFORM public.notify(_sponsor, 'payment_failed',
      'تعذّرت دفعتك الشهرية',
      'لم تنجح محاولة التحصيل لكفالة ' || COALESCE(_name, '') || '. لا إجراء مطلوب الآن؛ ستُعاد المحاولة.',
      '/dashboard', 'sponsorship', _sponsorship);
  END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.announce_payment(UUID, BOOLEAN, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.announce_payment(UUID, BOOLEAN, NUMERIC, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.notification_recipients(_ids UUID[])
RETURNS TABLE (id UUID, email TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT n.id, u.email::text
    FROM public.notifications n
    JOIN auth.users u ON u.id = n.user_id
   WHERE n.id = ANY(_ids);
$fn$;
REVOKE ALL ON FUNCTION public.notification_recipients(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_recipients(UUID[]) TO service_role;