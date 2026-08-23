# دليل التشغيل — كافل

## المدير المؤسّس

`p.o.m2012@hotmail.com` مسجَّل في `public.protected_admins` ويحمل دور `admin`
على الإنتاج. الحماية المطبَّقة:

| الحماية | الآلية |
|---|---|
| لا يستطيع أحد إضافة نفسه للقائمة | `protected_admins` بلا `GRANT` وبلا سياسات — غير مرئية لـ`anon` و`authenticated` |
| لا يمكن حذف الدور أو تخفيضه | `trg_guard_protected_admin_role` على `user_roles` |
| لا يمكن حذف الحساب | `trg_guard_protected_admin_user` على `auth.users` |
| لا يمكن إزالة آخر مدير | نفس الحارس يرفض إذا بقي مدير واحد |
| استعادة تلقائية | لو حُذف الحساب بالتجاوز وأُعيد تسجيله بنفس البريد، يستعيد `admin` عبر `handle_new_user` |

الحماية **مطلقة حتى أمام `service_role`**. مخرج الطوارئ الوحيد إعلان صريح في
نفس الجلسة:

```sql
BEGIN;
SET LOCAL app.allow_protected_admin_change = 'yes-i-am-sure';
-- التعديل المطلوب هنا
COMMIT;
```

لإضافة مدير محميّ آخر:

```sql
INSERT INTO public.protected_admins (email, reason)
VALUES ('someone@example.com', 'سبب الحماية');
-- ثم امنح الدور للحساب القائم:
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE lower(email) = 'someone@example.com'
ON CONFLICT DO NOTHING;
```

## إنشاء حساب مدير عادي (غير محميّ)

بعد إغلاق الثغرة **C1**، لم يعد أي مستخدم قادراً على منح نفسه دور `admin` عند
التسجيل. الأدوار القابلة للإسناد الذاتي هي `sponsor` و`care_org` فقط.

المدير يُسند يدوياً عبر `service_role` — من محرّر SQL في لوحة Supabase، أو
باتصال يحمل `SUPABASE_SERVICE_ROLE_KEY`:

```sql
-- 1) سجّل الحساب أولاً من واجهة /auth بالبريد المطلوب
-- 2) ثم امنحه الدور:
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'admin@example.com'
ON CONFLICT DO NOTHING;
```

نفس الأمر ينطبق على دور `guardian` (ولي الأمر) حتى تُبنى لوحته في المرحلة 4.

## تدقيق لازم مرة واحدة بعد تطبيق الهجرة

إصلاح **C1** يمنع التصعيد الجديد، ولا يُزيل أي دور `admin` مُنح قبل الإصلاح.
راجع القائمة يدوياً واحذف ما لا تعرفه:

```sql
SELECT ur.user_id, u.email, ur.created_at
FROM public.user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE ur.role = 'admin'
ORDER BY ur.created_at;
```

راجع كذلك ما قد يكون نُشر أو فُعّل عبر الثغرات C2 و C4 و C5:

```sql
-- ملفات أيتام لا تتبع جهة رعاية، أو اعتُمدت بلا سجلّ مراجعة
SELECT id, code, display_name, status, org_id, created_by, approved_at
FROM public.orphans
WHERE org_id IS NULL OR (status = 'approved' AND approved_at IS NULL);

-- جهات معتمدة يملكها مستخدم (البيانات التجريبية بلا مالك)
SELECT id, name, status, owner_id FROM public.care_organizations
WHERE status = 'approved' AND owner_id IS NOT NULL;

-- كفالات نشطة بلا دفعة مسدّدة مقابلة
SELECT s.id, s.sponsor_id, s.orphan_id, s.amount, s.status
FROM public.sponsorships s
WHERE s.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.sponsorship_payments p
    WHERE p.sponsorship_id = s.id AND p.status = 'paid'
  );
```

## إدارة الأسرار

| النوع | المكان | مثال |
|---|---|---|
| قيم عامة تصل إلى المتصفّح | `.env` (متتبَّع في Git) | `VITE_SUPABASE_PUBLISHABLE_KEY` |
| أسرار | `.env.local` (مُتجاهَل) أو متغيّرات بيئة Lovable Cloud | `SUPABASE_SERVICE_ROLE_KEY`، `LOVABLE_CRON_SECRET`، مفاتيح بوابة الدفع |

`.env.example` يوثّق القائمة كاملة. **لا تضع سراً في `.env`** — الملف متتبَّع
ويُدفع إلى GitHub تلقائياً.

## التحقّق من الحماية

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase0-verification.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/founder-admin-verification.sql
```

ينفّذ سيناريوهات الاستغلال الفعلية ويفشل إن نجح أيٌّ منها. كل شيء داخل معاملة
تنتهي بـ `ROLLBACK` فلا يبقى أثر. يتطلّب اتصالاً بصلاحيات `postgres` لأنه ينتحل
الأدوار عبر `SET ROLE`.

## نمط الحرّاس في القاعدة

الحرّاس المضافون في `20260823100000_phase0_critical_security_hardening.sql`
تتبع قاعدتين يجب الحفاظ عليهما عند أي تعديل لاحق:

1. **الدوال `SECURITY INVOKER` عمداً.** `SECURITY DEFINER` يبدّل `current_user`
   إلى مالك الدالة، فيمرّ شرط `current_user NOT IN ('authenticated','anon')`
   دائماً ويتعطّل الحارس بالكامل.
2. **`pg_trigger_depth() > 1` يسمح للمُشغّلات المتداخلة بالمرور** — وهو ما
   يُبقي `recalc_orphan_funding()` قادرة على تحديث `funded_monthly` رغم أن
   العمود محظور على العميل. لا يمكن للعميل انتحال هذا الشرط.
