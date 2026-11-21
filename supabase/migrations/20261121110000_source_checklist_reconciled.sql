-- =====================================================================
-- قائمة تفعيل المصدر: «المطابقة النظيفة» كانت لا تتحقّق أبداً
-- ---------------------------------------------------------------------
-- `mirror_reconcile` يكتب في `mirror_sync_state.drift` كائناً دائماً، حتى
-- حين لا فرق: {checked_at, upstream, here, missing_here: [], missing_upstream: []}.
-- وشرط `reconciled` في `source_checklist` (هجرة 0922) كان يعدّ أيّ كائنٍ
-- غير فارغٍ انحرافاً، فتبقى القائمة ناقصةً بعد مطابقةٍ نظيفة، ولا يقبل
-- `admin_set_source(…, 'active')` تفعيل أيّ منصّة تشغيل. وتنبيه تأخّر
-- المرآة (`mirror_lag` في ops_health) يراقب المصادر `active` وحدها، فلا
-- يعمل هو أيضاً.
--
-- الآن: المطابقة نظيفة حين جرت مطابقةٌ (`last_reconcile_at`) وليس في أيّ
-- كيانٍ معرّفٌ ناقصٌ هنا ولا زائدٌ هنا. لا تغيير في الجداول ولا الصلاحيات
-- (CREATE OR REPLACE يُبقي ما مُنح وما سُحب).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.source_checklist(_key TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT jsonb_build_object(
    'key_issued', EXISTS (SELECT 1 FROM public.api_clients c WHERE c.source = p.key AND c.active
                           AND c.revoked_at IS NULL AND 'mirror:write' = ANY (c.scopes)),
    'first_sync', EXISTS (SELECT 1 FROM public.mirror_sync_state m WHERE m.source = p.key AND m.last_run_at IS NOT NULL),
    'reconciled', p.last_reconcile_at IS NOT NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM public.mirror_sync_state m
                     WHERE m.source = p.key
                       AND jsonb_typeof(m.drift) = 'object'
                       AND (   (jsonb_typeof(m.drift->'missing_here') = 'array'
                                AND jsonb_array_length(m.drift->'missing_here') > 0)
                            OR (jsonb_typeof(m.drift->'missing_upstream') = 'array'
                                AND jsonb_array_length(m.drift->'missing_upstream') > 0))),
    'org_linked', p.org_id IS NOT NULL,
    'office_reviewed', p.office_reviewed,
    'regions_mapped', p.regions_mapped)
  FROM public.operating_platforms p WHERE p.key = _key;
$fn$;
REVOKE ALL ON FUNCTION public.source_checklist(TEXT) FROM PUBLIC, anon, authenticated;
