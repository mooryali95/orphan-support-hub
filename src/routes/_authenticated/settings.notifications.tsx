import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, BellRing, MailX, TriangleAlert } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  getNotificationPrefs,
  saveNotificationPrefs,
  MUTABLE_KINDS,
} from "@/lib/notification-prefs.functions";

const TITLE = "تفضيلات الإشعارات — IOCO";

export const Route = createFileRoute("/_authenticated/settings/notifications")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: "تحكّم في البريد الذي يصلك من IOCO." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotificationSettingsPage,
});

function NotificationSettingsPage() {
  const queryClient = useQueryClient();
  const load = useServerFn(getNotificationPrefs);
  const save = useServerFn(saveNotificationPrefs);

  const { data, isPending } = useQuery({
    queryKey: ["notification-prefs"],
    queryFn: () => load(),
  });

  const [emailEnabled, setEmailEnabled] = useState(true);
  const [muted, setMuted] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // الحالة المحلّية تُبذَر من الخادم مرّةً عند وصولها، ثم يملكها المستخدم.
  useEffect(() => {
    if (data?.prefs) {
      setEmailEnabled(data.prefs.email_enabled);
      setMuted(data.prefs.muted_kinds);
    }
  }, [data]);

  async function persist(nextEnabled: boolean, nextMuted: string[]) {
    setSaving(true);
    try {
      const res = await save({ data: { emailEnabled: nextEnabled, mutedKinds: nextMuted } });
      if (!res.ok) {
        toast.error(res.error ?? "تعذّر الحفظ");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["notification-prefs"] });
      toast.success("حُفظت تفضيلاتك");
    } finally {
      setSaving(false);
    }
  }

  function toggleKind(kind: string, on: boolean) {
    // المفتاح يعرض «يصلني»، والتخزين يحفظ «المكتوم» — فالمعنى معكوس.
    const next = on ? muted.filter((k) => k !== kind) : [...new Set([...muted, kind])];
    setMuted(next);
    void persist(emailEnabled, next);
  }

  function toggleAll(on: boolean) {
    setEmailEnabled(on);
    void persist(on, muted);
  }

  return (
    <DashboardShell
      title="تفضيلات الإشعارات"
      description="أنت تقرّر ما يصل بريدك. وما توقفه هنا يبقى ظاهراً لك داخل المنصّة."
    >
      {isPending ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          جارٍ تحميل تفضيلاتك…
        </div>
      ) : (
        <div className="max-w-2xl space-y-6">
          {/* المفتاح الشامل */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="email-all" className="flex items-center gap-2 text-base font-bold">
                  <BellRing className="size-4 text-primary" aria-hidden="true" />
                  استقبال البريد من IOCO
                </Label>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  إيقافه يوقف <strong>كل</strong> رسائل البريد بلا استثناء — بما فيها إيصالات الدفع
                  وتنبيهات تعثّره.
                </p>
              </div>
              <Switch
                id="email-all"
                checked={emailEnabled}
                disabled={saving}
                onCheckedChange={toggleAll}
                aria-label="استقبال البريد من IOCO"
              />
            </div>

            {!emailEnabled && (
              <p
                role="status"
                className="mt-4 flex items-start gap-2 rounded-xl bg-bridge-bright/12 p-3 text-sm leading-7 text-bridge-ink"
              >
                <TriangleAlert className="mt-1 size-4 shrink-0" aria-hidden="true" />
                <span>
                  البريد موقوف. ستبقى الإشعارات ظاهرة داخل المنصّة، لكن لن يصلك خبرٌ خارجها — ومنها
                  تعثّر دفعةٍ قد يُنهي كفالتك.
                </span>
              </p>
            )}
          </section>

          {/* الكتم الدقيق */}
          <section
            className={`rounded-2xl border border-border bg-card p-5 ${
              emailEnabled ? "" : "opacity-55"
            }`}
          >
            <h2 className="font-bold">وإن أردت بعضه لا كلّه</h2>
            <p className="mt-1 text-sm leading-7 text-muted-foreground">
              اختر ما يصل بريدك من الأنواع. المعطَّل منها يبقى في جرس الإشعارات.
            </p>

            <ul className="mt-5 divide-y divide-border">
              {MUTABLE_KINDS.map((item) => {
                const on = !muted.includes(item.kind);
                return (
                  <li key={item.kind} className="flex items-start justify-between gap-4 py-4">
                    <div>
                      <Label htmlFor={`k-${item.kind}`} className="font-medium">
                        {item.label}
                      </Label>
                      <p className="mt-1 text-xs leading-6 text-muted-foreground">{item.hint}</p>
                    </div>
                    <Switch
                      id={`k-${item.kind}`}
                      checked={on && emailEnabled}
                      disabled={saving || !emailEnabled}
                      onCheckedChange={(next) => toggleKind(item.kind, next)}
                      aria-label={item.label}
                    />
                  </li>
                );
              })}
            </ul>
          </section>

          {emailEnabled && (
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => toggleAll(false)}
              className="gap-2"
            >
              <MailX className="size-4" aria-hidden="true" />
              أوقف كل البريد
            </Button>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
