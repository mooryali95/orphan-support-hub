# ما يُبنى في الرواد — بأسبابه

> لجلسةٍ جديدة خاصّة بتكامل المنصّتين، تعمل على ريبو الرواد (`rowad-platform`).
> العقد الكامل: [`kahatayn-rowad.ar.md`](./kahatayn-rowad.ar.md).
> قُرئ الريبو للاطّلاع من نسخةٍ مرفوعة (٦٥١ ملفاً من ٦٥٢؛ الأخير كان مقطوعاً). تحقّق من الأسماء
> على الفرع الحيّ قبل البدء.

## موجز للجلسة الجديدة (يُلصق في أوّلها)

```
المهمّة: تجهيز منصّة الرواد (Next.js + Prisma + Supabase) للتكامل مع كهاتين، منصّة كفالة الأيتام.
اقرأ docs/integration/kahatayn-rowad.ar.md وdocs/integration/rowad-changes.ar.md من ريبو كهاتين
(mooryali95/orphan-support-hub). نفّذ البنود بالترتيب، بندٌ لكل PR، ولكل بندٍ اختباره.
قيود: لا حذف ولا تعديل لبيانات حقيقية؛ المعاينات تشترك مع قاعدة الإنتاج حتى يُنفَّذ البند ٢،
فلا تُنشئ ولا تحذف بيانات فيها. الهجرات تُطبَّق على الإنتاج بموافقة المالك فقط.
```

---

## ١. إزالة Vercel

**السبب:** أُلغي الاشتراك في Vercel. ما بقي منه كودٌ لا يعمل، وتبعيةٌ تُحمَّل في كل صفحة، ونشرٌ
قديم لـ `rowad.manzoma.sa` و`rowad-albania.manzoma.sa` قد يخدم نسخةً متأخّرة.

| الموضع | العمل |
|---|---|
| `package.json` ← `@vercel/analytics` | حذف التبعية |
| `src/app/layout.tsx` ← `import { Analytics } …` و`<Analytics />` | حذف السطرين |
| `scripts/deploy-migrations.mjs` ← `process.env.VERCEL_ENV === "production" \|\|` | حذف هذا الشرط وحده |
| `scripts/check-production-journey.mjs` ← `["Rowad (Vercel)", …]` | استبداله بعنوان Cloudflare أو حذفه |
| تعليقات في `api/school-admin/workshops/[id]/route.ts` و`…/videos/route.ts` | تحديث النصّ (لا منطق) |
| `.gitignore` ← `.vercel` | يُترك أو يُحذف؛ لا أثر |
| `docs/security.md`، `docs/cloudflare-deployment.md`، `README.md` | حذف صفوف Vercel وخطوة «Vercel project env» من تغيير كلمة السرّ |

⚠️ **فخّ في سكربت الهجرات:** الشرط الحالي `VERCEL_ENV === "production" || (WORKERS_CI === "1" && …master)`.
احذف الشقّ الأول فقط. لو حُذف الشرط كلّه لطُبّقت الهجرات في كل بناء، ومنها المعاينات المشتركة مع الإنتاج.

**قبل الحذف:** انقل نطاقَي `rowad` و`rowad-albania` في Cloudflare DNS إلى الـWorker، وتحقّق أن
`check-production-journey` يمرّ عليهما. وإلا انقطع الموقعان.

## ٢. فصل المعاينات عن قاعدة الإنتاج

**السبب:** `docs/security.md` ينصّ على أن معاينات Cloudflare تشترك مع قاعدة الإنتاج. أيّ PR تجريبي
يستطيع أن يكتب أو يحذف بيانات أطفالٍ حقيقيين. هذا أخطر ما في الريبو اليوم، ويسبق كل تكامل.

**العمل:** فرع قاعدة (Supabase branch) أو مشروعٌ منفصل للمعاينات، ببياناتٍ مختلَقة من سكربتات
`seed-*`. وفحصٌ في `checks` يرفض البناء إن تطابق `DATABASE_URL` المعاينة مع الإنتاج.

## ٣. حقل الربط بكهاتين

**السبب:** لا حقل في `students` يربطه بملفٍّ في كهاتين. المطابقة بالاسم أو العمر تخطئ (الأسماء
تتكرّر وتُكتب بأشكال، والعمر رقمٌ يتقادم).

```prisma
model Student {
  // …
  kahatayn_orphan_id  String?   @unique @db.Uuid
  kahatayn_linked_at  DateTime?
}
```

يُكتب مرّةً من كهاتين عند الاعتماد (عبر مسارٍ موقّع، البند ٧)، ولا يُعدَّل بعدها إلا بإذن.

## ٤. الحقول الناقصة للمزامنة

**السبب:** المزامنة التزايدية تسأل «ما الذي تغيّر منذ آخر مرّة؟»، ولا جواب بلا `updated_at`.

| الجدول | الناقص | لماذا |
|---|---|---|
| `students` | `updated_at`، `birth_date` | `age` رقمٌ ثابت يتقادم كل سنة؛ كهاتين تعرض فئةً عمرية تُحسب من التاريخ |
| `trait_evaluations` | `updated_at` | الدرجة تُستبدل اليوم دون أثر زمني |
| `journey_progress` | تحقّق من وجود `updated_at` | |
| `student_support_contacts` | — (فيه `updated_at`) | لا يُزامَن أصلاً: بيانات وليٍّ لا تغادر الدولة |

## ٥. ما يُعرَض لكهاتين: مسار تصدير

**السبب:** المزامنة باتجاهٍ واحد، والرواد هو الدافع. يحتاج مساراً يجمع ما تغيّر ويرسله دفعاتٍ
بصيغة عقد كهاتين (`docs/rowad-sync.ar.md` في ريبو كهاتين).

- مهمّة مجدولة (Cron Trigger في Cloudflare) كل ١٥ دقيقة: تجمع ما تغيّر بـ`updated_at`، وتُرسل إلى
  `POST /api/integrations/mirror` في كهاتين بمفتاح الدولة (`X-Api-Key` و`X-Api-Secret` و`X-Api-Timestamp`،
  نافذة ٥ دقائق، حتى ٥٠٠ سجلّ للدفعة) — الصيغة والجداول مفصّلة في `docs/rowad-sync.ar.md`.
- **ويُصدَّر تقدّم الرحلة أيضاً:** `journey_progress` ووحدات الخارطة (`roadmap_modules`) ومرحلتها — يُربط
  كلٌّ منها بجلسةٍ في برنامج التأهيل بكهاتين، فيرى الكافل «ما اجتازه في هذا الشهر» من مصدره الحقيقي.
- **الحدّ الأدنى فقط:** معرّف الطالب، الرابط، المدرسة/المنطقة، المرحلة، الجلسات، درجات السمات.
  لا أسماء أولياء، ولا هواتف، ولا صور.
- كل سجلٍّ ببصمته `sha256` لمحتواه المعياري، وكل دفعة ببصمة سابقتها (البند ٨).
- المفتاح في أسرار الـWorker، لا في `platform_secrets` (الجدول يقرؤه من له صلاحية القاعدة).

## ٦. الأقفال في القاعدة

**السبب:** الطفل المكفول لا يُحذف ولا تُغيَّر هويته ولا تُستبدل تقييماته إلا بقرارٍ رسمي. والقفل
في القاعدة لا في الكود، لأن:
- Prisma يتّصل بصلاحيات `postgres` فيتجاوز RLS؛
- في المخطّط **١٦٠ علاقة `onDelete: Cascade`**: حذف `profiles` يحذف `students` ثم كل تقييماته
  ورحلته — والمشغّل يعمل على الحذف المتسلسل أيضاً، أمّا كود التطبيق فلا يراه.

```sql
CREATE TABLE public.kahatayn_locks (
  student_id  uuid PRIMARY KEY REFERENCES public.students(id) ON DELETE RESTRICT,
  orphan_id   uuid NOT NULL,
  reason      text NOT NULL,           -- sponsored | supported | disbursed
  locked_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kahatayn_locks ENABLE ROW LEVEL SECURITY;  -- بلا سياسات: لا وصول من المتصفّح

CREATE FUNCTION public.guard_locked_student() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.kahatayn_locks l WHERE l.student_id = OLD.id)
     AND NOT public.kahatayn_grant_valid('students', OLD.id, lower(TG_OP)) THEN
    RAISE EXCEPTION 'student_locked_by_kahatayn' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE TRIGGER students_lock_delete BEFORE DELETE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.guard_locked_student();
CREATE TRIGGER students_lock_identity BEFORE UPDATE OF school_id, class_id, profile_id, kahatayn_orphan_id
  ON public.students FOR EACH ROW EXECUTE FUNCTION public.guard_locked_student();
```

ومثلها على `trait_evaluations` و`trait_assessments` (تعديلٌ أو حذف لطالبٍ مقفول)، و`profiles`
(حذف حساب طالبٍ مقفول، أو تغيير `full_name`).

**التصحيح لا يمحو:** تعديل درجةٍ معتمدة يكتب الأصل أولاً في جدول مراجعات (على نمط
`assessment_rating_revisions` القائم)، ثم يطبّق الجديد. ولقطات `trait_assessment_snapshots` القائمة
تبقى كما هي.

**تنبيه:** `SET session_replication_role = replica` يعطّل المشغّلات. يُمنع في كل السكربتات، ويُضاف
فحصٌ في `checks` يرفض أي ملفٍّ يحتويه.

## ٧. الإذن الموقّع للفكّ

**السبب:** الفكّ يُقرَّر في كهاتين (موافقة مسؤولَين)، ويُنفَّذ في الرواد. الجسر إذنٌ لا يُزوَّر.

- كهاتين توقّع الإذن بمفتاح Ed25519 خاصّ لا يغادرها. الرواد يحمل المفتاح العامّ في أسرار الـWorker.
- مسار `POST /api/kahatayn/grant` في الرواد: يتحقّق من التوقيع، والجمهور (`aud = rowad:<الدولة>`)،
  والانتهاء (≤ ١٥ دقيقة)، وعدم الاستعمال السابق (`jti`)، ثم يكتب في `kahatayn_grants`.
- `kahatayn_grant_valid(table, id, op)` في القاعدة تقرأ الجدول: إذنٌ صالح، لهذا السجلّ، لهذه
  العملية، لم يُستهلك. وتستهلكه.
- ومسار `POST /api/kahatayn/lock` (الموقّع أيضاً) يُنشئ القفل والرابط عند أوّل كفالة أو دعم.

## ٨. البصمات وسجلّ الأحداث

**السبب:** حتى مع الأقفال، يجب أن يُكتشف أيّ تغييرٍ مرّ من طريقٍ غير متوقّع.

- `kahatayn_outbox`: كل تغييرٍ على سجلٍّ مقفول يُكتب فيه بمشغّل (الجدول، المعرّف، العملية، القديم،
  الجديد، الفاعل، البصمة، بصمة السابق). **لا `UPDATE` ولا `DELETE` عليه** — مشغّلٌ يرفضهما.
- المزامنة (البند ٥) تُرسل منه، فيرى كهاتين التسلسل كاملاً.

## ٩. ما بعد ذلك (اقتراحات، لا شروط)

| الاقتراح | السبب |
|---|---|
| تدوير `SUPABASE_SERVICE_ROLE_KEY` وكلمة القاعدة بعد إزالة Vercel | كانت محفوظة في بيئة Vercel الملغاة |
| فحص `check-tenant-isolation` يُضاف إلى `checks` إن لم يكن | الأقفال تُبنى على عزلٍ سليم بين المدارس |
| تاريخ الميلاد بدل العمر في الواجهة أيضاً | بيانات صحيحة بعد سنة |
| نشرٌ لكل دولة من الكود نفسه بإعدادٍ مختلف | ٣٤ دولة لا تُدار بـ٣٤ فرعاً |

## الترتيب

| PR | البنود | يمسّ الإنتاج؟ |
|---|---|---|
| ١ | ١ إزالة Vercel | لا (بعد نقل النطاقين) |
| ٢ | ٢ فصل المعاينات | إعدادات فقط |
| ٣ | ٣ + ٤ الحقول | هجرة إضافية لا تحذف شيئاً |
| ٤ | ٦ الأقفال | هجرة — بموافقة المالك |
| ٥ | ٧ الإذن والقفل | مسارات + هجرة |
| ٦ | ٥ + ٨ التصدير والبصمات | Cron + هجرة |

لكل PR اختبار هجومه: حذف `profiles` لطالبٍ مقفول يفشل؛ إذنٌ منتهٍ أو لسجلٍّ آخر أو مستعمل يفشل؛
`UPDATE` على `kahatayn_outbox` يفشل؛ معاينةٌ بعنوان قاعدة الإنتاج يفشل بناؤها.
