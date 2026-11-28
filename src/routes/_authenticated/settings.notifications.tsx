import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, BellRing, MailX, TriangleAlert } from "lucide-react";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { BRAND, brandFor } from "@/config/brand";
import { DashboardShell } from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  getNotificationPrefs,
  saveNotificationPrefs,
  MUTABLE_KINDS,
} from "@/lib/notification-prefs.functions";

const COPY = defineCopy("routes/settings.notifications", {
  ar: {
    title: "تفضيلات الإشعارات",
    description: "أنت تقرّر ما يصل بريدك. وما توقفه هنا يبقى ظاهراً لك داخل المنصّة.",
    loading: "جارٍ تحميل تفضيلاتك…",
    loadError: "تعذّر تحميل تفضيلاتك. لم يتغيّر شيء منها.",
    retry: "أعد المحاولة",
    saveError: "تعذّر الحفظ. أعد المحاولة بعد قليل.",
    saved: "حُفظت تفضيلاتك",
    all: (b: string) => `استقبال البريد من ${b}`,
    allHint: "إيقافه يوقف كل رسائل البريد بلا استثناء، بما فيها إيصالات الدفع وتنبيهات تعثّره.",
    offNote:
      "البريد موقوف. ستبقى الإشعارات ظاهرة داخل المنصّة، لكن لن يصلك خبرٌ خارجها، ومنها تعثّر دفعةٍ قد يُنهي كفالتك.",
    someTitle: "وإن أردت بعضه لا كلّه",
    someHint: "اختر ما يصل بريدك من الأنواع. المعطَّل منها يبقى في جرس الإشعارات.",
    stopAll: "أوقف كل البريد",
    kinds: {} as Record<string, { label: string; hint: string }>,
  },
  en: {
    title: "Notification preferences",
    description:
      "You decide what reaches your inbox. Anything you stop here stays visible inside the platform.",
    loading: "Loading your preferences…",
    loadError: "Your preferences couldn't be loaded. Nothing was changed.",
    retry: "Try again",
    saveError: "Couldn't save. Please try again shortly.",
    saved: "Your preferences are saved",
    all: (b: string) => `Receive email from ${b}`,
    allHint:
      "Turning it off stops every email without exception, including payment receipts and failure alerts.",
    offNote:
      "Email is off. Notifications stay visible inside the platform, but nothing reaches you outside it, including a failed payment that could end your sponsorship.",
    someTitle: "Or keep only some of it",
    someHint: "Choose which kinds reach your inbox. Disabled kinds stay in the notification bell.",
    stopAll: "Stop all email",
    kinds: {
      report_published: {
        label: "Impact reports",
        hint: "When a periodic report is published for a file you sponsor",
      },
      payment_succeeded: {
        label: "Payment receipts",
        hint: "Confirmation of each successful monthly payment",
      },
      payment_failed: {
        label: "Failed payments",
        hint: "When a payment doesn't go through; muting it could end your sponsorship unnoticed",
      },
      pledge_delivered: {
        label: "In-kind and training delivered",
        hint: "When the office delivers your gift with a verified document",
      },
      pledge_preparing: {
        label: "In-kind and training in preparation",
        hint: "When the office starts preparing your gift",
      },
      sponsorship_started: {
        label: "Sponsorship started",
        hint: "When a new sponsorship becomes active",
      },
      orphan_approved: {
        label: "File approvals",
        hint: "For field teams: the admin's decision on a file you uploaded",
      },
      orphan_rejected: {
        label: "Files returned for correction",
        hint: "For field teams: a file that needs changes",
      },
    } as Record<string, { label: string; hint: string }>,
  },
});

export const Route = createFileRoute("/_authenticated/settings/notifications")({
  head: () => ({
    meta: [{ title: `تفضيلات الإشعارات | ${BRAND.name}` }, { name: "robots", content: "noindex" }],
  }),
  component: NotificationSettingsPage,
});

function NotificationSettingsPage() {
  const queryClient = useQueryClient();
  const load = useServerFn(getNotificationPrefs);
  const save = useServerFn(saveNotificationPrefs);

  const t = useCopy(COPY);
  const brand = brandFor(useLocale());
  const { data, isPending, isError, refetch } = useQuery({
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
        toast.error(t.saveError);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["notification-prefs"] });
      toast.success(t.saved);
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
    <DashboardShell title={t.title} description={t.description}>
      {isPending ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t.loading}
        </div>
      ) : isError ? (
        <div
          role="alert"
          className="max-w-2xl space-y-3 rounded-2xl border border-destructive/40 bg-card p-5"
        >
          <p className="flex items-start gap-2 text-sm leading-7">
            <TriangleAlert className="mt-1 size-4 shrink-0 text-destructive" aria-hidden="true" />
            {t.loadError}
          </p>
          <Button variant="outline" className="min-h-11" onClick={() => void refetch()}>
            {t.retry}
          </Button>
        </div>
      ) : (
        <div className="max-w-2xl space-y-6">
          {/* المفتاح الشامل */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="email-all" className="flex items-center gap-2 text-base font-bold">
                  <BellRing className="size-4 text-primary" aria-hidden="true" />
                  {t.all(brand.name)}
                </Label>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">{t.allHint}</p>
              </div>
              <Switch
                id="email-all"
                checked={emailEnabled}
                disabled={saving}
                onCheckedChange={toggleAll}
                aria-label={t.all(brand.name)}
              />
            </div>

            {!emailEnabled && (
              <p
                role="status"
                className="mt-4 flex items-start gap-2 rounded-xl bg-bridge-bright/12 p-3 text-sm leading-7 text-bridge-ink"
              >
                <TriangleAlert className="mt-1 size-4 shrink-0" aria-hidden="true" />
                <span>{t.offNote}</span>
              </p>
            )}
          </section>

          {/* الكتم الدقيق */}
          <section
            className={`rounded-2xl border border-border bg-card p-5 ${
              emailEnabled ? "" : "opacity-55"
            }`}
          >
            <h2 className="font-bold">{t.someTitle}</h2>
            <p className="mt-1 text-sm leading-7 text-muted-foreground">{t.someHint}</p>

            <ul className="mt-5 divide-y divide-border">
              {MUTABLE_KINDS.map((item) => {
                const on = !muted.includes(item.kind);
                const label = t.kinds[item.kind] ?? item;
                return (
                  <li key={item.kind} className="flex items-start justify-between gap-4 py-4">
                    <div>
                      <Label htmlFor={`k-${item.kind}`} className="font-medium">
                        {label.label}
                      </Label>
                      <p className="mt-1 text-xs leading-6 text-muted-foreground">{label.hint}</p>
                    </div>
                    <Switch
                      id={`k-${item.kind}`}
                      checked={on && emailEnabled}
                      disabled={saving || !emailEnabled}
                      onCheckedChange={(next) => toggleKind(item.kind, next)}
                      aria-label={label.label}
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
              className="min-h-11 gap-2"
            >
              <MailX className="size-4" aria-hidden="true" />
              {t.stopAll}
            </Button>
          )}
        </div>
      )}
    </DashboardShell>
  );
}
