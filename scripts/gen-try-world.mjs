#!/usr/bin/env node
// يولّد `src/lib/try-world.data.ts`: منطقتان حقيقيتا الاسم لكل دولةٍ ترسمها الخريطة، من ملفّات
// الخريطة نفسها (`public/geo/admin1`)، ليكون لكل دولةٍ كتالوج تجربةٍ كامل. المعرّفات والأسماء
// هنا هي ما تقرؤه الخريطة، فتطابق أعداد التجربة مناطقها بلا جدولٍ ثانٍ. الأعداد والأسماء
// المستعارة تُشتقّ في `src/lib/try-world.ts` ببذرةٍ ثابتة؛ هذا الملف للأسماء الجغرافية وحدها.
//
//   node scripts/gen-try-world.mjs          # يكتب الملف
//   node scripts/gen-try-world.mjs --check  # يفشل إن اختلف الملف عمّا يولَّد
//
// الاختيار حتميّ: لدول الشبكة منطقتان مسمّاتان باليد وما يكثر قصده (العاصمة ومنطقةٌ معروفة)، ولغيرها منطقتان
// ببذرة رمز الدولة من المناطق النظيفة الاسم. تُستثنى الأقاليم غير المأهولة
// وما ليس له في ملفّ الخريطة منطقتان مسمّاتان.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "src/lib/try-world.data.ts");
const geo = (f) => JSON.parse(readFileSync(join(root, "public/geo", f), "utf8"));

/** الدول الست المكتوبة باليد في `try-places.ts`: لا تُولَّد */
const FEATURED = new Set(["AL", "SN", "EG", "KE", "BA", "ID"]);
/** أقاليم بلا سكّانٍ دائمين: لا كتالوج أطفالٍ لها */
const UNINHABITED = new Set(["AQ", "BV", "GS", "HM", "IO", "TF", "UM"]);

/** دول الشبكة: منطقتان بالاسم اللاتيني كما في ملفّ الخريطة (`اسم=عربي` يصحّح الاسم العربي) */
const PICKS = {
  SA: ["Riyadh", "Makkah"],
  TD: ["N'Djamena=أنجمينا", "Chari-Baguirmi"],
  NE: ["Niamey", "Maradi"],
  SD: ["Khartoum", "Al Jazirah"],
  DJ: ["Djibouti", "Ali Sabieh"],
  GN: ["Conakry", "Kindia"],
  MR: ["Nouakchott", "Trarza"],
  NG: ["Kano State", "Lagos"],
  KG: ["Bishkek", "Osh"],
  TH: ["Bangkok", "Pattani"],
  CM: ["Far North", "Littoral"],
  ML: ["Bamako", "Ségou"],
  BD: ["Dhaka", "Sylhet"],
  BR: ["São Paulo", "Paraná"],
  PS: ["Gaza", "West Bank"],
  MK: ["Skopje", "Struga"],
  ET: ["Addis Ababa", "Oromia"],
  TZ: ["Dar es Salaam", "Dodoma"],
  RW: ["Kigali", "Western"],
  CI: ["Lagunes", "Savanes"],
  SO: ["Banaadir", "Bay"],
  YE: ["'Adan", "Ta'izz"],
  PH: ["Metro Manila", "Davao"],
  IQ: ["Baghdad", "Nineveh"],
  ZA: ["Gauteng", "Western Cape"],
  MY: ["Kuala Lumpur", "Selangor"],
  TJ: ["Dushanbe", "Khatlon"],
  UG: ["Kampala", "Gulu=غولو"],
  XK: ["Peja", "Gjakova"],
};
/** دولٌ أخرى يكثر أن يقصدها الزائر: العاصمة ومنطقةٌ معروفة، بالطريقة نفسها */
const MORE = {
  TR: ["Istanbul", "Ankara"],
  PK: ["Punjab", "Sindh"],
  IN: ["Delhi", "Kerala"],
  AF: ["Kabul", "Herat"],
  IR: ["Tehran", "Fars"],
  MA: ["Rabat-Salé-Zemmour-Zaër=الرباط سلا زمور زعير", "Grand Casablanca=الدار البيضاء الكبرى"],
  DZ: ["Algiers", "Oran"],
  TN: ["Tunis", "Sfax"],
  LY: ["Benghazi", "Misrata=مصراتة"],
  JO: ["Amman", "Irbid"],
  SY: ["Damascus", "Aleppo"],
  LB: ["Beirut", "North"],
  KW: ["Capital=العاصمة", "Hawally"],
  AE: ["Emirate of Abu Dhabi", "Emirate of Sharjah"],
  QA: ["Doha", "Al Rayyan"],
  BH: ["Capital", "Muharraq"],
  OM: ["Muscat", "Dhofar"],
  UZ: ["Samarqand", "Bukhara"],
  KZ: ["Nur-Sultan", "Karaganda=قراغندي"],
  AZ: ["Baku", "Ganja"],
  GH: ["Greater Accra", "Northern"],
  GM: ["Banjul", "West Coast"],
  SL: ["Western Area", "Northern"],
  BF: ["Kadiogo", "Houet"],
  BJ: ["Littoral", "Borgou"],
  TG: ["Maritime", "Centre"],
  MZ: ["Nampula", "Sofala"],
  LK: ["Colombo", "Ampara"],
  US: ["New York", "Michigan"],
  GB: ["London", "Birmingham"],
  FR: ["Paris", "Rhône"],
  DE: ["Berlin", "North Rhine-Westphalia"],
  CA: ["Ontario", "Quebec"],
  AU: ["New South Wales", "Victoria"],
  RU: ["Saint Petersburg", "Republic of Dagestan"],
  CN: ["Beijing", "Xinjiang"],
  JP: ["Tokyo", "Ōsaka Prefecture"],
  ES: ["Community of Madrid", "Granada"],
  IT: ["Rome", "Milan"],
  NL: ["North Holland", "South Holland"],
  SE: ["Stockholm", "Skåne"],
  MX: ["Mexico", "Jalisco"],
  AR: ["Córdoba=كوردوبا", "Mendoza"],
};
Object.assign(PICKS, MORE);

const fnv = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
const SEP = /[|\n`\\$]/;
const cleanAr = (s) =>
  s.length <= 22 && !/[،,/()0-9A-Za-z٠-٩]/.test(s) && !/^(بلدية|ضاحية|اقليم|مقاطعات)/.test(s);
const cleanEn = (s) => s.length <= 24 && !/[/()0-9]/.test(s);

const rows = [];
const skipped = [];
const seen = new Set();
for (const { c } of geo("world.json").countries) {
  if (FEATURED.has(c) || seen.has(c)) continue;
  seen.add(c);
  if (UNINHABITED.has(c)) {
    skipped.push(`${c}:uninhabited`);
    continue;
  }
  let file;
  try {
    file = geo(`admin1/${c}.json`);
  } catch {
    skipped.push(`${c}:no-file`);
    continue;
  }
  const named = file.regions.filter(
    (r) =>
      r.id &&
      r.en &&
      r.n &&
      /[\u0600-\u06FF]/.test(r.n) &&
      !/[+?]/.test(r.en) &&
      !SEP.test(r.en) &&
      !SEP.test(r.n) &&
      !SEP.test(r.id),
  );
  // الخريطة تطابق أعدادها بالاسم اللاتيني: الاسم المكرّر في الملف لا يصلح
  // والمعرّف مفتاح التعهّد: المكرّر في الملف لا يصلح كذلك
  const unique = named.filter(
    (r) =>
      named.filter((x) => x.en === r.en).length === 1 &&
      named.filter((x) => x.id === r.id).length === 1,
  );
  let pair;
  if (PICKS[c]) {
    pair = PICKS[c].map((p) => {
      const [en, ar] = p.split("=");
      const r = unique.find((x) => x.en === en);
      if (!r) {
        throw new Error(
          `${c}: no unique region named ${en}; the file has: ${unique.map((x) => x.en).join(", ")}`,
        );
      }
      return { ...r, n: ar ?? r.n };
    });
  } else {
    const clean = unique.filter(
      (r) => cleanAr(r.n) && cleanEn(r.en) && /^[A-Z]{3}-\d{1,5}$/.test(r.id),
    );
    const pool = (clean.length >= 2 ? clean : unique).sort((a, b) => (a.id < b.id ? -1 : 1));
    if (pool.length < 2) {
      skipped.push(`${c}:${pool.length}-region`);
      continue;
    }
    const first = pool[fnv(`${c}:first`) % pool.length];
    const rest = pool.filter((r) => r !== first);
    pair = [first, rest[fnv(`${c}:second`) % rest.length]];
  }
  rows.push([c, ...pair.flatMap((r) => [r.id, r.en, r.n])].join("|"));
}
rows.sort();

const body = `/**
 * مولَّد بـ \`node scripts/gen-try-world.mjs\` من ملفّات الخريطة: لا يُحرَّر باليد.
 * سطرٌ لكل دولة: الرمز، ثم لكلٍّ من منطقتيها معرّفها في الخريطة واسمها اللاتيني واسمها العربي.
 * أسماءٌ جغرافية حقيقية على مستوى المنطقة فقط؛ كل ما عداها في التجربة افتراضي.
 */
export const TRY_WORLD_ROWS = \`
${rows.join("\n")}
\`;
`;

if (process.argv.includes("--check")) {
  if (readFileSync(OUT, "utf8") !== body) {
    console.error("try-world.data.ts is stale: run node scripts/gen-try-world.mjs");
    process.exit(1);
  }
  console.log(`✓ try-world.data.ts matches the map files (${rows.length} countries)`);
} else {
  writeFileSync(OUT, body);
  console.log(`wrote ${rows.length} countries; skipped: ${skipped.join(" ")}`);
}
