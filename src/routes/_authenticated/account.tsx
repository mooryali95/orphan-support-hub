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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { copyOf, defineCopy, useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

const COPY = defineCopy("routes/account", {
  ar: {
    title: "حسابي",
    description: "من أنت، وكيف تدخل، وإلى أين تذهب.",
    saveFailed: "تعذّر الحفظ",
    nameSaved: "حُفظ اسمك",
    passkeyDuplicate: "هذا الجهاز يحمل بصمةً لحسابك من قبل.",
    passkeyDisabledClient:
      "البصمة معطّلة في نسخة الموقع المنشورة. انشر آخر تحديث ثم أعد تحميل الصفحة.",
    passkeyDisabledServer: "البصمة غير مفعّلة في إعدادات المصادقة على الخادم (Supabase).",
    passkeyAddFailed: "تعذّرت إضافة البصمة.",
    passkeyAdded: "أُضيفت البصمة",
    renameFailed: "تعذّرت إعادة التسمية",
    removeFailed: "تعذّر الحذف",
    removed: "حُذفت البصمة من حسابك",
    name: "الاسم",
    save: "حفظ",
    addName: "أضف اسمك",
    editName: "تعديل الاسم",
    since: (d: string) => `معنا منذ ${d}`,
    signInMethods: "طرق الدخول",
    emailCode: "رمزٌ إلى البريد",
    phoneCode: "رمزٌ إلى الجوال",
    google: "حساب جوجل",
    linked: "مربوط",
    notLinked: "غير مربوط. ادخل بجوجل مرّةً ليُربط",
    passkey: "البصمة",
    passkeyText: "دخولٌ بالوجه أو الإصبع أو قفل الجهاز. بصمتك لا تغادر جهازك.",
    passkeyName: "اسم البصمة",
    passkeyFallback: "البصمة",
    passkeyShort: "بصمة",
    rename: (n: string) => `إعادة تسمية ${n}`,
    remove: (n: string) => `حذف ${n}`,
    added: (d: string) => `أُضيفت ${d}`,
    lastUsed: (d: string) => ` · آخر استعمال ${d}`,
    confirming: "أكّد هويتك على جهازك…",
    addThis: "أضف بصمة هذا الجهاز",
    addMine: "أضف بصمتي",
    noPasskey: "هذا المتصفّح لا يدعم البصمة.",
    shortcuts: "اختصارات",
    sponsorships: "كفالاتي",
    sponsorshipsText: "من تكفل، وآخر ما وصلهم",
    workspaces: "بواباتي",
    workspacesText: "كل ما لك صلاحيةٌ عليه",
    notifications: "الإشعارات",
    notificationsText: "ما يصلك، ومتى",
    signOut: "تسجيل الخروج",
    on: "مفعّل",
    off: "غير مفعّل",
    confirmRemoveTitle: (n: string) => `أتحذف ${n}؟`,
    confirmRemoveText: "لن تدخل بهذه البصمة بعد الحذف، ويمكنك إضافتها من جديد متى شئت.",
    cancel: "إلغاء",
    confirmRemove: "نعم، احذفها",
  },
  en: {
    title: "My account",
    description: "Who you are, how you sign in, and where to go.",
    saveFailed: "Couldn't save",
    nameSaved: "Your name was saved",
    passkeyDuplicate: "This device already holds a passkey for your account.",
    passkeyDisabledClient:
      "Passkeys are off in the published site. Publish the latest update, then reload the page.",
    passkeyDisabledServer: "Passkeys aren't enabled in the server's auth settings (Supabase).",
    passkeyAddFailed: "Couldn't add the passkey.",
    passkeyAdded: "Passkey added",
    renameFailed: "Couldn't rename",
    removeFailed: "Couldn't remove",
    removed: "The passkey was removed from your account",
    name: "Name",
    save: "Save",
    addName: "Add your name",
    editName: "Edit name",
    since: (d: string) => `With us since ${d}`,
    signInMethods: "Ways to sign in",
    emailCode: "Code to your email",
    phoneCode: "Code to your phone",
    google: "Google account",
    linked: "Linked",
    notLinked: "Not linked. Sign in with Google once to link it",
    passkey: "Passkey",
    passkeyText:
      "Sign in with your face, finger or device lock. Your passkey never leaves your device.",
    passkeyName: "Passkey name",
    passkeyFallback: "the passkey",
    passkeyShort: "Passkey",
    rename: (n: string) => `Rename ${n}`,
    remove: (n: string) => `Remove ${n}`,
    added: (d: string) => `Added ${d}`,
    lastUsed: (d: string) => ` · last used ${d}`,
    confirming: "Confirm it's you on your device…",
    addThis: "Add this device's passkey",
    addMine: "Add my passkey",
    noPasskey: "This browser doesn't support passkeys.",
    shortcuts: "Shortcuts",
    sponsorships: "My sponsorships",
    sponsorshipsText: "Who you sponsor, and what reached them lately",
    workspaces: "My workspaces",
    workspacesText: "Everything you have access to",
    notifications: "Notifications",
    notificationsText: "What reaches you, and when",
    signOut: "Sign out",
    on: "On",
    off: "Off",
    confirmRemoveTitle: (n: string) => `Remove ${n}?`,
    confirmRemoveText:
      "You will no longer sign in with this passkey. You can add it again at any time.",
    cancel: "Cancel",
    confirmRemove: "Yes, remove it",
  },
});

export const Route = createFileRoute("/_authenticated/account")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(copyOf(COPY, l).title, false, l) },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: AccountPage,
});

const fmtDate = (iso: string | undefined, locale = "ar") =>
  iso
    ? new Intl.DateTimeFormat(locale === "ar" ? "ar-u-nu-latn" : locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(iso))
    : "";

/**
 * حسابي: ثلاثة أشياء فقط: من أنا، وكيف أدخل، وإلى أين أذهب.
 * كل حقلٍ يُعدَّل في مكانه ويُحفظ مباشرة، بلا صفحة «تعديل» منفصلة.
 */
function AccountPage() {
  const { user } = useAuth();
  const c = useCopy(COPY);
  const locale = useLocale();
  const fmt = (iso: string | undefined) => fmtDate(iso, locale);
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
      toast.error(c.saveFailed);
      return;
    }
    setEditing(false);
    toast.success(c.nameSaved);
  }

  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  async function add() {
    setAdding(true);
    const r = await addPasskey(locale);
    setAdding(false);
    if (!r.ok) {
      if (r.why === "duplicate") toast.success(c.passkeyDuplicate);
      else if (r.why === "disabled")
        toast.error(r.source === "client" ? c.passkeyDisabledClient : c.passkeyDisabledServer);
      else if (r.why !== "cancelled") toast.error(c.passkeyAddFailed);
      return;
    }
    toast.success(c.passkeyAdded);
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
      toast.error(c.renameFailed);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["passkeys"] });
  }

  async function remove(id: string) {
    const { error } = await removePasskey(id);
    if (error) {
      toast.error(c.removeFailed);
      return;
    }
    toast.success(c.removed);
    await qc.invalidateQueries({ queryKey: ["passkeys"] });
  }

  return (
    <DashboardShell title={c.title} description={c.description}>
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
                    aria-label={c.name}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && (setName(fullName), setEditing(false))}
                    className="h-11 text-base"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="size-11"
                    aria-label={c.save}
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="animate-spin" /> : <Check />}
                  </Button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="group flex min-h-11 max-w-full items-center gap-2 rounded-lg text-start"
                >
                  <span className="sr-only">{c.editName}: </span>
                  <h1 className="truncate text-2xl font-extrabold">{fullName || c.addName}</h1>
                  <Pencil
                    className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                    aria-hidden="true"
                  />
                </button>
              )}
              <p className="mt-1 truncate text-sm text-muted-foreground">
                <bdi dir="ltr">{user?.email ?? user?.phone}</bdi>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {c.since(fmt(user?.created_at))}
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
            {c.signInMethods}
          </h2>
          <ul className="mt-4 divide-y divide-border">
            {user?.email && <Row icon={<Mail />} title={c.emailCode} text={user.email} on />}
            {user?.phone && <Row icon={<Smartphone />} title={c.phoneCode} text={user.phone} on />}
            {(google || methods?.google === true) && (
              <Row
                icon={<span className="text-sm font-bold">G</span>}
                title={c.google}
                text={google ? c.linked : c.notLinked}
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
                  <p className="font-semibold">{c.passkey}</p>
                  <p className="text-sm leading-6 text-muted-foreground">{c.passkeyText}</p>
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
                              aria-label={c.passkeyName}
                              maxLength={120}
                              value={renaming.name}
                              onChange={(e) => setRenaming({ id: k.id, name: e.target.value })}
                              onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                              onBlur={() => void rename()}
                              className="h-11 text-sm"
                            />
                            <Button
                              type="submit"
                              size="icon"
                              className="size-11"
                              aria-label={c.save}
                            >
                              <Check />
                            </Button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setRenaming({ id: k.id, name: k.friendly_name ?? "" })}
                            className="group flex min-h-11 max-w-full items-center gap-2 text-start"
                            aria-label={c.rename(k.friendly_name || c.passkeyFallback)}
                          >
                            <span className="truncate text-sm font-medium">
                              {k.friendly_name || c.passkeyShort}
                            </span>
                            <Pencil
                              className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                              aria-hidden="true"
                            />
                          </button>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {c.added(fmt(k.created_at))}
                          {k.last_used_at ? c.lastUsed(fmt(k.last_used_at)) : ""}
                        </p>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={c.remove(k.friendly_name || c.passkeyFallback)}
                            className="size-11 shrink-0 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {c.confirmRemoveTitle(k.friendly_name || c.passkeyFallback)}
                            </AlertDialogTitle>
                            <AlertDialogDescription>{c.confirmRemoveText}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="min-h-11">{c.cancel}</AlertDialogCancel>
                            <AlertDialogAction
                              className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => void remove(k.id)}
                            >
                              {c.confirmRemove}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </li>
                  ))}
                </ul>
              ) : null}
              {canPasskey ? (
                <Button className="mt-3 min-h-11" disabled={adding} onClick={() => void add()}>
                  {adding ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Fingerprint aria-hidden="true" />
                  )}
                  {adding ? c.confirming : passkeys.length ? c.addThis : c.addMine}
                </Button>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">{c.noPasskey}</p>
              )}
            </div>
          )}
        </section>

        {/* ── المصادقة الثنائية ── */}
        <MfaSettings />

        {/* ── إلى أين ── */}
        <nav
          aria-label={c.shortcuts}
          className="stagger-in overflow-hidden rounded-3xl bg-card shadow-[0_0_0_1px_rgb(0_0_0/0.06)]"
          style={{ ["--i" as string]: 2 }}
        >
          {(
            [
              ["/dashboard", c.sponsorships, c.sponsorshipsText, HandHeart],
              ["/workspaces", c.workspaces, c.workspacesText, LayoutGrid],
              ["/settings/notifications", c.notifications, c.notificationsText, Bell],
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
            className="min-h-11 text-muted-foreground"
            onClick={async () => {
              // يُمحى ما في المتصفّح قبل الخروج نفسه: الجهاز قد يكون مشتركاً (UX-05).
              wipeBrowserUserData();
              await supabase.auth.signOut();
              await navigate({ to: "/" });
            }}
          >
            <LogOut aria-hidden="true" />
            {c.signOut}
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
  const c = useCopy(COPY);
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
        {on ? c.on : c.off}
      </span>
    </li>
  );
}
