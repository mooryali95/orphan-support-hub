import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Bell, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { listNotifications, markNotificationsRead } from "@/lib/impact.functions";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * مركز الإشعارات.
 *
 * وجوده في الترويسة مقصود: الكافل يدخل ليتصفّح لا ليبحث عن أخبار، فإن
 * لم يقع الخبر في طريقه لم يصل. والعدّاد هو ما يجعله يقع.
 */
export function NotificationBell() {
  const fetchAll = useServerFn(listNotifications);
  const markRead = useServerFn(markNotificationsRead);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchAll(),
    // دقيقة: أقصر من ذلك استطلاع بلا داعٍ، وأطول يجعل الخبر بائتاً.
    refetchInterval: 60_000,
  });

  const items = data?.notifications ?? [];
  const unread = data?.unread ?? 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="notification-panel"
        aria-label={unread > 0 ? `الإشعارات، ${unread} غير مقروء` : "الإشعارات"}
        className="border-border hover:bg-secondary relative inline-flex size-9 items-center justify-center rounded-lg border"
      >
        <Bell className="size-4" aria-hidden="true" />
        {unread > 0 && (
          <span
            className="bg-shore-need absolute -top-1 -end-1 min-w-4 rounded-full px-1 text-[10px] font-bold text-white tabular-nums"
            aria-hidden="true"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id="notification-panel"
          className="border-border bg-card absolute end-0 z-50 mt-2 w-80 rounded-xl border shadow-lg"
        >
          <div className="border-border flex items-center justify-between border-b p-3">
            <h2 className="text-sm font-bold">الإشعارات</h2>
            {unread > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await markRead({ data: {} });
                  void queryClient.invalidateQueries({ queryKey: ["notifications"] });
                }}
              >
                <Check className="size-3" aria-hidden="true" /> وسم الكل مقروءاً
              </Button>
            )}
          </div>

          <ul className="max-h-96 overflow-y-auto">
            {items.length === 0 && (
              <li className="text-muted-foreground p-6 text-center text-sm">لا إشعارات بعد.</li>
            )}
            {items.map((n) => {
              const inner = (
                <>
                  <p className={cn("text-sm", !n.read_at && "font-bold")}>{n.title}</p>
                  {n.body && (
                    <p className="text-muted-foreground mt-0.5 text-xs leading-5">{n.body}</p>
                  )}
                  <p className="text-muted-foreground mt-1 text-xs">{formatDate(n.created_at)}</p>
                </>
              );
              return (
                <li
                  key={n.id}
                  className={cn(
                    "border-border border-b p-3 last:border-0",
                    !n.read_at && "bg-secondary/40",
                  )}
                >
                  {n.link ? (
                    <Link
                      to={n.link}
                      onClick={async () => {
                        setOpen(false);
                        await markRead({ data: { id: n.id } });
                        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
                      }}
                      className="block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
