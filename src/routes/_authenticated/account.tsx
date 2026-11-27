import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { serverAuthMethods, type AuthMethods } from "@/lib/auth-methods";
import { toast } from "sonner";
import {
  Bell,
  Check,
  ChevronLeft,
  Fingerprint,
  HandHeart,
  LayoutGrid,
  Loader2,
  LogOut,
  Mail,
  Pencil,
  Smartphone,
  Trash2,
} from "lucide-react";

import { DashboardShell } from "@/components/DashboardShell";
import { MfaSettings } from "@/components/account/MfaSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { wipeBrowserUserData } from "@/lib/client-state";
import {
  addPasskey,
  listPasskeys,
  passkeySupported,
  removePasskey,
  renamePasskey,
} from "@/lib/passkey";
import { pageTitle } from "@/config/brand";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [{ title: pageTitle("حسابي", false) }, { name: "robots", content: "noindex" }],
  }),
  component: AccountPage,
});

const fmtDate = (iso: string | undefined) =>
  iso
    ? new Intl.DateTimeFormat("ar-u-nu-latn", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(iso))
    : "";

/**
 * حسابي — ثلاثة أشياء فقط: من أنا، وكيف أدخل، وإلى أين أذهب.
 * كل حقلٍ يُعدَّل في مكانه ويُحفظ مباشرة، بلا صفحة «تعديل» منفصلة.
 */
function AccountPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canPasskey, setCanPasskey] = useState(false);
  useEffect(() => setCanPasskey(passkeySupported()), []);

  const fullName = String(user?.user_metadata?.["full_name"] ?? "").trim();
  useEffect(() => setName(fullName), [fullName]);

  const { data: passkeys = [], isPending: loadingKeys } = useQuery({
    queryKey: ["passkeys", user?.id],
    queryFn: listPasskeys,
    enabled: !!user,
  });

  const initials =
    (fullName || user?.email || "؟")
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("") || "؟";
  const google = user?.identities?.some((i) => i.provider === "google");
  // طرق الدخول كما يفعّلها الخادم: لا يُعرض طريقٌ معطّل يفشل عند الضغط.
  const [methods, setMethods] = useState<AuthMethods | null>(null);
  useEffect(() => {
    let live = true;
    void serverAuthMethods().then((m) => live && setMethods(m));
    return () => {
      live = false;
    };
  }, []);

  async function saveName() {
    if (name.trim() === fullName) return setEditing(false);
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    setSaving(false);
    if (error) {
      toast.error("تعذّر الحفظ");
      return;
    }
    setEditing(false);
    toast.success("حُفظ اسمك");
  }

  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  async function add() {
    setAdding(true);
    const r = await addPasskey("ar");
    setAdding(false);
    if (!r.ok) {
      if (r.why === "duplicate") toast.success("هذا الجهاز يحمل بصمةً لحسابك من قبل.");
      else if (r.why === "disabled")
        toast.error(
          r.source === "client"
            ? "البصمة معطّلة في نسخة الموقع المنشورة. انشر آخر تحديث ثم أعد تحميل الصفحة."
            : "البصمة غير مفعّلة في إعدادات المصادقة على الخادم (Supabase).",
        );
      else if (r.why !== "cancelled") toast.error("تعذّرت إضافة البصمة.");
      return;
    }
    toast.success("أُضيفت البصمة");
    await qc.invalidateQueries({ queryKey: ["passkeys"] });
  }

  async function rename() {
    if (!renaming) return;
    const name = renaming.name.trim();
    const current = passkeys.find((k) => k.id === renaming.id)?.friendly_name ?? "";
    setRenaming(null);
    if (!name || name === current) return;
    const { error } = await renamePasskey(renaming.id, name);
    if (error) {
      toast.error("تعذّرت إعادة التسمية");
      return;
    }
    await qc.invalidateQueries({ queryKey: ["passkeys"] });
  }

  async function remove(id: string) {
    const { error } = await removePasskey(id);
    if (error) {
      toast.error("تعذّر الحذف");
      return;
    }
    toast.success("حُذفت البصمة من حسابك");
    await qc.invalidateQueries({ queryKey: ["passkeys"] });
  }

  return (
    <DashboardShell title="حسابي" description="من أنت، وكيف تدخل، وإلى أين تذهب.">
      <div className="max-w-2xl space-y-6 py-2">
        {/* ── من أنا ── */}
        <section className="stagger-in relative overflow-hidden rounded-3xl bg-card p-6 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_-1px_rgb(0_0_0/0.06),0_2px_4px_0_rgb(0_0_0/0.04)] sm:p-8">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(120%_100%_at_100%_0%,var(--color-thrive-tint),transparent_70%)]"
          />
          <div className="relative flex items-center gap-4">
            <span className="grid size-16 shrink-0 place-items-center rounded-full bg-primary font-serif text-2xl font-bold text-primary-foreground ring-4 ring-bridge/30">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              {editing ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveName();
                  }}
                  className="flex gap-2"
                >
                  <Input
                    autoFocus
                    aria-label="الاسم"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && (setName(fullName), setEditing(false))}
                    className="h-10 text-base"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="size-10"
                    aria-label="حفظ"
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="animate-spin" /> : <Check />}
                  </Button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="group flex max-w-full items-center gap-2 text-start"
                >
                  <h1 className="truncate text-2xl font-extrabold">{fullName || "أضف اسمك"}</h1>
                  <Pencil
                    className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-100"
                    aria-label="تعديل الاسم"
                  />
                </button>
              )}
              <p className="mt-1 truncate text-sm text-muted-foreground">
                <bdi dir="ltr">{user?.email ?? user?.phone}</bdi>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                معنا منذ {fmtDate(user?.created_at)}
              </p>
            </div>
          </div>
        </section>

        {/* ── كيف أدخل ── */}
        <section
          className="stagger-in rounded-3xl bg-card p-6 shadow-[0_0_0_1px_rgb(0_0_0/0.06)] sm:p-8"
          style={{ ["--i" as string]: 1 }}
          aria-labelledby="signin-h"
        >
          <h2 id="signin-h" className="font-bold">
            طرق الدخول
          </h2>
          <ul className="mt-4 divide-y divide-border">
            {user?.email && <Row icon={<Mail />} title="رمزٌ إلى البريد" text={user.email} on />}
            {user?.phone && (
              <Row icon={<Smartphone />} title="رمزٌ إلى الجوال" text={user.phone} on />
            )}
            {(google || methods?.google === true) && (
              <Row
                icon={<span className="text-sm font-bold">G</span>}
                title="حساب جوجل"
                text={google ? "مربوط" : "غير مربوط — ادخل بجوجل مرّةً ليُربط"}
                on={!!google}
              />
            )}
          </ul>

          {/* البصمة حين يفعّلها الخادم، أو لمن له بصمةٌ مسجّلة يديرها */}
          {(methods?.passkey === true || passkeys.length > 0) && (
            <div className="mt-6 rounded-2xl bg-secondary/60 p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <Fingerprint className="size-5" strokeWidth={1.5} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">البصمة</p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    دخولٌ بالوجه أو الإصبع أو قفل الجهاز. بصمتك لا تغادر جهازك.
                  </p>
                </div>
              </div>
              {loadingKeys ? (
                <p className="mt-3 text-sm text-muted-foreground">…</p>
              ) : passkeys.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {passkeys.map((k) => (
                    <li
                      key={k.id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-card px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        {renaming?.id === k.id ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              void rename();
                            }}
                            className="flex gap-2"
                          >
                            <Input
                              autoFocus
                              aria-label="اسم البصمة"
                              maxLength={120}
                              value={renaming.name}
                              onChange={(e) => setRenaming({ id: k.id, name: e.target.value })}
                              onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                              onBlur={() => void rename()}
                              className="h-9 text-sm"
                            />
                            <Button type="submit" size="icon" className="size-9" aria-label="حفظ">
                              <Check />
                            </Button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setRenaming({ id: k.id, name: k.friendly_name ?? "" })}
                            className="group flex max-w-full items-center gap-2 text-start"
                            aria-label={`إعادة تسمية ${k.friendly_name || "البصمة"}`}
                          >
                            <span className="truncate text-sm font-medium">
                              {k.friendly_name || "بصمة"}
                            </span>
                            <Pencil
                              className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-100"
                              aria-hidden="true"
                            />
                          </button>
                        )}
                        <p className="text-xs text-muted-foreground">
                          أُضيفت {fmtDate(k.created_at)}
                          {k.last_used_at ? ` · آخر استعمال ${fmtDate(k.last_used_at)}` : ""}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`حذف ${k.friendly_name || "البصمة"}`}
                        onClick={() => void remove(k.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {canPasskey ? (
                <Button className="mt-3" disabled={adding} onClick={() => void add()}>
                  {adding ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Fingerprint aria-hidden="true" />
                  )}
                  {adding
                    ? "أكّد هويتك على جهازك…"
                    : passkeys.length
                      ? "أضف بصمة هذا الجهاز"
                      : "أضف بصمتي"}
                </Button>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">هذا المتصفّح لا يدعم البصمة.</p>
              )}
            </div>
          )}
        </section>

        {/* ── المصادقة الثنائية ── */}
        <MfaSettings />

        {/* ── إلى أين ── */}
        <nav
          aria-label="اختصارات"
          className="stagger-in overflow-hidden rounded-3xl bg-card shadow-[0_0_0_1px_rgb(0_0_0/0.06)]"
          style={{ ["--i" as string]: 2 }}
        >
          {(
            [
              ["/dashboard", "كفالاتي", "من تكفل، وآخر ما وصلهم", HandHeart],
              ["/workspaces", "بواباتي", "كل ما لك صلاحيةٌ عليه", LayoutGrid],
              ["/settings/notifications", "الإشعارات", "ما يصلك، ومتى", Bell],
            ] as const
          ).map(([to, title, text, Icon]) => (
            <Link
              key={to}
              to={to}
              className="flex min-h-16 items-center gap-4 border-b border-border px-6 transition-colors last:border-0 hover:bg-secondary/50"
            >
              <Icon className="size-5 text-primary" strokeWidth={1.5} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{title}</span>
                <span className="block text-xs text-muted-foreground">{text}</span>
              </span>
              <ChevronLeft
                className="size-4 text-muted-foreground ltr:-scale-x-100"
                aria-hidden="true"
              />
            </Link>
          ))}
        </nav>

        <div className="flex justify-center pb-6">
          <Button
            variant="ghost"
            className="text-muted-foreground"
            onClick={async () => {
              // يُمحى ما في المتصفّح قبل الخروج نفسه: الجهاز قد يكون مشتركاً (UX-05).
              wipeBrowserUserData();
              await supabase.auth.signOut();
              await navigate({ to: "/" });
            }}
          >
            <LogOut aria-hidden="true" />
            تسجيل الخروج
          </Button>
        </div>
      </div>
    </DashboardShell>
  );
}

function Row({
  icon,
  title,
  text,
  on,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  on: boolean;
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-muted-foreground [&_svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <bdi className="block truncate text-xs text-muted-foreground">{text}</bdi>
      </span>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-xs font-medium",
          on ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground",
        )}
      >
        {on ? "مفعّل" : "—"}
      </span>
    </li>
  );
}
