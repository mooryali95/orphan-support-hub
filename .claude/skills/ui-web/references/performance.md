# الأداء
- لا `transition: all` / `transition-all`. سمِّ: `transition-[transform,opacity]`.
- حرّك `transform` و`opacity` فقط؛ لا `width/height/top/left`.
- `will-change` عند تقطّع أول إطار فقط، وأزله بعدها.
- الصور: `width/height` صريحة أو `aspect-ratio` (منع القفز)، `loading="lazy"` تحت الطيّة.
- القوائم الطويلة (>200): ترقيم أو افتراضية.
- الخطوط: `font-display: swap` وتحميل مسبق لخطّ العناوين فقط.

## الحركة تحت الحِمل
- حركات CSS/WAAPI تعمل خارج الخيط الرئيسي وتبقى سلسة أثناء تحميل الصفحة؛ حركات JS بـ `requestAnimationFrame` تُسقط إطارات.
  استعمل CSS للحركات المحدّدة سلفاً، وJS للديناميكية القابلة للقطع فقط.
- في Motion: الخصائص المختصرة (`x`, `y`, `scale`) تُحسب على الخيط الرئيسي؛ سلسلة `transform` الكاملة قد تُسرَّع.
  السلوك يتغيّر بين الإصدارات — **قِسه في لوحة Performance** قبل أن تبني عليه.
- `blur()` الكبير و`backdrop-filter` مكلفان (خاصة Safari والجوال الضعيف) — اختبر على جهاز متوسط.
