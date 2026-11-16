import { lazy, type ReactNode, Suspense, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { KahataynMark } from "@/components/brand/KahataynMark";
import { defineCopy, useCopy } from "@/lib/locale";

// لوحة الدخول (البصمة والرموز وجوجل ومكتباتها) لا تُحمَّل إلا حين تُفتح النافذة:
// الترويسة في كلّ صفحة، والنافذة نادراً ما تُفتح.
const AuthPanel = lazy(() => import("./AuthPanel").then((m) => ({ default: m.AuthPanel })));

const COPY = defineCopy("components/auth/AuthDialog", {
  ar: {
    title: "ادخل لتكمل",
    hint: "بصمتك، أو رمزٌ يصلك، أو جوجل — وتبقى حيث أنت.",
    consent: "بالمتابعة توافق على شروط الاستخدام وسياسة الخصوصية — منصّةٌ تعالج بيانات أطفال.",
  },
  en: {
    title: "Sign in to continue",
    hint: "Your passkey, a code sent to you, or Google — and you stay right where you are.",
    consent:
      "By continuing you agree to the terms of use and privacy policy — this platform handles children's data.",
  },
});

/**
 * الدخول فوق الصفحة لا بدلها: الخارطة والدولة والمنطقة المفتوحة تبقى
 * خلف النافذة، وبعد الدخول تُغلق فيكمل الزائر من حيث كان.
 */
export function AuthDialog({
  trigger,
  title: titleProp,
  hint: hintProp,
  onDone,
}: {
  trigger: (open: () => void) => ReactNode;
  title?: string;
  hint?: string;
  onDone?: () => void;
}) {
  const c = useCopy(COPY);
  const title = titleProp ?? c.title;
  const hint = hintProp ?? c.hint;
  const [open, setOpen] = useState(false);
  return (
    <>
      {trigger(() => setOpen(true))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm rounded-3xl p-6 sm:max-w-sm">
          <KahataynMark className="h-10 w-auto" />
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">{hint}</DialogDescription>
          <Suspense
            fallback={
              <div className="space-y-3" aria-busy="true">
                <div className="h-6 w-2/3 animate-pulse rounded-lg bg-muted" />
                <div className="h-11 animate-pulse rounded-xl bg-muted" />
                <div className="h-11 animate-pulse rounded-xl bg-muted" />
              </div>
            }
          >
            <AuthPanel
              title={title}
              hint={hint}
              onDone={() => {
                setOpen(false);
                onDone?.();
              }}
            />
          </Suspense>
          <p className="text-center text-xs leading-5 text-muted-foreground">{c.consent}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
