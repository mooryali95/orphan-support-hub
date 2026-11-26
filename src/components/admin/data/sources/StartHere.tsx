import { Button } from "@/components/ui/button";
import { canDo, type CountryAccess, type CountryHealth } from "@/lib/golden-record";
import { useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { CARD } from "../shared";
import { SOURCES_COPY } from "../sources-copy";
import { type Tab } from "./shared";

/**
 * «ابدأ من هنا»: أوّل قرارٍ ينتظر صاحب الصفحة بحسب دوره، وما يملكه فيها، بلا بحث.
 * المشرف والإدارة: أكثر الدول بنوداً حرجة. المدخل: الرفع. المطّلع: القراءة.
 */
export function StartHere({
  rows,
  access,
  onGo,
}: {
  rows: CountryHealth[];
  access: CountryAccess;
  onGo: (code: string, tab: Tab) => void;
}) {
  const c = useCopy(SOURCES_COPY);
  const role = access.admin ? "admin" : (access.countries[0]?.role ?? "viewer");
  const urgent = rows
    .map((r) => ({ r, n: r.alerts.critical + r.conflicts.critical }))
    .filter((x) => x.n > 0 && canDo(access, x.r.code, "approve"))
    .sort((a, b) => b.n - a.n)[0];
  const linking = rows.find((r) => r.link_pending > 0 && canDo(access, r.code, "approve"));
  const upload = rows.find((r) => canDo(access, r.code, "import"));
  const action = urgent
    ? {
        text: c.startUrgent(urgent.r.name_ar, urgent.n),
        code: urgent.r.code,
        tab: "alerts" as const,
      }
    : linking
      ? {
          text: c.startLinks(linking.name_ar, linking.link_pending),
          code: linking.code,
          tab: "links" as const,
        }
      : role === "data_entry" && upload
        ? { text: c.startUpload(upload.name_ar), code: upload.code, tab: "upload" as const }
        : null;
  return (
    <section
      aria-label={c.startLabel}
      className={cn(CARD, "flex flex-wrap items-center gap-x-6 gap-y-3 p-4")}
    >
      <div className="min-w-0 flex-1 basis-72">
        <p className="text-xs font-semibold text-muted-foreground">
          {c.yourRole}: <span className="text-foreground">{c.roleNames[role]}</span>
        </p>
        <p className="mt-1 text-sm leading-7">{c.roleCan[role]}</p>
      </div>
      {action ? (
        <Button className="min-h-11 w-full sm:w-auto" onClick={() => onGo(action.code, action.tab)}>
          {action.text}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">{c.startNothing}</p>
      )}
    </section>
  );
}
