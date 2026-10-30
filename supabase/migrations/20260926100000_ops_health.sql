-- =====================================================================
-- صحّة التشغيل — فحوصٌ دورية وتنبيهٌ للمشرفين
-- ---------------------------------------------------------------------
-- الحماية التي لا يراها أحد لا تحمي: قائمة المراجعة في لوحة الإدارة
-- تنفع من يفتحها فقط. هنا تُحسب الفحوص في مكانٍ واحد، ويُسجَّل كل تشغيلٍ
-- في `ops_runs` (إلحاقٌ فقط)، ويُنبَّه المشرفون حين يتغيّر الحال أو يمضي
-- يومٌ على تنبيهٍ قائم — لا في كل تشغيل، فالتنبيه المتكرّر يُتجاهَل.
--
-- الفحوص (لكلٍّ مستوى: ok · warn · critical):
--   integrity_chain   سلسلة سجلّ السلامة سليمة
--   webhook_errors    أحداث مزوّد الدفع فشلت معالجتها أو لم تُعالَج
--   payments_stuck    دفعاتٌ معلّقة أكثر من ساعتين
--   discrepancies     تعارضاتٌ من منصّة التشغيل تنتظر قراراً
--   unlock_waiting    طلبات فكّ قفلٍ تنتظر أكثر من ٤٨ ساعة
--   email_failed      رسائل استنفدت محاولاتها
--   mirror_lag        منصّة تشغيلٍ فعّالة بلا دفعةٍ منذ ٤٨ ساعة
--   admin_quorum      أقلّ من ثلاثة مشرفين (النصاب يحتاج اثنين غير الطالب)
-- =====================================================================

CREATE OR REPLACE FUNCTION public._ops_checks()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _out JSONB := '[]'::jsonb;
  _r public.integrity_log; _prev TEXT := 'genesis'; _broken BIGINT;
  _n BIGINT; _old BIGINT;
  _check JSONB;
BEGIN
  -- ١) السلسلة: إعادة حسابٍ كاملة؛ أوّل كسرٍ يكفي.
  FOR _r IN SELECT * FROM public.integrity_log ORDER BY id LOOP
    IF _r.prev_hash <> _prev OR _r.hash <> public.integrity_row_hash(_r.prev_hash, _r.at, _r.actor,
         _r.kind, _r.orphan_id, _r.source, _r.detail) THEN
      _broken := _r.id; EXIT;
    END IF;
    _prev := _r.hash;
  END LOOP;
  _out := _out || jsonb_build_object('key', 'integrity_chain',
    'level', CASE WHEN _broken IS NULL THEN 'ok' ELSE 'critical' END,
    'count', COALESCE(_broken, 0),
    'title', CASE WHEN _broken IS NULL THEN 'سلسلة سجلّ السلامة سليمة'
                  ELSE format('سلسلة سجلّ السلامة انكسرت عند السطر %s', _broken) END);

  -- ٢) أحداث الدفع: خطأٌ مسجّل، أو لم تُعالَج بعد ٣٠ دقيقة (آخر ٧ أيام).
  SELECT count(*) INTO _n FROM public.payment_events
   WHERE created_at > now() - interval '7 days'
     AND (error IS NOT NULL OR (processed_at IS NULL AND created_at < now() - interval '30 minutes'));
  _out := _out || jsonb_build_object('key', 'webhook_errors',
    'level', CASE WHEN _n = 0 THEN 'ok' ELSE 'critical' END, 'count', _n,
    'title', CASE WHEN _n = 0 THEN 'أحداث الدفع تُعالَج كلّها'
                  ELSE format('%s حدثَ دفعٍ لم يُعالَج أو فشلت معالجته', _n) END);

  -- ٣) دفعاتٌ معلّقة طويلاً: المزوّد لم يؤكّد، أو الحدث لم يصل.
  SELECT count(*) INTO _n FROM public.sponsorship_payments
   WHERE status::text = 'pending' AND created_at < now() - interval '2 hours'
     AND created_at > now() - interval '30 days';
  _out := _out || jsonb_build_object('key', 'payments_stuck',
    'level', CASE WHEN _n = 0 THEN 'ok' ELSE 'warn' END, 'count', _n,
    'title', CASE WHEN _n = 0 THEN 'لا دفعات معلّقة'
                  ELSE format('%s دفعةً معلّقة أكثر من ساعتين', _n) END);

  -- ٤) التعارضات: تحجز تغييراً على سجلٍّ مقفل؛ بعد ٧٢ ساعة تصير حرجة.
  SELECT count(*), count(*) FILTER (WHERE created_at < now() - interval '72 hours')
    INTO _n, _old FROM public.integrity_discrepancies WHERE status = 'open';
  _out := _out || jsonb_build_object('key', 'discrepancies',
    'level', CASE WHEN _n = 0 THEN 'ok' WHEN _old > 0 THEN 'critical' ELSE 'warn' END, 'count', _n,
    'title', CASE WHEN _n = 0 THEN 'لا تعارضات مع منصّات التشغيل'
                  ELSE format('%s تعارضاً ينتظر قراراً', _n) END);

  -- ٥) طلبات فكّ القفل المنتظرة.
  SELECT count(*) INTO _n FROM public.unlock_requests
   WHERE status = 'pending' AND created_at < now() - interval '48 hours';
  _out := _out || jsonb_build_object('key', 'unlock_waiting',
    'level', CASE WHEN _n = 0 THEN 'ok' ELSE 'warn' END, 'count', _n,
    'title', CASE WHEN _n = 0 THEN 'لا طلبات فكّ قفلٍ متأخّرة'
                  ELSE format('%s طلبَ فكّ قفلٍ ينتظر أكثر من ٤٨ ساعة', _n) END);

  -- ٦) البريد.
  SELECT count(*) INTO _n FROM public.notifications
   WHERE email_state = 'failed' AND created_at > now() - interval '7 days';
  _out := _out || jsonb_build_object('key', 'email_failed',
    'level', CASE WHEN _n = 0 THEN 'ok' ELSE 'warn' END, 'count', _n,
    'title', CASE WHEN _n = 0 THEN 'لا رسائل فاشلة'
                  ELSE format('%s رسالةً استنفدت محاولاتها', _n) END);

  -- ٧) تأخّر المرآة: منصّةٌ فعّالة بلا دفعةٍ حديثة.
  SELECT count(*) INTO _n FROM public.operating_platforms p
   WHERE p.active AND p.status = 'active'
     AND NOT EXISTS (SELECT 1 FROM public.mirror_batches b
                      WHERE b.source = p.key AND b.received_at > now() - interval '48 hours');
  _out := _out || jsonb_build_object('key', 'mirror_lag',
    'level', CASE WHEN _n = 0 THEN 'ok' ELSE 'warn' END, 'count', _n,
    'title', CASE WHEN _n = 0 THEN 'منصّات التشغيل الفعّالة متزامنة'
                  ELSE format('%s منصّةَ تشغيلٍ بلا مزامنةٍ منذ ٤٨ ساعة', _n) END);

  -- ٨) النصاب.
  SELECT count(*) INTO _n FROM public.user_roles WHERE role = 'admin';
  _out := _out || jsonb_build_object('key', 'admin_quorum',
    'level', CASE WHEN _n >= 3 THEN 'ok' ELSE 'warn' END, 'count', _n,
    'title', CASE WHEN _n >= 3 THEN format('%s مشرفين — النصاب متاح', _n)
                  ELSE format('%s مشرف فقط — فكّ القفل يحتاج ثلاثة على الأقل', _n) END);

  RETURN _out;
END $fn$;
REVOKE ALL ON FUNCTION public._ops_checks() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._ops_level(_checks JSONB)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(_checks) c WHERE c->>'level' = 'critical') THEN 'critical'
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(_checks) c WHERE c->>'level' = 'warn') THEN 'warn'
    ELSE 'ok' END;
$fn$;

-- ---------------------------------------------------------------------
-- سجلّ التشغيلات — إلحاقٌ فقط
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ops_runs (
  id          BIGSERIAL PRIMARY KEY,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  level       TEXT NOT NULL CHECK (level IN ('ok', 'warn', 'critical')),
  -- بصمة ما ليس سليماً: مفاتيح الفحوص ومستوياتها وأعدادها. تغيّرها = خبرٌ جديد.
  signature   TEXT NOT NULL,
  checks      JSONB NOT NULL,
  notified    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ops_runs_at ON public.ops_runs(at DESC);
ALTER TABLE public.ops_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ops_admin ON public.ops_runs;
CREATE POLICY ops_admin ON public.ops_runs FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.ops_runs FROM anon, authenticated;
GRANT SELECT ON public.ops_runs TO authenticated;
GRANT ALL ON public.ops_runs TO service_role;
DROP TRIGGER IF EXISTS ops_runs_frozen ON public.ops_runs;
CREATE TRIGGER ops_runs_frozen BEFORE UPDATE OR DELETE ON public.ops_runs
  FOR EACH ROW EXECUTE FUNCTION public.append_only();

-- للمشرف في اللوحة: الحال الآن، بلا تسجيل.
CREATE OR REPLACE FUNCTION public.ops_health()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _c JSONB;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  _c := public._ops_checks();
  RETURN jsonb_build_object('level', public._ops_level(_c), 'checks', _c, 'at', now(),
    'last_run', (SELECT to_jsonb(r) - 'checks' FROM public.ops_runs r ORDER BY id DESC LIMIT 1));
END $fn$;
REVOKE ALL ON FUNCTION public.ops_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_health() TO authenticated;

-- للمجدول: يسجّل التشغيل، وينبّه المشرفين داخل التطبيق (والبريد يتبع
-- صندوق الإرسال وحجبه). ينبّه حين تتغيّر البصمة، أو يمضي ٢٠ ساعة على
-- آخر تنبيهٍ بنفس البصمة وما زال الحال غير سليم. العودة إلى السلامة خبرٌ
-- يُرسَل مرّةً واحدة.
CREATE OR REPLACE FUNCTION public.ops_record_run()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _c JSONB; _level TEXT; _sig TEXT; _last public.ops_runs; _lastn public.ops_runs;
  _notify BOOLEAN; _sent INTEGER := 0; _admin UUID; _title TEXT; _body TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ops_record_run'));
  _c := public._ops_checks();
  _level := public._ops_level(_c);
  SELECT COALESCE(string_agg(format('%s:%s:%s', x->>'key', x->>'level', x->>'count'), ',' ORDER BY x->>'key'), '')
    INTO _sig FROM jsonb_array_elements(_c) x WHERE x->>'level' <> 'ok';

  SELECT * INTO _last FROM public.ops_runs ORDER BY id DESC LIMIT 1;
  SELECT * INTO _lastn FROM public.ops_runs WHERE notified > 0 ORDER BY id DESC LIMIT 1;

  _notify := CASE
    WHEN _level = 'ok' THEN _last.id IS NOT NULL AND _last.level <> 'ok'          -- عاد سليماً
    WHEN _lastn.id IS NULL THEN true
    WHEN _lastn.signature <> _sig THEN true                                       -- تغيّر الحال
    ELSE _lastn.at < now() - interval '20 hours' END;                             -- تذكيرٌ يومي

  IF _notify THEN
    IF _level = 'ok' THEN
      _title := 'صحّة التشغيل: عاد كل شيءٍ سليماً';
      _body := 'الفحوص الثمانية سليمة.';
    ELSE
      _title := CASE _level WHEN 'critical' THEN 'صحّة التشغيل: تنبيهٌ حرج' ELSE 'صحّة التشغيل: يحتاج انتباهاً' END;
      SELECT string_agg('• ' || (x->>'title'), E'\n' ORDER BY (x->>'level') = 'critical' DESC, x->>'key')
        INTO _body FROM jsonb_array_elements(_c) x WHERE x->>'level' <> 'ok';
    END IF;
    FOR _admin IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
      PERFORM public.notify(_admin, 'other', _title, _body, '/admin?tab=monitoring', 'ops_run', NULL);
      _sent := _sent + 1;
    END LOOP;
  END IF;

  INSERT INTO public.ops_runs (level, signature, checks, notified) VALUES (_level, _sig, _c, _sent);
  RETURN jsonb_build_object('level', _level, 'notified', _sent, 'checks', _c);
END $fn$;
REVOKE ALL ON FUNCTION public.ops_record_run() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_record_run() TO service_role;
