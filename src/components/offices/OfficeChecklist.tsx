import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, ShieldAlert } from "lucide-react";

import { formatDate } from "@/lib/format";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import type { OfficeDashboard } from "@/lib/workspaces.functions";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/offices/OfficeChecklist", {
  ar: {
    title: "بدء تشغيل المكتب",
    text: "ما يلزم قبل أن يعمل المكتب كاملاً. ما تقرّره الإدارة مُعلَّمٌ بذلك؛ وما عداه من المكتب نفسه.",
    done: "تمّ",
    pending: "لم يتمّ بعد",
    byAdmin: "من الإدارة",
    byOffice: "من المكتب",
    members: "أعضاء المكتب مُسنَدون",
    membersN: (n: number) => `${n} أعضاء`,
    noMembers: "لا أعضاء بعد",
    platform: "منصّة التشغيل مربوطة بجهتها",
    noPlatform: "لا منصّة تشغيلٍ لهذه الدولة بعد",
    apiKey: "مفتاح المزامنة صادر",
    sync: "أوّل مزامنةٍ ناجحة",
    syncAt: (d: string) => `آخر مزامنة ${d}`,
    syncError: "آخر مزامنة أخفقت — راجع الإدارة",
    groups: "المجموعات ظاهرة في المنصّة",
    orphans: "ملفّاتٌ معتمدة في الدليل",
    report: "أوّل تقريرٍ للداعمين",
    allDone: "المكتب جاهزٌ للعمل.",
    admin: "الإدارة",
  },
  en: {
    title: "Office setup",
    text: "What the office needs before it runs fully. Items for the administration are marked; the rest is done here.",
    done: "Done",
    pending: "Not yet",
    byAdmin: "Administration",
    byOffice: "This office",
    members: "Office members assigned",
    membersN: (n: number) => `${n} members`,
    noMembers: "No members yet",
    platform: "Operating platform linked to its organization",
    noPlatform: "No operating platform for this country yet",
    apiKey: "Sync key issued",
    sync: "First successful sync",
    syncAt: (d: string) => `Last sync ${d}`,
    syncError: "The last sync failed — ask the administration",
    groups: "Groups visible on the platform",
    orphans: "Approved files in the directory",
    report: "First report for supporters",
    allDone: "The office is ready.",
    admin: "Administration",
  },
});

/**
 * قائمة بدء التشغيل: حقائق من `office_dashboard` تُقرأ كخطوات، فيعرف
 * المكتب الجديد — مكتب ألبانيا أوّلاً — ما تمّ وما ينتظر ومن يملك قراره.
 * تختفي حين يكتمل كلّ شيء.
 */
export function OfficeChecklist({ d, isAdmin }: { d: OfficeDashboard; isAdmin: boolean }) {
  const t = useCopy(COPY);
  const locale = useLocale();
  const p = d.platform;
  const items: Array<{ key: string; label: string; done: boolean; admin: boolean; hint?: string }> =
    [
      {
        key: "members",
        label: t.members,
        done: d.members > 0,
        admin: true,
        hint: d.members > 0 ? t.membersN(d.members) : t.noMembers,
      },
      {
        key: "platform",
        label: t.platform,
        done: !!p?.org_linked,
        admin: true,
        ...(p ? {} : { hint: t.noPlatform }),
      },
      { key: "apiKey", label: t.apiKey, done: !!p?.api_key_issued, admin: true },
      {
        key: "sync",
        label: t.sync,
        done: !!p?.last_sync_at && !p.has_error,
        admin: true,
        ...(p?.has_error
          ? { hint: isAdmin && p.last_error ? p.last_error : t.syncError }
          : p?.last_sync_at
            ? { hint: t.syncAt(formatDate(p.last_sync_at, locale)) }
            : {}),
      },
      { key: "groups", label: t.groups, done: d.groups > 0, admin: false },
      { key: "orphans", label: t.orphans, done: d.orphans > 0, admin: false },
      {
        key: "report",
        label: t.report,
        done: d.reports.published + d.reports.submitted > 0,
        admin: false,
      },
    ];
  const remaining = items.filter((i) => !i.done).length;
  if (remaining === 0) return null;

  return (
    <section
      aria-labelledby="office-checklist"
      className="mt-8 rounded-2xl border border-border bg-background p-5"
    >
      <h2 id="office-checklist" className="text-lg font-bold">
        {t.title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t.text}</p>
      <ol className="mt-4 space-y-2">
        {items.map((it) => (
          <li
            key={it.key}
            className={cn(
              "flex items-start gap-3 rounded-xl px-3 py-2",
              it.done ? "text-muted-foreground" : "bg-secondary/50",
            )}
          >
            {it.done ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            ) : it.hint && it.key === "sync" && p?.has_error ? (
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-shore-need" aria-hidden="true" />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            )}
            <span className="flex-1">
              <span className={cn("text-sm", it.done && "line-through")}>{it.label}</span>
              <span className="sr-only">: {it.done ? t.done : t.pending}</span>
              {it.hint && (
                <span className="mt-0.5 block text-xs text-muted-foreground" dir="auto">
                  {it.hint}
                </span>
              )}
            </span>
            <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
              {it.admin ? (
                isAdmin ? (
                  <Link to="/admin" className="underline">
                    {t.byAdmin}
                  </Link>
                ) : (
                  t.byAdmin
                )
              ) : (
                t.byOffice
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
