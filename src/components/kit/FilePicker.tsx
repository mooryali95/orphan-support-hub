import { useId, useState } from "react";
import { Loader2, Paperclip, Upload } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * زرّ اختيار ملفٍّ بالعربية (UX-17).
 *
 * حقل الملف الأصلي يرسم «Choose File / No file chosen» بلغة المتصفّح
 * داخل واجهةٍ عربية، ولا يُنسَّق. هنا يبقى الحقل الأصلي — فلوحة المفاتيح
 * وقارئ الشاشة يعملان كما هما — مخفيّاً بصرياً داخل تسميته، وتظهر التسمية
 * زرّاً يحمل اسم الملف المختار.
 */
export function FilePicker({
  label,
  accessibleLabel,
  accept = "image/jpeg,image/png,image/webp,application/pdf",
  busy = false,
  disabled = false,
  showName = true,
  className,
  onPick,
}: {
  /** نصّ الزرّ الظاهر. */
  label: string;
  /** اسمٌ أوضح لقارئ الشاشة حين يتكرّر الزرّ في الصفحة. */
  accessibleLabel?: string;
  accept?: string;
  busy?: boolean;
  disabled?: boolean;
  /** يُظهر اسم الملف المختار بجانب الزرّ. */
  showName?: boolean;
  className?: string;
  onPick: (file: File | null) => void;
}) {
  const id = useId();
  const [name, setName] = useState<string | null>(null);
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <label
        htmlFor={id}
        className={cn(
          "border-input inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium",
          "hover:bg-secondary focus-within:ring-ring focus-within:ring-2 focus-within:ring-offset-1",
          (disabled || busy) && "pointer-events-none opacity-60",
        )}
      >
        {busy ? (
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        ) : (
          <Upload className="size-3" aria-hidden="true" />
        )}
        {label}
        <input
          id={id}
          type="file"
          className="sr-only"
          accept={accept}
          disabled={disabled || busy}
          aria-label={accessibleLabel ?? label}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setName(f?.name ?? null);
            onPick(f);
            e.target.value = "";
          }}
        />
      </label>
      {showName && (
        <span
          className="text-muted-foreground inline-flex items-center gap-1 text-xs"
          aria-live="polite"
        >
          {name ? (
            <>
              <Paperclip className="size-3" aria-hidden="true" />
              <span className="max-w-48 truncate" dir="auto">
                {name}
              </span>
            </>
          ) : (
            "لم يُختر ملف"
          )}
        </span>
      )}
    </span>
  );
}
