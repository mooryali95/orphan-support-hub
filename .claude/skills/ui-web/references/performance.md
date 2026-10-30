# الأداء
- لا `transition: all` / `transition-all`. سمِّ: `transition-[transform,opacity]`.
- حرّك `transform` و`opacity` فقط؛ لا `width/height/top/left`.
- `will-change` عند تقطّع أول إطار فقط، وأزله بعدها.
- الصور: `width/height` صريحة أو `aspect-ratio` (منع القفز)، `loading="lazy"` تحت الطيّة.
- القوائم الطويلة (>200): ترقيم أو افتراضية.
- الخطوط: `font-display: swap` وتحميل مسبق لخطّ العناوين فقط.
