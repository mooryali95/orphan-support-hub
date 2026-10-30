# الأسطح

## الزوايا المتّحدة المركز
`radius_outer = radius_inner + padding`. بطاقة `p-2` داخلها عنصر `rounded-lg` (8px) ← البطاقة `rounded-2xl` (16px).

## المحاذاة البصرية
- زرّ بأيقونة: الحشو جهة الأيقونة أقلّ بـ 2px تقريباً.
- مثلّث التشغيل يُزاح نحو رأسه 1–2px.
- في RTL الحشو المعدَّل ينتقل مع الأيقونة (`ps-`/`pe-`).

## الظلّ بدل الحدّ (للارتفاع فقط)
```css
--shadow-border: 0 0 0 1px oklch(0 0 0/0.06), 0 1px 2px -1px oklch(0 0 0/0.06), 0 2px 4px 0 oklch(0 0 0/0.04);
--shadow-border-hover: 0 0 0 1px oklch(0 0 0/0.08), 0 1px 2px -1px oklch(0 0 0/0.08), 0 2px 4px 0 oklch(0 0 0/0.06);
.dark { --shadow-border: 0 0 0 1px oklch(1 0 0/0.08); --shadow-border-hover: 0 0 0 1px oklch(1 0 0/0.13); }
```
يبقى `border` للفواصل والجداول وحقول الإدخال وحلقة التركيز.

## إطار الصورة
```css
img { outline: 1px solid oklch(0 0 0/0.1); outline-offset: -1px; }
.dark img { outline-color: oklch(1 0 0/0.1); }
```

## مساحة النقر
≥44×44 جوال، ≥40×40 مكتب كثيف. وسّع بشبه عنصر دون تغيير الشكل:
```css
.hit { position: relative; } .hit::after { content:""; position:absolute; inset:-8px; }
```
لا تتداخل مساحتا عنصرين متجاورين.
