import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Clock, Lock, Loader2, Pencil, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  getOrphanProfile,
  saveProfileSection,
  SECTION_FIELDS,
  SECTION_LABELS,
  SENSITIVE_SECTIONS,
} from "@/lib/profile.functions";
import type { ProfileSection, ProfileSectionRow } from "@/integrations/supabase/types.extra";
import { formatDate } from "@/lib/format";

const ALL_SECTIONS: ProfileSection[] = [
  "education",
  "aspiration",
  "family",
  "health",
  "social",
  "supervisor_note",
];

const ROLE_LABELS: Record<string, string> = {
  supervisor: "المشرف",
  guardian: "الوليّ",
  trustee: "الوصيّ",
  jurist: "الفقيه",
  mentor: "المرشد",
  care_org: "جهة الرعاية",
  admin: "الإدارة",
};

/** قسمٌ لم يُحدَّث منذ سنة يُعرض بوصفه واقعاً وهو مسؤولية. */
const STALE_DAYS = 365;

/**
 * «قسمٌ محجوب» عربيّاً — والصفة تُطابق المعدود: مفردٌ، فمثنّى، فجمعُ
 * قلّةٍ، فتمييزٌ مفرد منصوب. وتركيبُ العدد والصفة منفصلين يُنتج
 * «قسمان محجوبة».
 */
function hiddenLabel(n: number): string {
  if (n === 1) return "قسم واحد محجوب";
  if (n === 2) return "قسمان محجوبان";
  if (n <= 10) return `${n} أقسام محجوبة`;
  return `${n} قسماً محجوباً`;
}

/**
 * البروفايل الكامل.
 *
 * يُقرأ بحسب الصلة: الدائرة ترى الكلّ وتكتب، ومن أُذن له بالاطّلاع يرى
 * غير الحسّاس — **ويُقال له إنّ ثمّة محجوباً** فلا يظنّ البروفايل
 * ناقصاً. والقاعدة هي من تقسم لا هذا المكوّن.
 */
export function OrphanProfilePanel({
  orphanId,
  orphanName,
}: {
  orphanId: string;
  orphanName: string;
}) {
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getOrphanProfile);
  const save = useServerFn(saveProfileSection);

  const { data, isPending } = useQuery({
    queryKey: ["orphan-profile", orphanId],
    queryFn: () => fetchProfile({ data: { orphanId } }),
  });

  const [editing, setEditing] = useState<ProfileSection | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const profile = data?.profile;

  if (isPending) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        جارٍ تحميل البروفايل…
      </div>
    );
  }

  if (!profile?.may_read) return null;

  const bySection = new Map<ProfileSection, ProfileSectionRow>(
    profile.sections.map((s) => [s.section, s]),
  );
  const mayWrite = Boolean(profile.may_write);
  const visible = mayWrite
    ? ALL_SECTIONS
    : ALL_SECTIONS.filter((s) => !SENSITIVE_SECTIONS.includes(s));

  function openEditor(section: ProfileSection) {
    const row = bySection.get(section);
    setFields(row?.data ?? {});
    setNote(row?.note ?? "");
    setEditing(section);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      const clean: Record<string, string> = {};
      for (const [key] of SECTION_FIELDS[editing]) {
        const v = (fields[key] ?? "").trim();
        if (v) clean[key] = v;
      }
      if (Object.keys(clean).length === 0 && !note.trim()) {
        toast.error("القسم الخالي لا يُحفظ — اكتب حقلاً أو ملاحظة");
        return;
      }
      const res = await save({
        data: {
          orphanId,
          section: editing,
          data: clean,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      if (!res.ok) {
        toast.error(res.error ?? "تعذّر الحفظ");
        return;
      }
      toast.success("حُفظ القسم");
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["orphan-profile", orphanId] });
      void queryClient.invalidateQueries({ queryKey: ["profile-completeness", orphanId] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="mt-6 rounded-3xl border border-border bg-card p-6"
      aria-labelledby="profile-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="profile-heading" className="flex items-center gap-2 text-lg font-bold">
          <UserRound className="size-5 text-shore-need" aria-hidden="true" />
          بروفايل {orphanName}
        </h2>
        {mayWrite ? (
          <Badge variant="secondary">
            {profile.sections.length} من {ALL_SECTIONS.length} أقسام
          </Badge>
        ) : (
          (profile.hidden_sections ?? 0) > 0 && (
            <Badge variant="outline" className="gap-1">
              <Lock className="size-3" aria-hidden="true" />
              {hiddenLabel(profile.hidden_sections ?? 0)}
            </Badge>
          )
        )}
      </div>

      {!mayWrite && (profile.hidden_sections ?? 0) > 0 && (
        <p className="mt-3 rounded-xl bg-secondary/60 p-3 text-xs leading-6 text-muted-foreground">
          أقسام الصحّة والأسرة والوضع النفسي وملاحظة المشرف لا تُفتح بإذن الاطّلاع: ملفٌّ طبّيٌّ أو
          نفسيٌّ لطفل ليس مما يُطّلع عليه ليُتّخذ قرار كفالة. وهي عند من حوله — وليّه ووصيّه ومشرفه
          وجهته.
        </p>
      )}

      {mayWrite && (
        <p className="mt-3 text-xs leading-6 text-muted-foreground">
          يكتبه من حول الطفل: وليُّه أو وصيُّه أو مشرفه أو جهته. وصفتُك تُسجَّل مع ما تكتب، والتاريخ
          يتحرّك بالتغيير لا باللمس.
        </p>
      )}

      <ul className="mt-5 space-y-3">
        {visible.map((section) => {
          const row = bySection.get(section);
          const stale = row ? row.age_days > STALE_DAYS : false;
          return (
            <li key={section} className="rounded-2xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  {SECTION_LABELS[section]}
                  {SENSITIVE_SECTIONS.includes(section) && (
                    <Lock className="size-3 text-muted-foreground" aria-label="قسم حسّاس" />
                  )}
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  {row && (
                    <span
                      className={`text-[11px] ${stale ? "text-bridge-ink" : "text-muted-foreground"}`}
                    >
                      {stale && <Clock className="me-1 inline size-3" aria-hidden="true" />}
                      {ROLE_LABELS[row.updated_role ?? ""] ?? row.updated_role} —{" "}
                      {formatDate(row.updated_at)}
                      {stale && " (يحتاج تحديثاً)"}
                    </span>
                  )}
                  {mayWrite && (
                    <Button
                      size="sm"
                      variant="outline"
                      aria-expanded={editing === section}
                      onClick={() => (editing === section ? setEditing(null) : openEditor(section))}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                      {row ? "تعديل" : "تعبئة"}
                    </Button>
                  )}
                </div>
              </div>

              {!row && editing !== section && (
                <p className="mt-2 text-xs text-muted-foreground">لم يُعبَّأ بعد.</p>
              )}

              {row && editing !== section && (
                <>
                  <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
                    {SECTION_FIELDS[section]
                      .filter(([key]) => row.data[key])
                      .map(([key, label]) => (
                        <div key={key}>
                          <dt className="inline font-medium">{label}: </dt>
                          <dd className="inline text-muted-foreground">{row.data[key]}</dd>
                        </div>
                      ))}
                  </dl>
                  {row.note && (
                    <p className="mt-3 whitespace-pre-line rounded-xl bg-secondary/60 p-3 text-xs leading-6">
                      {row.note}
                    </p>
                  )}
                </>
              )}

              {editing === section && (
                <form onSubmit={onSave} className="mt-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {SECTION_FIELDS[section].map(([key, label]) => (
                      <div key={key}>
                        <Label htmlFor={`pf-${key}`} className="text-xs">
                          {label}
                        </Label>
                        <Input
                          id={`pf-${key}`}
                          value={fields[key] ?? ""}
                          onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                          maxLength={500}
                          className="mt-1 h-9"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <Label htmlFor={`pf-note-${section}`} className="text-xs">
                      ملاحظة
                    </Label>
                    <Textarea
                      id={`pf-note-${section}`}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      maxLength={2000}
                      className="mt-1"
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="submit" size="sm" disabled={busy}>
                      {busy && <Loader2 className="size-4 animate-spin" />}
                      حفظ
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(null)}
                    >
                      إلغاء
                    </Button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
