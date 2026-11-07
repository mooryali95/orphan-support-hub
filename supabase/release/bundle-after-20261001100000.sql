-- ملف نشر كهاتين — كل الهجرات بعد 20261001100000
-- يُولَّد آلياً؛ لا تعدّله يدوياً. أُنشئ: 2026-11-07T08:33Z
BEGIN;

-- >>> migration 20261106100000 child_data_exposure_and_grants
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261106100000') THEN
    RAISE EXCEPTION 'الهجرة 20261106100000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
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
--
-- والصفوف السابقة لا تُحدَّث هنا (التحديث يوقظ مشغّلات الكفالة والتمويل
-- على كل صفّ): يبقى عمودها فارغاً، ويُقدَّر تغيّرُ حالتها بـ
-- `ended_at` ثم `updated_at` كما كانا قبل هذه الهجرة — وأوّلُ تعديلٍ
-- يمسّه الكافل يُجمِّد هذا التقدير من القيم القديمة، فلا يجدّده التعديل.
ALTER TABLE public.sponsorships
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;
ALTER TABLE public.sponsorships
  ALTER COLUMN status_changed_at SET DEFAULT now();

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
    NEW.status_changed_at := COALESCE(OLD.status_changed_at, OLD.ended_at,
                                      OLD.updated_at, OLD.created_at);
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
               AND COALESCE(s.status_changed_at, s.ended_at, s.updated_at, s.created_at)
                   > now() - public.sponsor_access_grace()))
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

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261106100000', 'child_data_exposure_and_grants');

-- >>> migration 20261106110000 care_org_trust_and_admin_accountability
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261106110000') THEN
    RAISE EXCEPTION 'الهجرة 20261106110000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- المرحلة صفر — الثقة بجهة الرعاية ومساءلة الإدارة (المجموعة DB-B)
-- ---------------------------------------------------------------------
-- ستّة أبوابٍ وجدها التدقيق، كلٌّ منها مُثبَتٌ بفحصٍ يفشل قبل هذه الهجرة
-- ويمرّ بعدها (`supabase/tests/trust-accountability-verification.sql`):
--
--   ١) CP-01 + DB-02  الجهة (أو الوليّ) تُدخل أيّ حسابٍ دائرةَ الطفل —
--             الاسم الحقيقي والصورة والصحّة والأسرة — بلا قرارٍ من الإدارة
--             ولا أجلٍ ولا أثر، وتجعل أيّ حسابٍ «وليّاً» له.
--   ٢) CP-02 + DB-01  الجهة تنقض سحبَ الوليّ لموافقة الصورة، وتكتب من
--             وافق (`photo_consent_by`) ومن راجع (`reviewed_by`) بنفسها.
--   ٣) CP-06  ملفٌّ بلا وثيقةٍ موثَّقة واحدة يُعتمد ويُنشر — والأسئلة
--             الشائعة تَعِد بشهادة وفاةٍ وإثبات وصايةٍ فتحتهما الإدارة.
--   ٤) DB-07 + CP-10  ما اعتُمد (الاسم والقصّة والمدينة والصورة، والتقرير
--             الدوري) يُعدَّل بعد الاعتماد ويبقى منشوراً بلا مراجعة.
--   ٥) GAP-03  الإدارة تفعّل كفالةً وتسجّل صرفاً بكتابةٍ مباشرة بلا أثر.
--   ٦) DB-05  «إثبات الوصول» ملفٌّ غير موجود، والوثيقة الموثَّقة تُستبدل
--             وتُحذف ويبقى وسمها «موثَّقة».
--
-- كلّ ما هنا `CREATE OR REPLACE` و`DROP ... IF EXISTS` وتحديثاتٌ مشروطة،
-- فتُطبَّق على البثّ كما هي. وتواقيع الدوالّ التي تستدعيها الواجهة باقية.
-- وكلّ دالّةٍ جديدة تُسحب من العموم أولاً ثم تُمنح لمن قُصدت له: صلاحيات
-- Supabase الافتراضية تمنح anon وauthenticated كلَّ ما يُنشأ في public.
-- =====================================================================


-- ---------------------------------------------------------------------
-- ١) CP-01 + DB-02 — الدائرة تُفتح بقرار الإدارة، لأجلٍ، وبأثر
-- ---------------------------------------------------------------------
-- القاعدة نفسها التي بُني عليها الإذن بالاطّلاع وعلى اعتماد المشرفين:
-- «جهةٌ تأذن في ملفّاتها كجهةٍ تعتمد نفسها». فالجهة تُسنِد، والإدارة
-- تقرّر، والقرار ينقضي (٣٦٥ يوماً حدّاً) ويُسجَّل.
--
--   - دورٌ بلا حساب (اسمٌ موثَّق) لا يفتح شيئاً أصلاً: `not_required`.
--   - المشرف لا يُسنَد إلا معتمَداً من الإدارة (`guard_supervisor_is_certified`)
--     فاعتماده هو القرار، ويُعطى أجلاً كغيره.
--   - ما عدا ذلك بحسابٍ: `pending` حتى تقرّر الإدارة.
ALTER TABLE public.enrollment_roles
  ADD COLUMN IF NOT EXISTS approval TEXT,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decision_note TEXT;

/* حارس الاعتماد كان يفحص كلَّ تحديث، فقرارُ الإدارة على دور مشرفٍ سُحب
   اعتماده لاحقاً كان يسقط. الفحص الآن حين يصير الدورُ دورَ مشرفٍ حيّ:
   إدراجاً، أو تغييرَ صاحبه أو نوعه، أو إحياءَ دورٍ منتهٍ. */
CREATE OR REPLACE FUNCTION public.guard_supervisor_is_certified()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.role <> 'supervisor' OR NEW.ended_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.role = OLD.role
     AND NEW.person_id IS NOT DISTINCT FROM OLD.person_id AND OLD.ended_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.supervisor_profiles s
     WHERE s.user_id = NEW.person_id AND s.active
  ) THEN
    RAISE EXCEPTION 'لا يُسنَد الإشراف إلا لمشرفٍ معتمَد من الإدارة'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.guard_supervisor_is_certified() FROM PUBLIC, anon, authenticated;

/* الصفوف القائمة: الإسناد الذي سبق هذه الهجرة لم يمرّ بقرار، فيُعلَّق
   كلُّ دورٍ حيٍّ بحسابٍ — إلا المشرف المعتمد — حتى تقرّر الإدارة. ومن
   كان يرى الطفل بدورٍ كهذا يغيب عنه حتى يُعتمد: هذا هو الإصلاح لا أثرٌ
   جانبيّ له. والمنتهي يبقى تاريخاً كما هو. */
UPDATE public.enrollment_roles r SET
  approval = CASE
    WHEN r.person_id IS NULL THEN 'not_required'
    WHEN r.ended_at IS NOT NULL THEN 'approved'
    WHEN r.role = 'supervisor' AND EXISTS (
           SELECT 1 FROM public.supervisor_profiles s
            WHERE s.user_id = r.person_id AND s.active) THEN 'approved'
    ELSE 'pending' END
WHERE r.approval IS NULL;

/* والمعتمَد منها يحمل لحظته وأجله: المنتهي أجلُه لحظةُ انتهائه، والمشرف
   الحيّ سنةٌ من اليوم. */
UPDATE public.enrollment_roles r SET
  approved_at = COALESCE(r.approved_at, r.assigned_at),
  expires_at = COALESCE(r.expires_at,
                        CASE WHEN r.ended_at IS NOT NULL THEN r.ended_at
                             ELSE now() + interval '365 days' END),
  decision_note = COALESCE(r.decision_note,
                           CASE WHEN r.ended_at IS NULL THEN 'certified_supervisor' END)
WHERE r.approval = 'approved' AND r.person_id IS NOT NULL AND r.expires_at IS NULL;

ALTER TABLE public.enrollment_roles DROP CONSTRAINT IF EXISTS ck_role_approval;
ALTER TABLE public.enrollment_roles ADD CONSTRAINT ck_role_approval CHECK (
  approval IN ('pending', 'approved', 'rejected', 'not_required')
);
ALTER TABLE public.enrollment_roles DROP CONSTRAINT IF EXISTS ck_role_approval_expires;
ALTER TABLE public.enrollment_roles ADD CONSTRAINT ck_role_approval_expires CHECK (
  approval <> 'approved' OR person_id IS NULL OR expires_at IS NOT NULL
);

/* ما يُدرَج بلا قرارٍ صريح يُكمَّل هنا. والكتابة المباشرة مسحوبةٌ من
   العموم (أدناه)، فلا يصل هذا إلا ما يكتبه الخادم نفسه: دالّة الإسناد
   (تكتب قرارها صراحةً) أو مفتاح الخدمة. */
CREATE OR REPLACE FUNCTION public.fill_enrollment_role_approval()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF NEW.approval IS NULL THEN
    NEW.approval := CASE WHEN NEW.person_id IS NULL THEN 'not_required' ELSE 'approved' END;
  END IF;
  IF NEW.approval = 'approved' AND NEW.person_id IS NOT NULL THEN
    NEW.approved_at := COALESCE(NEW.approved_at, now());
    NEW.expires_at := COALESCE(NEW.expires_at, now() + interval '365 days');
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.fill_enrollment_role_approval() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_fill_enrollment_role_approval ON public.enrollment_roles;
CREATE TRIGGER trg_fill_enrollment_role_approval
BEFORE INSERT ON public.enrollment_roles
FOR EACH ROW EXECUTE FUNCTION public.fill_enrollment_role_approval();

ALTER TABLE public.enrollment_roles ALTER COLUMN approval SET NOT NULL;

/* لا بابَ خلفيّ: سياسة `FOR ALL` كانت تسمح للجهة بإدراج «وليٍّ» لأيّ
   حسابٍ مباشرةً، وبكتابة الإذن (`consent_at`) بنفسها. فالكتابة كلّها
   تمرّ بالدوالّ: الإسناد، وقرار الإدارة، والإنهاء، والإذن. */
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.enrollment_roles FROM anon, authenticated;
DROP POLICY IF EXISTS "enrollment_roles_write" ON public.enrollment_roles;


/* من يحمل دوراً حيّاً معتمَداً لم ينقضِ أجله — وبأيّ الأدوار. */
CREATE OR REPLACE FUNCTION public.holds_live_circle_role(
  _orphan UUID, _roles public.enrollment_role[] DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.enrollment_roles r
      JOIN public.program_enrollments e ON e.id = r.enrollment_id
     WHERE e.orphan_id = _orphan
       AND r.person_id = auth.uid()
       AND r.ended_at IS NULL
       AND r.approval = 'approved'
       AND r.expires_at > now()
       AND (_roles IS NULL OR r.role = ANY(_roles))
  );
$fn$;
REVOKE ALL ON FUNCTION public.holds_live_circle_role(UUID, public.enrollment_role[])
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.in_orphan_circle(_orphan UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_admin()
    OR public.can_manage_orphan(_orphan)
    OR public.holds_live_circle_role(_orphan, NULL)
  );
$fn$;
REVOKE ALL ON FUNCTION public.in_orphan_circle(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.in_orphan_circle(UUID) TO authenticated;

/* وبوّابة التفصيل كانت تفتح لأيّ دورٍ حيّ بلا قرار — البابُ نفسه من
   طريقٍ آخر. فتمرّ بالشرط نفسه. */
CREATE OR REPLACE FUNCTION public.can_view_orphan_detail(_orphan UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_admin()
    OR public.can_manage_orphan(_orphan)
    OR public.sponsors_orphan(_orphan)
    OR public.holds_live_circle_role(_orphan, NULL)
    /* أو إذنٌ قائمٌ لم ينقضِ ولم يُسحب. */
    OR EXISTS (
      SELECT 1 FROM public.orphan_access_requests a
       WHERE a.orphan_id = _orphan
         AND a.requester_id = auth.uid()
         AND a.status = 'approved'
         AND a.expires_at > now()
    )
  );
$fn$;
REVOKE ALL ON FUNCTION public.can_view_orphan_detail(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_orphan_detail(UUID) TO authenticated;

/* ونطاق الدائرة بحسب الدور: المرشد والفقيه يرافقان البرنامج، ولا
   يحتاجان الاسمَ الحقيقي والصورة (identity) ولا المكانَ (location) ولا
   التواصل ولا الملفّ العميق (الصحّة والأسرة). ومن يدير الملفّ والوليّ
   والوصيّ والمشرف يملكون النطاقات كلّها كما كانوا. وما زاد على ذلك
   لأحدٍ بعينه فبإذن الاطّلاع من الإدارة. */
CREATE OR REPLACE FUNCTION public.circle_role_withheld_scopes()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $fn$
  SELECT ARRAY['identity', 'location', 'contact', 'profile_deep']::TEXT[];
$fn$;
REVOKE ALL ON FUNCTION public.circle_role_withheld_scopes() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.my_orphan_scopes(_orphan UUID)
RETURNS TEXT[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _grant TEXT[];
BEGIN
  IF auth.uid() IS NULL THEN RETURN '{}'::TEXT[]; END IF;

  IF public.is_admin() OR public.can_manage_orphan(_orphan)
     OR public.holds_live_circle_role(_orphan,
          ARRAY['supervisor', 'guardian', 'trustee']::public.enrollment_role[]) THEN
    RETURN (SELECT COALESCE(array_agg(a.key ORDER BY a.sort_order), '{}'::TEXT[])
              FROM public.access_scopes a WHERE a.active);
  END IF;

  _grant := COALESCE((
    SELECT r.granted_scopes FROM public.orphan_access_requests r
     WHERE r.orphan_id = _orphan AND r.requester_id = auth.uid()
       AND r.status = 'approved' AND r.expires_at > now()
     LIMIT 1), '{}'::TEXT[]);

  IF public.holds_live_circle_role(_orphan, NULL) THEN
    RETURN (SELECT COALESCE(array_agg(a.key ORDER BY a.sort_order), '{}'::TEXT[])
              FROM public.access_scopes a
             WHERE a.active
               AND (a.key <> ALL (public.circle_role_withheld_scopes()) OR a.key = ANY(_grant)));
  END IF;

  RETURN _grant;
END $fn$;
REVOKE ALL ON FUNCTION public.my_orphan_scopes(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_orphan_scopes(UUID) TO authenticated;

/* والأقسام الحسّاسة تُقرأ من الجدول مباشرةً أيضاً — فالنطاق يُفرض هنا
   كما في `orphan_profile`، وإلا التفّ المرشد عليه بنداء REST. */
DROP POLICY IF EXISTS "profile_circle_read" ON public.orphan_profile_sections;
CREATE POLICY "profile_circle_read" ON public.orphan_profile_sections
  FOR SELECT TO authenticated USING (
    public.in_orphan_circle(orphan_id)
    AND (NOT public.profile_section_is_sensitive(section)
         OR public.has_orphan_scope(orphan_id, 'profile_deep'))
  );


-- الإسناد: الجهة تُسنِد، والقرار مكتوبٌ في الصفّ، والأثر في السجلّ.
CREATE OR REPLACE FUNCTION public.assign_enrollment_role(
  _enrollment UUID,
  _role TEXT,
  _person_name TEXT DEFAULT NULL,
  _person_email TEXT DEFAULT NULL,
  _person_contact TEXT DEFAULT NULL,
  _note TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _orphan UUID; _person UUID; _id UUID; _kind public.enrollment_role;
  _approval TEXT; _by UUID; _at TIMESTAMPTZ; _exp TIMESTAMPTZ; _why TEXT; _replaced UUID[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'assign_enrollment_role: تحتاج جلسة' USING ERRCODE = '42501';
  END IF;
  _kind := _role::public.enrollment_role;

  SELECT e.orphan_id INTO _orphan FROM public.program_enrollments e WHERE e.id = _enrollment;
  IF _orphan IS NULL THEN
    RAISE EXCEPTION 'التحاق غير موجود' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.can_manage_orphan(_orphan) THEN
    RAISE EXCEPTION 'إسناد الأدوار لمن يدير الملف' USING ERRCODE = '42501';
  END IF;

  IF _person_email IS NOT NULL THEN
    SELECT u.id INTO _person FROM auth.users u
     WHERE lower(u.email) = lower(btrim(_person_email));
  END IF;

  IF _person IS NULL AND (_person_name IS NULL OR btrim(_person_name) = '') THEN
    RAISE EXCEPTION 'الدور يحتاج صاحباً: حساباً معروفاً أو اسماً موثَّقاً'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _person IS NULL THEN
    _approval := 'not_required';
  ELSIF public.is_admin() THEN
    _approval := 'approved'; _by := auth.uid(); _at := now();
    _exp := now() + interval '365 days'; _why := 'assigned_by_admin';
  ELSIF _kind = 'supervisor' THEN
    -- الحارس يرفض غير المعتمَد؛ فاعتماد الإدارة له هو القرار.
    _approval := 'approved'; _at := now();
    _exp := now() + interval '365 days'; _why := 'certified_supervisor';
  ELSE
    _approval := 'pending';
  END IF;

  -- الدور الحيّ السابق من النوع نفسه يُنهى لا يُحذف: التاريخ يبقى.
  WITH ended AS (
    UPDATE public.enrollment_roles
       SET ended_at = now()
     WHERE enrollment_id = _enrollment AND role = _kind AND ended_at IS NULL
    RETURNING id
  ) SELECT array_agg(id) INTO _replaced FROM ended;

  INSERT INTO public.enrollment_roles
    (enrollment_id, role, person_id, person_name, person_contact, assigned_by, note,
     approval, approved_by, approved_at, expires_at, decision_note)
  VALUES (_enrollment, _kind, _person,
          NULLIF(btrim(COALESCE(_person_name, '')), ''), _person_contact, auth.uid(), _note,
          _approval, _by, _at, _exp, _why)
  RETURNING id INTO _id;

  PERFORM public.write_audit('enrollment_role.assigned', 'enrollment_role', _id,
    jsonb_build_object('orphan_id', _orphan, 'enrollment_id', _enrollment, 'role', _kind,
                       'has_account', _person IS NOT NULL, 'approval', _approval,
                       'expires_at', _exp, 'replaced', to_jsonb(_replaced)));

  RETURN _id;
END $fn$;
REVOKE ALL ON FUNCTION public.assign_enrollment_role(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_enrollment_role(UUID, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO authenticated;


-- قرار الإدارة: اعتمادٌ لأجلٍ (أو تجديده)، أو رفضٌ يُنهي الدور.
CREATE OR REPLACE FUNCTION public.decide_enrollment_role(
  _role UUID, _decision TEXT, _days INTEGER DEFAULT 365, _note TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _r public.enrollment_roles; _orphan UUID; _exp TIMESTAMPTZ;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'إدخال أحدٍ دائرةَ الطفل قرارٌ للإدارة وحدها' USING ERRCODE = '42501';
  END IF;
  IF _decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'القرار إمّا قبولٌ أو رفض' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _r FROM public.enrollment_roles WHERE id = _role FOR UPDATE;
  IF _r.id IS NULL OR _r.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'لا دورَ حيّاً بهذا المعرّف' USING ERRCODE = 'no_data_found';
  END IF;
  IF _r.person_id IS NULL THEN
    RAISE EXCEPTION 'دورٌ بلا حساب لا يفتح شيئاً، فلا قرار فيه' USING ERRCODE = 'check_violation';
  END IF;
  SELECT e.orphan_id INTO _orphan FROM public.program_enrollments e WHERE e.id = _r.enrollment_id;

  IF _decision = 'approved' THEN
    _exp := now() + make_interval(days => GREATEST(LEAST(COALESCE(_days, 365), 365), 1));
    UPDATE public.enrollment_roles
       SET approval = 'approved', approved_by = auth.uid(), approved_at = now(),
           expires_at = _exp, decision_note = NULLIF(btrim(COALESCE(_note, '')), '')
     WHERE id = _role;
  ELSE
    UPDATE public.enrollment_roles
       SET approval = 'rejected', approved_by = auth.uid(), approved_at = now(),
           ended_at = now(), decision_note = NULLIF(btrim(COALESCE(_note, '')), '')
     WHERE id = _role;
  END IF;

  PERFORM public.write_audit('enrollment_role.' || _decision, 'enrollment_role', _role,
    jsonb_build_object('orphan_id', _orphan, 'role', _r.role, 'person_id', _r.person_id,
                       'expires_at', _exp, 'note', _note, 'was', _r.approval));

  RETURN jsonb_build_object('approval', _decision, 'expires_at', _exp);
END $fn$;
REVOKE ALL ON FUNCTION public.decide_enrollment_role(UUID, TEXT, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_enrollment_role(UUID, TEXT, INTEGER, TEXT)
  TO authenticated;


-- الإنهاء: لمن يدير الملفّ، أو للإدارة، أو لصاحب الدور يتنحّى — وبأثر.
CREATE OR REPLACE FUNCTION public.end_enrollment_role(_role UUID, _note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _r public.enrollment_roles; _orphan UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'end_enrollment_role: تحتاج جلسة' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _r FROM public.enrollment_roles WHERE id = _role;
  SELECT e.orphan_id INTO _orphan FROM public.program_enrollments e WHERE e.id = _r.enrollment_id;
  IF _r.id IS NULL
     OR NOT (public.is_admin() OR public.can_manage_orphan(_orphan) OR _r.person_id = auth.uid()) THEN
    RAISE EXCEPTION 'إنهاء الدور لمن يدير الملفّ أو لصاحبه' USING ERRCODE = '42501';
  END IF;
  IF _r.ended_at IS NOT NULL THEN RETURN; END IF;

  UPDATE public.enrollment_roles SET ended_at = now() WHERE id = _role;
  PERFORM public.write_audit('enrollment_role.ended', 'enrollment_role', _role,
    jsonb_build_object('orphan_id', _orphan, 'role', _r.role, 'person_id', _r.person_id,
                       'note', NULLIF(btrim(COALESCE(_note, '')), '')));
END $fn$;
REVOKE ALL ON FUNCTION public.end_enrollment_role(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_enrollment_role(UUID, TEXT) TO authenticated;


/* إذن الالتحاق: الجهة توثّق إذن وليٍّ بلا حساب (ورقةٌ موقّعة). أمّا وليٌّ
   له حساب فيوافق بنفسه (`guardian_consent_enrollment`) — كتابةُ الجهة
   إذنَه نيابةً عنه هي التزوير الذي وجده التدقيق. */
CREATE OR REPLACE FUNCTION public.record_enrollment_consent(
  _role_id UUID, _document TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _orphan UUID; _r public.enrollment_roles;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'record_enrollment_consent: تحتاج جلسة' USING ERRCODE = '42501';
  END IF;
  IF _document IS NULL OR btrim(_document) = '' THEN
    RAISE EXCEPTION 'الإذن يحتاج وثيقةً تُثبته' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _r FROM public.enrollment_roles WHERE id = _role_id;
  SELECT e.orphan_id INTO _orphan FROM public.program_enrollments e WHERE e.id = _r.enrollment_id;

  IF _orphan IS NULL THEN
    RAISE EXCEPTION 'دور غير موجود' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.can_manage_orphan(_orphan) THEN
    RAISE EXCEPTION 'توثيق الإذن لمن يدير الملف' USING ERRCODE = '42501';
  END IF;
  IF _r.role NOT IN ('guardian', 'trustee') THEN
    RAISE EXCEPTION 'الإذن للولي أو الوصي، لا لدورٍ آخر' USING ERRCODE = 'check_violation';
  END IF;
  IF _r.person_id IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'الوليّ صاحب الحساب يوافق بنفسه من مساحته' USING ERRCODE = '42501';
  END IF;

  UPDATE public.enrollment_roles
     SET consent_at = now(), consent_document = btrim(_document)
   WHERE id = _role_id AND ended_at IS NULL;

  PERFORM public.write_audit('enrollment_role.consent_recorded', 'enrollment_role', _role_id,
    jsonb_build_object('orphan_id', _orphan, 'role', _r.role, 'document', btrim(_document)));
END $fn$;
REVOKE ALL ON FUNCTION public.record_enrollment_consent(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_enrollment_consent(UUID, TEXT) TO authenticated;


-- وموافقة الوليّ بضغطة: لصاحب دورٍ اعتمدته الإدارة ولم ينقضِ أجله.
CREATE OR REPLACE FUNCTION public.guardian_consent_enrollment(_role UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _r public.enrollment_roles; _orphan UUID; _id UUID;
BEGIN
  SELECT * INTO _r FROM public.enrollment_roles WHERE id = _role;
  IF _r.id IS NULL OR _r.person_id IS DISTINCT FROM auth.uid() OR _r.role NOT IN ('guardian', 'trustee')
     OR _r.ended_at IS NOT NULL OR _r.approval <> 'approved' OR _r.expires_at <= now() THEN
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
                           AND r.approval = 'approved' AND r.expires_at > now()
                           AND r.person_id = auth.uid()), '[]'::jsonb)
  ) ORDER BY o.created_at DESC), '[]'::jsonb)
  FROM public.orphans o
  WHERE o.guardian_id = auth.uid() AND auth.uid() IS NOT NULL;
$fn$;
REVOKE ALL ON FUNCTION public.guardian_children_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardian_children_overview() TO authenticated;


-- وصورة الالتحاق تحمل حال القرار وأجله، فترى الجهة ما ينتظر الإدارة.
CREATE OR REPLACE FUNCTION public.enrollment_detail(_enrollment UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $fn$
  SELECT jsonb_build_object(
    'enrollment_id', e.id,
    'orphan_id', e.orphan_id,
    'program', p.title,
    'kind', p.kind,
    'stage', e.stage,
    'stage_order', public.stage_order(e.stage),
    'status', e.status,
    'is_supervisor', public.enrollment_supervisor(e.id) = auth.uid(),
    'roles', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', r.id,
        'role', r.role,
        'person_name', r.person_name,
        'person_contact', r.person_contact,
        'has_account', r.person_id IS NOT NULL,
        'consent_at', r.consent_at,
        'consent_document', r.consent_document,
        'assigned_at', r.assigned_at,
        'approval', r.approval,
        'expires_at', r.expires_at
      ) ORDER BY r.role), '[]'::jsonb)
      FROM public.enrollment_roles r
      WHERE r.enrollment_id = e.id AND r.ended_at IS NULL
    ),
    'assessments', public.enrollment_assessments(e.id),
    'units', public.enrollment_unit_progress(e.id)
  )
  FROM public.program_enrollments e
  JOIN public.programs p ON p.id = e.program_id
  WHERE e.id = _enrollment;
$fn$;
REVOKE ALL ON FUNCTION public.enrollment_detail(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enrollment_detail(UUID) TO authenticated;


/* تغيير الوليّ — من أيّ طريق — يُسجَّل بفاعله. والجهة لا تكتبه أصلاً
   (حارس التحديث أدناه)؛ هو للإدارة بقرارٍ يبقى أثره. */
CREATE OR REPLACE FUNCTION public.audit_orphan_guardian_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.guardian_id IS DISTINCT FROM OLD.guardian_id THEN
    INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
    VALUES (auth.uid(), 'orphan.guardian_changed', 'orphan', NEW.id,
            jsonb_build_object('from', OLD.guardian_id, 'to', NEW.guardian_id,
                               'via', public.request_channel()));
  END IF;
  RETURN NULL;
END $fn$;


-- ---------------------------------------------------------------------
-- قناة الطلب — يحملها كلّ أثرٍ يكتبه مشغّل
-- ---------------------------------------------------------------------
-- `auth.uid()` فارغٌ لمفتاح الخدمة. فالأثر يقول أيضاً من أين جاء:
-- جلسة مستخدم، أو مفتاح الخدمة (الخادم، webhook)، أو القاعدة نفسها.
--
-- و«طلب من مستخدم» يُعرف بالدور الذي ضبطه PostgREST للطلب (`SET LOCAL
-- ROLE authenticated`) لا بـ`current_user`: داخل دالّةٍ `SECURITY DEFINER`
-- يصير `current_user` مالكَها، أمّا إعداد الدور فيبقى دورَ الطلب.
CREATE OR REPLACE FUNCTION public.request_is_client()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE(current_setting('role', true), '') IN ('authenticated', 'anon');
$fn$;
REVOKE ALL ON FUNCTION public.request_is_client() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_channel()
RETURNS TEXT LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT CASE
    WHEN public.request_is_service() THEN 'service'
    WHEN auth.uid() IS NOT NULL THEN 'session'
    ELSE 'database' END;
$fn$;
REVOKE ALL ON FUNCTION public.request_channel() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_orphan_guardian_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_orphan_guardian ON public.orphans;
CREATE TRIGGER trg_audit_orphan_guardian
AFTER UPDATE OF guardian_id ON public.orphans
FOR EACH ROW EXECUTE FUNCTION public.audit_orphan_guardian_change();


-- ---------------------------------------------------------------------
-- ٢) CP-02 + DB-01 — الموافقة والمراجعة لا تكتبهما الجهة بيدها
-- ---------------------------------------------------------------------
-- حارس التحديث كان لا يرى `photo_consent*` ولا `reviewed_*` ولا
-- `guardian_id`. فصارت الجهة تكتب «وافق الوليّ» و«راجعت الإدارة» بنفسها.
-- الآن: هذه كلّها لا تُكتب مباشرةً من غير الإدارة؛ والموافقة تمرّ بـ
-- `record_photo_consent` (الجهة بوثيقةٍ موثَّقة) أو `guardian_set_photo_consent`
-- (الوليّ نفسه). والصورة من خزنة المنصّة وحدها.

/* الصورة مسارٌ في خزنة الوسائط العامّة داخل مجلّد الطفل نفسه — مساراً
   مجرّداً أو رابطَ Supabase العامّ إليه. رابطٌ من نطاقٍ آخر يتتبّع من
   يفتح صفحة الطفل. */
CREATE OR REPLACE FUNCTION public.photo_url_is_platform(_orphan UUID, _url TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $fn$
  SELECT _url IS NOT NULL AND position('..' IN _url) = 0 AND (
    _url ~ ('^' || _orphan::text || '/[A-Za-z0-9._-]+$')
    OR _url ~ ('^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/public-media/'
               || _orphan::text || '/[A-Za-z0-9._-]+$')
  );
$fn$;
REVOKE ALL ON FUNCTION public.photo_url_is_platform(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.photo_url_is_platform(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_orphan_insert()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN RETURN NEW; END IF;

  NEW.created_by      := auth.uid();
  NEW.funded_monthly  := 0;
  NEW.approved_at     := NULL;
  NEW.rejection_reason := NULL;
  NEW.rejection_code  := NULL;
  NEW.reviewed_by     := NULL;
  NEW.reviewed_at     := NULL;
  NEW.external_ref    := NULL;
  NEW.external_source := NULL;
  NEW.external_deleted_at := NULL;
  -- الوليّ والموافقة والصورة لا تأتي مع الملفّ: لها طرقها المحروسة.
  NEW.guardian_id       := NULL;
  NEW.photo_consent     := 'none';
  NEW.photo_consent_at  := NULL;
  NEW.photo_consent_by  := NULL;
  NEW.photo_consent_doc := NULL;
  NEW.photo_url         := NULL;

  -- الجهة تنشئ مسودة أو ترسل للمراجعة؛ لا أكثر.
  IF NEW.status NOT IN ('draft', 'submitted') THEN
    NEW.status := 'draft';
  END IF;

  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_orphan_insert() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_orphan_update()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- يسمح لـ recalc_orphan_funding() بالمرور (مُشغّل متداخل).
  IF pg_trigger_depth() > 1 OR current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF NEW.funded_monthly IS DISTINCT FROM OLD.funded_monthly THEN
    RAISE EXCEPTION 'orphan: funded_monthly is trigger-managed'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.rejection_code IS DISTINCT FROM OLD.rejection_code
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
    RAISE EXCEPTION 'orphan: review fields are admin-only'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.external_ref IS DISTINCT FROM OLD.external_ref
     OR NEW.external_source IS DISTINCT FROM OLD.external_source
     OR NEW.external_deleted_at IS DISTINCT FROM OLD.external_deleted_at THEN
    RAISE EXCEPTION 'orphan: external reference is integration-only'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.code IS DISTINCT FROM OLD.code
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'orphan: identity fields are immutable'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.guardian_id IS DISTINCT FROM OLD.guardian_id THEN
    RAISE EXCEPTION 'orphan: the guardian is set by the administration'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.photo_consent IS DISTINCT FROM OLD.photo_consent
     OR NEW.photo_consent_at IS DISTINCT FROM OLD.photo_consent_at
     OR NEW.photo_consent_by IS DISTINCT FROM OLD.photo_consent_by
     OR NEW.photo_consent_doc IS DISTINCT FROM OLD.photo_consent_doc THEN
    RAISE EXCEPTION 'orphan: photo consent is recorded through record_photo_consent'
      USING ERRCODE = '42501';
  END IF;
  IF NULLIF(NEW.photo_url, '') IS NOT NULL
     AND NEW.photo_url IS DISTINCT FROM OLD.photo_url
     AND NOT public.photo_url_is_platform(NEW.id, NEW.photo_url) THEN
    RAISE EXCEPTION 'orphan: the photo must live in the platform media storage'
      USING ERRCODE = '42501';
  END IF;

  -- الاعتماد والرفض والأرشفة للإدارة وحدها.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.status IN ('draft', 'rejected') AND NEW.status = 'submitted') THEN
    RAISE EXCEPTION 'orphan: status transition is admin-only'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_orphan_update() FROM PUBLIC, anon, authenticated;


/* الطريق الوحيد لتسجيل موافقة الصورة من غير الوليّ نفسه.
   - الوثيقة معرّفُ وثيقةٍ في ملفّ الطفل من نوع «إقرار الموافقة على الصورة»
     **وثّقتها الإدارة** — لا نصٌّ حرّ يكتبه من شاء.
   - وسحبُ الوليّ ملزِم: إن كان آخر قرارٍ للوليّ على الصورة سحباً، فلا
     تعيدها الجهة؛ يعيدها الوليّ نفسه بموافقةٍ جديدة، أو الإدارة بقرارٍ
     مسجَّل.
   - والفاعل من الجلسة (`auth.uid()`)، لا من الطلب. */
CREATE OR REPLACE FUNCTION public.record_photo_consent(
  _orphan UUID, _state TEXT, _document UUID DEFAULT NULL, _photo_url TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _admin BOOLEAN := public.is_admin(); _st public.photo_consent_state;
  _last TEXT; _doc public.orphan_documents; _url TEXT := NULLIF(btrim(COALESCE(_photo_url, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT (_admin OR public.can_manage_orphan(_orphan)) THEN
    RAISE EXCEPTION 'موافقة الصورة لمن يدير الملفّ' USING ERRCODE = '42501';
  END IF;
  IF _state NOT IN ('none', 'face_hidden', 'granted', 'withdrawn') THEN
    RAISE EXCEPTION 'حالة موافقةٍ غير معروفة' USING ERRCODE = 'check_violation';
  END IF;
  _st := _state::public.photo_consent_state;

  IF _st IN ('granted', 'face_hidden') THEN
    SELECT g.decision INTO _last FROM public.guardian_e_consents g
     WHERE g.orphan_id = _orphan AND g.subject = 'photo'
     ORDER BY g.created_at DESC LIMIT 1;
    IF _last = 'withdrawn' AND NOT _admin THEN
      RAISE EXCEPTION 'سحب الوليّ موافقته؛ لا يعيدها إلا هو أو الإدارة'
        USING ERRCODE = '42501';
    END IF;

    IF _document IS NOT NULL THEN
      SELECT * INTO _doc FROM public.orphan_documents d
       WHERE d.id = _document AND d.orphan_id = _orphan AND d.kind = 'photo_consent';
      IF _doc.id IS NULL OR NOT _doc.verified THEN
        RAISE EXCEPTION 'الوثيقة إقرارُ موافقةٍ في ملفّ هذا الطفل وثّقته الإدارة'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF _st = 'granted' THEN
      RAISE EXCEPTION 'الصورة الكاملة تحتاج إقرار موافقةٍ موثَّقاً' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF _url IS NOT NULL THEN
    RAISE EXCEPTION 'لا صورة بلا موافقة' USING ERRCODE = 'check_violation';
  END IF;

  IF _url IS NOT NULL AND NOT public.photo_url_is_platform(_orphan, _url) THEN
    RAISE EXCEPTION 'الصورة من خزنة المنصّة وحدها' USING ERRCODE = '42501';
  END IF;

  UPDATE public.orphans SET
    photo_consent = _st,
    photo_consent_at = CASE WHEN _st = 'none' THEN NULL ELSE now() END,
    photo_consent_by = auth.uid(),
    photo_consent_doc = CASE WHEN _document IS NOT NULL AND _st IN ('granted', 'face_hidden')
                             THEN 'doc:' || _document END,
    photo_url = CASE WHEN _st IN ('none', 'withdrawn') THEN NULL ELSE COALESCE(_url, photo_url) END
  WHERE id = _orphan;

  PERFORM public.write_audit('orphan.photo_consent', 'orphan', _orphan,
    jsonb_build_object('state', _st, 'document', _document, 'photo_changed', _url IS NOT NULL,
                       'over_guardian_withdrawal', COALESCE(_last = 'withdrawn', false)));
END $fn$;
REVOKE ALL ON FUNCTION public.record_photo_consent(UUID, TEXT, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_photo_consent(UUID, TEXT, UUID, TEXT) TO authenticated;


-- ---------------------------------------------------------------------
-- ٣) CP-06 — لا نشر بلا شهادة وفاةٍ وإثبات وصايةٍ وثّقتهما الإدارة
-- ---------------------------------------------------------------------
-- هذا ما تَعِد به الأسئلة الشائعة حرفياً: «كل ملف … معه شهادة وفاة
-- وإثبات وصاية على الأقل، والإدارة تفتح كل وثيقة وتوثّقها قبل النشر».
-- والشرط في القاعدة لا في الزرّ: في `review_orphan`، وفي مُشغّلٍ يحرس
-- الاعتماد المباشر بالجدول من جلسةٍ أو مفتاح خدمة.
CREATE OR REPLACE FUNCTION public.orphan_missing_publication_docs(_orphan UUID)
RETURNS TEXT[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(array_agg(k ORDER BY k), '{}'::TEXT[])
    FROM unnest(ARRAY['death_certificate', 'guardianship_proof']) k
   WHERE NOT EXISTS (
     SELECT 1 FROM public.orphan_documents d
      WHERE d.orphan_id = _orphan AND d.kind::text = k AND d.verified);
$fn$;
REVOKE ALL ON FUNCTION public.orphan_missing_publication_docs(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_orphan_publication()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _missing TEXT[];
BEGIN
  IF NEW.status NOT IN ('approved', 'fully_sponsored')
     OR (TG_OP = 'UPDATE' AND OLD.status IN ('approved', 'fully_sponsored')) THEN
    RETURN NEW;
  END IF;
  -- طلبٌ من الخارج: جلسة مستخدمٍ (الإدارة بنداء REST) أو مفتاح الخدمة.
  -- وما يكتبه المالك من القاعدة نفسها (هجرة، صيانة) لا يمرّ هنا.
  IF NOT (public.request_is_client() OR public.request_is_service()) THEN
    RETURN NEW;
  END IF;
  _missing := public.orphan_missing_publication_docs(NEW.id);
  IF cardinality(_missing) > 0 THEN
    RAISE EXCEPTION 'orphan: publication requires verified documents (%)', array_to_string(_missing, ', ')
      USING ERRCODE = 'check_violation',
            HINT = 'لا يُنشر ملفٌّ قبل توثيق شهادة الوفاة وإثبات الوصاية.';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.guard_orphan_publication() FROM PUBLIC, anon, authenticated;

-- الاسم يرتّبه بعد حارسَي الإدراج والتحديث (`trg_guard_orphan_*`): الجهة
-- التي تعتمد ملفّها تُردّ لأنها ليست الإدارة، قبل أن يُسأل عن الوثائق.
DROP TRIGGER IF EXISTS trg_require_publication_documents ON public.orphans;
CREATE TRIGGER trg_require_publication_documents
BEFORE INSERT OR UPDATE OF status ON public.orphans
FOR EACH ROW EXECUTE FUNCTION public.guard_orphan_publication();

CREATE OR REPLACE FUNCTION public.review_orphan(
  _id UUID, _decision TEXT, _code public.rejection_code DEFAULT NULL, _reason TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _prev public.orphan_status; _owner UUID; _name TEXT; _missing TEXT[]; _funded BOOLEAN;
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

  SELECT status, display_name, (monthly_need > 0 AND funded_monthly >= monthly_need)
    INTO _prev, _name, _funded
    FROM public.orphans WHERE id = _id;
  IF _prev IS NULL THEN
    RAISE EXCEPTION 'review_orphan: no orphan %', _id USING ERRCODE = 'P0002';
  END IF;

  IF _decision = 'approved' THEN
    _missing := public.orphan_missing_publication_docs(_id);
    IF cardinality(_missing) > 0 THEN
      RAISE EXCEPTION 'review_orphan: documents not verified (%)', array_to_string(_missing, ', ')
        USING ERRCODE = 'check_violation',
              HINT = 'وثّق شهادة الوفاة وإثبات الوصاية قبل الاعتماد.';
    END IF;
  END IF;

  /* والطفل الذي اكتمل تمويله وأُعيد للمراجعة بعد تعديلٍ يعود «مكفولاً
     بالكامل» لا «معتمَداً» — دالّة التمويل لا تمسّ حالةً خارج النشر. */
  UPDATE public.orphans SET
    status = CASE WHEN _decision = 'approved' AND COALESCE(_funded, false)
                  THEN 'fully_sponsored'::public.orphan_status
                  ELSE _decision::public.orphan_status END,
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


-- ---------------------------------------------------------------------
-- ٤) DB-07 + CP-10 — ما عُدِّل بعد الاعتماد يعود للمراجعة ويغيب عن العموم
-- ---------------------------------------------------------------------
-- اختير «الإعادة للمراجعة» لا «المنع»: الجهة تصحّح خطأً حقيقياً في قصّةٍ
-- أو مدينة، فلا يُغلق عليها الباب — لكنّ النصّ الجديد لا يصل أحداً قبل أن
-- تراه الإدارة. والملفّ يغيب عن الدليل والصفحة والكفالة الجديدة حتى يُعاد
-- اعتماده؛ والكفالات القائمة باقيةٌ كما هي.
--
-- يسري على جلسات المستخدمين (الجهة والوليّ) وعلى مفتاح الخدمة (المرآة)،
-- لا على الإدارة. والطفل المقفول (المكفول) يمسك حارسُه هويتَه أصلاً؛ وما
-- تبقّى (القصّة والمدينة والصورة) يعود للمراجعة هنا.
-- وحذف الطفل في المصدر (`external_deleted_at`) كذلك: يُسحب من النشر حتى
-- تقرّر الإدارة، لا يبقى معروضاً قابلاً للكفالة.
CREATE OR REPLACE FUNCTION public.resubmit_on_public_edit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _changed TEXT[] := '{}';
BEGIN
  IF pg_trigger_depth() > 1 OR OLD.status NOT IN ('approved', 'fully_sponsored')
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() OR NOT (public.request_is_client() OR public.request_is_service()) THEN
    RETURN NEW;
  END IF;

  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN _changed := _changed || 'display_name'::TEXT; END IF;
  IF NEW.story IS DISTINCT FROM OLD.story THEN _changed := _changed || 'story'::TEXT; END IF;
  IF NEW.city IS DISTINCT FROM OLD.city THEN _changed := _changed || 'city'::TEXT; END IF;
  IF NEW.region IS DISTINCT FROM OLD.region THEN _changed := _changed || 'region'::TEXT; END IF;
  IF NEW.country IS DISTINCT FROM OLD.country THEN _changed := _changed || 'country'::TEXT; END IF;
  IF NEW.birth_date IS DISTINCT FROM OLD.birth_date THEN _changed := _changed || 'birth_date'::TEXT; END IF;
  IF NEW.gender IS DISTINCT FROM OLD.gender THEN _changed := _changed || 'gender'::TEXT; END IF;
  -- إزالة الصورة تقليلٌ لا يحتاج مراجعة؛ صورةٌ جديدة تحتاجها.
  IF NULLIF(NEW.photo_url, '') IS NOT NULL AND NEW.photo_url IS DISTINCT FROM OLD.photo_url THEN
    _changed := _changed || 'photo_url'::TEXT;
  END IF;
  IF OLD.external_deleted_at IS NULL AND NEW.external_deleted_at IS NOT NULL THEN
    _changed := _changed || 'external_deleted_at'::TEXT;
  END IF;

  IF cardinality(_changed) = 0 THEN RETURN NEW; END IF;

  NEW.status := 'submitted';
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'orphan.sent_back_to_review', 'orphan', NEW.id,
          jsonb_build_object('fields', to_jsonb(_changed), 'from', OLD.status,
                             'via', public.request_channel()));
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.resubmit_on_public_edit() FROM PUBLIC, anon, authenticated;

-- الاسم يرتّبه بعد حارسَي القفل والتحديث (`guard_locked_orphan`،
-- `trg_guard_orphan_update`): يُفحص طلب المستخدم أولاً كما أرسله.
DROP TRIGGER IF EXISTS trg_resubmit_on_public_edit ON public.orphans;
CREATE TRIGGER trg_resubmit_on_public_edit
BEFORE UPDATE ON public.orphans
FOR EACH ROW EXECUTE FUNCTION public.resubmit_on_public_edit();


/* والتقرير الدوري: تعديل تقريرٍ معتمد يعيده «مرفوعاً» ويُسقط نشره، فلا
   يصل الكافلَ نصٌّ لم تره الإدارة. */
CREATE OR REPLACE FUNCTION public.guard_report_write()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 OR current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by  := auth.uid();
    NEW.status      := 'submitted';
    NEW.review_note := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.published_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'report: review decision is admin-only'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.review_note IS DISTINCT FROM OLD.review_note
     OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.published_at IS DISTINCT FROM OLD.published_at THEN
    RAISE EXCEPTION 'report: review fields are admin-only'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.orphan_id IS DISTINCT FROM OLD.orphan_id THEN
    RAISE EXCEPTION 'report: orphan_id is immutable'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status = 'approved'
     AND (NEW.summary IS DISTINCT FROM OLD.summary
          OR NEW.education_note IS DISTINCT FROM OLD.education_note
          OR NEW.health_note IS DISTINCT FROM OLD.health_note
          OR NEW.living_note IS DISTINCT FROM OLD.living_note
          OR NEW.period IS DISTINCT FROM OLD.period
          OR NEW.attachment_url IS DISTINCT FROM OLD.attachment_url
          OR NEW.attachments IS DISTINCT FROM OLD.attachments) THEN
    NEW.status := 'submitted';
    NEW.published_at := NULL;
    PERFORM public.write_audit('report.sent_back_to_review', 'progress_report', NEW.id,
      jsonb_build_object('orphan_id', NEW.orphan_id, 'period', NEW.period));
  END IF;

  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_report_write() FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- ٥) GAP-03 — المال الذي تحرّكه الإدارة يترك أثراً
-- ---------------------------------------------------------------------
-- المصادقة الثنائية للإدارة إعدادٌ في المنصّة لا في القاعدة (موثَّقٌ في
-- تقرير المرحلة). وهنا الجزء الذي في القاعدة: تفعيلُ كفالةٍ أو تغييرُ
-- حالها، وإنشاءُ صرفٍ أو تعديلُه أو حذفُه — من أيّ طريقٍ جاء (نداء REST
-- من الإدارة، دالّة، مفتاح الخدمة) — يُكتب في `audit_log` بفاعله وقناته.
-- مُشغّلٌ لا دالّة: الكتابة المباشرة هي بالضبط ما كان بلا أثر.
CREATE OR REPLACE FUNCTION public.audit_sponsorship_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pending_payment' THEN RETURN NULL; END IF;
    INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
    VALUES (auth.uid(), 'sponsorship.created', 'sponsorship', NEW.id,
            jsonb_build_object('status', NEW.status, 'orphan_id', NEW.orphan_id,
                               'amount', NEW.amount, 'currency', NEW.currency,
                               'as_admin', public.is_admin(), 'via', public.request_channel()));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
    VALUES (auth.uid(), 'sponsorship.status_changed', 'sponsorship', NEW.id,
            jsonb_build_object('from', OLD.status, 'to', NEW.status, 'orphan_id', NEW.orphan_id,
                               'amount', NEW.amount, 'currency', NEW.currency,
                               'as_admin', public.is_admin(), 'via', public.request_channel()));
  END IF;
  RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION public.audit_sponsorship_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_sponsorship_status ON public.sponsorships;
CREATE TRIGGER trg_audit_sponsorship_status
AFTER INSERT OR UPDATE OF status ON public.sponsorships
FOR EACH ROW EXECUTE FUNCTION public.audit_sponsorship_status();

CREATE OR REPLACE FUNCTION public.audit_disbursement_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _changes JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
    VALUES (auth.uid(), 'disbursement.created', 'disbursement', NEW.id,
            jsonb_build_object('row', to_jsonb(NEW), 'as_admin', public.is_admin(),
                               'via', public.request_channel()));
    RETURN NULL;
  END IF;
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
    VALUES (auth.uid(), 'disbursement.deleted', 'disbursement', OLD.id,
            jsonb_build_object('row', to_jsonb(OLD), 'as_admin', public.is_admin(),
                               'via', public.request_channel()));
    RETURN NULL;
  END IF;

  SELECT jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
    INTO _changes
    FROM jsonb_each(to_jsonb(NEW)) n
    JOIN jsonb_each(to_jsonb(OLD)) o USING (key)
   WHERE n.value IS DISTINCT FROM o.value;
  IF _changes IS NOT NULL THEN
    INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
    VALUES (auth.uid(), 'disbursement.updated', 'disbursement', NEW.id,
            jsonb_build_object('changes', _changes, 'orphan_id', NEW.orphan_id,
                               'as_admin', public.is_admin(), 'via', public.request_channel()));
  END IF;
  RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION public.audit_disbursement_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_disbursement_write ON public.disbursements;
CREATE TRIGGER trg_audit_disbursement_write
AFTER INSERT OR UPDATE OR DELETE ON public.disbursements
FOR EACH ROW EXECUTE FUNCTION public.audit_disbursement_write();


-- ---------------------------------------------------------------------
-- ٦) DB-05 — الإثبات ملفٌّ موجود، وما وُثِّق لا يُستبدل ولا يُحذف
-- ---------------------------------------------------------------------
-- الجهة التي تؤكّد الوصول هي التي توصِل، فالإثبات إقرارٌ منها بطبيعته
-- (ولا يدّعي هذا الإصلاح غير ذلك). لكن إقراراً بملفٍّ غير موجود ليس
-- إقراراً، وإثباتاً يُبدَّل بعد أن رآه الكافل والمدقّق ليس إثباتاً. فـ:
--   - التأكيد يشترط وجود الملفّ في الخزنة، ويحفظ بصمته (eTag).
--   - والملفّ بعد التأكيد مجمَّد في الخزنة، ومثله كلّ وثيقةٍ وثّقتها
--     الإدارة ومرفقات التقرير المعتمد: لا استبدال ولا نقل ولا حذف.
--   - والوثيقة الموثَّقة لا يتغيّر مسارها ولا اسمها ولا نوعها؛ ومن أراد
--     تغييرها فالإدارة تُلغي توثيقها أولاً (`verify_document` بأثر).
ALTER TABLE public.disbursements
  ADD COLUMN IF NOT EXISTS delivery_proof_object UUID,
  ADD COLUMN IF NOT EXISTS delivery_proof_etag TEXT;

CREATE OR REPLACE FUNCTION public.confirm_disbursement_delivery(
  _disbursement UUID, _proof_path TEXT, _note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _d public.disbursements; _u UUID; _obj UUID; _etag TEXT;
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

  -- والمستند موجودٌ فعلاً — لا مسارٌ يُكتب ولا ملفّ وراءه.
  SELECT o.id, o.metadata->>'eTag' INTO _obj, _etag
    FROM storage.objects o
   WHERE o.bucket_id = 'orphan-documents' AND o.name = _proof_path;
  IF _obj IS NULL THEN
    RAISE EXCEPTION 'proof_missing' USING ERRCODE = 'no_data_found',
      HINT = 'ارفع مستند الوصول أولاً ثم أكّد.';
  END IF;

  UPDATE public.disbursements
     SET status = 'delivered', delivered_at = now(),
         delivery_proof_path = _proof_path, delivery_note = NULLIF(btrim(_note), ''),
         delivery_proof_object = _obj, delivery_proof_etag = _etag
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

/* `confirm_disbursement_delivery` تقرأ `storage.objects` بصفة مالكها
   (postgres). على Supabase يتجاوز postgres سياسات الصفوف؛ وهذه السياسة
   تضمن القراءة لو لم يتجاوزها، فلا يصير كلُّ تأكيدٍ «مستنداً مفقوداً». */
DROP POLICY IF EXISTS "orphan_docs_owner_read" ON storage.objects;
CREATE POLICY "orphan_docs_owner_read" ON storage.objects FOR SELECT TO postgres
  USING (bucket_id = 'orphan-documents');

/* هل هذا الملفّ في الخزنة شاهدٌ لا يُمسّ؟ */
CREATE OR REPLACE FUNCTION public.orphan_object_is_frozen(_bucket TEXT, _name TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT _bucket = 'orphan-documents' AND (
    EXISTS (SELECT 1 FROM public.orphan_documents d
             WHERE d.storage_path = _name AND d.verified)
    OR EXISTS (SELECT 1 FROM public.disbursements x
                WHERE x.delivery_proof_path = _name AND x.status = 'delivered')
    OR EXISTS (SELECT 1 FROM public.progress_reports r
                WHERE r.status = 'approved' AND _name = ANY(r.attachments))
  );
$fn$;
REVOKE ALL ON FUNCTION public.orphan_object_is_frozen(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orphan_object_is_frozen(TEXT, TEXT) TO authenticated;

/* سياسة التحديث القديمة (`orphan_docs_update`) كانت تسمح لمن يدير
   الملفّ بالكتابة فوق أيّ ملفّ — والحذف كذلك. الآن ما وُثِّق مجمَّد. */
DROP POLICY IF EXISTS "orphan_docs_update" ON storage.objects;
CREATE POLICY "orphan_docs_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'orphan-documents' AND public.can_reach_orphan_folder(name)
         AND NOT public.orphan_object_is_frozen(bucket_id, name))
  WITH CHECK (bucket_id = 'orphan-documents' AND public.can_reach_orphan_folder(name)
              AND NOT public.orphan_object_is_frozen(bucket_id, name));

DROP POLICY IF EXISTS "orphan_docs_delete" ON storage.objects;
CREATE POLICY "orphan_docs_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'orphan-documents' AND public.can_reach_orphan_folder(name)
         AND NOT public.orphan_object_is_frozen(bucket_id, name));

CREATE OR REPLACE FUNCTION public.guard_document_verification()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  /* الوثيقة الموثَّقة مجمَّدة على الجميع — الإدارة ومفتاح الخدمة أيضاً:
     التغيير يبدأ بإلغاء التوثيق، وهو مسجَّلٌ في الأثر. */
  IF TG_OP = 'UPDATE' AND OLD.verified AND NEW.verified
     AND (NEW.storage_path IS DISTINCT FROM OLD.storage_path
          OR NEW.file_name IS DISTINCT FROM OLD.file_name
          OR NEW.kind IS DISTINCT FROM OLD.kind
          OR NEW.doc_type IS DISTINCT FROM OLD.doc_type
          OR NEW.orphan_id IS DISTINCT FROM OLD.orphan_id
          OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
          OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes) THEN
    RAISE EXCEPTION 'document: a verified document is frozen; un-verify it first'
      USING ERRCODE = '42501';
  END IF;

  IF pg_trigger_depth() > 1 OR current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.verified THEN
      RAISE EXCEPTION 'document: verification is admin-only' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.verified IS DISTINCT FROM OLD.verified
     OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
    RAISE EXCEPTION 'document: verification is admin-only' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.guard_document_verification() FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- ٧) صندوق قرارات الإدارة — الأدوار المعلّقة بنداً فيه
-- ---------------------------------------------------------------------
-- قرارٌ لا يصل الإدارة يعني أدواراً معلّقةً إلى الأبد. فتظهر في الصندوق
-- مع ما يكفي للحكم: الطفل والبرنامج والدور وصاحبه ومن أسنده.
CREATE OR REPLACE FUNCTION public.admin_decision_inbox()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(i)::jsonb ORDER BY i.created_at)
      FROM (
        SELECT 'orphan' AS kind, o.id, o.display_name AS title,
               'ملف ' || o.code || COALESCE(' · ' || o.region, '') AS subtitle, o.created_at
          FROM public.orphans o WHERE o.status IN ('submitted', 'under_review')
        UNION ALL
        SELECT 'org', c.id, c.name, COALESCE(c.city, '') || COALESCE(' · ' || c.region, ''), c.created_at
          FROM public.care_organizations c WHERE c.status = 'pending'
        UNION ALL
        SELECT 'access', a.id, o.display_name, 'طلب اطّلاع · ' || left(a.reason, 80), a.created_at
          FROM public.orphan_access_requests a JOIN public.orphans o ON o.id = a.orphan_id
         WHERE a.status = 'pending'
        UNION ALL
        SELECT 'circle_role', r.id, o.display_name,
               'دورٌ في دائرة الطفل · ' || r.role::text || COALESCE(' · ' || r.person_name, ''),
               r.assigned_at
          FROM public.enrollment_roles r
          JOIN public.program_enrollments e ON e.id = r.enrollment_id
          JOIN public.orphans o ON o.id = e.orphan_id
         WHERE r.approval = 'pending' AND r.ended_at IS NULL
        UNION ALL
        SELECT 'donor', e.id, e.name, 'جهة مانحة · ' || e.entity_type, e.created_at
          FROM public.donor_entities e WHERE e.status = 'pending'
        UNION ALL
        SELECT 'progress_report', r.id, o.display_name, 'تقرير جهة · ' || r.period, r.created_at
          FROM public.progress_reports r JOIN public.orphans o ON o.id = r.orphan_id
         WHERE r.status = 'submitted'
        UNION ALL
        SELECT 'office_report', r.id, r.title, 'تقرير ' || f.name, r.created_at
          FROM public.office_reports r JOIN public.offices f ON f.id = r.office_id
         WHERE r.status = 'submitted'
        UNION ALL
        SELECT 'pledge', p.id,
               CASE p.kind WHEN 'in_kind' THEN 'دعم عيني' ELSE 'بناء أهلية' END,
               p.amount::text || ' ' || p.currency || ' · ' || p.target_type, p.created_at
          FROM public.support_pledges p WHERE p.status = 'pending'
        UNION ALL
        SELECT 'unlock', r.id, o.display_name,
               'طلب فكّ · ' || r.op || ' · ' || cardinality(r.approvals) || '/' || public.unlock_quorum(),
               r.created_at
          FROM public.unlock_requests r JOIN public.orphans o ON o.id = r.orphan_id
         WHERE r.status = 'pending' AND r.requested_by <> auth.uid() AND auth.uid() <> ALL (r.approvals)
        UNION ALL
        SELECT 'discrepancy', d.id, o.display_name, 'اختلافٌ من ' || COALESCE(d.source, 'المصدر'), d.created_at
          FROM public.integrity_discrepancies d JOIN public.orphans o ON o.id = d.orphan_id
         WHERE d.status = 'open'
      ) i), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_decision_inbox() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decision_inbox() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_decision_context(_kind TEXT, _id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN CASE _kind
    WHEN 'org' THEN (SELECT to_jsonb(c) - 'owner_id' FROM public.care_organizations c WHERE c.id = _id)
    WHEN 'donor' THEN (SELECT to_jsonb(e) || jsonb_build_object('members',
                         (SELECT count(*) FROM public.donor_members m WHERE m.entity_id = e.id))
                         FROM public.donor_entities e WHERE e.id = _id)
    WHEN 'progress_report' THEN (SELECT to_jsonb(r) FROM public.progress_reports r WHERE r.id = _id)
    WHEN 'office_report' THEN (SELECT to_jsonb(r) || jsonb_build_object('office', f.name,
                                 'attachments_count', cardinality(r.attachments)) - 'attachments'
                                 FROM public.office_reports r JOIN public.offices f ON f.id = r.office_id
                                WHERE r.id = _id)
    WHEN 'pledge' THEN (SELECT to_jsonb(p) - 'supporter_id' FROM public.support_pledges p WHERE p.id = _id)
    WHEN 'orphan' THEN (SELECT jsonb_build_object('id', o.id, 'code', o.code, 'name', o.display_name,
                          'region', o.region, 'need', o.monthly_need, 'status', o.status,
                          'story', o.story, 'created_at', o.created_at)
                          FROM public.orphans o WHERE o.id = _id)
    WHEN 'circle_role' THEN (SELECT jsonb_build_object(
                          'role', r.role, 'person_name', r.person_name,
                          'person_email', u.email, 'person_contact', r.person_contact,
                          'code', o.code, 'name', o.display_name, 'program', p.title,
                          'org', c.name, 'assigned_by_email', ab.email,
                          'note', r.note, 'approval', r.approval, 'created_at', r.assigned_at)
                          FROM public.enrollment_roles r
                          JOIN public.program_enrollments e ON e.id = r.enrollment_id
                          JOIN public.programs p ON p.id = e.program_id
                          JOIN public.orphans o ON o.id = e.orphan_id
                          LEFT JOIN public.care_organizations c ON c.id = o.org_id
                          LEFT JOIN auth.users u ON u.id = r.person_id
                          LEFT JOIN auth.users ab ON ab.id = r.assigned_by
                         WHERE r.id = _id)
    ELSE NULL END;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_decision_context(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decision_context(TEXT, UUID) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261106110000', 'care_org_trust_and_admin_accountability');

-- >>> migration 20261106120000 cohort_safety_set_based
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261106120000') THEN
    RAISE EXCEPTION 'الهجرة 20261106120000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- المرحلة صفر — حماية الحشد تُحسب مرّةً لكلّ نداء (المجموعة PERF)
-- ---------------------------------------------------------------------
-- PERF-01 / RT-01: `cohort_is_safe(id)` تعدّ الأطفال المنشورين الذين
-- يشاركون الطفل بلده ومنطقته وجنسه وفئته العمرية — بمسحٍ كامل للجدول.
-- و`list_orphan_cards` تناديها مرّتين لكلّ طفلٍ منشور قبل الترقيم،
-- و`orphan_filter_options` واقتراحُ الكافل مرّةً لكلّ طفل. فالدليل
-- O(n²): ١٣ ثانية عند ألف طفل، ويتجاوز مهلة الزائر في Supabase (نحو ٣
-- ثوانٍ) من نحو خمسمئة — فتظهر صفحة /orphans فارغةً وتختفي الفلاتر بصمت.
--
-- الإصلاح: الحشود تُعدّ مرّةً واحدة بنافذة
-- `count(*) OVER (PARTITION BY بلد، منطقة، جنس، فئة عمرية)` على
-- المنشورين، وتُربط بالطفل بمعرّفه. **والحجب نفسه لم يتغيّر حرفاً**:
--   • PARTITION BY تعامل NULL كقيمةٍ واحدة — وهو `IS NOT DISTINCT FROM`
--     الذي كانت تستعمله الدالّة؛
--   • الفئة العمرية من `age_band_of` نفسها ولا تكون NULL أبداً؛
--   • العدّ على المنشورين وحدهم (approved / fully_sponsored)، والطفل
--     المنشور يُعدّ في حشده كما كان؛
--   • الحدّ `cohort_min()` نفسه.
-- والتكافؤ مُثبَتٌ بمقارنة المخرجات القديمة والجديدة على بياناتٍ مولّدة
-- (`supabase/tests/cohort-perf-verification.sql`)، والقياس على ٢٠٠٠ و٥٠٠٠
-- طفل في `scripts/db-bench-catalogue.sh`.
--
-- و`cohort_is_safe(id)` تبقى كما هي لنداء الطفل الواحد (صفحة الطفل،
-- واقتراح المبلغ بعد LIMIT): كلفتها خطّية، ولا تتغيّر دلالتها.
--
-- PERF-03 (الجزء الآمن منه): أكثر سياسات القراءة نداءً تنادي `auth.uid()`
-- و`is_admin()` لكلّ صفّ. كلاهما STABLE بلا وسيطٍ من الصفّ، فلفّهما بـ
-- `(SELECT …)` يجعلهما يُحسبان مرّةً للاستعلام والنتيجة واحدة. يُغيَّر
-- التعبير وحده بـ ALTER POLICY: الأدوار والأمر كما هما.
--
-- كلّ ما هنا `CREATE OR REPLACE` و`ALTER`، وتواقيع الدوالّ كما هي، والمنح
-- صريحة (سحبٌ ثم منح) لأنّ صلاحيات Supabase الافتراضية تمنح العموم كلّ
-- دالّةٍ جديدة.
-- =====================================================================


-- ---------------------------------------------------------------------
-- ١) الفئة العمرية تتبع اليوم، فهي STABLE لا IMMUTABLE
-- ---------------------------------------------------------------------
-- كانت معلنةً IMMUTABLE وهي تقرأ CURRENT_DATE. وهذا خطأٌ دلاليّ (خطّةٌ
-- محفوظة قد تُثبّت فئة يومٍ مضى) ويمنع المخطِّط من دمجها في الاستعلام،
-- فتُنادى دالّةً لكلّ صفّ. لا فهرس ولا قيد يعتمد عليها.
ALTER FUNCTION public.age_band_of(DATE) STABLE;


-- ---------------------------------------------------------------------
-- ٢) أمان الحشد لكلّ المنشورين دفعةً واحدة
-- ---------------------------------------------------------------------
-- تُنادى من داخل دوالّ DEFINER وحدها (البطاقات، الفلاتر، الاقتراح)،
-- فهي INVOKER ومغلقةٌ على العموم: لا حاجة لأن يعدّد الزائر من حشده صغير.
CREATE OR REPLACE FUNCTION public.cohort_safety()
RETURNS TABLE (orphan_id UUID, safe BOOLEAN)
LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT o.id,
         count(*) OVER (
           PARTITION BY o.country, o.region, o.gender, public.age_band_of(o.birth_date)
         ) >= public.cohort_min()
    FROM public.orphans o
   WHERE o.status IN ('approved', 'fully_sponsored');
$fn$;
REVOKE ALL ON FUNCTION public.cohort_safety() FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- ٣) الدليل: الحجب نفسه، والحشود تُعدّ مرّة
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_orphan_cards(
  _country TEXT DEFAULT NULL,
  _region TEXT DEFAULT NULL,
  _age_band TEXT DEFAULT NULL,
  _gender TEXT DEFAULT NULL,
  _education_stage TEXT DEFAULT NULL,
  _funding TEXT DEFAULT NULL,
  _building BOOLEAN DEFAULT NULL,
  _search TEXT DEFAULT NULL,
  _sort TEXT DEFAULT 'waiting',
  _limit INT DEFAULT 24,
  _offset INT DEFAULT 0,
  _group UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _rows JSONB; _total INTEGER; _q TEXT;
BEGIN
  /* البحث يُهرَّب لا يُحذف: محرف البدل يصير محرفاً عادياً لا «كلّ شيء». */
  _q := NULLIF(btrim(COALESCE(_search, '')), '');
  IF _q IS NOT NULL THEN
    _q := replace(replace(replace(_q, '\', '\\'), '%', '\%'), '_', '\_');
  END IF;

  WITH base AS (
    SELECT o.id, o.code, o.display_name, o.gender, o.country,
           /* صفاتٌ نادرة الاجتماع تُحجب: لا يُعرف الطفل بتقاطعها.
              والحشد محسوبٌ مرّةً لكلّ النداء في `cohort_safety()`. */
           CASE WHEN cs.safe THEN o.region END AS region,
           CASE WHEN cs.safe THEN o.education_stage END AS education_stage,
           o.monthly_need, o.funded_monthly, o.currency,
           o.status, o.org_id, o.created_at, o.group_id,
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
             AS waiting_days,
           /* إشارات الثقة: عددٌ ونعم/لا، لا محتوى. */
           (SELECT count(*) FROM public.orphan_profile_sections p
             WHERE p.orphan_id = o.id)::INTEGER AS profile_sections,
           (o.photo_consent IN ('granted', 'face_hidden')) AS consent_documented,
           EXISTS (SELECT 1 FROM public.progress_reports r
                    WHERE r.orphan_id = o.id AND r.status = 'approved'
                      AND r.updated_at > now() - interval '90 days') AS recent_report
      FROM public.orphans o
      JOIN public.cohort_safety() cs ON cs.orphan_id = o.id
     WHERE o.status IN ('approved', 'fully_sponsored')
  ),
  filtered AS (
    SELECT b.* FROM base b
     WHERE (_country IS NULL OR b.country = _country)
       /* الفلترة على المنطقة المحجوبة لا الخام: وإلا صار سؤال «هل في
          كوكس أحد؟» جواباً. */
       AND (_region IS NULL OR b.region = _region)
       AND (_age_band IS NULL OR b.age_band = _age_band::public.age_band)
       AND (_gender IS NULL OR b.gender = _gender)
       AND (_education_stage IS NULL OR b.education_stage = _education_stage)
       AND (_building IS NULL OR b.building = _building)
       AND (_group IS NULL OR b.group_id = _group)
       AND (COALESCE(_funding, 'any') = 'any'
            OR (_funding = 'open' AND b.gap > 0)
            OR (_funding = 'full' AND b.gap <= 0))
       /* البحث بالاسم المستعار والرمز وحدهما. */
       AND (_q IS NULL
            OR b.display_name ILIKE '%' || _q || '%' ESCAPE '\'
            OR b.code ILIKE '%' || _q || '%' ESCAPE '\')
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(t) - 'group_id' ORDER BY t.ord), '[]'::jsonb),
         (SELECT count(*) FROM filtered)
    INTO _rows, _total
    FROM (
      SELECT f.*, row_number() OVER (
        ORDER BY
          CASE WHEN COALESCE(_sort,'waiting') = 'closest'
               THEN -(f.funded_monthly / NULLIF(f.monthly_need, 0)) END,
          CASE WHEN _sort = 'newest' THEN f.created_at END DESC,
          CASE WHEN _sort = 'documented' THEN f.profile_sections END DESC,
          CASE WHEN _sort = 'documented' THEN f.recent_report END DESC,
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
REVOKE ALL ON FUNCTION public.list_orphan_cards(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, INT, INT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_orphan_cards(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, INT, INT, UUID)
  TO anon, authenticated;


-- خيارات المنطقة والمرحلة لا تُدرج قيمةً لا يظهر فيها أحد: كانت تُنبئ بوجودها.
CREATE OR REPLACE FUNCTION public.orphan_filter_options()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH pub AS (
    SELECT o.country, o.region, o.education_stage, cs.safe
      FROM public.orphans o
      JOIN public.cohort_safety() cs ON cs.orphan_id = o.id
     WHERE o.status IN ('approved', 'fully_sponsored')
  )
  SELECT jsonb_build_object(
    'countries', COALESCE((SELECT jsonb_agg(DISTINCT p.country) FROM pub p
                            WHERE COALESCE(btrim(p.country), '') <> ''), '[]'::jsonb),
    'regions', COALESCE((SELECT jsonb_agg(DISTINCT p.region) FROM pub p
                          WHERE COALESCE(btrim(p.region), '') <> ''
                            AND p.safe), '[]'::jsonb),
    'stages', COALESCE((SELECT jsonb_agg(DISTINCT p.education_stage) FROM pub p
                         WHERE COALESCE(btrim(p.education_stage), '') <> ''
                           AND p.safe), '[]'::jsonb));
$fn$;
REVOKE ALL ON FUNCTION public.orphan_filter_options() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orphan_filter_options() TO anon, authenticated;


-- ---------------------------------------------------------------------
-- ٤) اقتراح الكافل: الحجب نفسه (DB-A)، والحشود تُعدّ مرّة
-- ---------------------------------------------------------------------
-- كان يحسب `cohort_is_safe` لكلّ مرشَّحٍ قبل الترتيب، فهو O(n²) كالدليل.
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
           cs.safe,
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
      JOIN public.cohort_safety() cs ON cs.orphan_id = o.id
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
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_orphans_for_sponsor(NUMERIC, TEXT, INT)
  TO authenticated;


-- ---------------------------------------------------------------------
-- ٥) PERF-03 — `auth.uid()` و`is_admin()` تُحسبان مرّةً للاستعلام
-- ---------------------------------------------------------------------
-- السجلّ المالي والإشعارات أكبر الجداول نموّاً، وكلّ مسجَّلٍ يقرؤها
-- بالمفتاح العامّ. كان الشرط يُنادي الدالّتين لكلّ صفّ (٥ ثوانٍ عند
-- ٢٠٠ ألف دفعة)؛ والصيغة `(SELECT …)` تجعلهما InitPlan يُحسب مرّة.
-- الشرط نفسه، فلا يتغيّر من يرى ماذا (وتقديم `is_admin` على
-- `can_manage_orphan` في «أو» لا يغيّر النتيجة، ويوفّر على الإدارة نداءً
-- لكلّ صفّ). و`can_manage_orphan(orphan_id)` تأخذ وسيطاً من الصفّ فتبقى.
ALTER POLICY "payments_read" ON public.sponsorship_payments
  USING (sponsor_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

ALTER POLICY "sponsorships_read" ON public.sponsorships
  USING (sponsor_id = (SELECT auth.uid())
         OR (SELECT public.is_admin())
         OR public.can_manage_orphan(orphan_id));

ALTER POLICY "notif_read_own" ON public.notifications
  USING (user_id = (SELECT auth.uid()));

ALTER POLICY "notif_update_own" ON public.notifications
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261106120000', 'cohort_safety_set_based');

-- >>> migration 20261106140000 phase0_review_fixes
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261106140000') THEN
    RAISE EXCEPTION 'الهجرة 20261106140000 مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';
  END IF;
END $guard$;
-- =====================================================================
-- المرحلة صفر — ما وجدته المراجعة بعد الإصلاح (المجموعة REV)
-- ---------------------------------------------------------------------
-- مراجعتان مستقلّتان قرأتا هجرات DB-A وDB-B وPERF ووجدتا أبواباً بقيت
-- مفتوحة، وأخرى فتحها الإصلاح نفسه. كلٌّ منها مُثبَتٌ بفحصٍ يفشل قبل هذه
-- الهجرة ويمرّ بعدها (`supabase/tests/review-fixes-verification.sql`):
--
--   ١) CP-05  حماية «أقلّ من ٥» تُلتفّ عليها: سجلّ الكفالة يُعيد المنطقة
--             الخام لأيّ كفالةٍ «بانتظار الدفع» يُنشئها أيّ حساب، و
--             `published_regions` تسرد كلّ منطقة، وكتالوج الدعم يُعلن منطقة
--             المجموعة وعدد أطفالها ثم يُفلتر الدليلُ بها، و`org_id` يدلّ
--             على جهةٍ مدينتُها معلنة.
--   ٢) CP-05  الخارطة: «صغيرة» و«مُخفاةٌ تكميلياً» علامتان مختلفتان،
--             والترتيب بالعدد الحقيقي — فالطرح يُعيد ما أُخفي.
--   ٣) CP-04  نصّ الاحتياج (العنوان والملاحظات) يقرؤه الزائر بنداء REST،
--             وتكتبه الجهة متى شاءت بلا مراجعة.
--   ٤) CP-04  عضو الدائرة يقرأ اسم المدرسة من الجدول مباشرةً متجاوزاً
--             `orphan_profile`.
--   ٥) CP-01  المشرف الذي انقضى أجلُ اعتماده يبقى يعمل: التقويم والجلسات
--             والمرحلة لا تسأل عن القرار ولا الأجل.
--   ٦) CP-02  صورة الطفل في خزنةٍ عامّة تُسرد مجلّداتها وتُنزَّل بلا إذن
--             «الهوية»، وتبقى بعد سحب الموافقة.
--   ٧) DB-07  «الإعادة للمراجعة» كانت تُسقط الطفل المكفول من النشر لتصحيح
--             حرف، وتغيّبه عن كافله، ولا يعود إلا بوثائق لم تُطلب يوماً —
--             وكلّ مزامنةٍ من الشريك تُسقطه كذلك.
--   ٨) CP-01  اعتماد الدائرة ينقضي بعد سنة ولا يعود إلى صندوق الإدارة.
--
-- كلّ ما هنا `CREATE OR REPLACE` و`DROP ... IF EXISTS` وإضافاتٌ مشروطة،
-- فتُطبَّق على البثّ كما هي. وتواقيع الدوالّ التي تستدعيها الواجهة
-- باقية. وكلّ دالّةٍ أو جدولٍ جديد يُسحب من العموم أولاً ثم يُمنح لمن قُصد
-- له: صلاحيات Supabase الافتراضية تمنح anon وauthenticated كلَّ ما يُنشأ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- ١) CP-05 — كلّ قارئٍ للمنطقة يحجبها كما تحجبها البطاقة
-- ---------------------------------------------------------------------
-- القاعدة واحدة: المنطقة تُعرض إن كان حشد الطفل آمناً (٥ فأكثر) أو كان
-- القارئ ممّن يرى تفصيله (`can_view_orphan_detail`). وكان سجلّ الكفالة
-- يكتفي بأن يملك القارئ الكفالة — وأيّ حسابٍ يُنشئ كفالةً «بانتظار الدفع»
-- بزرّ «اكفل» أو بإدراجٍ مباشر، فيقرأ «كوكس» لطفلٍ وحيدٍ فيها، ويبقى
-- يقرؤها بعد أن يُلغي.
--
-- ويُعاد تعريف السجلّ كما هو حرفاً إلا سطر المنطقة: الإيصال وبصمته لا
-- يدخل فيهما شيءٌ ممّا تغيّر.
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

  SELECT COALESCE(jsonb_agg(row_to_json(m)::jsonb || jsonb_build_object(
           'payments', public.month_payments(_s.id, m.month),
           'receipt', CASE WHEN m.upcoming OR (m.paid = 0 AND m.delivery_status IS NULL) THEN NULL
                           ELSE public.ledger_receipt_v2(_s.id, m.month, m.paid, m.payment_status,
                                                         m.delivery_status, m.delivered_at,
                                                         public.month_payment_refs(_s.id, m.month)) END)
         ORDER BY m.month DESC), '[]'::jsonb) INTO _months
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
      'country', _o.country,
      -- الحشد الصغير يُحجب كما في البطاقة؛ والكافل الحاليّ يراه كما يرى الملفّ.
      'region', CASE WHEN public.can_view_orphan_detail(_o.id) OR public.cohort_is_safe(_o.id)
                     THEN _o.region END,
      'age_band', public.age_band_of(_o.birth_date),
      'locked', public.orphan_is_locked(_o.id)),
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

/* قائمة مناطق الاقتراح كانت تسرد كلّ منطقةٍ فيها طفلٌ منشور — ولو
   واحد. فصارت كقائمة الفلترة: منطقةٌ فيها حشدٌ آمن واحدٌ على الأقلّ. */
CREATE OR REPLACE FUNCTION public.published_regions()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(r ORDER BY r), '[]'::jsonb)
  FROM (
    SELECT DISTINCT o.region AS r
      FROM public.orphans o
      JOIN public.cohort_safety() cs ON cs.orphan_id = o.id AND cs.safe
     WHERE o.status IN ('approved', 'fully_sponsored')
       AND COALESCE(btrim(o.region), '') <> ''
  ) s;
$fn$;
REVOKE ALL ON FUNCTION public.published_regions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.published_regions() TO anon, authenticated;

/* كتالوج الدعم: المجموعة تُعلن منطقتها وعدد أطفالها، والدليل يُفلتر بها
   — فـ«مجموعة كوكس: طفل واحد» ثم «أطفال المجموعة» يعطي الطفل ومنطقته.
   فعدد الأطفال لا يُنشر دون الحدّ، ومنطقة المجموعة لا تُنشر إن كان في
   أطفالها المنشورين من حشده صغير — ولا تدخل قائمة المناطق من طريقها.
   والترتيب بالاسم: الترتيب بالمنطقة المحجوبة يُظهرها بجيرانها. */
CREATE OR REPLACE FUNCTION public.support_catalog(_country TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH c AS (
    SELECT code, name_ar FROM public.countries
     WHERE status = 'active' AND (_country IS NULL OR code = _country)
  ),
  safety AS (SELECT * FROM public.cohort_safety()),
  gstat AS (
    SELECT o.group_id,
           count(*) FILTER (WHERE o.status = 'approved') AS n,
           count(*) FILTER (WHERE NOT s.safe) AS unsafe
      FROM public.orphans o
      JOIN safety s ON s.orphan_id = o.id
     WHERE o.group_id IS NOT NULL
     GROUP BY o.group_id
  ),
  grp AS (
    SELECT g.id, g.name, g.country_code, g.region,
           COALESCE(gs.n, 0) AS n, COALESCE(gs.unsafe, 0) = 0 AS region_ok
      FROM public.mirror_groups g
      LEFT JOIN gstat gs ON gs.group_id = g.id
     WHERE g.deleted_at IS NULL
  )
  SELECT jsonb_build_object(
    'countries', COALESCE((SELECT jsonb_agg(jsonb_build_object('code', code, 'name', name_ar) ORDER BY name_ar)
                             FROM c), '[]'::jsonb),
    'regions', COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('country', r.country, 'name', r.region))
                           FROM (SELECT g.country_code AS country, g.region FROM grp g
                                  WHERE g.region IS NOT NULL AND g.region_ok
                                 UNION
                                 SELECT o.country_code, o.region FROM public.offices o
                                  WHERE o.active AND o.region IS NOT NULL) r
                          WHERE r.country IN (SELECT code FROM c)), '[]'::jsonb),
    'groups', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                          'id', g.id, 'name', g.name, 'country', g.country_code,
                          'region', CASE WHEN g.region_ok THEN g.region END,
                          'children', CASE WHEN g.n >= public.cohort_min() THEN g.n END)
                        ORDER BY g.name, g.id)
                          FROM grp g
                         WHERE g.country_code IN (SELECT code FROM c)), '[]'::jsonb),
    'institutions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                          'id', o.id, 'name', o.name, 'kind', k.label, 'country', o.country_code,
                          'region', o.region)
                        ORDER BY o.name)
                          FROM public.care_organizations o
                          LEFT JOIN public.institution_kinds k ON k.key = o.kind
                         WHERE o.status = 'approved' AND o.country_code IN (SELECT code FROM c)), '[]'::jsonb));
$fn$;
REVOKE ALL ON FUNCTION public.support_catalog(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_catalog(TEXT) TO anon, authenticated;

/* والدليل: «أطفال المجموعة» كفلترة المنطقة — المجموعة تعني منطقتها،
   فلا يُطابقها إلا طفلٌ حشده آمن. ومن حشده صغير يبقى في الدليل العامّ
   بلا منطقة، كما كان. */
CREATE OR REPLACE FUNCTION public.list_orphan_cards(
  _country TEXT DEFAULT NULL,
  _region TEXT DEFAULT NULL,
  _age_band TEXT DEFAULT NULL,
  _gender TEXT DEFAULT NULL,
  _education_stage TEXT DEFAULT NULL,
  _funding TEXT DEFAULT NULL,
  _building BOOLEAN DEFAULT NULL,
  _search TEXT DEFAULT NULL,
  _sort TEXT DEFAULT 'waiting',
  _limit INT DEFAULT 24,
  _offset INT DEFAULT 0,
  _group UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _rows JSONB; _total INTEGER; _q TEXT;
BEGIN
  /* البحث يُهرَّب لا يُحذف: محرف البدل يصير محرفاً عادياً لا «كلّ شيء». */
  _q := NULLIF(btrim(COALESCE(_search, '')), '');
  IF _q IS NOT NULL THEN
    _q := replace(replace(replace(_q, '\', '\\'), '%', '\%'), '_', '\_');
  END IF;

  WITH base AS (
    SELECT o.id, o.code, o.display_name, o.gender, o.country,
           /* صفاتٌ نادرة الاجتماع تُحجب: لا يُعرف الطفل بتقاطعها.
              والحشد محسوبٌ مرّةً لكلّ النداء في `cohort_safety()`. */
           CASE WHEN cs.safe THEN o.region END AS region,
           CASE WHEN cs.safe THEN o.education_stage END AS education_stage,
           o.monthly_need, o.funded_monthly, o.currency,
           /* والجهة كالمنطقة: في حشدٍ صغير تدلّ مدينتها المعلنة على الطفل. */
           o.status, CASE WHEN cs.safe THEN o.org_id END AS org_id,
           o.created_at, o.group_id, cs.safe AS cohort_safe,
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
             AS waiting_days,
           /* إشارات الثقة: عددٌ ونعم/لا، لا محتوى. */
           (SELECT count(*) FROM public.orphan_profile_sections p
             WHERE p.orphan_id = o.id)::INTEGER AS profile_sections,
           (o.photo_consent IN ('granted', 'face_hidden')) AS consent_documented,
           EXISTS (SELECT 1 FROM public.progress_reports r
                    WHERE r.orphan_id = o.id AND r.status = 'approved'
                      AND r.updated_at > now() - interval '90 days') AS recent_report
      FROM public.orphans o
      JOIN public.cohort_safety() cs ON cs.orphan_id = o.id
     WHERE o.status IN ('approved', 'fully_sponsored')
  ),
  filtered AS (
    SELECT b.* FROM base b
     WHERE (_country IS NULL OR b.country = _country)
       /* الفلترة على المنطقة المحجوبة لا الخام: وإلا صار سؤال «هل في
          كوكس أحد؟» جواباً. */
       AND (_region IS NULL OR b.region = _region)
       AND (_age_band IS NULL OR b.age_band = _age_band::public.age_band)
       AND (_gender IS NULL OR b.gender = _gender)
       AND (_education_stage IS NULL OR b.education_stage = _education_stage)
       AND (_building IS NULL OR b.building = _building)
       /* والمجموعة منطقةٌ معلنة: لا يُطابقها إلا حشدٌ آمن. */
       AND (_group IS NULL OR (b.group_id = _group AND b.cohort_safe))
       AND (COALESCE(_funding, 'any') = 'any'
            OR (_funding = 'open' AND b.gap > 0)
            OR (_funding = 'full' AND b.gap <= 0))
       /* البحث بالاسم المستعار والرمز وحدهما. */
       AND (_q IS NULL
            OR b.display_name ILIKE '%' || _q || '%' ESCAPE '\'
            OR b.code ILIKE '%' || _q || '%' ESCAPE '\')
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(t) - 'group_id' - 'cohort_safe' ORDER BY t.ord), '[]'::jsonb),
         (SELECT count(*) FROM filtered)
    INTO _rows, _total
    FROM (
      SELECT f.*, row_number() OVER (
        ORDER BY
          CASE WHEN COALESCE(_sort,'waiting') = 'closest'
               THEN -(f.funded_monthly / NULLIF(f.monthly_need, 0)) END,
          CASE WHEN _sort = 'newest' THEN f.created_at END DESC,
          CASE WHEN _sort = 'documented' THEN f.profile_sections END DESC,
          CASE WHEN _sort = 'documented' THEN f.recent_report END DESC,
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
REVOKE ALL ON FUNCTION public.list_orphan_cards(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, INT, INT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_orphan_cards(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, INT, INT, UUID)
  TO anon, authenticated;


-- ---------------------------------------------------------------------
-- ١ب) CP-05 — الجهة لا تدلّ على طفل الحشد الصغير
-- ---------------------------------------------------------------------
-- مدينة الجهة ومنطقتها معلنتان في دليل الجهات — وهما بيانات مؤسّسة لا
-- بيانات طفل. لكنّ `orphans.org_id` كان يُقرأ بنداء REST من الزائر وكلّ
-- مسجَّل، ويعود في البطاقة والملفّ والاقتراحات: «أرديت ← جهة كوكس» يُعيد
-- ما حجبته البطاقة. والصفحة كانت تحذف مدينة الجهة في الحشد الصغير من الردّ
-- — بعد أن قرأتها؛ والقاعدة لم تحجب شيئاً.
--
-- الآن تُعرف الجهة كما تُعرف المنطقة: لحشدٍ آمن أو لمن يرى التفصيل. والعمود
-- يُسحب من القراءة المباشرة؛ فالجهة ترى أطفالها من `org_orphans`، والإدارة
-- من دوالّها، وسياسات RLS تقرؤه دون منح.
REVOKE SELECT (org_id) ON TABLE public.orphans FROM anon, authenticated;

/* الإدخال كان يقيّد التحديث بـ`org_id = _org_id` بصلاحية المستدعي — وهي
   قراءةٌ للعمود المسحوب. فالسؤال يُسأل بصلاحية المالك، ولا يُجيب إلا مالك
   الجهة: غيرُه لا يعرف منه لمن الطفل. */
CREATE OR REPLACE FUNCTION public.orphan_in_my_org(_orphan UUID, _org UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.orphans o
                  WHERE o.id = _orphan AND o.org_id = _org AND public.owns_org(_org));
$fn$;
REVOKE ALL ON FUNCTION public.orphan_in_my_org(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orphan_in_my_org(UUID, UUID) TO authenticated;

-- كما هي حرفاً إلا شرط الجهة في تحديث المسودّة.
CREATE OR REPLACE FUNCTION public.create_orphan_intake(_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _org_id UUID := (_payload->>'org_id')::uuid;
  _orphan UUID := NULLIF(_payload->>'orphan_id', '')::uuid;
  _code TEXT;
  _need JSONB;
  _doc JSONB;
  _needs_total NUMERIC(12,2) := 0;
BEGIN
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'intake: org_id is required' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.care_organizations
     WHERE id = _org_id AND owner_id = auth.uid() AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'intake: organisation not yours or not approved'
      USING ERRCODE = '42501';
  END IF;

  IF _orphan IS NULL THEN
    _code := public.next_orphan_code();
    INSERT INTO public.orphans (
      code, org_id, created_by, display_name, gender, birth_date,
      city, region, education_stage, story, monthly_need, status
    ) VALUES (
      _code, _org_id, auth.uid(),
      _payload->>'display_name',
      COALESCE(_payload->>'gender', 'male'),
      NULLIF(_payload->>'birth_date', '')::date,
      NULLIF(_payload->>'city', ''),
      NULLIF(_payload->>'region', ''),
      NULLIF(_payload->>'education_stage', ''),
      NULLIF(_payload->>'story', ''),
      0,
      'submitted'
    ) RETURNING id INTO _orphan;
  ELSE
    UPDATE public.orphans SET
      display_name    = _payload->>'display_name',
      gender          = COALESCE(_payload->>'gender', 'male'),
      birth_date      = NULLIF(_payload->>'birth_date', '')::date,
      city            = NULLIF(_payload->>'city', ''),
      region          = NULLIF(_payload->>'region', ''),
      education_stage = NULLIF(_payload->>'education_stage', ''),
      story           = NULLIF(_payload->>'story', ''),
      status          = 'submitted',
      updated_at      = now()
    WHERE id = _orphan AND public.orphan_in_my_org(id, _org_id)
      AND status IN ('draft', 'rejected');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'intake: draft % is not yours or no longer editable', _orphan
        USING ERRCODE = '42501';
    END IF;

    _code := (SELECT code FROM public.orphans WHERE id = _orphan);
    DELETE FROM public.orphan_needs WHERE orphan_id = _orphan;
  END IF;

  INSERT INTO public.orphan_private (
    orphan_id, full_name, national_id, guardian_name, guardian_relation,
    guardian_phone, address, family_size, family_income,
    health_notes, school_name, notes
  ) VALUES (
    _orphan,
    NULLIF(_payload->>'full_name', ''),
    NULLIF(_payload->>'national_id', ''),
    NULLIF(_payload->>'guardian_name', ''),
    NULLIF(_payload->>'guardian_relation', ''),
    NULLIF(_payload->>'guardian_phone', ''),
    NULLIF(_payload->>'address', ''),
    NULLIF(_payload->>'family_size', '')::integer,
    NULLIF(_payload->>'family_income', '')::numeric,
    NULLIF(_payload->>'health_notes', ''),
    NULLIF(_payload->>'school_name', ''),
    NULLIF(_payload->>'private_notes', '')
  )
  ON CONFLICT (orphan_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    national_id = EXCLUDED.national_id,
    guardian_name = EXCLUDED.guardian_name,
    guardian_relation = EXCLUDED.guardian_relation,
    guardian_phone = EXCLUDED.guardian_phone,
    address = EXCLUDED.address,
    family_size = EXCLUDED.family_size,
    family_income = EXCLUDED.family_income,
    health_notes = EXCLUDED.health_notes,
    school_name = EXCLUDED.school_name,
    notes = EXCLUDED.notes;

  FOR _need IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'needs', '[]'::jsonb))
  LOOP
    INSERT INTO public.orphan_needs (orphan_id, category, title, monthly_amount, notes)
    VALUES (
      _orphan,
      COALESCE(_need->>'category', 'other')::public.need_category,
      COALESCE(NULLIF(_need->>'title', ''), 'بند'),
      COALESCE((_need->>'monthly_amount')::numeric, 0),
      NULLIF(_need->>'note', '')
    );
    _needs_total := _needs_total + COALESCE((_need->>'monthly_amount')::numeric, 0);
  END LOOP;

  IF _needs_total = 0 THEN
    UPDATE public.orphans
       SET monthly_need = COALESCE((_payload->>'monthly_need')::numeric, 0)
     WHERE id = _orphan;
  END IF;

  FOR _doc IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'documents', '[]'::jsonb))
  LOOP
    INSERT INTO public.orphan_documents (orphan_id, doc_type, kind, storage_path, file_name, mime_type, size_bytes, uploaded_by)
    VALUES (
      _orphan,
      COALESCE(_doc->>'kind', 'other'),
      COALESCE(_doc->>'kind', 'other')::public.orphan_doc_type,
      _doc->>'storage_path',
      NULLIF(_doc->>'file_name', ''),
      NULLIF(_doc->>'mime_type', ''),
      NULLIF(_doc->>'size_bytes', '')::integer,
      auth.uid()
    )
    ON CONFLICT (storage_path) DO NOTHING;
  END LOOP;

  PERFORM public.write_audit('orphan.submitted', 'orphan', _orphan,
    jsonb_build_object('code', _code, 'org_id', _org_id,
                       'needs', jsonb_array_length(COALESCE(_payload->'needs', '[]'::jsonb)),
                       'documents', jsonb_array_length(COALESCE(_payload->'documents', '[]'::jsonb))));

  RETURN jsonb_build_object('id', _orphan, 'code', _code);
END $function$;
REVOKE ALL ON FUNCTION public.create_orphan_intake(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_orphan_intake(JSONB) TO authenticated;

/* اقتراحات الكافل: كما هي إلا الجهة، تُحجب مع المنطقة. */
CREATE OR REPLACE FUNCTION public.suggest_orphans_for_sponsor(
  _budget NUMERIC DEFAULT NULL, _region TEXT DEFAULT NULL, _limit INTEGER DEFAULT 12)
RETURNS TABLE(id UUID, code TEXT, display_name TEXT, gender TEXT, country TEXT, region TEXT,
              education_stage TEXT, age_band public.age_band, monthly_need NUMERIC,
              funded_monthly NUMERIC, currency TEXT, status public.orphan_status, org_id UUID,
              created_at TIMESTAMPTZ, gap NUMERIC, building BOOLEAN, completes BOOLEAN,
              in_region BOOLEAN, waiting_days INTEGER)
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
           cs.safe,
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
      JOIN public.cohort_safety() cs ON cs.orphan_id = o.id
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
           CASE WHEN c.safe THEN c.raw_stage END AS m_stage,
           CASE WHEN c.safe THEN c.org_id END AS m_org
      FROM cand c
  )
  SELECT c.id, c.code, c.display_name, c.gender, c.country, c.m_region,
         c.m_stage, public.age_band_of(c.birth_date),
         c.monthly_need, c.funded_monthly, c.currency, c.status, c.m_org,
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
REVOKE ALL ON FUNCTION public.suggest_orphans_for_sponsor(NUMERIC, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_orphans_for_sponsor(NUMERIC, TEXT, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------
-- ٢) CP-05 — الخارطة: كلّ منطقةٍ مخفيّة بعلامةٍ واحدة، ولا تُثبَّت بالطرح
-- ---------------------------------------------------------------------
-- كانت المخفيّة لصغرها تحمل `small` والمخفيّة تكميلياً تحمل `suppressed`،
-- والترتيب بالعدد الحقيقي. فـ«البلد ١٢، تيرانا ٦، شكودر (≥٥)، كوكس (≥١)»
-- يعطي ١٢ − ٦ = ٦ = ٥ + ١ بالضبط.
--
-- الآن:
--   • كلّ منطقةٍ لم يُنشر عددها تحمل العلامة نفسها (`small: true`،
--     والأرقام فارغة) — لا يُعرف أصغيرةٌ هي أم أُخفيت لتحمي غيرها.
--   • الظاهرة مرتّبةٌ بعددها، والمخفيّة بعدها **بالاسم**.
--   • وقاعدة الحدّ الأدنى: الباقي R (البلد − الظاهر) موزَّعٌ على h منطقةً
--     مخفيّة، كلٌّ منها طفلٌ على الأقلّ؛ فأكبر ما يمكن أن تكونه إحداها
--     R − (h − 1). فإن نقص عن الحدّ عُلم أنّ كلّ مخفيّةٍ صغيرة — وقد يُعلم
--     عددها بعينه (R = h). فتُخفى أصغرُ الظاهرة واحدةً بعد واحدة حتى يبلغ
--     R − h + 1 الحدّ. وإن لم يبقَ ما يُخفى، فالمناطق كلّها مخفيّة.
--     (وبلا منطقةٍ مخفيّة: R صفرٌ أو ≥ الحدّ كما كان.)
--   • و«المكفول» و«وصلهم تسليم» على قاعدتهما: لا يُنشران إلا لمنطقةٍ
--     ظاهرة، ولا للبلد إلا حين يبلغ كلا شقّي الباقي الحدّ. والفجوة المالية
--     تتبع العدد: لا تُنشر لمنطقةٍ مخفيّة، ولا للبلد إن حُجب عدده.
-- وعدد البلد يبقى: هو مقروءٌ من عمود `country` نفسه بنداء REST.
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
  /* المناطق التي بلغت الحدّ، مرتّبةً من الأصغر، ومجموعُها التراكمي. */
  lg AS (
    SELECT r.country, r.region,
           row_number() OVER (PARTITION BY r.country ORDER BY r.total, r.region) AS rk,
           sum(r.total) OVER (PARTITION BY r.country ORDER BY r.total, r.region
                              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum
      FROM reg r, k WHERE r.total >= k.k
  ),
  /* قبل أيّ إخفاءٍ تكميلي: الباقي u (الصغيرة ومن بلا منطقة) وعدد الصغيرة. */
  cstat AS (
    SELECT c.country,
           c.total - COALESCE((SELECT sum(r.total) FROM reg r, k
                                WHERE r.country = c.country AND r.total >= k.k), 0) AS u,
           (SELECT count(*) FROM reg r, k WHERE r.country = c.country AND r.total < k.k) AS h_s,
           (SELECT count(*) FROM reg r, k WHERE r.country = c.country AND r.total >= k.k) AS n_large
      FROM cty c
  ),
  /* إخفاء m من أصغر الكبيرة: الباقي rr والمخفيّة hh. */
  cand AS (
    SELECT s.country, 0::BIGINT AS m, s.u AS rr, s.h_s AS hh FROM cstat s
    UNION ALL
    SELECT l.country, l.rk, s.u + l.cum, s.h_s + l.rk
      FROM lg l JOIN cstat s ON s.country = l.country
  ),
  pick AS (
    SELECT s.country,
           COALESCE((
             SELECT min(c.m) FROM cand c, k
              WHERE c.country = s.country
                AND ((c.hh = 0 AND (c.rr = 0 OR c.rr >= k.k))
                     OR (c.hh > 0 AND c.rr - c.hh + 1 >= k.k))), s.n_large) AS m
      FROM cstat s
  ),
  reg_vis AS (
    SELECT r.*, rg.gap,
           (l.rk IS NOT NULL AND l.rk > p.m) AS shown
      FROM reg r
      JOIN reg_gap rg ON rg.country = r.country AND rg.region = r.region
      JOIN pick p ON p.country = r.country
      LEFT JOIN lg l ON l.country = r.country AND l.region = r.region
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
                      'small', NOT r.shown,
                      'total', CASE WHEN r.shown THEN r.total END,
                      'sponsored', CASE WHEN r.spon_shown THEN r.spon END,
                      'delivered', CASE WHEN r.deliv_shown THEN r.deliv END,
                      'gap', CASE WHEN r.shown THEN r.gap END,
                      'currency', CASE WHEN r.shown THEN r.currency END)
                    ORDER BY r.shown DESC,
                             CASE WHEN r.shown THEN r.total END DESC NULLS LAST,
                             r.region)
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
        'sponsored', CASE WHEN s.tot_ok AND s.spon_ok THEN s.spon END,
        'delivered', CASE WHEN s.tot_ok AND s.deliv_ok THEN s.deliv END,
        'gap', CASE WHEN s.tot_ok THEN s.gap END,
        'currency', CASE WHEN s.tot_ok THEN s.currency END,
        'regions', s.regions)
      ORDER BY s.total DESC, s.country), '[]'::jsonb)
  ) FROM shaped s;
$fn$;
REVOKE ALL ON FUNCTION public.geo_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.geo_stats() TO anon, authenticated;


-- ---------------------------------------------------------------------
-- ٣) CP-04 — نصّ الاحتياج لا يقرؤه العموم، ولا يُنشر قبل أن تراه الإدارة
-- ---------------------------------------------------------------------
-- العنوان والملاحظات نصٌّ حرّ تكتبه الجهة: «كتب مدرسة كوكس التاسعة»،
-- «يسكن مع جدّته في الشارع ٥». وكان الزائر يقرؤه بنداء REST (سياسة
-- `needs_public_read`)، وكلّ مسجَّلٍ كذلك (`needs_read_auth`)، والجهة
-- تكتبه متى شاءت.
--
-- الآن:
--   • الجدول لمن يدير الملفّ والإدارة وحدهم. والتفصيل يصل من يحقّ له عبر
--     `orphan_view` — الفئة والمبلغ والعنوان، بلا الملاحظات.
--   • والعنوان لا يصل غيرَ الجهة والإدارة حتى تراه الإدارة
--     (`text_reviewed`). اعتمادُ الملفّ يعتمده؛ وما يُكتب بعد النشر يظهر
--     في صندوق القرارات مع تعديلات الملفّ (أدناه)، وحتى يُعتمد يظهر بفئته.
REVOKE ALL ON TABLE public.orphan_needs FROM anon;
DROP POLICY IF EXISTS "needs_public_read" ON public.orphan_needs;
DROP POLICY IF EXISTS "needs_read_auth" ON public.orphan_needs;
CREATE POLICY "needs_read_auth" ON public.orphan_needs FOR SELECT TO authenticated
  USING (public.can_manage_orphan(orphan_id) OR public.is_admin());

/* ما كُتب قبل هذه الهجرة مرّ بالاعتماد الذي نُشر به الملفّ (أو سيمرّ به
   إن كان مسودّة)، فلا يُخفى بأثرٍ رجعيّ: العمود يُضاف «مُراجَعاً». وما
   يكتبه المالك من القاعدة نفسها (هجرة، صيانة) كذلك؛ أمّا ما يأتي من جلسةٍ
   أو مفتاح خدمة فيضبطه الحارس أدناه «غير مُراجَع». */
ALTER TABLE public.orphan_needs
  ADD COLUMN IF NOT EXISTS text_reviewed BOOLEAN NOT NULL DEFAULT true;

/* بصفة المالك: الإدخال (`create_orphan_intake`) يعمل بصفة المستدعي، وفاحصا
   القناة مغلقان على العموم. */
CREATE OR REPLACE FUNCTION public.guard_need_text_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF public.is_admin() OR NOT (public.request_is_client() OR public.request_is_service()) THEN
    RETURN NEW;
  END IF;
  -- ما تكتبه الجهة أو الشريك نصٌّ لم يُراجَع؛ والعلامة لا يكتبها غير الإدارة.
  IF TG_OP = 'INSERT'
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.notes IS DISTINCT FROM OLD.notes THEN
    NEW.text_reviewed := false;
  ELSE
    NEW.text_reviewed := OLD.text_reviewed;
  END IF;
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.guard_need_text_review() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_need_text_review ON public.orphan_needs;
CREATE TRIGGER trg_guard_need_text_review
BEFORE INSERT OR UPDATE ON public.orphan_needs
FOR EACH ROW EXECUTE FUNCTION public.guard_need_text_review();

/* اعتماد الملفّ اعتمادٌ لنصوص احتياجه: لا ينشر الملفَّ إلا الإدارة
   (`guard_orphan_update` و`trg_require_publication_documents`). */
CREATE OR REPLACE FUNCTION public.mark_needs_reviewed_on_publication()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status IN ('approved', 'fully_sponsored')
     AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('approved', 'fully_sponsored')) THEN
    UPDATE public.orphan_needs SET text_reviewed = true
     WHERE orphan_id = NEW.id AND NOT text_reviewed;
  END IF;
  RETURN NULL;
END $fn$;
REVOKE ALL ON FUNCTION public.mark_needs_reviewed_on_publication() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_mark_needs_reviewed_on_publication ON public.orphans;
CREATE TRIGGER trg_mark_needs_reviewed_on_publication
AFTER INSERT OR UPDATE OF status ON public.orphans
FOR EACH ROW EXECUTE FUNCTION public.mark_needs_reviewed_on_publication();


-- ---------------------------------------------------------------------
-- ٤) CP-04 — أقسام الملفّ تُقرأ من الجدول لمن يكتبها وحده
-- ---------------------------------------------------------------------
-- `orphan_profile` تنزع اسم المدرسة ما لم يُمنح «الموقع»، والسياسة كانت
-- تفتح الجدول لكلّ عضو دائرة — فالمرشد يقرأ بنداء REST ما حجبته الدالّة،
-- ومعه الملاحظة الحرّة. فالقراءة المباشرة لمن يدير الملفّ والإدارة؛
-- وأعضاء الدائرة الآخرون يقرؤون عبر `orphan_profile` وحدها، حيث تُطبَّق
-- النطاقات حقلاً حقلاً.
DROP POLICY IF EXISTS "profile_circle_read" ON public.orphan_profile_sections;
CREATE POLICY "profile_circle_read" ON public.orphan_profile_sections
  FOR SELECT TO authenticated
  USING (public.can_manage_orphan(orphan_id) OR public.is_admin());


-- ---------------------------------------------------------------------
-- ٥) CP-01 — صلاحيات المشرف تتبع قرار الإدارة وأجله
-- ---------------------------------------------------------------------
-- الدائرة تُغلق عند انقضاء الأجل (`holds_live_circle_role`)، لكنّ «من
-- المشرف؟» كان يُسأل بلا قرارٍ ولا أجل — فالمشرف المنقضي أجلُه يسجّل
-- التقويم والجلسات ويحرّك المرحلة ويرى قائمته. والإذن كذلك: إذنٌ كتبه
-- دورٌ معلّقٌ أو مرفوضٌ أو منقضٍ لا يُحسب.
CREATE OR REPLACE FUNCTION public.circle_role_is_live(
  _approval TEXT, _person UUID, _expires TIMESTAMPTZ, _ended TIMESTAMPTZ
)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $fn$
  SELECT _ended IS NULL AND (
    (_person IS NULL AND _approval IN ('not_required', 'approved'))
    OR (_approval = 'approved' AND _expires > now())
  );
$fn$;
REVOKE ALL ON FUNCTION public.circle_role_is_live(TEXT, UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enrollment_supervisor(_enrollment UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT r.person_id FROM public.enrollment_roles r
   WHERE r.enrollment_id = _enrollment
     AND r.role = 'supervisor' AND r.ended_at IS NULL
     AND r.approval = 'approved' AND r.expires_at > now()
   LIMIT 1;
$fn$;

CREATE OR REPLACE FUNCTION public.enrollment_has_consent(_enrollment UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollment_roles r
     WHERE r.enrollment_id = _enrollment
       AND r.role IN ('guardian', 'trustee')
       AND r.consent_at IS NOT NULL
       AND public.circle_role_is_live(r.approval, r.person_id, r.expires_at, r.ended_at)
  );
$fn$;

CREATE OR REPLACE FUNCTION public.enrollment_supervisor_standing(_enrollment UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
       'assigned', true,
       'level', s.level,
       'certified', s.certified_at IS NOT NULL,
       'independent', s.independence_index >= public.supervisor_independence_threshold(),
       'since', r.assigned_at
     )
     FROM public.enrollment_roles r
     JOIN public.supervisor_profiles s ON s.user_id = r.person_id
     WHERE r.enrollment_id = _enrollment AND r.role = 'supervisor' AND r.ended_at IS NULL
       AND r.approval = 'approved' AND r.expires_at > now()
     LIMIT 1),
    jsonb_build_object('assigned', false)
  );
$fn$;

CREATE OR REPLACE FUNCTION public.my_supervised_enrollments()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'enrollment_id', e.id,
    'orphan_id', o.id,
    'orphan_name', o.display_name,
    'orphan_code', o.code,
    'program', p.title,
    'stage', e.stage,
    'stage_order', public.stage_order(e.stage),
    'status', e.status,
    'has_consent', public.enrollment_has_consent(e.id),
    'assessments', (SELECT count(*) FROM public.trait_assessments a
                     WHERE a.enrollment_id = e.id),
    'has_final', EXISTS (SELECT 1 FROM public.trait_assessments a
                          WHERE a.enrollment_id = e.id AND a.phase = 'final'),
    'has_baseline', EXISTS (SELECT 1 FROM public.trait_assessments a
                             WHERE a.enrollment_id = e.id AND a.phase = 'baseline'),
    'units_total', (SELECT count(*) FROM public.program_units u
                     WHERE u.program_id = p.id AND u.active),
    'units_accepted', (SELECT count(*) FROM public.program_units u
                        JOIN public.enrollment_units eu
                          ON eu.unit_id = u.id AND eu.enrollment_id = e.id
                       WHERE u.program_id = p.id AND u.active
                         AND eu.status = 'accepted'),
    'units_awaiting', (SELECT count(*) FROM public.program_units u
                        JOIN public.enrollment_units eu
                          ON eu.unit_id = u.id AND eu.enrollment_id = e.id
                       WHERE u.program_id = p.id AND u.active
                         AND eu.status = 'submitted'),
    'since', r.assigned_at,
    'expires_at', r.expires_at
  ) ORDER BY o.display_name), '[]'::jsonb)
  FROM public.enrollment_roles r
  JOIN public.program_enrollments e ON e.id = r.enrollment_id
  JOIN public.programs p ON p.id = e.program_id
  JOIN public.orphans o ON o.id = e.orphan_id
  WHERE r.role = 'supervisor'
    AND r.ended_at IS NULL
    AND r.approval = 'approved' AND r.expires_at > now()
    AND r.person_id = auth.uid()
    AND auth.uid() IS NOT NULL;
$fn$;

CREATE OR REPLACE FUNCTION public.my_supervisor_today()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH mine AS (
    SELECT e.id, e.stage, o.id AS orphan_id, o.display_name, p.title AS program
      FROM public.enrollment_roles r
      JOIN public.program_enrollments e ON e.id = r.enrollment_id
      JOIN public.programs p ON p.id = e.program_id
      JOIN public.orphans o ON o.id = e.orphan_id
     WHERE r.role = 'supervisor' AND r.ended_at IS NULL AND r.person_id = auth.uid()
       AND r.approval = 'approved' AND r.expires_at > now()
       AND auth.uid() IS NOT NULL AND e.status IN ('proposed', 'funded')
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.priority, t.since), '[]'::jsonb)
    FROM (
      SELECT 1 AS priority, 'review_unit' AS task, m.id AS enrollment_id, m.display_name AS orphan,
             pu.title AS detail, u.submitted_at AS since
        FROM mine m
        JOIN public.enrollment_units u ON u.enrollment_id = m.id AND u.status = 'submitted'
        JOIN public.program_units pu ON pu.id = u.unit_id
      UNION ALL
      SELECT 2, 'consent_missing', m.id, m.display_name, m.program, NULL
        FROM mine m WHERE NOT public.enrollment_has_consent(m.id)
      UNION ALL
      SELECT 3, 'baseline_missing', m.id, m.display_name, m.program, NULL
        FROM mine m
       WHERE NOT EXISTS (SELECT 1 FROM public.trait_assessments a
                          WHERE a.enrollment_id = m.id AND a.phase = 'baseline')
      UNION ALL
      SELECT 4, 'final_missing', m.id, m.display_name, m.program, NULL
        FROM mine m
       WHERE m.stage IN ('measurement', 'qualified')
         AND NOT EXISTS (SELECT 1 FROM public.trait_assessments a
                          WHERE a.enrollment_id = m.id AND a.phase = 'final')
    ) t;
$fn$;


-- ---------------------------------------------------------------------
-- ٦) CP-02 — صورة الطفل في خزنةٍ خاصّة، بروابط موقّعةٍ قصيرة
-- ---------------------------------------------------------------------
-- `public-media` خزنةٌ عامّة: كلّ ملفٍّ فيها يُنزَّل بلا جلسة، وسياسة
-- القراءة كانت تفتح سرد مجلّداتها للزائر — ومعرّفات الأطفال معلنة. فتُسرد
-- صور طفلٍ وتُنزَّل دون نطاق «الهوية»، وتبقى بعد سحب الوليّ موافقته.
--
-- الآن:
--   • صورة الطفل في `orphan-photos` الخاصّة، مسارها `<orphan_id>/<ملف>`.
--   • تُقرأ (ويُوقَّع رابطها) لمن يدير الملفّ، أو لمن له نطاق «الهوية» على
--     طفلٍ صورته الحالية هي هذا الملفّ وموافقتها قائمة. فالسحب يُغلقها في
--     الحال: لا رابط جديد، والموقَّع ينقضي بعد دقائق.
--   • `public-media` لا يُكتب فيها بعد اليوم، ولا يسرد مجلّداتها إلا من
--     يدير الملفّ (ليحذف ما فيها). وما رُفع إليها من قبلُ لا يُعرض بعد
--     اليوم (`orphan_view` لا تُعيد إلا مساراً في الخزنة الخاصّة)؛ ونقلُه
--     وحذفُه من الخزنة العامّة خطوةُ تشغيلٍ موثّقة في دليل الإصدار — الحذف
--     من `storage.objects` بـ SQL ممنوعٌ على Supabase.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('orphan-photos', 'orphan-photos', false, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.photo_url_is_platform(_orphan UUID, _url TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $fn$
  -- مسارٌ في الخزنة الخاصّة داخل مجلّد الطفل نفسه — لا رابطٌ من أيّ نطاق.
  SELECT _url IS NOT NULL AND position('..' IN _url) = 0
     AND _url ~ ('^' || _orphan::text || '/[A-Za-z0-9._-]+$');
$fn$;
REVOKE ALL ON FUNCTION public.photo_url_is_platform(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.photo_url_is_platform(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_view_orphan_photo(_path TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _id UUID;
BEGIN
  IF auth.uid() IS NULL OR _path IS NULL THEN RETURN false; END IF;
  BEGIN
    _id := split_part(_path, '/', 1)::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  RETURN EXISTS (
    SELECT 1 FROM public.orphans o
     WHERE o.id = _id
       AND o.photo_url = _path
       AND o.photo_consent IN ('granted', 'face_hidden')
       AND (o.status IN ('approved', 'fully_sponsored') OR public.sponsors_orphan(o.id))
       AND public.can_view_orphan_detail(o.id)
       AND 'identity' = ANY(public.my_orphan_scopes(o.id)));
END $fn$;
REVOKE ALL ON FUNCTION public.can_view_orphan_photo(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_orphan_photo(TEXT) TO authenticated;

DROP POLICY IF EXISTS "orphan_photos_read" ON storage.objects;
CREATE POLICY "orphan_photos_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'orphan-photos'
         AND (public.can_reach_orphan_folder(name) OR public.can_view_orphan_photo(name)));

DROP POLICY IF EXISTS "orphan_photos_write" ON storage.objects;
CREATE POLICY "orphan_photos_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'orphan-photos' AND public.can_reach_orphan_folder(name));

DROP POLICY IF EXISTS "orphan_photos_delete" ON storage.objects;
CREATE POLICY "orphan_photos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'orphan-photos' AND public.can_reach_orphan_folder(name));

DROP POLICY IF EXISTS "public_media_read" ON storage.objects;
CREATE POLICY "public_media_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'public-media' AND public.can_reach_orphan_folder(name));
DROP POLICY IF EXISTS "public_media_write" ON storage.objects;


-- ---------------------------------------------------------------------
-- ٧) DB-07 + CP-10 — التعديل ينتظر المراجعة، والمنشور يبقى كما رُوجع
-- ---------------------------------------------------------------------
-- «الإعادة للمراجعة» كانت تُسقط الملفّ كلَّه من النشر: طفلٌ مكفول يغيب عن
-- كافله («ملف محذوف» في لوحته) لتصحيح حرفٍ في قصّته، ولا يعود إلا بشهادة
-- وفاةٍ وإثبات وصايةٍ لم يُطلبا حين نُشر — وكلّ مزامنةٍ من الشريك تُسقطه.
--
-- فالتعديل الآن **يُمسَك** لا يُنشر ولا يُسقط:
--   • ما تكتبه الجهة أو الوليّ أو الشريك (مفتاح الخدمة) على ملفٍّ منشور —
--     الاسم والقصّة والمدينة والمنطقة والبلد وتاريخ الميلاد والجنس
--     والمرحلة الدراسية وصورةٌ جديدة — يُحفظ في `orphan_pending_edits`،
--     ويبقى الملفّ على ما راجعته الإدارة، منشوراً وقابلاً للكفالة.
--   • تراه الإدارة في صندوق القرارات مع نصوص الاحتياج غير المراجَعة،
--     فتعتمده (فيُكتب) أو ترفضه (فيُطوى)، وكلاهما بأثرٍ وإشعارٍ للجهة.
--   • وما لم يتغيّر لا يُمسَك: المزامنة التي تُعيد القيم نفسها لا تترك شيئاً.
--   • وحذف الطفل في المصدر يبقى سحباً من النشر حتى تقرّر الإدارة.
-- والإدارة نفسها تكتب مباشرة كما كانت.
CREATE TABLE IF NOT EXISTS public.orphan_pending_edits (
  orphan_id    UUID PRIMARY KEY REFERENCES public.orphans(id) ON DELETE CASCADE,
  changes      JSONB NOT NULL,
  previous     JSONB NOT NULL,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  via          TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orphan_pending_edits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.orphan_pending_edits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.orphan_pending_edits TO authenticated;
GRANT ALL ON TABLE public.orphan_pending_edits TO service_role;
DROP POLICY IF EXISTS "pending_edits_read" ON public.orphan_pending_edits;
CREATE POLICY "pending_edits_read" ON public.orphan_pending_edits FOR SELECT TO authenticated
  USING (public.can_manage_orphan(orphan_id) OR public.is_admin());

CREATE OR REPLACE FUNCTION public.public_edit_fields()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $fn$
  SELECT ARRAY['display_name', 'story', 'city', 'region', 'country', 'birth_date',
               'gender', 'education_stage']::TEXT[];
$fn$;
REVOKE ALL ON FUNCTION public.public_edit_fields() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hold_public_edit_for_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _held JSONB := '{}'; _prev JSONB := '{}'; _o JSONB; _n JSONB; _f TEXT;
BEGIN
  IF pg_trigger_depth() > 1 OR OLD.status NOT IN ('approved', 'fully_sponsored')
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() OR NOT (public.request_is_client() OR public.request_is_service()) THEN
    RETURN NEW;
  END IF;

  _o := to_jsonb(OLD); _n := to_jsonb(NEW);
  FOREACH _f IN ARRAY public.public_edit_fields() LOOP
    IF _n->_f IS DISTINCT FROM _o->_f THEN
      _held := _held || jsonb_build_object(_f, _n->_f);
      _prev := _prev || jsonb_build_object(_f, _o->_f);
    END IF;
  END LOOP;
  -- إزالة الصورة تقليلٌ لا يحتاج مراجعة؛ صورةٌ جديدة تحتاجها.
  IF NULLIF(NEW.photo_url, '') IS NOT NULL AND NEW.photo_url IS DISTINCT FROM OLD.photo_url THEN
    _held := _held || jsonb_build_object('photo_url', NEW.photo_url);
    _prev := _prev || jsonb_build_object('photo_url', OLD.photo_url);
  END IF;

  -- صورةٌ ممسوكة سقطت موافقتها لا تنتظر شيئاً.
  IF NEW.photo_consent NOT IN ('granted', 'face_hidden') THEN
    UPDATE public.orphan_pending_edits SET changes = changes - 'photo_url', updated_at = now()
     WHERE orphan_id = NEW.id AND changes ? 'photo_url';
    _held := _held - 'photo_url';
  END IF;

  -- الحذف في المصدر: يُسحب من النشر حتى تقرّر الإدارة.
  IF OLD.external_deleted_at IS NULL AND NEW.external_deleted_at IS NOT NULL THEN
    NEW.status := 'submitted';
    INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
    VALUES (auth.uid(), 'orphan.sent_back_to_review', 'orphan', NEW.id,
            jsonb_build_object('fields', '["external_deleted_at"]'::jsonb, 'from', OLD.status,
                               'via', public.request_channel()));
  END IF;

  IF _held = '{}'::jsonb THEN RETURN NEW; END IF;

  -- المنشور يبقى كما رُوجع؛ والجديد ينتظر.
  NEW := jsonb_populate_record(NEW, _prev);

  INSERT INTO public.orphan_pending_edits (orphan_id, changes, previous, requested_by, via)
  VALUES (NEW.id, _held, _prev, auth.uid(), public.request_channel())
  ON CONFLICT (orphan_id) DO UPDATE
    SET changes = public.orphan_pending_edits.changes || EXCLUDED.changes,
        -- «السابق» ما راجعته الإدارة: أوّل ما أُمسك عليه يبقى.
        previous = EXCLUDED.previous || public.orphan_pending_edits.previous,
        requested_by = EXCLUDED.requested_by,
        via = EXCLUDED.via,
        updated_at = now();

  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'orphan.edit_held_for_review', 'orphan', NEW.id,
          jsonb_build_object('fields', (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(_held) k),
                             'status', OLD.status, 'via', public.request_channel()));
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.hold_public_edit_for_review() FROM PUBLIC, anon, authenticated;

-- يحلّ محلّ مُشغّل الإعادة للمراجعة. والاسم يرتّبه بعد حارسَي القفل
-- والتحديث وحارس الصورة (`guard_locked_orphan`، `trg_guard_*`،
-- `trg_clear_photo_on_withdrawal`) وقبل مزامنة رمز البلد: يُفحص الطلب كما
-- أرسله، ثم يُعاد ما أُمسك، ثم يُشتقّ الرمز من البلد المنشور.
DROP TRIGGER IF EXISTS trg_resubmit_on_public_edit ON public.orphans;
DROP FUNCTION IF EXISTS public.resubmit_on_public_edit();
DROP TRIGGER IF EXISTS trg_hold_public_edit ON public.orphans;
CREATE TRIGGER trg_hold_public_edit
BEFORE UPDATE ON public.orphans
FOR EACH ROW EXECUTE FUNCTION public.hold_public_edit_for_review();


/* والكافل الحاليّ لا يفقد طفله إن غاب عن النشر (حذفٌ في المصدر، أو
   مراجعةٌ تفتحها الإدارة): يبقى صفّه مقروءاً له، وصفحته كما يراها. */
DROP POLICY IF EXISTS "orphans_read_auth" ON public.orphans;
CREATE POLICY "orphans_read_auth" ON public.orphans FOR SELECT TO authenticated
  USING (status IN ('approved','fully_sponsored') OR guardian_id = auth.uid()
         OR public.owns_org(org_id) OR public.is_admin() OR public.sponsors_orphan(id));

CREATE OR REPLACE FUNCTION public.orphan_view(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _o RECORD; _may BOOLEAN; _acc JSONB; _out JSONB; _scopes TEXT[]; _safe BOOLEAN;
        _manage BOOLEAN;
BEGIN
  SELECT * INTO _o FROM public.orphans o
   WHERE o.id = _orphan
     AND (o.status IN ('approved', 'fully_sponsored') OR public.sponsors_orphan(o.id));
  IF NOT FOUND THEN RETURN 'null'::jsonb; END IF;

  _may := public.can_view_orphan_detail(_orphan);
  _scopes := public.my_orphan_scopes(_orphan);
  _safe := _may OR public.cohort_is_safe(_orphan);
  _manage := public.can_manage_orphan(_orphan);

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
    'currency', _o.currency, 'status', _o.status,
    /* الجهة تُعرف لمن يرى التفصيل أو لحشدٍ آمن (انظر ١ب). */
    'org_id', CASE WHEN _safe THEN _o.org_id END,
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
        /* مسارٌ في الخزنة الخاصّة يوقّعه الخادم برابطٍ قصير؛ ورابطٌ قديم في
           الخزنة العامّة لا يُعاد. */
        'photo_url', CASE
          WHEN 'identity' = ANY(_scopes)
           AND _o.photo_consent IN ('granted', 'face_hidden')
           AND public.photo_url_is_platform(_o.id, _o.photo_url)
          THEN _o.photo_url END,
        /* عنوان الاحتياج يُعرض بعد أن تراه الإدارة؛ وقبلها الفئة والمبلغ. */
        'needs', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', n.id, 'category', n.category,
            'title', CASE WHEN n.text_reviewed OR _manage THEN n.title END,
            'monthly_amount', n.monthly_amount) ORDER BY n.monthly_amount DESC)
          FROM public.orphan_needs n WHERE n.orphan_id = _orphan), '[]'::jsonb)
      ));
  END IF;

  RETURN _out;
END $fn$;
REVOKE ALL ON FUNCTION public.orphan_view(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orphan_view(UUID) TO anon, authenticated;


-- قرار الإدارة في التعديل الممسوك ونصوص الاحتياج معاً.
CREATE OR REPLACE FUNCTION public.review_orphan_edit(
  _orphan UUID, _decision TEXT, _note TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _p public.orphan_pending_edits; _apply JSONB := '{}'; _needs INTEGER;
        _consent public.photo_consent_state; _owner UUID; _name TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'نشر التعديل قرارٌ للإدارة وحدها' USING ERRCODE = '42501';
  END IF;
  IF _decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'القرار إمّا قبولٌ أو رفض' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO _p FROM public.orphan_pending_edits WHERE orphan_id = _orphan FOR UPDATE;
  SELECT count(*) INTO _needs FROM public.orphan_needs
   WHERE orphan_id = _orphan AND NOT text_reviewed;
  IF _p.orphan_id IS NULL AND _needs = 0 THEN
    RAISE EXCEPTION 'لا تعديلَ ينتظر في هذا الملفّ' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT o.photo_consent, o.display_name, c.owner_id INTO _consent, _name, _owner
    FROM public.orphans o LEFT JOIN public.care_organizations c ON c.id = o.org_id
   WHERE o.id = _orphan;

  IF _decision = 'approved' THEN
    _apply := COALESCE(_p.changes, '{}'::jsonb);
    -- صورةٌ سُحبت موافقتها بعد أن أُمسكت لا تُنشر.
    IF _apply ? 'photo_url' AND _consent NOT IN ('granted', 'face_hidden') THEN
      _apply := _apply - 'photo_url';
    END IF;
    IF _apply <> '{}'::jsonb THEN
      UPDATE public.orphans o SET
        display_name = r.display_name, story = r.story, city = r.city, region = r.region,
        country = r.country, birth_date = r.birth_date, gender = r.gender,
        education_stage = r.education_stage, photo_url = r.photo_url, updated_at = now()
        FROM (SELECT (jsonb_populate_record(x, _apply)).*
                FROM public.orphans x WHERE x.id = _orphan) r
       WHERE o.id = _orphan;
    END IF;
    UPDATE public.orphan_needs SET text_reviewed = true
     WHERE orphan_id = _orphan AND NOT text_reviewed;
  ELSE
    -- النصّ المرفوض لا يُنشر: يبقى البند بفئته ومبلغه وعنوانٍ محايد.
    UPDATE public.orphan_needs SET title = 'بند', notes = NULL, text_reviewed = true
     WHERE orphan_id = _orphan AND NOT text_reviewed;
  END IF;

  DELETE FROM public.orphan_pending_edits WHERE orphan_id = _orphan;

  PERFORM public.write_audit('orphan.edit_' || _decision, 'orphan', _orphan,
    jsonb_build_object('fields', (SELECT jsonb_agg(k ORDER BY k)
                                    FROM jsonb_object_keys(COALESCE(_p.changes, '{}'::jsonb)) k),
                       'applied', (SELECT jsonb_agg(k ORDER BY k) FROM jsonb_object_keys(_apply) k),
                       'needs', _needs, 'note', NULLIF(btrim(COALESCE(_note, '')), '')));
  IF _owner IS NOT NULL THEN
    PERFORM public.notify(_owner, 'other',
      CASE WHEN _decision = 'approved' THEN 'نُشر تعديل ملف ' ELSE 'لم يُنشر تعديل ملف ' END
        || COALESCE(_name, ''),
      COALESCE(NULLIF(btrim(COALESCE(_note, '')), ''),
               CASE WHEN _decision = 'approved' THEN 'راجعت الإدارة التعديل ونشرته.'
                    ELSE 'راجعت الإدارة التعديل ولم تنشره؛ بقي الملفّ كما كان.' END),
      '/org', 'orphan', _orphan);
  END IF;

  RETURN jsonb_build_object('decision', _decision, 'applied',
    (SELECT COALESCE(jsonb_agg(k ORDER BY k), '[]'::jsonb) FROM jsonb_object_keys(_apply) k),
    'needs', _needs);
END $fn$;
REVOKE ALL ON FUNCTION public.review_orphan_edit(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_orphan_edit(UUID, TEXT, TEXT) TO authenticated;

/* وشاشة الجهة ترى ما ينتظر: حقولُ تعديلها الممسوك، وبنودٌ لم تُراجع. */
CREATE OR REPLACE FUNCTION public.org_orphans()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', o.id, 'code', o.code, 'display_name', o.display_name,
    'city', o.city, 'country', o.country, 'region', o.region,
    'status', o.status, 'monthly_need', o.monthly_need,
    'funded_monthly', o.funded_monthly, 'currency', o.currency,
    'created_at', o.created_at, 'rejection_code', o.rejection_code,
    'rejection_reason', o.rejection_reason, 'photo_consent', o.photo_consent,
    'pending_fields', COALESCE((SELECT jsonb_agg(k ORDER BY k)
                                  FROM public.orphan_pending_edits pe,
                                       jsonb_object_keys(pe.changes) k
                                 WHERE pe.orphan_id = o.id), '[]'::jsonb),
    'needs_pending_review', (SELECT count(*) FROM public.orphan_needs n
                              WHERE n.orphan_id = o.id AND NOT n.text_reviewed)
  ) ORDER BY o.created_at DESC), '[]'::jsonb)
  FROM public.orphans o
  WHERE auth.uid() IS NOT NULL AND public.owns_org(o.org_id);
$fn$;
REVOKE ALL ON FUNCTION public.org_orphans() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_orphans() TO authenticated;


-- ---------------------------------------------------------------------
-- ٨) صندوق القرارات: التعديل الممسوك، وأدوار الدائرة قبل انقضائها
-- ---------------------------------------------------------------------
-- اعتماد الدائرة ينقضي بعد سنة، والصندوق كان لا يعرض إلا «المعلّق» — فيغيب
-- المشرفون والأولياء عن أطفالهم دفعةً واحدة بلا إنذار. فالدور الذي ينقضي
-- خلال ثلاثين يوماً (أو انقضى ولم يُنهَ) يعود إلى الصندوق للتجديد
-- (`decide_enrollment_role` بالقبول يجدّده، وبالرفض يُنهيه).
CREATE OR REPLACE FUNCTION public.circle_role_renewal_window()
RETURNS INTERVAL LANGUAGE sql IMMUTABLE AS $fn$ SELECT interval '30 days' $fn$;
REVOKE ALL ON FUNCTION public.circle_role_renewal_window() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_decision_inbox()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(i)::jsonb ORDER BY i.created_at)
      FROM (
        SELECT 'orphan' AS kind, o.id, o.display_name AS title,
               'ملف ' || o.code || COALESCE(' · ' || o.region, '') AS subtitle, o.created_at
          FROM public.orphans o WHERE o.status IN ('submitted', 'under_review')
        UNION ALL
        SELECT 'orphan_edit', o.id, o.display_name,
               'تعديلٌ على ملفٍّ منشور · ' || o.code,
               COALESCE(pe.updated_at,
                        (SELECT min(n.created_at) FROM public.orphan_needs n
                          WHERE n.orphan_id = o.id AND NOT n.text_reviewed))
          FROM public.orphans o
          LEFT JOIN public.orphan_pending_edits pe ON pe.orphan_id = o.id
         WHERE o.status IN ('approved', 'fully_sponsored')
           AND (pe.orphan_id IS NOT NULL
                OR EXISTS (SELECT 1 FROM public.orphan_needs n
                            WHERE n.orphan_id = o.id AND NOT n.text_reviewed))
        UNION ALL
        SELECT 'org', c.id, c.name, COALESCE(c.city, '') || COALESCE(' · ' || c.region, ''), c.created_at
          FROM public.care_organizations c WHERE c.status = 'pending'
        UNION ALL
        SELECT 'access', a.id, o.display_name, 'طلب اطّلاع · ' || left(a.reason, 80), a.created_at
          FROM public.orphan_access_requests a JOIN public.orphans o ON o.id = a.orphan_id
         WHERE a.status = 'pending'
        UNION ALL
        SELECT 'circle_role', r.id, o.display_name,
               'دورٌ في دائرة الطفل · ' || r.role::text || COALESCE(' · ' || r.person_name, ''),
               r.assigned_at
          FROM public.enrollment_roles r
          JOIN public.program_enrollments e ON e.id = r.enrollment_id
          JOIN public.orphans o ON o.id = e.orphan_id
         WHERE r.approval = 'pending' AND r.ended_at IS NULL
        UNION ALL
        SELECT 'circle_role_renewal', r.id, o.display_name,
               'تجديد دورٍ في دائرة الطفل · ' || r.role::text || COALESCE(' · ' || r.person_name, '')
                 || CASE WHEN r.expires_at <= now() THEN ' · انقضى' ELSE ' · ينقضي قريباً' END,
               r.expires_at
          FROM public.enrollment_roles r
          JOIN public.program_enrollments e ON e.id = r.enrollment_id
          JOIN public.orphans o ON o.id = e.orphan_id
         WHERE r.approval = 'approved' AND r.ended_at IS NULL AND r.person_id IS NOT NULL
           AND r.expires_at < now() + public.circle_role_renewal_window()
        UNION ALL
        SELECT 'donor', e.id, e.name, 'جهة مانحة · ' || e.entity_type, e.created_at
          FROM public.donor_entities e WHERE e.status = 'pending'
        UNION ALL
        SELECT 'progress_report', r.id, o.display_name, 'تقرير جهة · ' || r.period, r.created_at
          FROM public.progress_reports r JOIN public.orphans o ON o.id = r.orphan_id
         WHERE r.status = 'submitted'
        UNION ALL
        SELECT 'office_report', r.id, r.title, 'تقرير ' || f.name, r.created_at
          FROM public.office_reports r JOIN public.offices f ON f.id = r.office_id
         WHERE r.status = 'submitted'
        UNION ALL
        SELECT 'pledge', p.id,
               CASE p.kind WHEN 'in_kind' THEN 'دعم عيني' ELSE 'بناء أهلية' END,
               p.amount::text || ' ' || p.currency || ' · ' || p.target_type, p.created_at
          FROM public.support_pledges p WHERE p.status = 'pending'
        UNION ALL
        SELECT 'unlock', r.id, o.display_name,
               'طلب فكّ · ' || r.op || ' · ' || cardinality(r.approvals) || '/' || public.unlock_quorum(),
               r.created_at
          FROM public.unlock_requests r JOIN public.orphans o ON o.id = r.orphan_id
         WHERE r.status = 'pending' AND r.requested_by <> auth.uid() AND auth.uid() <> ALL (r.approvals)
        UNION ALL
        SELECT 'discrepancy', d.id, o.display_name, 'اختلافٌ من ' || COALESCE(d.source, 'المصدر'), d.created_at
          FROM public.integrity_discrepancies d JOIN public.orphans o ON o.id = d.orphan_id
         WHERE d.status = 'open'
      ) i), '[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_decision_inbox() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decision_inbox() TO authenticated;

/* سياق دور الدائرة — للإسناد الجديد وللتجديد معاً، ومعه الأجل. */
CREATE OR REPLACE FUNCTION public.admin_circle_role_context(_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT jsonb_build_object(
           'role', r.role, 'person_name', r.person_name,
           'person_email', u.email, 'person_contact', r.person_contact,
           'code', o.code, 'name', o.display_name, 'program', p.title,
           'org', c.name, 'assigned_by_email', ab.email,
           'note', r.note, 'approval', r.approval, 'expires_at', r.expires_at,
           'created_at', r.assigned_at)
    FROM public.enrollment_roles r
    JOIN public.program_enrollments e ON e.id = r.enrollment_id
    JOIN public.programs p ON p.id = e.program_id
    JOIN public.orphans o ON o.id = e.orphan_id
    LEFT JOIN public.care_organizations c ON c.id = o.org_id
    LEFT JOIN auth.users u ON u.id = r.person_id
    LEFT JOIN auth.users ab ON ab.id = r.assigned_by
   WHERE r.id = _id AND public.is_admin();
$fn$;
REVOKE ALL ON FUNCTION public.admin_circle_role_context(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_decision_context(_kind TEXT, _id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  RETURN CASE _kind
    WHEN 'org' THEN (SELECT to_jsonb(c) - 'owner_id' FROM public.care_organizations c WHERE c.id = _id)
    WHEN 'donor' THEN (SELECT to_jsonb(e) || jsonb_build_object('members',
                         (SELECT count(*) FROM public.donor_members m WHERE m.entity_id = e.id))
                         FROM public.donor_entities e WHERE e.id = _id)
    WHEN 'progress_report' THEN (SELECT to_jsonb(r) FROM public.progress_reports r WHERE r.id = _id)
    WHEN 'office_report' THEN (SELECT to_jsonb(r) || jsonb_build_object('office', f.name,
                                 'attachments_count', cardinality(r.attachments)) - 'attachments'
                                 FROM public.office_reports r JOIN public.offices f ON f.id = r.office_id
                                WHERE r.id = _id)
    WHEN 'pledge' THEN (SELECT to_jsonb(p) - 'supporter_id' FROM public.support_pledges p WHERE p.id = _id)
    WHEN 'orphan' THEN (SELECT jsonb_build_object('id', o.id, 'code', o.code, 'name', o.display_name,
                          'region', o.region, 'need', o.monthly_need, 'status', o.status,
                          'story', o.story, 'created_at', o.created_at)
                          FROM public.orphans o WHERE o.id = _id)
    WHEN 'orphan_edit' THEN (SELECT jsonb_build_object(
                          'code', o.code, 'name', o.display_name, 'status', o.status,
                          'proposed', pe.changes, 'published', pe.previous,
                          'via', pe.via, 'created_at', COALESCE(pe.updated_at, o.updated_at),
                          'needs_text', (SELECT jsonb_agg(jsonb_build_object(
                                            'category', n.category, 'title', n.title,
                                            'notes', n.notes, 'amount', n.monthly_amount)
                                          ORDER BY n.created_at)
                                           FROM public.orphan_needs n
                                          WHERE n.orphan_id = o.id AND NOT n.text_reviewed))
                          FROM public.orphans o
                          LEFT JOIN public.orphan_pending_edits pe ON pe.orphan_id = o.id
                         WHERE o.id = _id)
    WHEN 'circle_role' THEN public.admin_circle_role_context(_id)
    WHEN 'circle_role_renewal' THEN public.admin_circle_role_context(_id)
    ELSE NULL END;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_decision_context(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decision_context(TEXT, UUID) TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261106140000', 'phase0_review_fixes');

COMMIT;
