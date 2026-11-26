import { useEffect, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, FlaskConical, Loader2, Search } from "lucide-react";

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
  type AccessRecord,
  type AnyRecord,
  type DocumentRecord,
  type OfficeRecord,
  type OrgRecord,
  type OrphanRecord,
  type PaymentRecord,
  type PledgeRecord,
  type SupervisorRecord,
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
import { DOC_LABELS, verifyDocument } from "@/lib/intake.functions";
import { openPrivateFile } from "@/hooks/usePrivateFile";
import { givingCopy } from "@/config/giving-tracks";
import { trialSlots } from "@/lib/trial-slots";
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
  verifyDoc: (id: string, verified: boolean, note: string) => void;
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
const ORG_STATUS: Record<string, string> = {
  pending: "بانتظار الاعتماد",
  approved: "معتمدة",
  suspended: "موقوفة",
  rejected: "مرفوضة",
};
const ACTIVE_STATUS: Record<string, string> = { active: "نشط", inactive: "غير نشط" };
const SUPERVISOR_STATUS: Record<string, string> = {
  pending: "بانتظار الاعتماد",
  certified: "معتمد",
  inactive: "موقوف",
};
const DOC_STATUS: Record<string, string> = { verified: "موثّق", unverified: "بانتظار التوثيق" };
const PAYMENT_STATUS: Record<string, string> = {
  pending: "معلّقة",
  paid: "مدفوعة",
  failed: "فشلت",
  refunded: "مستردّة",
};
const SCOPE_LABEL: Record<string, string> = {
  identity: "الهوية والصورة",
  location: "الموقع",
  story: "القصّة",
  traits: "السمات",
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
  orgs: {
    title: "الجهات الميدانية",
    lead: "الجهات بحالاتها وعدد أطفالها. الاعتماد والإيقاف من «طابور الاعتماد».",
    searchHint: "الاسم أو المدينة أو البريد أو رقم الترخيص",
    statuses: ORG_STATUS,
    rowTitle: (r) => r.name,
    columns: [
      { label: "الجهة", cell: (r) => <span className="font-bold">{r.name}</span> },
      { label: "الحالة", cell: (r) => ORG_STATUS[r.status] ?? r.status },
      { label: "الأطفال", cell: (r) => r.children },
      { label: "المدينة", cell: (r) => r.city ?? "—", className: "hidden md:table-cell" },
      {
        label: "البريد",
        cell: (r) => <span dir="ltr">{r.email ?? "—"}</span>,
        className: "hidden lg:table-cell",
      },
    ],
    details: (r) => [
      ["الحالة", ORG_STATUS[r.status] ?? r.status],
      ["المدينة", [r.city, r.region].filter(Boolean).join("، ") || "—"],
      ["رقم الترخيص", r.license ?? "—"],
      ["البريد", <span dir="ltr">{r.email ?? "—"}</span>],
      ["الأطفال", r.children],
      ["سُجّلت", formatDate(r.created_at)],
    ],
    actions: () => (
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <a href="/admin?tab=queue">طابور الاعتماد</a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href="/admin?tab=inbox">صندوق القرارات</a>
        </Button>
      </div>
    ),
  },

  offices: {
    title: "المكاتب",
    lead: "مكاتب الشبكة وأعضاؤها. الإنشاء وتعيين الأعضاء من شاشة «المكاتب والجهات».",
    searchHint: "اسم المكتب أو المنطقة أو رمز الدولة",
    statuses: ACTIVE_STATUS,
    rowTitle: (r) => r.name,
    columns: [
      { label: "المكتب", cell: (r) => <span className="font-bold">{r.name}</span> },
      { label: "الدولة", cell: (r) => <span dir="ltr">{r.country}</span> },
      { label: "المنطقة", cell: (r) => r.region ?? "الدولة كلّها" },
      { label: "الأعضاء", cell: (r) => r.members },
      { label: "الحالة", cell: (r) => ACTIVE_STATUS[r.status] ?? r.status },
    ],
    details: (r) => [
      ["الدولة", <span dir="ltr">{r.country}</span>],
      ["المنطقة", r.region ?? "الدولة كلّها"],
      ["يتبع", r.parent ?? "—"],
      ["الأعضاء", r.members],
      ["الحالة", ACTIVE_STATUS[r.status] ?? r.status],
      ["أُنشئ", formatDate(r.created_at)],
    ],
    actions: (r) => (
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/office/$officeId" params={{ officeId: r.id }}>
            لوحة المكتب
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href="/admin?tab=offices">إدارة المكاتب والأعضاء</a>
        </Button>
      </div>
    ),
  },

  supervisors: {
    title: "المشرفون",
    lead: "المشرفون الميدانيون واعتمادهم. الاعتماد والإيقاف من شاشة «المشرفون».",
    searchHint: "البريد أو الاسم",
    statuses: SUPERVISOR_STATUS,
    rowTitle: (r) => r.name || r.email || "مشرف",
    columns: [
      { label: "المشرف", cell: (r) => <span className="font-bold">{r.name || "—"}</span> },
      { label: "البريد", cell: (r) => <span dir="ltr">{r.email ?? "—"}</span> },
      { label: "الحالة", cell: (r) => SUPERVISOR_STATUS[r.status] ?? r.status },
      {
        label: "مؤشّر الاستقلال",
        cell: (r) => r.independence,
        className: "hidden md:table-cell",
      },
    ],
    details: (r) => [
      ["البريد", <span dir="ltr">{r.email ?? "—"}</span>],
      ["الحالة", SUPERVISOR_STATUS[r.status] ?? r.status],
      ["مؤشّر الاستقلال", r.independence],
      ["اعتُمد", r.certified_at ? formatDate(r.certified_at) : "—"],
      ["ملاحظة", r.note ?? "—"],
    ],
    actions: () => (
      <Button asChild size="sm" variant="outline">
        <a href="/admin?tab=supervisors">اعتماد المشرفين</a>
      </Button>
    ),
  },

  documents: {
    title: "المستندات",
    lead: "مستندات ملفّات الأيتام. التوثيق وسحبه يُسجَّلان في سجلّ التدقيق، ويرفعان مستوى توثيق الملفّ.",
    searchHint: "رمز الطفل أو اسمه أو اسم الملفّ",
    statuses: DOC_STATUS,
    rowTitle: (r) => `${DOC_LABELS[r.doc_type] ?? r.doc_type} · ${r.name}`,
    columns: [
      {
        label: "المستند",
        cell: (r) => <span className="font-bold">{DOC_LABELS[r.doc_type] ?? r.doc_type}</span>,
      },
      { label: "الطفل", cell: (r) => r.name },
      { label: "الحالة", cell: (r) => DOC_STATUS[r.status] ?? r.status },
      { label: "رُفع", cell: (r) => formatDate(r.created_at), className: "hidden md:table-cell" },
    ],
    details: (r) => [
      ["النوع", DOC_LABELS[r.doc_type] ?? r.doc_type],
      ["الطفل", `${r.name} (${r.code})`],
      ["الملفّ", r.file_name ?? "—"],
      ["الحالة", DOC_STATUS[r.status] ?? r.status],
      ["وُثّق", r.verified_at ? formatDate(r.verified_at) : "—"],
      ["رُفع", formatDate(r.created_at)],
    ],
    actions: (r, run) => <DocumentActions record={r} run={run} />,
  },

  payments: {
    title: "المدفوعات",
    lead: "دفعات الكفالات من البوابة والتحويلات. تأكيد التحويلات البنكية من «صندوق القرارات».",
    searchHint: "البريد أو الطفل أو مرجع الدفع",
    statuses: PAYMENT_STATUS,
    rowTitle: (r) => `${r.name} · ${r.sponsor ?? ""}`,
    columns: [
      { label: "الطفل", cell: (r) => <span className="font-bold">{r.name}</span> },
      { label: "المبلغ", cell: (r) => money(r.amount, r.currency) },
      { label: "الحالة", cell: (r) => PAYMENT_STATUS[r.status] ?? r.status },
      {
        label: "الكافل",
        cell: (r) => <span dir="ltr">{r.sponsor ?? "—"}</span>,
        className: "hidden lg:table-cell",
      },
      {
        label: "التاريخ",
        cell: (r) => formatDate(r.paid_at ?? r.created_at),
        className: "hidden md:table-cell",
      },
    ],
    details: (r) => [
      ["الطفل", `${r.name} (${r.code})`],
      ["الكافل", <span dir="ltr">{r.sponsor ?? "—"}</span>],
      ["المبلغ", money(r.amount, r.currency)],
      ["الحالة", PAYMENT_STATUS[r.status] ?? r.status],
      ["الطريقة", r.provider ?? "—"],
      [
        "المرجع",
        <span dir="ltr" className="font-mono text-xs">
          {r.ref ?? "—"}
        </span>,
      ],
      [
        "الفترة",
        r.period_start ? `${formatDate(r.period_start)} ← ${formatDate(r.period_end)}` : "—",
      ],
      ["دُفعت", r.paid_at ? formatDate(r.paid_at) : "—"],
    ],
    actions: () => (
      <Button asChild size="sm" variant="outline">
        <a href="/admin?tab=inbox">صندوق القرارات والتحويلات</a>
      </Button>
    ),
  },
  access_log: {
    title: "سجلّ الاطّلاع",
    lead: "كلّ مرّةٍ فُتحت فيها بيانات طفلٍ الخاصّة (القصّة، المدينة، الاسم، الصورة): من، ومتى، وبأيّ نطاق. يُسجَّل في القاعدة ولا يُعدَّل.",
    searchHint: "البريد أو رمز الطفل أو اسمه",
    statuses: { admin: "الإدارة", other: "غير الإدارة" },
    rowTitle: (r) => `${r.name} · ${r.viewer ?? ""}`,
    columns: [
      { label: "من", cell: (r) => <span dir="ltr">{r.viewer ?? "—"}</span> },
      { label: "الطفل", cell: (r) => <span className="font-bold">{r.name}</span> },
      {
        label: "النطاق",
        cell: (r) => r.scopes.map((x) => SCOPE_LABEL[x] ?? x).join("، ") || "—",
      },
      { label: "متى", cell: (r) => formatDate(r.created_at) },
    ],
    details: (r) => [
      ["من", <span dir="ltr">{r.viewer ?? "—"}</span>],
      ["الطفل", `${r.name} (${r.code})`],
      ["النطاق", r.scopes.map((x) => SCOPE_LABEL[x] ?? x).join("، ") || "—"],
      ["متى", new Date(r.created_at).toLocaleString("ar", { numberingSystem: "latn" })],
    ],
    actions: (r) => (
      <Button asChild size="sm" variant="outline">
        <Link to="/orphans/$orphanId" params={{ orphanId: r.orphan_id }}>
          ملفّ الطفل
        </Link>
      </Button>
    ),
  },
};

type RowOf<K extends RecordKind> = {
  orphans: OrphanRecord;
  sponsorships: SponsorshipRecord;
  pledges: PledgeRecord;
  orgs: OrgRecord;
  offices: OfficeRecord;
  supervisors: SupervisorRecord;
  documents: DocumentRecord;
  payments: PaymentRecord;
  access_log: AccessRecord;
}[K];

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

function DocumentActions({ record, run }: { record: DocumentRecord; run: ActionRunner }) {
  const [note, setNote] = useState("");
  const verified = record.status === "verified";
  return (
    <div className="space-y-3">
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          record.path.startsWith("sample/")
            ? void toast.info("مستندٌ نموذجي — لا ملفّ خلفه في وضع البيانات النموذجية")
            : void openPrivateFile(ORPHAN_DOCS, record.path).then((ok) => {
                if (!ok) toast.error("تعذّر فتح المستند");
              })
        }
      >
        عرض المستند
      </Button>
      <Textarea
        rows={2}
        placeholder="ملاحظة (تُسجَّل في سجلّ التدقيق)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={verified ? "outline" : "default"}
          disabled={run.busy || (verified && !note.trim())}
          onClick={() => run.verifyDoc(record.id, !verified, note)}
        >
          {run.busy && <Loader2 className="size-4 animate-spin" />}
          {verified ? "سحب التوثيق" : "توثيق المستند"}
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/orphans/$orphanId" params={{ orphanId: record.orphan_id }}>
            ملفّ الطفل
          </Link>
        </Button>
      </div>
      {verified && <p className="text-muted-foreground text-xs">سحب التوثيق يتطلّب ملاحظة.</p>}
    </div>
  );
}

const ORPHAN_DOCS = "orphan-documents";

/** صفّ صنعه زائر العرض في جلسته (المعرّفات من `try-admin-overlay`) */
const isMine = (r: { id: string }) => r.id.startsWith("visitor-") || r.id === "try-cycle-1";

export function RecordsConsole({
  kind,
  sample = false,
  onSampleChange,
  visitor = false,
}: {
  kind: RecordKind;
  /** العرض التفاعلي: صفوف الزائر من جلسته (كفالاته وتعهّداته وملفّه) فوق البيانات النموذجية */
  visitor?: boolean;
  /** بيانات نموذجية: تُولَّد في الصفحة، والإجراءات عليها محاكاةٌ لا تصل الخادم */
  sample?: boolean;
  /** يُعرض زرّ التبديل حين تُمرَّر (وضع التجربة وحده) */
  onSampleChange?: (on: boolean) => void;
}) {
  const entity = ENTITIES[kind] as unknown as Entity<{ id: string }>;
  const fetchRows = useServerFn(listRecords);
  const setPledge = useServerFn(transitionPledge);
  const verifyDoc = useServerFn(verifyDocument);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<{ id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // تعديلات المحاكاة على الصفوف النموذجية: في الصفحة وحدها، تُنسى عند مغادرتها.
  const [edits, setEdits] = useState<Record<string, Partial<AnyRecord>>>({});

  // صفوف الزائر تتغيّر بأفعاله في الأدوار الأخرى: يُعاد بناؤها عند كلّ حدثٍ في الجلسة.
  const [visitorTick, setVisitorTick] = useState(0);
  useEffect(() => {
    if (!visitor) return;
    let events: readonly string[] = [];
    const bump = () => setVisitorTick((n) => n + 1);
    void trialSlots?.loadAdminOverlay().then((m) => {
      events = m.OVERLAY_EVENTS;
      for (const e of events) window.addEventListener(e, bump);
    });
    return () => {
      for (const e of events) window.removeEventListener(e, bump);
    };
  }, [visitor]);

  const res = useQuery({
    queryKey: ["admin-records", kind, query, status, page, sample, edits, visitorTick],
    queryFn: async () => {
      if (!sample) {
        return fetchRows({
          data: { kind, q: query || undefined, status: status || undefined, page },
        });
      }
      const { sampleRows, samplePage } = await import("@/lib/admin-console-sample");
      const overlay = visitor ? await trialSlots?.loadAdminOverlay() : undefined;
      const mine = overlay ? overlay.visitorRows(kind) : [];
      const rows = [...mine, ...sampleRows(kind)].map(
        (r) => ({ ...r, ...edits[r.id] }) as AnyRecord,
      );
      return {
        ok: true as const,
        error: null,
        page: samplePage(rows, { q: query, status, page, pageSize: PAGE_SIZE }),
      };
    },
    placeholderData: keepPreviousData,
  });
  /** إجراءٌ على بيانات نموذجية: يُطبَّق في الصفحة وحدها ويقول ذلك صراحةً. */
  const simulate = (id: string, patch: Partial<AnyRecord>, message: string) => {
    setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
    toast.success(`${message} — محاكاة: لم يُرسل شيء إلى الخادم`);
    setOpen(null);
  };
  const data = res.data?.page ?? null;
  const rows = (data?.rows ?? []) as Array<{ id: string }>;
  const counts = data?.counts ?? {};
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  const run: ActionRunner = {
    busy,
    pledge: (id, next, reason) => {
      if (sample) return simulate(id, { status: next }, "تغيّرت حالة التعهّد");
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
    verifyDoc: (id, verified, note) => {
      if (sample)
        return simulate(
          id,
          { status: verified ? "verified" : "unverified" },
          verified ? "وُثّق المستند" : "سُحب التوثيق",
        );
      setBusy(true);
      void verifyDoc({ data: { id, verified, note: note.trim() || undefined } })
        .then((r) => {
          if (!r.ok) return void toast.error(r.error ?? "تعذّر الحفظ");
          toast.success(verified ? "وُثّق المستند وسُجّل" : "سُحب التوثيق وسُجّل");
          setOpen(null);
          void qc.invalidateQueries({ queryKey: ["admin-records"] });
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
      {sample && (
        <div
          role="note"
          className="border-bridge/60 bg-bridge/10 mb-4 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm leading-7"
        >
          <FlaskConical className="text-bridge-ink size-5 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            <strong>بيانات نموذجية</strong> — أسماء مستعارة تُولَّد في الصفحة. الإجراءات هنا محاكاة
            لا تصل الخادم ولا تُسجَّل، وتُنسى عند مغادرة الصفحة.
          </p>
          {onSampleChange && (
            <Button size="sm" variant="outline" onClick={() => onSampleChange(false)}>
              العودة إلى بيانات المنصّة
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-muted-foreground text-sm leading-7">{entity.lead}</p>
        {!sample && onSampleChange && (
          <Button size="sm" variant="ghost" onClick={() => onSampleChange(true)}>
            <FlaskConical className="size-4" aria-hidden="true" />
            عرض بيانات نموذجية
          </Button>
        )}
      </div>

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
                  className={cn(
                    "hover:bg-secondary/40 focus-visible:bg-secondary/40 cursor-pointer outline-none",
                    visitor && isMine(r) && "bg-bridge/8",
                  )}
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
