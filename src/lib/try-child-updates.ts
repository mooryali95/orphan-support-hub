/**
 * تحديثات الطفل في التجربة: نسخ منفذ البيانات لصفحة الكافل ولسان «التحديثات» في
 * درج الدولة، بلا خادمٍ ولا خزنة. الوسائط رسومٌ مولَّدة (لوحاتٌ لونية ومشاهد مجرّدة:
 * سماء، دفتر، ملعب) — لا صورة طفلٍ ولا وجه — وكلّ بندٍ موسومٌ `sample`. لا يُرفع
 * ملفٌّ في التجربة؛ الملاحظات وحدها تُضاف إلى الطابور في ذاكرة الصفحة.
 */
import type { ChildUpdate, PendingChildUpdate } from "@/lib/child-updates";
import { registerDemo } from "@/lib/data-port";
import { TRY_CHILDREN } from "@/lib/try-demo";

type Scene = "sky" | "notebook" | "pitch" | "garden" | "lantern";

const PALETTES: Record<Scene, [string, string, string, string]> = {
  sky: ["#f6c177", "#eb6f92", "#31748f", "#fdf6e3"],
  notebook: ["#e9e4d4", "#4a7c59", "#c97b3a", "#2b2b27"],
  pitch: ["#3f8f5a", "#2f6e45", "#f2efe6", "#e6b450"],
  garden: ["#97b37e", "#5c6148", "#ede8dc", "#c97b3a"],
  lantern: ["#1f2a44", "#3b4a6b", "#f2c14e", "#f7e8c4"],
};

/** مشهدٌ مجرّد بصيغة SVG (لا وجوه ولا أشخاص)، يُعرض كرابط data:. */
export function tryMural(scene: Scene, w = 800, h = 600): string {
  const [a, b, c, d] = PALETTES[scene];
  const bodies: Record<Scene, string> = {
    sky: `<circle cx="${w * 0.72}" cy="${h * 0.32}" r="${h * 0.14}" fill="${d}" opacity=".9"/>
      <path d="M0 ${h * 0.72} Q${w * 0.25} ${h * 0.55} ${w * 0.5} ${h * 0.7} T${w} ${h * 0.62} V${h} H0Z" fill="${c}" opacity=".85"/>
      <path d="M0 ${h * 0.84} Q${w * 0.3} ${h * 0.72} ${w * 0.6} ${h * 0.86} T${w} ${h * 0.8} V${h} H0Z" fill="${b}" opacity=".7"/>`,
    notebook: `<rect x="${w * 0.18}" y="${h * 0.2}" width="${w * 0.64}" height="${h * 0.6}" rx="18" fill="${d}" opacity=".08"/>
      <rect x="${w * 0.2}" y="${h * 0.18}" width="${w * 0.6}" height="${h * 0.6}" rx="16" fill="#fffdf7"/>
      ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${w * 0.27}" y="${h * (0.3 + i * 0.07)}" width="${w * (0.46 - (i % 3) * 0.08)}" height="6" rx="3" fill="${b}" opacity=".35"/>`).join("")}
      <rect x="${w * 0.62}" y="${h * 0.12}" width="${w * 0.05}" height="${h * 0.5}" rx="8" fill="${c}" transform="rotate(28 ${w * 0.64} ${h * 0.37})"/>`,
    pitch: `<rect x="${w * 0.08}" y="${h * 0.12}" width="${w * 0.84}" height="${h * 0.76}" fill="none" stroke="${c}" stroke-width="6" opacity=".8"/>
      <line x1="${w / 2}" y1="${h * 0.12}" x2="${w / 2}" y2="${h * 0.88}" stroke="${c}" stroke-width="6" opacity=".8"/>
      <circle cx="${w / 2}" cy="${h / 2}" r="${h * 0.13}" fill="none" stroke="${c}" stroke-width="6" opacity=".8"/>
      <circle cx="${w * 0.64}" cy="${h * 0.62}" r="${h * 0.05}" fill="${d}"/>`,
    garden: `<circle cx="${w * 0.25}" cy="${h * 0.28}" r="${h * 0.1}" fill="${d}" opacity=".9"/>
      ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<path d="M${w * (0.12 + i * 0.12)} ${h} C${w * (0.1 + i * 0.12)} ${h * 0.75} ${w * (0.16 + i * 0.12)} ${h * 0.62} ${w * (0.13 + i * 0.12)} ${h * (0.5 + (i % 3) * 0.06)}" stroke="${b}" stroke-width="10" fill="none" stroke-linecap="round"/><ellipse cx="${w * (0.13 + i * 0.12)}" cy="${h * (0.48 + (i % 3) * 0.06)}" rx="${w * 0.035}" ry="${h * 0.05}" fill="${i % 2 ? d : c}" opacity=".85"/>`).join("")}`,
    lantern: `${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<circle cx="${(i * 97) % w}" cy="${(i * 53) % (h * 0.5)}" r="2.5" fill="${d}" opacity=".7"/>`).join("")}
      <path d="M${w * 0.5} ${h * 0.25} l${w * 0.08} ${h * 0.1} v${h * 0.3} l-${w * 0.08} ${h * 0.1} l-${w * 0.08} -${h * 0.1} v-${h * 0.3}Z" fill="${c}" opacity=".9"/>
      <circle cx="${w * 0.5}" cy="${h * 0.5}" r="${h * 0.22}" fill="${c}" opacity=".18"/>`,
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>${bodies[scene]}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const daysAgo = (n: number, now: Date) => new Date(now.getTime() - n * 86_400_000).toISOString();

/** تحديثاتٌ نموذجية معتمدة لطفل تجربة: ثلاثة أشهر، الأحدث أوّلاً. */
export function tryChildUpdates(orphanId: string, now: Date = new Date()): ChildUpdate[] {
  const base = {
    caption_en: null,
    duration_seconds: null,
    poster_url: null,
    sample: true,
  } satisfies Partial<ChildUpdate>;
  const salt = orphanId.replace(/\W/g, "");
  return [
    {
      ...base,
      id: `${salt}-u1`,
      kind: "photo",
      url: tryMural("notebook"),
      caption_ar: "دفتر الرياضيات بعد اختبار الفصل الأول",
      caption_en: "The maths notebook after the first-term test",
      at: daysAgo(4, now),
    },
    {
      ...base,
      id: `${salt}-u2`,
      kind: "video",
      url: null,
      poster_url: tryMural("pitch"),
      duration_seconds: 38,
      caption_ar: "مباراة الحيّ بعد المدرسة",
      caption_en: "The neighbourhood match after school",
      at: daysAgo(9, now),
    },
    {
      ...base,
      id: `${salt}-u3`,
      kind: "note",
      url: null,
      caption_ar: "حضورٌ منتظم في الدروس المسائية هذا الشهر، وتحسّنٌ في القراءة بشهادة المعلّم.",
      caption_en:
        "Steady attendance at evening lessons this month; the teacher reports better reading.",
      at: daysAgo(12, now),
    },
    {
      ...base,
      id: `${salt}-u4`,
      kind: "photo",
      url: tryMural("garden"),
      caption_ar: "الحديقة التي زرعها الأطفال في المركز",
      caption_en: "The garden the children planted at the centre",
      at: daysAgo(38, now),
    },
    {
      ...base,
      id: `${salt}-u5`,
      kind: "photo",
      url: tryMural("lantern"),
      caption_ar: "فانوس صنعه في ورشة الفنون",
      caption_en: "A lantern made in the art workshop",
      at: daysAgo(44, now),
    },
    {
      ...base,
      id: `${salt}-u6`,
      kind: "photo",
      url: tryMural("sky"),
      caption_ar: "رسمةٌ لغروب الشمس من نافذة البيت",
      caption_en: "A drawing of the sunset from the home window",
      at: daysAgo(70, now),
    },
  ];
}

/* ——— طابور الدولة في التجربة (ذاكرة الصفحة) ——— */

let queue: PendingChildUpdate[] | null = null;

function pending(now: Date = new Date()): PendingChildUpdate[] {
  if (queue) return queue;
  const sn = TRY_CHILDREN.find((k) => k.co === "SN") ?? TRY_CHILDREN[0]!;
  const row = (over: Partial<PendingChildUpdate>): PendingChildUpdate => ({
    id: "",
    orphan_id: sn.id,
    orphan_name: sn.name,
    orphan_code: sn.code,
    country_code: sn.co,
    kind: "photo",
    caption_ar: "",
    caption_en: null,
    duration_seconds: null,
    created_at: daysAgo(1, now),
    mine: false,
    frozen: false,
    url: null,
    poster_url: null,
    ...over,
  });
  queue = [
    row({
      id: "try-pu-1",
      url: tryMural("notebook"),
      caption_ar: "شهادة نهاية الفصل (نموذج)",
      caption_en: "End-of-term certificate (sample)",
      created_at: daysAgo(2, now),
    }),
    row({
      id: "try-pu-2",
      kind: "video",
      poster_url: tryMural("pitch"),
      duration_seconds: 24,
      caption_ar: "تمرين كرة القدم (نموذج)",
      caption_en: "Football practice (sample)",
      mine: true,
    }),
  ];
  return queue;
}

type Input<T> = { data: T };

/**
 * يسجّل النسخ التجريبية في منفذ البيانات. تناديه وحدات التجربة التي تحمل شاشات الكافل
 * و«اليوم» (`package.json` يعلن `sideEffects: false`، فالاستيراد المجرّد يُحذف من الحزمة).
 */
export function registerChildUpdateDemos() {
  registerDemo("sponsor.childUpdates", async ({ data }: Input<{ orphanId: string }>) => ({
    ok: true as const,
    data: tryChildUpdates(data.orphanId),
  }));
  registerDemo("childUpdates.queue", async ({ data }: Input<{ country: string | null }>) => ({
    ok: true as const,
    data: pending().filter((u) => !data.country || u.country_code === data.country),
  }));
  registerDemo(
    "childUpdates.children",
    async ({ data }: Input<{ country: string; q: string }>) => ({
      ok: true as const,
      data: TRY_CHILDREN.filter(
        (k) =>
          k.co === data.country && (!data.q || k.code.includes(data.q) || k.name.includes(data.q)),
      ).map((k) => ({ id: k.id, code: k.code, display_name: k.name, frozen: false })),
    }),
  );
  registerDemo("childUpdates.upload", async () => ({
    ok: false as const,
    error: "trial_no_upload",
  }));
  registerDemo(
    "childUpdates.submit",
    async ({ data }: Input<{ orphanId: string; captionAr: string; captionEn: string }>) => {
      const k = TRY_CHILDREN.find((x) => x.id === data.orphanId);
      if (!k) return { ok: false as const, missing: false, error: "failed" };
      pending().push({
        id: `try-pu-${Date.now()}`,
        orphan_id: k.id,
        orphan_name: k.name,
        orphan_code: k.code,
        country_code: k.co,
        kind: "note",
        caption_ar: data.captionAr,
        caption_en: data.captionEn || null,
        duration_seconds: null,
        created_at: new Date().toISOString(),
        mine: true,
        frozen: false,
        url: null,
        poster_url: null,
      });
      return { ok: true as const, data: { ok: true as const, id: "try" } };
    },
  );
  registerDemo("childUpdates.review", async ({ data }: Input<{ id: string }>) => {
    const u = pending().find((x) => x.id === data.id);
    if (!u) return { ok: false as const, missing: false, error: "update_closed" };
    if (u.mine) return { ok: false as const, missing: false, error: "four_eyes_required" };
    queue = pending().filter((x) => x.id !== data.id);
    return { ok: true as const, data: { ok: true as const } };
  });
}
