-- =====================================================================
-- كهاتين — سجلّ الكفالة، وإصلاحات حماية صفحة الطفل
-- ---------------------------------------------------------------------
-- ١) نطاق «identity» كان يعيد الاسم المستعار نفسه: الاسم الحقيقي في
--    orphan_private.full_name، فلم يكن النطاق يكشف شيئاً.
-- ٢) رسالة الكافل للطفل كانت تُحفظ ولا يقرؤها أحد — ولو قُرئت لوصلت
--    طفلاً من غريبٍ بلا مراجعة. صارت تمرّ على دائرة الطفل أولاً.
-- ٣) تقاطع الصفات (بلد، منطقة، جنس، فئة عمرية) في حشدٍ صغير يدلّ على
--    الطفل بعينه: دون خمسة تُحجب المنطقة والمرحلة الدراسية.
-- ٤) سجلّ الكفالة: لكل شهرٍ مستحَقّ — دُفع؟ حُوِّل للجهة؟ وصل الطفل؟
--    والوصول يُثبَت بمستندٍ ويُبلَّغ به الكافل.
-- =====================================================================


-- ---------------------------------------------------------------------
-- ٣) حماية الحشد
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cohort_min()
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $fn$ SELECT 5 $fn$;

CREATE OR REPLACE FUNCTION public.cohort_is_safe(_orphan UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT (
    SELECT count(*) FROM public.orphans x, public.orphans o
     WHERE o.id = _orphan
       AND x.status IN ('approved', 'fully_sponsored')
       AND x.country IS NOT DISTINCT FROM o.country
       AND x.region IS NOT DISTINCT FROM o.region
       AND x.gender IS NOT DISTINCT FROM o.gender
       AND public.age_band_of(x.birth_date) = public.age_band_of(o.birth_date)
  ) >= public.cohort_min();
$fn$;
REVOKE ALL ON FUNCTION public.cohort_is_safe(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cohort_is_safe(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_orphan_cards(
  _country TEXT DEFAULT NULL,
  _region TEXT DEFAULT NULL,
  _age_band TEXT DEFAULT NULL,
  _gender TEXT DEFAULT NULL,
  _education_stage TEXT DEFAULT NULL,
  _funding TEXT DEFAULT NULL,     -- open | full | any
  _building BOOLEAN DEFAULT NULL, -- برنامجه قائم من عدمه
  _search TEXT DEFAULT NULL,
  _sort TEXT DEFAULT 'waiting',   -- waiting | closest | newest
  _limit INT DEFAULT 24,
  _offset INT DEFAULT 0
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _rows JSONB; _total INTEGER; _q TEXT;
BEGIN
  /* البحث يُهرَّب هنا لا في العميل: `ILIKE` بنصٍّ خام يجعل «%» تعني
     «كل شيء». و**التهريب لا الحذف**: حذفُ محارف البدل يحوّل بحثاً من
     «%» وحده إلى فراغٍ، والفراغ يعني «بلا فلترة» — فيعيد البحثُ عن
     محرف بدلٍ كلَّ الملفّات، وهو نقيض المقصود. أمّا التهريب فيجعلها
     محرفاً عادياً يُبحث عنه فلا يُطابق شيئاً. */
  _q := NULLIF(btrim(COALESCE(_search, '')), '');
  IF _q IS NOT NULL THEN
    _q := replace(replace(replace(_q, '\', '\\'), '%', '\%'), '_', '\_');
  END IF;

  WITH base AS (
    SELECT o.id, o.code, o.display_name, o.gender, o.country,
           /* صفاتٌ نادرة الاجتماع تُحجب: لا يُعرف الطفل بتقاطعها. */
           CASE WHEN public.cohort_is_safe(o.id) THEN o.region END AS region,
           CASE WHEN public.cohort_is_safe(o.id) THEN o.education_stage END AS education_stage,
           o.monthly_need, o.funded_monthly, o.currency,
           o.status, o.org_id, o.created_at,
           public.age_band_of(o.birth_date) AS age_band,
           (o.monthly_need - o.funded_monthly) AS gap,
           EXISTS (
             SELECT 1 FROM public.program_enrollments e
               JOIN public.programs pr ON pr.id = e.program_id
              WHERE e.orphan_id = o.id AND pr.kind = 'qualification'
                AND e.status IN ('proposed', 'funded')
                AND public.enrollment_supervisor(e.id) IS NOT NULL
                AND public.enrollment_has_consent(e.id)
           ) AS building,
           GREATEST(0, (now()::date - COALESCE(o.approved_at, o.created_at)::date))::INTEGER
             AS waiting_days
      FROM public.orphans o
     WHERE o.status IN ('approved', 'fully_sponsored')
  ),
  filtered AS (
    SELECT b.* FROM base b
     WHERE (_country IS NULL OR b.country = _country)
       AND (_region IS NULL OR b.region = _region)
       AND (_age_band IS NULL OR b.age_band = _age_band::public.age_band)
       AND (_gender IS NULL OR b.gender = _gender)
       AND (_education_stage IS NULL OR b.education_stage = _education_stage)
       AND (_building IS NULL OR b.building = _building)
       AND (COALESCE(_funding, 'any') = 'any'
            OR (_funding = 'open' AND b.gap > 0)
            OR (_funding = 'full' AND b.gap <= 0))
       /* البحث بالاسم المستعار والرمز وحدهما: البحث بالمدينة كان يكشف
          ما حجبناه — يُجرَّب اسمُ مدينةٍ فيُعرف من فيها. */
       AND (_q IS NULL
            OR b.display_name ILIKE '%' || _q || '%' ESCAPE '\'
            OR b.code ILIKE '%' || _q || '%' ESCAPE '\')
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.ord), '[]'::jsonb),
         (SELECT count(*) FROM filtered)
    INTO _rows, _total
    FROM (
      SELECT f.*, row_number() OVER (
        ORDER BY
          CASE WHEN COALESCE(_sort,'waiting') = 'closest'
               THEN -(f.funded_monthly / NULLIF(f.monthly_need, 0)) END,
          CASE WHEN _sort = 'newest' THEN f.created_at END DESC,
          CASE WHEN COALESCE(_sort,'waiting') = 'waiting' THEN f.waiting_days END DESC,
          f.id
      ) AS ord
        FROM filtered f
       ORDER BY ord
       LIMIT LEAST(GREATEST(COALESCE(_limit, 24), 1), 60)
      OFFSET GREATEST(COALESCE(_offset, 0), 0)
    ) t;

  RETURN jsonb_build_object('rows', _rows, 'total', _total);
END $fn$;


-- خيارات المنطقة لا تُدرج منطقةً لا يظهر فيها أحد: كانت تُنبئ بوجودها.
CREATE OR REPLACE FUNCTION public.orphan_filter_options()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT jsonb_build_object(
    'countries', COALESCE((SELECT jsonb_agg(DISTINCT o.country) FROM public.orphans o
                            WHERE o.status IN ('approved','fully_sponsored')
                              AND COALESCE(btrim(o.country), '') <> ''), '[]'::jsonb),
    'regions', COALESCE((SELECT jsonb_agg(DISTINCT o.region) FROM public.orphans o
                          WHERE o.status IN ('approved','fully_sponsored')
                            AND COALESCE(btrim(o.region), '') <> ''
                            AND public.cohort_is_safe(o.id)), '[]'::jsonb),
    'stages', COALESCE((SELECT jsonb_agg(DISTINCT o.education_stage) FROM public.orphans o
                         WHERE o.status IN ('approved','fully_sponsored')
                           AND COALESCE(btrim(o.education_stage), '') <> ''
                           AND public.cohort_is_safe(o.id)), '[]'::jsonb));
$fn$;


-- ---------------------------------------------------------------------
-- ١) الهوية + ٣) الحشد في صفحة الطفل
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orphan_view(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _o RECORD; _may BOOLEAN; _acc JSONB; _out JSONB; _scopes TEXT[]; _safe BOOLEAN;
BEGIN
  SELECT * INTO _o FROM public.orphans o
   WHERE o.id = _orphan AND o.status IN ('approved', 'fully_sponsored');
  IF NOT FOUND THEN RETURN 'null'::jsonb; END IF;

  _may := public.can_view_orphan_detail(_orphan);
  _scopes := public.my_orphan_scopes(_orphan);
  _safe := _may OR public.cohort_is_safe(_orphan);

  SELECT COALESCE(jsonb_build_object(
           'request_id', a.id, 'status', a.status,
           'expires_at', a.expires_at, 'decision_note', a.decision_note,
           'granted_scopes', to_jsonb(a.granted_scopes),
           'created_at', a.created_at),
         'null'::jsonb)
    INTO _acc
    FROM public.orphan_access_requests a
   WHERE a.orphan_id = _orphan AND a.requester_id = auth.uid()
   ORDER BY a.created_at DESC LIMIT 1;

  _out := jsonb_build_object(
    'id', _o.id, 'code', _o.code, 'display_name', _o.display_name,
    'gender', _o.gender, 'country', _o.country,
    'region', CASE WHEN _safe THEN _o.region END,
    'education_stage', CASE WHEN _safe THEN _o.education_stage END,
    /* الواجهة تُخفي مدينة الجهة أيضاً حين يكون الحشد صغيراً. */
    'cohort_small', NOT public.cohort_is_safe(_orphan),
    'age_band', public.age_band_of(_o.birth_date),
    'monthly_need', _o.monthly_need, 'funded_monthly', _o.funded_monthly,
    'currency', _o.currency, 'status', _o.status, 'org_id', _o.org_id,
    'created_at', _o.created_at,
    'may_view_detail', _may,
    /* ما يملكه القارئ — تبني عليه الواجهة ما تعرض بلا تخمين. */
    'scopes', to_jsonb(_scopes),
    'access', COALESCE(_acc, 'null'::jsonb)
  );

  IF _may THEN
    _out := _out || jsonb_build_object(
      'detail', jsonb_build_object(
        'birth_date', _o.birth_date,
        'city', _o.city,
        'story', _o.story,
        /* الاسم الحقيقي والصورة خلف نطاق `identity` — ومعهما إذن
           الصورة الخاصّ، فهما إذنان لصاحبين مختلفين. */
        'real_name', CASE WHEN 'identity' = ANY(_scopes)
          THEN (SELECT p.full_name FROM public.orphan_private p WHERE p.orphan_id = _orphan) END,
        'photo_url', CASE
          WHEN 'identity' = ANY(_scopes)
           AND _o.photo_consent IN ('granted', 'face_hidden')
          THEN _o.photo_url END,
        'needs', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', n.id, 'category', n.category, 'title', n.title,
            'monthly_amount', n.monthly_amount) ORDER BY n.monthly_amount DESC)
          FROM public.orphan_needs n WHERE n.orphan_id = _orphan), '[]'::jsonb)
      ));
  END IF;

  RETURN _out;
END $fn$;


-- ---------------------------------------------------------------------
-- ٢) رسالة الكافل تمرّ على دائرة الطفل
-- ---------------------------------------------------------------------
ALTER TABLE public.sponsorships
  ADD COLUMN IF NOT EXISTS message_status TEXT NOT NULL DEFAULT 'none'
    CHECK (message_status IN ('none', 'pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS message_reviewed_at TIMESTAMPTZ;

-- الرسائل القائمة لم يراجعها أحد: تُعلَّق لا تُعتمد.
UPDATE public.sponsorships SET message_status = 'pending'
 WHERE message IS NOT NULL AND btrim(message) <> '' AND message_status = 'none';

CREATE OR REPLACE FUNCTION public.guard_sponsor_message()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF COALESCE(current_setting('kahatayn.moderating', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  -- كل رسالةٍ جديدة أو معدَّلة تعود إلى المراجعة، والحالة لا تُكتب من الخارج.
  IF TG_OP = 'INSERT' OR NEW.message IS DISTINCT FROM OLD.message THEN
    NEW.message_status := CASE WHEN NULLIF(btrim(COALESCE(NEW.message, '')), '') IS NULL
                               THEN 'none' ELSE 'pending' END;
    NEW.message_reviewed_at := NULL;
  ELSE
    NEW.message_status := OLD.message_status;
    NEW.message_reviewed_at := OLD.message_reviewed_at;
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_guard_sponsor_message ON public.sponsorships;
CREATE TRIGGER trg_guard_sponsor_message BEFORE INSERT OR UPDATE ON public.sponsorships
  FOR EACH ROW EXECUTE FUNCTION public.guard_sponsor_message();

-- ما ينتظر مراجعة من يدير الطفل (الجهة، الولي، الإدارة).
CREATE OR REPLACE FUNCTION public.sponsor_messages_for_review()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'sponsorship_id', s.id, 'orphan_id', o.id, 'orphan', o.display_name,
           'message', s.message, 'created_at', s.created_at)
         ORDER BY s.created_at), '[]'::jsonb)
    FROM public.sponsorships s JOIN public.orphans o ON o.id = s.orphan_id
   WHERE s.message_status = 'pending' AND public.can_manage_orphan(o.id);
$fn$;
REVOKE ALL ON FUNCTION public.sponsor_messages_for_review() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sponsor_messages_for_review() TO authenticated;

CREATE OR REPLACE FUNCTION public.moderate_sponsor_message(_sponsorship UUID, _approve BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _s public.sponsorships;
BEGIN
  SELECT * INTO _s FROM public.sponsorships WHERE id = _sponsorship;
  IF _s.id IS NULL OR NOT public.can_manage_orphan(_s.orphan_id) THEN
    RAISE EXCEPTION 'moderation_denied' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('kahatayn.moderating', 'on', true);
  UPDATE public.sponsorships
     SET message_status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
         message_reviewed_at = now()
   WHERE id = _sponsorship AND message_status = 'pending';
  PERFORM set_config('kahatayn.moderating', '', true);
END $fn$;
REVOKE ALL ON FUNCTION public.moderate_sponsor_message(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_sponsor_message(UUID, BOOLEAN) TO authenticated;

-- ما يصل الطفل وأسرته: المعتمَد فقط، وبلا اسم الكافل.
CREATE OR REPLACE FUNCTION public.orphan_messages(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.can_manage_orphan(_orphan) THEN
    RAISE EXCEPTION 'messages_denied' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('message', s.message, 'at', s.message_reviewed_at)
                                    ORDER BY s.message_reviewed_at DESC)
                     FROM public.sponsorships s
                    WHERE s.orphan_id = _orphan AND s.message_status = 'approved'), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.orphan_messages(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orphan_messages(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- ٤) سجلّ الكفالة: مستحَقّ ← مدفوع ← محوَّل ← واصل
-- ---------------------------------------------------------------------
ALTER TABLE public.disbursements
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'transferred'
    CHECK (status IN ('scheduled', 'transferred', 'delivered')),
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_proof_path TEXT,
  ADD COLUMN IF NOT EXISTS delivery_note TEXT CHECK (delivery_note IS NULL OR length(delivery_note) <= 1000),
  ADD CONSTRAINT ck_delivered_has_proof
    CHECK (status <> 'delivered' OR (delivered_at IS NOT NULL AND delivery_proof_path IS NOT NULL));

-- الجهة تُثبت الوصول بمستند، والكفلاء يُبلَّغون. لا وصول بلا إثبات.
CREATE OR REPLACE FUNCTION public.confirm_disbursement_delivery(
  _disbursement UUID, _proof_path TEXT, _note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _d public.disbursements; _u UUID;
BEGIN
  SELECT * INTO _d FROM public.disbursements WHERE id = _disbursement;
  IF _d.id IS NULL OR NOT (public.is_admin() OR public.owns_org(_d.org_id)) THEN
    RAISE EXCEPTION 'delivery_denied' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(COALESCE(_proof_path, '')), '') IS NULL THEN
    RAISE EXCEPTION 'proof_required';
  END IF;
  -- المستند في مجلّد الطفل نفسه داخل الخزنة الخاصة.
  IF split_part(_proof_path, '/', 1) <> _d.orphan_id::text THEN
    RAISE EXCEPTION 'proof_outside_orphan';
  END IF;
  IF _d.status = 'delivered' THEN RETURN; END IF;

  UPDATE public.disbursements
     SET status = 'delivered', delivered_at = now(),
         delivery_proof_path = _proof_path, delivery_note = NULLIF(btrim(_note), '')
   WHERE id = _disbursement;

  PERFORM public.write_timeline(_d.orphan_id, 'disbursement_delivered',
    to_char(COALESCE(_d.period_start, now()::date), 'YYYY-MM'));
  FOR _u IN SELECT public.orphan_sponsor_ids(_d.orphan_id) LOOP
    PERFORM public.notify(_u, 'other', 'وصلت كفالة الشهر',
      'أكّدت جهة الرعاية وصول دعم ' || to_char(COALESCE(_d.period_start, now()::date), 'YYYY-MM') || ' بمستندٍ موثّق.',
      '/dashboard', 'disbursement', _d.id);
  END LOOP;
END $fn$;
REVOKE ALL ON FUNCTION public.confirm_disbursement_delivery(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_disbursement_delivery(UUID, TEXT, TEXT) TO authenticated;

-- ما ينتظر الجهة: تحويلاتٌ وصلتها ولم تُثبت وصولها بعد.
CREATE OR REPLACE FUNCTION public.org_pending_deliveries()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', d.id, 'orphan_id', d.orphan_id, 'orphan', o.display_name,
           'amount', d.amount, 'currency', d.currency,
           'period_start', d.period_start, 'period_end', d.period_end, 'created_at', d.created_at)
         ORDER BY d.created_at), '[]'::jsonb)
    FROM public.disbursements d JOIN public.orphans o ON o.id = d.orphan_id
   WHERE d.status = 'transferred' AND public.owns_org(d.org_id);
$fn$;
REVOKE ALL ON FUNCTION public.org_pending_deliveries() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_pending_deliveries() TO authenticated;


-- جدول الكفالة كما يراه صاحبها: شهراً شهراً حتى الشهر القادم.
-- مستند الوصول لا يُعطى للكافل (قد يُظهر الطفل)؛ يرى أنه «موثّق» فقط.
CREATE OR REPLACE FUNCTION public.sponsorship_ledger(_sponsorship UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _s public.sponsorships; _o public.orphans; _months JSONB; _from DATE; _to DATE;
BEGIN
  SELECT * INTO _s FROM public.sponsorships WHERE id = _sponsorship;
  IF _s.id IS NULL OR NOT (_s.sponsor_id = auth.uid() OR public.is_admin()) THEN
    RAISE EXCEPTION 'ledger_denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _o FROM public.orphans WHERE id = _s.orphan_id;

  _from := date_trunc('month', COALESCE(_s.started_at, _s.created_at))::date;
  _to := CASE WHEN _s.status IN ('cancelled', 'completed')
              THEN date_trunc('month', COALESCE(_s.ended_at, now()))::date
              ELSE (date_trunc('month', now()) + interval '1 month')::date END;

  SELECT COALESCE(jsonb_agg(row_to_json(m)::jsonb ORDER BY m.month DESC), '[]'::jsonb) INTO _months
    FROM (
      SELECT to_char(g.m, 'YYYY-MM') AS month,
             g.m > date_trunc('month', now()) AS upcoming,
             _s.amount AS due,
             (SELECT COALESCE(sum(p.amount), 0) FROM public.sponsorship_payments p
               WHERE p.sponsorship_id = _s.id AND p.status = 'paid'
                 AND date_trunc('month', COALESCE(p.period_start, p.paid_at::date)) = g.m) AS paid,
             (SELECT p.status::text FROM public.sponsorship_payments p
               WHERE p.sponsorship_id = _s.id
                 AND date_trunc('month', COALESCE(p.period_start, p.paid_at::date, p.created_at::date)) = g.m
               ORDER BY (p.status = 'paid') DESC, p.created_at DESC LIMIT 1) AS payment_status,
             (SELECT d.status FROM public.disbursements d
               WHERE d.orphan_id = _s.orphan_id
                 AND g.m BETWEEN date_trunc('month', COALESCE(d.period_start, d.created_at::date))
                             AND date_trunc('month', COALESCE(d.period_end, d.period_start, d.created_at::date))
               ORDER BY (d.status = 'delivered') DESC, d.created_at DESC LIMIT 1) AS delivery_status,
             (SELECT d.delivered_at FROM public.disbursements d
               WHERE d.orphan_id = _s.orphan_id AND d.status = 'delivered'
                 AND g.m BETWEEN date_trunc('month', COALESCE(d.period_start, d.created_at::date))
                             AND date_trunc('month', COALESCE(d.period_end, d.period_start, d.created_at::date))
               ORDER BY d.delivered_at DESC LIMIT 1) AS delivered_at
        FROM generate_series(_from, _to, interval '1 month') AS g(m)
    ) m;

  RETURN jsonb_build_object(
    'sponsorship', jsonb_build_object(
      'id', _s.id, 'amount', _s.amount, 'currency', _s.currency, 'status', _s.status,
      'type', _s.type, 'started_at', _s.started_at, 'next_charge_at', _s.next_charge_at,
      'is_anonymous', _s.is_anonymous, 'message', _s.message, 'message_status', _s.message_status,
      'created_at', _s.created_at),
    'orphan', jsonb_build_object('id', _o.id, 'code', _o.code, 'display_name', _o.display_name,
      'country', _o.country, 'age_band', public.age_band_of(_o.birth_date)),
    'months', _months,
    'totals', jsonb_build_object(
      'paid', (SELECT COALESCE(sum(amount), 0) FROM public.sponsorship_payments
                WHERE sponsorship_id = _s.id AND status = 'paid'),
      'months_paid', (SELECT count(*) FROM jsonb_array_elements(_months) x WHERE (x->>'paid')::numeric > 0),
      'months_delivered', (SELECT count(*) FROM jsonb_array_elements(_months) x
                            WHERE x->>'delivery_status' = 'delivered')));
END $fn$;
REVOKE ALL ON FUNCTION public.sponsorship_ledger(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sponsorship_ledger(UUID) TO authenticated;
