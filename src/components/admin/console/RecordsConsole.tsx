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
import { formatDate, formatMoney, isolate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { verifyDocument } from "@/lib/intake.functions";
import { openPrivateFile } from "@/hooks/usePrivateFile";
import { givingCopy } from "@/config/giving-tracks";
import { trialSlots } from "@/lib/trial-slots";
import { PLEDGE_TRANSITIONS, verificationLevel } from "@/lib/verification";
import { VerificationBadge, VerificationChecklist } from "./VerificationBadge";
import { STATUS_COPY } from "@/components/sponsorship/status-copy";
import { copyOf, defineCopy, dirOf, pluralOf, useCopy, useLocale, type Locale } from "@/lib/locale";

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

const COPY = defineCopy("components/admin/console/RecordsConsole", {
  ar: {
    orphanStatus: {
      draft: "مسودة",
      submitted: "بانتظار المراجعة",
      under_review: "قيد المراجعة",
      approved: "معتمد",
      rejected: "مرفوض",
      fully_sponsored: "مكفول بالكامل",
      archived: "مؤرشف",
    } as Record<string, string>,
    pledgeStatus: {
      pending: "بانتظار المراجعة",
      active: "نشط",
      fulfilled: "اكتمل",
      cancelled: "أُلغي",
    } as Record<string, string>,
    orgStatus: {
      pending: "بانتظار الاعتماد",
      approved: "معتمدة",
      suspended: "موقوفة",
      rejected: "مرفوضة",
    } as Record<string, string>,
    activeStatus: { active: "نشط", inactive: "غير نشط" } as Record<string, string>,
    supervisorStatus: {
      pending: "بانتظار الاعتماد",
      certified: "معتمد",
      inactive: "موقوف",
    } as Record<string, string>,
    docStatus: { verified: "موثّق", unverified: "بانتظار التوثيق" } as Record<string, string>,
    paymentStatus: {
      pending: "معلّقة",
      paid: "مدفوعة",
      failed: "فشلت",
      refunded: "مستردّة",
    } as Record<string, string>,
    viewerStatus: { admin: "الإدارة", other: "غير الإدارة" } as Record<string, string>,
    scope: {
      identity: "الهوية والصورة",
      location: "الموقع",
      story: "القصّة",
      traits: "السمات",
    } as Record<string, string>,
    docs: {
      death_certificate: "شهادة وفاة الوالد",
      birth_certificate: "شهادة ميلاد اليتيم",
      guardianship_proof: "إثبات الوصاية",
      orphan_id: "هوية اليتيم",
      guardian_id: "هوية ولي الأمر",
      income_proof: "إثبات الدخل",
      school_record: "سجلّ دراسي",
      medical_report: "تقرير طبّي",
      photo_consent: "إقرار الموافقة على الصورة",
      other: "أخرى",
    } as Record<string, string>,
    action: { active: "تفعيل", fulfilled: "تمّ التنفيذ", cancelled: "إلغاء" },
    listSep: "، ",
    child: "الطفل",
    verification: "التوثيق",
    status: "الحالة",
    org: "الجهة",
    sponsors: "الكفلاء",
    fundedNeed: "مغطّى / الحاجة",
    code: "الرمز",
    place: "المكان",
    monthlyNeed: "الحاجة الشهرية",
    funded: "المغطّى",
    activeSponsors: "الكفلاء النشطون",
    addedM: "أُضيف",
    addedF: "أُنشئت",
    started: "بدأت",
    sponsor: "الكافل",
    amount: "المبلغ",
    date: "التاريخ",
    type: "النوع",
    oneTime: "مرّة واحدة",
    monthly: "شهرية",
    to: "إلى",
    supporter: "الداعم",
    reference: "المرجع",
    children: "الأطفال",
    city: "المدينة",
    email: "البريد",
    license: "رقم الترخيص",
    registered: "سُجّلت",
    office: "المكتب",
    country: "الدولة",
    region: "المنطقة",
    wholeCountry: "الدولة كلّها",
    members: "الأعضاء",
    parent: "يتبع",
    created: "أُنشئ",
    supervisor: "المشرف",
    supervisorFallback: "مشرف",
    independence: "مؤشّر الاستقلال",
    certified: "اعتُمد",
    note: "ملاحظة",
    document: "المستند",
    uploaded: "رُفع",
    fileName: "الملفّ",
    verifiedOn: "وُثّق",
    method: "الطريقة",
    period: "الفترة",
    paidOn: "دُفعت",
    who: "من",
    scopeCol: "النطاق",
    when: "متى",
    orphansTitle: "الأيتام",
    orphansLead: "كلّ الملفّات بكلّ حالاتها، ومعها مستوى التوثيق.",
    orphansSearch: "الرمز أو الاسم أو الجهة أو المدينة",
    orphansDocsNote:
      "المستندات تُرفع وتُوثَّق من ملفّ الطفل لدى جهته، وتُراجع في «طابور الاعتماد».",
    openFile: "فتح الملفّ",
    queue: "طابور الاعتماد",
    integrity: "أرشفة أو تصحيح (سلامة الحقيقة)",
    sponsorshipsTitle: "الكفالات",
    sponsorshipsLead:
      "كفالات الأطفال بحالاتها. الإيقاف والإلغاء يمرّان بمسار الدفع حتى لا يستمرّ الخصم.",
    sponsorshipsSearch: "رمز الطفل أو اسمه أو بريد الكافل",
    sponsorshipsNote:
      "لا تُوقف الكفالة ولا تُلغى من هنا مباشرةً: تغيير حالتها في القاعدة وحدها يترك اشتراك الدفع قائماً فيستمرّ الخصم. الكافل يوقفها من «أثري»، والفروقات المالية تُعالج في «صندوق القرارات».",
    childFile: "ملفّ الطفل",
    inbox: "صندوق القرارات",
    pledgesTitle: "التعهّدات",
    pledgesLead: "دعم بناء الأهلية والدعم العيني. كلّ تغيير حالةٍ يُسجَّل بمن فعله ولماذا.",
    pledgesSearch: "البريد أو الطفل أو المجموعة أو المنطقة أو الدولة",
    orgsTitle: "الجهات الميدانية",
    orgsLead: "الجهات بحالاتها وعدد أطفالها. الاعتماد والإيقاف من «طابور الاعتماد».",
    orgsSearch: "الاسم أو المدينة أو البريد أو رقم الترخيص",
    officesTitle: "المكاتب",
    officesLead: "مكاتب الشبكة وأعضاؤها. الإنشاء وتعيين الأعضاء من شاشة «المكاتب والجهات».",
    officesSearch: "اسم المكتب أو المنطقة أو رمز الدولة",
    officeBoard: "لوحة المكتب",
    manageOffices: "إدارة المكاتب والأعضاء",
    supervisorsTitle: "المشرفون",
    supervisorsLead: "المشرفون الميدانيون واعتمادهم. الاعتماد والإيقاف من شاشة «المشرفون».",
    supervisorsSearch: "البريد أو الاسم",
    certifySupervisors: "اعتماد المشرفين",
    documentsTitle: "المستندات",
    documentsLead:
      "مستندات ملفّات الأيتام. التوثيق وسحبه يُسجَّلان في سجلّ التدقيق، ويرفعان مستوى توثيق الملفّ.",
    documentsSearch: "رمز الطفل أو اسمه أو اسم الملفّ",
    paymentsTitle: "المدفوعات",
    paymentsLead:
      "دفعات الكفالات من البوابة والتحويلات. تأكيد التحويلات البنكية من «صندوق القرارات».",
    paymentsSearch: "البريد أو الطفل أو مرجع الدفع",
    inboxTransfers: "صندوق القرارات والتحويلات",
    accessTitle: "سجلّ الاطّلاع",
    accessLead:
      "كلّ مرّةٍ فُتحت فيها بيانات طفلٍ الخاصّة (القصّة، المدينة، الاسم، الصورة): من، ومتى، وبأيّ نطاق. يُسجَّل في القاعدة ولا يُعدَّل.",
    accessSearch: "البريد أو رمز الطفل أو اسمه",
    noPledgeAction: (status: string) => `لا إجراء على تعهّدٍ ${status}.`,
    reasonPlaceholder: "السبب (يُسجَّل في سجلّ التدقيق)",
    reasonRequired: "الإلغاء يتطلّب سبباً.",
    sampleDoc: "مستندٌ نموذجي — لا ملفّ خلفه في وضع البيانات النموذجية",
    openDocFailed: "تعذّر فتح المستند",
    viewDoc: "عرض المستند",
    notePlaceholder: "ملاحظة (تُسجَّل في سجلّ التدقيق)",
    unverify: "سحب التوثيق",
    verifyDoc: "توثيق المستند",
    noteRequired: "سحب التوثيق يتطلّب ملاحظة.",
    simulated: (message: string) => `${message} — محاكاة: لم يُرسل شيء إلى الخادم`,
    pledgeChanged: "تغيّرت حالة التعهّد",
    saveFailed: "تعذّر الحفظ",
    savedAudited: "حُفظ وسُجّل في سجلّ التدقيق",
    docVerified: "وُثّق المستند",
    docUnverified: "سُحب التوثيق",
    docVerifiedSaved: "وُثّق المستند وسُجّل",
    docUnverifiedSaved: "سُحب التوثيق وسُجّل",
    sampleLead: "بيانات نموذجية",
    sampleText:
      "— أسماء مستعارة تُولَّد في الصفحة. الإجراءات هنا محاكاة لا تصل الخادم ولا تُسجَّل، وتُنسى عند مغادرة الصفحة.",
    backToReal: "العودة إلى بيانات المنصّة",
    showSample: "عرض بيانات نموذجية",
    all: "الكلّ",
    search: "بحث",
    readFailed: (error: string) => `تعذّرت القراءة: ${error}`,
    noRecords: "لا سجلّات هنا.",
    records: pluralOf(
      {
        zero: "{0} سجلّ",
        one: "سجلّ واحد",
        two: "سجلّان",
        few: "{0} سجلّات",
        many: "{0} سجلّاً",
        other: "{0} سجلّ",
      },
      0,
      "ar",
    ),
    pageOf: (page: string, pages: string) => `صفحة ${page} من ${pages}`,
    previous: "السابقة",
    next: "التالية",
    actions: "الإجراءات",
  },
  en: {
    orphanStatus: {
      draft: "Draft",
      submitted: "Awaiting review",
      under_review: "Under review",
      approved: "Approved",
      rejected: "Rejected",
      fully_sponsored: "Fully sponsored",
      archived: "Archived",
    } as Record<string, string>,
    pledgeStatus: {
      pending: "Awaiting review",
      active: "Active",
      fulfilled: "Fulfilled",
      cancelled: "Cancelled",
    } as Record<string, string>,
    orgStatus: {
      pending: "Awaiting approval",
      approved: "Approved",
      suspended: "Suspended",
      rejected: "Rejected",
    } as Record<string, string>,
    activeStatus: { active: "Active", inactive: "Inactive" } as Record<string, string>,
    supervisorStatus: {
      pending: "Awaiting certification",
      certified: "Certified",
      inactive: "Suspended",
    } as Record<string, string>,
    docStatus: { verified: "Verified", unverified: "Awaiting verification" } as Record<
      string,
      string
    >,
    paymentStatus: {
      pending: "Pending",
      paid: "Paid",
      failed: "Failed",
      refunded: "Refunded",
    } as Record<string, string>,
    viewerStatus: { admin: "Administration", other: "Others" } as Record<string, string>,
    scope: {
      identity: "Identity and photo",
      location: "Location",
      story: "Story",
      traits: "Traits",
    } as Record<string, string>,
    docs: {
      death_certificate: "Parent's death certificate",
      birth_certificate: "Child's birth certificate",
      guardianship_proof: "Proof of guardianship",
      orphan_id: "Child's ID",
      guardian_id: "Guardian's ID",
      income_proof: "Proof of income",
      school_record: "School record",
      medical_report: "Medical report",
      photo_consent: "Photo consent form",
      other: "Other",
    } as Record<string, string>,
    action: { active: "Activate", fulfilled: "Mark fulfilled", cancelled: "Cancel" },
    listSep: ", ",
    child: "Child",
    verification: "Verification",
    status: "Status",
    org: "Organization",
    sponsors: "Sponsors",
    fundedNeed: "Covered / need",
    code: "Code",
    place: "Place",
    monthlyNeed: "Monthly need",
    funded: "Covered",
    activeSponsors: "Active sponsors",
    addedM: "Added",
    addedF: "Created",
    started: "Started",
    sponsor: "Sponsor",
    amount: "Amount",
    date: "Date",
    type: "Type",
    oneTime: "One-time",
    monthly: "Monthly",
    to: "To",
    supporter: "Supporter",
    reference: "Reference",
    children: "Children",
    city: "City",
    email: "Email",
    license: "License number",
    registered: "Registered",
    office: "Office",
    country: "Country",
    region: "Region",
    wholeCountry: "Whole country",
    members: "Members",
    parent: "Reports to",
    created: "Created",
    supervisor: "Supervisor",
    supervisorFallback: "Supervisor",
    independence: "Independence index",
    certified: "Certified",
    note: "Note",
    document: "Document",
    uploaded: "Uploaded",
    fileName: "File",
    verifiedOn: "Verified",
    method: "Method",
    period: "Period",
    paidOn: "Paid",
    who: "Who",
    scopeCol: "Scope",
    when: "When",
    orphansTitle: "Children",
    orphansLead: "Every file in every status, with its verification level.",
    orphansSearch: "Code, name, organization or city",
    orphansDocsNote:
      'Documents are uploaded and verified from the child\'s file at their organization, and reviewed in the "Approval queue".',
    openFile: "Open file",
    queue: "Approval queue",
    integrity: "Archive or correct (record integrity)",
    sponsorshipsTitle: "Sponsorships",
    sponsorshipsLead:
      "Children's sponsorships by status. Pausing and cancelling go through the payment flow so charges don't continue.",
    sponsorshipsSearch: "Child's code or name, or sponsor's email",
    sponsorshipsNote:
      'A sponsorship is not paused or cancelled directly from here: changing its status in the database alone leaves the payment subscription running, so charges continue. The sponsor pauses it from "My impact", and financial differences are handled in the "Decision inbox".',
    childFile: "Child's file",
    inbox: "Decision inbox",
    pledgesTitle: "Pledges",
    pledgesLead:
      "Capability-building and in-kind support. Every status change is recorded with who made it and why.",
    pledgesSearch: "Email, child, group, region or country",
    orgsTitle: "Field organizations",
    orgsLead:
      'Organizations by status and number of children. Approval and suspension happen in the "Approval queue".',
    orgsSearch: "Name, city, email or license number",
    officesTitle: "Offices",
    officesLead:
      'Network offices and their members. Creating offices and assigning members happens on the "Offices and organizations" screen.',
    officesSearch: "Office name, region or country code",
    officeBoard: "Office dashboard",
    manageOffices: "Manage offices and members",
    supervisorsTitle: "Supervisors",
    supervisorsLead:
      'Field supervisors and their certification. Certifying and suspending happen on the "Supervisors" screen.',
    supervisorsSearch: "Email or name",
    certifySupervisors: "Certify supervisors",
    documentsTitle: "Documents",
    documentsLead:
      "Documents in children's files. Verifying and withdrawing verification are recorded in the audit log and raise the file's verification level.",
    documentsSearch: "Child's code or name, or file name",
    paymentsTitle: "Payments",
    paymentsLead:
      'Sponsorship payments from the gateway and transfers. Bank transfers are confirmed in the "Decision inbox".',
    paymentsSearch: "Email, child or payment reference",
    inboxTransfers: "Decision inbox and transfers",
    accessTitle: "Access log",
    accessLead:
      "Every time a child's private data (story, city, name, photo) was opened: who, when, and under which scope. Recorded in the database and never edited.",
    accessSearch: "Email, or child's code or name",
    noPledgeAction: (status: string) => `No action available on a pledge that is ${status}.`,
    reasonPlaceholder: "Reason (recorded in the audit log)",
    reasonRequired: "Cancelling requires a reason.",
    sampleDoc: "Sample document — there is no file behind it in sample data mode",
    openDocFailed: "Couldn't open the document",
    viewDoc: "View document",
    notePlaceholder: "Note (recorded in the audit log)",
    unverify: "Withdraw verification",
    verifyDoc: "Verify document",
    noteRequired: "Withdrawing verification requires a note.",
    simulated: (message: string) => `${message} — simulated: nothing was sent to the server`,
    pledgeChanged: "Pledge status changed",
    saveFailed: "Couldn't save",
    savedAudited: "Saved and recorded in the audit log",
    docVerified: "Document verified",
    docUnverified: "Verification withdrawn",
    docVerifiedSaved: "Document verified and recorded",
    docUnverifiedSaved: "Verification withdrawn and recorded",
    sampleLead: "Sample data",
    sampleText:
      "— pseudonyms generated in the page. Actions here are simulated: they don't reach the server, aren't recorded, and are forgotten when you leave the page.",
    backToReal: "Back to platform data",
    showSample: "Show sample data",
    all: "All",
    search: "Search",
    readFailed: (error: string) => `Couldn't read: ${error}`,
    noRecords: "No records here.",
    records: pluralOf({ one: "{0} record", other: "{0} records" }),
    pageOf: (page: string, pages: string) => `page ${page} of ${pages}`,
    previous: "Previous",
    next: "Next",
    actions: "Actions",
  },
});
type Copy = (typeof COPY)["ar"];

function entitiesFor(c: Copy, locale: Locale): { [K in RecordKind]: Entity<RowOf<K>> } {
  const sponsorshipStatus: Record<string, string> = copyOf(STATUS_COPY, locale);
  const tracks = givingCopy(locale).tracks;
  const pledgeKind: Record<string, string> = {
    qualification: tracks.qualification.name,
    in_kind: tracks.in_kind.name,
  };
  const money = (n: number, cur: string) => (
    <span className="tabular-nums">{formatMoney(n, cur, locale)}</span>
  );
  const date = (v: string | null | undefined) => (
    <span className="tabular-nums">{formatDate(v, locale)}</span>
  );
  const label = (map: Record<string, string>, key: string) => map[key] ?? key;
  const childWithCode = (name: string, code: string) => (
    <>
      <bdi>{name}</bdi>{" "}
      <bdi dir="ltr" className="font-mono text-xs">
        ({code})
      </bdi>
    </>
  );
  const ref = (id: string, className = "font-mono") => (
    <bdi dir="ltr" className={className}>
      {id.slice(0, 8).toUpperCase()}
    </bdi>
  );
  const ltr = (v: string | null | undefined) => <bdi dir="ltr">{v ?? "—"}</bdi>;
  const scopes = (list: string[]) => list.map((x) => label(c.scope, x)).join(c.listSep) || "—";

  return {
    orphans: {
      title: c.orphansTitle,
      lead: c.orphansLead,
      searchHint: c.orphansSearch,
      statuses: c.orphanStatus,
      rowTitle: (r) => `${isolate(r.name)} · ${isolate(r.code)}`,
      columns: [
        {
          label: c.child,
          cell: (r) => (
            <span className="inline-flex items-baseline gap-2">
              <bdi className="font-bold">{r.name}</bdi>
              <bdi className="text-muted-foreground font-mono text-xs" dir="ltr">
                {r.code}
              </bdi>
            </span>
          ),
        },
        { label: c.verification, cell: (r) => <VerificationBadge v={r.verification} /> },
        { label: c.status, cell: (r) => label(c.orphanStatus, r.status) },
        {
          label: c.org,
          cell: (r) => (r.org ? <bdi>{r.org}</bdi> : "—"),
          className: "hidden lg:table-cell",
        },
        {
          label: c.sponsors,
          cell: (r) => <span className="tabular-nums">{r.sponsors}</span>,
          className: "hidden md:table-cell",
        },
        {
          label: c.fundedNeed,
          cell: (r) => (
            <>
              {money(r.funded, r.currency)} / {money(r.need, r.currency)}
            </>
          ),
          className: "hidden md:table-cell",
        },
      ],
      details: (r) => [
        [c.code, ltr(r.code)],
        [c.status, label(c.orphanStatus, r.status)],
        [c.org, r.org ? <bdi>{r.org}</bdi> : "—"],
        [c.place, <bdi>{[r.city, r.country].filter(Boolean).join(c.listSep) || "—"}</bdi>],
        [c.monthlyNeed, money(r.need, r.currency)],
        [c.funded, money(r.funded, r.currency)],
        [c.activeSponsors, <span className="tabular-nums">{r.sponsors}</span>],
        [c.addedM, date(r.created_at)],
      ],
      extra: (r) => (
        <section className="mt-6">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
            {c.verification} <VerificationBadge v={r.verification} />
          </h3>
          <VerificationChecklist v={r.verification} />
          {verificationLevel(r.verification) !== "full" && (
            <p className="text-muted-foreground mt-3 text-xs leading-6">{c.orphansDocsNote}</p>
          )}
        </section>
      ),
      actions: (r) => (
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/orphans/$orphanId" params={{ orphanId: r.id }}>
              {c.openFile}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href="/admin?tab=queue">{c.queue}</a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href="/admin?tab=integrity">{c.integrity}</a>
          </Button>
        </div>
      ),
    },

    sponsorships: {
      title: c.sponsorshipsTitle,
      lead: c.sponsorshipsLead,
      searchHint: c.sponsorshipsSearch,
      statuses: sponsorshipStatus,
      rowTitle: (r) => `${isolate(r.name)} · ${isolate(r.sponsor ?? "")}`,
      columns: [
        { label: c.child, cell: (r) => <bdi className="font-bold">{r.name}</bdi> },
        { label: c.sponsor, cell: (r) => ltr(r.sponsor) },
        { label: c.amount, cell: (r) => money(r.amount, r.currency) },
        { label: c.status, cell: (r) => label(sponsorshipStatus, r.status) },
        {
          label: c.date,
          cell: (r) => date(r.created_at),
          className: "hidden md:table-cell",
        },
      ],
      details: (r) => [
        [c.child, childWithCode(r.name, r.code)],
        [c.sponsor, ltr(r.sponsor)],
        [c.amount, money(r.amount, r.currency)],
        [c.type, r.type === "one_time" ? c.oneTime : c.monthly],
        [c.status, label(sponsorshipStatus, r.status)],
        [c.addedF, date(r.created_at)],
        [c.started, r.started_at ? date(r.started_at) : "—"],
      ],
      extra: () => (
        <p className="border-bridge/40 bg-bridge/10 mt-6 rounded-xl border p-3 text-xs leading-6">
          {c.sponsorshipsNote}
        </p>
      ),
      actions: (r) => (
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/orphans/$orphanId" params={{ orphanId: r.orphan_id }}>
              {c.childFile}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href="/admin?tab=inbox">{c.inbox}</a>
          </Button>
        </div>
      ),
    },

    pledges: {
      title: c.pledgesTitle,
      lead: c.pledgesLead,
      searchHint: c.pledgesSearch,
      statuses: c.pledgeStatus,
      rowTitle: (r) => `${isolate(r.target ?? r.country)} · ${isolate(r.supporter ?? "")}`,
      columns: [
        { label: c.to, cell: (r) => <bdi className="font-bold">{r.target ?? r.country}</bdi> },
        { label: c.type, cell: (r) => label(pledgeKind, r.kind) },
        { label: c.amount, cell: (r) => money(r.amount, r.currency) },
        { label: c.status, cell: (r) => label(c.pledgeStatus, r.status) },
        {
          label: c.supporter,
          cell: (r) => ltr(r.supporter),
          className: "hidden lg:table-cell",
        },
        {
          label: c.reference,
          cell: (r) => ref(r.id, "font-mono text-xs"),
          className: "hidden md:table-cell",
        },
      ],
      details: (r) => [
        [c.reference, ref(r.id)],
        [c.to, <bdi>{r.target ?? r.country}</bdi>],
        [c.type, label(pledgeKind, r.kind)],
        [c.amount, money(r.amount, r.currency)],
        [c.status, label(c.pledgeStatus, r.status)],
        [c.supporter, ltr(r.supporter)],
        [c.date, date(r.created_at)],
      ],
      actions: (r, run) => <PledgeActions record={r} run={run} c={c} />,
    },
    orgs: {
      title: c.orgsTitle,
      lead: c.orgsLead,
      searchHint: c.orgsSearch,
      statuses: c.orgStatus,
      rowTitle: (r) => r.name,
      columns: [
        { label: c.org, cell: (r) => <bdi className="font-bold">{r.name}</bdi> },
        { label: c.status, cell: (r) => label(c.orgStatus, r.status) },
        { label: c.children, cell: (r) => <span className="tabular-nums">{r.children}</span> },
        {
          label: c.city,
          cell: (r) => (r.city ? <bdi>{r.city}</bdi> : "—"),
          className: "hidden md:table-cell",
        },
        {
          label: c.email,
          cell: (r) => ltr(r.email),
          className: "hidden lg:table-cell",
        },
      ],
      details: (r) => [
        [c.status, label(c.orgStatus, r.status)],
        [c.city, <bdi>{[r.city, r.region].filter(Boolean).join(c.listSep) || "—"}</bdi>],
        [c.license, ltr(r.license)],
        [c.email, ltr(r.email)],
        [c.children, <span className="tabular-nums">{r.children}</span>],
        [c.registered, date(r.created_at)],
      ],
      actions: () => (
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <a href="/admin?tab=queue">{c.queue}</a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href="/admin?tab=inbox">{c.inbox}</a>
          </Button>
        </div>
      ),
    },

    offices: {
      title: c.officesTitle,
      lead: c.officesLead,
      searchHint: c.officesSearch,
      statuses: c.activeStatus,
      rowTitle: (r) => r.name,
      columns: [
        { label: c.office, cell: (r) => <bdi className="font-bold">{r.name}</bdi> },
        { label: c.country, cell: (r) => ltr(r.country) },
        { label: c.region, cell: (r) => (r.region ? <bdi>{r.region}</bdi> : c.wholeCountry) },
        { label: c.members, cell: (r) => <span className="tabular-nums">{r.members}</span> },
        { label: c.status, cell: (r) => label(c.activeStatus, r.status) },
      ],
      details: (r) => [
        [c.country, ltr(r.country)],
        [c.region, r.region ? <bdi>{r.region}</bdi> : c.wholeCountry],
        [c.parent, r.parent ? <bdi>{r.parent}</bdi> : "—"],
        [c.members, <span className="tabular-nums">{r.members}</span>],
        [c.status, label(c.activeStatus, r.status)],
        [c.created, date(r.created_at)],
      ],
      actions: (r) => (
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/office/$officeId" params={{ officeId: r.id }}>
              {c.officeBoard}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href="/admin?tab=offices">{c.manageOffices}</a>
          </Button>
        </div>
      ),
    },

    supervisors: {
      title: c.supervisorsTitle,
      lead: c.supervisorsLead,
      searchHint: c.supervisorsSearch,
      statuses: c.supervisorStatus,
      rowTitle: (r) => r.name || r.email || c.supervisorFallback,
      columns: [
        { label: c.supervisor, cell: (r) => <bdi className="font-bold">{r.name || "—"}</bdi> },
        { label: c.email, cell: (r) => ltr(r.email) },
        { label: c.status, cell: (r) => label(c.supervisorStatus, r.status) },
        {
          label: c.independence,
          cell: (r) => <span className="tabular-nums">{r.independence}</span>,
          className: "hidden md:table-cell",
        },
      ],
      details: (r) => [
        [c.email, ltr(r.email)],
        [c.status, label(c.supervisorStatus, r.status)],
        [c.independence, <span className="tabular-nums">{r.independence}</span>],
        [c.certified, r.certified_at ? date(r.certified_at) : "—"],
        [c.note, r.note ? <bdi>{r.note}</bdi> : "—"],
      ],
      actions: () => (
        <Button asChild size="sm" variant="outline">
          <a href="/admin?tab=supervisors">{c.certifySupervisors}</a>
        </Button>
      ),
    },

    documents: {
      title: c.documentsTitle,
      lead: c.documentsLead,
      searchHint: c.documentsSearch,
      statuses: c.docStatus,
      rowTitle: (r) => `${label(c.docs, r.doc_type)} · ${isolate(r.name)}`,
      columns: [
        {
          label: c.document,
          cell: (r) => <span className="font-bold">{label(c.docs, r.doc_type)}</span>,
        },
        { label: c.child, cell: (r) => <bdi>{r.name}</bdi> },
        { label: c.status, cell: (r) => label(c.docStatus, r.status) },
        { label: c.uploaded, cell: (r) => date(r.created_at), className: "hidden md:table-cell" },
      ],
      details: (r) => [
        [c.type, label(c.docs, r.doc_type)],
        [c.child, childWithCode(r.name, r.code)],
        [c.fileName, ltr(r.file_name)],
        [c.status, label(c.docStatus, r.status)],
        [c.verifiedOn, r.verified_at ? date(r.verified_at) : "—"],
        [c.uploaded, date(r.created_at)],
      ],
      actions: (r, run) => <DocumentActions record={r} run={run} c={c} />,
    },

    payments: {
      title: c.paymentsTitle,
      lead: c.paymentsLead,
      searchHint: c.paymentsSearch,
      statuses: c.paymentStatus,
      rowTitle: (r) => `${isolate(r.name)} · ${isolate(r.sponsor ?? "")}`,
      columns: [
        { label: c.child, cell: (r) => <bdi className="font-bold">{r.name}</bdi> },
        { label: c.amount, cell: (r) => money(r.amount, r.currency) },
        { label: c.status, cell: (r) => label(c.paymentStatus, r.status) },
        {
          label: c.sponsor,
          cell: (r) => ltr(r.sponsor),
          className: "hidden lg:table-cell",
        },
        {
          label: c.date,
          cell: (r) => date(r.paid_at ?? r.created_at),
          className: "hidden md:table-cell",
        },
      ],
      details: (r) => [
        [c.child, childWithCode(r.name, r.code)],
        [c.sponsor, ltr(r.sponsor)],
        [c.amount, money(r.amount, r.currency)],
        [c.status, label(c.paymentStatus, r.status)],
        [c.method, ltr(r.provider)],
        [
          c.reference,
          <bdi dir="ltr" className="font-mono text-xs">
            {r.ref ?? "—"}
          </bdi>,
        ],
        [
          c.period,
          r.period_start ? (
            <span className="tabular-nums">
              {formatDate(r.period_start, locale)} ← {formatDate(r.period_end, locale)}
            </span>
          ) : (
            "—"
          ),
        ],
        [c.paidOn, r.paid_at ? date(r.paid_at) : "—"],
      ],
      actions: () => (
        <Button asChild size="sm" variant="outline">
          <a href="/admin?tab=inbox">{c.inboxTransfers}</a>
        </Button>
      ),
    },
    access_log: {
      title: c.accessTitle,
      lead: c.accessLead,
      searchHint: c.accessSearch,
      statuses: c.viewerStatus,
      rowTitle: (r) => `${isolate(r.name)} · ${isolate(r.viewer ?? "")}`,
      columns: [
        { label: c.who, cell: (r) => ltr(r.viewer) },
        { label: c.child, cell: (r) => <bdi className="font-bold">{r.name}</bdi> },
        { label: c.scopeCol, cell: (r) => scopes(r.scopes) },
        { label: c.when, cell: (r) => date(r.created_at) },
      ],
      details: (r) => [
        [c.who, ltr(r.viewer)],
        [c.child, childWithCode(r.name, r.code)],
        [c.scopeCol, scopes(r.scopes)],
        [
          c.when,
          <span className="tabular-nums">
            {isolate(
              new Date(r.created_at).toLocaleString(locale === "ar" ? "ar" : locale, {
                numberingSystem: "latn",
              }),
            )}
          </span>,
        ],
      ],
      actions: (r) => (
        <Button asChild size="sm" variant="outline">
          <Link to="/orphans/$orphanId" params={{ orphanId: r.orphan_id }}>
            {c.childFile}
          </Link>
        </Button>
      ),
    },
  };
}

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

function PledgeActions({ record, run, c }: { record: PledgeRecord; run: ActionRunner; c: Copy }) {
  const [reason, setReason] = useState("");
  const next = PLEDGE_TRANSITIONS[record.status] ?? [];
  if (next.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        {c.noPledgeAction(c.pledgeStatus[record.status] ?? record.status)}
      </p>
    );
  return (
    <div className="space-y-3">
      <Textarea
        rows={2}
        placeholder={c.reasonPlaceholder}
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
            {c.action[s]}
          </Button>
        ))}
      </div>
      {next.includes("cancelled") && (
        <p className="text-muted-foreground text-xs">{c.reasonRequired}</p>
      )}
    </div>
  );
}

function DocumentActions({
  record,
  run,
  c,
}: {
  record: DocumentRecord;
  run: ActionRunner;
  c: Copy;
}) {
  const [note, setNote] = useState("");
  const verified = record.status === "verified";
  return (
    <div className="space-y-3">
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          record.path.startsWith("sample/")
            ? void toast.info(c.sampleDoc)
            : void openPrivateFile(ORPHAN_DOCS, record.path).then((ok) => {
                if (!ok) toast.error(c.openDocFailed);
              })
        }
      >
        {c.viewDoc}
      </Button>
      <Textarea
        rows={2}
        placeholder={c.notePlaceholder}
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
          {verified ? c.unverify : c.verifyDoc}
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/orphans/$orphanId" params={{ orphanId: record.orphan_id }}>
            {c.childFile}
          </Link>
        </Button>
      </div>
      {verified && <p className="text-muted-foreground text-xs">{c.noteRequired}</p>}
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
  const c = useCopy(COPY);
  const locale = useLocale();
  const entity = entitiesFor(c, locale)[kind] as unknown as Entity<{ id: string }>;
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
    toast.success(c.simulated(message));
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
      if (sample) return simulate(id, { status: next }, c.pledgeChanged);
      setBusy(true);
      void setPledge({ data: { id, status: next, reason: reason.trim() || undefined } })
        .then((r) => {
          if (!r.ok) return void toast.error(r.error ?? c.saveFailed);
          toast.success(c.savedAudited);
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
          verified ? c.docVerified : c.docUnverified,
        );
      setBusy(true);
      void verifyDoc({ data: { id, verified, note: note.trim() || undefined } })
        .then((r) => {
          if (!r.ok) return void toast.error(r.error ?? c.saveFailed);
          toast.success(verified ? c.docVerifiedSaved : c.docUnverifiedSaved);
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
            <strong>{c.sampleLead}</strong> {c.sampleText}
          </p>
          {onSampleChange && (
            <Button size="sm" variant="outline" onClick={() => onSampleChange(false)}>
              {c.backToReal}
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-muted-foreground text-sm leading-7">{entity.lead}</p>
        {!sample && onSampleChange && (
          <Button size="sm" variant="ghost" onClick={() => onSampleChange(true)}>
            <FlaskConical className="size-4" aria-hidden="true" />
            {c.showSample}
          </Button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className={chip(!status)} onClick={() => (setStatus(""), setPage(0))}>
          {c.all} <span className="tabular-nums opacity-80">{all}</span>
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
          <Button type="submit" size="sm" variant="outline" aria-label={c.search}>
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
                  {c.readFailed(res.data.error ?? "")}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={entity.columns.length}
                  className="text-muted-foreground px-4 py-10 text-center"
                >
                  {c.noRecords}
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
          {c.records(data?.total ?? 0)} · {c.pageOf(String(page + 1), String(pages))}
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
            aria-label={c.previous}
          >
            <ChevronRight className="size-4 ltr:-scale-x-100" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page + 1 >= pages}
            onClick={() => setPage(page + 1)}
            aria-label={c.next}
          >
            <ChevronLeft className="size-4 ltr:-scale-x-100" />
          </Button>
        </div>
      </div>

      <Sheet open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent
          side={dirOf(locale) === "rtl" ? "left" : "right"}
          className="w-full overflow-y-auto sm:max-w-md"
          dir={dirOf(locale)}
        >
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
                  <h3 className="mb-2 text-sm font-bold">{c.actions}</h3>
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
