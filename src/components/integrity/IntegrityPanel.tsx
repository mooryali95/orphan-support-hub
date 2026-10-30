import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Copy,
  FileLock2,
  KeyRound,
  Loader2,
  Lock,
  ShieldQuestion,
  X,
} from "lucide-react";

import { EmptyState } from "@/components/kit/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import {
  applyUnlock,
  approveUnlock,
  getIntegrityQueue,
  issueGrant,
  rejectUnlock,
  requestUnlock,
  resolveDiscrepancy,
  type Discrepancy,
  type IntegrityQueue,
  type UnlockOp,
  type UnlockRequest,
} from "@/lib/integrity.functions";
import { cn } from "@/lib/utils";

const OP_LABEL: Record<UnlockOp, string> = {
  edit: "تصحيح بيانات في كهاتين",
  archive: "أرشفة الملفّ",
  unlock: "رفع القفل",
  rowad_update: "تعديلٌ في منصّة التشغيل",
  rowad_delete: "حذفٌ في منصّة التشغيل",
};
const FIELD_LABEL: Record<string, string> = {
  display_name: "الاسم المستعار",
  gender: "الجنس",
  birth_date: "تاريخ الميلاد",
  country: "البلد",
  region: "المنطقة",
  group_id: "المجموعة",
  external_ref: "المعرّف في المصدر",
  external_source: "المصدر",
  external_deleted_at: "حذفٌ في المصدر",
  status: "الحالة",
};
const STATUS_LABEL: Record<UnlockRequest["status"], [string, string]> = {
  pending: ["ينتظر الموافقات", "bg-accent text-accent-foreground"],
  approved: ["معتمد — نافذةٌ مفتوحة", "bg-primary/10 text-primary"],
  rejected: ["مرفوض", "bg-secondary text-muted-foreground"],
  applied: ["طُبّق", "bg-secondary text-foreground"],
  granted: ["صدر الإذن", "bg-secondary text-foreground"],
  expired: ["انتهت نافذته", "bg-secondary text-muted-foreground"],
};

const fieldName = (k: string) =>
  k.startsWith("trait_score:") ? `درجة سمة (${k.slice(12)})` : (FIELD_LABEL[k] ?? k);
const show = (v: unknown) =>
  v === null || v === undefined || v === ""
    ? "—"
    : typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)
      ? formatDate(v)
      : String(v);

/**
 * سلامة الحقيقة: ما يُطلب فكّه، وما أمسكناه من المصدر، وسجلّ ما جرى.
 * لا شيء هنا يتمّ بيدٍ واحدة: الطلب يحتاج موافقة مسؤولَين غير صاحبه.
 */
export function IntegrityPanel() {
  const fetchQueue = useServerFn(getIntegrityQueue);
  const { data: raw, isPending } = useQuery({
    queryKey: ["integrity-queue"],
    queryFn: () => fetchQueue(),
    refetchInterval: 30_000,
  });
  const q = raw ? (JSON.parse(raw) as IntegrityQueue | null) : null;

  if (isPending)
    return <Loader2 className="mx-auto mt-10 size-5 animate-spin text-muted-foreground" />;
  if (!q)
    return (
      <EmptyState
        className="mt-6"
        title="طبقة السلامة تتجهّز الآن"
        text="تظهر بعد تطبيق حزمة النشر على القاعدة."
      />
    );

  const open = q.requests.filter((r) => r.status === "pending" || r.status === "approved");
  const closed = q.requests.filter((r) => !open.includes(r));

  return (
    <div className="space-y-10">
      <NewRequest />

      <section aria-labelledby="req-h">
        <h2 id="req-h" className="flex items-center gap-2 text-lg font-bold">
          <FileLock2 className="size-5 text-bridge-ink" strokeWidth={1.5} aria-hidden="true" />
          طلبات الفكّ
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-sm tabular-nums">
            {open.length}
          </span>
        </h2>
        {open.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">لا طلب مفتوح.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {open.map((r, i) => (
              <li key={r.id} className="stagger-in" style={{ ["--i" as string]: i }}>
                <RequestCard r={r} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="dis-h">
        <h2 id="dis-h" className="flex items-center gap-2 text-lg font-bold">
          <ShieldQuestion className="size-5 text-bridge-ink" strokeWidth={1.5} aria-hidden="true" />
          ما أمسكناه من المصدر
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-sm tabular-nums">
            {q.discrepancies.length}
          </span>
        </h2>
        <p className="mt-1 text-sm leading-7 text-muted-foreground">
          تغييرٌ وصل من منصّة التشغيل على ملفّ طفلٍ مقفول. لم يُطبَّق: القيمة القديمة باقية حتى
          تقرّر.
        </p>
        {q.discrepancies.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">لا اختلاف.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {q.discrepancies.map((d, i) => (
              <li key={d.id} className="stagger-in" style={{ ["--i" as string]: i }}>
                <DiscrepancyCard d={d} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {closed.length > 0 && (
        <details className="group rounded-2xl bg-secondary/40 p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            طلبات مُغلقة ({closed.length}) — آخر ٩٠ يوماً
          </summary>
          <ul className="mt-3 divide-y divide-border text-sm">
            {closed.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="font-medium">{r.orphan}</span>
                <span className="text-muted-foreground">{OP_LABEL[r.op]}</span>
                <StatusPill s={r.status} />
                <span className="ms-auto text-xs text-muted-foreground">
                  {formatDate(r.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <section aria-labelledby="log-h">
        <h2 id="log-h" className="text-lg font-bold">
          السجلّ
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          آخر الأحداث. كل سطرٍ ببصمةٍ مربوطة بما قبله؛ لا يُعدَّل ولا يُحذف.
        </p>
        <ol className="mt-4 space-y-0">
          {q.recent.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-3 border-s-2 border-border py-2 ps-4 text-sm"
            >
              <span className="min-w-0 flex-1">{KIND[e.kind] ?? e.kind}</span>
              <bdi dir="ltr" className="font-mono text-[11px] text-muted-foreground">
                {e.hash}…
              </bdi>
              <span className="text-xs text-muted-foreground">{formatDate(e.at)}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

const KIND: Record<string, string> = {
  locked: "قُفل ملفّ",
  unlock_requested: "طُلب فكّ",
  unlock_approved: "موافقة على طلب",
  unlock_rejected: "رُفض طلب",
  unlock_applied: "طُبّق طلب",
  grant_issued: "صدر إذنٌ لمنصّة التشغيل",
  mirror_change_held: "أُمسك تغييرٌ من المصدر",
  score_delete_held: "أُمسك حذف درجة",
  score_revised: "صُحّحت درجة (الأصل محفوظ)",
  discrepancy_dismissed: "أُبقيت الحقيقة القائمة",
  emergency_on: "وضع طوارئ",
  emergency_off: "رُفع الطوارئ",
  source_status: "تغيّرت حالة مصدر",
};

function StatusPill({ s }: { s: UnlockRequest["status"] }) {
  const [label, tone] = STATUS_LABEL[s];
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", tone)}>{label}</span>
  );
}

function useRefresh() {
  const qc = useQueryClient();
  return async () => {
    await qc.invalidateQueries({ queryKey: ["integrity-queue"] });
    await qc.invalidateQueries({ queryKey: ["sources-overview"] });
    await qc.invalidateQueries({ queryKey: ["decision-inbox"] });
  };
}

function RequestCard({ r }: { r: UnlockRequest }) {
  const approve = useServerFn(approveUnlock);
  const reject = useServerFn(rejectUnlock);
  const apply = useServerFn(applyUnlock);
  const grant = useServerFn(issueGrant);
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const forPlatform = r.op === "rowad_update" || r.op === "rowad_delete";

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return void toast.error(res.error ?? "تعذّر التنفيذ");
    toast.success(ok);
    await refresh();
  }

  return (
    <article className="rounded-3xl bg-card p-5 shadow-[0_0_0_1px_rgb(0_0_0/0.06)]">
      <header className="flex flex-wrap items-center gap-2">
        <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
        <h3 className="font-bold">{r.orphan}</h3>
        <bdi dir="ltr" className="font-mono text-xs text-muted-foreground">
          {r.code}
        </bdi>
        <span className="ms-auto">
          <StatusPill s={r.status} />
        </span>
      </header>
      <p className="mt-2 text-sm font-medium">{OP_LABEL[r.op]}</p>
      {Object.keys(r.patch).length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {Object.entries(r.patch).map(([k, v]) => (
            <li key={k} className="rounded-full bg-secondary px-2.5 py-1">
              {fieldName(k)}: <strong>{show(v)}</strong>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 rounded-xl bg-secondary/50 p-3 text-sm leading-7">{r.reason}</p>
      {r.document && (
        <p className="mt-1 text-xs text-muted-foreground">
          المستند: <bdi dir="ltr">{r.document}</bdi>
        </p>
      )}

      {/* الموافقات: نقطةٌ لكل موافقةٍ مطلوبة */}
      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        {Array.from({ length: r.quorum }, (_, i) => (
          <span
            key={i}
            className={cn(
              "size-2.5 rounded-full transition-colors duration-500",
              i < r.approvals ? "bg-primary" : "bg-border",
            )}
            aria-hidden="true"
          />
        ))}
        <span className="tabular-nums">
          {r.approvals} من {r.quorum} موافقات
        </span>
        {r.mine && <span>· طلبك — لا توافق عليه</span>}
        {r.status === "approved" && r.expires_at && (
          <span className="text-primary">
            · النافذة حتى{" "}
            {new Date(r.expires_at).toLocaleTimeString("ar-u-nu-latn", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>

      <footer className="mt-4 flex flex-wrap gap-2">
        {r.status === "pending" && !r.mine && !r.i_approved && (
          <Button
            disabled={busy}
            onClick={() => void run(() => approve({ data: { id: r.id } }), "سُجّلت موافقتك")}
          >
            <Check aria-hidden="true" /> أوافق
          </Button>
        )}
        {r.status === "approved" && !forPlatform && (
          <Button
            disabled={busy}
            onClick={() => void run(() => apply({ data: { id: r.id } }), "طُبّق، وأُغلق الطلب")}
          >
            نفّذ الآن
          </Button>
        )}
        {r.status === "approved" && forPlatform && !token && (
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const res = await grant({ data: { id: r.id } });
              setBusy(false);
              if (!res.ok) return void toast.error(res.error);
              setToken(res.token);
              await refresh();
            }}
          >
            <KeyRound aria-hidden="true" /> أصدر الإذن الموقّع
          </Button>
        )}
        {(r.status === "pending" || r.status === "approved") && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void run(() => reject({ data: { id: r.id } }), "رُفض الطلب")}
          >
            <X aria-hidden="true" /> رفض
          </Button>
        )}
      </footer>

      {token && (
        <div className="map-rise mt-4 rounded-2xl bg-secondary/60 p-3">
          <p className="text-xs font-semibold">
            الإذن — صالحٌ لربع ساعة ومرّةٍ واحدة. يُرسل إلى منصّة التشغيل:
          </p>
          <div className="mt-2 flex gap-2">
            <code
              dir="ltr"
              className="min-w-0 flex-1 truncate rounded-lg bg-card px-2 py-1.5 text-[11px]"
            >
              {token}
            </code>
            <Button
              size="icon"
              variant="outline"
              aria-label="نسخ الإذن"
              onClick={async () => {
                await navigator.clipboard.writeText(token);
                toast.success("نُسخ");
              }}
            >
              <Copy className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

function DiscrepancyCard({ d }: { d: Discrepancy }) {
  const resolve = useServerFn(resolveDiscrepancy);
  const refresh = useRefresh();
  const [mode, setMode] = useState<null | "accept" | "dismiss">(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <article className="rounded-3xl bg-card p-5 shadow-[0_0_0_1px_rgb(0_0_0/0.06)]">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="font-bold">{d.orphan}</h3>
        <bdi dir="ltr" className="font-mono text-xs text-muted-foreground">
          {d.code}
        </bdi>
        <span className="ms-auto text-xs text-muted-foreground">
          من <bdi dir="ltr">{d.source ?? "—"}</bdi> · {formatDate(d.created_at)}
        </span>
      </header>
      <table className="mt-3 w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="py-1 text-start font-medium">الحقل</th>
            <th className="py-1 text-start font-medium">القائم (باقٍ)</th>
            <th className="py-1 text-start font-medium">المقترح من المصدر</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {Object.entries(d.changes).map(([k, v]) => (
            <tr key={k}>
              <td className="py-2">{fieldName(k)}</td>
              <td className="py-2 font-medium">
                <bdi>{show(v.was)}</bdi>
              </td>
              <td className="py-2 text-bridge-ink">
                <span className="inline-flex items-center gap-1">
                  <ArrowLeft className="size-3 ltr:-scale-x-100" aria-hidden="true" />
                  <bdi>{show(v.proposed)}</bdi>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {mode ? (
        <form
          className="map-rise mt-4 space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const res = await resolve({ data: { id: d.id, accept: mode === "accept", reason } });
            setBusy(false);
            if (!res.ok) return void toast.error(res.error);
            toast.success(
              mode === "accept" ? "رُفع طلب تصحيح — ينتظر موافقتين" : "أُبقيت الحقيقة القائمة",
            );
            await refresh();
          }}
        >
          <Label htmlFor={`dr-${d.id}`} className="text-xs">
            {mode === "accept"
              ? "لماذا نقبل التغيير؟ (يصير طلباً بموافقتين)"
              : "لماذا نُبقي القائم؟"}
          </Label>
          <Textarea
            id={`dr-${d.id}`}
            required
            minLength={10}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy || reason.trim().length < 10}>
              {mode === "accept" ? "ارفع طلب التصحيح" : "أبقِ القائم"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode(null)}>
              إلغاء
            </Button>
          </div>
        </form>
      ) : (
        <footer className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setMode("accept")}>
            قبول التغيير…
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("dismiss")}>
            إبقاء القائم…
          </Button>
        </footer>
      )}
    </article>
  );
}

/** طلبٌ رسمي جديد: ملفٌّ مقفول، وعملية، وسبب، ومستند. */
function NewRequest() {
  const submit = useServerFn(requestUnlock);
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [op, setOp] = useState<UnlockOp>("edit");
  const [field, setField] = useState("display_name");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [doc, setDoc] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: found } = useQuery({
    queryKey: ["locked-orphan", code.trim().toUpperCase()],
    enabled: open && code.trim().length >= 3,
    queryFn: async () => {
      const { data } = await supabase
        .from("orphans")
        .select("id, code, display_name")
        .ilike("code", code.trim())
        .maybeSingle();
      if (!data) return null;
      const { data: lock } = await supabase
        .from("orphan_locks" as never)
        .select("reason")
        .eq("orphan_id", data.id)
        .maybeSingle();
      return { ...data, locked: !!lock };
    },
  });

  if (!open)
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileLock2 aria-hidden="true" /> طلبٌ رسمي جديد
      </Button>
    );

  return (
    <form
      className="map-rise space-y-4 rounded-3xl bg-card p-6 shadow-[0_0_0_1px_rgb(0_0_0/0.06)]"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!found?.locked) return;
        setBusy(true);
        const res = await submit({
          data: {
            orphanId: found.id,
            op,
            patch: op === "edit" || op === "rowad_update" ? { [field]: value || null } : {},
            reason,
            ...(doc.trim() ? { document: doc.trim() } : {}),
          },
        });
        setBusy(false);
        if (!res.ok) return void toast.error(res.error);
        toast.success("رُفع الطلب — ينتظر موافقة مسؤولَين");
        setOpen(false);
        setReason("");
        setValue("");
        await refresh();
      }}
    >
      <h2 className="font-bold">طلبٌ رسمي على ملفٍّ مقفول</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="nr-code">رقم الملف</Label>
          <Input
            id="nr-code"
            dir="ltr"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="KH-…"
            className="mt-1.5"
          />
          <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
            {code.trim().length < 3
              ? "اكتب رقم الملف"
              : found === undefined
                ? "…"
                : !found
                  ? "لا ملفّ بهذا الرقم"
                  : found.locked
                    ? `${found.display_name} — مقفول`
                    : `${found.display_name} — غير مقفول، يُعدَّل من مكانه`}
          </p>
        </div>
        <div>
          <Label htmlFor="nr-op">العملية</Label>
          <select
            id="nr-op"
            value={op}
            onChange={(e) => setOp(e.target.value as UnlockOp)}
            className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm"
          >
            {(Object.keys(OP_LABEL) as UnlockOp[]).map((k) => (
              <option key={k} value={k}>
                {OP_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        {(op === "edit" || op === "rowad_update") && (
          <>
            <div>
              <Label htmlFor="nr-field">الحقل</Label>
              <select
                id="nr-field"
                value={field}
                onChange={(e) => setField(e.target.value)}
                className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm"
              >
                {["display_name", "gender", "birth_date", "country", "region", "group_id"].map(
                  (k) => (
                    <option key={k} value={k}>
                      {FIELD_LABEL[k]}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div>
              <Label htmlFor="nr-value">القيمة الجديدة</Label>
              <Input
                id="nr-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </>
        )}
      </div>
      <div>
        <Label htmlFor="nr-reason">السبب</Label>
        <Textarea
          id="nr-reason"
          required
          minLength={10}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1.5"
        />
      </div>
      <div>
        <Label htmlFor="nr-doc">المستند (رابط أو رقم مرجعي)</Label>
        <Input
          id="nr-doc"
          dir="ltr"
          value={doc}
          onChange={(e) => setDoc(e.target.value)}
          className="mt-1.5"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !found?.locked || reason.trim().length < 10}>
          {busy && <Loader2 className="animate-spin" />}
          ارفع الطلب
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
