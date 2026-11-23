import { useState, type ReactNode } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  listRecords,
  PAGE_SIZE,
  transitionPledge,
  type OrphanRecord,
  type PledgeRecord,
  type RecordKind,
  type SponsorshipRecord,
} from "@/lib/admin-console.functions";
import {
  formatDate,
  formatMoney,
  ORPHAN_STATUS_LABELS,
  SPONSORSHIP_STATUS_LABELS,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { givingCopy } from "@/config/giving-tracks";
import { PLEDGE_TRANSITIONS, verificationLevel } from "@/lib/verification";
import { VerificationBadge, VerificationChecklist } from "./VerificationBadge";

/* ─────────────────────────────────────────────────────────────────────
   لوحة البيانات: جدولٌ واحد لكلّ أنواع البيانات.

   كلّ نوعٍ يُعرَّف مرّةً في `ENTITIES` — عنوانه، وحالاته، وأعمدته، وتفاصيله،
   وإجراءاته — والإطار يبني منه البحث، وأزرار الحالات بعدّاداتها، والصفحات،
   ولوحة التفاصيل. إضافة نوعٍ جديد = تعريفٌ جديد هنا وفرعٌ في `admin_records`.
   ───────────────────────────────────────────────────────────────────── */

type Column<T> = { label: string; cell: (r: T) => ReactNode; className?: string };

type Entity<T> = {
  title: string;
  lead: string;
  searchHint: string;
  statuses: Record<string, string>;
  columns: Column<T>[];
  rowTitle: (r: T) => string;
  details: (r: T) => Array<[string, ReactNode]>;
  extra?: (r: T) => ReactNode;
  actions?: (r: T, run: ActionRunner) => ReactNode;
};

type ActionRunner = {
  busy: boolean;
  pledge: (id: string, status: "active" | "fulfilled" | "cancelled", reason: string) => void;
};

const PLEDGE_STATUS: Record<string, string> = {
  pending: "بانتظار المراجعة",
  active: "نشط",
  fulfilled: "اكتمل",
  cancelled: "أُلغي",
};
// أسماء الأنواع من مصدرها الواحد (config/giving-tracks)؛ لوحة الإدارة عربيةٌ.
const tracks = givingCopy("ar").tracks;
const PLEDGE_KIND: Record<string, string> = {
  qualification: tracks.qualification.name,
  in_kind: tracks.in_kind.name,
};
const ACTION_LABEL = { active: "تفعيل", fulfilled: "تمّ التنفيذ", cancelled: "إلغاء" } as const;

const money = (n: number, c: string) => <span className="tabular-nums">{formatMoney(n, c)}</span>;

const ENTITIES: { [K in RecordKind]: Entity<RowOf<K>> } = {
  orphans: {
    title: "الأيتام",
    lead: "كلّ الملفّات بكلّ حالاتها، ومعها مستوى التوثيق.",
    searchHint: "الرمز أو الاسم أو الجهة أو المدينة",
    statuses: ORPHAN_STATUS_LABELS,
    rowTitle: (r) => `${r.name} · ${r.code}`,
    columns: [
      {
        label: "الطفل",
        cell: (r) => (
          <span className="inline-flex items-baseline gap-2">
            <span className="font-bold">{r.name}</span>
            <span className="text-muted-foreground font-mono text-xs" dir="ltr">
              {r.code}
            </span>
          </span>
        ),
      },
      { label: "التوثيق", cell: (r) => <VerificationBadge v={r.verification} /> },
      { label: "الحالة", cell: (r) => ORPHAN_STATUS_LABELS[r.status] ?? r.status },
      { label: "الجهة", cell: (r) => r.org ?? "—", className: "hidden lg:table-cell" },
      { label: "الكفلاء", cell: (r) => r.sponsors, className: "hidden md:table-cell" },
      {
        label: "مغطّى / الحاجة",
        cell: (r) => (
          <>
            {money(r.funded, r.currency)} / {money(r.need, r.currency)}
          </>
        ),
        className: "hidden md:table-cell",
      },
    ],
    details: (r) => [
      ["الرمز", <span dir="ltr">{r.code}</span>],
      ["الحالة", ORPHAN_STATUS_LABELS[r.status] ?? r.status],
      ["الجهة", r.org ?? "—"],
      ["المكان", [r.city, r.country].filter(Boolean).join("، ") || "—"],
      ["الحاجة الشهرية", money(r.need, r.currency)],
      ["المغطّى", money(r.funded, r.currency)],
      ["الكفلاء النشطون", r.sponsors],
      ["أُضيف", formatDate(r.created_at)],
    ],
    extra: (r) => (
      <section className="mt-6">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
          التوثيق <VerificationBadge v={r.verification} />
        </h3>
        <VerificationChecklist v={r.verification} />
        {verificationLevel(r.verification) !== "full" && (
          <p className="text-muted-foreground mt-3 text-xs leading-6">
            المستندات تُرفع وتُوثَّق من ملفّ الطفل لدى جهته، وتُراجع في «طابور الاعتماد».
          </p>
        )}
      </section>
    ),
    actions: (r) => (
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/orphans/$orphanId" params={{ orphanId: r.id }}>
            فتح الملفّ
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href="/admin?tab=queue">طابور الاعتماد</a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href="/admin?tab=integrity">أرشفة أو تصحيح (سلامة الحقيقة)</a>
        </Button>
      </div>
    ),
  },

  sponsorships: {
    title: "الكفالات",
    lead: "كفالات الأطفال بحالاتها. الإيقاف والإلغاء يمرّان بمسار الدفع حتى لا يستمرّ الخصم.",
    searchHint: "رمز الطفل أو اسمه أو بريد الكافل",
    statuses: SPONSORSHIP_STATUS_LABELS,
    rowTitle: (r) => `${r.name} · ${r.sponsor ?? ""}`,
    columns: [
      { label: "الطفل", cell: (r) => <span className="font-bold">{r.name}</span> },
      { label: "الكافل", cell: (r) => <span dir="ltr">{r.sponsor ?? "—"}</span> },
      { label: "المبلغ", cell: (r) => money(r.amount, r.currency) },
      { label: "الحالة", cell: (r) => SPONSORSHIP_STATUS_LABELS[r.status] ?? r.status },
      {
        label: "التاريخ",
        cell: (r) => formatDate(r.created_at),
        className: "hidden md:table-cell",
      },
    ],
    details: (r) => [
      ["الطفل", `${r.name} (${r.code})`],
      ["الكافل", <span dir="ltr">{r.sponsor ?? "—"}</span>],
      ["المبلغ", money(r.amount, r.currency)],
      ["النوع", r.type === "one_time" ? "مرّة واحدة" : "شهرية"],
      ["الحالة", SPONSORSHIP_STATUS_LABELS[r.status] ?? r.status],
      ["أُنشئت", formatDate(r.created_at)],
      ["بدأت", r.started_at ? formatDate(r.started_at) : "—"],
    ],
    extra: () => (
      <p className="border-bridge/40 bg-bridge/10 mt-6 rounded-xl border p-3 text-xs leading-6">
        لا تُوقف الكفالة ولا تُلغى من هنا مباشرةً: تغيير حالتها في القاعدة وحدها يترك اشتراك الدفع
        قائماً فيستمرّ الخصم. الكافل يوقفها من «أثري»، والفروقات المالية تُعالج في «صندوق القرارات».
      </p>
    ),
    actions: (r) => (
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/orphans/$orphanId" params={{ orphanId: r.orphan_id }}>
            ملفّ الطفل
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href="/admin?tab=inbox">صندوق القرارات</a>
        </Button>
      </div>
    ),
  },

  pledges: {
    title: "التعهّدات",
    lead: "دعم بناء الأهلية والدعم العيني. كلّ تغيير حالةٍ يُسجَّل بمن فعله ولماذا.",
    searchHint: "البريد أو الطفل أو المجموعة أو المنطقة أو الدولة",
    statuses: PLEDGE_STATUS,
    rowTitle: (r) => `${r.target ?? r.country} · ${r.supporter ?? ""}`,
    columns: [
      { label: "إلى", cell: (r) => <span className="font-bold">{r.target ?? r.country}</span> },
      { label: "النوع", cell: (r) => PLEDGE_KIND[r.kind] ?? r.kind },
      { label: "المبلغ", cell: (r) => money(r.amount, r.currency) },
      { label: "الحالة", cell: (r) => PLEDGE_STATUS[r.status] ?? r.status },
      {
        label: "الداعم",
        cell: (r) => <span dir="ltr">{r.supporter ?? "—"}</span>,
        className: "hidden lg:table-cell",
      },
      {
        label: "المرجع",
        cell: (r) => (
          <span dir="ltr" className="font-mono text-xs">
            {r.id.slice(0, 8).toUpperCase()}
          </span>
        ),
        className: "hidden md:table-cell",
      },
    ],
    details: (r) => [
      [
        "المرجع",
        <span dir="ltr" className="font-mono">
          {r.id.slice(0, 8).toUpperCase()}
        </span>,
      ],
      ["إلى", r.target ?? r.country],
      ["النوع", PLEDGE_KIND[r.kind] ?? r.kind],
      ["المبلغ", money(r.amount, r.currency)],
      ["الحالة", PLEDGE_STATUS[r.status] ?? r.status],
      ["الداعم", <span dir="ltr">{r.supporter ?? "—"}</span>],
      ["التاريخ", formatDate(r.created_at)],
    ],
    actions: (r, run) => <PledgeActions record={r} run={run} />,
  },
};

type RowOf<K extends RecordKind> = K extends "orphans"
  ? OrphanRecord
  : K extends "sponsorships"
    ? SponsorshipRecord
    : PledgeRecord;

function PledgeActions({ record, run }: { record: PledgeRecord; run: ActionRunner }) {
  const [reason, setReason] = useState("");
  const next = PLEDGE_TRANSITIONS[record.status] ?? [];
  if (next.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        لا إجراء على تعهّدٍ {PLEDGE_STATUS[record.status]}.
      </p>
    );
  return (
    <div className="space-y-3">
      <Textarea
        rows={2}
        placeholder="السبب (يُسجَّل في سجلّ التدقيق)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {next.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={s === "cancelled" ? "outline" : "default"}
            disabled={run.busy || (s === "cancelled" && !reason.trim())}
            onClick={() => run.pledge(record.id, s, reason)}
          >
            {run.busy && <Loader2 className="size-4 animate-spin" />}
            {ACTION_LABEL[s]}
          </Button>
        ))}
      </div>
      {next.includes("cancelled") && (
        <p className="text-muted-foreground text-xs">الإلغاء يتطلّب سبباً.</p>
      )}
    </div>
  );
}

export function RecordsConsole({ kind }: { kind: RecordKind }) {
  const entity = ENTITIES[kind] as unknown as Entity<{ id: string }>;
  const fetchRows = useServerFn(listRecords);
  const setPledge = useServerFn(transitionPledge);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<{ id: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const res = useQuery({
    queryKey: ["admin-records", kind, query, status, page],
    queryFn: () =>
      fetchRows({ data: { kind, q: query || undefined, status: status || undefined, page } }),
    placeholderData: keepPreviousData,
  });
  const data = res.data?.page ?? null;
  const rows = (data?.rows ?? []) as Array<{ id: string }>;
  const counts = data?.counts ?? {};
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  const run: ActionRunner = {
    busy,
    pledge: (id, next, reason) => {
      setBusy(true);
      void setPledge({ data: { id, status: next, reason: reason.trim() || undefined } })
        .then((r) => {
          if (!r.ok) return void toast.error(r.error ?? "تعذّر الحفظ");
          toast.success("حُفظ وسُجّل في سجلّ التدقيق");
          setOpen(null);
          void qc.invalidateQueries({ queryKey: ["admin-records", kind] });
        })
        .finally(() => setBusy(false));
    },
  };

  const chip = (on: boolean) =>
    cn(
      "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors",
      on
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-card hover:border-primary/50",
    );

  return (
    <section className="mt-6">
      <p className="text-muted-foreground text-sm leading-7">{entity.lead}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className={chip(!status)} onClick={() => (setStatus(""), setPage(0))}>
          الكلّ <span className="tabular-nums opacity-80">{all}</span>
        </button>
        {Object.entries(entity.statuses).map(([key, label]) =>
          counts[key] ? (
            <button
              key={key}
              type="button"
              className={chip(status === key)}
              onClick={() => (setStatus(key), setPage(0))}
            >
              {label} <span className="tabular-nums opacity-80">{counts[key]}</span>
            </button>
          ) : null,
        )}
        <form
          role="search"
          className="ms-auto flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(0);
            setQuery(q.trim());
          }}
        >
          <Input
            aria-label={entity.searchHint}
            placeholder={entity.searchHint}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-9 w-64 max-w-full"
          />
          <Button type="submit" size="sm" variant="outline" aria-label="بحث">
            <Search className="size-4" />
          </Button>
        </form>
      </div>

      <div className="border-border bg-card mt-4 overflow-hidden rounded-2xl border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-muted-foreground text-xs">
            <tr>
              {entity.columns.map((c) => (
                <th key={c.label} className={cn("px-4 py-3 text-start font-bold", c.className)}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {res.isPending ? (
              <tr>
                <td colSpan={entity.columns.length} className="px-4 py-10 text-center">
                  <Loader2 className="text-muted-foreground mx-auto size-5 animate-spin" />
                </td>
              </tr>
            ) : res.data && !res.data.ok ? (
              <tr>
                <td
                  colSpan={entity.columns.length}
                  className="text-destructive px-4 py-6 text-center"
                >
                  تعذّرت القراءة: {res.data.error}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={entity.columns.length}
                  className="text-muted-foreground px-4 py-10 text-center"
                >
                  لا سجلّات هنا.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  tabIndex={0}
                  onClick={() => setOpen(r)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(r)}
                  className="hover:bg-secondary/40 focus-visible:bg-secondary/40 cursor-pointer outline-none"
                >
                  {entity.columns.map((c) => (
                    <td key={c.label} className={cn("px-4 py-3", c.className)}>
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-muted-foreground tabular-nums">
          {data?.total ?? 0} سجلّ · صفحة {page + 1} من {pages}
          {res.isFetching && !res.isPending && (
            <Loader2 className="ms-2 inline size-3 animate-spin" />
          )}
        </span>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            aria-label="السابقة"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page + 1 >= pages}
            onClick={() => setPage(page + 1)}
            aria-label="التالية"
          >
            <ChevronLeft className="size-4" />
          </Button>
        </div>
      </div>

      <Sheet open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent side="left" className="w-full overflow-y-auto sm:max-w-md" dir="rtl">
          {open && (
            <>
              <SheetHeader className="text-start">
                <SheetTitle>{entity.rowTitle(open)}</SheetTitle>
                <SheetDescription>{entity.title}</SheetDescription>
              </SheetHeader>
              <dl className="divide-border mt-4 divide-y text-sm">
                {entity.details(open).map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 py-2.5">
                    <dt className="text-muted-foreground shrink-0">{k}</dt>
                    <dd className="min-w-0 text-end font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              {entity.extra?.(open)}
              {entity.actions && (
                <section className="mt-6">
                  <h3 className="mb-2 text-sm font-bold">الإجراءات</h3>
                  {entity.actions(open, run)}
                </section>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
