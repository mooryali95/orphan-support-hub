/**
 * «مراجعة الترجمة» في العرض التفاعلي: عيّنةٌ صغيرة من نصوص الواجهة بحالاتها الأربع، في ذاكرة
 * الصفحة وحدها. العينان تُحاكيان قاعدة الخادم: ما حرّره الزائر (`mine`) لا يراجعه ولا ينشره،
 * فيرى الزائر الرفض كما يراه المراجع الحقيقي. لا شيء يصل الخادم، ولا يُنشر نصٌّ في الموقع.
 * يُسجَّل بنداءٍ صريح (`registerTranslateDemos`)، لأنّ الحزمة `sideEffects: false`.
 * (من ملفّات التجربة في `trial.manifest.json`.)
 */
import { registerDemo } from "@/lib/data-port";
import type { WorkRow } from "@/lib/ui-i18n-admin.functions";

type Seed = Omit<WorkRow, "kind" | "stale" | "mine"> & { stale?: boolean; mine?: boolean };

const SEED: Seed[] = [
  {
    key: "home.hero.title",
    ns: "home",
    ar: "كفالةٌ تُرى أثرها",
    en: "Sponsorship whose impact you can see",
    text: "Un parrainage dont on voit l'impact",
    status: "published",
    origin: "human",
  },
  {
    key: "home.hero.lead",
    ns: "home",
    ar: "اختر بلداً واطّلع على الحاجة قبل أن تلتزم.",
    en: "Pick a country and see the need before you commit.",
    text: "Choisissez un pays et voyez le besoin avant de vous engager.",
    status: "reviewed",
    origin: "human",
  },
  {
    key: "home.cta",
    ns: "home",
    ar: "ابدأ الدعم",
    en: "Start supporting",
    text: "Commencer à soutenir",
    status: "draft",
    origin: "machine",
  },
  {
    key: "support.amount",
    ns: "support",
    ar: "المبلغ الشهري",
    en: "Monthly amount",
    text: "Montant mensuel",
    status: "draft",
    origin: "human",
    mine: true,
  },
  {
    key: "support.cadence",
    ns: "support",
    ar: "مرّةً واحدة أو كل شهر",
    en: "Once or every month",
    text: "Une fois ou chaque mois",
    status: "reviewed",
    origin: "human",
    mine: true,
  },
  {
    key: "support.note",
    ns: "support",
    ar: "يصل المبلغ إلى مكتب البلد ثم إلى الطفل.",
    en: "The amount reaches the country office, then the child.",
    text: "Le montant arrive au bureau du pays.",
    status: "published",
    origin: "human",
    stale: true,
  },
  {
    key: "account.title",
    ns: "account",
    ar: "حسابي",
    en: "My account",
    text: null,
    status: "missing",
    origin: null,
  },
  {
    key: "account.security",
    ns: "account",
    ar: "الأمان والتحقّق بخطوتين",
    en: "Security and two-step verification",
    text: null,
    status: "missing",
    origin: null,
  },
];

export function registerTranslateDemos() {
  // حالٌ في الذاكرة: الحفظ والمراجعة والنشر تُغيّر العيّنة في هذه الجلسة وحدها.
  const rows: WorkRow[] = SEED.map((s) => ({
    ...s,
    kind: "text" as WorkRow["kind"],
    stale: s.stale ?? false,
    mine: s.mine ?? false,
  }));
  const find = (k: string) => rows.find((r) => r.key === k);

  registerDemo("translate.work", async () => ({
    ok: true as const,
    data: { rows: rows.map((r) => ({ ...r })), total: rows.length },
  }));
  registerDemo(
    "translate.save",
    async ({ data }: { data: { items: Array<{ key: string; text: string }> } }) => {
      for (const it of data.items) {
        const r = find(it.key);
        if (!r) continue;
        Object.assign(r, {
          text: it.text,
          status: "draft",
          origin: "human",
          stale: false,
          mine: true,
        });
      }
      return { ok: true as const, data: { saved: data.items.length, rejected: [] as string[] } };
    },
  );
  const move =
    (from: WorkRow["status"], to: WorkRow["status"]) =>
    async ({ data }: { data: { keys: string[] } }) => {
      let n = 0;
      for (const k of data.keys) {
        const r = find(k);
        // العينان: كما في القاعدة، لا يتقدّم نصٌّ حرّره القارئ نفسه.
        if (r && r.status === from && !r.mine && !r.stale) {
          r.status = to;
          n++;
        }
      }
      return { ok: true as const, data: n };
    };
  registerDemo("translate.review", move("draft", "reviewed"));
  registerDemo("translate.publish", move("reviewed", "published"));
}
