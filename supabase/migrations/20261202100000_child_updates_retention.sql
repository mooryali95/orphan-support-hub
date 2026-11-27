-- =====================================================================
-- استبقاء وسائط تحديثات الطفل (قرار المالك)
-- =====================================================================
-- 1) المرفوض: يُعيد child_update_review مسارات ملفّه (`purge`) فيحذفها الخادم
--    من خزنة `child-updates` بعميل الخدمة فور الرفض؛ وصفّه يُمحى بعد 30 يوماً
--    (ويُحذف ملفّه ثانيةً إن تعذّر الحذف الأوّل).
-- 2) الطفل المؤرشَف: إن أُرشف ملفّه (orphans.status = 'archived') ولم تبقَ له
--    كفالةٌ قائمة (active/paused/pending_payment)، مُحيت تحديثاته ووسائطها بعد
--    مدّةٍ قابلةٍ للضبط (365 يوماً افتراضاً، ولا أقلّ من 30) من آخر تغيّرٍ
--    للملفّ ولكفالاته.
-- 3) على مرحلتين، لعميل الخدمة وحده: child_updates_retention_due يسرد المستحقّ
--    ومساراته فيحذف الخادم الملفّات، ثم child_updates_retention_done يمحو من
--    الصفوف ما زال مستحقّاً. فلا يُمحى صفٌّ قبل أن يُحذف ملفّه.
-- المسار الدوري: POST /api/child-updates/retention (كمسارات المجدول الأخرى).
-- جسم child_update_review من pg_get_functiondef للقاعدة الحيّة، والتغيير في ردّ الرفض وحده.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.child_update_review(_id uuid, _decision text, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _u public.child_updates; _why text := NULLIF(btrim(COALESCE(_reason, '')), '');
BEGIN
  SELECT * INTO _u FROM public.child_updates WHERE id = _id FOR UPDATE;
  IF public.approver_needs_mfa(_u.country_code) THEN
    RETURN public.mfa_refusal('child_update_review', _u.orphan_id, jsonb_build_object('update', _id));
  END IF;
  IF _u.id IS NULL OR NOT public.country_can(_u.country_code, 'approve') THEN
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

-- المستحقّ للمحو: مرفوضٌ مضى على حسمه 30 يوماً، أو تحديثٌ لطفلٍ مؤرشَفٍ بلا كفالةٍ
-- قائمة، مضت _archive_days على آخر تغيّرٍ لملفّه ولكلّ كفالاته.
CREATE OR REPLACE FUNCTION public.child_updates_retention_ids(_archive_days integer)
 RETURNS TABLE (id uuid, reason text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT u.id, 'rejected'::text FROM public.child_updates u
   WHERE u.status = 'rejected' AND u.reviewed_at < now() - interval '30 days'
  UNION
  SELECT u.id, 'archived'::text FROM public.child_updates u
    JOIN public.orphans o ON o.id = u.orphan_id
   WHERE u.status <> 'rejected'
     AND o.status = 'archived'
     AND o.updated_at < now() - make_interval(days => _archive_days)
     AND NOT EXISTS (
       SELECT 1 FROM public.sponsorships s
        WHERE s.orphan_id = o.id
          AND (s.status IN ('active', 'paused', 'pending_payment')
               OR GREATEST(s.updated_at, COALESCE(s.ended_at, s.updated_at))
                  >= now() - make_interval(days => _archive_days)));
$$;

CREATE OR REPLACE FUNCTION public.child_updates_retention_due(_archive_days integer DEFAULT 365, _limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF _archive_days IS NULL OR _archive_days < 30 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'archive_days_invalid');
  END IF;
  RETURN jsonb_build_object('ok', true, 'items', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', x.id, 'reason', x.reason,
             'paths', to_jsonb(array_remove(ARRAY[u.storage_path, u.poster_path], NULL))))
      FROM (SELECT r.id, r.reason FROM public.child_updates_retention_ids(_archive_days) r
             ORDER BY r.id LIMIT GREATEST(1, LEAST(COALESCE(_limit, 500), 1000))) x
      JOIN public.child_updates u ON u.id = x.id), '[]'::jsonb));
END $$;

-- يمحو ما سُرد بعد حذف ملفّاته، ممّا ما زال مستحقّاً وقت المحو.
CREATE OR REPLACE FUNCTION public.child_updates_retention_done(_ids uuid[], _archive_days integer DEFAULT 365)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _n integer;
BEGIN
  IF _archive_days IS NULL OR _archive_days < 30 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'archive_days_invalid');
  END IF;
  DELETE FROM public.child_updates u
   WHERE u.id = ANY (COALESCE(_ids, '{}'))
     AND u.id IN (SELECT r.id FROM public.child_updates_retention_ids(_archive_days) r);
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n > 0 THEN
    INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
    VALUES (NULL, 'child_updates_retention', 'child_updates', NULL,
            jsonb_build_object('deleted', _n, 'archive_days', _archive_days));
  END IF;
  RETURN jsonb_build_object('ok', true, 'deleted', _n);
END $$;

REVOKE ALL ON FUNCTION public.child_updates_retention_ids(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.child_updates_retention_due(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.child_updates_retention_done(uuid[], integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.child_updates_retention_ids(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.child_updates_retention_due(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.child_updates_retention_done(uuid[], integer) TO service_role;

-- سجلّ سياسة الاستبقاء المعروض للإدارة: البندان مع غيرهما.
INSERT INTO public.data_retention_policy (entity, basis, retain_months, note) VALUES
  ('child_updates.rejected', 'guardian_consent', 1,
   'تحديث الطفل المرفوض: يُحذف ملفّه من الخزنة فور الرفض، وصفّه بعد 30 يوماً.'),
  ('child_updates', 'guardian_consent', 12,
   'صور الطفل ومقاطعه للكافل: تُمحى بعد سنةٍ (CHILD_UPDATES_ARCHIVE_DAYS) من أرشفة ملفّه وانتهاء آخر كفالة.')
ON CONFLICT (entity) DO UPDATE
  SET basis = EXCLUDED.basis, retain_months = EXCLUDED.retain_months, note = EXCLUDED.note, updated_at = now();
