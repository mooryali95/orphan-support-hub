import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { useEffect, useState } from "react";

import { FOLLOW_EVENT, loadFollowed, toggleFollowed, type Followed } from "@/lib/followed";
import { defineCopy, useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";

const COPY = defineCopy("components/support/Follow", {
  ar: {
    follow: "تابِع",
    following: "تتابعه",
    title: "تتابعهم",
    hint: "محفوظون في متصفّحك وحده لتعود إليهم.",
  },
  en: {
    follow: "Follow",
    following: "Following",
    title: "You follow",
    hint: "Saved in your browser only, so you can come back to them.",
  },
});

function useFollowed(): Followed[] {
  const [list, setList] = useState<Followed[]>([]);
  useEffect(() => {
    const read = () => setList(loadFollowed());
    read();
    window.addEventListener(FOLLOW_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(FOLLOW_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return list;
}

/** a quiet heart beside the child's name: keep them for later, no account needed */
export function FollowButton({ child, className }: { child: Followed; className?: string }) {
  const c = useCopy(COPY);
  const on = useFollowed().some((x) => x.id === child.id);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => toggleFollowed(child)}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-bold transition-colors",
        on
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <Heart className={cn("size-4", on && "fill-current")} aria-hidden="true" />
      {on ? c.following : c.follow}
    </button>
  );
}

/** the children this visitor follows, at the top of the directory */
export function FollowedStrip({ className }: { className?: string }) {
  const c = useCopy(COPY);
  const list = useFollowed();
  if (!list.length) return null;
  return (
    <section
      aria-labelledby="followed"
      className={cn("rounded-2xl border border-border bg-card p-4", className)}
    >
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 id="followed" className="text-sm font-bold">
          {c.title}
        </h2>
        <p className="text-xs text-muted-foreground">{c.hint}</p>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {list.map((x) => (
          <li key={x.id}>
            <Link
              to="/orphans/$orphanId"
              params={{ orphanId: x.id }}
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-secondary px-4 text-sm font-medium hover:bg-primary/10"
            >
              <Heart className="size-3.5 fill-current text-primary" aria-hidden="true" />
              {x.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
