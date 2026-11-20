/**
 * الخطّان من أصلنا لا من Google Fonts: لا اتصال بأصلين غريبين قبل أوّل رسم،
 * ولا ورقة أنماطٍ خارجية تحجب الرسم، والملفّات ببصمةٍ في اسمها فتُخزَّن سنة.
 *
 * وزن أميري العربي كما يخدمه Google نحو 100KB للوزن الواحد (علامات المصحف
 * وبدائلها)؛ فاقتُطع منه «الأساس» — حروف العربية اليومية وتشكيلها وأرقامها —
 * نحو 45KB. والملفّ الكامل باقٍ خلفه بمداه الأصلي: لا ينزّله المتصفّح إلا إن
 * ورد في الصفحة حرفٌ خارج الأساس (أردية مثلاً)، فلا يسقط حرفٌ إلى خطّ النظام.
 * عند تداخل المديين يغلب التعريف الأخير، فالأساس يُكتب بعد الكامل.
 */
import amiri400Ar from "@/assets/fonts/amiri-400-ar.woff2?url";
import amiri400Core from "@/assets/fonts/amiri-400-ar-core.woff2?url";
import amiri400Lat from "@/assets/fonts/amiri-400-lat.woff2?url";
import amiri700Ar from "@/assets/fonts/amiri-700-ar.woff2?url";
import amiri700Core from "@/assets/fonts/amiri-700-ar-core.woff2?url";
import amiri700Lat from "@/assets/fonts/amiri-700-lat.woff2?url";
import readexAr from "@/assets/fonts/readex-ar.woff2?url";
import readexLat from "@/assets/fonts/readex-lat.woff2?url";

const ARABIC =
  "U+0600-06FF,U+0750-077F,U+0870-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC";
/** ما اقتُطع في ملفّات ‎-core (انظر src/assets/fonts/NOTICE.txt). */
const CORE_ARABIC =
  "U+060C,U+061B,U+061F,U+0621-063A,U+0640-0655,U+0660-066D,U+0670-0671,U+067E,U+0686,U+0698,U+06A4,U+06A9,U+06AF,U+06CC,U+06D4,U+06F0-06F9,U+200C-200E,U+FDF2,U+FDFA-FDFD";
const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";

const face = (family: string, weight: string, url: string, range: string) =>
  `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url(${url}) format("woff2");unicode-range:${range}}`;

/**
 * تعريفات الخطوط — تُضمَّن في <head> فلا طلب إضافي لها.
 *
 * في اللغات اليمينية تؤخذ المسافة من ملفّ الأساس العربي نفسه: وإلا نزّل المتصفّح
 * ملفّ أميري اللاتيني (20KB للوزن) لأجل المسافات بين الكلمات وحدها، وأعاد صفّ
 * العنوان عند وصوله. وفي اليسارية تبقى المسافة للّاتيني فلا يُنزَّل العربي بلا حاجة.
 */
export function fontFaceCss(dir: "rtl" | "ltr"): string {
  const core = dir === "rtl" ? `U+0020,U+00A0,${CORE_ARABIC}` : CORE_ARABIC;
  return [
    // ريدكس برو متغيّر الوزن: ملفّ واحد لكلّ الأوزان المستعملة.
    face("Readex Pro", "300 700", readexAr, ARABIC),
    face("Readex Pro", "300 700", readexLat, LATIN),
    face("Amiri", "400", amiri400Ar, ARABIC),
    face("Amiri", "400", amiri400Lat, LATIN),
    face("Amiri", "400", amiri400Core, core),
    face("Amiri", "700", amiri700Ar, ARABIC),
    face("Amiri", "700", amiri700Lat, LATIN),
    face("Amiri", "700", amiri700Core, core),
  ].join("");
}

/**
 * ما يُحمَّل مسبقاً: خطّ المتن وخطّ العناوين بحروف لغة الصفحة فقط، فيُرسم أوّل
 * نصٍّ بخطّه لا ببديلٍ يتبدّل (وميضٌ وإزاحة). الباقي ينزل عند أوّل حاجة.
 */
export function fontPreloads(dir: "rtl" | "ltr"): string[] {
  return dir === "rtl" ? [readexAr, amiri700Core] : [readexLat, amiri700Lat];
}
