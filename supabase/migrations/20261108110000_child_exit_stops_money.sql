-- =====================================================================
-- الدفعة ٣أ — خروج الطفل يوقف المال (GAP-05)
-- ---------------------------------------------------------------------
-- كانت أرشفة الطفل (تخرّجٌ، بلوغ سنّ البرنامج، عودةٌ إلى أسرته، انتقال،
-- وفاة) تترك كفالاته «نشطة»: التمويل يبقى محسوباً، والتجديد لدى المزوّد
-- يُقبل ويُعيد الكفالة، والكافل لا يُخبَر.
--
-- الآن:
--   • سببٌ مُهيكل للخروج على الطفل (`exit_reason`, `exit_note`, `exited_at`).
--     طلب الأرشفة على المقفول يحمله في `patch`، ويُرفض بدونه؛ والإدارة
--     تُخرج غير المقفول بـ`admin_archive_child`.
--   • عند الأرشفة: الكفالات الجارية تكتمل (`completed`) والمعلّقة تُلغى،
--     بسبب `child_exit`، ودفعاتها المعلّقة تُغلق، واشتراكاتها لدى المزوّد
--     تُطلب إلغاؤها فوراً. التحصيل اللاحق مرفوضٌ في record_provider_charge.
--   • إشعاران للكافل: الأول فوراً بالسبب (بلا مطالبة)، والثاني بعد مهلة —
--     ثلاثة أيام، وأربعة عشر عند الوفاة — يعرض طفلاً ينتظر بالعملة نفسها
--     من `suggest_orphans_for_amount`. يرسله المجدول (`send_due_exit_followups`).
--   • بندٌ في صندوق القرارات (`money_issue` / `child_exit`) بما أُنهي.
-- =====================================================================

ALTER TABLE public.orphans
  ADD COLUMN IF NOT EXISTS exit_reason TEXT,
  ADD COLUMN IF NOT EXISTS exit_note   TEXT,
  ADD COLUMN IF NOT EXISTS exited_at   TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE public.orphans ADD CONSTRAINT orphans_exit_reason_check
    CHECK (exit_reason IS NULL OR exit_reason IN
           ('graduated', 'aged_out', 'returned_to_family', 'transferred', 'deceased', 'other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.orphans ADD CONSTRAINT orphans_exit_note_check
    CHECK (exit_note IS NULL OR length(exit_note) <= 500);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.child_exit_reasons()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $fn$
  SELECT ARRAY['graduated', 'aged_out', 'returned_to_family', 'transferred', 'deceased', 'other'];
$fn$;

/* جملة السبب كما تُقال للكافل. */
CREATE OR REPLACE FUNCTION public.child_exit_sentence(_reason TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE _reason
    WHEN 'graduated' THEN 'أتمّ مرحلته وتخرّج من البرنامج'
    WHEN 'aged_out' THEN 'بلغ السنّ التي ينتهي عندها البرنامج'
    WHEN 'returned_to_family' THEN 'عاد إلى رعاية أسرته'
    WHEN 'transferred' THEN 'انتقل إلى رعاية جهةٍ أخرى'
    WHEN 'deceased' THEN 'ببالغ الحزن نُعلمك أنه توفّي، رحمه الله'
    ELSE 'انتهت رعايته في البرنامج' END;
$fn$;

CREATE OR REPLACE FUNCTION public.child_exit_label(_reason TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE _reason
    WHEN 'graduated' THEN 'تخرّج' WHEN 'aged_out' THEN 'بلغ سنّ الخروج'
    WHEN 'returned_to_family' THEN 'عاد إلى أسرته' WHEN 'transferred' THEN 'انتقل إلى جهةٍ أخرى'
    WHEN 'deceased' THEN 'وفاة' ELSE 'سببٌ آخر' END;
$fn$;


-- ---------------------------------------------------------------------
-- ١) طلب الأرشفة يحمل السبب
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_archive_request()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  IF NEW.op = 'archive' THEN
    IF NOT (COALESCE(NEW.patch->>'exit_reason', '') = ANY (public.child_exit_reasons())) THEN
      RAISE EXCEPTION 'archive_needs_exit_reason' USING ERRCODE = '22023',
        HINT = 'graduated | aged_out | returned_to_family | transferred | deceased | other';
    END IF;
    IF length(COALESCE(NEW.patch->>'exit_note', '')) > 500
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(NEW.patch) k WHERE k NOT IN ('exit_reason', 'exit_note')) THEN
      RAISE EXCEPTION 'archive_patch_invalid' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS guard_archive_request ON public.unlock_requests;
CREATE TRIGGER guard_archive_request BEFORE INSERT ON public.unlock_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_archive_request();


-- ---------------------------------------------------------------------
-- ٢) لحظة الخروج: السبب يُختم، وحقوله لا تُكتب من العميل
-- ---------------------------------------------------------------------
-- ليست DEFINER: الحارس يحتاج current_user الحقيقي ليميّز العميل. والأرشفة
-- نفسها تمرّ من دوالّ الإدارة (DEFINER) فتقرأ الطلب المعتمد.
CREATE OR REPLACE FUNCTION public.stamp_child_exit()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE _patch JSONB;
BEGIN
  IF NEW.status = 'archived' AND OLD.status IS DISTINCT FROM 'archived' THEN
    -- الأرشفة بطلبٍ معتمد: السبب في الطلب نفسه.
    IF NULLIF(current_setting('kahatayn.unlock', true), '') IS NOT NULL THEN
      SELECT r.patch INTO _patch FROM public.unlock_requests r
       WHERE r.id::text = current_setting('kahatayn.unlock', true)
         AND r.orphan_id = NEW.id AND r.op = 'archive';
    END IF;
    NEW.exit_reason := COALESCE(NEW.exit_reason, _patch->>'exit_reason', 'other');
    NEW.exit_note := COALESCE(NEW.exit_note, NULLIF(btrim(COALESCE(_patch->>'exit_note', '')), ''));
    NEW.exited_at := now();
    RETURN NEW;
  END IF;

  IF (NEW.exit_reason IS DISTINCT FROM OLD.exit_reason
      OR NEW.exit_note IS DISTINCT FROM OLD.exit_note
      OR NEW.exited_at IS DISTINCT FROM OLD.exited_at)
     AND current_user IN ('authenticated', 'anon') AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'orphan: the exit is recorded by the administration' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_stamp_child_exit ON public.orphans;
CREATE TRIGGER trg_stamp_child_exit BEFORE UPDATE ON public.orphans
  FOR EACH ROW EXECUTE FUNCTION public.stamp_child_exit();
REVOKE ALL ON FUNCTION public.stamp_child_exit() FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- ٣) الخروج يُنهي الكفالات ويوقف المال
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sponsor_exit_followups (
  sponsorship_id   UUID PRIMARY KEY REFERENCES public.sponsorships(id) ON DELETE CASCADE,
  sponsor_id       UUID NOT NULL,
  orphan_id        UUID,
  amount           NUMERIC(12,2) NOT NULL,
  currency         TEXT NOT NULL,
  due_at           TIMESTAMPTZ NOT NULL,
  sent_at          TIMESTAMPTZ,
  suggested_orphan UUID
);
CREATE INDEX IF NOT EXISTS idx_exit_followups_due ON public.sponsor_exit_followups (due_at) WHERE sent_at IS NULL;
ALTER TABLE public.sponsor_exit_followups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sponsor_exit_followups FROM anon, authenticated;
GRANT ALL ON TABLE public.sponsor_exit_followups TO service_role;

CREATE OR REPLACE FUNCTION public.end_sponsorships_on_child_exit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _s        RECORD;
  _ended    INTEGER := 0;
  _live     INTEGER := 0;
  _sentence TEXT := public.child_exit_sentence(NEW.exit_reason);
  _delay    INTERVAL := CASE WHEN NEW.exit_reason = 'deceased' THEN interval '14 days' ELSE interval '3 days' END;
BEGIN
  FOR _s IN SELECT * FROM public.sponsorships
             WHERE orphan_id = NEW.id AND status IN ('pending_payment', 'active', 'paused')
             FOR UPDATE LOOP
    UPDATE public.sponsorships
       SET status = CASE WHEN _s.status = 'pending_payment' THEN 'cancelled'::public.sponsorship_status
                         ELSE 'completed'::public.sponsorship_status END,
           ended_at = now(), end_reason = 'child_exit', paused_until = NULL,
           provider_cancel_state = CASE WHEN _s.provider_subscription_id IS NOT NULL THEN 'pending'
                                        ELSE provider_cancel_state END,
           provider_cancel_mode = CASE WHEN _s.provider_subscription_id IS NOT NULL THEN 'immediate'
                                       ELSE provider_cancel_mode END
     WHERE id = _s.id;
    PERFORM public.close_pending_payments(_s.id, 'child_exit');
    _ended := _ended + 1;

    IF _s.status = 'pending_payment' THEN
      PERFORM public.notify(_s.sponsor_id, 'other',
        'أُغلق طلب كفالتك لـ' || NEW.display_name,
        _sentence || '. أُغلق الطلب ولن يُطلب منك أي دفع.',
        '/dashboard', 'sponsorship', _s.id);
    ELSE
      _live := _live + 1;
      PERFORM public.notify(_s.sponsor_id, 'other',
        'انتهت كفالتك لـ' || NEW.display_name,
        _sentence || '. انتهت الكفالة اليوم ولن يُحصَّل منك شيءٌ بعده. شكراً لأنك كنت معه في رحلته.',
        '/dashboard', 'sponsorship', _s.id);
      INSERT INTO public.sponsor_exit_followups (sponsorship_id, sponsor_id, orphan_id, amount, currency, due_at)
      VALUES (_s.id, _s.sponsor_id, NEW.id, _s.amount, _s.currency, now() + _delay)
      ON CONFLICT (sponsorship_id) DO NOTHING;
    END IF;
  END LOOP;

  IF _ended > 0 THEN
    INSERT INTO public.money_issues (kind, orphan_id, detail)
    VALUES ('child_exit', NEW.id, jsonb_build_object('reason', NEW.exit_reason, 'note', NEW.exit_note,
                                                     'ended', _ended, 'live', _live));
  END IF;
  PERFORM public.log_integrity('child_exit', NEW.id,
    jsonb_build_object('reason', NEW.exit_reason, 'sponsorships_ended', _ended));
  RETURN NULL;
END $fn$;
DROP TRIGGER IF EXISTS trg_end_sponsorships_on_child_exit ON public.orphans;
CREATE TRIGGER trg_end_sponsorships_on_child_exit AFTER UPDATE OF status ON public.orphans
  FOR EACH ROW WHEN (NEW.status = 'archived' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.end_sponsorships_on_child_exit();
REVOKE ALL ON FUNCTION public.end_sponsorships_on_child_exit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_archive_request() FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- ٤) الإشعار الثاني: طفلٌ ينتظر، بالعملة نفسها
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_due_exit_followups()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _f RECORD; _c RECORD; _n INTEGER := 0;
BEGIN
  FOR _f IN SELECT * FROM public.sponsor_exit_followups
             WHERE sent_at IS NULL AND due_at <= now()
             ORDER BY due_at FOR UPDATE SKIP LOCKED LOOP
    SELECT s.id, s.display_name, s.gap, s.currency INTO _c
      FROM public.suggest_orphans_for_amount(_f.amount, _f.orphan_id, 10) s
     WHERE s.currency = _f.currency
       AND NOT EXISTS (SELECT 1 FROM public.sponsorships x
                        WHERE x.orphan_id = s.id AND x.sponsor_id = _f.sponsor_id
                          AND x.status IN ('pending_payment', 'active', 'paused'))
     LIMIT 1;

    IF _c.id IS NOT NULL THEN
      PERFORM public.notify(_f.sponsor_id, 'other',
        'طفلٌ ينتظر كافلاً',
        'إن أردت أن يستمرّ عطاؤك: ' || _c.display_name || ' ينتظر من يكفله، والمتبقّي من احتياجه الشهري '
          || trim(to_char(_c.gap, 'FM999999990.##')) || ' ' || _c.currency
          || '. لا التزام عليك؛ اختر متى شئت.',
        '/orphans/' || _c.id, 'orphan', _c.id);
    ELSE
      PERFORM public.notify(_f.sponsor_id, 'other',
        'أطفالٌ ينتظرون كافلاً',
        'إن أردت أن يستمرّ عطاؤك، في الدليل ملفاتٌ معتمدة تنتظر. لا التزام عليك؛ اختر متى شئت.',
        '/orphans', NULL, NULL);
    END IF;
    UPDATE public.sponsor_exit_followups SET sent_at = now(), suggested_orphan = _c.id
     WHERE sponsorship_id = _f.sponsorship_id;
    _n := _n + 1;
    _c := NULL;
  END LOOP;
  RETURN _n;
END $fn$;
REVOKE ALL ON FUNCTION public.send_due_exit_followups() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_due_exit_followups() TO service_role;


-- ---------------------------------------------------------------------
-- ٥) إخراج طفلٍ غير مقفول — للإدارة، بسبب
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_archive_child(_orphan UUID, _reason TEXT, _note TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _o public.orphans%ROWTYPE; _n TEXT := NULLIF(btrim(COALESCE(_note, '')), '');
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501'; END IF;
  IF NOT (COALESCE(_reason, '') = ANY (public.child_exit_reasons())) THEN
    RAISE EXCEPTION 'admin_archive_child: unknown exit reason %', _reason USING ERRCODE = '22023';
  END IF;
  IF length(COALESCE(_n, '')) > 500 THEN
    RAISE EXCEPTION 'admin_archive_child: note too long' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _o FROM public.orphans WHERE id = _orphan FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'admin_archive_child: no orphan' USING ERRCODE = 'P0002'; END IF;
  IF _o.status = 'archived' THEN RAISE EXCEPTION 'admin_archive_child: already archived' USING ERRCODE = '55000'; END IF;
  -- المقفول (مكفولٌ أو مدعوم) يُخرَج بطلبٍ بموافقتين، لا من هنا.
  IF public.orphan_is_locked(_orphan) THEN
    RAISE EXCEPTION 'orphan_locked' USING ERRCODE = '42501',
      HINT = 'طفلٌ مكفول يُخرَج بطلب أرشفةٍ رسمي يحمل السبب.';
  END IF;
  UPDATE public.orphans SET status = 'archived', exit_reason = _reason, exit_note = _n WHERE id = _orphan;
  PERFORM public.write_audit('orphan.exited', 'orphan', _orphan,
    jsonb_build_object('reason', _reason, 'note', _n, 'from', _o.status));
  RETURN jsonb_build_object('ok', true);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_archive_child(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_archive_child(UUID, TEXT, TEXT) TO authenticated;


-- ---------------------------------------------------------------------
-- ٦) صندوق القرارات: بنود المال (منها خروج الطفل)
-- ---------------------------------------------------------------------
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
        SELECT 'transfer', s.id, o.display_name,
               'تحويل بنكي · ' || s.amount::text || ' ' || s.currency
                 || ' · مرجع ' || upper(left(s.id::text, 8)),
               s.created_at
          FROM public.sponsorships s JOIN public.orphans o ON o.id = s.orphan_id
         WHERE s.status = 'pending_payment' AND public.awaits_manual_transfer(s.id)
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
        UNION ALL
        -- بنود المال: ما لم يُقيَّد صامتاً، وخروج طفلٍ وما أنهاه من كفالات.
        SELECT 'money_issue', m.id, COALESCE(o.display_name, 'دفعة'),
               CASE m.kind
                 WHEN 'child_exit' THEN 'خروج طفل · ' || public.child_exit_label(m.detail->>'reason')
                   || ' · أُنهيت ' || COALESCE(m.detail->>'ended', '0') || ' كفالة — تحقّق من إيقاف التحصيل'
                 WHEN 'charge_after_end' THEN 'تحصيلٌ بعد انتهاء الكفالة · '
                   || COALESCE(m.amount::text || ' ' || m.currency, '') || ' — يُردّ للكافل'
                 WHEN 'currency_mismatch' THEN 'تحصيلٌ بعملةٍ مخالفة · '
                   || COALESCE(m.amount::text || ' ' || m.currency, '') || ' بدل ' || COALESCE(m.detail->>'expected_currency', '')
                 WHEN 'amount_mismatch' THEN 'مبلغٌ غير المتّفق عليه · '
                   || COALESCE(m.amount::text || ' ' || m.currency, '') || ' بدل ' || COALESCE(m.detail->>'expected_amount', '')
                 ELSE 'تعذّر إلغاء الاشتراك لدى المزوّد — أُلغِه من لوحته'
               END,
               m.created_at
          FROM public.money_issues m LEFT JOIN public.orphans o ON o.id = m.orphan_id
         WHERE m.status = 'open'
      ) i), '[]'::jsonb);
END $fn$;
