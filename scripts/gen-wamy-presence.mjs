#!/usr/bin/env node
// لم يعد يولّد شيئاً: الحضور مصدره الوحيد src/data/wamy-presence.ts ويُعدَّل يدوياً،
// وsrc/data/wamy-network.ts يبني منه WAMY_COUNTRIES ويضيف الحاجة والسياق (WAMY_NEED).
// يبقى الأمر للتحقّق بعد التعديل (والقاعدة نفسها في wamy-presence.test.ts):
// رموزٌ فريدة، وكلّ رمزٍ في WAMY_NEED له دولةٌ في الحضور.
//
//   npx tsx scripts/gen-wamy-presence.mjs
const { WAMY_PRESENCE } = await import("../src/data/wamy-presence.ts");
const { WAMY_NEED } = await import("../src/data/wamy-network.ts");

const codes = WAMY_PRESENCE.map((c) => c.code);
const dup = codes.filter((c, i) => codes.indexOf(c) !== i);
const stray = Object.keys(WAMY_NEED).filter((c) => !codes.includes(c));
if (dup.length || stray.length) {
  if (dup.length) console.error(`رموزٌ مكرّرة في wamy-presence.ts: ${dup.join(", ")}`);
  if (stray.length) console.error(`WAMY_NEED لدولٍ ليست في الحضور: ${stray.join(", ")}`);
  process.exit(1);
}
console.log(`wamy-presence: ${codes.length} دولة، منها ${Object.keys(WAMY_NEED).length} بمؤشّرات`);
