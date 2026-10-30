import { Link } from "@tanstack/react-router";
import { ArrowLeft, HeartHandshake } from "lucide-react";

import { AuthDialog } from "@/components/auth/AuthDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import type { MapActionContext } from "./WorldMap";

/**
 * ما يفعله الزائر من بطاقة الدولة أو المنطقة: يتصفّح من ينتظر، ويدعم
 * المكان نفسه. ومن لم يدخل بعد يدخل في نافذةٍ فوق الخارطة، ثم يكمل.
 */
export function MapActions({ ctx }: { ctx: MapActionContext }) {
  const { user } = useAuth();
  const country = ctx.countryValue ?? ctx.code;
  const place = ctx.regionName ? "هذه المنطقة" : "هذه الدولة";
  const supportSearch = {
    c: ctx.code,
    ...(ctx.regionValue ? { r: ctx.regionValue } : {}),
  };

  return (
    <div className="grid gap-2">
      <Button asChild size="lg" className="w-full">
        <Link
          to="/orphans"
          search={{
            // قيم القاعدة نفسها — فالدليل يجد ما وجدته الخارطة.
            country,
            ...(ctx.regionValue ? { region: ctx.regionValue } : {}),
            funding: "open",
          }}
        >
          تصفّح من ينتظر هنا
          <ArrowLeft className="ltr:-scale-x-100" aria-hidden="true" />
        </Link>
      </Button>
      {user ? (
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link to="/support" search={supportSearch}>
            <HeartHandshake aria-hidden="true" />
            ادعم {place}
          </Link>
        </Button>
      ) : (
        <AuthDialog
          title={`ادخل لتدعم ${place}`}
          trigger={(open) => (
            <Button size="lg" variant="outline" className="w-full" onClick={open}>
              <HeartHandshake aria-hidden="true" />
              ادعم {place}
            </Button>
          )}
        />
      )}
    </div>
  );
}
