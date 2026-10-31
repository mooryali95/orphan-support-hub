# الجوال — يُحَسّ تطبيقاً

- hover عالق: `@media (hover:hover)` لكل تأثير تمرير.
- وميض النقر: `-webkit-tap-highlight-color: transparent` مع حالة `:active` بديلة.
- `100vh` ← `100dvh`.
- تكبير الحقل في iOS: خطّ الإدخال ≥16px.
- تأخّر النقر: `touch-action: manipulation`.
- السحب للتحديث غير المرغوب: `overscroll-behavior: contain` على اللوحات.
- الحوافّ الآمنة: `viewport-fit=cover` و`env(safe-area-inset-*)` (منطقياً في RTL).
- تحديد النصّ بالضغط المطوّل: `user-select: none` على الأزرار فقط لا على المحتوى.
- الدوّارات: `scroll-snap-type: x mandatory` واتجاهها يتبع `dir`.
- لون شريط الحالة: `<meta name="theme-color">` للفاتح والداكن.
- الأزرار الأساسية في متناول الإبهام (أسفل الشاشة).
