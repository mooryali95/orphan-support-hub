import { Check, FolderOpen } from "lucide-react";
import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { showValue, type Conflict } from "@/lib/golden-record";
import { formatDate } from "@/lib/format";
import { useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { SOURCES_COPY } from "../sources-copy";
import { WORK_COPY } from "../work-copy";

export function useErr() {
  const c = useCopy(SOURCES_COPY);
  return (code: string | undefined) => c.errors[code ?? ""] ?? c.errors["failed"]!;
}

export type Tab = "alerts" | "conflicts" | "links" | "upload" | "updates" | "mode" | "team";

/** تاريخٌ بلغة الواجهة، معزولٌ عن اتجاه السطر. */
export function useWhen() {
  const locale = useLocale();
  return (iso: string | null) => (iso ? formatDate(iso, locale) : null);
}

/** قيمة حقلٍ كما وصلت (تاريخ، رمز، اسمٌ لاتيني): كتلةٌ لا يقلبها اتجاه السطر. */
export function Val({ children }: { children: string }) {
  return (
    <bdi dir="auto" className="font-medium">
      {children}
    </bdi>
  );
}

/** قيمة تعارضٍ (نصّ، أو نعم/لا، أو غائب) معزولةً. */
export function V({ v }: { v: Conflict["current"] }) {
  const c = useCopy(SOURCES_COPY);
  const t = showValue(v, c.yes, c.no, "·");
  return t === "·" ? <span className="text-muted-foreground">·</span> : <Val>{t}</Val>;
}

export function Step({
  n,
  title,
  done,
  children,
}: {
  n: string;
  title: string;
  done: boolean;
  children: ReactNode;
}) {
  return (
    <li className="relative ps-10">
      <span
        aria-hidden="true"
        className={cn(
          "absolute start-0 top-0 inline-flex size-7 items-center justify-center rounded-full text-sm font-bold tabular-nums",
          done ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
        )}
      >
        {done ? <Check className="size-4" /> : n}
      </span>
      <h5 className="text-sm font-bold leading-7">{title}</h5>
      <div className="mt-2">{children}</div>
    </li>
  );
}

/** خيارات المرشّح من البنود نفسها: حقولٌ بلا بنود لا تزحم القائمة. */
export function fieldOptions(items: Array<{ field: string }>, names: Record<string, string>) {
  return [...new Set(items.map((x) => x.field))]
    .map((f) => ({ value: f, label: names[f] ?? f }))
    .sort((a, b) => a.label.localeCompare(b.label, "ar"));
}

export function OpenFile({ id, onOpen }: { id: string | null; onOpen: (id: string) => void }) {
  const w = useCopy(WORK_COPY);
  if (!id) return null;
  return (
    <Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={() => onOpen(id)}>
      <FolderOpen className="size-4" aria-hidden="true" />
      {w.openFile}
    </Button>
  );
}
