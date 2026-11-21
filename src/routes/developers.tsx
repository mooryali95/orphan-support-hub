import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRAND, pageTitle } from "@/config/brand";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/developers")({
  head: () => ({
    meta: [
      { title: pageTitle("للمطوّرين", false) },
      {
        name: "description",
        content: `ربط المنصّات الشريكة بـ${BRAND.name}: المصادقة، والنقاط، والأمثلة.`,
      },
    ],
  }),
  component: DevelopersPage,
});

type Endpoint = {
  id: string;
  method: "GET" | "POST";
  path: string;
  scope: string;
  title: string;
  text: string;
  body?: string;
  query?: string;
};

const ENDPOINTS: Endpoint[] = [
  {
    id: "read",
    method: "GET",
    path: "/api/integrations/orphans",
    // الرابط يُرمَّز كما يرسله العميل فعلاً؛ العربية الخام تنقلب في سطرٍ لاتيني.
    query: `?country=${encodeURIComponent("ألبانيا")}&limit=24`,
    scope: "orphans:read",
    title: "قراءة البطاقات",
    text: "البطاقات العامّة بفلترتها: اسمٌ مستعار، بلد، فئة عمرية، حال التمويل. لا قصّة ولا صورة ولا مدينة.",
  },
  {
    id: "import",
    method: "POST",
    path: "/api/integrations/orphans",
    scope: "orphans:import",
    title: "استيراد المستفيدين",
    text: "حتى 100 سجلّ. كل مستورَدٍ يقف «قيد المراجعة» حتى تعتمده الإدارة. يُنصح بترويسة Idempotency-Key.",
    body: JSON.stringify(
      {
        records: [
          { external_ref: "p-1", display_name: "اسم مستعار", country: "ألبانيا", gender: "female" },
        ],
      },
      null,
      2,
    ),
  },
  {
    id: "mirror",
    method: "POST",
    path: "/api/integrations/mirror",
    scope: "mirror:write",
    title: "مزامنة منصّة تشغيل",
    text: "دفعات حتى 500 لكل كيان بمؤشّر، أو مطابقة بكل المعرّفات. التفصيل في عقد المزامنة.",
    body: JSON.stringify(
      {
        entity: "groups",
        records: [{ external_ref: "class-7", name: "مجموعة السلام", region: "تيرانا" }],
        cursor: { at: "2026-11-01T08:00:00Z", ref: "class-7" },
      },
      null,
      2,
    ),
  },
];

const ERRORS: Array<[string, string, string]> = [
  ["401", "missing_credentials", "الرؤوس الثلاثة مطلوبة"],
  ["401", "stale_timestamp", "الوقت خارج نافذة خمس دقائق"],
  ["401", "invalid_credentials", "مفتاحٌ أو سرٌّ خاطئ أو مُبطَل (ردٌّ واحد عمداً)"],
  ["403", "scope_denied", "المفتاح لا يحمل النطاق"],
  ["413", "batch_too_large", "الدفعة أكبر من الحدّ"],
  ["422", "rejected", "رُفضت الدفعة — انظر code"],
];

/**
 * للمطوّرين — توثيقٌ يعمل: يُبنى أمر curl بختم الوقت الحاليّ في المتصفّح
 * وحده. لا يُرسَل المفتاح ولا السرّ إلى أي مكان من هذه الصفحة.
 */
function DevelopersPage() {
  const [active, setActive] = useState<Endpoint>(ENDPOINTS[0]!);
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  // الوقت والنطاق يُعرفان في المتصفّح وحده: يبدآن بقيمةٍ ثابتة يرسمها الخادم والمتصفّح
  // معاً، ثم يُملآن بعد التركيب، فلا يختلف الرسمان.
  const [stamp, setStamp] = useState(0);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("https://<النطاق>");
  useEffect(() => {
    setStamp(Math.floor(Date.now() / 1000));
    setOrigin(window.location.origin);
  }, []);

  const curl = useMemo(() => {
    const lines = [
      `curl -X ${active.method} '${origin}${active.path}${active.query ?? ""}' \\`,
      `  -H 'X-Api-Key: ${key || "ck_live_…"}' \\`,
      `  -H 'X-Api-Secret: ${secret ? "••••••" : "sk_live_…"}' \\`,
      `  -H 'X-Api-Timestamp: ${stamp}'${active.body ? " \\" : ""}`,
    ];
    if (active.body) {
      lines.push(`  -H 'Content-Type: application/json' \\`);
      lines.push(`  -d '${active.body.replace(/\n\s*/g, " ")}'`);
    }
    return lines.join("\n");
  }, [active, key, secret, stamp, origin]);

  async function copy() {
    // السرّ يُنسخ حقيقياً ولا يُعرض: يُستبدل عند النسخ وحده.
    const text = secret ? curl.replace("••••••", secret) : curl;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* الحافظة غير متاحة */
    }
  }

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-10">
        {/* عمود القراءة يبدأ من حافة الشعار نفسها (UI-13). */}
        <div className="max-w-5xl">
          <h1 className="text-3xl font-extrabold">للمطوّرين</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            اربط منصّتك بـ{BRAND.name}. المفاتيح تُصدرها الإدارة بنطاقٍ محدّد، والسرّ يُعرض مرّة
            واحدة. حماية الطفل في القاعدة لا في البوّابة: المفتاح لا يفتح ملفّ طفل.
          </p>

          <section className="mt-8 rounded-2xl border border-border bg-card p-5">
            <h2 className="font-bold">المصادقة</h2>
            <ul className="mt-2 space-y-1 text-sm" dir="ltr">
              <li>
                <code>X-Api-Key</code> — ck_live_…
              </li>
              <li>
                <code>X-Api-Secret</code> — sk_live_…
              </li>
              <li>
                <code>X-Api-Timestamp</code> — Unix seconds, ±5 min
              </li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              الرؤوس القديمة X-IOSO-* ما زالت مقبولة.
            </p>
          </section>

          <div className="mt-8 grid gap-6 lg:grid-cols-[16rem_1fr]">
            <nav aria-label="النقاط" className="space-y-2">
              {ENDPOINTS.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  aria-pressed={active.id === e.id}
                  onClick={() => setActive(e)}
                  className={cn(
                    "w-full rounded-xl border p-3 text-start",
                    active.id === e.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/60",
                  )}
                >
                  <span className="text-sm font-semibold">{e.title}</span>
                  <span className="mt-1 block font-mono text-xs text-muted-foreground" dir="ltr">
                    {e.method} {e.path}
                  </span>
                </button>
              ))}
            </nav>

            <section className="min-w-0">
              <h2 className="text-lg font-bold">{active.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{active.text}</p>
              <p className="mt-2 text-xs">
                النطاق: <code dir="ltr">{active.scope}</code>
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="dev-key" className="text-xs">
                    المفتاح (اختياري — لا يُرسَل)
                  </Label>
                  <Input
                    id="dev-key"
                    dir="ltr"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="dev-secret" className="text-xs">
                    السرّ (يُنسخ ولا يُعرض)
                  </Label>
                  <Input
                    id="dev-secret"
                    dir="ltr"
                    type="password"
                    autoComplete="off"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-border">
                <div className="flex items-center justify-between bg-secondary/60 px-3 py-2 text-xs">
                  <span>curl</span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      className="underline"
                      onClick={() => setStamp(Math.floor(Date.now() / 1000))}
                    >
                      تحديث الوقت
                    </button>
                    <Button size="sm" variant="ghost" onClick={copy}>
                      {copied ? <Check className="size-4" /> : <Copy className="size-4" />} نسخ
                    </Button>
                  </span>
                </div>
                <pre className="overflow-x-auto bg-card p-3 text-xs leading-6" dir="ltr">
                  {curl}
                </pre>
              </div>

              {active.body && (
                <>
                  <p className="mt-4 text-xs font-semibold">جسم الطلب</p>
                  <pre
                    className="mt-1 overflow-x-auto rounded-xl border border-border bg-card p-3 text-xs"
                    dir="ltr"
                  >
                    {active.body}
                  </pre>
                </>
              )}
            </section>
          </div>

          <section className="mt-10">
            <h2 className="font-bold">الأخطاء</h2>
            <table className="mt-3 w-full text-sm">
              <tbody className="divide-y divide-border">
                {ERRORS.map(([status, code, text]) => (
                  <tr key={code}>
                    <td className="w-16 px-3 py-2 font-mono text-xs" dir="ltr">
                      {status}
                    </td>
                    <td className="w-56 px-3 py-2 font-mono text-xs" dir="ltr">
                      {code}
                    </td>
                    <td className="px-3 py-2">{text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
