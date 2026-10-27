import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Landmark } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Button } from "@/components/ui/button";
import { listMySponsorships } from "@/lib/sponsorships.functions";
import { formatMoney } from "@/lib/format";

/**
 * تعليمات التحويل البنكي.
 *
 * مزوّد الدفع اليدوي يحوّل الكافل إلى هنا، فبغياب هذه الصفحة يقع على
 * 404 وتبقى كفالته معلّقة بلا طريق للدفع.
 */
export const Route = createFileRoute("/_authenticated/sponsorships/$sponsorshipId/transfer")({
  head: () => ({
    meta: [
      { title: "تعليمات التحويل — كهاتين" },
      {
        name: "description",
        content: "تعليمات إتمام كفالتك عبر التحويل البنكي، وتأكيد الاستلام من إدارة منصة كهاتين.",
      },
      { property: "og:title", content: "تعليمات التحويل — كهاتين" },
      {
        property: "og:description",
        content: "تعليمات إتمام كفالتك عبر التحويل البنكي، وتأكيد الاستلام من إدارة منصة كهاتين.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TransferPage,
});

function TransferPage() {
  const { sponsorshipId } = Route.useParams();
  const fetchList = useServerFn(listMySponsorships);
  const { data, isLoading } = useQuery({
    queryKey: ["my-sponsorships"],
    queryFn: () => fetchList(),
  });

  const sponsorship = (data?.sponsorships ?? []).find((s) => s.id === sponsorshipId);
  const reference = sponsorshipId.slice(0, 8).toUpperCase();

  return (
    <DashboardShell
      title="تعليمات التحويل البنكي"
      description="أكمل كفالتك بتحويل بنكي، وتُفعَّل فور تأكيد الإدارة استلام المبلغ."
    >
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        </div>
      ) : !sponsorship ? (
        <div className="border-border bg-card rounded-3xl border border-dashed p-12 text-center">
          <p className="font-medium">لم نجد هذه الكفالة ضمن كفالاتك</p>
          <Button asChild className="mt-6">
            <Link to="/dashboard">العودة إلى كفالاتي</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="border-border bg-card rounded-2xl border p-6">
            <div className="flex items-center gap-3">
              <Landmark className="text-bridge size-5" />
              <h2 className="font-bold">تفاصيل الكفالة</h2>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <Row label="الملف" value={sponsorship.orphan?.display_name ?? "—"} />
              <Row
                label="المبلغ"
                value={`${formatMoney(sponsorship.amount, sponsorship.currency)} ${
                  sponsorship.type === "monthly" ? "شهرياً" : "لمرة واحدة"
                }`}
              />
              <Row label="رقم المرجع" value={reference} />
              <Row label="الحالة" value="بانتظار تأكيد التحويل" />
            </dl>
          </div>

          <div className="border-border bg-card rounded-2xl border p-6 text-sm leading-8">
            <h2 className="font-bold">خطوات الإتمام</h2>
            <ol className="mt-3 list-decimal space-y-2 pe-5">
              <li>
                حوّل مبلغ <strong>{formatMoney(sponsorship.amount, sponsorship.currency)}</strong>{" "}
                إلى حساب المنصة البنكي المعتمد.
              </li>
              <li>
                اكتب رقم المرجع <strong>{reference}</strong> في خانة البيان أو الملاحظات، فبه تُربط
                دفعتك بكفالتك.
              </li>
              <li>
                أرسل صورة إشعار التحويل إلى{" "}
                <a className="text-primary underline" href="mailto:support@ioso.app">
                  support@ioso.app
                </a>{" "}
                مع رقم المرجع.
              </li>
              <li>تؤكّد الإدارة الاستلام، فتُفعَّل كفالتك ويصلك إشعار، وتبدأ تقارير الأثر.</li>
            </ol>
            <p className="text-muted-foreground mt-4 text-xs">
              بيانات الحساب البنكي تُرسل إليك مع رسالة التأكيد إن لم تكن قد استلمتها بعد. لأي
              استفسار تواصل معنا على البريد أعلاه.
            </p>
          </div>

          <Button asChild variant="outline">
            <Link to="/dashboard">العودة إلى كفالاتي</Link>
          </Button>
        </div>
      )}
    </DashboardShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
