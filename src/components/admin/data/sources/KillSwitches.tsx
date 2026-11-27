import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Snowflake } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getSecuritySwitches, setOrphanFrozen, setSsoDisabled } from "@/lib/kill-switch.functions";
import { defineCopy, useCopy } from "@/lib/locale";
import { useErr } from "./shared";

export const KILL_COPY = defineCopy("admin/kill-switches", {
  ar: {
    ssoTitle: "الدخول من منصّة الندوة",
    ssoOn: "مفتوح: يدخل المستخدمون برابط الإطلاق من منصّة الندوة.",
    ssoOff: "موقوف: روابط الإطلاق تُرفض، والدخول المعتاد باقٍ.",
    ssoLabel: "إيقاف الدخول من منصّة الندوة",
    saved: "حُفظ.",
    freezeTitle: "تجميد الملف",
    freezeHint:
      "يوقف كل كتابةٍ من المصادر وكل كفالةٍ جديدة لهذا الطفل حتى يُرفع. الكفالات القائمة لا تُمسّ.",
    frozenNow: "مجمَّد. السبب:",
    reason: "سبب التجميد",
    freeze: "جمّد الملف",
    unfreeze: "ارفع التجميد",
  },
  en: {
    ssoTitle: "Sign-in from WAMY's platform",
    ssoOn: "Open: users sign in with launch links from WAMY's platform.",
    ssoOff: "Paused: launch links are refused; regular sign-in still works.",
    ssoLabel: "Pause sign-in from WAMY's platform",
    saved: "Saved.",
    freezeTitle: "Freeze this file",
    freezeHint:
      "Stops every source write and every new sponsorship for this child until it's lifted. Existing sponsorships are untouched.",
    frozenNow: "Frozen. Reason:",
    reason: "Reason for freezing",
    freeze: "Freeze file",
    unfreeze: "Lift freeze",
  },
});

/** مفتاح إيقاف دخول الندوة: للإدارة وحدها، فيختفي لغيرها. */
export function SsoSwitchCard() {
  const c = useCopy(KILL_COPY);
  const err = useErr();
  const qc = useQueryClient();
  const read = useServerFn(getSecuritySwitches);
  const write = useServerFn(setSsoDisabled);
  const q = useQuery({
    queryKey: ["security-switches", null],
    queryFn: () => read({ data: { orphan: null } }),
  });
  const m = useMutation({
    mutationFn: (disabled: boolean) => write({ data: { disabled } }),
    onSuccess: (res) => {
      if (!res.ok) return void toast.error(err(res.error));
      toast.success(c.saved);
      void qc.invalidateQueries({ queryKey: ["security-switches"] });
    },
  });
  if (!q.data?.ok) return null;
  const off = q.data.data.sso_disabled;
  return (
    <section className="rounded-2xl border border-border p-4" aria-labelledby="sso-switch-h">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h4 id="sso-switch-h" className="font-bold">
            {c.ssoTitle}
          </h4>
          <p className="mt-1 text-sm text-muted-foreground">{off ? c.ssoOff : c.ssoOn}</p>
        </div>
        <Switch
          aria-label={c.ssoLabel}
          checked={off}
          disabled={m.isPending}
          onCheckedChange={(v) => m.mutate(v)}
        />
      </div>
    </section>
  );
}

/** تجميد ملفّ طفلٍ من بطاقة الملف: للإدارة وحدها. */
export function FreezeControl({ id }: { id: string }) {
  const c = useCopy(KILL_COPY);
  const err = useErr();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const read = useServerFn(getSecuritySwitches);
  const write = useServerFn(setOrphanFrozen);
  const q = useQuery({
    queryKey: ["security-switches", id],
    queryFn: () => read({ data: { orphan: id } }),
  });
  const m = useMutation({
    mutationFn: (frozen: boolean) => write({ data: { orphan: id, frozen, reason } }),
    onSuccess: (res) => {
      if (!res.ok) return void toast.error(err(res.error));
      toast.success(c.saved);
      setReason("");
      void qc.invalidateQueries({ queryKey: ["security-switches", id] });
    },
  });
  if (!q.data?.ok) return null;
  const frozen = q.data.data.frozen;
  return (
    <section className="mt-4 rounded-2xl border border-border p-4" aria-labelledby="freeze-h">
      <h4 id="freeze-h" className="flex items-center gap-2 font-bold">
        <Snowflake className="size-4" aria-hidden="true" />
        {c.freezeTitle}
      </h4>
      <p className="mt-1 text-sm text-muted-foreground">{c.freezeHint}</p>
      {frozen ? (
        <>
          <p className="mt-3 text-sm">
            {c.frozenNow} <bdi dir="auto">{frozen.reason}</bdi>
          </p>
          <Button
            className="mt-3"
            variant="outline"
            disabled={m.isPending}
            onClick={() => m.mutate(false)}
          >
            {c.unfreeze}
          </Button>
        </>
      ) : (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label={c.reason}
            placeholder={c.reason}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            variant="destructive"
            disabled={m.isPending || reason.trim().length === 0}
            onClick={() => m.mutate(true)}
          >
            {c.freeze}
          </Button>
        </div>
      )}
    </section>
  );
}
