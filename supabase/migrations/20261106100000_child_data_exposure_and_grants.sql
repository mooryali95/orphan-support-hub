-- =====================================================================
-- المرحلة صفر — انكشاف بيانات الطفل والصلاحيات (المجموعة DB-A)
-- ---------------------------------------------------------------------
-- سبعة أبوابٍ وجدها التدقيق مفتوحةً رغم أنّ الشاشة تُظهرها مغلقة. كلٌّ
-- منها مُثبَتٌ بفحصٍ يفشل قبل هذه الهجرة ويمرّ بعدها
-- (`supabase/tests/child-exposure-verification.sql` و`grants-verification.sql`):
--
--   ١) DB-03  الجهة الموقوفة أو المرفوضة تحتفظ بالهوية والعنوان والصحّة
--             والوثائق — والمُنشئ يحتفظ بها إلى الأبد بـ`created_by`.
--   ٢) CP-12  الكافل السابق يبقى مطّلعاً إلى الأبد.
--   ٣) CP-03  الكافل يقرأ ملاحظة الصحّة في التقارير بنداءٍ مباشر.
--   ٤) CP-04  إذن «متابِع» وكفالة بخمسة دولارات تفتحان المدينة وتاريخ
--             الميلاد الدقيق والقصّة واسم المدرسة — ما يكفي للوصول إليه.
--   ٥) CP-05 + DB-06  حماية «أقلّ من ٥» تعيش داخل الدوالّ وحدها: الجدول
--             يُقرأ مباشرةً، ودالّتا الاقتراح لا تحجبان، والخارطة تُطرح.
--   ٦) CP-07  أطفال البذرة التجريبية وجهتاها المخترعتان معتمَدون قابلون
--             للكفالة.
--   ٧) DB-04 + DB-09  صلاحيات Supabase الافتراضية تمنح الحذف وما فوقه،
--             والتضييق الذي طُبّق يدوياً على البثّ (live-part4) لا هجرة له.
--
-- كلّ ما هنا `CREATE OR REPLACE` و`DROP ... IF EXISTS` وتحديثاتٌ مشروطة:
-- تُطبَّق على البثّ كما هي، وإعادتها لا تضرّ. وتواقيع الدوالّ التي
-- تستدعيها الواجهة باقيةٌ كما هي.
-- =====================================================================


-- ---------------------------------------------------------------------
-- ١) DB-03 — الملكية تتبع حال الجهة، لا التاريخ
-- ---------------------------------------------------------------------
-- الإيقاف هو أداة الإدارة الأولى لحماية الأطفال من جهةٍ أساءت. فإن بقيت
-- الجهة الموقوفة تقرأ الهوية الوطنية والعنوان والصحّة، وتكتب وتحذف
-- الوثائق، فالإيقاف لافتةٌ لا قرار. فـ«يملك الجهة» صار «يملك جهةً
-- معتمدة»، والإعادة تعيد كلّ شيء: الإيقاف حجبٌ لا حذف.
CREATE OR REPLACE FUNCTION public.owns_org(_org_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.care_organizations o
     WHERE o.id = _org_id AND o.owner_id = auth.uid() AND o.status = 'approved'
  );
$$;

/* و`created_by` كان باباً ثانياً لا يُغلق: `start_orphan_draft` يكتب
   المالك مُنشئاً، فيبقى له الملفّ ولو أُوقفت جهته أو انتقلت ملكيّتها.
   ولا يُنشئ ملفّاً اليوم إلا الإدارة أو مالكُ جهةٍ معتمدة
   (`orphans_insert`)، فكلاهما مشمولٌ بما بقي — فيُسقط الباب. */
CREATE OR REPLACE FUNCTION public.can_manage_orphan(_orphan_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orphans o
    WHERE o.id = _orphan_id
      AND (o.guardian_id = auth.uid() OR public.owns_org(o.org_id) OR public.is_admin())
  );
$$;

DROP POLICY IF EXISTS "orphans_read_auth" ON public.orphans;
CREATE POLICY "orphans_read_auth" ON public.orphans FOR SELECT TO authenticated
  USING (status IN ('approved','fully_sponsored') OR guardian_id = auth.uid()
         OR public.owns_org(org_id) OR public.is_admin());

DROP POLICY IF EXISTS "orphans_update" ON public.orphans;
CREATE POLICY "orphans_update" ON public.orphans FOR UPDATE TO authenticated
  USING (guardian_id = auth.uid() OR public.owns_org(org_id) OR public.is_admin())
  WITH CHECK (guardian_id = auth.uid() OR public.owns_org(org_id) OR public.is_admin());


-- ---------------------------------------------------------------------
-- ٢) CP-12 — الكفالة المنتهية تُغلق الملفّ بعد مهلةٍ قصيرة
-- ---------------------------------------------------------------------
-- الإذن بالاطّلاع ينقضي (١٨٠ يوماً افتراضاً، ٣٦٥ حدّاً)، والكفالة التي
-- انتهت قبل سنوات كانت لا تنقضي. فالكفالة الفعّالة تفتح ما تفتحه، والمنتهية
-- أو الموقوفة تُبقيه ستّين يوماً — مهلةُ التقرير الأخير — ثم تُغلق.
--
-- والمهلة تُحسب من **لحظة تغيّر الحالة**، لا من `ended_at` ولا
-- `updated_at`: الكافل يملك تحديث صفّه، فتعديلُ رسالته يجدّد `updated_at`،
-- و`ended_at` لا يحرسه شيء. فعمودٌ يكتبه المشغّل وحده.
ALTER TABLE public.sponsorships
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ما سبق هذه الهجرة: أقرب تقديرٍ لمتى تغيّرت الحالة.
UPDATE public.sponsorships
   SET status_changed_at = COALESCE(ended_at, updated_at, created_at)
 WHERE status IN ('completed', 'paused', 'cancelled')
   AND status_changed_at > COALESCE(ended_at, updated_at, created_at);

CREATE OR REPLACE FUNCTION public.stamp_sponsorship_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_user IN ('authenticated', 'anon') OR NEW.status_changed_at IS NULL THEN
      NEW.status_changed_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    /* الخادم (webhook، الإدارة بمفتاح الخدمة) قد يضبط اللحظة صراحةً؛
       وما عداه تُكتب له الآن. */
    IF current_user IN ('authenticated', 'anon')
       OR NEW.status_changed_at IS NOT DISTINCT FROM OLD.status_changed_at THEN
      NEW.status_changed_at := now();
    END IF;
  ELSIF current_user IN ('authenticated', 'anon') THEN
    NEW.status_changed_at := OLD.status_changed_at;
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.stamp_sponsorship_status_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_stamp_sponsorship_status ON public.sponsorships;
CREATE TRIGGER trg_stamp_sponsorship_status
BEFORE INSERT OR UPDATE ON public.sponsorships
FOR EACH ROW EXECUTE FUNCTION public.stamp_sponsorship_status_change();

CREATE OR REPLACE FUNCTION public.sponsor_access_grace()
RETURNS INTERVAL LANGUAGE sql IMMUTABLE AS $fn$ SELECT interval '60 days' $fn$;

CREATE OR REPLACE FUNCTION public.sponsors_orphan(_orphan_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sponsorships s
    WHERE s.orphan_id = _orphan_id AND s.sponsor_id = auth.uid()
      AND (s.status = 'active'
           OR (s.status IN ('completed', 'paused')
               AND s.status_changed_at > now() - public.sponsor_access_grace()))
  );
$$;
REVOKE ALL ON FUNCTION public.sponsors_orphan(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sponsors_orphan(UUID) TO authenticated;

/* ورحلة التأهيل وخطّ الداعم الزمني كانا يكرّران الشرط القديم نصّاً.
   فصارا يستدعيان المصدر الواحد — والتكرار هو ما جعل الباب يبقى مفتوحاً. */
CREATE OR REPLACE FUNCTION public.can_see_qualification(_orphan UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT auth.uid() IS NOT NULL AND (
    public.sponsors_orphan(_orphan)
    OR EXISTS (SELECT 1 FROM public.support_pledges p
                WHERE p.orphan_id = _orphan AND p.supporter_id = auth.uid()
                  AND p.status IN ('active', 'fulfilled'))
    OR public.in_orphan_circle(_orphan)
    OR public.has_orphan_scope(_orphan, 'progress'));
$fn$;
REVOKE ALL ON FUNCTION public.can_see_qualification(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_qualification(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_journey_feed(_limit INT DEFAULT 40)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(f)::jsonb ORDER BY f.at DESC)
      FROM (
        -- ما كُتب في الخطّ الزمني لمن يكفلهم — بالمهلة نفسها التي تحكم الملفّ
        SELECT 'timeline' AS kind, t.event_type AS type, t.created_at AS at,
               o.display_name AS orphan, o.id AS orphan_id, t.detail AS text
          FROM public.timeline_events t
          JOIN public.orphans o ON o.id = t.orphan_id
         WHERE public.sponsors_orphan(t.orphan_id)
        UNION ALL
        -- مراحل تسليم تعهّداته
        SELECT 'pledge', 'pledge.' || d.stage, d.created_at,
               NULL, NULL, NULL
          FROM public.pledge_deliveries d
          JOIN public.support_pledges p ON p.id = d.pledge_id
         WHERE p.supporter_id = _uid
        UNION ALL
        -- الجلسات المقبولة — حيث له نطاق «الرحلة»
        SELECT 'unit', 'unit.accepted', u.decided_at, o.display_name, o.id, pu.title
          FROM public.enrollment_units u
          JOIN public.program_enrollments e ON e.id = u.enrollment_id
          JOIN public.program_units pu ON pu.id = u.unit_id
          JOIN public.orphans o ON o.id = e.orphan_id
         WHERE u.status = 'accepted' AND u.decided_at IS NOT NULL
           AND public.has_orphan_scope(o.id, 'journey')
        UNION ALL
        -- قياسات السمات — حيث له نطاق «السمات»؛ بلا ملاحظة المشرف
        SELECT 'trait', 'trait.measured', s.observed_at, o.display_name, o.id, t.name_ar
          FROM public.orphan_trait_scores s
          JOIN public.trait_definitions t ON t.id = s.trait_id
          JOIN public.orphans o ON o.id = s.orphan_id
         WHERE s.deleted_at IS NULL AND public.has_orphan_scope(o.id, 'traits')
         ORDER BY 3 DESC
         LIMIT LEAST(GREATEST(COALESCE(_limit, 40), 1), 200)
      ) f), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.my_journey_feed(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_journey_feed(INT) TO authenticated;


-- ---------------------------------------------------------------------
-- ٣) CP-03 — التقرير يصل الكافل، والصحّة لا تصله
-- ---------------------------------------------------------------------
-- سياسة الخصوصية تقول للكافل: «لا بيانات صحّية». والسياسة على الجدول
-- كانت تفتح له الصفّ كلَّه — والصفّ يحمل `health_note`. وRLS تحجب صفّاً
-- لا عموداً، فلا يُقال بها «التقرير نعم والصحّة لا».
--
-- فالجدول يعود إلى من حول الطفل (الجهة والوليّ والإدارة)، والكافل يقرأ
-- بدالّةٍ تختار الأعمدة: التقرير المعتمد بتعليمه ومعيشته وخلاصته، بلا
-- الصحّة (إلا بنطاق «الملفّ العميق» تمنحه الإدارة صراحةً) وبلا مسارات
-- المرفقات (الخزنة لا تفتحها له أصلاً، وقد تُظهر أطفالاً بلا إذن صورة).
--
-- وإيصال التقرير للكافل هو ما تُسمّيه سياسة الخصوصية «المصلحة المشروعة
-- لتشغيل الكفالة وإيصال التقارير» — فالكفالة القائمة أساسٌ له بلا طلب.
DROP POLICY IF EXISTS "reports_read" ON public.progress_reports;
CREATE POLICY "reports_read" ON public.progress_reports FOR SELECT TO authenticated
  USING (public.can_manage_orphan(orphan_id) OR public.is_admin());

CREATE OR REPLACE FUNCTION public.orphan_progress_reports(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _full BOOLEAN; _reader BOOLEAN; _health BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reports', '[]'::jsonb);
  END IF;

  _full := public.can_manage_orphan(_orphan) OR public.is_admin();
  _reader := _full OR public.sponsors_orphan(_orphan)
             OR public.has_orphan_scope(_orphan, 'reports');
  IF NOT _reader THEN
    RETURN jsonb_build_object('allowed', false, 'reports', '[]'::jsonb);
  END IF;
  _health := _full OR public.has_orphan_scope(_orphan, 'profile_deep');

  RETURN jsonb_build_object(
    'allowed', true,
    'full', _full,
    'reports', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', r.id, 'period', r.period, 'status', r.status,
               'summary', r.summary,
               'education_note', r.education_note,
               'health_note', CASE WHEN _health THEN r.health_note END,
               'living_note', r.living_note,
               'attachments', CASE WHEN _full THEN to_jsonb(COALESCE(r.attachments, '{}'::TEXT[]))
                                   ELSE '[]'::jsonb END,
               'review_note', CASE WHEN _full THEN r.review_note END,
               'published_at', r.published_at,
               'created_at', r.created_at)
             ORDER BY r.period DESC)
        FROM public.progress_reports r
       WHERE r.orphan_id = _orphan
         AND (_full OR r.status = 'approved')), '[]'::jsonb));
END $fn$;
REVOKE ALL ON FUNCTION public.orphan_progress_reports(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orphan_progress_reports(UUID) TO authenticated;


-- ---------------------------------------------------------------------
-- ٤) CP-04 — ما يدلّ على مكان الطفل خلف نطاقٍ صريح
-- ---------------------------------------------------------------------
-- الاسمُ المستعار وتاريخُ الميلاد الدقيق والحيُّ واسمُ المدرسة معاً
-- يكفون لأن يُعثر على الطفل في مكانه. وكانت تُفتح بأيّ قبولٍ — ولو
-- بحزمة «متابِع» التي وُصفت بأنها «بلا اسمٍ ولا حكم» — وبأيّ كفالة.
--
-- فنطاقان جديدان في السجلّ نفسه (لا تعدادٌ يحتاج هجرة):
--   location (٣)  المدينة والحيّ، وتاريخ الميلاد الدقيق، واسم المدرسة.
--   story    (٢)  قصّة الطفل كما كتبتها الجهة — فيها ظروف أسرته.
-- والكافل العاديّ والمتابِع يريان: الاسم المستعار، والبلد والمنطقة،
-- والفئة العمرية، والمرحلة، وتفصيل الاحتياج، والتقارير. وما فوق ذلك
-- بقرارٍ من الإدارة لصاحبه بعينه، ينقضي ويُسحب ويُسجَّل.
-- والدائرة (الجهة والوليّ والمشرف) تملك النطاقات الفاعلة كلّها ضمناً،
-- فلا يتغيّر لها شيء.
INSERT INTO public.access_scopes (key, label, description, sensitivity, sort_order) VALUES
  ('location', 'الموقع وتاريخ الميلاد',
   'المدينة والحيّ، وتاريخ الميلاد الدقيق، واسم المدرسة — ما يكفي للوصول إلى الطفل في مكانه.',
   3, 15),
  ('story', 'القصّة',
   'قصّة الطفل كما كتبتها جهة الرعاية، وفيها ظروف أسرته.', 2, 25)
ON CONFLICT (key) DO NOTHING;

/* الحزم: «كافل ملتزم» يحمل القصّة (ومعه الاسم أصلاً)، و«شريك كامل» —
   الشريك المؤسّسيّ بعقد — يحمل الموقع والقصّة. والمتابع وداعم المجموعة
   لا يحملان أيّاً منهما. والإضافة لا تكرّر ما وُجد، فالإعادة آمنة. */
UPDATE public.access_scope_packages
   SET scopes = scopes || ARRAY['story']
 WHERE key = 'committed_sponsor' AND NOT ('story' = ANY(scopes));
UPDATE public.access_scope_packages
   SET scopes = scopes || ARRAY['location']
 WHERE key = 'full_partner' AND NOT ('location' = ANY(scopes));
UPDATE public.access_scope_packages
   SET scopes = scopes || ARRAY['story']
 WHERE key = 'full_partner' AND NOT ('story' = ANY(scopes));

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
    'cohort_small', NOT public.cohort_is_safe(_orphan),
    'age_band', public.age_band_of(_o.birth_date),
    'monthly_need', _o.monthly_need, 'funded_monthly', _o.funded_monthly,
    'currency', _o.currency, 'status', _o.status, 'org_id', _o.org_id,
    'created_at', _o.created_at,
    'may_view_detail', _may,
    'scopes', to_jsonb(_scopes),
    'access', COALESCE(_acc, 'null'::jsonb)
  ) || public.orphan_trust(_orphan);

  IF _may THEN
    _out := _out || jsonb_build_object(
      'detail', jsonb_build_object(
        /* الفئة العمرية للجميع في الأعلى؛ والتاريخ الدقيق والمدينة لنطاق
           «الموقع» وحده، والقصّة لنطاقها. */
        'birth_date', CASE WHEN 'location' = ANY(_scopes) THEN _o.birth_date END,
        'city', CASE WHEN 'location' = ANY(_scopes) THEN _o.city END,
        'story', CASE WHEN 'story' = ANY(_scopes) THEN _o.story END,
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
REVOKE ALL ON FUNCTION public.orphan_view(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orphan_view(UUID) TO anon, authenticated;

/* واسم المدرسة يسكن قسم «التعليم» غير الحسّاس، فكان يُفتح بأيّ إذن.
   يُنزع منه وحده ما لم يُمنح «الموقع»، ويبقى الصفّ والأداء والميول. */
CREATE OR REPLACE FUNCTION public.orphan_profile(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _circle BOOLEAN; _detail BOOLEAN; _deep BOOLEAN; _loc BOOLEAN;
BEGIN
  _circle := public.in_orphan_circle(_orphan);
  _detail := public.can_view_orphan_detail(_orphan);
  _deep := public.has_orphan_scope(_orphan, 'profile_deep');
  _loc := public.has_orphan_scope(_orphan, 'location');

  IF NOT _circle AND NOT _detail THEN
    RETURN jsonb_build_object('may_read', false, 'sections', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'may_read', true,
    'may_write', _circle,
    'sees_sensitive', _deep,
    'sections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'section', p.section,
        'data', CASE WHEN p.section = 'education' AND NOT _loc
                     THEN p.data - 'school_name' ELSE p.data END,
        'note', p.note,
        'updated_role', p.updated_role,
        'updated_at', p.updated_at,
        'age_days', (now()::date - p.updated_at::date)
      ) ORDER BY p.section)
      FROM public.orphan_profile_sections p
     WHERE p.orphan_id = _orphan
       AND (_deep OR NOT public.profile_section_is_sensitive(p.section))
    ), '[]'::jsonb),
    'hidden_sections', CASE WHEN _deep THEN 0 ELSE (
      SELECT count(*) FROM public.orphan_profile_sections p
       WHERE p.orphan_id = _orphan AND public.profile_section_is_sensitive(p.section)
    ) END
  );
END $fn$;
REVOKE ALL ON FUNCTION public.orphan_profile(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orphan_profile(UUID) TO authenticated;

/* والكافل صار يحتاج أن يطلب ما فوق التفصيل الأساسي — فلا يُردّ طلبه بـ
   «لك الاطّلاع سلفاً». الاستغناء عن الطلب لمن حول الطفل وحدهم، أو لمن
   له إذنٌ قائمٌ لم ينقضِ. */
CREATE OR REPLACE FUNCTION public.request_orphan_access(_orphan UUID, _reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _id UUID; _published BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'request_orphan_access: تحتاج جلسة' USING ERRCODE = '42501';
  END IF;

  SELECT true INTO _published FROM public.orphans o
   WHERE o.id = _orphan AND o.status IN ('approved', 'fully_sponsored');
  IF _published IS NOT TRUE THEN
    RAISE EXCEPTION 'لا ملفّ منشوراً بهذا المعرّف' USING ERRCODE = 'no_data_found';
  END IF;

  IF public.in_orphan_circle(_orphan) OR EXISTS (
       SELECT 1 FROM public.orphan_access_requests a
        WHERE a.orphan_id = _orphan AND a.requester_id = auth.uid()
          AND a.status = 'approved' AND a.expires_at > now()) THEN
    RETURN jsonb_build_object('status', 'approved', 'already', true);
  END IF;

  INSERT INTO public.orphan_access_requests (orphan_id, requester_id, reason)
  VALUES (_orphan, auth.uid(), btrim(_reason))
  RETURNING id INTO _id;

  PERFORM public.write_audit('orphan.access_requested', 'orphan', _orphan,
    jsonb_build_object('request', _id));

  RETURN jsonb_build_object('status', 'pending', 'request_id', _id);
END $fn$;
REVOKE ALL ON FUNCTION public.request_orphan_access(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_orphan_access(UUID, TEXT) TO authenticated;


-- ---------------------------------------------------------------------
-- ٥) CP-05 + DB-06 — «أقلّ من ٥» تُحمى في الجدول لا في الدالّة وحدها
-- ---------------------------------------------------------------------
-- المنطقة والمرحلة الدراسية تُحجبان في البطاقة والصفحة والخارطة حين يصغر
-- الحشد — لكنّ الزائر يملك `SELECT` عليهما في الجدول نفسه، فنداءُ REST
-- واحد يُعيد «أرديت | كوكس | ابتدائي». فيُسحب العمودان من العموم،
-- ولا يُقرآن إلا عبر الدوالّ التي تطبّق `cohort_is_safe`: البطاقات،
-- والصفحة، والخارطة، وخيارات الفلترة، ودالّتا الاقتراح أدناه.
REVOKE SELECT (region, education_stage) ON public.orphans FROM anon, authenticated;

/* اقتراح الكافل: يحجب المنطقة والمرحلة كما تحجبهما البطاقة، و«في
   منطقتك» والترتيبُ بها يُبنيان على المنطقة المحجوبة — وإلا صار سؤال
   «هل هو في كوكس؟» جواباً بنعم. */
DROP FUNCTION IF EXISTS public.suggest_orphans_for_sponsor(NUMERIC, TEXT, INT);
CREATE OR REPLACE FUNCTION public.suggest_orphans_for_sponsor(
  _budget NUMERIC DEFAULT NULL,
  _region TEXT DEFAULT NULL,
  _limit INT DEFAULT 12
)
RETURNS TABLE (
  id UUID, code TEXT, display_name TEXT, gender TEXT,
  country TEXT, region TEXT, education_stage TEXT, age_band public.age_band,
  monthly_need NUMERIC, funded_monthly NUMERIC, currency TEXT,
  status public.orphan_status, org_id UUID, created_at TIMESTAMPTZ,
  gap NUMERIC, building BOOLEAN, completes BOOLEAN, in_region BOOLEAN,
  waiting_days INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH me AS (
    SELECT COALESCE(_budget, p.monthly_budget) AS budget,
           COALESCE(NULLIF(btrim(COALESCE(_region, '')), ''), p.preferred_region) AS region
      FROM (SELECT NULL::UUID) z
      LEFT JOIN public.profiles p ON p.id = auth.uid()
  ),
  cand AS (
    SELECT o.id, o.code, o.display_name, o.gender, o.country, o.birth_date,
           o.monthly_need, o.funded_monthly, o.currency, o.status, o.org_id,
           o.created_at, o.approved_at,
           public.cohort_is_safe(o.id) AS safe,
           o.region AS raw_region, o.education_stage AS raw_stage,
           (o.monthly_need - o.funded_monthly) AS gap,
           EXISTS (
             SELECT 1 FROM public.program_enrollments e
              JOIN public.programs pr ON pr.id = e.program_id
              WHERE e.orphan_id = o.id
                AND pr.kind = 'qualification'
                AND e.status IN ('proposed', 'funded')
                AND public.enrollment_supervisor(e.id) IS NOT NULL
                AND public.enrollment_has_consent(e.id)
           ) AS building
      FROM public.orphans o
     WHERE o.status = 'approved'
       AND (o.monthly_need - o.funded_monthly) > 0
       AND NOT EXISTS (
         SELECT 1 FROM public.sponsorships s
          WHERE s.orphan_id = o.id
            AND s.sponsor_id = auth.uid()
            AND s.status IN ('pending_payment', 'active', 'paused')
       )
  ),
  masked AS (
    SELECT c.*,
           CASE WHEN c.safe THEN c.raw_region END AS m_region,
           CASE WHEN c.safe THEN c.raw_stage END AS m_stage
      FROM cand c
  )
  SELECT c.id, c.code, c.display_name, c.gender, c.country, c.m_region,
         c.m_stage, public.age_band_of(c.birth_date),
         c.monthly_need, c.funded_monthly, c.currency, c.status, c.org_id,
         c.created_at,
         c.gap,
         c.building,
         (me.budget IS NOT NULL AND c.gap <= me.budget) AS completes,
         (me.region IS NOT NULL AND c.m_region IS NOT DISTINCT FROM me.region) AS in_region,
         GREATEST(0, (now()::date - COALESCE(c.approved_at, c.created_at)::date))::INTEGER
    FROM masked c CROSS JOIN me
   ORDER BY
     c.building DESC,
     (me.budget IS NOT NULL AND c.gap <= me.budget) DESC,
     (me.region IS NOT NULL AND c.m_region IS NOT DISTINCT FROM me.region) DESC,
     COALESCE(c.approved_at, c.created_at) ASC,
     c.id
   LIMIT LEAST(GREATEST(COALESCE(_limit, 12), 1), 48);
$fn$;
REVOKE ALL ON FUNCTION public.suggest_orphans_for_sponsor(NUMERIC, TEXT, INT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suggest_orphans_for_sponsor(NUMERIC, TEXT, INT)
  TO authenticated;

/* اقتراح الفائض كان `SECURITY INVOKER` فيقرأ العمودين بمنح المستدعي.
   وقد سُحب المنح، فلا يقرؤهما إلا بحقوق المالك — فصار `DEFINER`، وهو
   لا يُخرج إلا أعمدة البطاقة، والمنطقة والمرحلة محجوبتان كما في البطاقة. */
DROP FUNCTION IF EXISTS public.suggest_orphans_for_amount(NUMERIC, UUID, INTEGER);
CREATE OR REPLACE FUNCTION public.suggest_orphans_for_amount(
  _amount NUMERIC, _exclude UUID DEFAULT NULL, _limit INTEGER DEFAULT 3
)
RETURNS TABLE (
  id UUID, code TEXT, display_name TEXT, country TEXT, region TEXT,
  education_stage TEXT, currency TEXT,
  monthly_need NUMERIC, funded_monthly NUMERIC, gap NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT o.id, o.code, o.display_name, o.country,
         CASE WHEN public.cohort_is_safe(o.id) THEN o.region END,
         CASE WHEN public.cohort_is_safe(o.id) THEN o.education_stage END,
         o.currency,
         o.monthly_need, o.funded_monthly,
         (o.monthly_need - o.funded_monthly) AS gap
    FROM public.orphans o
   WHERE o.status = 'approved'
     AND o.monthly_need > o.funded_monthly
     AND (_exclude IS NULL OR o.id <> _exclude)
   ORDER BY abs((o.monthly_need - o.funded_monthly) - _amount), o.created_at
   LIMIT LEAST(GREATEST(_limit, 1), 10);
$fn$;
REVOKE ALL ON FUNCTION public.suggest_orphans_for_amount(NUMERIC, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_orphans_for_amount(NUMERIC, UUID, INTEGER)
  TO anon, authenticated;

/* والخارطة: حجبُ المنطقة الصغيرة وحدها لا يكفي إن ظهر عدد البلد وبقيّة
   مناطقه — «ألبانيا ٨، تيرانا ٦» تعني «كوكس ٢». فإخفاءٌ تكميليّ: إن كان
   الباقي بعد المناطق الظاهرة دون الحدّ (ولم يكن صفراً)، تُخفى أصغرُ
   المناطق الظاهرة حتى يبلغ الباقي الحدّ. وعدد البلد يبقى — فإخفاؤه
   يُطرح هو الآخر من مجموع المنصّة. والقاعدة نفسها على «المكفول»
   و«وصلهم تسليم»: لا يُنشر رقم البلد إن كان باقيه بعد المناطق الظاهرة
   يكشف حشداً دون الحدّ.
   والمنطقة المُخفاة تكميلياً تحمل `suppressed` ولا تحمل `small`: هي ليست
   صغيرة، وإنما أُخفيت كي لا تكشف غيرها. */
CREATE OR REPLACE FUNCTION public.geo_stats()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH k AS (SELECT public.cohort_min() AS k),
  pub AS (
    SELECT o.id,
           btrim(o.country) AS country,
           NULLIF(btrim(o.region), '') AS region,
           (o.status = 'fully_sponsored') AS sponsored,
           GREATEST(0, o.monthly_need - o.funded_monthly) AS gap,
           o.currency,
           EXISTS (SELECT 1 FROM public.disbursements d
                    WHERE d.orphan_id = o.id AND d.status = 'delivered'
                      AND d.delivered_at > now() - interval '90 days') AS delivered
      FROM public.orphans o
     WHERE o.status IN ('approved', 'fully_sponsored')
       AND COALESCE(btrim(o.country), '') <> ''
  ),
  reg AS (
    SELECT country, region,
           count(*) AS total,
           count(*) FILTER (WHERE sponsored) AS spon,
           count(*) FILTER (WHERE delivered) AS deliv,
           mode() WITHIN GROUP (ORDER BY currency) AS currency
      FROM pub WHERE region IS NOT NULL GROUP BY country, region
  ),
  reg_gap AS (
    SELECT r.country, r.region, sum(p.gap) AS gap
      FROM reg r JOIN pub p ON p.country = r.country AND p.region = r.region
                           AND p.currency = r.currency
     GROUP BY r.country, r.region
  ),
  cty AS (
    SELECT country,
           count(*) AS total,
           count(*) FILTER (WHERE sponsored) AS spon,
           count(*) FILTER (WHERE delivered) AS deliv,
           mode() WITHIN GROUP (ORDER BY currency) AS currency
      FROM pub GROUP BY country
  ),
  cty_gap AS (
    SELECT c.country, sum(p.gap) AS gap
      FROM cty c JOIN pub p ON p.country = c.country AND p.currency = c.currency
     GROUP BY c.country
  ),
  /* الباقي قبل الإخفاء التكميلي: البلد − المناطق التي بلغت الحدّ. */
  resid AS (
    SELECT c.country,
           c.total - COALESCE((SELECT sum(r.total) FROM reg r, k
                                WHERE r.country = c.country AND r.total >= k.k), 0) AS r0
      FROM cty c
  ),
  reg_vis AS (
    SELECT r.*, rg.gap, (r.total < k.k) AS small,
           /* تُخفى المنطقة الكبيرة إن كان الباقي ما زال دون الحدّ قبل
              إضافتها — بالترتيب من الأصغر. */
           (r.total >= k.k AND NOT (
              x.r0 > 0 AND x.r0 < k.k
              AND x.r0 + COALESCE(sum(r.total) FILTER (WHERE r.total >= k.k) OVER (
                    PARTITION BY r.country ORDER BY r.total, r.region
                    ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) < k.k
           )) AS shown
      FROM reg r
      JOIN reg_gap rg ON rg.country = r.country AND rg.region = r.region
      JOIN resid x ON x.country = r.country
     CROSS JOIN k
  ),
  reg_out AS (
    SELECT v.*,
           (v.shown AND v.spon >= k.k AND v.total - v.spon >= k.k) AS spon_shown,
           (v.shown AND v.deliv >= k.k AND v.total - v.deliv >= k.k) AS deliv_shown
      FROM reg_vis v CROSS JOIN k
  ),
  /* بواقي البلد لكل رقم: من لم يظهر رقمُ منطقته، وكم منهم في الفئة. */
  cres AS (
    SELECT c.country,
           c.total - COALESCE(sum(r.total) FILTER (WHERE r.shown), 0) AS n_tot,
           c.total - COALESCE(sum(r.total) FILTER (WHERE r.spon_shown), 0) AS n_spon,
           c.spon  - COALESCE(sum(r.spon)  FILTER (WHERE r.spon_shown), 0) AS x_spon,
           c.total - COALESCE(sum(r.total) FILTER (WHERE r.deliv_shown), 0) AS n_deliv,
           c.deliv - COALESCE(sum(r.deliv) FILTER (WHERE r.deliv_shown), 0) AS x_deliv
      FROM cty c LEFT JOIN reg_out r ON r.country = c.country
     GROUP BY c.country, c.total, c.spon, c.deliv
  ),
  shaped AS (
    SELECT c.country, c.total, c.spon, c.deliv, c.currency, cg.gap,
           (c.total >= k.k AND (cr.n_tot = 0 OR cr.n_tot >= k.k)) AS tot_ok,
           (c.total >= k.k AND c.spon >= k.k AND c.total - c.spon >= k.k
            AND (cr.n_spon = 0 OR (cr.x_spon >= k.k AND cr.n_spon - cr.x_spon >= k.k))) AS spon_ok,
           (c.total >= k.k AND c.deliv >= k.k AND c.total - c.deliv >= k.k
            AND (cr.n_deliv = 0 OR (cr.x_deliv >= k.k AND cr.n_deliv - cr.x_deliv >= k.k))) AS deliv_ok,
           COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'region', r.region,
                      'small', r.small,
                      'suppressed', NOT r.small AND NOT r.shown,
                      'total', CASE WHEN r.shown THEN r.total END,
                      'sponsored', CASE WHEN r.spon_shown THEN r.spon END,
                      'delivered', CASE WHEN r.deliv_shown THEN r.deliv END,
                      'gap', CASE WHEN r.shown THEN r.gap END,
                      'currency', CASE WHEN r.shown THEN r.currency END)
                    ORDER BY r.total DESC, r.region)
               FROM reg_out r
              WHERE r.country = c.country), '[]'::jsonb) AS regions
      FROM cty c
      JOIN cty_gap cg ON cg.country = c.country
      JOIN cres cr ON cr.country = c.country
     CROSS JOIN k
  )
  SELECT jsonb_build_object(
    'countries', COALESCE(jsonb_agg(jsonb_build_object(
        'country', s.country,
        'small', s.total < (SELECT k FROM k),
        'total', CASE WHEN s.tot_ok THEN s.total END,
        'sponsored', CASE WHEN s.spon_ok THEN s.spon END,
        'delivered', CASE WHEN s.deliv_ok THEN s.deliv END,
        'gap', CASE WHEN s.tot_ok THEN s.gap END,
        'currency', CASE WHEN s.tot_ok THEN s.currency END,
        'regions', s.regions)
      ORDER BY s.total DESC, s.country), '[]'::jsonb)
  ) FROM shaped s;
$fn$;
REVOKE ALL ON FUNCTION public.geo_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.geo_stats() TO anon, authenticated;


-- ---------------------------------------------------------------------
-- ٦) CP-07 — أطفال البذرة التجريبية ليسوا أطفالاً حقيقيين
-- ---------------------------------------------------------------------
-- الهجرة الأولى بذرت خمسة أطفالٍ (ORP-1001..1005) تحت جهتين مخترعتين
-- (LIC-1024 «جمعية بناء» وLIC-2087 «دار الرحمة»، ببريدٍ ‎.example)
-- بحال «معتمد» — ولا شيء بعدها يسحبهم. فهم على البثّ يُعرضون ويُكفلون،
-- وجمعُ مالٍ لطفلٍ غير موجود تحت اسم جمعيةٍ يبدو حقيقياً هو ما لا يُقبل
-- بحال.
--
-- فيُؤرشفون ولا يُحذفون: السجلّ المالي (إن وُجد) يبقى كما هو، والأرشفة
-- تُخرجهم من الدليل والخارطة والاقتراح والكفالة. والجهتان تُوقفان.
-- والتعرّف بالمعرّف الثابت **والترخيص والرمز معاً**، فلا يمسّ ملفّاً
-- حقيقياً صادف رمزه.
--
-- الكفالة «بانتظار الدفع» لطفلٍ مؤرشف تُلغى: لم يُدفع فيها شيء، وبقاؤها
-- بابٌ لأن يُدفع لطفلٍ لا وجود له. وما كان فعّالاً أو مقفلاً (مالٌ حقيقيّ
-- مرّ) لا يُمسّ هنا: الفكّ بموافقتين له طريقه، فيُسجَّل للإدارة لتتابعه
-- وتتواصل مع الكافل.
DO $$
DECLARE
  _seed_orgs UUID[] := ARRAY['11111111-1111-4111-8111-111111111111',
                             '22222222-2222-4222-8222-222222222222']::UUID[];
  _o RECORD;
BEGIN
  FOR _o IN
    SELECT o.id, o.code
      FROM public.orphans o
      JOIN public.care_organizations c ON c.id = o.org_id
     WHERE c.id = ANY(_seed_orgs)
       AND c.license_number IN ('LIC-1024', 'LIC-2087')
       AND o.code IN ('ORP-1001', 'ORP-1002', 'ORP-1003', 'ORP-1004', 'ORP-1005')
       AND o.status IN ('approved', 'fully_sponsored', 'submitted', 'under_review')
  LOOP
    IF public.orphan_is_locked(_o.id) THEN
      INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
      VALUES (NULL, 'demo_seed.archive_blocked', 'orphan', _o.id,
              jsonb_build_object('code', _o.code,
                                 'reason', 'مقفلٌ بكفالةٍ أو دعمٍ أو صرف — يحتاج طلب أرشفةٍ بموافقتين'));
      RAISE WARNING 'CP-07: الملفّ التجريبي % مقفل — لم يُؤرشف، يحتاج طلب أرشفة', _o.code;
      CONTINUE;
    END IF;

    UPDATE public.sponsorships SET status = 'cancelled', ended_at = COALESCE(ended_at, now())
     WHERE orphan_id = _o.id AND status = 'pending_payment';

    UPDATE public.orphans SET status = 'archived' WHERE id = _o.id;

    INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
    VALUES (NULL, 'demo_seed.archived', 'orphan', _o.id,
            jsonb_build_object('code', _o.code, 'migration', '20261106100000'));
  END LOOP;

  UPDATE public.care_organizations
     SET status = 'suspended'
   WHERE id = ANY(_seed_orgs)
     AND license_number IN ('LIC-1024', 'LIC-2087')
     AND status = 'approved';
END $$;

-- ---------------------------------------------------------------------
-- ٧) DB-04 + DB-09 — الصلاحيات كما قصدتها الهجرات، على البثّ أيضاً
-- ---------------------------------------------------------------------
-- قاعدة Supabase تحمل «صلاحيات افتراضية» تمنح anon وauthenticated كلَّ
-- شيء على أيّ جدولٍ أو تسلسلٍ أو دالّةٍ يُنشأ في public. والهجرات منحت
-- ما قصدته فقط (SELECT، INSERT، UPDATE…) ولم تسحب ما زاده الافتراض —
-- فعلى البثّ يملك مالك الجهة `DELETE` على `program_enrollments`
-- و`orphan_private` و`enrollment_roles`، والسياسات `FOR ALL` تسمح به،
-- فيُحذف تسجيلٌ مموَّل ومعه بالتتابع موافقاتُه وتقويماته. والمحاكاة لا
-- تحمل الافتراض فلم يرَ الفحص شيئاً.
--
-- و`live-part4-grants.sql` ضيّق سبعة عشر جدولاً وستّة تسلسلات ورقم
-- الفاتورة يدوياً على البثّ، ولا هجرة تفعل ذلك — فأيّ بيئةٍ تُبنى من
-- المستودع (معاينة، استعادة، تجربة) تعود أوسع من البثّ.
--
-- فهنا يُعاد كلُّ جدولٍ وتسلسلٍ ودالّة في public إلى ما قصدته الهجرات
-- **حرفياً**: يُسحب كلّ شيء من anon وauthenticated ثم يُمنح المقصود وحده.
-- والمقصود لقطةٌ أُخذت من قاعدةٍ بُنيت من المستودع **بلا** الصلاحيات
-- الافتراضية (ما كتبته الهجرات وحده) بعد أقسام هذه الهجرة. فهي تشمل
-- live-part4 كلّه وتزيد عليه الجداول الثلاثين الأقدم التي تركها.
-- و`service_role` لا يُمسّ.
--
-- والمحاكاة (`supabase/tests/harness.sql`) تحمل الآن الصلاحيات الافتراضية
-- نفسها، فأيّ هجرةٍ لاحقة تمنح دون أن تسحب يكشفها
-- `supabase/tests/grants-verification.sql`.
--
-- كلّ اسمٍ يُفحص وجوده قبل المسّ: هجرةٌ أخرى قد تسبق هذه فتُسقط دالّةً
-- أو جدولاً، فلا يفشل الملف كلّه لاسمٍ غائب.
DO $grants$
DECLARE
  _tables TEXT[] := ARRAY[
    'access_request_messages', 'access_scope_packages', 'access_scopes', 'api_clients', 'api_import_jobs', 'audit_log', 'care_organizations', 'countries', 'data_retention_policy', 'disbursements', 'dispatch_runs', 'donor_entities', 'donor_members', 'enrollment_roles', 'enrollment_units', 'guardian_e_consents', 'institution_kinds', 'integrity_discrepancies', 'integrity_log', 'mirror_batches', 'mirror_groups', 'mirror_sync_state', 'notification_prefs', 'notifications', 'office_members', 'office_reports', 'office_roles', 'offices', 'operating_platforms', 'ops_runs', 'orphan_access_requests', 'orphan_documents', 'orphan_locks', 'orphan_needs', 'orphan_private', 'orphan_profile_sections', 'orphan_trait_scores', 'orphans', 'payment_events', 'platform_settings', 'pledge_deliveries', 'profiles', 'program_enrollments', 'program_units', 'programs', 'progress_reports', 'protected_admins', 'qualification_concepts', 'qualification_traits', 'rate_limits', 'sponsorship_payments', 'sponsorships', 'supervisor_profiles', 'support_pledges', 'timeline_events', 'trait_assessments', 'trait_definitions', 'trait_dimensions', 'trait_score_revisions', 'ui_locale_reviewers', 'ui_locales', 'ui_translation_revisions', 'ui_translations', 'unlock_requests', 'user_roles'];
  _grants TEXT[][] := ARRAY[
    ['access_request_messages', 'authenticated', 'SELECT'],
    ['access_scope_packages', 'authenticated', 'SELECT'],
    ['access_scopes', 'authenticated', 'SELECT'],
    ['api_clients', 'authenticated', 'SELECT'],
    ['api_import_jobs', 'authenticated', 'SELECT'],
    ['audit_log', 'authenticated', 'SELECT'],
    ['care_organizations', 'authenticated', 'INSERT, SELECT, UPDATE'],
    ['countries', 'anon', 'SELECT'],
    ['countries', 'authenticated', 'DELETE, INSERT, SELECT, UPDATE'],
    ['data_retention_policy', 'authenticated', 'SELECT'],
    ['disbursements', 'authenticated', 'INSERT, SELECT, UPDATE'],
    ['dispatch_runs', 'authenticated', 'SELECT'],
    ['donor_entities', 'authenticated', 'SELECT, UPDATE'],
    ['donor_members', 'authenticated', 'SELECT'],
    ['enrollment_roles', 'authenticated', 'INSERT, SELECT, UPDATE'],
    ['enrollment_units', 'authenticated', 'SELECT'],
    ['guardian_e_consents', 'authenticated', 'SELECT'],
    ['institution_kinds', 'anon', 'SELECT'],
    ['institution_kinds', 'authenticated', 'DELETE, INSERT, SELECT, UPDATE'],
    ['integrity_discrepancies', 'authenticated', 'SELECT'],
    ['integrity_log', 'authenticated', 'SELECT'],
    ['mirror_batches', 'authenticated', 'SELECT'],
    ['mirror_groups', 'authenticated', 'SELECT'],
    ['mirror_sync_state', 'authenticated', 'SELECT'],
    ['notification_prefs', 'authenticated', 'INSERT, SELECT, UPDATE'],
    ['notifications', 'authenticated', 'SELECT, UPDATE'],
    ['office_members', 'authenticated', 'DELETE, INSERT, SELECT, UPDATE'],
    ['office_reports', 'authenticated', 'SELECT'],
    ['office_roles', 'authenticated', 'DELETE, INSERT, SELECT, UPDATE'],
    ['offices', 'authenticated', 'DELETE, INSERT, SELECT, UPDATE'],
    ['operating_platforms', 'authenticated', 'INSERT, SELECT, UPDATE'],
    ['ops_runs', 'authenticated', 'SELECT'],
    ['orphan_access_requests', 'authenticated', 'SELECT'],
    ['orphan_documents', 'authenticated', 'INSERT, SELECT, UPDATE'],
    ['orphan_locks', 'authenticated', 'SELECT'],
    ['orphan_needs', 'anon', 'SELECT'],
    ['orphan_needs', 'authenticated', 'DELETE, INSERT, SELECT, UPDATE'],
    ['orphan_private', 'authenticated', 'INSERT, SELECT, UPDATE'],
    ['orphan_profile_sections', 'authenticated', 'SELECT'],
    ['orphan_trait_scores', 'authenticated', 'SELECT'],
    ['orphans', 'authenticated', 'INSERT, UPDATE'],
    ['payment_events', 'authenticated', 'SELECT'],
    ['platform_settings', 'authenticated', 'SELECT'],
    ['pledge_deliveries', 'authenticated', 'SELECT'],
    ['profiles', 'authenticated', 'INSERT, SELECT, UPDATE'],
    ['program_enrollments', 'anon', 'SELECT'],
    ['program_enrollments', 'authenticated', 'INSERT, SELECT, UPDATE'],
    ['program_units', 'anon', 'SELECT'],
    ['program_units', 'authenticated', 'SELECT'],
    ['programs', 'anon', 'SELECT'],
    ['programs', 'authenticated', 'SELECT'],
    ['progress_reports', 'authenticated', 'INSERT, SELECT, UPDATE'],
    ['qualification_concepts', 'anon', 'SELECT'],
    ['qualification_concepts', 'authenticated', 'SELECT'],
    ['qualification_traits', 'anon', 'SELECT'],
    ['qualification_traits', 'authenticated', 'SELECT'],
    ['sponsorship_payments', 'authenticated', 'SELECT'],
    ['sponsorships', 'authenticated', 'INSERT, SELECT, UPDATE'],
    ['supervisor_profiles', 'authenticated', 'SELECT'],
    ['support_pledges', 'authenticated', 'SELECT'],
    ['timeline_events', 'authenticated', 'SELECT'],
    ['trait_assessments', 'authenticated', 'SELECT'],
    ['trait_definitions', 'anon', 'SELECT'],
    ['trait_definitions', 'authenticated', 'SELECT'],
    ['trait_dimensions', 'anon', 'SELECT'],
    ['trait_dimensions', 'authenticated', 'SELECT'],
    ['trait_score_revisions', 'authenticated', 'SELECT'],
    ['ui_locale_reviewers', 'authenticated', 'SELECT'],
    ['ui_locales', 'authenticated', 'SELECT'],
    ['unlock_requests', 'authenticated', 'SELECT'],
    ['user_roles', 'authenticated', 'SELECT'],
    ['care_organizations', 'anon', 'SELECT (id, name, city, region, about, logo_url, status)'],
    ['orphans', 'anon', 'SELECT (id, code, display_name, gender, country, monthly_need, currency, funded_monthly, status, org_id, created_at, country_code)'],
    ['orphans', 'authenticated', 'SELECT (id, code, display_name, gender, country, monthly_need, currency, funded_monthly, status, org_id, approved_at, rejection_reason, created_at, updated_at, photo_consent, rejection_code, country_code)']];
  _sequences TEXT[] := ARRAY['integrity_log_id_seq', 'invoice_seq', 'mirror_batches_id_seq', 'ops_runs_id_seq', 'orphan_code_seq', 'trait_score_revisions_id_seq', 'ui_translation_revisions_id_seq'];
  _seq_grants TEXT[][] := ARRAY[['orphan_code_seq', 'authenticated', 'USAGE']];
  _fn_closed TEXT[] := ARRAY[
    'public._ops_checks()',
    'public.announce_payment(uuid,boolean,numeric,text)',
    'public.api_orphan_cards(uuid,text,text,text,text,text,integer,integer)',
    'public.claim_email_batch(integer,integer,integer)',
    'public.clear_photo_on_withdrawal()',
    'public.ensure_notification_prefs()',
    'public.guard_document_verification()',
    'public.guard_enrollment()',
    'public.guard_imported_orphan()',
    'public.guard_monthly_need()',
    'public.guard_org_insert()',
    'public.guard_org_update()',
    'public.guard_orphan_insert()',
    'public.guard_orphan_update()',
    'public.guard_photo_consent()',
    'public.guard_protected_admin_role()',
    'public.guard_protected_admin_user()',
    'public.guard_report_write()',
    'public.guard_sponsorship_insert()',
    'public.guard_sponsorship_update()',
    'public.handle_new_user()',
    'public.has_role(uuid,public.app_role)',
    'public.hit_rate_limit(text,text,integer,integer)',
    'public.import_orphan_record(uuid,jsonb)',
    'public.is_protected_admin_email(text)',
    'public.lock_orphan(uuid,text,uuid)',
    'public.log_integrity(text,uuid,jsonb,text)',
    'public.mark_email_failed(uuid,text,integer)',
    'public.mark_email_sent(uuid[])',
    'public.mark_email_suppressed(uuid)',
    'public.mark_sponsorship_excess()',
    'public.mirror_apply(uuid,text,jsonb,text[],timestamp with time zone,text)',
    'public.mirror_log_batch(uuid,text,integer,integer,text)',
    'public.mirror_mark_reconciled(uuid)',
    'public.mirror_reconcile(uuid,text,text[])',
    'public.month_payment_refs(uuid,text)',
    'public.month_payments(uuid,text)',
    'public.notification_recipients(uuid[])',
    'public.notify(uuid,public.notification_kind,text,text,text,text,uuid)',
    'public.notify_new_user()',
    'public.ops_record_run()',
    'public.orphan_sponsor_ids(uuid)',
    'public.protected_admin_override()',
    'public.prune_rate_limits()',
    'public.recalc_orphan_funding()',
    'public.recalc_orphan_monthly_need()',
    'public.source_checklist(text)',
    'public.stamp_sponsorship_status_change()',
    'public.sweep_email_outbox()',
    'public.touch_api_client(uuid,boolean)',
    'public.update_updated_at_column()',
    'public.write_timeline(uuid,text,text)'];
  _fn_auth_only TEXT[] := ARRAY[
    'public.access_scope_catalog()',
    'public.access_thread(uuid)',
    'public.admin_access_requests(text)',
    'public.admin_api_clients()',
    'public.admin_apply_unlock(uuid)',
    'public.admin_approve_unlock(uuid)',
    'public.admin_approved_orgs()',
    'public.admin_assign_office_member(uuid,text,text)',
    'public.admin_decision_context(text,uuid)',
    'public.admin_decision_inbox()',
    'public.admin_enable_locale(text,text,text,text)',
    'public.admin_grant_payload(uuid)',
    'public.admin_integrity_queue()',
    'public.admin_locale_reviewers(text)',
    'public.admin_mirror_status()',
    'public.admin_offices_overview()',
    'public.admin_orphan_lock(uuid)',
    'public.admin_overview()',
    'public.admin_reject_unlock(uuid,text)',
    'public.admin_request_unlock(uuid,text,jsonb,text,text)',
    'public.admin_resolve_discrepancy(uuid,boolean,text)',
    'public.admin_review_office_report(uuid,boolean)',
    'public.admin_set_country_emergency(text,boolean,text)',
    'public.admin_set_locale_reviewer(text,text,boolean)',
    'public.admin_set_locale_status(text,text)',
    'public.admin_set_platform_org(text,uuid)',
    'public.admin_set_pledge_status(uuid,text)',
    'public.admin_set_source(text,text,boolean,boolean)',
    'public.admin_sources_overview()',
    'public.admin_supervisors()',
    'public.amend_orphan_access(uuid,text[],text)',
    'public.assign_enrollment_role(uuid,text,text,text,text,text)',
    'public.can_manage_orphan(uuid)',
    'public.can_reach_office_folder(text,text)',
    'public.can_reach_orphan_folder(text)',
    'public.can_see_qualification(uuid)',
    'public.can_view_orphan_detail(uuid)',
    'public.certify_supervisor(uuid,text,integer,text)',
    'public.certify_supervisor_by_email(text,text,integer,text)',
    'public.confirm_disbursement_delivery(uuid,text,text)',
    'public.create_api_client(text,uuid,text[],text,text,text,text)',
    'public.create_api_client(text,uuid,text[],text,text,text,text,text)',
    'public.create_orphan_intake(jsonb)',
    'public.create_support_pledge(text,text,text,numeric,text,text,text,integer)',
    'public.decide_orphan_access(uuid,text,text[],text,integer)',
    'public.donor_entity_dashboard(uuid)',
    'public.donor_entity_pledges(uuid)',
    'public.donor_members_list(uuid)',
    'public.donor_set_member(uuid,text,text)',
    'public.enrollment_assessments(uuid)',
    'public.enrollment_detail(uuid)',
    'public.enrollment_has_consent(uuid)',
    'public.enrollment_supervisor(uuid)',
    'public.enrollment_unit_progress(uuid)',
    'public.guardian_children_overview()',
    'public.guardian_consent_enrollment(uuid)',
    'public.guardian_orphans()',
    'public.guardian_set_photo_consent(uuid,text)',
    'public.has_orphan_scope(uuid,text)',
    'public.in_orphan_circle(uuid)',
    'public.integrity_verify()',
    'public.is_admin()',
    'public.is_donor_member(uuid)',
    'public.is_locale_reviewer(text)',
    'public.lookup_payment(text)',
    'public.moderate_sponsor_message(uuid,boolean)',
    'public.my_access_requests()',
    'public.my_journey_feed(integer)',
    'public.my_monthly_digest()',
    'public.my_notification_prefs()',
    'public.my_orphan_scopes(uuid)',
    'public.my_pledges()',
    'public.my_review_locales()',
    'public.my_sponsor_preferences()',
    'public.my_supervised_enrollments()',
    'public.my_supervisor_profile()',
    'public.my_supervisor_today()',
    'public.my_workspaces()',
    'public.next_orphan_code()',
    'public.office_dashboard(uuid)',
    'public.office_open_pledges(uuid)',
    'public.office_permission(uuid,text)',
    'public.ops_health()',
    'public.org_orphans()',
    'public.org_pending_deliveries()',
    'public.orphan_enrollments(uuid)',
    'public.orphan_group(uuid)',
    'public.orphan_journey(uuid)',
    'public.orphan_messages(uuid)',
    'public.orphan_profile(uuid)',
    'public.orphan_profile_completeness(uuid)',
    'public.orphan_progress_reports(uuid)',
    'public.orphan_reports(uuid)',
    'public.orphan_traits(uuid)',
    'public.owns_org(uuid)',
    'public.post_access_message(uuid,text)',
    'public.record_enrollment_consent(uuid,text)',
    'public.record_pledge_delivery(uuid,uuid,text,text,text)',
    'public.record_trait_assessment(uuid,jsonb,text,text)',
    'public.record_unit_progress(uuid,uuid,text,text,text)',
    'public.register_donor_entity(text,text,text)',
    'public.request_orphan_access(uuid,text)',
    'public.request_orphan_access(uuid,text,text)',
    'public.review_organization(uuid,text,text)',
    'public.review_orphan(uuid,text,public.rejection_code,text)',
    'public.review_progress_report(uuid,text,text)',
    'public.revoke_api_client(uuid)',
    'public.revoke_orphan_access(uuid,text)',
    'public.revoke_supervisor(uuid,text)',
    'public.save_office_report(uuid,text,text,jsonb,text[],date,date,text,uuid,boolean)',
    'public.save_orphan_profile_section(uuid,text,jsonb,text)',
    'public.save_sponsor_preferences(numeric,text)',
    'public.set_enrollment_stage(uuid,text)',
    'public.set_notification_prefs(boolean,text[])',
    'public.set_pledge_entity(uuid,uuid)',
    'public.sponsor_messages_for_review()',
    'public.sponsor_qualification(uuid)',
    'public.sponsors_orphan(uuid)',
    'public.sponsorship_ledger(uuid)',
    'public.start_orphan_draft(uuid)',
    'public.submit_progress_report(jsonb)',
    'public.suggest_orphans_for_sponsor(numeric,text,integer)',
    'public.system_health()',
    'public.ui_translation_publish(text,text[])',
    'public.ui_translation_review(text,text[])',
    'public.ui_translation_save(text,jsonb,boolean)',
    'public.ui_translation_unpublish(text,text[])',
    'public.ui_translations_for(text)',
    'public.verify_document(uuid,boolean,text)',
    'public.verify_ledger_receipt(uuid,text,text)',
    'public.write_audit(text,text,uuid,jsonb)'];
  _i INTEGER;
  _sig TEXT;
BEGIN
  -- الجداول: سحبٌ كامل ثم المنح المقصود (جدولاً وأعمدةً)
  FOR _i IN 1 .. cardinality(_tables) LOOP
    IF to_regclass('public.' || quote_ident(_tables[_i])) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', _tables[_i]);
    END IF;
  END LOOP;
  FOR _i IN 1 .. array_length(_grants, 1) LOOP
    IF to_regclass('public.' || quote_ident(_grants[_i][1])) IS NOT NULL THEN
      EXECUTE format('GRANT %s ON public.%I TO %I', _grants[_i][3], _grants[_i][1], _grants[_i][2]);
    END IF;
  END LOOP;

  -- التسلسلات: تُستهلك داخل الدوالّ، ورمز الملفّ وحده يستهلكه المسجَّل
  FOR _i IN 1 .. cardinality(_sequences) LOOP
    IF to_regclass('public.' || quote_ident(_sequences[_i])) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM anon, authenticated', _sequences[_i]);
    END IF;
  END LOOP;
  FOR _i IN 1 .. array_length(_seq_grants, 1) LOOP
    IF to_regclass('public.' || quote_ident(_seq_grants[_i][1])) IS NOT NULL THEN
      EXECUTE format('GRANT %s ON SEQUENCE public.%I TO %I',
                     _seq_grants[_i][3], _seq_grants[_i][1], _seq_grants[_i][2]);
    END IF;
  END LOOP;

  -- الدوالّ: ما لم تقصده الهجرات للزائر يُسحب منه — والمنح الافتراضي
  -- مباشرٌ لـ anon، فسحبُه من PUBLIC وحده (كما فعلت هجراتٌ كثيرة) لا يكفي…
  FOREACH _sig IN ARRAY _fn_auth_only LOOP
    IF to_regprocedure(_sig) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', _sig);
    END IF;
  END LOOP;
  -- …وما لم تقصده لأحدٍ يُسحب من الاثنين.
  FOREACH _sig IN ARRAY _fn_closed LOOP
    IF to_regprocedure(_sig) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', _sig);
    END IF;
  END LOOP;
END $grants$;

-- ورقم الفاتورة يصدره المشغّل `issue_invoice` وحده (live-part4): الهجرة
-- 0924 لم تسحبه من PUBLIC، فكان الزائر يحرق الأرقام ويترك فجواتٍ في
-- تسلسلٍ محاسبيّ.
REVOKE ALL ON FUNCTION public.next_invoice_no(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- وما لم يقصده أحدٌ قطّ لأيّ جدولٍ في public — ولو جدولاً أُنشئ خارج
-- اللقطة: لا TRUNCATE ولا REFERENCES ولا TRIGGER للعموم.
DO $sweep$
DECLARE _t TEXT;
BEGIN
  FOR _t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM anon, authenticated', _t);
  END LOOP;
END $sweep$;
