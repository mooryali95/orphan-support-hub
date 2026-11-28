-- =====================================================================
-- المراجعة الأمنية الثالثة (N1 وN2 وN3 وN6)
-- ---------------------------------------------------------------------
-- N1: الرفع إلى child-updates يشترط اسماً بصيغة child_update_path_ok،
--     وحصّةً يومية لكلّ مستخدم؛ والاستبقاء يسرد الكائنات التي مضى عليها
--     يومٌ بلا صفٍّ في child_updates فيحذفها الخادم.
-- N2: admin_search لا يعيد الكفلاء والكفالات والتحويلات إلا بجلسة aal2،
--     ويكتب security_event بطول الاستعلام وعدد النتائج وحدهما، وله حدّ معدّل.
-- N3: child_update_review يفحص وجود البند ونطاق الدولة قبل رفض المصادقة
--     الثنائية، وتكرار الرفض من المستخدم نفسه للفعل نفسه في الدقيقة سطرٌ واحد.
-- N6: security_events_recent للمجدول: عدد أحداث sec_* في الساعة الأخيرة.
-- الأجسام مأخوذة من pg_get_functiondef الحيّة ثم عُدّلت.
-- =====================================================================

-- ---------------------------------------------------------------------
-- N1: سياسة الرفع
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.child_update_upload_quota()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$ SELECT 60 $function$;

CREATE OR REPLACE FUNCTION public.can_upload_child_update(_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     -- الاسم نفسه الذي يقبله child_update_create، فلا يدخل الخزنة ما لن يُسجَّل.
     AND public.child_update_path_ok(public.child_update_orphan_of(_path), _path,
                                     ARRAY['jpg', 'jpeg', 'png', 'webp', 'mp4'])
     -- حصّة يومية لكلّ مستخدم: لا يملأ عضو فريقٍ الخزنة بلا حدّ.
     AND (SELECT count(*) FROM storage.objects so
           WHERE so.bucket_id = 'child-updates' AND so.owner = auth.uid()
             AND so.created_at > now() - interval '1 day') < public.child_update_upload_quota()
     AND EXISTS (
    SELECT 1 FROM public.orphans o
     WHERE o.id = public.child_update_orphan_of(_path)
       AND o.country_code IS NOT NULL
       AND public.country_can(o.country_code, 'upload')
       AND NOT public.orphan_frozen(o.id));
$function$;

-- ---------------------------------------------------------------------
-- N1: الكائنات اليتيمة (بلا صفّ) بعد يوم
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.child_updates_stray_objects(_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('ok', true, 'paths', COALESCE(jsonb_agg(x.name ORDER BY x.name), '[]'::jsonb))
    FROM (SELECT so.name FROM storage.objects so
           WHERE so.bucket_id = 'child-updates'
             AND so.created_at < now() - interval '24 hours'
             AND NOT EXISTS (SELECT 1 FROM public.child_updates u
                              WHERE u.storage_path = so.name OR u.poster_path = so.name)
           ORDER BY so.name
           LIMIT GREATEST(1, LEAST(COALESCE(_limit, 500), 1000))) x;
$function$;

CREATE OR REPLACE FUNCTION public.child_updates_stray_done(_deleted integer)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  SELECT NULL, 'child_updates_stray_purge', 'child_updates', NULL, jsonb_build_object('deleted', _deleted)
   WHERE COALESCE(_deleted, 0) > 0;
$function$;

REVOKE ALL ON FUNCTION public.child_updates_stray_objects(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.child_updates_stray_done(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.child_updates_stray_objects(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.child_updates_stray_done(integer) TO service_role;

-- ---------------------------------------------------------------------
-- N2: البحث الإداري
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_search(text, integer);
CREATE FUNCTION public.admin_search(_q text, _limit integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _n INTEGER := LEAST(GREATEST(COALESCE(_limit, 6), 1), 20);
  _canon TEXT := public.golden_canon(left(COALESCE(_q, ''), 80));
  _raw TEXT := btrim(left(COALESCE(_q, ''), 80));
  _like TEXT; _rlike TEXT; _admin BOOLEAN := public.is_admin();
  _strong BOOLEAN := public.session_strong();
  _rl JSONB; _out JSONB; _count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501'; END IF;
  IF NOT _admin AND NOT EXISTS (SELECT 1 FROM public.country_staff s WHERE s.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;
  IF _canon IS NULL OR length(_canon) < 2 THEN
    RETURN jsonb_build_object('children', '[]'::jsonb, 'sponsors', '[]'::jsonb,
                              'sponsorships', '[]'::jsonb, 'transfers', '[]'::jsonb);
  END IF;
  -- حدّ المعدّل في القاعدة نفسها: لا يُسرد دليل الكفلاء بالتكرار ولو تجاوز الطالب الخادم.
  _rl := public.hit_rate_limit('admin_search', 'u:' || auth.uid()::text, 30, 60);
  IF NOT (_rl->>'allowed')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'code', 'rate_limited');
  END IF;
  _like := '%' || replace(replace(replace(_canon, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  _rlike := replace(replace(replace(lower(_raw), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  _out := jsonb_build_object(
    -- ما تعرضه قوائم الإدارة من الطفل لا أكثر؛ النطاق قبل المطابقة.
    'children', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', o.id, 'code', o.code, 'name', o.display_name,
                                'country', o.country_code, 'status', o.status) AS x
        FROM public.orphans o
       WHERE (_admin OR (o.country_code IS NOT NULL AND public.country_can(o.country_code, 'read')))
         AND (lower(o.code) LIKE _rlike OR public.golden_canon(o.display_name) LIKE _like)
       ORDER BY (lower(o.code) LIKE _rlike) DESC, o.code
       LIMIT _n) s), '[]'::jsonb),
    -- بيانات الكفلاء الشخصية بجلسة aal2 وحدها (N2).
    'sponsors', CASE WHEN NOT (_admin AND _strong) THEN '[]'::jsonb ELSE COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', u.id, 'name', p.full_name, 'email', u.email) AS x
        FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
       WHERE lower(u.email) LIKE '%' || _rlike OR public.golden_canon(p.full_name) LIKE _like
       ORDER BY u.email
       LIMIT _n) s), '[]'::jsonb) END,
    'sponsorships', CASE WHEN NOT (_admin AND _strong) THEN '[]'::jsonb ELSE COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', sp.id, 'status', sp.status, 'amount', sp.amount, 'currency', sp.currency,
                                'code', o.code, 'child', o.display_name, 'sponsor', COALESCE(p.full_name, u.email),
                                'created_at', sp.created_at) AS x
        FROM public.sponsorships sp
        JOIN public.orphans o ON o.id = sp.orphan_id
        LEFT JOIN auth.users u ON u.id = sp.sponsor_id
        LEFT JOIN public.profiles p ON p.id = sp.sponsor_id
       WHERE lower(sp.id::text) LIKE _rlike OR lower(o.code) LIKE _rlike
          OR lower(u.email) LIKE '%' || _rlike OR public.golden_canon(p.full_name) LIKE _like
       ORDER BY sp.created_at DESC
       LIMIT _n) s), '[]'::jsonb) END,
    -- التحويل البنكي: مرجعه أوّل ثمانية من معرّف الكفالة (كما في صندوق القرارات)، أو مرجع البنك.
    'transfers', CASE WHEN NOT (_admin AND _strong) THEN '[]'::jsonb ELSE COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object('id', sp.id, 'ref', upper(left(sp.id::text, 8)), 'amount', sp.amount,
                                'currency', sp.currency, 'status', sp.status, 'code', o.code,
                                'bank_reference', r.bank_reference, 'created_at', sp.created_at) AS x
        FROM public.sponsorships sp
        JOIN public.orphans o ON o.id = sp.orphan_id
        LEFT JOIN LATERAL (SELECT m.bank_reference FROM public.manual_transfer_reconciliations m
                            WHERE m.sponsorship_id = sp.id ORDER BY m.confirmed_at DESC LIMIT 1) r ON true
       WHERE (lower(left(sp.id::text, 8)) LIKE _rlike OR lower(r.bank_reference) LIKE '%' || _rlike)
         AND (r.bank_reference IS NOT NULL OR public.awaits_manual_transfer(sp.id))
       ORDER BY sp.created_at DESC
       LIMIT _n) s), '[]'::jsonb) END,
    'mfa_required', _admin AND NOT _strong);
  _count := jsonb_array_length(_out->'children') + jsonb_array_length(_out->'sponsors')
          + jsonb_array_length(_out->'sponsorships') + jsonb_array_length(_out->'transfers');
  -- الأثر بلا نصّ الاستعلام: طوله وعدد النتائج ونوع الجلسة.
  PERFORM public.security_event('admin_search',
    jsonb_build_object('q_len', length(_raw), 'results', _count, 'aal2', _strong));
  RETURN _out;
END $function$;

REVOKE ALL ON FUNCTION public.admin_search(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search(text, integer) TO authenticated;

-- ---------------------------------------------------------------------
-- N3: الرفض المتكرّر سطرٌ واحد لكلّ مستخدم وفعلٍ في الدقيقة
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mfa_refusal(_action text, _orphan uuid, _detail jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.integrity_log l
                  WHERE l.kind = 'sec_mfa_required' AND l.actor = auth.uid()
                    AND l.detail->>'action' = _action
                    AND l.at > now() - interval '1 minute') THEN
    PERFORM public.security_event('mfa_required', COALESCE(_detail, '{}'::jsonb) || jsonb_build_object('action', _action), _orphan);
  END IF;
  RETURN jsonb_build_object('ok', false, 'code', 'mfa_required');
END $function$;

CREATE INDEX IF NOT EXISTS idx_integrity_sec_actor ON public.integrity_log (actor, at DESC)
  WHERE kind = 'sec_mfa_required';

-- ---------------------------------------------------------------------
-- N3: الوجود والنطاق قبل رفض المصادقة الثنائية
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.child_update_review(_id uuid, _decision text, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _u public.child_updates; _why text := NULLIF(btrim(COALESCE(_reason, '')), '');
BEGIN
  SELECT * INTO _u FROM public.child_updates WHERE id = _id FOR UPDATE;
  -- معرّفٌ مجهول أو دولةٌ أخرى: رفضٌ واحد لا يكشف شيئاً ولا يكتب في سجلّ السلامة.
  IF _u.id IS NULL OR NOT public.country_can(_u.country_code, 'read') THEN
    RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501';
  END IF;
  IF public.approver_needs_mfa(_u.country_code) THEN
    RETURN public.mfa_refusal('child_update_review', _u.orphan_id, jsonb_build_object('update', _id));
  END IF;
  IF NOT public.country_can(_u.country_code, 'approve') THEN
    RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501';
  END IF;
  IF _u.status <> 'pending' THEN RETURN jsonb_build_object('ok', false, 'code', 'update_closed'); END IF;
  IF _decision NOT IN ('approve', 'reject') THEN RETURN jsonb_build_object('ok', false, 'code', 'decision_unknown'); END IF;
  IF _u.uploaded_by IS NOT DISTINCT FROM auth.uid() THEN
    RETURN public.four_eyes_refusal('child_update_review', _u.orphan_id, jsonb_build_object('update', _id));
  END IF;
  IF _decision = 'reject' THEN
    IF _why IS NULL OR length(_why) > 500 THEN RETURN jsonb_build_object('ok', false, 'code', 'reason_required'); END IF;
    UPDATE public.child_updates SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
           reject_reason = _why WHERE id = _id;
    PERFORM public.log_integrity('child_update_rejected', _u.orphan_id,
      jsonb_build_object('update', _id, 'kind', _u.kind, 'reason', _why), 'country');
  ELSE
    IF public.orphan_frozen(_u.orphan_id) THEN RETURN jsonb_build_object('ok', false, 'code', 'orphan_frozen'); END IF;
    UPDATE public.child_updates SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = _id;
  END IF;
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'child_update_review', 'orphans', _u.orphan_id,
          jsonb_build_object('update', _id, 'decision', _decision));
  IF _decision = 'reject' THEN
    -- ما يحذفه الخادم من الخزنة الآن؛ ويلتقطه الاستبقاء إن تعذّر.
    RETURN jsonb_build_object('ok', true, 'purge',
      to_jsonb(array_remove(ARRAY[_u.storage_path, _u.poster_path], NULL)));
  END IF;
  RETURN jsonb_build_object('ok', true);
END $function$;

-- ---------------------------------------------------------------------
-- N6: عدّ أحداث السلامة الحديثة للمجدول
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.security_events_recent(_threshold integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('count', c, 'threshold', GREATEST(0, COALESCE(_threshold, 50)),
                            'alert', c > GREATEST(0, COALESCE(_threshold, 50)))
    FROM (SELECT count(*)::int AS c FROM public.integrity_log
           WHERE kind LIKE 'sec\_%' AND kind <> 'sec_admin_search'
             AND at > now() - interval '1 hour') x;
$function$;

REVOKE ALL ON FUNCTION public.security_events_recent(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_events_recent(integer) TO service_role;
