import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brandFor, pageTitle } from "@/config/brand";
import { copyOf, defineCopy, useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

const COPY = defineCopy("routes/developers", {
  ar: {
    title: "للمطوّرين",
    description: (n: string) => `ربط المنصّات الشريكة بـ${n}: المصادقة، والنقاط، والأمثلة.`,
    lead: (n: string) =>
      `اربط منصّتك بـ${n}. المفاتيح تُصدرها الإدارة بنطاقٍ محدّد، والسرّ يُعرض مرّة واحدة. حماية الطفل في القاعدة لا في البوّابة: المفتاح لا يفتح ملفّ طفل.`,
    auth: "المصادقة",
    legacy: "الرؤوس القديمة X-IOSO-* ما زالت مقبولة.",
    endpoints: "النقاط",
    scope: "النطاق:",
    key: "المفتاح (اختياري، لا يُرسَل)",
    secret: "السرّ (يُنسخ ولا يُعرض)",
    refresh: "تحديث الوقت",
    copy: "نسخ",
    copyLabel: "نسخ أمر curl",
    copied: "نُسخ أمر curl",
    copyFailed: "تعذّر النسخ؛ الحافظة غير متاحة في هذا المتصفّح",
    body: "جسم الطلب",
    errors: "الأخطاء",
    colStatus: "الرمز",
    colCode: "الخطأ",
    colMeaning: "المعنى",
    origin: "https://<النطاق>",
    ep: {
      read: {
        title: "قراءة البطاقات",
        text: "البطاقات العامّة بفلترتها: اسمٌ مستعار، بلد، فئة عمرية، حال التمويل. لا قصّة ولا صورة ولا مدينة.",
      },
      import: {
        title: "استيراد المستفيدين",
        text: "حتى 100 سجلّ. كل مستورَدٍ يقف «قيد المراجعة» حتى تعتمده الإدارة. يُنصح بترويسة Idempotency-Key.",
      },
      mirror: {
        title: "مزامنة منصّة تشغيل",
        text: "دفعات حتى 500 لكل كيان بمؤشّر، أو مطابقة بكل المعرّفات. التفصيل في عقد المزامنة.",
      },
    } as Record<string, { title: string; text: string }>,
    err: {
      missing_credentials: "الرؤوس الثلاثة مطلوبة",
      stale_timestamp: "الوقت خارج نافذة خمس دقائق",
      invalid_credentials: "مفتاحٌ أو سرٌّ خاطئ أو مُبطَل (ردٌّ واحد عمداً)",
      scope_denied: "المفتاح لا يحمل النطاق",
      batch_too_large: "الدفعة أكبر من الحدّ",
      rejected: "رُفضت الدفعة؛ انظر code",
    } as Record<string, string>,
  },
  en: {
    title: "For developers",
    description: (n: string) =>
      `Connecting partner platforms to ${n}: authentication, endpoints and examples.`,
    lead: (n: string) =>
      `Connect your platform to ${n}. Keys are issued by the admin team with a specific scope, and the secret is shown once. Child protection lives in the database, not the gateway: a key never opens a child's file.`,
    auth: "Authentication",
    legacy: "The older X-IOSO-* headers are still accepted.",
    endpoints: "Endpoints",
    scope: "Scope:",
    key: "Key (optional, never sent)",
    secret: "Secret (copied, never shown)",
    refresh: "Refresh the timestamp",
    copy: "Copy",
    copyLabel: "Copy the curl command",
    copied: "The curl command was copied",
    copyFailed: "Could not copy; the clipboard is not available in this browser",
    body: "Request body",
    errors: "Errors",
    colStatus: "Status",
    colCode: "Error",
    colMeaning: "Meaning",
    origin: "https://<domain>",
    ep: {
      read: {
        title: "Read cards",
        text: "Public cards with their filters: a pseudonym, country, age band and funding state. No story, photo or city.",
      },
      import: {
        title: "Import beneficiaries",
        text: "Up to 100 records. Every imported record stays under review until the admin team approves it. An Idempotency-Key header is recommended.",
      },
      mirror: {
        title: "Sync an operating platform",
        text: "Batches of up to 500 per entity with a cursor, or a full reconciliation by every identifier. Details are in the sync contract.",
      },
    } as Record<string, { title: string; text: string }>,
    err: {
      missing_credentials: "All three headers are required",
      stale_timestamp: "The timestamp is outside the five minute window",
      invalid_credentials: "A wrong or revoked key or secret (one answer, on purpose)",
      scope_denied: "The key does not carry the scope",
      batch_too_large: "The batch is larger than the limit",
      rejected: "The batch was rejected; see code",
    } as Record<string, string>,
  },
});

export const Route = createFileRoute("/developers")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    const c = copyOf(COPY, l);
    return {
      meta: [
        { title: pageTitle(c.title, false, l) },
        { name: "description", content: c.description(brandFor(l).name) },
      ],
    };
  },
  component: DevelopersPage,
});

type Endpoint = {
  id: string;
  method: "GET" | "POST";
  path: string;
  scope: string;
  body?: string;
  query?: string;
};

// أمثلة الطلبات بيانات لا نصّ واجهة: تبقى كما يرسلها العميل.
const ENDPOINTS: Endpoint[] = [
  {
    id: "read",
    method: "GET",
    path: "/api/integrations/orphans",
    // الرابط يُرمَّز كما يرسله العميل فعلاً؛ العربية الخام تنقلب في سطرٍ لاتيني.
    query: `?country=${encodeURIComponent("ألبانيا")}&limit=24`,
    scope: "orphans:read",
  },
  {
    id: "import",
    method: "POST",
    path: "/api/integrations/orphans",
    scope: "orphans:import",
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

const ERRORS: Array<[string, string]> = [
  ["401", "missing_credentials"],
  ["401", "stale_timestamp"],
  ["401", "invalid_credentials"],
  ["403", "scope_denied"],
  ["413", "batch_too_large"],
  ["422", "rejected"],
];

/**
 * للمطوّرين — توثيقٌ يعمل: يُبنى أمر curl بختم الوقت الحاليّ في المتصفّح
 * وحده. لا يُرسَل المفتاح ولا السرّ إلى أي مكان من هذه الصفحة.
 */
function DevelopersPage() {
  const t = useCopy(COPY);
  const brand = brandFor(useLocale());
  const [active, setActive] = useState<Endpoint>(ENDPOINTS[0]!);
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  // الوقت والنطاق يُعرفان في المتصفّح وحده: يبدآن بقيمةٍ ثابتة يرسمها الخادم والمتصفّح
  // معاً، ثم يُملآن بعد التركيب، فلا يختلف الرسمان.
  const [stamp, setStamp] = useState(0);
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => {
    setStamp(Math.floor(Date.now() / 1000));
    setOrigin(window.location.origin);
  }, []);

  const curl = useMemo(() => {
    const lines = [
      `curl -X ${active.method} '${origin ?? t.origin}${active.path}${active.query ?? ""}' \\`,
      `  -H 'X-Api-Key: ${key || "ck_live_…"}' \\`,
      `  -H 'X-Api-Secret: ${secret ? "••••••" : "sk_live_…"}' \\`,
      `  -H 'X-Api-Timestamp: ${stamp}'${active.body ? " \\" : ""}`,
    ];
    if (active.body) {
      lines.push(`  -H 'Content-Type: application/json' \\`);
      lines.push(`  -d '${active.body.replace(/\n\s*/g, " ")}'`);
    }
    return lines.join("\n");
  }, [active, key, secret, stamp, origin, t.origin]);

  async function copy() {
    // السرّ يُنسخ حقيقياً ولا يُعرض: يُستبدل عند النسخ وحده.
    const text = secret ? curl.replace("••••••", secret) : curl;
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    setTimeout(() => setCopied("idle"), 2500);
  }

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-10">
        {/* عمود القراءة يبدأ من حافة الشعار نفسها (UI-13). */}
        <div className="max-w-5xl">
          <h1 className="text-3xl font-extrabold">{t.title}</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">{t.lead(brand.name)}</p>

          <section className="mt-8 rounded-2xl border border-border bg-card p-5">
            <h2 className="font-bold">{t.auth}</h2>
            <ul className="mt-2 space-y-1 text-sm" dir="ltr">
              <li>
                <code>X-Api-Key</code>: ck_live_…
              </li>
              <li>
                <code>X-Api-Secret</code>: sk_live_…
              </li>
              <li>
                <code>X-Api-Timestamp</code>: Unix seconds, ±5 min
              </li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">{t.legacy}</p>
          </section>

          <div className="mt-8 grid gap-6 lg:grid-cols-[16rem_1fr]">
            <nav aria-label={t.endpoints} className="space-y-2">
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
                  <span className="text-sm font-semibold">{t.ep[e.id]?.title}</span>
                  <span className="mt-1 block font-mono text-xs text-muted-foreground" dir="ltr">
                    {e.method} {e.path}
                  </span>
                </button>
              ))}
            </nav>

            <section className="min-w-0">
              <h2 className="text-lg font-bold">{t.ep[active.id]?.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t.ep[active.id]?.text}</p>
              <p className="mt-2 text-xs">
                {t.scope} <code dir="ltr">{active.scope}</code>
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="dev-key" className="text-xs">
                    {t.key}
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
                    {t.secret}
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
                      className="min-h-11 px-2 underline underline-offset-4"
                      onClick={() => setStamp(Math.floor(Date.now() / 1000))}
                    >
                      {t.refresh}
                    </button>
                    <Button
                      className="min-h-11"
                      variant="ghost"
                      aria-label={t.copyLabel}
                      onClick={copy}
                    >
                      {copied === "ok" ? (
                        <Check className="size-4" aria-hidden="true" />
                      ) : (
                        <Copy className="size-4" aria-hidden="true" />
                      )}{" "}
                      {t.copy}
                    </Button>
                    <span role="status" aria-live="polite" className="sr-only">
                      {copied === "ok" ? t.copied : copied === "fail" ? t.copyFailed : ""}
                    </span>
                  </span>
                </div>
                <pre className="overflow-x-auto bg-card p-3 text-xs leading-6" dir="ltr">
                  {curl}
                </pre>
              </div>

              {active.body && (
                <>
                  <p className="mt-4 text-xs font-semibold">{t.body}</p>
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
            <h2 className="font-bold">{t.errors}</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sr-only">
                  <tr>
                    <th scope="col">{t.colStatus}</th>
                    <th scope="col">{t.colCode}</th>
                    <th scope="col">{t.colMeaning}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ERRORS.map(([status, code]) => (
                    <tr key={code}>
                      <td className="w-16 px-3 py-2 font-mono text-xs" dir="ltr">
                        {status}
                      </td>
                      <td className="w-56 px-3 py-2 font-mono text-xs" dir="ltr">
                        {code}
                      </td>
                      <td className="px-3 py-2">{t.err[code]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
