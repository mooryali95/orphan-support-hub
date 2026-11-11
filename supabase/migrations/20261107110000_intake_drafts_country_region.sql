-- =====================================================================
-- الدفعة ٢ — ملفّ الطفل: مسودّةٌ في الخادم، وتصحيحٌ بعد الرفض، ودولةٌ وعملة
-- ---------------------------------------------------------------------
--   UX-04   الملفّ المرفوض أو المسودّة أو المُقدَّم بلا إجراء: لا «أكمل» ولا
--           «صحّح» ولا عرض. والمسودّة في متصفّحٍ واحد (بلا حقولها السرّية)،
--           فلا تُستأنف من جهازٍ آخر، ولا يُفتح المرفوض بما فيه.
--   UX-10   الدولة لا تُسأل (فيبقى الافتراضي 'SA' لطفلٍ في ألبانيا)، والمنطقة
--           نصٌّ حرّ لا يطابق أسماء الخارطة فيختفي من التفصيل.
--   A11Y-06 العملة «$» ثابتة في نموذج ملفٍّ تجريبه باليورو.
--
-- الآن:
--   • `countries.currency` — عملة الدولة (يورو لألبانيا وكوسوفو)، والمنصّة
--     احتياطٌ لما لا عملة له. ملفّ الطفل يأخذ عملة دولته.
--   • `create_orphan_intake` بتوقيعه: الدولة من الدول العاملة (أو دولة الجهة)،
--     يُكتب اسمها كما يقرؤه الدليل والخارطة ورمزها، والعملة معها. وفي إعادة
--     التقديم تُستبدل الوثائق: غير الموثَّق ممّا لم يعد في الملفّ يُحذف،
--     والموثَّق باقٍ لا يُمسّ.
--   • `save_orphan_draft` — حفظ المسودّة أو المرفوض في القاعدة بمعرّف الملف،
--     كاملةً (والسرّية في `orphan_private` كما عند التقديم)، بلا تغيير حال.
--   • `get_orphan_intake` — الملفّ كما في القاعدة لجهته: يملأ النموذج للتصحيح،
--     ويُعرض للقراءة وهو قيد المراجعة.
-- =====================================================================

ALTER TABLE public.countries ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE public.countries DROP CONSTRAINT IF EXISTS countries_currency_check;
ALTER TABLE public.countries
  ADD CONSTRAINT countries_currency_check CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
-- التجربة باليورو: ألبانيا (الكفالة باليورو لا باللِك) وكوسوفو.
UPDATE public.countries SET currency = 'EUR' WHERE code IN ('AL', 'XK') AND currency IS NULL;

/* الدولة التي يُكتب بها الملفّ: ما اختارته الجهة إن كانت عاملة، وإلا دولة
   الجهة. وعملتها، أو عملة المنصّة. */
CREATE OR REPLACE FUNCTION public.intake_country(_requested TEXT, _org UUID)
RETURNS TABLE (code TEXT, name_ar TEXT, currency TEXT)
LANGUAGE plpgsql STABLE SET search_path = public AS $fn$
DECLARE _code TEXT := NULLIF(upper(btrim(COALESCE(_requested, ''))), '');
BEGIN
  IF _code IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.countries c
                    WHERE c.code = _code AND c.status IN ('active', 'emergency')) THEN
      RAISE EXCEPTION 'intake: country % is not an operating country', _code USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT co.country_code INTO _code FROM public.care_organizations co WHERE co.id = _org;
  END IF;
  IF _code IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT c.code, c.name_ar,
           COALESCE(c.currency, (SELECT s.currency FROM public.platform_settings s WHERE s.id))
      FROM public.countries c WHERE c.code = _code;
END $fn$;
REVOKE ALL ON FUNCTION public.intake_country(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intake_country(TEXT, UUID) TO authenticated;

/* استبدال الوثائق: لا حذف للمسجَّل على `orphan_documents`، فيُحذف هنا
   بصلاحية المالك — لملفٍّ في جهة المستدعي، مسودّةً أو مرفوضاً، وغير
   الموثَّق وحده. */
CREATE OR REPLACE FUNCTION public.prune_intake_documents(_orphan UUID, _org UUID, _keep TEXT[])
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _n INTEGER;
BEGIN
  IF NOT public.orphan_in_my_org(_orphan, _org)
     OR NOT EXISTS (SELECT 1 FROM public.orphans WHERE id = _orphan AND status IN ('draft', 'rejected')) THEN
    RAISE EXCEPTION 'intake: file % is not yours or no longer editable', _orphan USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.orphan_documents
   WHERE orphan_id = _orphan AND NOT verified
     AND storage_path <> ALL (COALESCE(_keep, ARRAY[]::text[]));
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $fn$;
REVOKE ALL ON FUNCTION public.prune_intake_documents(UUID, UUID, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_intake_documents(UUID, UUID, TEXT[]) TO authenticated;

/* ما يكتبه التقديم والمسودّة معاً: السرّي، والبنود، والوثائق. بصلاحية
   المستدعي (سياسات `can_manage_orphan`)، كما كانت `create_orphan_intake`. */
CREATE OR REPLACE FUNCTION public.intake_write_details(_orphan UUID, _org UUID, _payload JSONB, _replace_docs BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE _need JSONB; _doc JSONB; _total NUMERIC(12,2) := 0;
BEGIN
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

  DELETE FROM public.orphan_needs WHERE orphan_id = _orphan;
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
    _total := _total + COALESCE((_need->>'monthly_amount')::numeric, 0);
  END LOOP;

  IF _total = 0 THEN
    UPDATE public.orphans
       SET monthly_need = COALESCE(NULLIF(_payload->>'monthly_need', '')::numeric, 0)
     WHERE id = _orphan;
  END IF;

  IF _replace_docs THEN
    PERFORM public.prune_intake_documents(_orphan, _org,
      ARRAY(SELECT d->>'storage_path'
              FROM jsonb_array_elements(COALESCE(_payload->'documents', '[]'::jsonb)) d));
  END IF;

  FOR _doc IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'documents', '[]'::jsonb))
  LOOP
    -- المجلّد الأوّل معرّف الملف نفسه: لا يُنسب إليه ملفُّ طفلٍ آخر.
    IF split_part(_doc->>'storage_path', '/', 1) <> _orphan::text THEN
      RAISE EXCEPTION 'intake: document % is outside this file', _doc->>'storage_path'
        USING ERRCODE = '42501';
    END IF;
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
END $fn$;
REVOKE ALL ON FUNCTION public.intake_write_details(UUID, UUID, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intake_write_details(UUID, UUID, JSONB, BOOLEAN) TO authenticated;

-- التوقيع كما هو؛ الجديد: الدولة والعملة، واستبدال الوثائق في إعادة التقديم.
CREATE OR REPLACE FUNCTION public.create_orphan_intake(_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _org_id UUID := (_payload->>'org_id')::uuid;
  _orphan UUID := NULLIF(_payload->>'orphan_id', '')::uuid;
  _code TEXT;
  _country RECORD;
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

  SELECT * INTO _country FROM public.intake_country(_payload->>'country', _org_id);

  IF _orphan IS NULL THEN
    _code := public.next_orphan_code();
    INSERT INTO public.orphans (
      code, org_id, created_by, display_name, gender, birth_date,
      city, region, education_stage, story, monthly_need, status,
      country, currency
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
      'submitted',
      COALESCE(_country.name_ar, 'SA'),
      COALESCE(_country.currency, 'USD')
    ) RETURNING id INTO _orphan;
  ELSE
    -- الوثائق تُستبدل قبل أن يغادر الملفّ «المسودّة/المرفوض».
    IF NOT public.orphan_in_my_org(_orphan, _org_id)
       OR NOT EXISTS (SELECT 1 FROM public.orphans WHERE id = _orphan AND status IN ('draft', 'rejected')) THEN
      RAISE EXCEPTION 'intake: draft % is not yours or no longer editable', _orphan
        USING ERRCODE = '42501';
    END IF;
    PERFORM public.prune_intake_documents(_orphan, _org_id,
      ARRAY(SELECT d->>'storage_path'
              FROM jsonb_array_elements(COALESCE(_payload->'documents', '[]'::jsonb)) d));

    UPDATE public.orphans SET
      display_name    = _payload->>'display_name',
      gender          = COALESCE(_payload->>'gender', 'male'),
      birth_date      = NULLIF(_payload->>'birth_date', '')::date,
      city            = NULLIF(_payload->>'city', ''),
      region          = NULLIF(_payload->>'region', ''),
      education_stage = NULLIF(_payload->>'education_stage', ''),
      story           = NULLIF(_payload->>'story', ''),
      country         = COALESCE(_country.name_ar, country),
      currency        = COALESCE(_country.currency, currency),
      status          = 'submitted',
      updated_at      = now()
    WHERE id = _orphan AND public.orphan_in_my_org(id, _org_id)
      AND status IN ('draft', 'rejected');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'intake: draft % is not yours or no longer editable', _orphan
        USING ERRCODE = '42501';
    END IF;

    _code := (SELECT code FROM public.orphans WHERE id = _orphan);
  END IF;

  PERFORM public.intake_write_details(_orphan, _org_id, _payload, false);

  PERFORM public.write_audit('orphan.submitted', 'orphan', _orphan,
    jsonb_build_object('code', _code, 'org_id', _org_id,
                       'needs', jsonb_array_length(COALESCE(_payload->'needs', '[]'::jsonb)),
                       'documents', jsonb_array_length(COALESCE(_payload->'documents', '[]'::jsonb))));

  RETURN jsonb_build_object('id', _orphan, 'code', _code);
END $function$;
REVOKE ALL ON FUNCTION public.create_orphan_intake(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_orphan_intake(JSONB) TO authenticated;

/* المسودّة في القاعدة بمعرّف ملفّها: تُستأنف من أيّ جهاز، ولا تبقى في
   متصفّحٍ مشترك. الحال لا تتغيّر — المرفوض يبقى مرفوضاً حتى يُعاد تقديمه. */
CREATE OR REPLACE FUNCTION public.save_orphan_draft(_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE
  _org_id UUID := NULLIF(_payload->>'org_id', '')::uuid;
  _orphan UUID := NULLIF(_payload->>'orphan_id', '')::uuid;
  _country RECORD;
  _code TEXT;
BEGIN
  IF _org_id IS NULL OR _orphan IS NULL THEN
    RAISE EXCEPTION 'draft: org_id and orphan_id are required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.orphan_in_my_org(_orphan, _org_id)
     OR NOT EXISTS (SELECT 1 FROM public.orphans WHERE id = _orphan AND status IN ('draft', 'rejected')) THEN
    RAISE EXCEPTION 'draft: file % is not yours or no longer editable', _orphan USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _country FROM public.intake_country(_payload->>'country', _org_id);

  UPDATE public.orphans SET
    display_name    = COALESCE(NULLIF(btrim(_payload->>'display_name'), ''), display_name),
    gender          = COALESCE(NULLIF(_payload->>'gender', ''), gender),
    birth_date      = NULLIF(_payload->>'birth_date', '')::date,
    city            = NULLIF(_payload->>'city', ''),
    region          = NULLIF(_payload->>'region', ''),
    education_stage = NULLIF(_payload->>'education_stage', ''),
    story           = NULLIF(_payload->>'story', ''),
    country         = COALESCE(_country.name_ar, country),
    currency        = COALESCE(_country.currency, currency),
    updated_at      = now()
  WHERE id = _orphan
  RETURNING code INTO _code;

  PERFORM public.intake_write_details(_orphan, _org_id, _payload, true);

  RETURN jsonb_build_object('id', _orphan, 'code', _code, 'saved_at', now());
END $fn$;
REVOKE ALL ON FUNCTION public.save_orphan_draft(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_orphan_draft(JSONB) TO authenticated;

/* الملفّ كما في القاعدة، لجهته وحدها — قبل النشر. بعده له البروفايل. */
CREATE OR REPLACE FUNCTION public.get_orphan_intake(_orphan UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _out JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', o.id, 'code', o.code, 'org_id', o.org_id, 'status', o.status,
    'editable', o.status IN ('draft', 'rejected'),
    'rejection_code', o.rejection_code, 'rejection_reason', o.rejection_reason,
    'display_name', o.display_name, 'gender', o.gender, 'birth_date', o.birth_date,
    'city', o.city, 'region', o.region, 'country_code', o.country_code,
    'education_stage', o.education_stage, 'story', o.story,
    'monthly_need', o.monthly_need, 'currency', o.currency, 'updated_at', o.updated_at,
    'private', (SELECT jsonb_build_object(
                  'full_name', p.full_name, 'national_id', p.national_id,
                  'guardian_name', p.guardian_name, 'guardian_relation', p.guardian_relation,
                  'guardian_phone', p.guardian_phone, 'address', p.address,
                  'family_size', p.family_size, 'family_income', p.family_income,
                  'health_notes', p.health_notes, 'school_name', p.school_name,
                  'private_notes', p.notes)
                  FROM public.orphan_private p WHERE p.orphan_id = o.id),
    'needs', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                          'category', n.category, 'title', n.title,
                          'monthly_amount', n.monthly_amount, 'note', n.notes)
                          ORDER BY n.created_at, n.id)
                         FROM public.orphan_needs n WHERE n.orphan_id = o.id), '[]'::jsonb),
    'documents', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                              'id', d.id, 'kind', d.kind, 'storage_path', d.storage_path,
                              'file_name', d.file_name, 'mime_type', d.mime_type,
                              'size_bytes', d.size_bytes, 'verified', d.verified, 'note', d.note)
                              ORDER BY d.created_at)
                             FROM public.orphan_documents d WHERE d.orphan_id = o.id), '[]'::jsonb))
    INTO _out
    FROM public.orphans o
   WHERE o.id = _orphan
     AND o.status IN ('draft', 'submitted', 'under_review', 'rejected')
     AND auth.uid() IS NOT NULL
     AND public.orphan_in_my_org(o.id, o.org_id);
  IF _out IS NULL THEN
    RAISE EXCEPTION 'intake: file % is not yours or not in intake', _orphan USING ERRCODE = '42501';
  END IF;
  RETURN _out;
END $fn$;
REVOKE ALL ON FUNCTION public.get_orphan_intake(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_orphan_intake(UUID) TO authenticated;
