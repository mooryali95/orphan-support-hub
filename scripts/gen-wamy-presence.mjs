#!/usr/bin/env node
// يولّد src/data/wamy-presence.ts من src/data/wamy-network.ts: الرمز والاسم والحضور وحدها.
// صفحات الرؤية تحتاج الحضور لا مؤشّرات الحاجة ومصادرها، فلا تحمل ملفّ البحث كلّه
// (ميزانية الحجم في CI). wamy-presence.test.ts يفشل إن اختلف الملفّان.
//
//   npx tsx scripts/gen-wamy-presence.mjs
import { writeFileSync } from "node:fs";

const { WAMY_COUNTRIES } = await import("../src/data/wamy-network.ts");
const rows = WAMY_COUNTRIES.map((c) => ({ code: c.code, nameAr: c.nameAr, presence: c.presence }));
writeFileSync(
  "src/data/wamy-presence.ts",
  `// مولَّد بـ scripts/gen-wamy-presence.mjs من src/data/wamy-network.ts — لا يُعدَّل يدوياً.
import type { Presence } from "@/data/wamy-network";

export type PresenceCountry = { code: string; nameAr: string; presence: Presence };

export const WAMY_PRESENCE: PresenceCountry[] = ${JSON.stringify(rows, null, 2)};
`,
);
console.log(`wamy-presence: ${rows.length} دولة`);
