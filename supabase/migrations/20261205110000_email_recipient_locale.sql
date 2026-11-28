-- =====================================================================
-- لغة مستلم البريد
-- الخطر: مستلمٌ اختار الإنجليزية تصله رسائل المنصّة بالعربية وحدها.
-- اللغة تُحفظ في حسابه (raw_user_meta_data.locale) حين يبدّل لغة الواجهة
-- أو يسجّل، ويُعيدها claim_email_batch مع كل رسالة؛ وما عداها عربي.
-- =====================================================================

DROP FUNCTION IF EXISTS public.claim_email_batch(INTEGER, INTEGER, INTEGER);
CREATE FUNCTION public.claim_email_batch(
  _limit INTEGER DEFAULT 25,
  _lease_seconds INTEGER DEFAULT 300,
  _max_attempts INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  recipient TEXT,
  kind public.notification_kind,
  title TEXT,
  body TEXT,
  link TEXT,
  unsubscribe_token UUID,
  attempts INTEGER,
  locale TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.sweep_email_outbox();

  RETURN QUERY
  WITH candidate AS (
    SELECT n.id
      FROM public.notifications n
     WHERE n.email_state = 'pending'
       AND n.email_attempts < _max_attempts
       AND (n.email_claimed_at IS NULL
            OR n.email_claimed_at < now() - make_interval(secs => _lease_seconds))
     ORDER BY n.created_at
     FOR UPDATE SKIP LOCKED
     LIMIT GREATEST(_limit, 0)
  ),
  claimed AS (
    UPDATE public.notifications n
       SET email_claimed_at = now(),
           email_attempts = n.email_attempts + 1
      FROM candidate c
     WHERE n.id = c.id
    RETURNING n.id, n.user_id, n.kind, n.title, n.body, n.link, n.email_attempts
  )
  SELECT cl.id,
         u.email::text,
         cl.kind,
         cl.title,
         cl.body,
         cl.link,
         p.unsubscribe_token,
         cl.email_attempts::INTEGER,
         -- لغتان للبريد: الإنجليزية لمن اختارها، والعربية لكل ما عداها.
         CASE WHEN u.raw_user_meta_data->>'locale' = 'en' THEN 'en' ELSE 'ar' END
    FROM claimed cl
    JOIN auth.users u ON u.id = cl.user_id
    JOIN public.notification_prefs p ON p.user_id = cl.user_id
   WHERE u.email IS NOT NULL;
END $fn$;
REVOKE ALL ON FUNCTION public.claim_email_batch(INTEGER, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_batch(INTEGER, INTEGER, INTEGER) TO service_role;
