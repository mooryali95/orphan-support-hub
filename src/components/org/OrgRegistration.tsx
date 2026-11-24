import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CircleAlert, FileCheck2, Loader2, Trash2 } from "lucide-react";

import { FilePicker } from "@/components/kit/FilePicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  attachOrgDocument,
  createOrgDocumentUploadUrl,
  listOperatingCountries,
  ORG_DOC_KINDS,
  ORG_DOC_LABELS,
  ORG_MISSING_LABELS,
  registerOrganization,
  removeOrgDocument,
  type OrgDocKind,
  type OrgKyc,
} from "@/lib/org.functions";
import { formatDate } from "@/lib/format";

type OrgBasics = {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  status: string;
} | null;

/**
 * تسجيل الجهة الميدانية وطلب اعتمادها (UX-03 + PRD-16).
 *
 * لأيّ حسابٍ مسجَّل: يُنشئ الطلب «بانتظار الاعتماد» ويمنح دور الجهة. ثم
 * تُرفع وثيقة التسجيل أو الترخيص، ولا تعتمد الإدارة قبلها. والطلب المرفوض
 * يُفتح هنا بسببه، فيُصحَّح ويُعاد.
 */
export function OrgRegistration({
  org,
  kyc,
  onChanged,
}: {
  org: OrgBasics;
  kyc: OrgKyc | null;
  onChanged: () => void;
}) {
  const register = useServerFn(registerOrganization);
  const fetchCountries = useServerFn(listOperatingCountries);
  const { data: countries = [] } = useQuery({
    queryKey: ["operating-countries"],
    queryFn: () => fetchCountries(),
    staleTime: 10 * 60_000,
  });
  const k = kyc?.kyc ?? null;
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: org?.name ?? "",
    legalName: k?.legal_name ?? "",
    registrationNumber: k?.registration_number ?? "",
    countryCode: k?.country_code ?? "",
    address: k?.address ?? "",
    legalRepName: k?.legal_rep_name ?? "",
    legalRepTitle: k?.legal_rep_title ?? "",
    contactEmail: k?.contact_email ?? "",
    contactPhone: k?.contact_phone ?? "",
    city: org?.city ?? "",
    region: org?.region ?? "",
    about: "",
  });
  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));
  const status = kyc?.status ?? org?.status ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.contactEmail.trim() && !form.contactPhone.trim()) {
      toast.error("أدخل بريداً أو هاتفاً للتواصل");
      return;
    }
    setBusy(true);
    try {
      const opt = (v: string) => (v.trim() ? v.trim() : undefined);
      const res = await register({
        data: {
          name: form.name.trim(),
          legalName: form.legalName.trim(),
          registrationNumber: form.registrationNumber.trim(),
          countryCode: form.countryCode,
          address: form.address.trim(),
          legalRepName: form.legalRepName.trim(),
          legalRepTitle: opt(form.legalRepTitle),
          contactEmail: opt(form.contactEmail),
          contactPhone: opt(form.contactPhone),
          city: opt(form.city),
          region: opt(form.region),
          about: opt(form.about),
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        status === "rejected" ? "أُعيد الطلب إلى الإدارة" : "سُجّل الطلب — ارفع وثيقة التسجيل",
      );
      onChanged();
    } catch {
      toast.error("تحقّق من الحقول الإلزامية");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      {status && (
        <div
          role="status"
          className="border-border bg-card space-y-2 rounded-2xl border p-5 text-sm leading-7"
        >
          <div className="flex items-center gap-2">
            <Badge variant={status === "rejected" ? "destructive" : "secondary"}>
              {status === "rejected" ? "أُعيد الطلب للتصحيح" : "بانتظار اعتماد الإدارة"}
            </Badge>
            {k?.submitted_at && (
              <span className="text-muted-foreground text-xs">
                قُدّم {formatDate(k.submitted_at)}
              </span>
            )}
          </div>
          {status === "rejected" && k?.decision_note && (
            <p className="text-bridge-ink font-medium">سبب الإعادة: {k.decision_note}</p>
          )}
          {(kyc?.missing.length ?? 0) > 0 ? (
            <div>
              <p className="flex items-center gap-1 font-medium">
                <CircleAlert className="size-4" aria-hidden="true" /> لا تُراجَع الجهة قبل:
              </p>
              <ul className="text-muted-foreground list-disc ps-6">
                {kyc!.missing.map((m) => (
                  <li key={m}>{ORG_MISSING_LABELS[m] ?? m}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-muted-foreground">
              اكتمل الطلب، وتراجعه الإدارة. يصلك إشعارٌ بالقرار.
            </p>
          )}
        </div>
      )}

      <form
        onSubmit={submit}
        className="border-border bg-card space-y-4 rounded-3xl border p-6"
        aria-label="بيانات الجهة"
      >
        <p className="text-muted-foreground text-xs leading-6">
          الحقول المعلَّمة بنجمة إلزامية. بيانات التحقّق (الاسم القانوني ورقم التسجيل والعنوان
          والممثّل) لا تُنشر: تقرؤها الإدارة وحدها.
        </p>
        <TextField
          label="اسم الجهة كما يظهر للكفلاء"
          value={form.name}
          onChange={set("name")}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="الاسم القانوني المسجَّل"
            value={form.legalName}
            onChange={set("legalName")}
            required
          />
          <TextField
            label="رقم التسجيل أو الترخيص"
            value={form.registrationNumber}
            onChange={set("registrationNumber")}
            required
            dir="ltr"
          />
        </div>
        <CountryField
          countries={countries}
          value={form.countryCode}
          onChange={set("countryCode")}
        />
        <TextField label="العنوان الرسمي" value={form.address} onChange={set("address")} required />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="المدينة" value={form.city} onChange={set("city")} />
          <TextField label="المنطقة" value={form.region} onChange={set("region")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="الممثّل القانوني"
            value={form.legalRepName}
            onChange={set("legalRepName")}
            required
          />
          <TextField
            label="صفته (رئيس، مدير…)"
            value={form.legalRepTitle}
            onChange={set("legalRepTitle")}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="بريد التواصل"
            type="email"
            value={form.contactEmail}
            onChange={set("contactEmail")}
            dir="ltr"
            hint="بريدٌ أو هاتف — أحدهما على الأقلّ"
          />
          <TextField
            label="هاتف التواصل"
            type="tel"
            value={form.contactPhone}
            onChange={set("contactPhone")}
            dir="ltr"
          />
        </div>
        <AboutField value={form.about} onChange={set("about")} />
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {status === "rejected"
            ? "إعادة التقديم"
            : status
              ? "حفظ بيانات الطلب"
              : "إرسال طلب الاعتماد"}
        </Button>
      </form>

      {org && kyc && (status === "pending" || status === "rejected") && (
        <OrgDocuments orgId={org.id} documents={kyc.documents} onChanged={onChanged} />
      )}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  required,
  type = "text",
  dir,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  dir?: "ltr" | "rtl";
  hint?: string;
}) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        required={required}
        dir={dir}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2"
      />
      {hint && (
        <p id={`${id}-hint`} className="text-muted-foreground mt-1 text-xs">
          {hint}
        </p>
      )}
    </div>
  );
}

function CountryField({
  countries,
  value,
  onChange,
}: {
  countries: Array<{ code: string; name: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id}>
        الدولة<span aria-hidden="true"> *</span>
      </Label>
      <select
        id={id}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-input bg-background mt-2 h-9 w-full rounded-md border px-3 text-sm"
      >
        <option value="">اختر الدولة</option>
        {countries.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function AboutField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id}>نبذة عن الجهة</Label>
      <Textarea
        id={id}
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2"
      />
    </div>
  );
}

function OrgDocuments({
  orgId,
  documents,
  onChanged,
}: {
  orgId: string;
  documents: OrgKyc["documents"];
  onChanged: () => void;
}) {
  const sign = useServerFn(createOrgDocumentUploadUrl);
  const attach = useServerFn(attachOrgDocument);
  const remove = useServerFn(removeOrgDocument);
  const qc = useQueryClient();
  const [uploading, setUploading] = useState<OrgDocKind | null>(null);

  async function upload(kind: OrgDocKind, file: File | null) {
    if (!file) return;
    setUploading(kind);
    try {
      const signed = await sign({ data: { orgId, kind, fileName: file.name } });
      if (!signed.ok) {
        toast.error(signed.error);
        return;
      }
      const put = await fetch(signed.signedUrl, {
        method: "PUT",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) {
        toast.error("تعذّر رفع الملفّ");
        return;
      }
      const res = await attach({
        data: {
          orgId,
          kind,
          path: signed.path,
          fileName: file.name,
          mimeType: file.type || undefined,
          sizeBytes: file.size,
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`رُفعت ${ORG_DOC_LABELS[kind]}`);
      await qc.invalidateQueries({ queryKey: ["org-kyc"] });
      onChanged();
    } finally {
      setUploading(null);
    }
  }

  return (
    <section className="border-border bg-card rounded-3xl border p-6" aria-labelledby="org-docs-h">
      <h2 id="org-docs-h" className="font-bold">
        وثائق التحقّق
      </h2>
      <p className="text-muted-foreground mt-1 text-xs leading-6">
        تُحفظ في خزنةٍ خاصّة لا يراها إلا أنتم والإدارة. شهادة التسجيل أو الترخيص شرطٌ للاعتماد.
      </p>
      <ul className="mt-4 space-y-2">
        {ORG_DOC_KINDS.map((kind) => {
          const have = documents.filter((d) => d.kind === kind);
          return (
            <li
              key={kind}
              className="border-border flex flex-wrap items-center gap-2 rounded-lg border p-3"
            >
              <span className="flex-1 text-sm">{ORG_DOC_LABELS[kind]}</span>
              {have.map((d) => (
                <span key={d.id} className="inline-flex items-center gap-1 text-xs">
                  <FileCheck2 className="text-shore-thrive size-3" aria-hidden="true" />
                  <span dir="auto">{d.file_name ?? "ملفّ"}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`حذف ${d.file_name ?? ORG_DOC_LABELS[kind]}`}
                    onClick={async () => {
                      const res = await remove({ data: { id: d.id } });
                      if (!res.ok) toast.error(res.error);
                      onChanged();
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </span>
              ))}
              <FilePicker
                label={have.length > 0 ? "استبدال / إضافة" : "اختر ملفاً"}
                accessibleLabel={`رفع ${ORG_DOC_LABELS[kind]}`}
                busy={uploading === kind}
                disabled={uploading !== null}
                showName={false}
                onPick={(f) => void upload(kind, f)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
