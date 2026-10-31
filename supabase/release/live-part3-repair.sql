-- =====================================================================
-- إصلاحٌ للقاعدة الحيّة بعد الحزمة: ما أسقطته نسخة Lovable من هجرة المرحلة ٤.
-- مُشغِّل الترحيب بالحساب الجديد لم يُنشأ قطّ على الحيّة (الدالّة موجودة وتُحدَّث،
-- والمشغِّل غائب)، فلا يصل الكافلَ الجديد إشعار ترحيب. آمنٌ للتكرار.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;
DROP TRIGGER IF EXISTS trg_notify_new_user ON auth.users;
CREATE TRIGGER trg_notify_new_user
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.notify_new_user();
COMMIT;
