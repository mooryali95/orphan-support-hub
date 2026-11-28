/**
 * حرّاس المصدر الواحد — ما يُفحص من المستودع وحده، بلا قاعدة ولا شبكة.
 *
 * كل فحصٍ هنا يقفل قيمةً لها أكثر من موضع: إمّا أن الموضعين متطابقان فعلاً
 * (فيُقفل التطابق)، أو أن التكرار قائمٌ ومعروف (فتُقفل قائمته: لا يزيد بصمت،
 * ومن يصلح موضعاً يحذفه من القائمة). وما هو تناقضٌ حقيقي لم يُصلَح بعد مكتوبٌ
 * `it.fails` مع سببه: يمرّ ما دام التناقض قائماً، ويحمرّ حين يُصلَح — فيُحوَّل
 * عندها إلى `it`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { COHORT_MIN } from "@/components/map/demo-stats";
import { networkPaint } from "@/components/map/network-layer";
import { GIVING_TRACKS } from "@/config/giving-tracks";
import { NETWORK } from "@/data/vision-network";
import { WAMY_COUNTRIES } from "@/data/wamy-network";
import { COUNTRY_CODES } from "@/lib/countries";
import { FEATURES } from "@/lib/env.server";
import { FX_SEED, operatingCurrency, quoteCharge, UNIFIED_CURRENCY } from "@/lib/currency";
import { SYNC_FRESH_HOURS } from "@/lib/go-live";
import { COUNTRIES as HALL_COUNTRIES } from "@/lib/hall/model";
import { IMPACT_COHORT_MIN } from "@/lib/support-impact";

const ROOT = resolve(__dirname, "../..");
const SRC = join(ROOT, "src");
const MIGRATIONS = join(ROOT, "supabase/migrations");

const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** ملفّات الكود الحيّ: بلا اختبارات، ولا مولَّدات، ولا أنواع القاعدة المولَّدة. */
const SOURCES = walk(SRC)
  .filter((p) => /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) && !/\.gen\.tsx?$/.test(p))
  .map((p) => relative(ROOT, p).split("\\").join("/"))
  .filter((p) => !p.startsWith("src/integrations/supabase/"))
  .sort();

/** الكود بلا تعليقاته: التعليق يشرح بالأمثلة («€46.30») ولا يُعرض لأحد. */
function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

/** العرض النموذجي له عملته الثابتة عمداً (تجربة باليورو، ورؤية بعملة المنصّة الموحّدة). */
const SHOWCASE = (p: string) =>
  /^src\/(routes\/(try|vision)[.\w$-]*\.tsx|components\/(try|vision)\/|lib\/(try-[\w-]+|hall\/trial)\.ts|data\/)/.test(
    p,
  );

const MIGRATION_FILES = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort();

/** آخر تعريفٍ للدالّة في سلسلة الهجرات (الأحدث يغلب)، بجسمه كاملاً. */
function latestFunction(name: string): string {
  let found = "";
  const header = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\s*\\(`, "g");
  for (const file of MIGRATION_FILES) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    for (const m of sql.matchAll(header)) {
      const rest = sql.slice(m.index);
      const tag = /AS\s+(\$[A-Za-z_]*\$)/.exec(rest);
      if (!tag) continue;
      const start = tag.index + tag[0].length;
      const end = rest.indexOf(tag[1]!, start);
      found = rest.slice(0, end < 0 ? undefined : end);
    }
  }
  return found;
}

const set = (xs: Iterable<string>) => [...new Set(xs)].sort();

/* ------------------------------------------------------------------ */
/* ١) الدول والشبكة                                                    */
/* ------------------------------------------------------------------ */

const PUBLIC_NETWORK = set(
  WAMY_COUNTRIES.filter((c) => c.presence.status !== "unconfirmed").map((c) => c.code),
);

describe("الشبكة: قائمة دولٍ واحدة", () => {
  it("كل دولةٍ في ملفّ الشبكة مرّةً واحدة، وبرمزٍ يقبله جدول الدول", () => {
    const codes = WAMY_COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(COUNTRY_CODES).toContain(c);
  });

  it("الخريطة والرؤية والقاعة تقرأ الحضور العلني من الملفّ نفسه", () => {
    // ما يُفتح للدعم على خريطة الصفحة الأولى (`HOME_SUPPORTABLE`).
    expect(set(networkPaint("network").keys())).toEqual(PUBLIC_NETWORK);
    expect(set(NETWORK.map((o) => o.code))).toEqual(PUBLIC_NETWORK);
    expect(set(HALL_COUNTRIES.filter((c) => c.st !== "unconfirmed").map((c) => c.code))).toEqual(
      PUBLIC_NETWORK,
    );
    // غير المؤكَّد لا يُفتح للدعم إلا بطلبٍ صريح (الإدارة).
    expect(networkPaint("network", { showUnconfirmed: true }).size).toBe(WAMY_COUNTRIES.length);
  });

  /*
   * AGENTS.md يُلزم بأن يبقى `countries.in_network` مطابقاً لملفّ الشبكة. القائمة
   * مكرَّرةٌ في SQL اضطراراً (الهجرة لا تقرأ TypeScript)، فتُقفل هنا: آخر هجرةٍ
   * تبذر العمود تحمل دول الحضور العلني بالضبط، برمزها واسمها العربي، ولا تحمل
   * غير المؤكَّد. من يغيّر الملفّ يكتب هجرةً جديدة بالقائمة الجديدة.
   */
  it("هجرةٌ تملأ countries.in_network من دول الحضور العلني كلّها، ولا غيرها", () => {
    const seeds = MIGRATION_FILES.map((f) => readFileSync(join(MIGRATIONS, f), "utf8")).filter(
      (sql) => /(INSERT INTO|UPDATE) public\.countries[\s\S]{0,4000}in_network/.test(sql),
    );
    const latest = seeds.at(-1) ?? "";
    const block = /WITH network \(code, name_ar, name_local\) AS \(\s*VALUES([\s\S]*?)\n\)/.exec(
      latest,
    )?.[1];
    expect(block, "آخر هجرةٍ تمسّ in_network تحمل قائمة الشبكة").toBeTruthy();
    const seeded = [...(block ?? "").matchAll(/\('([A-Z]{2})', '([^']+)', '(?:[^']|'')+'\)/g)].map(
      (m) => [m[1]!, m[2]!] as const,
    );
    const wanted = WAMY_COUNTRIES.filter((c) => c.presence.status !== "unconfirmed")
      .map((c) => [c.code, c.nameAr] as const)
      .sort(([a], [b]) => a.localeCompare(b));
    expect([...seeded].sort(([a], [b]) => a.localeCompare(b))).toEqual(wanted);
    // وما ليس في القائمة يُرفع عنه التعليم، فلا يبقى تعليمٌ قديم خارج الملفّ.
    expect(latest).toMatch(/SET in_network = false[\s\S]*NOT EXISTS \(SELECT 1 FROM network/);
  });
});

/* ------------------------------------------------------------------ */
/* ٢) العملة                                                           */
/* ------------------------------------------------------------------ */

describe("العملة: خريطةٌ واحدة وسعرٌ واحد", () => {
  it("العملة الموحّدة في الكود هي افتراض القاعدة وافتراض منتج مزوّد الدفع", () => {
    const settings = /CREATE TABLE IF NOT EXISTS public\.platform_settings \([\s\S]*?\);/.exec(
      read("supabase/migrations/20260823160000_payments_and_admin_overview.sql"),
    )?.[0];
    expect(settings).toContain(`currency TEXT NOT NULL DEFAULT '${UNIFIED_CURRENCY}'`);
    expect(code("src/lib/payments/creem.ts")).toContain(
      `(env(ENV.productCurrency) ?? "${UNIFIED_CURRENCY}")`,
    );
  });

  it("المعادل المعروض قبل الدفع هو ما تحسبه القاعدة بالسنت (fx_convert)", () => {
    // القاعدة: trunc(amount * rate, 2) بالمباشر، و trunc(amount / rate, 2) بالمعكوس.
    for (const r of FX_SEED) {
      const scaled = BigInt(Math.round(r.rate * 1e6));
      for (let n = 1; n <= 20_000; n += 1) {
        const direct = Number((BigInt(n) * scaled) / 10_000n) / 100;
        const inverse = Number((BigInt(n) * 100_000_000n) / scaled) / 100;
        expect(quoteCharge(n, r.base, r.quote)?.credited.amount).toBe(direct);
        expect(quoteCharge(n, r.quote, r.base)?.credited.amount).toBe(inverse);
      }
    }
  });

  it("السعر الحرفي لا يُكتب خارج وحدة العملة وبذرة الهجرة", () => {
    const literal = FX_SEED.map((r) => String(r.rate));
    const offenders = SOURCES.filter(
      (p) =>
        p !== "src/lib/currency.ts" &&
        /fx|rate|currency/i.test(code(p)) &&
        literal.some((l) =>
          new RegExp(`rate\\w*\\s*[:=]\\s*${l.replace(".", "\\.")}\\b`).test(code(p)),
        ),
    );
    expect(offenders).toEqual([]);
  });

  /*
   * ثلاثة مواضع تبني منسّق العملة نفسه (`narrowSymbol` ثم «US$» ← «$»). متطابقة
   * اليوم؛ القائمة مقفلة كي لا يُضاف رابع. الأصل `formatMoney` في format.ts.
   */
  it("منسّقات المبالغ معروفة العدد", () => {
    expect(SOURCES.filter((p) => code(p).includes("currencyDisplay"))).toEqual([
      "src/lib/currency.ts",
      "src/lib/email/templates.ts",
      "src/lib/format.ts",
    ]);
  });

  /*
   * رمز العملة لا يُكتب باليد: يأتي من `formatMoney`. الباقي في القائمة دَينٌ
   * معروف (يعرض «40 €» ويكتب غير اليورو رمزاً خاماً) — يُحذف منها حين يُصلَح.
   */
  it("لا رمز عملةٍ مكتوباً باليد خارج العرض النموذجي", () => {
    const offenders = SOURCES.filter(
      (p) =>
        !SHOWCASE(p) && /[€£﷼]|ر\.س|US\$/.test(code(p).replace(/\.replace\("US\$", "\$"\)/g, "")),
    );
    expect(offenders).toEqual([]);
  });

  /*
   * «العملة حين تغيب» مكتوبةٌ حرفاً في مواضع متفرّقة، ومختلفة: اليورو في بعضها
   * والدولار في غيرها، والموحّدة `UNIFIED_CURRENCY`. القائمة مقفلة بعددها: لا
   * يُضاف موضعٌ جديد، ومن يردّ موضعاً إلى وحدة العملة ينقص عدده هنا.
   */
  it("افتراضات العملة الحرفية لا تزيد", () => {
    const counts: Record<string, number> = {};
    for (const p of SOURCES) {
      if (SHOWCASE(p) || p === "src/lib/currency.ts") continue;
      const n = code(p).match(/(\?\?|\|\||[^=!<>]=)\s*"(EUR|USD)"/g)?.length ?? 0;
      if (n > 0) counts[p] = n;
    }
    expect(counts).toEqual({
      "src/components/donor/DonorBoard.tsx": 1,
      "src/components/impact/EvidenceLedger.tsx": 1,
      "src/components/intake/OrphanIntakeForm.tsx": 1,
      "src/components/map/WorldMap.tsx": 1,
      "src/components/map/layers.ts": 1,
      "src/lib/email/templates.ts": 1,
      "src/lib/intake.functions.ts": 1,
      "src/lib/payments/creem.ts": 1,
      "src/lib/support-amounts.ts": 2,
      "src/lib/support.functions.ts": 1,
      "src/routes/_authenticated/dashboard.tsx": 1,
      "src/routes/_authenticated/donor.$entityId.report.tsx": 1,
    });
  });

  /*
   * تناقضٌ قائم: طفل المرآة يُنشأ بعملة حاجةٍ «EUR» مهما كانت دولته، وعملة
   * تشغيل أغلب دول الشبكة الدولار. يُصلَح حين يأخذ `mirror_apply` العملة من
   * `countries.currency`؛ عندها يُحوَّل هذا إلى `it`.
   */
  it.fails("طفل المرآة يأخذ عملة دولته لا «EUR» ثابتة", () => {
    expect(PUBLIC_NETWORK.some((c) => operatingCurrency(c) !== "EUR")).toBe(true);
    expect(latestFunction("mirror_apply")).not.toMatch(/0,\s*'EUR',\s*'under_review'/);
  });

  /*
   * تناقضٌ قائم (مال): هجرة العملة الموحّدة تحفظ الزوج «ما يُحصَّل / ما يُقيَّد»
   * (`charge_amount` و`amount`) وتمنع تعديل `charge_*` من العميل، لكن
   * `sponsor_change_amount` (SECURITY DEFINER) يغيّر `amount` وحده ولا يعرف
   * `charge_*`: كفالةٌ تنتظر الدفع بعملةٍ أخرى يُرفع مقيَّدها ويبقى محصَّلها.
   * يُصلَح برفض التغيير (أو إعادة الحساب) حين `charge_currency IS NOT NULL`.
   */
  it.fails("تغيير مبلغ الكفالة يراعي شروط التحصيل بعملةٍ أخرى", () => {
    const guard = latestFunction("guard_sponsorship_charge_terms");
    expect(guard).toContain("charge_amount");
    expect(latestFunction("sponsor_change_amount")).toContain("charge_");
  });
});

/* ------------------------------------------------------------------ */
/* ٣) أسماء أنواع العطاء                                               */
/* ------------------------------------------------------------------ */

describe("أسماء أنواع العطاء: من giving-tracks", () => {
  it("المفاتيح هي مفاتيح القاعدة", () => {
    expect([...GIVING_TRACKS].sort()).toEqual(["in_kind", "monthly", "qualification"]);
    const pledge = latestFunction("create_support_pledge");
    expect(read("src/lib/support.functions.ts")).toContain(
      'kind: z.enum(["qualification", "in_kind"])',
    );
    expect(pledge).toContain("_kind");
  });

  /*
   * اسم النوع نفسه مكتوبٌ بصيغٍ أخرى خارج `giving-tracks` («بناء الأهلية» و«دعم
   * عيني» مقابل «تبرع تأهيل» و«تبرع عيني»؛ وبالإنجليزية ثلاث صيغ). القائمة
   * مقفلة: لا يُضاف موضع، ومن يوحّد موضعاً يحذفه منها.
   */
  it("المواضع التي تسمّي النوع بغير اسمه الموحّد لا تزيد", () => {
    const label =
      /"(دعم عيني|In-kind support|Building capability|Capability building)"|(label|qualification):\s*"بناء الأهلية"/;
    expect(SOURCES.filter((p) => !SHOWCASE(p) && label.test(code(p)))).toEqual([
      "src/components/qualification/QualificationPanel.tsx",
      "src/lib/support.functions.ts",
      "src/lib/workspaces.functions.ts",
      "src/routes/index.tsx",
      "src/routes/orphans.$orphanId.tsx",
      "src/routes/support.tsx",
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* ٤) أرقام الأثر وحدودها                                              */
/* ------------------------------------------------------------------ */

describe("حدود الأرقام: الكود يطابق القاعدة", () => {
  it("حدّ الحشد واحدٌ في الخريطة والأثر والقاعدة", () => {
    const db = Number(/SELECT (\d+)/.exec(latestFunction("cohort_min"))?.[1]);
    expect(db).toBeGreaterThan(0);
    expect(COHORT_MIN).toBe(db);
    expect(IMPACT_COHORT_MIN).toBe(db);
  });

  it("عمر المزامنة المقبول هو حدّ تنبيه تأخّر المرآة", () => {
    const lag = /b\.received_at > now\(\) - interval '(\d+) hours'/.exec(
      read("supabase/migrations/20260926100000_ops_health.sql"),
    );
    expect(Number(lag?.[1])).toBe(SYNC_FRESH_HOURS);
  });

  it("أرقام الصفحة الأولى من دالّةٍ واحدة في القاعدة", () => {
    const callers = SOURCES.filter((p) => code(p).includes('"public_platform_stats"'));
    expect(callers).toEqual(["src/lib/orphans.functions.ts"]);
    const geo = SOURCES.filter((p) => /rpc\("geo_stats"/.test(code(p)));
    expect(geo).toEqual(["src/lib/protection.functions.ts"]);
  });
});

/* ------------------------------------------------------------------ */
/* ٥) التجربة لا تبلغ المال ولا بوّابة التكامل                          */
/* ------------------------------------------------------------------ */

const TRIAL = (p: string) =>
  /^src\/(routes\/try[.\w$-]*\.tsx|components\/try\/|lib\/try-[\w-]+\.ts|lib\/hall\/trial\.ts)/.test(
    p,
  );

describe("التجربة مفصولة عن المسارات المالية", () => {
  it("ملفّات التجربة لا تستورد دوالّ المال ولا عميل القاعدة ولا بوّابة التكامل", () => {
    const money =
      /@\/lib\/(payments|sponsorships\.functions|support\.functions|manual-payments\.functions|payments\.functions|ledger\.functions)|@\/integrations\/supabase|\/api\/(integrations|payments)/;
    const offenders = SOURCES.filter(TRIAL).filter(
      (p) =>
        [...code(p).matchAll(/import\s+(type\s+)?[\s\S]*?from\s+"([^"]+)"/g)].some(
          // استيراد النوع وحده لا ينقل سلوكاً.
          (m) => !m[1] && money.test(m[2]!),
        ) || /\/api\/(integrations|payments)/.test(code(p)),
    );
    expect(offenders).toEqual([]);
  });

  it("معرّف طفل التجربة لا يمرّ من فحص المعرّف في دوالّ المال", () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    // أطفال التجربة أنفسهم يُفحصون في ملفّها (try-demo.test.ts)، فيبقى هذا الفحص بعد حذفها
    expect(uuid.test("try-al")).toBe(false);
    expect(code("src/lib/sponsorships.functions.ts")).toMatch(/orphanId: z\.string\(\)\.uuid\(\)/);
    expect(code("src/lib/payments.functions.ts")).toMatch(/sponsorshipId: z\.string\(\)\.uuid\(\)/);
  });
});

/* ------------------------------------------------------------------ */
/* ٦) بوّابة التكامل والأدوار                                          */
/* ------------------------------------------------------------------ */

describe("بوّابة التكامل: القوائم نفسها في الكود والقاعدة", () => {
  it("كيانات المرآة في المسار هي فروع mirror_apply", () => {
    const list = /const ENTITIES = new Set\(\[([^\]]+)\]\)/.exec(
      read("src/routes/api/integrations/mirror.ts"),
    )?.[1];
    const entities = [...(list ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]!);
    expect(entities.length).toBe(5);
    const apply = latestFunction("mirror_apply");
    for (const e of entities) expect(apply).toContain(`_entity = '${e}'`);
    const union = /export type MirrorEntity =([^;]+);/.exec(
      read("src/routes/api/integrations/-mirror-payload.ts"),
    )?.[1];
    expect(set([...(union ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]!))).toEqual(
      set(entities),
    );
  });

  it("نطاقات نموذج الإصدار هي قيد القاعدة", () => {
    // آخر هجرةٍ تعيد تعريف القيد: السجلّ الذهبي أضاف records:primary و records:verify.
    const sql = /scopes <@ ARRAY\[([^\]]+)\]/.exec(
      read("supabase/migrations/20261126100000_golden_record.sql"),
    )?.[1];
    const db = set([...(sql ?? "").matchAll(/'([a-z:]+)'/g)].map((m) => m[1]!));
    const zod = /scopes: z\s*\.array\(\s*z\.enum\(\[([^\]]+)\]\),?\s*\)/.exec(
      read("src/lib/integrations.functions.ts"),
    )?.[1];
    expect(set([...(zod ?? "").matchAll(/"([a-z:]+)"/g)].map((m) => m[1]!))).toEqual(db);
  });

  /*
   * تناقضٌ قائم: مفتاح المزامنة يُصدر من الواجهة لمصدرٍ واحد مكتوبٍ حرفاً، فلا
   * يُصدر مفتاحٌ لمنصّة تشغيل دولةٍ ثانية. يُصلَح حين يُختار المصدر من
   * `operating_platforms`؛ عندها يُحوَّل هذا إلى `it`.
   */
  it.fails("مصدر مفتاح المزامنة يُختار من منصّات التشغيل لا حرفاً ثابتاً", () => {
    expect(code("src/components/integrations/ApiClientsAdmin.tsx")).not.toMatch(
      /source:\s*"rowad-albania"/,
    );
  });
});

describe("جاهزية الدفع: تعريفٌ واحد لـ«مهيّأ»", () => {
  it("مفاتيح الجاهزية في لوحة الاعتماد هي ما يشترطه محوّل المزوّد", () => {
    const creem = read("src/lib/payments/creem.ts");
    const names = Object.fromEntries(
      [...creem.matchAll(/^\s{2}(\w+): "(CREEM_[A-Z_]+)",$/gm)].map((m) => [m[1]!, m[2]!]),
    );
    const body = /isConfigured\(\) \{[\s\S]*?return Boolean\(([^)]*\)[^)]*\)[^)]*\))\)/.exec(
      creem,
    )?.[1];
    const required = set([...(body ?? "").matchAll(/ENV\.(\w+)/g)].map((m) => names[m[1]!]!));
    expect(required.length).toBe(3);
    expect(set(FEATURES.payments)).toEqual(required);
  });

  /*
   * تناقضٌ قائم: لوحة الاعتماد تعدّ الدفع جاهزاً بوجود المفاتيح الثلاثة، والمزوّد
   * لا يُختار إلا إذا ضُبط `PAYMENT_PROVIDER=creem` أيضاً (وإلا فالتحويل اليدوي)،
   * والتحصيل موقوفٌ في القاعدة افتراضاً (`payments_on_hold`). فالشرط يخضرّ
   * والدفع الإلكتروني مغلق. يُصلَح حين يسأل الشرط عن المزوّد المختار فعلاً.
   */
  it.fails("شرط الجاهزية يشمل اختيار المزوّد لا وجود المفاتيح وحده", () => {
    expect(FEATURES.payments as readonly string[]).toContain("PAYMENT_PROVIDER");
  });
});

describe("الأدوار: تعريفٌ واحد", () => {
  it("is_admin: آخر تعريفٍ مبنيٌّ على has_role ويشترط aal2 لمن فعّل عاملاً ثانياً", () => {
    // أُعيد تعريفه مرّةً مقصودة (هجرة admin_mfa)؛ المرجع آخر تعريف.
    const latest = latestFunction("is_admin");
    expect(latest).toMatch(/has_role\(auth\.uid\(\), 'admin'\)/);
    expect(latest).toContain("aal2");
    expect(latest).toContain("auth.mfa_factors");
  });

  it("أدوار الواجهة هي تعداد القاعدة", () => {
    const sql = /CREATE TYPE public\.app_role AS ENUM \(([^)]+)\)/.exec(
      read(`supabase/migrations/${MIGRATION_FILES[0]}`),
    )?.[1];
    const added = MIGRATION_FILES.flatMap((f) =>
      [
        ...readFileSync(join(MIGRATIONS, f), "utf8").matchAll(
          /ALTER TYPE public\.app_role ADD VALUE(?: IF NOT EXISTS)? '([a-z_]+)'/g,
        ),
      ].map((m) => m[1]!),
    );
    const db = set([...[...(sql ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!), ...added]);
    const ts = /export type AppRole =([^;]+);/.exec(read("src/hooks/useAuth.ts"))?.[1];
    expect(set([...(ts ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]!))).toEqual(db);
  });

  it("فحص الإدارة في الخادم يسأل القاعدة لا قائمةً في الكود", () => {
    // الواجهة تقرأ `user_roles` للعرض والتوجيه فقط؛ لا بريد ولا معرّف إداري حرفاً.
    const offenders = SOURCES.filter((p) =>
      /(ADMIN_EMAILS|ADMIN_IDS|adminEmails)\b|email\s*===\s*"[^"]+@/.test(code(p)),
    );
    expect(offenders).toEqual([]);
  });
});
