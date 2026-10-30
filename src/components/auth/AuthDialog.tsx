import { type ReactNode, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { KahataynMark } from "@/components/brand/KahataynMark";
import { AuthPanel } from "./AuthPanel";

/**
 * الدخول فوق الصفحة لا بدلها: الخارطة والدولة والمنطقة المفتوحة تبقى
 * خلف النافذة، وبعد الدخول تُغلق فيكمل الزائر من حيث كان.
 */
export function AuthDialog({
  trigger,
  title = "ادخل لتكمل",
  hint = "رمزٌ يصلك، أو جوجل — وتبقى حيث أنت.",
  onDone,
}: {
  trigger: (open: () => void) => ReactNode;
  title?: string;
  hint?: string;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {trigger(() => setOpen(true))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm rounded-3xl p-6 sm:max-w-sm">
          <KahataynMark className="h-10 w-auto" />
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">{hint}</DialogDescription>
          <AuthPanel
            title={title}
            hint={hint}
            onDone={() => {
              setOpen(false);
              onDone?.();
            }}
          />
          <p className="text-center text-[11px] leading-5 text-muted-foreground">
            بالمتابعة توافق على شروط الاستخدام وسياسة الخصوصية — منصّةٌ تعالج بيانات أطفال.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
