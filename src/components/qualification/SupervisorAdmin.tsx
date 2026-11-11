import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldOff, TriangleAlert, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  listSupervisors,
  certifySupervisorByEmail,
  revokeSupervisor,
  LEVEL_LABELS,
} from "@/lib/supervisor.functions";
import type { AdminSupervisorRow, ProgramLevel } from "@/integrations/supabase/types.extra";
import { formatDate } from "@/lib/format";

const LEVELS: ProgramLevel[] = ["foundational", "applied", "advanced"];

/**
 * اعتماد المشرفين — من الإدارة وحدها.
 *
 * وهي الحلقة الأولى: بلا مشرفٍ معتمَد لا يُسنَد إشراف، فلا يتقدّم
 * برنامج. والقاعدة تفرض ذلك كلّه؛ هذه الشاشة تُظهره.
 */
export function SupervisorAdmin() {
  const queryClient = useQueryClient();
  const fetchList = useServerFn(listSupervisors);
  const certify = useServerFn(certifySupervisorByEmail);
  const revoke = useServerFn(revokeSupervisor);

  const { data, isPending } = useQuery({
    queryKey: ["admin-supervisors"],
    queryFn: () => fetchList(),
  });

  const [email, setEmail] = useState("");
  const [level, setLevel] = useState<ProgramLevel>("foundational");
  const [independence, setIndependence] = useState("0");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<AdminSupervisorRow | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  /* التحذير يُبنى أسفل القائمة، وقد يفتحه ضغطٌ على أوّل سطرٍ في قائمةٍ
     طويلة فيقع خارج الشاشة: يضغط المستخدم ولا يرى شيئاً. فيُجلَب إلى
     النظر ويأخذ التركيز — وإليه يعود لو تراجع. */
  useEffect(() => {
    if (!confirming) return;
    confirmRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    confirmRef.current?.focus();
  }, [confirming]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["admin-supervisors"] });
  }

  async function onCertify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await certify({
        data: {
          email,
          level,
          independence: Math.max(0, Math.min(100, Number(independence) || 0)),
        },
      });
      if (!res.ok) {
        toast.error(res.error ?? "تعذّر الاعتماد");
        return;
      }
      toast.success("اعتُمد المشرف");
      setEmail("");
      setIndependence("0");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(row: AdminSupervisorRow) {
    setBusy(true);
    try {
      const res = await revoke({ data: { userId: row.user_id } });
      if (!res.ok) {
        toast.error(res.error ?? "تعذّر السحب");
        return;
      }
      toast.success(
        res.ended > 0 ? `سُحب الاعتماد، وأُنهي ${res.ended} إشرافاً قائماً` : "سُحب الاعتماد",
      );
      setConfirming(null);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  const rows = data?.supervisors ?? [];

  return (
    <section aria-labelledby="supervisors-heading">
      <h2 id="supervisors-heading" className="text-sm font-bold">
        اعتماد المشرفين
      </h2>
      <p className="mt-2 max-w-2xl text-xs leading-6 text-muted-foreground">
        الإشراف على بناء الأهلية لا يُسنَد إلا لمعتمَدٍ من الإدارة — لا من جهة الرعاية، على مبدأ
        ألّا تعتمد الجهةُ نفسَها. وبلا مشرفٍ معتمَد لا يتقدّم برنامج.
      </p>

      {/* الاعتماد بالبريد لا بتصفّح المستخدمين: قائمةٌ بكل الحسابات
          تصير دليلَ حسابات، والإدارة تعرف من تعتمد. */}
      <form
        onSubmit={onCertify}
        className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4"
      >
        <div className="min-w-56 flex-1">
          <Label htmlFor="sv-email" className="text-xs">
            بريد المشرف
          </Label>
          <Input
            id="sv-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="له حساب على المنصّة"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="sv-level" className="text-xs">
            المستوى
          </Label>
          <select
            id="sv-level"
            value={level}
            onChange={(e) => setLevel(e.target.value as ProgramLevel)}
            className="mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABELS[l]}
              </option>
            ))}
          </select>
        </div>
        <div className="w-32">
          <Label htmlFor="sv-ind" className="text-xs">
            مؤشّر الاستقلال %
          </Label>
          <Input
            id="sv-ind"
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            value={independence}
            onChange={(e) => setIndependence(e.target.value)}
            className="mt-1"
          />
        </div>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          <UserPlus className="size-4" aria-hidden="true" />
          اعتماد
        </Button>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">
        الاستقلالية تُعقد عند 85%. ومن دونها يبقى إشرافه مقروناً بمتابعة الإدارة — طورٌ في التأهيل
        لا حكمٌ على الكفاءة.
      </p>

      {isPending ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          جارٍ التحميل…
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          لا مشرف معتمَد بعد. وحتى يُعتمد أوّلهم لا يتقدّم أيّ برنامج بناء أهلية.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {rows.map((row) => (
            <li
              key={row.user_id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className="min-w-48 flex-1">
                <p className="text-sm font-medium" dir="ltr">
                  {row.email}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>المستوى {LEVEL_LABELS[row.level]}</span>
                  <span>·</span>
                  <span>{row.independence_index}%</span>
                  {row.certified_at && (
                    <>
                      <span>·</span>
                      <span>اعتُمد {formatDate(row.certified_at)}</span>
                    </>
                  )}
                </p>
              </div>

              {row.active ? (
                row.independent ? (
                  <Badge className="gap-1">
                    <ShieldCheck className="size-3" aria-hidden="true" /> مستقلّ
                  </Badge>
                ) : (
                  <Badge variant="secondary">قيد التأهيل</Badge>
                )
              ) : (
                <Badge variant="outline" className="gap-1">
                  <ShieldOff className="size-3" aria-hidden="true" /> اعتماد مسحوب
                </Badge>
              )}

              <Badge variant="secondary">{row.assignments} مستفيد</Badge>

              {row.active && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  aria-haspopup="dialog"
                  aria-expanded={confirming?.user_id === row.user_id}
                  onClick={() => setConfirming(row)}
                >
                  سحب الاعتماد
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* أثر السحب يُعرض قبل الضغط لا بعده */}
      {confirming && (
        <div
          role="alertdialog"
          aria-labelledby="revoke-title"
          className="mt-4 rounded-2xl border-2 border-bridge-bright/50 bg-card p-5"
        >
          <h3 id="revoke-title" className="flex items-center gap-2 font-bold text-bridge-ink">
            <TriangleAlert className="size-4" aria-hidden="true" />
            سحب اعتماد {confirming.email}
          </h3>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            {confirming.assignments > 0 ? (
              <>
                سيُنهى إشرافه على <strong>{confirming.assignments}</strong> مستفيداً، وتقف برامجهم
                عن التقدّم حتى يُسنَد لهم مشرفٌ غيره. وإبقاء اعتمادٍ منزوعٍ على الورق قائماً في
                الواقع أسوأ من ذلك.
              </>
            ) : (
              "لا يُشرف على أحدٍ الآن، فالسحب لا يوقف برنامجاً."
            )}
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
              تأكيد السحب
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
