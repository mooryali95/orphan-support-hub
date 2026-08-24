-- =====================================================================
-- M5 — التمويل الزائد: يُقترَح لا يُرفَض
-- =====================================================================
-- كان بلا سقف: كافل يدفع 200$ لملفٍ متبقّيه 40$، فيذهب 160$ إلى طفل
-- مكفول بينما ينتظر غيره.
--
-- والرفض ليس الجواب: كافل يُردّ عند لحظة العطاء قد لا يعود. فالسياسة
-- المعتمدة **الاقتراح**: يُعرض عليه المتبقّي الحقيقي، وتُقترح ملفّات
-- يغطّي فائضه احتياجها. فإن أصرّ على هذا الطفل بعينه — وهو حقّه، فقد
-- يكون اختاره لسبب — قُبل عطاؤه كاملاً وظهر على الملف **بوصفه فائضاً
-- مُكرَّماً لا خطأً**.
-- =====================================================================

-- ---------------------------------------------------------------------
-- حال التمويل: الفائض قيمة مستقلّة لا نسبة تتجاوز المئة
-- ---------------------------------------------------------------------
-- النسبة تُسقَف عند 100 في الواجهة عمداً (شريط عند 140٪ يُقرأ عطلاً).
-- فالفائض يُحسب هنا رقماً مستقلّاً، ويُعرض بوصفه شيئاً آخر لا امتداداً
-- للشريط.
CREATE OR REPLACE FUNCTION public.orphan_funding_state(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _need NUMERIC(12,2);
  _funded NUMERIC(12,2);
  _cur TEXT;
  _surplus NUMERIC(12,2);
BEGIN
  SELECT monthly_need, funded_monthly, currency
    INTO _need, _funded, _cur
    FROM public.orphans
   WHERE id = _orphan AND status IN ('approved', 'fully_sponsored');

  IF _need IS NULL THEN RETURN NULL; END IF;

  _surplus := GREATEST(_funded - _need, 0);

  RETURN jsonb_build_object(
    'need', _need,
    'funded', _funded,
    'currency', _cur,
    'gap', GREATEST(_need - _funded, 0),
    'surplus', _surplus,
    -- ما يفتحه الفائض: أرخص برنامج نشط لم يلتحق به الطفل بعدُ ويغطّيه
    -- الفائض. فيصير الزائد ترقيةً معروضة لا رقماً معلّقاً.
    'surplus_unlocks', (
      SELECT jsonb_build_object('title', p.title, 'summary', p.summary,
                                'monthly_price', p.monthly_price, 'slug', p.slug)
        FROM public.programs p
       WHERE p.status = 'active'
         AND p.monthly_price <= _surplus
         AND NOT EXISTS (
           SELECT 1 FROM public.program_enrollments e
            WHERE e.orphan_id = _orphan AND e.program_id = p.id
              AND e.status IN ('proposed', 'funded', 'paused'))
       ORDER BY p.monthly_price DESC
       LIMIT 1
    )
  );
END $fn$;
REVOKE ALL ON FUNCTION public.orphan_funding_state(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orphan_funding_state(UUID) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- الاقتراح: ملفّات يغطّي الفائض احتياجها
-- ---------------------------------------------------------------------
-- الترتيب بقرب الفجوة من المبلغ لا بالفجوة وحدها: اقتراح ملفّ متبقّيه
-- 500$ لفائض 60$ اقتراحٌ لا يُنفَّذ. والأقرب هو الذي يُكمله العطاء فعلاً.
--
-- والأعمدة المُعادة عامة حصراً — نفس تقييد H2: لا guardian_id ولا
-- created_by ولا مرجع خارجي.
CREATE OR REPLACE FUNCTION public.suggest_orphans_for_amount(
  _amount NUMERIC, _exclude UUID DEFAULT NULL, _limit INTEGER DEFAULT 3
)
RETURNS TABLE (
  id UUID, code TEXT, display_name TEXT, city TEXT, region TEXT,
  education_stage TEXT, photo_url TEXT, currency TEXT,
  monthly_need NUMERIC, funded_monthly NUMERIC, gap NUMERIC
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $fn$
  SELECT o.id, o.code, o.display_name, o.city, o.region,
         o.education_stage, o.photo_url, o.currency,
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

-- ---------------------------------------------------------------------
-- أثر العطاء الزائد
-- ---------------------------------------------------------------------
-- الكفالة التي تجاوزت المتبقّي تُوسَم، فيُعرف لاحقاً أن الكافل اختار
-- ذلك عن علم — لا أن النظام سمح به سهواً.
ALTER TABLE public.sponsorships
  ADD COLUMN IF NOT EXISTS exceeds_gap BOOLEAN NOT NULL DEFAULT false,
  -- المبلغ الذي جاوز المتبقّي وقت الإنشاء، للتدقيق والتقارير.
  ADD COLUMN IF NOT EXISTS excess_at_creation NUMERIC(12,2);

-- الوسم يُحسب في القاعدة لا يُرسله العميل: كفالة تُعلن نفسها «غير
-- زائدة» تُخفي ما وُضع الوسم لإظهاره.
CREATE OR REPLACE FUNCTION public.mark_sponsorship_excess()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE _gap NUMERIC(12,2);
BEGIN
  SELECT GREATEST(monthly_need - funded_monthly, 0) INTO _gap
    FROM public.orphans WHERE id = NEW.orphan_id;

  IF _gap IS NULL THEN RETURN NEW; END IF;

  NEW.exceeds_gap := NEW.amount > _gap;
  NEW.excess_at_creation := GREATEST(NEW.amount - _gap, 0);
  RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.mark_sponsorship_excess() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_mark_sponsorship_excess ON public.sponsorships;
CREATE TRIGGER trg_mark_sponsorship_excess
BEFORE INSERT ON public.sponsorships
FOR EACH ROW EXECUTE FUNCTION public.mark_sponsorship_excess();
