# NOTICE

ui-web مبنيّة على ثلاث مهارات مفتوحة برخصة MIT، مع تكييف وإضافة طبقة عربية/RTL وبيانات اختبار محلية:

- **emilkowalski/skills** (يشمل emil-design-eng) — Copyright (c) Emil Kowalski. MIT License.
- **jakubkrehel/make-interfaces-feel-better** — Copyright (c) Jakub Krehel. MIT License.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files, to deal in the Software without restriction, subject to including the above copyright
notice and this permission notice in all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

## ما ضُبط عند الدمج
- حُذفت «الرسالة الافتتاحية» الثابتة: المهارة تعمل مباشرة.
- تعارض «كل حركة < 300ms» مع «النوافذ 200–500ms» حُسم بجدولٍ واحد واستثناءٍ صريح.
- مثال «الخروج أسرع من الدخول (دخول 2s)» كان خلطاً بالضغط المطوّل؛ فُصل المفهومان.
- `transform-origin` بمتغيّر Base UI استُبدل بمتغيّرات Radix المستعملة في المشروع.
- ادّعاء تسريع Motion صار «قِسه»؛ يتغيّر بين الإصدارات.
- السرعة بـ `performance.now()` لا `new Date()`.
- التتابع بمتغيّر وسقفٍ للتأخير بدل `nth-child` مكرّر.
- تقليل الحركة: يضمن ظهور الحالة النهائية.
- ثغرات إتاحة سُدّت: نسخة التبويب الزخرفية `aria-hidden`/`inert`، بديل لوحة مفاتيح للضغط المطوّل والسحب، لا وميض.
- أُضيف: RTL للحركة (translateX/inset فيزيائيان)، `@starting-style` مع `allow-discrete`، View Transitions،
  حالات المكوّن الستّ، ومنع الحذف الخطِر بضغطٍ مطوّل وحده.
