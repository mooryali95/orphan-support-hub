-- =====================================================================
-- نقل drizzle 0007 (طبّقه Lovable على البثّ مباشرةً) إلى السلسلة
-- ---------------------------------------------------------------------
-- حالة قاطع «سؤالي» الدائمة: صفٌّ واحد بالخادم وحده يحفظ رفض المزوّد
-- (402/403) فلا يُعاد الطلب تلقائياً. لا محادثات ولا بيانات أطفال.
-- النصّ مطابقٌ لما طُبّق على البثّ، ومحروسٌ ليُعاد تطبيقه بأمان.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.supporter_assistant_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  status integer NOT NULL CHECK (status IN (402, 403)),
  message text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.supporter_assistant_state TO service_role;
REVOKE ALL ON public.supporter_assistant_state FROM anon, authenticated;
ALTER TABLE public.supporter_assistant_state ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.supporter_assistant_state IS 'Server-only durable AI access/credit circuit breaker. Stores no conversations or child information.';
