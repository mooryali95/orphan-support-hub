import { createLazyFileRoute } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { TryRoleHeader } from "@/components/try/TryRoleHeader";
import { Button } from "@/components/ui/button";
import { loadGifts, TRY_CHILDREN, tryChild, type TryChild } from "@/lib/try-demo";
import { addVisit, loadVisits, useTrialValue, type Visit } from "@/lib/try-role-state";
import { cn } from "@/lib/utils";

export const Route = createLazyFileRoute("/try/supervisor")({ component: TrySupervisor });

const when = (iso: string) =>
  new Date(iso).toLocaleString("ar", {
    numberingSystem: "latn",
    dateStyle: "medium",
    timeStyle: "short",
  });

/** أطفال المشرف: من كفلهم الزائر في جلسته أوّلاً، ثم أطفالٌ نموذجيون في منطقته */
function useChildren(): Array<TryChild & { mine: boolean }> {
  const gifts = useTrialValue(loadGifts, []);
  const mine = [...new Set(gifts.map((g) => g.childId))]
    .map((id) => tryChild(id))
    .filter((k): k is TryChild => !!k);
  const ids = new Set(mine.map((k) => k.id));
  return [
    ...mine.map((k) => ({ ...k, mine: true })),
    ...TRY_CHILDREN.filter((k) => !ids.has(k.id))
      .slice(0, 4)
      .map((k) => ({ ...k, mine: false })),
  ];
}

/**
 * واجهة المشرف في العرض: زيارة المتابعة تُسجَّل بحال الطفل وملاحظة، فتصير جزءاً من ملفّه.
 * في الحقيقة المشرف معتمدٌ مستقلّ، ولا يرى إلا أطفال تكليفه.
 */
function TrySupervisor() {
  const kids = useChildren();
  const visits = useTrialValue<Visit[]>(loadVisits, []);
  const [open, setOpen] = useState<string | null>(null);
  const [state, setState] = useState<Visit["state"]>("good");
  const [note, setNote] = useState("");

  const save = (k: TryChild) => {
    addVisit({ childId: k.id, at: new Date().toISOString(), state, note: note.trim() });
    toast.success(`سُجّلت زيارة ${k.name}`, {
      description: "محاكاة: في الحقيقة تُرفق صورٌ وتُرسل للمكتب",
    });
    setOpen(null);
    setNote("");
    setState("good");
  };

  return (
    <div>
      <TryRoleHeader
        role="المشرف"
        title="زيارات المتابعة"
        lead="المشرف يزور الطفل، ويسجّل حاله وما يحتاجه. الزيارة تدخل ملفّ الطفل، ويُبنى عليها تقرير الكافل الشهري. الطفل الذي كفلته أنت يظهر هنا أوّلاً."
        real="مشرفٌ معتمد مستقلّ عن الجهة، يرى أطفال تكليفه وحدهم"
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="sup-kids">
          <h2 id="sup-kids" className="text-lg font-bold">
            أطفال تكليفك
          </h2>
          <ul className="mt-4 grid gap-3">
            {kids.map((k) => {
              const last = visits.find((v) => v.childId === k.id);
              const editing = open === k.id;
              return (
                <li
                  key={k.id}
                  className={cn(
                    "rounded-2xl border p-4 shadow-soft",
                    k.mine ? "border-bridge/60 bg-bridge/8" : "border-border bg-card",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="font-bold">{k.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {" "}
                        · {k.age} سنوات · {k.country}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {k.mine ? "كفلته أنت في هذه الجلسة · " : ""}
                        {last ? `آخر زيارة: ${when(last.at)}` : "لم يُزر هذا الشهر"}
                      </span>
                    </span>
                    {!editing && (
                      <Button size="sm" onClick={() => setOpen(k.id)}>
                        <ClipboardCheck className="size-4" aria-hidden="true" />
                        سجّل زيارة
                      </Button>
                    )}
                  </div>
                  {editing && (
                    <form
                      className="mt-4 space-y-3 border-t border-border pt-4"
                      onSubmit={(e) => {
                        e.preventDefault();
                        save(k);
                      }}
                    >
                      <fieldset className="flex flex-wrap gap-2">
                        <legend className="mb-2 text-sm font-bold">حال الطفل</legend>
                        {(
                          [
                            ["good", "بخير ومستقرّ"],
                            ["follow", "يحتاج متابعة"],
                          ] as const
                        ).map(([v, label]) => (
                          <button
                            key={v}
                            type="button"
                            aria-pressed={state === v}
                            onClick={() => setState(v)}
                            className={cn(
                              "min-h-10 rounded-full border px-4 text-sm font-bold",
                              state === v
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background",
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </fieldset>
                      <label className="block text-sm">
                        <span className="font-bold">ملاحظة الزيارة</span>
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          rows={2}
                          placeholder="مثلاً: انتظم في المدرسة، ويحتاج نظّارة طبية"
                          className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2"
                        />
                      </label>
                      <div className="flex gap-2">
                        <Button type="submit">احفظ الزيارة</Button>
                        <Button type="button" variant="ghost" onClick={() => setOpen(null)}>
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

        <section
          aria-labelledby="sup-log"
          className="self-start rounded-2xl border border-border bg-card p-5 shadow-soft"
        >
          <h2 id="sup-log" className="text-lg font-bold">
            سجلّ الزيارات
          </h2>
          {visits.length === 0 ? (
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              لا زيارات بعد. سجّل زيارةً لطفلٍ وستظهر هنا بتاريخها.
            </p>
          ) : (
            <ol className="mt-3 space-y-3">
              {visits.map((v) => (
                <li key={v.at + v.childId} className="border-s-2 border-primary/30 ps-3 text-sm">
                  <span className="font-bold">{tryChild(v.childId)?.name ?? "—"}</span>
                  <span
                    className={cn(
                      "ms-2 text-xs font-bold",
                      v.state === "good" ? "text-shore-thrive" : "text-bridge-ink",
                    )}
                  >
                    {v.state === "good" ? "بخير" : "يحتاج متابعة"}
                  </span>
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {when(v.at)}
                  </span>
                  {v.note && <span className="mt-1 block leading-6">{v.note}</span>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
