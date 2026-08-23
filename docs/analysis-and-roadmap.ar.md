# منصة «كافل» — التحليل الشامل وخارطة الطريق التنفيذية

> **نطاق الوثيقة:** فحص كامل للكود والمخطّط وقاعدة البيانات وسياسات الصلاحيات في `mooryali95/orphan-support-hub`، مقارنةً بالتصوّر المعتمد في `.lovable/plan/`، مع تحديد الفجوات الوظيفية والثغرات الأمنية وخطة عمل تنفيذية بمراحل ومهام قابلة للقياس.
>
> **تاريخ الفحص:** 2026-08-23 · **المرجع:** `main` @ `ff09262` · **الفرع:** `claude/app-comprehensive-analysis-4ni1hq`

---

> ## ✅ حالة التنفيذ — المرحلة 0 مكتملة
>
> نُفِّذت المرحلة 0 في `supabase/migrations/20260823120000_phase0_critical_security_hardening.sql`،
> وتغطي **C1–C5** و**H1–H5**. الثغرات المتوسطة (M1–M9) لا تزال مفتوحة حسب ترتيب المراحل أدناه.
>
> الإثبات في `supabase/tests/phase0-verification.sql` — ينفّذ سيناريوهات الاستغلال
> الفعلية ويفشل إن نجح أيٌّ منها. تم تشغيله على PostgreSQL 16 بمحاكاة أدوار Supabase
> (`anon` / `authenticated` / `service_role`) وبيئة `auth.uid()`:
> **31 فحصاً ناجحاً**، وكل استغلال أُعيد إنتاجه على المخطّط قبل الإصلاح للتأكّد من أن
> الفحوص ليست جوفاء.
>
> **مطبَّقة على الإنتاج** (مشروع Supabase `nqkdbsmkbqphlyzborwo`) والتحقّق مؤكَّد:
> تسعة حرّاس مثبّتة، `anon` مقصور على 16 عموداً عاماً، ولا صلاحية كتابة للعميل على
> سجلّ المدفوعات أو الخط الزمني. البيانات سليمة: 5 ملفات أيتام، جهتان، 15 بند احتياج.
>
> فحص قاعدة البيانات قبل التطبيق أثبت أن **لا أثر لأي استغلال**: مستخدم واحد، صفر
> كفالات، صفر مدفوعات، والجهات والملفات كلها بيانات تجريبية أصلية — فلا حاجة لأي تنظيف.
>
> المدير المؤسّس `p.o.m2012@hotmail.com` مُسنَد ومحميّ عبر
> `20260823140000_founder_admin_protection.sql` — التفاصيل في `docs/runbook.ar.md`.

## 1. الملخّص التنفيذي

### 1.1 الحكم النهائي

**لا تبدأ من الصفر.** المعمار الحالي سليم ومتوافق مع التصوّر: فصل صحيح للأدوار في جدول مستقل (`user_roles`) بدل عمود على البروفايل، دوال `SECURITY DEFINER` لفحص الصلاحيات، فصل البيانات العامة عن الحسّاسة (`orphans` مقابل `orphan_private`)، ومنطق التطبيق كله داخل `createServerFn` مع تحقّق `zod`. هذه قرارات صحيحة يصعب تصحيحها لاحقاً، وقد اتُّخذت بشكل صحيح.

**لكن النظام غير قابل للإطلاق في وضعه الحالي.** السبب ليس نقص المزايا، بل **خمس ثغرات حرجة في طبقة الصلاحيات (RLS)** تسمح لأي مستخدم مسجَّل بأن:

- يصبح **مديراً للنظام** لحظة التسجيل،
- **يفعّل كفالته دون دفع ريال واحد**،
- **يزوّر سجلّ المدفوعات**،
- **يعتمد جمعيته الخيرية بنفسه** وتظهر للعامة كـ«جهة معتمدة»،
- **ينشر ملف يتيم وهمي** في الدليل العام ويستقبل عليه تبرّعات.

في منصّة تتعامل مع بيانات أطفال أيتام وتبرّعات مالية، أيٌّ من هذه الثغرات وحدها كفيلة بتدمير الثقة نهائياً. **إغلاقها هو المرحلة صفر، وهي مانعة (blocking) لأي عمل آخر.**

### 1.2 نضج النظام مقابل التصوّر المعتمد

| المرحلة في التصوّر | الحالة الفعلية | النسبة |
|---|---|---|
| 1 — الأساس (هيكل، أدوار، مصادقة، صفحات عامة) | مكتملة فعلياً | **90%** |
| 2 — ملف اليتيم (جداول، RLS، نموذج، مستندات، طابور اعتماد) | جداول وطابور اعتماد موجودان؛ النموذج مسطّح لا 7 خطوات؛ **لا خزنة مستندات إطلاقاً** | **45%** |
| 3 — الدليل والمطابقة (الدليل، صفحة اليتيم، الترشيح، لوحة الكافل) | الدليل وصفحة اليتيم واللوحة موجودة؛ **دالة المطابقة موجودة في القاعدة وغير مستخدَمة في الواجهة** | **60%** |
| 4 — الكفالة والدفع (بوابة، اشتراك شهري، إيصالات، صرف) | **غير موجودة نهائياً** — الكفالة تبقى `pending_payment` للأبد | **5%** |
| 5 — التقارير والمتابعة (تقارير دورية، إشعارات، خط زمني) | الجداول موجودة، **لا واجهة ولا كتابة واحدة عليها** | **10%** |
| 6 — تكامل API (مفاتيح، استيراد موقّع، webhooks) | الجداول موجودة، **لا مسار API واحد** | **5%** |
| 7 — التقوية (rate limiting، اختبارات، مراقبة، SEO) | **لا اختبارات، لا CI، لا rate limiting، لا sitemap، لا رؤوس أمنية** | **5%** |
| **الإجمالي المرجّح** | | **≈ 35%** |

### 1.3 صحة البناء (تم التحقق عملياً)

| الفحص | النتيجة |
|---|---|
| `tsc --noEmit` | ✅ نظيف — صفر أخطاء أنواع |
| `vite build` (إنتاج + nitro) | ✅ ينجح خلال ~840ms |
| `eslint .` | ❌ **904 مشكلة** (893 تنسيق `prettier`، 6 `react-refresh`، 4 `no-unused-expressions`، 1 `prefer-const`) |
| الاختبارات | ❌ **لا يوجد ملف اختبار واحد** |
| CI | ❌ **لا يوجد مجلد `.github`** |

### 1.4 حجم الأصل الحالي

87 ملف مصدري · 13 جدولاً · 8 أنواع `enum` · 6 دوال `SECURITY DEFINER` · 9 مسارات · 12 دالة خادم · هجرتان SQL · 46 مكوّن `shadcn/ui`.

---

## 2. خريطة النظام الحالي

### 2.1 الطبقة التقنية

```text
TanStack Start 1.168 (SSR + Nitro → Cloudflare)
  └─ React 19 · TanStack Router (file-based) · TanStack Query 5
  └─ Tailwind 4 · shadcn/ui (46 مكوّناً) · RTL كامل (lang="ar" dir="rtl")
  └─ createServerFn + zod  ← كل منطق التطبيق هنا
       └─ requireSupabaseAuth (middleware) → Supabase client بتوكن المستخدم
       └─ publicClient() → Supabase بمفتاح publishable (قراءة عامة)
  └─ Supabase Postgres + RLS + GRANTs صريحة
  └─ CSRF middleware مفعّل صراحةً في src/start.ts  ✅
```

**نقاط قوة معمارية حقيقية:**
- `createCsrfMiddleware` مُعاد تفعيله يدوياً في `src/start.ts:26` بعد أن ألغاه وجود الملف — قرار واعٍ وصحيح.
- `attachSupabaseAuth` مسجَّل كـ `functionMiddleware` عام، فلا تُرسل استدعاءات RPC بدون توكن.
- `client.server.ts` (مفتاح service_role) موجود ومحمي بتحميل كسول — **ولا يُستخدم في أي مكان**، أي لا تسريب لمفتاح خطير إلى حزمة المتصفّح.
- فصل `orphans` (عام) عن `orphan_private` (اسم كامل، هوية وطنية، جوال ولي الأمر) — نمط صحيح لحماية بيانات الأطفال.

### 2.2 نموذج البيانات

| الجدول | الغرض | RLS | ملاحظة الفحص |
|---|---|---|---|
| `profiles` | بروفايل المستخدم + `monthly_budget` + `preferred_region` | ✅ | **الحقلان لا يُكتبان ولا يُقرآن في أي شاشة** — لا صفحة بروفايل |
| `user_roles` | الأدوار (منفصلة) | ✅ | لا `GRANT INSERT` للمستخدم ✅ — لكن مسار التسجيل يلتف على ذلك (ثغرة C1) |
| `care_organizations` | جهات الرعاية | ⚠️ | **تعتمد نفسها** (ثغرة C4) |
| `orphans` | الملف العام | ⚠️ | **أي مستخدم ينشئه وينشره** (ثغرة C5) |
| `orphan_private` | البيانات الحسّاسة | ✅ | سياسة سليمة عبر `can_manage_orphan` |
| `orphan_needs` | بنود الاحتياج | ✅ | لا قيد يربط مجموعها بـ`monthly_need` |
| `orphan_documents` | خزنة الوثائق | ✅ | **لا bucket تخزين مُنشأ — الجدول عديم الفائدة** |
| `sponsorships` | عقد الكفالة | ⚠️ | **الكافل يفعّلها بنفسه** (ثغرة C2) |
| `sponsorship_payments` | سجلّ الدفعات | ⚠️ | **قابل للتزوير من المتصفّح** (ثغرة C3) |
| `disbursements` | الصرف للجهة | ✅ | كتابة للإدارة فقط — **لا واجهة** |
| `progress_reports` | التقارير الدورية | ⚠️ | **الجهة تعتمد تقريرها بنفسها** (ثغرة H1) |
| `timeline_events` | الخط الزمني | ⚠️ | **حقن أحداث لأي يتيم** (ثغرة H4) |
| `notifications` | الإشعارات | ✅ | **لا كاتب — الجدول فارغ دائماً** |
| `audit_log` | سجلّ التدقيق | ✅ | **لا كاتب — لا أثر تدقيقي لأي قرار إداري** |
| `api_clients` / `api_import_jobs` | تكامل خارجي | ✅ | **لا مسار API واحد يستخدمها** |

**جداول واردة في التصوّر وغير موجودة:** `messages`، `guardians`، `external_profile_map`.

### 2.3 المسارات ودوال الخادم

| المسار | الحماية | الحالة |
|---|---|---|
| `/` · `/orphans` · `/orphans/$id` · `/organizations` · `/how-it-works` | عام | ✅ مكتملة ومحسّنة لمحركات البحث |
| `/auth` | عام | ✅ بريد + Google OAuth |
| `/dashboard` | `_authenticated` | ✅ عرض الكفالات + إلغاء — **بلا دفع ولا إيصالات ولا تقارير** |
| `/org` | `_authenticated` | ⚠️ **بلا حارس دور** — أي مستخدم يفتحها ويسجّل جهة |
| `/admin` | `_authenticated` + فحص `is_admin` على الخادم ✅ | ✅ اعتماد الملفات والجهات فقط |

**مفقود من التصوّر:** صفحة الأسئلة، الخصوصية، الشروط، لوحة ولي الأمر، الرسائل، الدفعات والإيصالات، المالية والصرف، مراجعة التقارير، إدارة المستخدمين والأدوار، تكاملات API.

---

## 3. الثغرات الأمنية — مرتّبة بالخطورة

> كل ثغرة أدناه مُثبتة من الكود مع الموقع الدقيق وسيناريو الاستغلال. جميع الجداول المذكورة ممنوحة `GRANT` للدور `authenticated`، ومفتاح `publishable` منشور في حزمة المتصفّح بحكم التصميم — أي أن **أي مستخدم مسجَّل يستطيع مخاطبة REST API مباشرةً** متجاوزاً واجهة التطبيق. هذا ليس عيباً، لكنه يعني أن **RLS هي خط الدفاع الوحيد**.

### 🔴 C1 — تصعيد صلاحيات إلى «مدير النظام» عند التسجيل

**الموقع:** `supabase/migrations/20260823063344_*.sql` — الدالة `handle_new_user()`

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES (NEW.id, COALESCE(NULLIF(NEW.raw_user_meta_data->>'role',''), 'sponsor')::public.app_role);
```

**الاستغلال:** الحقل `raw_user_meta_data` يأتي حرفياً من `options.data` في `supabase.auth.signUp()` وهو **تحت سيطرة العميل بالكامل**. استدعاء واحد من وحدة تحكّم المتصفّح:

```js
supabase.auth.signUp({ email, password, options: { data: { role: 'admin' } } })
```

يمنح المهاجم دور `admin`، وبالتالي: قراءة كل البروفايلات، اعتماد/رفض كل ملف ويتيم وجهة، قراءة `audit_log`، قراءة كل الكفالات والمدفوعات، الكتابة على `disbursements`.

**الأثر:** استيلاء كامل على النظام بتسجيل حساب مجاني. **أخطر ثغرة في المستودع.**

**الإصلاح:** حصر الأدوار المسموح إسنادها ذاتياً في `sponsor` و`care_org` فقط، وجعل `admin` و`guardian` غير قابلين للإسناد إلا يدوياً:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _requested TEXT; _role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''))
  ON CONFLICT (id) DO NOTHING;

  _requested := NULLIF(NEW.raw_user_meta_data->>'role','');
  _role := CASE WHEN _requested IN ('sponsor','care_org')
                THEN _requested::public.app_role
                ELSE 'sponsor'::public.app_role END;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
```

> **ملاحظة مصاحبة:** لا يوجد حالياً أي مسار مشروع لإنشاء أول حساب مدير. يجب توثيق إنشائه يدوياً عبر `service_role` (`INSERT INTO user_roles ... 'admin'`) وتسجيله في `audit_log`.

---

### 🔴 C2 — الكافل يُفعّل كفالته بنفسه دون دفع

**الموقع:** الهجرة الأولى — سياسة `sponsorships_update`

```sql
CREATE POLICY "sponsorships_update" ON public.sponsorships FOR UPDATE TO authenticated
  USING (sponsor_id = auth.uid() OR public.is_admin())
  WITH CHECK (sponsor_id = auth.uid() OR public.is_admin());
```

**الاستغلال:** السياسة تسمح للكافل بتعديل **أي عمود** في عقده، بما فيه `status` و`amount`. طلب واحد:

```
PATCH /rest/v1/sponsorships?id=eq.<my-id>   { "status": "active", "amount": 999999 }
```

والمُشغِّل `trg_sponsorship_funding` يعيد احتساب `funded_monthly` فوراً لأنه يجمع الكفالات ذات الحالة `active`/`paused` — فيقفز اليتيم إلى `fully_sponsored` ويختفي من قائمة المحتاجين.

**الأثر:** انهيار سلامة البيانات المالية. اليتيم يظهر «مكفولاً بالكامل» بلا تمويل حقيقي، فيُحرم من كافل فعلي. لوحة الإدارة تعرض أرقام التزام شهري كاذبة.

**الإصلاح:** الكافل يملك حق التعديل على حقلين فقط (الرسالة، إخفاء الاسم) وحق الإلغاء؛ وتغيير الحالة إلى `active` لا يحدث إلا من الخادم بعد تأكيد بوابة الدفع:

```sql
DROP POLICY "sponsorships_update" ON public.sponsorships;

-- الإلغاء والتعديلات غير المالية فقط
CREATE POLICY "sponsorships_update_sponsor_safe" ON public.sponsorships FOR UPDATE TO authenticated
  USING (sponsor_id = auth.uid())
  WITH CHECK (sponsor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_sponsorship_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;
  IF NEW.amount        IS DISTINCT FROM OLD.amount        THEN RAISE EXCEPTION 'amount is immutable'; END IF;
  IF NEW.type          IS DISTINCT FROM OLD.type          THEN RAISE EXCEPTION 'type is immutable'; END IF;
  IF NEW.orphan_id     IS DISTINCT FROM OLD.orphan_id     THEN RAISE EXCEPTION 'orphan_id is immutable'; END IF;
  IF NEW.provider_subscription_id IS DISTINCT FROM OLD.provider_subscription_id THEN RAISE EXCEPTION 'provider fields are server-only'; END IF;
  -- المستخدم يستطيع الإلغاء فقط، لا التفعيل
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'status transition is server-only';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_guard_sponsorship_update
BEFORE UPDATE ON public.sponsorships FOR EACH ROW
EXECUTE FUNCTION public.guard_sponsorship_update();
```

---

### 🔴 C3 — تزوير سجلّ المدفوعات من المتصفّح

**الموقع:** الهجرة الأولى — `GRANT INSERT ON public.sponsorship_payments TO authenticated` + سياسة `payments_insert_own`

```sql
CREATE POLICY "payments_insert_own" ON public.sponsorship_payments
  FOR INSERT TO authenticated WITH CHECK (sponsor_id = auth.uid());
```

**الاستغلال:** الشرط الوحيد أن يكون `sponsor_id` هو المستخدم نفسه. لا قيد على `status` ولا `amount` ولا `provider_ref` ولا `receipt_url`:

```
POST /rest/v1/sponsorship_payments
{ "sponsorship_id": "...", "sponsor_id": "<me>", "amount": 5000,
  "status": "paid", "paid_at": "...", "receipt_url": "https://evil/receipt.pdf" }
```

**الأثر:** الدفتر المالي — وهو مصدر الحقيقة للصرف على الأيتام وللتقارير للمانحين — يصبح قابلاً للكتابة من أي مستخدم. عند بناء شاشة الصرف لاحقاً، ستُصرَف أموال حقيقية بناءً على قيود مزوّرة.

**الإصلاح:** سجلّ الدفعات **يُكتب من الخادم فقط** (webhook بوابة الدفع عبر `service_role`)؛ المستخدم يقرأ ولا يكتب:

```sql
REVOKE INSERT ON public.sponsorship_payments FROM authenticated;
DROP POLICY "payments_insert_own" ON public.sponsorship_payments;
```

ثم يُحذف الإدراج اليدوي من `src/lib/sponsorships.functions.ts:57` ويُستبدل بإنشاء نيّة دفع لدى المزوّد.

---

### 🔴 C4 — جهة الرعاية تعتمد نفسها

**الموقع:** الهجرة الأولى — سياسة `orgs_update_own`

```sql
CREATE POLICY "orgs_update_own" ON public.care_organizations FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());
```

**الاستغلال:** المالك يعدّل `status` من `pending` إلى `approved`، فتظهر جهته فوراً في `/organizations` تحت عنوان **«جهات الرعاية المعتمدة»** (سياسة `orgs_public_read_approved` تنشر كل ما حالته `approved` للزوّار غير المسجّلين).

**الأثر:** كيان وهمي يحمل شارة «معتمد» أمام المتبرّعين. هذا احتيال خيري مباشر، وأخطر أثراً من الجانب التقني: يهدم قيمة «التوثيق» التي تقوم عليها المنصة كلها.

**الإصلاح:** تثبيت `status` أمام المالك، وحصر تغييره في الإدارة:

```sql
CREATE OR REPLACE FUNCTION public.guard_org_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;
  IF NEW.status   IS DISTINCT FROM OLD.status   THEN RAISE EXCEPTION 'org status is admin-only'; END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN RAISE EXCEPTION 'owner_id is immutable'; END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_guard_org_update
BEFORE UPDATE ON public.care_organizations FOR EACH ROW
EXECUTE FUNCTION public.guard_org_update();
```

> **إضافة مطلوبة:** لا يوجد حالياً ما يمنع مستخدماً واحداً من تسجيل عشرات الجهات. أضف `UNIQUE (owner_id)` أو حدّاً في `registerOrganization`.

---

### 🔴 C5 — أي مستخدم ينشئ ملف يتيم وينشره في الدليل العام

**الموقع:** الهجرة الأولى — سياستا `orphans_insert` و`orphans_update`

```sql
CREATE POLICY "orphans_insert" ON public.orphans FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (org_id IS NULL OR public.owns_org(org_id) OR public.is_admin()));

CREATE POLICY "orphans_update" ON public.orphans FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR guardian_id = auth.uid() OR public.owns_org(org_id) OR public.is_admin())
  WITH CHECK (...نفس الشرط...);
```

**الاستغلال:** الشرط `org_id IS NULL` يفتح الإدراج لأي مستخدم مسجَّل بلا أي جهة راعية. ثم — بصفته `created_by` — يعدّل `status` إلى `approved`، فيُنشر الملف في `/orphans` (سياسة `orphans_public_read` تنشر `approved` للزوّار) ويصبح قابلاً للكفالة، لأن `createSponsorship` لا يتحقّق إلا من أن الحالة `approved`.

**الأثر:** **تجاوز كامل لطابور مراجعة الإدارة** — وهو جوهر المنصة. أي شخص ينشر ملف طفل ملفّق (أو صورة طفل حقيقي بلا إذن) ويجمع عليه تبرّعات. يشمل ذلك أيضاً قدرته على تعديل `funded_monthly` و`approved_at` و`external_ref` يدوياً.

**الإصلاح — من شقّين:**

```sql
-- 1) الإنشاء لجهة رعاية معتمدة أو الإدارة فقط
DROP POLICY "orphans_insert" ON public.orphans;
CREATE POLICY "orphans_insert" ON public.orphans FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.is_admin()
      OR EXISTS (SELECT 1 FROM public.care_organizations o
                 WHERE o.id = org_id AND o.owner_id = auth.uid() AND o.status = 'approved')
    )
  );

-- 2) الحقول الحسّاسة يحرسها مُشغِّل
CREATE OR REPLACE FUNCTION public.guard_orphan_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;
  IF NEW.funded_monthly IS DISTINCT FROM OLD.funded_monthly THEN RAISE EXCEPTION 'funded_monthly is trigger-managed'; END IF;
  IF NEW.approved_at    IS DISTINCT FROM OLD.approved_at    THEN RAISE EXCEPTION 'approved_at is admin-only'; END IF;
  IF NEW.external_ref   IS DISTINCT FROM OLD.external_ref   THEN RAISE EXCEPTION 'external_ref is integration-only'; END IF;
  -- الجهة تنقل الملف من مسودة إلى «مُرسَل» فقط؛ الاعتماد للإدارة
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.status IN ('draft','rejected') AND NEW.status = 'submitted') THEN
    RAISE EXCEPTION 'orphan status transition is admin-only';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_guard_orphan_update
BEFORE UPDATE ON public.orphans FOR EACH ROW
EXECUTE FUNCTION public.guard_orphan_update();
```

> **تنبيه على المُشغّل الحالي:** `recalc_orphan_funding()` تُحدّث `orphans` وهي `SECURITY DEFINER`، لذا يجب أن يستثنيها الحارس أعلاه (يُنفَّذ الحارس `BEFORE UPDATE` على مستوى الصف؛ عند استدعائه من داخل المُشغّل المالي سيرفض تعديل `funded_monthly`). الحل العملي: استخدام متغيّر جلسة `SET LOCAL app.bypass_guard = 'on'` داخل `recalc_orphan_funding` وفحصه في الحارس، أو نقل إعادة الاحتساب إلى دالة `service_role` على الخادم. **هذا التفصيل يجب اختباره قبل الدمج.**

---

### 🟠 H1 — جهة الرعاية تعتمد تقاريرها الدورية بنفسها

**الموقع:** سياسة `reports_write` — `FOR ALL ... USING (public.can_manage_orphan(orphan_id) OR public.is_admin())`

الجهة تنشئ التقرير **وتضبط `status = 'approved'`** في نفس الطلب، فيصل الكافل مباشرةً (`reports_read` تُظهر للكافل التقارير المعتمدة). حقل `review_note` المخصّص للإدارة قابل للكتابة من الجهة أيضاً.

**الأثر:** إلغاء فعلي لدور مراجعة الإدارة على تقارير الأثر — وهي المنتَج الذي يُباع للكافل.

**الإصلاح:** فصل السياسة: الجهة تكتب `INSERT`/`UPDATE` بحالة `submitted` فقط، والإدارة وحدها تنقلها إلى `approved`/`rejected` وتكتب `review_note` — بحارس `BEFORE` على غرار C5.

---

### 🟠 H2 — تسريب أعمدة داخلية عبر REST المباشر

**الموقع:** `GRANT SELECT ON public.orphans TO anon;` و`GRANT SELECT ON public.care_organizations TO anon;`

المنح على مستوى **الجدول لا الأعمدة**. دوال الخادم تختار بعناية قائمة `PUBLIC_COLUMNS` في `src/lib/orphans.functions.ts:24`، لكن هذا التقييد **تجميلي**: أي زائر يستدعي REST مباشرةً بالمفتاح المنشور:

```
GET /rest/v1/orphans?select=*&status=eq.approved
```

فيحصل على `guardian_id`, `created_by`, `external_ref`, `external_source`, `rejection_reason` — ومن `care_organizations` على `owner_id`, `contact_phone`, `license_number`.

**الأثر:** كشف معرّفات مستخدمين داخلية (يربط اليتيم بولي أمره)، ومراجع الأنظمة الخارجية، وأسباب رفض ملفات — وكلها بيانات حسّاسة في سياق حماية الطفل. أرقام تواصل الجهات مكشوفة للسحب الآلي.

**الإصلاح:** استبدال المنح الشامل بمنح على مستوى الأعمدة، أو — الأنظف — إنشاء `VIEW` عاماً (`public_orphans`) بأعمدة العرض فقط وسحب `SELECT` عن الجدول الأساسي من `anon`:

```sql
REVOKE SELECT ON public.orphans FROM anon;
GRANT SELECT (id, code, display_name, gender, birth_date, city, region, story,
              photo_url, education_stage, monthly_need, funded_monthly, currency,
              status, org_id, created_at) ON public.orphans TO anon;

REVOKE SELECT ON public.care_organizations FROM anon;
GRANT SELECT (id, name, city, region, about, logo_url, status) ON public.care_organizations TO anon;
```

> نفس المعالجة مطلوبة لدالة `suggest_orphans_for_sponsor` — فهي `RETURNS SETOF public.orphans` وممنوحة لـ`anon`، أي تُعيد كل الأعمدة الداخلية. يجب تغيير نوع الإرجاع إلى `TABLE(...)` بالأعمدة العامة فقط.

---

### 🟠 H3 — حقن فلاتر PostgREST في البحث

**الموقع:** `src/lib/orphans.functions.ts:54`

```ts
if (data.search) query = query.or(`display_name.ilike.%${data.search}%,city.ilike.%${data.search}%`);
```

قيمة البحث تُدرج نصياً في تعبير `or` بلا هروب. مدخل يحتوي `,` أو `(` أو `)` أو `.` يغيّر بنية الفلتر. الأثر محدود لأن `.in("status", ...)` وسياسات RLS تُطبَّق بـ`AND`، لكنه يفتح باب أخطاء 400 مكشوفة، واستنزاف موارد، وتغيير سلوك الاستعلام.

**الإصلاح:** تعقيم القيمة (`replace(/[,().*\\%]/g, "")`)، أو الانتقال إلى دالة RPC بحث مبنية على `tsvector` مع فهرس GIN — وهو المطلوب أداءً على أي حال (البحث الحالي `ilike '%x%'` يُجري مسحاً تسلسلياً كاملاً).

---

### 🟠 H4 — حقن أحداث في الخط الزمني لأي يتيم

**الموقع:** `CREATE POLICY "timeline_insert" ... WITH CHECK (actor_id = auth.uid());`

الشرط الوحيد أن يكون الفاعل هو المستخدم نفسه — **بلا أي علاقة بـ`orphan_id`**. أي مستخدم يُدرج أحداثاً على الخط الزمني لأي يتيم بنص `detail` اختياري. القراءة محمية، لكن الكفلاء وجهات الرعاية والإدارة يقرؤون هذه الأحداث كسجلّ موثوق.

**الإصلاح:** إضافة `AND (public.can_manage_orphan(orphan_id) OR public.sponsors_orphan(orphan_id) OR public.is_admin())` — أو الأفضل: سحب `INSERT` من `authenticated` تماماً وكتابة الأحداث من الخادم فقط.

---

### 🟠 H5 — ملف `.env` متتبَّع في Git بلا حماية مستقبلية

`.env` مُلتزَم في المستودع، و`.gitignore` **لا يتضمّن `.env`**. المحتوى الحالي مفاتيح منشورة (publishable) — غير خطير بذاته. الخطر أن أول مطوّر يضيف `SUPABASE_SERVICE_ROLE_KEY` أو مفتاح بوابة الدفع في نفس الملف سيدفعه إلى GitHub تلقائياً.

**الإصلاح:** إضافة `.env` و`.env.*` و`!.env.example` إلى `.gitignore`، وإنشاء `.env.example` بالمفاتيح بلا قيم، وتوثيق أن الأسرار تُحقن عبر Lovable Cloud / متغيّرات البيئة لا عبر الملف.

---

### 🟡 ثغرات ومخاطر متوسطة

| # | الموضوع | الموقع | الأثر | الإصلاح |
|---|---|---|---|---|
| M1 | **لا رؤوس أمنية** | `.output/public/_headers` يحتوي `cache-control` فقط | لا `CSP` ولا `X-Frame-Options` ولا `HSTS` ولا `Referrer-Policy` — الموقع قابل للتأطير (clickjacking) | إضافة رؤوس عبر `public/_headers` أو middleware في `src/start.ts` |
| M2 | **`/org` بلا حارس دور** | `src/routes/_authenticated/org.tsx` | أي مستخدم مسجَّل يصل لشاشة تسجيل جهة رعاية | حارس `beforeLoad` يفحص `care_org` + فحص خادمي في `registerOrganization` |
| M3 | **فقدان صامت للبيانات السرّية** | `src/lib/org.functions.ts` — إدراج `orphan_private` بلا فحص `error` | فشل الإدراج لا يُبلَّغ؛ الاسم الكامل وجوال ولي الأمر يضيعان بصمت | فحص `error` وإرجاع فشل + تغليف العمليتين في RPC معاملاتية |
| M4 | **رمز الملف عرضة للتصادم** | `src/lib/org.functions.ts` — `KFL-${Math.random()...}` | قيد `UNIQUE` يرمي خطأً خاماً للمستخدم بلا إعادة محاولة | تسلسل Postgres أو إعادة محاولة عند التعارض |
| M5 | **لا سقف على المبلغ ولا منع تكرار** | `createSponsorship` | كافل واحد ينشئ كفالات متعددة لنفس اليتيم؛ ولا سقف عند الاحتياج المتبقّي | قيد `UNIQUE(sponsor_id, orphan_id) WHERE status IN ('active','pending_payment')` + تحقّق من المتبقّي |
| M6 | **لا تحديد معدّل (rate limiting)** | كل دوال الخادم | إساءة استخدام واستنزاف، خصوصاً `/auth` والبحث | تحديد معدّل على مستوى `requestMiddleware` |
| M7 | **لا سجلّ تدقيق فعلي** | `audit_log` بلا كاتب | قرارات الإدارة (اعتماد/رفض ملف يتيم) بلا أثر — مشكلة حوكمة وامتثال | كتابة قيد تدقيق في `reviewOrphan` / `reviewOrganization` |
| M8 | **فهارس ناقصة** | `sponsorship_payments.sponsor_id`, `disbursements.*`, `progress_reports.org_id` | مسح تسلسلي مع النمو | إضافة فهارس على المفاتيح الأجنبية |
| M9 | **لا قيد على مجموع الاحتياجات** | `orphan_needs` مقابل `orphans.monthly_need` | تناقض معروض للكافل بين تفاصيل الاحتياج والمبلغ الإجمالي | مُشغِّل يُعيد احتساب `monthly_need` من البنود |

---

## 4. الفجوات الوظيفية

| القدرة | في التصوّر | الحالة الفعلية | الأثر |
|---|---|---|---|
| **بوابة الدفع** | مطلوبة (المرحلة 4) | ❌ غير موجودة. `createSponsorship` تنشئ عقداً بحالة `pending_payment` وقيد دفعة `pending` — **ولا شيء يحرّكهما بعدها** | **المنتج معطّل جوهرياً**: لا يمكن إتمام كفالة واحدة |
| **الاشتراك الشهري والتجديد** | مطلوب | ❌ `next_charge_at` و`provider_subscription_id` أعمدة فارغة أبداً. `cron-auth.ts` جاهز — **ولا مسار cron واحد** | لا تحصيل متكرّر |
| **خزنة المستندات** | مطلوبة | ❌ **لا bucket تخزين، لا هجرة، لا سياسات، لا رفع**. `orphan_documents.storage_path` يشير إلى لا شيء. كذلك `photo_url`, `logo_url`, `receipt_url`, `proof_url` | **لا توثيق فعلي** لأي ملف يتيم — تنهار دعوى «ملف موثّق» |
| **نموذج ملف اليتيم من 7 خطوات** | مطلوب | ⚠️ نموذج مسطّح بـ11 حقلاً؛ لا وضع أسري، لا صحة، لا بنود احتياج، لا إقرار | جودة بيانات ضعيفة، لا حساب مقترح للمبلغ |
| **محرّك المطابقة** | `suggest_orphans_for_sponsor` | ⚠️ الدالة موجودة في القاعدة وممنوحة — **ولا تُستدعى من أي مكان**. `profiles.monthly_budget` و`preferred_region` لا يُكتبان أصلاً (لا صفحة بروفايل) | ميزة مدفوعة الثمن ومعطّلة |
| **التقارير الدورية** | مطلوبة | ❌ الجدول موجود، **لا شاشة رفع ولا شاشة مراجعة ولا شاشة عرض للكافل** | لا حلقة أثر — الكافل يدفع ولا يرى شيئاً |
| **الإشعارات والبريد** | مطلوبان | ❌ `notifications` بلا كاتب؛ لا بريد معاملاتي إطلاقاً | صمت تام تجاه المستخدم بعد كل حدث |
| **الخط الزمني** | مطلوب | ❌ الجدول موجود، لا كتابة ولا عرض | |
| **الصرف والمالية** | مطلوبة | ❌ `disbursements` بلا واجهة؛ لا سجلّ مالي (محصّل/مصروف/رصيد) | لا يمكن تشغيل المنصة مالياً |
| **تكامل API + Webhooks** | المرحلة 6 | ❌ `api_clients` و`api_import_jobs` بلا مسار واحد؛ لا HMAC، لا استيراد، لا تصدير | التكامل مع منصات البروفايلات الخارجية — وهو طلب صريح في التصوّر — غير مبدوء |
| **لوحة ولي الأمر** | مطلوبة | ❌ الدور `guardian` معرّف في `enum` و`orphans.guardian_id` موجود — **لا شاشة ولا مسار** | ثلث الأدوار غير مخدوم |
| **الرسائل** | مطلوبة | ❌ جدول `messages` غير موجود | لا قناة تواصل |
| **صفحات قانونية** | الخصوصية، الشروط، الأسئلة | ❌ غير موجودة — رغم أن `/auth` تقول «توافق على سياسة الخصوصية» | **مخالفة امتثال مباشرة** |
| **`sitemap.xml`** | مطلوب | ❌ غير موجود (`robots.txt` موجود ويسمح بالكل) | فقد أرشفة ملفات الأيتام |

---

## 5. الجودة التقنية وقابلية الصيانة

**الاختبارات والتكامل المستمر — الفجوة الأكبر بعد الأمن:**
لا يوجد **ملف اختبار واحد** ولا **مجلد `.github`**. منصة تتعامل بأموال وبيانات أطفال بلا شبكة أمان آلية واحدة. سياسات RLS تحديداً **لا يمكن مراجعتها بصرياً بثقة** — الثغرات الخمس الحرجة أعلاه دليل على ذلك — فهي تتطلّب اختبارات تكامل تنتحل شخصية كل دور وتؤكّد الرفض.

**التنسيق:** 893 خطأ `prettier` — أي أن `npm run lint` لا يمكن استخدامه كبوابة جودة اليوم. يُصلَح بأمر واحد (`npm run format`) ثم يُثبَّت في CI.

**ملاحظات كود:**
- `src/routes/_authenticated/admin.tsx` — أربعة مواضع تستخدم الشرط الثلاثي كعبارة (`res.ok ? toast.success(...) : toast.error(res.error!)`)؛ و`res.error!` يعرض `undefined` عند غياب الرسالة.
- `useAuth` يستدعي `supabase.auth.getUser()` (طلب شبكة) في كل مكوّن يستخدمه — يتكرّر في `SiteHeader` و`DashboardShell` وصفحة اليتيم في نفس الصفحة. يجب رفعه إلى سياق (context) أو `useQuery` مشترك.
- **إمكانية الوصول:** زر القائمة في `SiteHeader` بلا `aria-expanded`/`aria-controls`؛ أشرطة `Progress` بلا `aria-label`؛ عنصر `select` الخام في `/org` بلا تنسيق موحّد مع بقية الحقول.

**نقاط إيجابية تستحق التثبيت:** RTL أصيل من الجذر، بيانات `head` و`og` على كل مسار، `robots: noindex` على الشاشات الخاصة (`/auth`, `/dashboard`, `/org`, `/admin`) — صحيح ومتعمَّد، ومعالجة أخطاء SSR متقدّمة في `src/server.ts` تلتقط أخطاء h3 المبتلعة.

---

## 6. خارطة الطريق التنفيذية

> **مبدأ الترتيب:** الأمن أولاً (مانع)، ثم إكمال حلقة القيمة (توثيق → دفع → أثر)، ثم التوسّع (تكامل)، ثم التقوية والإطلاق. المدد تقديرية لفريق من مطوّر إلى مطوّرَين.

### المرحلة 0 — إغلاق الثغرات الحرجة 🔴 **مانعة**
**المدة:** 3–5 أيام · **الشرط:** لا يُدمج أي كود ميزات قبل اكتمالها.

| # | المهمة | المخرَج |
|---|---|---|
| 0.1 | إصلاح `handle_new_user` — حصر الأدوار الذاتية في `sponsor`/`care_org` (C1) | هجرة SQL |
| 0.2 | حارس `sponsorships` — منع تفعيل ذاتي وتعديل المبلغ (C2) | هجرة + مُشغِّل |
| 0.3 | سحب `INSERT` عن `sponsorship_payments` من `authenticated` (C3) + حذف الإدراج اليدوي من `sponsorships.functions.ts` | هجرة + تعديل كود |
| 0.4 | حارس `care_organizations` — `status` للإدارة فقط + `UNIQUE(owner_id)` (C4) | هجرة |
| 0.5 | حصر إنشاء الأيتام في الجهات المعتمدة + حارس انتقالات الحالة (C5) — **مع اختبار تفاعل الحارس مع `recalc_orphan_funding`** | هجرة + مُشغِّل |
| 0.6 | فصل كتابة/اعتماد `progress_reports` (H1) | هجرة |
| 0.7 | منح `SELECT` على مستوى الأعمدة لـ`anon` + إعادة كتابة `suggest_orphans_for_sponsor` بأعمدة عامة (H2) | هجرة |
| 0.8 | تعقيم مدخل البحث (H3) وتقييد `timeline_events` (H4) | تعديل كود + هجرة |
| 0.9 | `.gitignore` للأسرار + `.env.example` + توثيق حقن الأسرار (H5) | ملفات |
| 0.10 | توثيق مسار إنشاء أول مدير عبر `service_role` | `docs/runbook.md` |

**معيار القبول (DoD):** مجموعة اختبارات RLS تنتحل كل دور وتُثبت أن كل سيناريو من C1–C5 و H1–H4 **مرفوض** — لا مراجعة بصرية.

---

### المرحلة 1 — شبكة الأمان: اختبارات وCI وبوابة جودة
**المدة:** 3–4 أيام · **تبدأ بالتوازي مع المرحلة 0** (اختبارات المرحلة 0 هي نواتها).

1. تثبيت Vitest + إعداد بيئة اختبار مقابل Supabase محلي.
2. **مجموعة اختبارات RLS** — لكل جدول ولكل دور (`anon`, `sponsor`, `care_org`, `guardian`, `admin`): ما يُسمح وما يُرفض.
3. اختبارات وحدة لدوال الخادم الاثنتي عشرة (المسارات السعيدة + الرفض).
4. `npm run format` مرة واحدة لتصفير الـ893 خطأ.
5. `.github/workflows/ci.yml`: `typecheck` + `lint` + `test` + `build` على كل PR.
6. اختبار E2E واحد للمسار الحرج: تسجيل → تصفّح → بدء كفالة.

**DoD:** CI أخضر إلزامي للدمج؛ `eslint` بصفر أخطاء.

---

### المرحلة 2 — إكمال ملف اليتيم والتوثيق الفعلي
**المدة:** أسبوعان

1. **خزنة التخزين:** هجرة تُنشئ bucket `orphan-documents` خاصاً + bucket `public-media` للصور، مع سياسات RLS للتخزين.
2. رفع الوثائق من `/org` + روابط موقّعة قصيرة العمر للقراءة (إدارة/جهة/ولي أمر فقط).
3. **نموذج 7 خطوات** (Stepper) بحفظ مسودة بين الخطوات: أساسي · وصاية وجهة · وضع أسري · تعليم · صحة · بنود الاحتياج · مستندات وإقرار.
4. بنود `orphan_needs` داخل النموذج + **حساب `monthly_need` تلقائياً من مجموع البنود** (يعالج M9).
5. رفع صورة اليتيم مع **قواعد خصوصية صريحة**: إخفاء الوجه أو استخدام رمز افتراضياً، وحقل `photo_consent` موثّق.
6. تحسين طابور الإدارة: فلاتر، مراجعة تفصيلية للمستندات، أسباب رفض مُهيكلة، **كتابة `audit_log` لكل قرار** (يعالج M7).
7. إصلاح M3 (فحص خطأ `orphan_private`) وM4 (رمز الملف).

**DoD:** ملف يتيم كامل يُرفع بمستنداته، يمرّ بالمراجعة، ويُنشر — بأثر تدقيقي كامل.

---

### المرحلة 3 — الدفع والكفالة ⭐ **المرحلة المحورية**
**المدة:** أسبوعان–ثلاثة · **تحتاج قراراً من المالك قبل البدء (انظر §8)**

1. اختيار المزوّد وتهيئة الأسرار عبر متغيّرات البيئة (لا في `.env` المتتبَّع).
2. `POST /api/payments/checkout` — إنشاء جلسة دفع من الخادم؛ المبلغ يُحتسب على الخادم لا يُستقبَل من العميل.
3. `POST /api/payments/webhook` — **التحقّق من التوقيع إلزامي**؛ يكتب `sponsorship_payments` عبر `service_role` وينقل الكفالة إلى `active` (يغلق C2/C3 وظيفياً).
4. الاشتراك الشهري: `provider_subscription_id`, `next_charge_at`، ومسار cron محمي بـ`authenticateCronRequest` (الوحدة جاهزة وغير مستخدمة).
5. إيقاف/استئناف/إلغاء من لوحة الكافل ← مزامنة مع المزوّد.
6. الإيصالات: تخزين + تنزيل من `/dashboard`.
7. منع التكرار وسقف الاحتياج المتبقّي (M5).
8. **شاشة مالية للإدارة:** المحصّل، المصروف، الرصيد لكل يتيم وجهة + واجهة `disbursements` مع إثباتات.

**DoD:** كفالة حقيقية تُنشأ وتُدفع وتتجدّد وتُلغى، وتنعكس على `funded_monthly` بأثر تدقيقي كامل.

**مخاطرة:** التوافق الشرعي/التنظيمي للتحصيل المتكرّر للتبرّعات — يُحسم قبل التنفيذ.

---

### المرحلة 4 — حلقة الأثر: التقارير والإشعارات
**المدة:** أسبوعان

1. رفع التقرير الدوري من الجهة (تعليم/صحة/معيشة + مرفقات) بحالة `submitted`.
2. شاشة مراجعة للإدارة (اعتماد/رفض + `review_note`).
3. عرض التقارير للكافل في `/dashboard` — **المنتج الذي يبرّر استمرار الكفالة**.
4. كتابة `timeline_events` من الخادم عند كل حدث جوهري + عرض الخط الزمني.
5. توليد `notifications` + مركز إشعارات في الواجهة.
6. **بريد معاملاتي** بقوالب عربية RTL: ترحيب، اعتماد ملف، بدء كفالة، دفعة ناجحة/فاشلة، تقرير جديد.
7. **لوحة ولي الأمر** (`/guardian`) — الدور المعرّف وغير المخدوم.

**DoD:** كافل يتلقّى بريداً وإشعاراً عند كل حدث، ويرى تقرير أثر معتمداً خلال دورة كاملة.

---

### المرحلة 5 — المطابقة وتجربة الكافل
**المدة:** أسبوع

1. **صفحة بروفايل الكافل** — تكتب `monthly_budget` و`preferred_region` (الحقلان معطّلان اليوم).
2. تفعيل `suggest_orphans_for_sponsor` في الواجهة: قسم «مرشَّحون لك» في `/dashboard` والرئيسية.
3. توسيع الترشيح: الفئة العمرية، نوع الاحتياج، استبعاد المكفولين بالكامل، الترتيب بفجوة التمويل وأقدمية الانتظار.
4. بحث `tsvector` + فهرس GIN بديلاً عن `ilike` (يغلق H3 جذرياً ويعالج الأداء).
5. فهارس المفاتيح الأجنبية الناقصة (M8).
6. رفع `useAuth` إلى سياق مشترك لإلغاء الطلبات المتكرّرة.

---

### المرحلة 6 — تكامل API والمنصات الخارجية
**المدة:** أسبوعان

1. `POST /api/public/integrations/orphans/import` — توقيع HMAC + مفتاح عميل + تحقّق `zod` + `upsert` عبر `external_ref`، **مع بقاء الملفات في `under_review` إلزامياً**.
2. `GET /api/public/integrations/orphans` (حقول عامة فقط) و`GET .../sponsorships/:ref`.
3. Webhooks صادرة موقّعة: اعتماد ملف، بدء كفالة، دفعة ناجحة، تقرير جديد — مع إعادة محاولة.
4. جدول `external_profile_map` الوارد في التصوّر.
5. شاشة إدارة: مفاتيح العملاء (توليد/إبطال)، سجلّ `api_import_jobs` وأخطاؤه.
6. توثيق OpenAPI للشركاء.

---

### المرحلة 7 — التقوية والامتثال والإطلاق
**المدة:** أسبوع–أسبوعان

1. **تحديد المعدّل** على `/auth` والبحث والتكاملات (M6).
2. **رؤوس أمنية:** `CSP`, `X-Frame-Options: DENY`, `HSTS`, `Referrer-Policy`, `Permissions-Policy` (M1).
3. حارس دور على `/org` (M2) ومراجعة حرّاس كل المسارات.
4. `sitemap.xml` ديناميكي + بيانات `JSON-LD` منظّمة لصفحات الأيتام.
5. **الصفحات القانونية:** الخصوصية، الشروط، الأسئلة الشائعة — مربوطة من `/auth` والتذييل.
6. **مراجعة امتثال حماية بيانات الطفل**: أساس معالجة البيانات، الاحتفاظ والحذف، إقرار ولي الأمر بالنشر، إخفاء الهوية في الملف العام، موقع تخزين البيانات.
7. إمكانية الوصول: تدقيق WCAG AA، `aria` الناقصة، تباين الألوان، التنقّل بلوحة المفاتيح.
8. المراقبة: تتبّع الأخطاء، تنبيهات فشل الدفعات، لوحة صحة النظام.
9. E2E شامل لكل الأدوار + اختبار حِمل على الدليل.

---

### 6.1 الجدول الزمني والتبعيات

```text
أسبوع 1     ├─ [م0] الثغرات الحرجة  ══════════  (مانعة)
            └─ [م1] الاختبارات وCI  ══════════  (بالتوازي)
أسبوع 2-3   └─ [م2] ملف اليتيم + التخزين  ══════════
أسبوع 4-6   └─ [م3] الدفع والكفالة  ══════════════════  ⭐
أسبوع 7-8   └─ [م4] التقارير والإشعارات  ══════════
أسبوع 9     └─ [م5] المطابقة وتجربة الكافل  ═════
أسبوع 10-11 └─ [م6] تكامل API  ══════════
أسبوع 12-13 └─ [م7] التقوية والامتثال والإطلاق  ══════════
```

**التبعيات الصلبة:** م0 تسبق كل شيء · م2 (التخزين) تسبق م3 (لا دفع على ملف غير موثّق) · م3 تسبق م4 (لا تقرير أثر بلا كفالة نشطة) · م7 تسبق الإطلاق العام.

**أقصر طريق لأول كفالة حقيقية:** م0 + م2 + م3 ≈ **6 أسابيع**.

---

## 7. مصفوفة الأولويات

| الأثر ↓ / الجهد ← | منخفض | متوسط | عالٍ |
|---|---|---|---|
| **حرج** | C1, C3, H5, M1 | C2, C4, C5, H1, H2 | **م3 الدفع** |
| **عالٍ** | H3, H4, M2, M7 | م1 الاختبارات، الصفحات القانونية | م2 التخزين والنموذج، م4 التقارير |
| **متوسط** | M4, M8, sitemap | م5 المطابقة، البريد | م6 تكامل API |
| **منخفض** | تصفير prettier | إمكانية الوصول | لوحة ولي الأمر |

**ابدأ من الخانة العليا اليسرى ثم الوسطى** — سبع ثغرات من التسع الحرجة تُغلق بهجرات SQL قصيرة خلال أيام.

---

## 8. قرارات معلّقة تحتاج تأكيد المالك

هذه أسئلة تُغيّر التنفيذ جوهرياً، ومنها ما هو مطروح أصلاً في وثيقة التصوّر:

1. **مزوّد الدفع** — التصوّر يذكر Careem كافتراض. القرار يحدّد شكل الاشتراك المتكرّر والـwebhooks بالكامل. **مانع للمرحلة 3.**
2. **العملة** — الكود يفترض `USD` (قيمة افتراضية في `orphans` و`sponsorships`)، بينما البيانات التجريبية سعودية. هل نثبّت `SAR`؟ هل ندعم تعدّد العملات؟
3. **رسوم التشغيل** — التصوّر يقول «بلا، مع قابلية التعديل لاحقاً». يحتاج حقلاً في الإعدادات منذ المرحلة 3 لا لاحقاً.
4. **التحصيل المتكرّر للتبرّعات** — هل هو مسموح تنظيمياً وشرعياً في الولاية القضائية المستهدفة؟
5. **الاسم والهوية** — التصوّر يطرح «كهاتين» مقابل اسم مقترح. الكود يستخدم «كافل» في كل مكان. **يجب الحسم قبل أي عمل على الهوية البصرية.**
6. **صور الأيتام** — هل تُنشر صور حقيقية؟ توصيتي المهنية: **لا** افتراضياً — رمز أو صورة مموّهة، مع إتاحة الصورة الحقيقية للكافل بعد تفعيل الكفالة وبإقرار موثّق من ولي الأمر.
7. **موقع تخزين البيانات والاحتفاظ** — بيانات أطفال حسّاسة؛ يحدّد إعدادات Supabase وسياسة الاحتفاظ.
8. **توثيق جهات الرعاية** — هل يُتحقّق من رقم الترخيص آلياً مقابل جهة تنظيمية، أم يدوياً بمستند؟

---

## 9. الخلاصة

الأساس المعماري **صحيح ويستحق البناء عليه** — لا مبرّر لإعادة البدء. لكن ثلاث حقائق تحكم الخطوة التالية:

1. **خمس ثغرات حرجة في RLS** تجعل النظام قابلاً للاختراق الكامل بحساب مجاني. هذه ليست ديناً تقنياً يُؤجَّل — هي خط الصفر.
2. **حلقة القيمة مقطوعة عند الدفع.** كل ما بعد «ابدأ الكفالة» غير موجود: لا تحصيل، لا إيصال، لا صرف، لا تقرير أثر. المستخدم اليوم يضغط الزر ولا يحدث شيء.
3. **لا شبكة أمان آلية.** صفر اختبارات وصفر CI في نظام مالي يتعامل مع بيانات أطفال. الثغرات الخمس أعلاه هي بالضبط ما تكتشفه اختبارات RLS في دقائق.

**التوصية:** ابدأ بالمرحلتين 0 و1 هذا الأسبوع (أيام لا أسابيع)، ثم امضِ في المسار 2 ← 3 ← 4 للوصول إلى أول كفالة حقيقية موثّقة ومدفوعة ومتابَعة خلال ~10 أسابيع.
