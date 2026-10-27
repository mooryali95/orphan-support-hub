import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, Plug, ShieldOff, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  listApiClients,
  listApprovedOrgs,
  issueApiClient,
  revokeApiClientFn,
} from "@/lib/integrations.functions";
import type { ApiClientSummary } from "@/integrations/supabase/types.extra";
import { formatDate } from "@/lib/format";

const SCOPES = [
  ["orphans:read", "قراءة البطاقات"],
  ["orphans:import", "استيراد المستفيدين"],
  ["mirror:write", "مزامنة منصّة التشغيل (الرواد)"],
] as const;

type Scope = (typeof SCOPES)[number][0];

/**
 * مفاتيح التكامل.
 *
 * وشيئان يُعرضان قبل الضغط لا بعده: أنّ **السرّ يُعرض مرّةً واحدة**،
 * وأنّ **الاستيراد لا يَنشر** — فلا يظنّ الشريك أنّ ملفّاته ظهرت
 * للكفلاء بمجرّد إرسالها.
 */
export function ApiClientsAdmin() {
  const queryClient = useQueryClient();
  const fetchList = useServerFn(listApiClients);
  const issue = useServerFn(issueApiClient);
  const revoke = useServerFn(revokeApiClientFn);
  const fetchOrgs = useServerFn(listApprovedOrgs);

  const { data, isPending } = useQuery({
    queryKey: ["api-clients"],
    queryFn: () => fetchList(),
  });
  const { data: orgList } = useQuery({
    queryKey: ["approved-orgs"],
    queryFn: () => fetchOrgs(),
  });

  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [scopes, setScopes] = useState<Scope[]>(["orphans:read"]);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ clientKey: string; secret: string } | null>(null);
  const [confirming, setConfirming] = useState<ApiClientSummary | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  /* التحذير يُبنى أسفل القائمة، وضغطةٌ على أوّل سطرٍ في قائمةٍ طويلة
     تفتحه خارج الشاشة — يضغط المستخدم ولا يرى شيئاً. (نفس ضبط شاشة
     اعتماد المشرفين.) */
  useEffect(() => {
    if (!confirming) return;
    confirmRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    confirmRef.current?.focus();
  }, [confirming]);

  const orgs = orgList?.orgs ?? [];
  const rows = data?.clients ?? [];

  function toggle(scope: Scope) {
    setScopes((s) => (s.includes(scope) ? s.filter((x) => x !== scope) : [...s, scope]));
  }

  async function onIssue(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await issue({
        data: {
          name: name.trim(),
          orgId: orgId || null,
          scopes,
          // مفتاح المزامنة يرتبط بمنصّة التشغيل الوحيدة المفعّلة اليوم.
          ...(scopes.includes("mirror:write") ? { source: "rowad-albania" } : {}),
        },
      });
      if (!res.ok || !res.credentials) {
        toast.error(res.error ?? "تعذّر الإصدار");
        return;
      }
      setIssued(res.credentials);
      setName("");
      void queryClient.invalidateQueries({ queryKey: ["api-clients"] });
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(row: ApiClientSummary) {
    setBusy(true);
    try {
      const res = await revoke({ data: { clientId: row.id } });
      if (!res.ok) {
        toast.error(res.error ?? "تعذّر الإبطال");
        return;
      }
      toast.success("أُبطل المفتاح");
      setConfirming(null);
      void queryClient.invalidateQueries({ queryKey: ["api-clients"] });
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`نُسخ ${what}`);
    } catch {
      toast.error("تعذّر النسخ — انسخه يدوياً");
    }
  }

  return (
    <section aria-labelledby="api-heading">
      <h2 id="api-heading" className="flex items-center gap-2 text-sm font-bold">
        <Plug className="size-4 text-shore-need" aria-hidden="true" />
        مفاتيح التكامل
      </h2>
      <p className="mt-2 max-w-2xl text-xs leading-6 text-muted-foreground">
        تُمكّن المنصّات الشريكة من قراءة بطاقات المستفيدين ومن إرسال مستفيديها إلينا. و
        <strong className="text-foreground">الوارد لا يُنشَر</strong>: يقف عند المراجعة حتى تعتمده
        الإدارة. و<strong className="text-foreground">القراءة بطاقةٌ لا ملفّ</strong> — مفتاح الشريك
        ليس إذناً برؤية قصّة طفل.
      </p>

      <form
        onSubmit={onIssue}
        className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4"
      >
        <div className="min-w-56 flex-1">
          <Label htmlFor="api-name" className="text-xs">
            اسم الجهة الشريكة
          </Label>
          <Input
            id="api-name"
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: منصّة إحسان"
            className="mt-1"
          />
        </div>
        <div className="min-w-48">
          <Label htmlFor="api-org" className="text-xs">
            جهة الرعاية المسؤولة
          </Label>
          <select
            id="api-org"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">بلا جهة (قراءة فقط)</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="min-w-48">
          <legend className="text-xs font-medium">النطاقات</legend>
          <div className="mt-1 flex flex-wrap gap-3">
            {SCOPES.map(([value, label]) => (
              <label key={value} className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={scopes.includes(value)}
                  onChange={() => toggle(value)}
                  className="size-4"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" disabled={busy || scopes.length === 0 || name.trim().length < 2}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          <KeyRound className="size-4" aria-hidden="true" />
          إصدار مفتاح
        </Button>
        <p className="w-full text-xs text-muted-foreground">
          الاستيراد يحتاج جهة رعاية مسؤولة: ملفٌّ بلا جهةٍ معتمدة لا صاحب له.
        </p>
      </form>

      {/* السرّ يُعرض هنا مرّةً واحدة — ولا سبيل لإعادته */}
      {issued && (
        <div role="alert" className="mt-4 rounded-2xl border-2 border-bridge-bright/60 bg-card p-5">
          <h3 className="flex items-center gap-2 font-bold text-bridge-ink">
            <TriangleAlert className="size-4" aria-hidden="true" />
            انسخ السرّ الآن — لن يُعرض مرّةً أخرى
          </h3>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            نحفظ تجزيء السرّ لا السرّ، فلا نستطيع إعادة عرضه ولو أردنا. ومن فقده يُصدِر غيره ويُبطل
            هذا.
          </p>
          <dl className="mt-4 space-y-2 text-xs">
            {(
              [
                ["المفتاح (X-Api-Key)", issued.clientKey],
                ["السرّ (X-Api-Secret)", issued.secret],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex flex-wrap items-center gap-2">
                <dt className="w-48 shrink-0 font-medium">{label}</dt>
                <dd className="flex-1">
                  <code className="rounded bg-secondary px-2 py-1 font-mono text-[11px]" dir="ltr">
                    {value}
                  </code>
                </dd>
                <Button size="sm" variant="outline" onClick={() => void copy(value, label)}>
                  <Copy className="size-3.5" aria-hidden="true" />
                  نسخ
                </Button>
              </div>
            ))}
          </dl>
          <Button size="sm" variant="ghost" className="mt-3" onClick={() => setIssued(null)}>
            نسختُه — إخفاء
          </Button>
        </div>
      )}

      {isPending ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          جارٍ التحميل…
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          لا مفاتيح تكامل بعد.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className="min-w-48 flex-1">
                <p className="text-sm font-medium">{row.name}</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground" dir="ltr">
                  {row.client_key}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {row.org_name && <span>{row.org_name}</span>}
                  <span>·</span>
                  <span>أُصدر {formatDate(row.created_at)}</span>
                  {row.last_used_at && (
                    <>
                      <span>·</span>
                      <span>آخر استعمال {formatDate(row.last_used_at)}</span>
                    </>
                  )}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {row.scopes.map((s) => (
                  <Badge key={s} variant="secondary" className="font-mono text-[10px]">
                    {s}
                  </Badge>
                ))}
              </div>

              <Badge variant="secondary">{row.orphans} ملفّاً</Badge>
              {row.active ? (
                <Badge>فاعل</Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <ShieldOff className="size-3" aria-hidden="true" /> مُبطَل
                </Badge>
              )}

              {row.active && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  aria-haspopup="dialog"
                  aria-expanded={confirming?.id === row.id}
                  onClick={() => setConfirming(row)}
                >
                  إبطال
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {confirming && (
        <div
          role="alertdialog"
          aria-labelledby="revoke-api-title"
          className="mt-4 rounded-2xl border-2 border-bridge-bright/50 bg-card p-5"
        >
          <h3 id="revoke-api-title" className="font-bold text-bridge-ink">
            إبطال مفتاح {confirming.name}
          </h3>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            يتوقّف الشريك عن القراءة والاستيراد في الحال. والملفّات التي أرسلها{" "}
            <strong>({confirming.orphans})</strong> تبقى كما هي — الإبطال يُغلق الباب ولا يحذف ما
            دخل منه.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              ref={confirmRef}
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => void onRevoke(confirming)}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              تأكيد الإبطال
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
              تراجع
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
