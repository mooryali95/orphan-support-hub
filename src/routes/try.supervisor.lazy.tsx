import { createLazyFileRoute } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { TryRoleHeader } from "@/components/try/TryRoleHeader";
import { Button } from "@/components/ui/button";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { loadGifts, localTryChild, TRY_CHILDREN, type TryChild } from "@/lib/try-demo";
import { trialChild } from "@/lib/try-cycle";
import { addVisit, loadVisits, useTrialValue, type Visit } from "@/lib/try-role-state";
import { cn } from "@/lib/utils";

export const Route = createLazyFileRoute("/try/supervisor")({ component: TrySupervisor });

const COPY = defineCopy("routes/try.supervisor", {
  ar: {
    saved: (n: string) => `سُجّلت زيارة ${n}`,
    savedNote: "محاكاة: في الحقيقة تُرفق صورٌ وتُرسل للمكتب",
    role: "المشرف",
    title: "زيارات المتابعة",
    lead: "المشرف يزور الطفل، ويسجّل حاله وما يحتاجه. الزيارة تدخل ملفّ الطفل، وتصل الكافل في «أثري». الطفل الذي كفلته أنت يظهر هنا أوّلاً.",
    real: "مشرفٌ معتمد مستقلّ عن الجهة، يرى أطفال تكليفه وحدهم",
    kids: "أطفال تكليفك",
    age: (n: number) => `${n} سنوات`,
    mine: "كفلته أنت في هذه الجلسة · ",
    last: (d: string) => `آخر زيارة: ${d}`,
    never: "لم يُزر هذا الشهر",
    record: "سجّل زيارة",
    state: "حال الطفل",
    good: "بخير ومستقرّ",
    follow: "يحتاج متابعة",
    goodShort: "بخير",
    note: "ملاحظة الزيارة",
    placeholder: "مثلاً: انتظم في المدرسة، ويحتاج نظّارة طبية",
    save: "احفظ الزيارة",
    cancel: "إلغاء",
    log: "سجلّ الزيارات",
    empty: "لا زيارات بعد. سجّل زيارةً لطفلٍ وستظهر هنا بتاريخها.",
  },
  en: {
    saved: (n: string) => `Visit to ${n} recorded`,
    savedNote: "Simulated: on the live platform photos are attached and sent to the office",
    role: "Supervisor",
    title: "Follow-up visits",
    lead: "The supervisor visits the child and records how they are and what they need. The visit joins the child's file and reaches the sponsor in My impact. A child you sponsored appears here first.",
    real: "a certified supervisor, independent of the organization, who sees only assigned children",
    kids: "Your assigned children",
    age: (n: number) => `${n} years old`,
    mine: "You sponsored this child in this session · ",
    last: (d: string) => `Last visit: ${d}`,
    never: "Not visited this month",
    record: "Record a visit",
    state: "How the child is",
    good: "Doing well",
    follow: "Needs follow-up",
    goodShort: "Well",
    note: "Visit note",
    placeholder: "For example: attending school regularly, needs glasses",
    save: "Save the visit",
    cancel: "Cancel",
    log: "Visit log",
    empty: "No visits yet. Record a visit and it appears here with its date.",
  },
});

const whenIn = (locale: string) => (iso: string) =>
  new Date(iso).toLocaleString(locale, {
    numberingSystem: "latn",
    dateStyle: "medium",
    timeStyle: "short",
  });

/** أطفال المشرف: من كفلهم الزائر في جلسته أوّلاً، ثم أطفالٌ نموذجيون في منطقته */
function useChildren(): Array<TryChild & { mine: boolean }> {
  const locale = useLocale();
  const gifts = useTrialValue(loadGifts, []);
  const mine = [...new Set(gifts.map((g) => g.childId))]
    .map((id) => trialChild(id))
    .filter((k): k is TryChild => !!k)
    .map((k) => localTryChild(k, locale));
  const ids = new Set(mine.map((k) => k.id));
  return [
    ...mine.map((k) => ({ ...k, mine: true })),
    ...TRY_CHILDREN.filter((k) => !ids.has(k.id))
      .slice(0, 4)
      .map((k) => ({ ...localTryChild(k, locale), mine: false })),
  ];
}

/**
 * واجهة المشرف في العرض: زيارة المتابعة تُسجَّل بحال الطفل وملاحظة، فتصير جزءاً من ملفّه.
 * في الحقيقة المشرف معتمدٌ مستقلّ، ولا يرى إلا أطفال تكليفه.
 */
function TrySupervisor() {
  const t = useCopy(COPY);
  const locale = useLocale();
  const when = whenIn(locale);
  const kids = useChildren();
  const visits = useTrialValue<Visit[]>(loadVisits, []);
  const [open, setOpen] = useState<string | null>(null);
  const [state, setState] = useState<Visit["state"]>("good");
  const [note, setNote] = useState("");

  const save = (k: TryChild) => {
    addVisit({ childId: k.id, at: new Date().toISOString(), state, note: note.trim() });
    toast.success(t.saved(k.name), {
      description: t.savedNote,
    });
    setOpen(null);
    setNote("");
    setState("good");
  };

  return (
    <div>
      <TryRoleHeader role={t.role} title={t.title} lead={t.lead} real={t.real} />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="sup-kids">
          <h2 id="sup-kids" className="text-lg font-bold">
            {t.kids}
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
                        · {t.age(k.age)} · {k.country}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {k.mine ? t.mine : ""}
                        {last ? t.last(when(last.at)) : t.never}
                      </span>
                    </span>
                    {!editing && (
                      <Button size="sm" onClick={() => setOpen(k.id)}>
                        <ClipboardCheck className="size-4" aria-hidden="true" />
                        {t.record}
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
                        <legend className="mb-2 text-sm font-bold">{t.state}</legend>
                        {(
                          [
                            ["good", t.good],
                            ["follow", t.follow],
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
                        <span className="font-bold">{t.note}</span>
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          rows={2}
                          placeholder={t.placeholder}
                          className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2"
                        />
                      </label>
                      <div className="flex gap-2">
                        <Button type="submit">{t.save}</Button>
                        <Button type="button" variant="ghost" onClick={() => setOpen(null)}>
                          {t.cancel}
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
            {t.log}
          </h2>
          {visits.length === 0 ? (
            <p className="mt-2 text-sm leading-7 text-muted-foreground">{t.empty}</p>
          ) : (
            <ol className="mt-3 space-y-3">
              {visits.map((v) => (
                <li key={v.at + v.childId} className="border-s-2 border-primary/30 ps-3 text-sm">
                  <span className="font-bold">
                    {(() => {
                      const k = trialChild(v.childId);
                      return k ? localTryChild(k, locale).name : "—";
                    })()}
                  </span>
                  <span
                    className={cn(
                      "ms-2 text-xs font-bold",
                      v.state === "good" ? "text-shore-thrive" : "text-bridge-ink",
                    )}
                  >
                    {v.state === "good" ? t.goodShort : t.follow}
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
