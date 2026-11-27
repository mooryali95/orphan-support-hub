import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ImageIcon, Play, Send, StickyNote, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  checkMedia,
  clock,
  CHILD_UPDATE_LIMITS,
  type PendingChildUpdate,
} from "@/lib/child-updates";
import {
  createChildUpdateUploadUrl,
  listChildUpdateQueue,
  reviewChildUpdate,
  searchUpdateChildren,
  submitChildUpdate,
  type UpdateChild,
} from "@/lib/child-updates.functions";
import { useDataFn, useDataKey } from "@/lib/data-port";
import { formatDate } from "@/lib/format";
import { defineCopy, useCopy, useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

import { ACCENT, Busy, CARD, Failed, NeedsUpdate } from "../shared";

export const UPDATES_COPY = defineCopy("components/admin/data/sources/ChildUpdatesCard", {
  ar: {
    uploadTitle: "أرسل تحديثاً للكافل",
    uploadHint:
      "صورة (jpg أو png أو webp حتى 5MB) أو مقطع mp4 حتى 40MB ودقيقة، أو ملاحظة. يُراجَع قبل أن يصل الكافل، ويحسمه غير من رفعه.",
    child: "الطفل",
    childSearch: "ابحث برمز الملفّ أو الاسم",
    noChild: "لا طفل بهذا البحث في الدولة.",
    frozen: "مجمَّد",
    file: "الملفّ (اختياري للملاحظة)",
    poster: "صورة غلاف للمقطع (اختيارية)",
    duration: "مدّة المقطع بالثواني",
    durationHint: "تُدوَّن بيد الرافع: دقيقةٌ على الأكثر.",
    captionAr: "التعليق بالعربية",
    captionEn: "التعليق بالإنجليزية (اختياري)",
    captionHint: "يُقرأ نصّاً بديلاً للصورة. لا اسم مدرسةٍ ولا عنوان ولا ما يدلّ على مكان الطفل.",
    consent: "أكّد الوليّ موافقته على مشاركة هذه الصورة أو المقطع مع الكافل.",
    consentNeeded: "موافقة الوليّ شرطٌ لكلّ صورةٍ ومقطع.",
    send: "أرسل للمراجعة",
    sending: "يُرفع…",
    sent: "أُرسل التحديث للمراجعة.",
    queueTitle: "تحديثاتٌ تنتظر الحسم",
    queueEmpty: "لا تحديث ينتظر الحسم في هذه الدولة.",
    approve: "اعتمد",
    reject: "ارفض",
    rejectReason: "سبب الرفض",
    rejectHint: "يُحفظ في سجلّ السلامة للإدارة، ولا يراه الكافل.",
    confirmReject: "أكّد الرفض",
    cancel: "تراجع",
    mine: "رفعتَه أنت: يحسمه غيرك.",
    frozenNote: "الملفّ مجمَّد: لا يُعتمد له تحديث حتى يُرفع التجميد.",
    approved: "اعتُمد التحديث ووصل الكافل.",
    rejected: "رُفض التحديث وسُجّل السبب.",
    readOnly: "للاطّلاع: الحسم لمشرف الدولة.",
    kinds: { photo: "صورة", video: "مقطع", note: "ملاحظة" },
    clip: (length: string) => `مقطع ${length}`,
    errors: {
      failed: "تعذّر التنفيذ. لم يتغيّر شيء.",
      country_forbidden: "هذا الطفل خارج دولتك.",
      orphan_frozen: "الملفّ مجمَّد: لا تحديث له الآن.",
      consent_required: "موافقة الوليّ شرطٌ لكلّ صورةٍ ومقطع.",
      file_too_large: "الملفّ أكبر من المسموح: الصورة 5MB والمقطع 40MB.",
      type_unsupported: "النوع غير مقبول: jpg أو png أو webp أو mp4.",
      video_too_long: "المقطع دقيقةٌ على الأكثر.",
      caption_invalid: "التعليق مطلوب، وحتى 500 حرف.",
      path_invalid: "تعذّر قبول الملفّ. أعد رفعه.",
      file_missing: "لم يكتمل رفع الملفّ. أعد المحاولة.",
      upload_forbidden: "لا يُسمح بالرفع لهذا الطفل.",
      four_eyes_required: "رفعتَه أنت: يحسمه مشرفٌ آخر.",
      mfa_required: "الحسم يحتاج جلسةً بالمصادقة الثنائية.",
      reason_required: "اكتب سبب الرفض.",
      update_closed: "حُسم هذا التحديث من قبل.",
      trial_no_upload: "في التجربة لا تُرفع ملفّات؛ أرسل ملاحظةً لترى الطريق كاملاً.",
    } as Record<string, string>,
  },
  en: {
    uploadTitle: "Send the sponsor an update",
    uploadHint:
      "A photo (jpg, png or webp up to 5MB), an mp4 clip up to 40MB and one minute, or a note. It is reviewed before it reaches the sponsor, and someone other than the uploader settles it.",
    child: "Child",
    childSearch: "Search by file code or name",
    noChild: "No child in this country matches.",
    frozen: "Frozen",
    file: "File (optional for a note)",
    poster: "Cover image for the clip (optional)",
    duration: "Clip length in seconds",
    durationHint: "Entered by the uploader: one minute at most.",
    captionAr: "Caption in Arabic",
    captionEn: "Caption in English (optional)",
    captionHint:
      "It is read as the image's alt text. No school name, address or anything that locates the child.",
    consent: "The guardian has agreed to share this photo or clip with the sponsor.",
    consentNeeded: "Guardian consent is required for every photo and clip.",
    send: "Send for review",
    sending: "Uploading…",
    sent: "The update was sent for review.",
    queueTitle: "Updates waiting to be settled",
    queueEmpty: "No update is waiting in this country.",
    approve: "Approve",
    reject: "Reject",
    rejectReason: "Reason for rejecting",
    rejectHint: "Kept in the safety log for the admin team; the sponsor doesn't see it.",
    confirmReject: "Confirm rejection",
    cancel: "Cancel",
    mine: "You uploaded this: someone else settles it.",
    frozenNote: "The file is frozen: no update is approved until the freeze is lifted.",
    approved: "Approved; it has reached the sponsor.",
    rejected: "Rejected, with the reason logged.",
    readOnly: "View only: the country supervisor settles.",
    kinds: { photo: "Photo", video: "Clip", note: "Note" },
    clip: (length: string) => `Clip ${length}`,
    errors: {
      failed: "Couldn't complete. Nothing changed.",
      country_forbidden: "This child is outside your country.",
      orphan_frozen: "The file is frozen: no updates for now.",
      consent_required: "Guardian consent is required for every photo and clip.",
      file_too_large: "The file is too large: photos 5MB, clips 40MB.",
      type_unsupported: "Type not accepted: jpg, png, webp or mp4.",
      video_too_long: "Clips are one minute at most.",
      caption_invalid: "A caption is required, up to 500 characters.",
      path_invalid: "The file couldn't be accepted. Upload it again.",
      file_missing: "The upload didn't finish. Try again.",
      upload_forbidden: "Uploading for this child isn't allowed.",
      four_eyes_required: "You uploaded this: another supervisor settles it.",
      mfa_required: "Settling needs a two-factor session.",
      reason_required: "Write the reason for rejecting.",
      update_closed: "This update was already settled.",
      trial_no_upload: "Files aren't uploaded in the trial; send a note to see the whole path.",
    } as Record<string, string>,
  },
});

function useUpdateErr() {
  const c = useCopy(UPDATES_COPY);
  return (code: string | undefined) => c.errors[code ?? ""] ?? c.errors["failed"]!;
}

const QUEUE_KEY = "child-updates-queue";

/** لسان «التحديثات» في درج الدولة: الرفع لمن يملكه، والطابور للجميع، والحسم للمشرف. */
export function ChildUpdatesCard({
  country,
  canUpload,
  canApprove,
}: {
  country: string;
  canUpload: boolean;
  canApprove: boolean;
}) {
  const c = useCopy(UPDATES_COPY);
  const fetchQueue = useDataFn("childUpdates.queue", listChildUpdateQueue);
  const q = useQuery({
    queryKey: useDataKey([QUEUE_KEY, country]),
    queryFn: () => fetchQueue({ data: { country } }),
  });

  return (
    <div className="space-y-6">
      {canUpload && <UploadUpdate key={country} country={country} />}
      <section aria-labelledby="cu-queue" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h5 id="cu-queue" className="text-base font-bold">
            {c.queueTitle}
          </h5>
          {!canApprove && <p className="text-xs text-muted-foreground">{c.readOnly}</p>}
        </div>
        {q.isPending ? (
          <Busy />
        ) : !q.data?.ok ? (
          q.data?.missing ? (
            <NeedsUpdate />
          ) : (
            <Failed onRetry={() => void q.refetch()} />
          )
        ) : q.data.data.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {c.queueEmpty}
          </p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {q.data.data.map((u) => (
              <li key={u.id}>
                <ChildUpdateReview item={u} canApprove={canApprove} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ChildPicker({
  country,
  value,
  onChange,
}: {
  country: string;
  value: UpdateChild | null;
  onChange: (k: UpdateChild | null) => void;
}) {
  const c = useCopy(UPDATES_COPY);
  const id = useId();
  const [text, setText] = useState("");
  const search = useDataFn("childUpdates.children", searchUpdateChildren);
  const q = useQuery({
    queryKey: useDataKey(["child-updates-children", country, text.trim()]),
    queryFn: () => search({ data: { country, q: text.trim() } }),
    enabled: !value,
  });
  if (value)
    return (
      <div className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 text-sm">
        <bdi dir="ltr" className="font-mono text-xs">
          {value.code}
        </bdi>
        <span className="min-w-0 flex-1 truncate font-bold">
          <bdi dir="auto">{value.display_name}</bdi>
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={c.cancel}
          className="inline-flex size-9 items-center justify-center rounded-full hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    );
  const rows = q.data?.ok ? q.data.data : [];
  return (
    <div className="space-y-2">
      <Input
        id={id}
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={c.childSearch}
        aria-label={c.childSearch}
        className="min-h-11"
      />
      {q.data?.ok && rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{c.noChild}</p>
      ) : (
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {rows.map((k) => (
            <li key={k.id}>
              <button
                type="button"
                disabled={k.frozen}
                onClick={() => onChange(k)}
                className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-start text-sm hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
              >
                <bdi dir="ltr" className="font-mono text-xs text-muted-foreground">
                  {k.code}
                </bdi>
                <span className="min-w-0 flex-1 truncate">
                  <bdi dir="auto">{k.display_name}</bdi>
                </span>
                {k.frozen && <span className="text-xs text-destructive">{c.frozen}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function put(url: string, file: File) {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "content-type": file.type },
    body: file,
  });
  return res.ok;
}

function UploadUpdate({ country }: { country: string }) {
  const c = useCopy(UPDATES_COPY);
  const err = useUpdateErr();
  const qc = useQueryClient();
  const dk = useDataKey([]);
  const sign = useDataFn("childUpdates.upload", createChildUpdateUploadUrl);
  const submit = useDataFn("childUpdates.submit", submitChildUpdate);
  const ids = {
    file: useId(),
    poster: useId(),
    dur: useId(),
    ar: useId(),
    en: useId(),
    ok: useId(),
  };
  const [child, setChild] = useState<UpdateChild | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [poster, setPoster] = useState<File | null>(null);
  const [duration, setDuration] = useState("");
  const [captionAr, setCaptionAr] = useState("");
  const [captionEn, setCaptionEn] = useState("");
  const [consent, setConsent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const check = file ? checkMedia(file.type, file.size) : null;
  const kind = check?.ok ? check.kind : "note";

  const send = useMutation({
    mutationFn: async () => {
      if (!child) return { ok: false as const, error: "failed" };
      if (check && !check.ok) return { ok: false as const, error: check.code };
      let path: string | null = null;
      let posterPath: string | null = null;
      if (file) {
        const s = await sign({ data: { orphanId: child.id, type: file.type, size: file.size } });
        if (!s.ok) return s;
        if (!(await put(s.signedUrl, file))) return { ok: false as const, error: "file_missing" };
        path = s.path;
      }
      if (file && kind === "video" && poster) {
        const pc = checkMedia(poster.type, poster.size);
        if (!pc.ok || pc.kind !== "photo")
          return { ok: false as const, error: pc.ok ? "type_unsupported" : pc.code };
        const s = await sign({
          data: { orphanId: child.id, type: poster.type, size: poster.size },
        });
        if (!s.ok) return s;
        if (!(await put(s.signedUrl, poster))) return { ok: false as const, error: "file_missing" };
        posterPath = s.path;
      }
      return (await submit({
        data: {
          orphanId: child.id,
          kind,
          path,
          posterPath,
          captionAr,
          captionEn,
          consent,
          durationSeconds: kind === "video" ? Number(duration) || null : null,
        },
      })) as { ok: boolean; error?: string };
    },
    onSuccess: (res) => {
      if (!res.ok) return void toast.error(err("error" in res ? res.error : undefined));
      toast.success(c.sent);
      setFile(null);
      setPoster(null);
      setDuration("");
      setCaptionAr("");
      setCaptionEn("");
      setConsent(false);
      if (fileRef.current) fileRef.current.value = "";
      void qc.invalidateQueries({ queryKey: [...dk, QUEUE_KEY] });
    },
    onError: () => toast.error(err("failed")),
  });

  const seconds = Number(duration);
  const durationOk =
    kind !== "video" || (seconds >= 1 && seconds <= CHILD_UPDATE_LIMITS.videoSeconds);
  const ready =
    !!child &&
    captionAr.trim().length > 0 &&
    (kind === "note" || consent) &&
    durationOk &&
    !(check && !check.ok);

  return (
    <section aria-labelledby="cu-up" className={cn(CARD, "space-y-4 p-5")}>
      <div>
        <h5 id="cu-up" className="text-base font-bold">
          {c.uploadTitle}
        </h5>
        <p className="mt-1 text-xs leading-6 text-muted-foreground text-pretty">{c.uploadHint}</p>
      </div>
      <div className="space-y-1.5">
        <span className="text-sm font-medium">{c.child}</span>
        <ChildPicker country={country} value={child} onChange={setChild} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={ids.file}>{c.file}</Label>
          <Input
            id={ids.file}
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="min-h-11"
          />
          {check && !check.ok && (
            <p role="alert" className="text-xs text-destructive">
              {err(check.code)}
            </p>
          )}
        </div>
        {kind === "video" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor={ids.dur}>{c.duration}</Label>
              <Input
                id={ids.dur}
                type="number"
                inputMode="numeric"
                min={1}
                max={CHILD_UPDATE_LIMITS.videoSeconds}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                aria-describedby={`${ids.dur}-h`}
                className="min-h-11"
              />
              <p id={`${ids.dur}-h`} className="text-xs text-muted-foreground">
                {c.durationHint}
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={ids.poster}>{c.poster}</Label>
              <Input
                id={ids.poster}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setPoster(e.target.files?.[0] ?? null)}
                className="min-h-11"
              />
            </div>
          </>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={ids.ar}>{c.captionAr}</Label>
          <Textarea
            id={ids.ar}
            dir="rtl"
            rows={3}
            maxLength={CHILD_UPDATE_LIMITS.captionChars}
            value={captionAr}
            onChange={(e) => setCaptionAr(e.target.value)}
            aria-describedby={`${ids.ar}-h`}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={ids.en}>{c.captionEn}</Label>
          <Textarea
            id={ids.en}
            dir="ltr"
            rows={3}
            maxLength={CHILD_UPDATE_LIMITS.captionChars}
            value={captionEn}
            onChange={(e) => setCaptionEn(e.target.value)}
          />
        </div>
        <p id={`${ids.ar}-h`} className="text-xs leading-6 text-muted-foreground sm:col-span-2">
          {c.captionHint}
        </p>
      </div>
      {kind !== "note" && (
        <div className="flex items-start gap-3 rounded-xl bg-secondary/50 p-3">
          <Checkbox
            id={ids.ok}
            checked={consent}
            onCheckedChange={(v) => setConsent(v === true)}
            className="mt-1"
            style={ACCENT}
          />
          <Label htmlFor={ids.ok} className="text-sm leading-7 font-normal">
            {c.consent}
          </Label>
        </div>
      )}
      <div className="flex justify-end">
        <Button
          type="button"
          className="min-h-11"
          disabled={!ready || send.isPending}
          onClick={() => send.mutate()}
        >
          <Send className="size-4" aria-hidden="true" />
          {send.isPending ? c.sending : c.send}
        </Button>
      </div>
    </section>
  );
}

/** بندٌ واحد ينتظر الحسم: معاينة، وتعليق، واعتمادٌ أو رفضٌ بسبب. يُستعمل في «اليوم» أيضاً. */
export function ChildUpdateReview({
  item,
  canApprove,
  onDone,
}: {
  item: PendingChildUpdate;
  canApprove: boolean;
  onDone?: () => void;
}) {
  const c = useCopy(UPDATES_COPY);
  const err = useUpdateErr();
  const locale = useLocale();
  const qc = useQueryClient();
  const dk = useDataKey([]);
  const review = useDataFn("childUpdates.review", reviewChildUpdate);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const act = useMutation({
    mutationFn: async (decision: "approve" | "reject") =>
      (await review({ data: { id: item.id, decision, reason } })) as {
        ok: boolean;
        error?: string;
      },
    onSuccess: (res, decision) => {
      if (!res.ok) return void toast.error(err(res.error));
      toast.success(decision === "approve" ? c.approved : c.rejected);
      void qc.invalidateQueries({ queryKey: [...dk, QUEUE_KEY] });
      onDone?.();
    },
    onError: () => toast.error(err("failed")),
  });
  const still = item.kind === "video" ? item.poster_url : item.url;
  const caption = locale === "en" && item.caption_en ? item.caption_en : item.caption_ar;
  const Icon = item.kind === "video" ? Play : item.kind === "note" ? StickyNote : ImageIcon;

  return (
    <article className={cn(CARD, "flex h-full flex-col gap-3 p-4")}>
      <div className="flex gap-3">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-secondary">
          {item.kind === "video" && item.url ? (
            <video
              src={item.url}
              poster={item.poster_url ?? undefined}
              controls
              preload="metadata"
              playsInline
              aria-label={caption}
              className="size-full object-cover"
            />
          ) : still ? (
            <img src={still} alt={caption} className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-muted-foreground">
              <Icon className="size-6" aria-hidden="true" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-secondary px-2 py-0.5 font-bold text-foreground">
              {item.kind === "video" && item.duration_seconds
                ? c.clip(clock(item.duration_seconds))
                : c.kinds[item.kind]}
            </span>
            <bdi dir="ltr" className="font-mono">
              {item.orphan_code}
            </bdi>
            <span>{formatDate(item.created_at, locale)}</span>
          </p>
          <p className="mt-1 truncate text-sm font-bold">
            <bdi dir="auto">{item.orphan_name}</bdi>
          </p>
          <p className="mt-1 text-sm leading-6 text-pretty">
            <bdi dir="auto">{caption}</bdi>
          </p>
        </div>
      </div>
      {item.mine && <p className="text-xs font-medium text-muted-foreground">{c.mine}</p>}
      {item.frozen && <p className="text-xs font-medium text-destructive">{c.frozenNote}</p>}
      {canApprove && !item.mine && (
        <div className="mt-auto space-y-2">
          {rejecting && (
            <div className="space-y-1.5">
              <Label htmlFor={reasonId}>{c.rejectReason}</Label>
              <Textarea
                id={reasonId}
                rows={2}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                aria-describedby={`${reasonId}-h`}
                autoFocus
              />
              <p id={`${reasonId}-h`} className="text-xs text-muted-foreground">
                {c.rejectHint}
              </p>
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {rejecting ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  onClick={() => setRejecting(false)}
                >
                  {c.cancel}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="min-h-11"
                  disabled={!reason.trim() || act.isPending}
                  onClick={() => act.mutate("reject")}
                >
                  {c.confirmReject}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={act.isPending}
                  onClick={() => setRejecting(true)}
                >
                  <X className="size-4" aria-hidden="true" />
                  {c.reject}
                </Button>
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={act.isPending || item.frozen}
                  onClick={() => act.mutate("approve")}
                >
                  <Check className="size-4" aria-hidden="true" />
                  {c.approve}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
