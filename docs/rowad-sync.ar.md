# عقد المزامنة: الرواد ← كهاتين

اتجاهٌ واحد: **الرواد تكتب، وكهاتين تقرأ**. كل تحديثٍ في الرواد يصل كهاتين بدفعة، ولا يكتب كهاتين في الرواد شيئاً.

## المصادقة

مفتاح يُصدره مدير كهاتين من «الإدارة ← المنصّة ← التكامل» بنطاق **«مزامنة منصّة التشغيل»** (`mirror:write`)، مرتبطٌ بمنصّة `rowad-albania`. السرّ يُعرض مرّةً واحدة.

```
POST https://<نطاق كهاتين>/api/integrations/mirror
X-Api-Key: ck_live_…
X-Api-Secret: sk_live_…
X-Api-Timestamp: <الوقت الآن بالثواني>      ← نافذة ٥ دقائق
Content-Type: application/json
```

## الدفعة

```json
{ "entity": "students",
  "records": [ … حتى 500 … ],
  "deleted": ["external_ref", …],
  "cursor": { "at": "2026-11-01T08:00:00Z", "ref": "آخر معرّف في الدفعة" } }
```

الدفعة المكرّرة آمنة: كل سجلٍّ يُحدَّث بمفتاحه `(source, external_ref)` ولا يتكرّر.

## الربط بجداول الرواد

| `entity`           | من جدول الرواد                              | الحقول                                                                                                                                                         |
| ------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `groups`           | `classes` (+ `teachers`، `schools`)         | `external_ref`=classes.id، `name`، `region`، `institution_ref`=school_id، `institution_name`، `supervisor_ref`=teacher_id، `supervisor_name`، `updated_at`     |
| `students`         | `students` (+ `profiles`)                   | `external_ref`=students.id، `display_name` (**اسمٌ مستعار لا الاسم الحقيقي**)، `gender`، `age`، `group_ref`=class_id، `region`، `education_stage`              |
| `trait_dimensions` | تعداد `Maqsad`                              | `key` (DEEN، AQL…)، `label_ar`، `label_local`، `sort_order`                                                                                                    |
| `traits`           | `stage_traits` + `trait_elements`           | `external_ref`=stage_traits.id، `dimension_key`=maqsad، `name_ar`، `name_local`، `definition_ar`، `definition_local`، `stage_label`، `elements` (نصوص العناصر) |
| `trait_scores`     | `trait_evaluations` (+ `trait_assessments`) | `external_ref`=evaluation.id، `student_ref`، `trait_ref`، `score`، `scale_max`، `observed_at`، `note`                                                          |

الترتيب في كل جولة: `groups` ← `students` ← `trait_dimensions` ← `traits` ← `trait_scores` (كلٌّ يحتاج ما قبله).

## ما يحدث في كهاتين

- **الطالب الجديد يقف «قيد المراجعة»** ولا يظهر في الدليل حتى تعتمده الإدارة — مهما أرسلت الدفعة. مفتاحٌ مسرَّب لا ينشر طفلاً.
- **العمر** يُحوَّل لفئةٍ عمرية؛ لا يُعرض تاريخ ميلاد.
- **المحذوف** في `deleted` علامةٌ هنا (`external_deleted_at`) لا مسح، ويظهر للإدارة في «حُذفوا هناك» — فكافلٌ قائم لا يفقد أثره.
- **ملاحظة المشرف** في الدرجات لا تصل الداعمين أبداً.

## المطابقة الدورية (مرّة يومياً)

```json
{ "entity": "students", "reconcile": ["id1", "id2", …] }
```

تُرسَل كل المعرّفات الحيّة؛ فيُكتب للإدارة ما ينقص هنا وما زاد، في «حالة المزامنة».

## ما يلزم في الرواد (مرّة واحدة)

جداول `students` و`profiles` و`classes` بلا `updated_at`، فلا يُعرف ما تغيّر. يُضاف العمود بمشغّل:

```sql
ALTER TABLE students ADD COLUMN IF NOT EXISTS updated_at timestamp(3) NOT NULL DEFAULT now();
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TRIGGER trg_students_touch BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
-- ومثله لـ classes و profiles
```

ثم يُرسل المُرسِل كل ما `updated_at > cursor.at` مرتّباً بـ `(updated_at, id)`، ويحفظ آخر قيمة مؤشّراً للجولة التالية. والحذف يُلتقط بجدول صادرٍ (`deleted_rows`) أو بالمطابقة اليومية.
