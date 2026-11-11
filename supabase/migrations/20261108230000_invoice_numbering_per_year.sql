-- =====================================================================
-- الدفعة 3B — GAP-06: ترقيم الفواتير لكل سنة وبلا ثغرات
-- ---------------------------------------------------------------------
-- next_invoice_no كان nextval() على تسلسلٍ عامّ: التسلسل لا يتراجع، فإدراجٌ
-- يفشل بعد أخذ الرقم (حدثٌ مكرّر من المزوّد يصطدم بـux_payments_provider_payment)
-- يحرق رقماً، والعدّ لا يبدأ من جديد في السنة الجديدة (INV-2027-000004).
--
-- العدّاد صار صفّاً لكل سنة يُزاد بقفل الصفّ داخل المعاملة نفسها: الإدراج
-- الفاشل يتراجع بزيادته، فلا ثغرة. والثمن تسلسل إصدار الفواتير في السنة
-- الواحدة (قفلٌ حتى نهاية المعاملة) — وهو حجمٌ لا يُشعر به هنا.
--
-- ما صدر قبلها لا يتغيّر رقمه؛ وعدّاد كلّ سنةٍ يبدأ بعد أكبر رقمٍ صدر فيها،
-- فلا يتكرّر رقم. والتسلسل القديم يبقى (لا يُحذف كائنٌ قد يُشير إليه شيء).
--
-- ما لم يُعالَج هنا (يحتاج قراراً ضريبياً لا هجرة): إشعار الدائن عند الردّ،
-- وبيانات المُصدِر ورقمه الضريبي (NUIS) والمشتري، والتسجيل المالي في ألبانيا.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.invoice_counters (
  year    INTEGER PRIMARY KEY CHECK (year BETWEEN 2000 AND 2999),
  last_no INTEGER NOT NULL CHECK (last_no >= 0)
);
ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.invoice_counters TO service_role;

INSERT INTO public.invoice_counters (year, last_no)
SELECT substring(invoice_no FROM '^INV-(\d{4})-')::int,
       max(substring(invoice_no FROM '^INV-\d{4}-(\d+)$')::int)
  FROM public.sponsorship_payments
 WHERE invoice_no ~ '^INV-\d{4}-\d+$'
 GROUP BY 1
ON CONFLICT (year) DO UPDATE SET last_no = GREATEST(public.invoice_counters.last_no, EXCLUDED.last_no);

CREATE OR REPLACE FUNCTION public.next_invoice_no(_at TIMESTAMPTZ)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SET search_path = public AS $fn$
DECLARE _year INTEGER := extract(year FROM COALESCE(_at, now()) AT TIME ZONE 'UTC')::int; _n INTEGER;
BEGIN
  INSERT INTO public.invoice_counters AS c (year, last_no) VALUES (_year, 1)
  ON CONFLICT (year) DO UPDATE SET last_no = c.last_no + 1
  RETURNING last_no INTO _n;
  RETURN 'INV-' || _year::text || '-' || lpad(_n::text, 6, '0');
END $fn$;
REVOKE ALL ON FUNCTION public.next_invoice_no(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
