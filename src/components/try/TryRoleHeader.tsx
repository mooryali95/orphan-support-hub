import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

/**
 * رأس واجهات الأدوار في العرض التفاعلي، بطرازٍ واحد: الدور، والعنوان، وما يجرّبه الحاضر،
 * وشارة «في الحقيقة» تقول ما يختلف في المنصّة الحقيقية — فلا يُظنّ العرض هو المنصّة.
 */
export function TryRoleHeader({
  role,
  title,
  lead,
  real,
  children,
}: {
  role: string;
  title: string;
  lead: string;
  real: string;
  children?: ReactNode;
}) {
  return (
    <header className="try-rise flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="eyebrow">العرض التفاعلي · {role}</p>
        <h1 className="mt-3 text-4xl leading-[1.3] font-bold">{title}</h1>
        <p className="mt-2 max-w-2xl text-base leading-8 text-muted-foreground">{lead}</p>
        {children}
      </div>
      <span className="inline-flex max-w-sm items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs leading-6 font-bold text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
        في الحقيقة: {real}
      </span>
    </header>
  );
}
