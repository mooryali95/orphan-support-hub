import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CountryPicker } from "@/components/geo/CountryPicker";
import { countryName } from "@/lib/countries";
import { listRegistry, upsertRegistry, type RegistryName } from "@/lib/inbox.functions";

type Field = { key: string; label: string; type: "text" | "number" | "bool" | "status" };

const DEFS: Record<RegistryName, { title: string; hint: string; fields: Field[] }> = {
  countries: {
    title: "الدول",
    hint: "الدولة المخطّطة لا تستقبل دعماً حتى تُفعَّل.",
    fields: [
      { key: "code", label: "الرمز (AL)", type: "text" },
      { key: "name_ar", label: "الاسم", type: "text" },
      { key: "name_local", label: "الاسم المحلي", type: "text" },
      { key: "status", label: "الحالة", type: "status" },
      { key: "sort_order", label: "الترتيب", type: "number" },
    ],
  },
  institution_kinds: {
    title: "أصناف المؤسسات",
    hint: "مركز، مكتب، مدرسة… تظهر في تسجيل الجهات وأهداف الدعم.",
    fields: [
      { key: "key", label: "المفتاح (center)", type: "text" },
      { key: "label", label: "الاسم", type: "text" },
      { key: "sort_order", label: "الترتيب", type: "number" },
      { key: "active", label: "مفعّل", type: "bool" },
    ],
  },
  office_roles: {
    title: "أدوار المكاتب",
    hint: "يكتب: يرفع تقارير وتسليمات. ينشر: يعتمد التقرير للداعمين.",
    fields: [
      { key: "key", label: "المفتاح (manager)", type: "text" },
      { key: "label", label: "الاسم", type: "text" },
      { key: "can_write", label: "يكتب", type: "bool" },
      { key: "can_publish", label: "ينشر", type: "bool" },
      { key: "sort_order", label: "الترتيب", type: "number" },
    ],
  },
};

const STATUS = [
  ["planned", "مخطّطة"],
  ["active", "مفعّلة"],
  ["paused", "موقوفة"],
] as const;

/** سجلّات المنصّة تُدار من هنا: كل صفٍّ يُضاف أو يُعدَّل بلا برمجة. */
export function PlatformRegistries() {
  return (
    <div className="space-y-10">
      {(Object.keys(DEFS) as RegistryName[]).map((t) => (
        <Registry key={t} table={t} />
      ))}
    </div>
  );
}

type Row = Record<string, string | number | boolean | null>;

function Registry({ table }: { table: RegistryName }) {
  const def = DEFS[table];
  const fetchRows = useServerFn(listRegistry);
  const save = useServerFn(upsertRegistry);
  const qc = useQueryClient();
  const { data: raw } = useQuery({
    queryKey: ["registry", table],
    queryFn: () => fetchRows({ data: { table } }),
  });
  const rows = raw ? (JSON.parse(raw) as Row[]) : [];
  const [draft, setDraft] = useState<Row>({});

  async function commit(row: Row) {
    const res = await save({ data: { table, row } });
    if (!res.ok) {
      toast.error("تعذّر الحفظ — تحقّق من الصيغة");
      return false;
    }
    toast.success("حُفظ");
    await qc.invalidateQueries({ queryKey: ["registry", table] });
    return true;
  }

  return (
    <section>
      <h2 className="text-lg font-bold">{def.title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{def.hint}</p>
      {table === "countries" && (
        // أي دولة في العالم بضغطة: الرمز والاسمان يُملآن، ويبقى التعديل ممكناً.
        <div className="mt-3 max-w-xs">
          <CountryPicker
            value={String(draft["code"] ?? "")}
            allLabel={null}
            placeholder="أضف دولة من العالم…"
            onChange={(code) =>
              setDraft((d) => ({
                ...d,
                code,
                name_ar: countryName(code, "ar"),
                name_local: countryName(code, "en"),
                status: d["status"] ?? "planned",
              }))
            }
          />
        </div>
      )}
      <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="bg-secondary/60 text-xs text-muted-foreground">
            <tr>
              {def.fields.map((f) => (
                <th key={f.key} className="px-3 py-2 text-start font-medium">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={String(r[def.fields[0]!.key])}>
                {def.fields.map((f) => (
                  <td key={f.key} className="px-3 py-2">
                    {f.type === "bool" ? (
                      <input
                        type="checkbox"
                        aria-label={f.label}
                        checked={Boolean(r[f.key])}
                        onChange={(e) => void commit({ ...r, [f.key]: e.target.checked })}
                      />
                    ) : f.type === "status" ? (
                      <select
                        aria-label={f.label}
                        value={String(r[f.key] ?? "planned")}
                        onChange={(e) => void commit({ ...r, [f.key]: e.target.value })}
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        {STATUS.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>{String(r[f.key] ?? "")}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-secondary/20">
              {def.fields.map((f) => (
                <td key={f.key} className="px-3 py-2">
                  {f.type === "bool" ? (
                    <input
                      type="checkbox"
                      aria-label={`${f.label} (جديد)`}
                      checked={Boolean(draft[f.key])}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.checked }))}
                    />
                  ) : f.type === "status" ? (
                    <select
                      aria-label={`${f.label} (جديد)`}
                      value={String(draft[f.key] ?? "planned")}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                      className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      {STATUS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      aria-label={`${f.label} (جديد)`}
                      className="h-8"
                      type={f.type === "number" ? "number" : "text"}
                      value={String(draft[f.key] ?? "")}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          [f.key]: f.type === "number" ? Number(e.target.value) : e.target.value,
                        }))
                      }
                    />
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <Button
        size="sm"
        className="mt-2"
        disabled={!draft[def.fields[0]!.key] || !draft[def.fields[1]!.key]}
        onClick={async () => {
          if (await commit(draft)) setDraft({});
        }}
      >
        <Plus className="size-4" /> إضافة
      </Button>
    </section>
  );
}
