-- =====================================================================
-- تحديثات الطفل للكافل: صورٌ ومقاطع قصيرة وملاحظات دورية (محضر اجتماع الندوة)
-- =====================================================================
-- 1) فريق الدولة يرفع (country_can(country, 'upload'): المشرف ومُدخل البيانات)،
--    وموافقة الوليّ شرطٌ لكلّ وسيط. الملفّ في خزنةٍ خاصّة `child-updates`
--    بمسار `<orphan_id>/<uuid>.<ext>`، ولا يُرفع لطفلٍ مجمَّد (orphan_freezes).
-- 2) الحسم بيد من يملك 'approve' في دولة الطفل، بجلسة aal2 (approver_needs_mfa)،
--    ومن غير الرافع (four_eyes_refusal) — والمدير ليس مستثنى. الرفض بسببٍ
--    ويُكتب في integrity_log.
-- 3) الكافل يقرأ المعتمد وحده، لطفلٍ يكفله كفالةً نشطة، عبر my_child_updates،
--    والوسيط يُوقَّع رابطه في الخادم قصيراً بعد أن تُجيزه سياسة الخزنة نفسها.
-- 4) country_can يعرف حاجة 'upload' (جسمه من pg_get_functiondef للقاعدة الحيّة).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.country_can(_country text, _need text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.country_staff s
     WHERE s.user_id = auth.uid() AND s.country_code = _country
       AND CASE _need
             WHEN 'read' THEN true
             WHEN 'import' THEN s.role IN ('supervisor', 'data_entry')
             WHEN 'upload' THEN s.role IN ('supervisor', 'data_entry')
             WHEN 'approve' THEN s.role = 'supervisor' AND public.session_strong()
             WHEN 'manage' THEN s.role = 'supervisor' AND public.session_strong()
             ELSE false END);
$function$;

-- ── الجدول ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.child_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orphan_id UUID NOT NULL REFERENCES public.orphans(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('photo', 'video', 'note')),
  storage_path TEXT,
  poster_path TEXT,
  duration_seconds INT CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 1 AND 60),
  caption_ar TEXT NOT NULL CHECK (length(btrim(caption_ar)) BETWEEN 1 AND 500),
  caption_en TEXT CHECK (caption_en IS NULL OR length(caption_en) <= 500),
  guardian_consent BOOLEAN NOT NULL DEFAULT false,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reject_reason TEXT CHECK (reject_reason IS NULL OR length(reject_reason) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- الوسيط بموافقة الوليّ دائماً، والملاحظة بلا ملفّ
  CONSTRAINT child_updates_media CHECK (
    (kind = 'note' AND storage_path IS NULL AND poster_path IS NULL AND duration_seconds IS NULL)
    OR (kind = 'photo' AND storage_path IS NOT NULL AND guardian_consent AND poster_path IS NULL AND duration_seconds IS NULL)
    OR (kind = 'video' AND storage_path IS NOT NULL AND guardian_consent AND duration_seconds IS NOT NULL)),
  CONSTRAINT child_updates_review CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND reject_reason IS NULL)
    OR (status = 'approved' AND reviewed_at IS NOT NULL AND reject_reason IS NULL)
    OR (status = 'rejected' AND reviewed_at IS NOT NULL AND reject_reason IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_child_updates_orphan ON public.child_updates (orphan_id, status, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_child_updates_pending ON public.child_updates (country_code, created_at) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS uq_child_updates_path ON public.child_updates (storage_path) WHERE storage_path IS NOT NULL;

-- لا قراءة ولا كتابة مباشرة: كلّ شيءٍ عبر الدوالّ أدناه.
ALTER TABLE public.child_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.child_updates FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.child_updates TO service_role;

-- ── الخزنة ───────────────────────────────────────────────────────────
-- الحدّ الأعلى للخزنة حدّ المقطع (40MB)، وحدّ الصورة (5MB) يفحصه child_update_create.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('child-updates', 'child-updates', false, 41943040,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- مسار الوسيط: `<orphan_id>/<uuid>.<ext>` بامتدادٍ من القائمة، لا غير.
CREATE OR REPLACE FUNCTION public.child_update_path_ok(_orphan uuid, _path text, _exts text[])
 RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  SELECT _path IS NOT NULL AND position('..' IN _path) = 0
     AND _path ~ ('^' || _orphan::text || '/[0-9a-f-]{36}\.[a-z0-9]{3,4}$')
     AND split_part(_path, '.', 2) = ANY (_exts);
$$;

CREATE OR REPLACE FUNCTION public.child_update_orphan_of(_path text)
 RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $$
BEGIN
  RETURN split_part(_path, '/', 1)::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

-- الرفع إلى الخزنة: فريق دولة الطفل، لطفلٍ غير مجمَّد.
CREATE OR REPLACE FUNCTION public.can_upload_child_update(_path text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.orphans o
     WHERE o.id = public.child_update_orphan_of(_path)
       AND o.country_code IS NOT NULL
       AND public.country_can(o.country_code, 'upload')
       AND NOT public.orphan_frozen(o.id));
$$;

-- قراءة الوسيط: الكافل النشط لتحديثٍ معتمد، أو فريق الدولة لمراجعته.
CREATE OR REPLACE FUNCTION public.can_view_child_update(_path text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.child_updates u
     WHERE (u.storage_path = _path OR u.poster_path = _path)
       AND (public.country_can(u.country_code, 'read')
            OR (u.status = 'approved' AND EXISTS (
                  SELECT 1 FROM public.sponsorships s
                   WHERE s.orphan_id = u.orphan_id AND s.sponsor_id = auth.uid()
                     AND s.status = 'active'))));
$$;

DROP POLICY IF EXISTS child_updates_read ON storage.objects;
CREATE POLICY child_updates_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'child-updates' AND public.can_view_child_update(name));
DROP POLICY IF EXISTS child_updates_write ON storage.objects;
CREATE POLICY child_updates_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'child-updates' AND public.can_upload_child_update(name));

-- ── الرفع ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.child_update_create(
  _orphan uuid, _kind text, _path text, _caption_ar text, _caption_en text,
  _consent boolean, _duration integer DEFAULT NULL, _poster text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _country text; _size bigint; _psize bigint; _id uuid;
BEGIN
  SELECT country_code INTO _country FROM public.orphans WHERE id = _orphan;
  -- النطاق قبل كلّ شيء: عضو دولةٍ أخرى لا يعرف حتى أن الطفل موجود.
  IF _country IS NULL OR NOT public.country_can(_country, 'upload') THEN
    RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501';
  END IF;
  IF public.orphan_frozen(_orphan) THEN RETURN jsonb_build_object('ok', false, 'code', 'orphan_frozen'); END IF;
  IF _kind NOT IN ('photo', 'video', 'note') THEN RETURN jsonb_build_object('ok', false, 'code', 'kind_unknown'); END IF;
  IF NULLIF(btrim(COALESCE(_caption_ar, '')), '') IS NULL OR length(_caption_ar) > 500 OR length(COALESCE(_caption_en, '')) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'caption_invalid');
  END IF;
  IF _kind = 'note' THEN
    _path := NULL; _poster := NULL; _duration := NULL;
  ELSE
    IF _consent IS NOT TRUE THEN RETURN jsonb_build_object('ok', false, 'code', 'consent_required'); END IF;
    IF NOT public.child_update_path_ok(_orphan, _path,
         (CASE WHEN _kind = 'photo' THEN ARRAY['jpg', 'jpeg', 'png', 'webp'] ELSE ARRAY['mp4'] END)) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'path_invalid');
    END IF;
    SELECT COALESCE((metadata->>'size')::bigint, 0) INTO _size
      FROM storage.objects WHERE bucket_id = 'child-updates' AND name = _path;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'file_missing'); END IF;
    IF _size > (CASE WHEN _kind = 'photo' THEN 5242880 ELSE 41943040 END) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'file_too_large');
    END IF;
    IF _kind = 'photo' THEN
      _poster := NULL; _duration := NULL;
    ELSE
      IF _duration IS NULL OR _duration < 1 OR _duration > 60 THEN
        RETURN jsonb_build_object('ok', false, 'code', 'video_too_long');
      END IF;
      IF _poster IS NOT NULL THEN
        IF NOT public.child_update_path_ok(_orphan, _poster, ARRAY['jpg', 'jpeg', 'png', 'webp']) THEN
          RETURN jsonb_build_object('ok', false, 'code', 'path_invalid');
        END IF;
        SELECT COALESCE((metadata->>'size')::bigint, 0) INTO _psize
          FROM storage.objects WHERE bucket_id = 'child-updates' AND name = _poster;
        IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'file_missing'); END IF;
        IF _psize > 5242880 THEN RETURN jsonb_build_object('ok', false, 'code', 'file_too_large'); END IF;
      END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM public.child_updates WHERE storage_path IN (_path, _poster) OR poster_path IN (_path, _poster)) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'path_invalid');
    END IF;
  END IF;
  INSERT INTO public.child_updates (orphan_id, country_code, kind, storage_path, poster_path, duration_seconds,
                                    caption_ar, caption_en, guardian_consent, uploaded_by)
  VALUES (_orphan, _country, _kind, _path, _poster, _duration, btrim(_caption_ar),
          NULLIF(btrim(COALESCE(_caption_en, '')), ''), COALESCE(_consent, false), auth.uid())
  RETURNING id INTO _id;
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, meta)
  VALUES (auth.uid(), 'child_update_create', 'orphans', _orphan, jsonb_build_object('update', _id, 'kind', _kind));
  RETURN jsonb_build_object('ok', true, 'id', _id);
END $$;

-- ── الحسم ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.child_update_review(_id uuid, _decision text, _reason text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── قائمة المراجعة ───────────────────────────────────────────────────
-- _country فارغ للمدير: كلّ الدول (طابور اليوم). الاسم المعروض وحده من الملفّ.
CREATE OR REPLACE FUNCTION public.child_update_queue(_country text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF _country IS NULL AND NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  IF _country IS NOT NULL AND NOT public.country_can(_country, 'read') THEN
    RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('ok', true, 'items', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', u.id, 'orphan_id', u.orphan_id, 'orphan_name', o.display_name, 'orphan_code', o.code,
             'country_code', u.country_code, 'kind', u.kind, 'storage_path', u.storage_path,
             'poster_path', u.poster_path, 'duration_seconds', u.duration_seconds,
             'caption_ar', u.caption_ar, 'caption_en', u.caption_en, 'created_at', u.created_at,
             'mine', u.uploaded_by IS NOT DISTINCT FROM auth.uid(),
             'frozen', public.orphan_frozen(u.orphan_id))
           ORDER BY u.created_at)
      FROM public.child_updates u JOIN public.orphans o ON o.id = u.orphan_id
     WHERE u.status = 'pending' AND (_country IS NULL OR u.country_code = _country)), '[]'::jsonb));
END $$;

-- ── قراءة الكافل ─────────────────────────────────────────────────────
-- المعتمد وحده، لمن يكفل الطفل كفالةً نشطة؛ وغيره يرى قائمةً فارغة لا خطأ.
CREATE OR REPLACE FUNCTION public.my_child_updates(_orphan uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object('ok', true, 'items', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', u.id, 'kind', u.kind, 'storage_path', u.storage_path, 'poster_path', u.poster_path,
             'duration_seconds', u.duration_seconds, 'caption_ar', u.caption_ar,
             'caption_en', u.caption_en, 'at', u.reviewed_at)
           ORDER BY u.reviewed_at DESC)
      FROM public.child_updates u
     WHERE u.orphan_id = _orphan AND u.status = 'approved'
       AND EXISTS (SELECT 1 FROM public.sponsorships s
                    WHERE s.orphan_id = _orphan AND s.sponsor_id = auth.uid() AND s.status = 'active')), '[]'::jsonb));
$$;

-- اختيار الطفل للرفع: أطفال الدولة برمزهم واسمهم المعروض وحده.
CREATE OR REPLACE FUNCTION public.child_update_children(_country text, _q text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _t text := NULLIF(btrim(COALESCE(_q, '')), '');
BEGIN
  IF NOT public.country_can(_country, 'upload') THEN RAISE EXCEPTION 'country_forbidden' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('ok', true, 'items', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', x.id, 'code', x.code, 'display_name', x.display_name,
                                        'frozen', public.orphan_frozen(x.id)) ORDER BY x.code)
      FROM (SELECT o.id, o.code, o.display_name FROM public.orphans o
             WHERE o.country_code = _country AND o.exited_at IS NULL
               AND (_t IS NULL OR o.code ILIKE '%' || _t || '%' OR o.display_name ILIKE '%' || _t || '%')
             ORDER BY o.code LIMIT 20) x), '[]'::jsonb));
END $$;

-- عدد المعلّق لطابور اليوم.
CREATE OR REPLACE FUNCTION public.child_updates_pending_count()
 RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE WHEN public.is_admin() THEN (SELECT count(*)::int FROM public.child_updates WHERE status = 'pending') ELSE 0 END;
$$;

REVOKE ALL ON FUNCTION public.child_update_path_ok(uuid, text, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.child_update_orphan_of(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_upload_child_update(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_child_update(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.child_update_create(uuid, text, text, text, text, boolean, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.child_update_review(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.child_update_queue(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_child_updates(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.child_updates_pending_count() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.child_update_children(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.child_update_path_ok(uuid, text, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.child_update_orphan_of(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_upload_child_update(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_child_update(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.child_update_create(uuid, text, text, text, text, boolean, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.child_update_review(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.child_update_queue(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_child_updates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.child_updates_pending_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.child_update_children(text, text) TO authenticated;
