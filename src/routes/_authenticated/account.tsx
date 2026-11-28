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
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const COPY = defineCopy("routes/account", {
  ar: {
    title: "حسابي",
    description: "من أنت، وكيف تدخل، وإلى أين تذهب.",
    name: "الاسم",
    save: "حفظ",
    addName: "أضف اسمك",
    editName: "تعديل الاسم",
    since: (d: string) => `معنا منذ ${d}`,
    saveError: "تعذّر الحفظ",
    nameSaved: "حُفظ اسمك",
    dupKey: "هذا الجهاز يحمل بصمةً لحسابك من قبل.",
    disabledClient: "البصمة معطّلة في نسخة الموقع المنشورة. انشر آخر تحديث ثم أعد تحميل الصفحة.",
    disabledServer: "البصمة غير مفعّلة في إعدادات المصادقة على الخادم.",
    addError: "تعذّرت إضافة البصمة.",
    added: "أُضيفت البصمة",
    renameError: "تعذّرت إعادة التسمية",
    removeError: "تعذّر الحذف",
    removed: "حُذفت البصمة من حسابك",
    signin: "طرق الدخول",
    emailCode: "رمزٌ إلى البريد",
    phoneCode: "رمزٌ إلى الجوال",
    google: "حساب جوجل",
    linked: "مربوط",
    notLinked: "غير مربوط. ادخل بجوجل مرّةً ليُربط",
    passkey: "البصمة",
    passkeyHint: "دخولٌ بالوجه أو الإصبع أو قفل الجهاز. بصمتك لا تغادر جهازك.",
    loading: "جارٍ التحميل…",
    keyName: "اسم البصمة",
    keyFallback: "بصمة",
    rename: (n: string) => `إعادة تسمية ${n}`,
    remove: (n: string) => `حذف ${n}`,
    addedOn: (d: string) => `أُضيفت ${d}`,
    lastUsed: (d: string) => `آخر استعمال ${d}`,
    confirming: "أكّد هويتك على جهازك…",
    addThis: "أضف بصمة هذا الجهاز",
    addMine: "أضف بصمتي",
    noSupport: "هذا المتصفّح لا يدعم البصمة.",
    shortcuts: "اختصارات",
    links: [
      ["كفالاتي", "من تكفل، وآخر ما وصلهم"],
      ["بواباتي", "كل ما لك صلاحيةٌ عليه"],
      ["الإشعارات", "ما يصلك، ومتى"],
    ] as readonly (readonly [string, string])[],
    signOut: "تسجيل الخروج",
    on: "مفعّل",
    off: "غير مفعّل",
    delTitle: (n: string) => `حذف ${n}؟`,
    delBody: "لن تستطيع الدخول بهذه البصمة بعد حذفها. يمكنك إضافتها من جديد لاحقاً.",
    cancel: "إلغاء",
    delConfirm: "احذف البصمة",
  },
  en: {
    title: "My account",
    description: "Who you are, how you sign in, and where to go next.",
    name: "Name",
    save: "Save",
    addName: "Add your name",
    editName: "Edit name",
    since: (d: string) => `With us since ${d}`,
    saveError: "Could not save",
    nameSaved: "Your name was saved",
    dupKey: "This device already holds a passkey for your account.",
    disabledClient:
      "Passkeys are off in the published site. Publish the latest update, then reload.",
    disabledServer: "Passkeys are not enabled in the server sign-in settings.",
    addError: "Could not add the passkey.",
    added: "Passkey added",
    renameError: "Could not rename",
    removeError: "Could not delete",
    removed: "The passkey was removed from your account",
    signin: "Sign-in methods",
    emailCode: "Code by email",
    phoneCode: "Code by phone",
    google: "Google account",
    linked: "Linked",
    notLinked: "Not linked. Sign in with Google once to link it",
    passkey: "Passkey",
    passkeyHint:
      "Sign in with your face, finger or device lock. Your passkey never leaves your device.",
    loading: "Loading…",
    keyName: "Passkey name",
    keyFallback: "Passkey",
    rename: (n: string) => `Rename ${n}`,
    remove: (n: string) => `Delete ${n}`,
    addedOn: (d: string) => `Added ${d}`,
    lastUsed: (d: string) => `last used ${d}`,
    confirming: "Confirm it is you on your device…",
    addThis: "Add this device's passkey",
    addMine: "Add my passkey",
    noSupport: "This browser does not support passkeys.",
    shortcuts: "Shortcuts",
    links: [
      ["My sponsorships", "Who you sponsor, and their latest news"],
      ["My portals", "Everything you have access to"],
      ["Notifications", "What reaches you, and when"],
    ] as readonly (readonly [string, string])[],
    signOut: "Sign out",
    on: "On",
    off: "Off",
    delTitle: (n: string) => `Delete ${n}?`,
    delBody:
      "You will not be able to sign in with this passkey once deleted. You can add it again later.",
    cancel: "Cancel",
    delConfirm: "Delete passkey",
  },
});

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [{ title: pageTitle(COPY.ar.title, false) }, { name: "robots", content: "noindex" }],
  }),
  component: AccountPage,
});

const fmtDate = (iso: string | undefined, locale: string = "ar") =>
  iso
    ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "ar-u-nu-latn", {
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
  const t = useCopy(COPY);
  const locale = useLocale();
  const date = (iso: string | undefined) => fmtDate(iso, locale);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
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
      toast.error(t.saveError);
      return;
    }
    setEditing(false);
    toast.success(t.nameSaved);
  }

  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  async function add() {
    setAdding(true);
    const r = await addPasskey(locale);
    setAdding(false);
    if (!r.ok) {
      if (r.why === "duplicate") toast.success(t.dupKey);
      else if (r.why === "disabled")
        toast.error(r.source === "client" ? t.disabledClient : t.disabledServer);
      else if (r.why !== "cancelled") toast.error(t.addError);
      return;
    }
    toast.success(t.added);
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
      toast.error(t.renameError);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["passkeys"] });
  }

  async function remove(id: string) {
    const { error } = await removePasskey(id);
    if (error) {
      toast.error(t.removeError);
      return;
    }
    toast.success(t.removed);
    await qc.invalidateQueries({ queryKey: ["passkeys"] });
  }

  return (
    <DashboardShell title={t.title} description={t.description}>
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
                    aria-label={t.name}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && (setName(fullName), setEditing(false))}
                    className="h-11 text-base"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="size-11"
                    aria-label={t.save}
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="animate-spin" /> : <Check />}
                  </Button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="group flex min-h-11 max-w-full items-center gap-2 text-start"
                  aria-label={`${t.editName}: ${fullName || t.addName}`}
                >
                  <h1 className="truncate text-2xl font-extrabold">{fullName || t.addName}</h1>
                  <Pencil className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              )}
              <p className="mt-1 truncate text-sm text-muted-foreground">
                <bdi dir="ltr">{user?.email ?? user?.phone}</bdi>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t.since(date(user?.created_at))}
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
            {t.signin}
          </h2>
          <ul className="mt-4 divide-y divide-border">
            {user?.email && <Row icon={<Mail />} title={t.emailCode} text={user.email} on />}
            {user?.phone && <Row icon={<Smartphone />} title={t.phoneCode} text={user.phone} on />}
            {(google || methods?.google === true) && (
              <Row
                icon={<span className="text-sm font-bold">G</span>}
                title={t.google}
                text={google ? t.linked : t.notLinked}
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
                  <p className="font-semibold">{t.passkey}</p>
                  <p className="text-sm leading-6 text-muted-foreground">{t.passkeyHint}</p>
                </div>
              </div>
              {loadingKeys ? (
                <p className="mt-3 text-sm text-muted-foreground">{t.loading}</p>
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
                              aria-label={t.keyName}
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
                              aria-label={t.save}
                            >
                              <Check />
                            </Button>
                          </form>
                        ) : (
                          <span className="block truncate text-sm font-medium">
                            {k.friendly_name || t.keyFallback}
                          </span>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {t.addedOn(date(k.created_at))}
                          {k.last_used_at ? ` · ${t.lastUsed(date(k.last_used_at))}` : ""}
                        </p>
                      </div>
                      {renaming?.id !== k.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t.rename(k.friendly_name || t.keyFallback)}
                          onClick={() => setRenaming({ id: k.id, name: k.friendly_name ?? "" })}
                          className="size-11 shrink-0 text-muted-foreground"
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t.remove(k.friendly_name || t.keyFallback)}
                        onClick={() =>
                          setToDelete({ id: k.id, name: k.friendly_name || t.keyFallback })
                        }
                        className="size-11 shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
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
                  {adding ? t.confirming : passkeys.length ? t.addThis : t.addMine}
                </Button>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">{t.noSupport}</p>
              )}
            </div>
          )}
        </section>

        {/* ── المصادقة الثنائية ── */}
        <MfaSettings />

        {/* ── إلى أين ── */}
        <nav
          aria-label={t.shortcuts}
          className="stagger-in overflow-hidden rounded-3xl bg-card shadow-[0_0_0_1px_rgb(0_0_0/0.06)]"
          style={{ ["--i" as string]: 2 }}
        >
          {(
            [
              ["/dashboard", t.links[0]![0], t.links[0]![1], HandHeart],
              ["/workspaces", t.links[1]![0], t.links[1]![1], LayoutGrid],
              ["/settings/notifications", t.links[2]![0], t.links[2]![1], Bell],
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
            {t.signOut}
          </Button>
        </div>
      </div>
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.delTitle(toDelete?.name ?? t.keyFallback)}</AlertDialogTitle>
            <AlertDialogDescription>{t.delBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (toDelete) void remove(toDelete.id);
                setToDelete(null);
              }}
            >
              {t.delConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  const t = useCopy(COPY);
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
        {on ? t.on : t.off}
      </span>
    </li>
  );
}
