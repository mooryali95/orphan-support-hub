import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { LegalPage, Section } from "@/components/LegalPage";
import { brandFor, pageTitle } from "@/config/brand";
import { useLocale } from "@/lib/locale";

export const Route = createFileRoute("/legal/terms")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(l !== "ar" ? "Terms of use" : "شروط الاستخدام", true, l) },
        { name: "description", content: brandFor(l).description },
      ],
    };
  },
  component: Terms,
});

function Terms() {
  const locale = useLocale();
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      {locale !== "ar" ? <TermsEn /> : <TermsAr />}
      <SiteFooter />
    </div>
  );
}

function TermsAr() {
  return (
    <LegalPage
      title="شروط الاستخدام"
      updated="2026-08-26"
      intro="باستخدامك المنصّة فأنت توافق على ما يلي. اقرأه، فهو يحدّد ما تشتريه وما نلتزم به."
    >
      <Section title="1. ما تشتريه بالضبط">
        <p>
          الكفالة في هذه المنصّة ليست تبرّعاً مجرّداً، بل{" "}
          <strong>اشتراك شهري في برامج خدمية محدّدة</strong> تُقدَّم لليتيم: دعم دراسي، أو تأهيل
          مهني، أو دعم نفسي، أو متابعة صحّية، أو احتياج معيشي مُدار.
        </p>
        <p>ولكل برنامج وصف معلن، ومخرجات محدّدة، وسعر شهري، ومدّة، وجهة منفّذة.</p>
        <p>
          وتصلك <strong>تقارير أثر دورية</strong> عمّا سُلِّم فعلاً، بعد مراجعة الإدارة لها.
        </p>
      </Section>

      <Section title="2. الأدوار">
        <ul>
          <li>
            <strong>الكافل:</strong> يختار ملفاً وبرامج، ويسدّد شهرياً، ويتابع الأثر.
          </li>
          <li>
            <strong>الجهة الميدانية:</strong> ترفع الملفّات بوثائقها، وتنفّذ البرامج، وترفع
            التقارير. وهي مسؤولة عن صحّة ما ترفعه.
          </li>
          <li>
            <strong>ولي الأمر:</strong> يمنح الموافقات ويتابع ما يصل من خدمات.
          </li>
          <li>
            <strong>الإدارة:</strong> تراجع وتعتمد وتوثّق. ولا يُنشر ملفّ ولا تقرير قبل اعتمادها.
          </li>
        </ul>
      </Section>

      <Section title="3. الاشتراك والإلغاء">
        <ul>
          <li>الاشتراك شهري متجدّد حتى تُلغيه.</li>
          <li>
            <strong>الإلغاء متاح في أي وقت</strong> من لوحتك، ويسري من الدورة التالية.
          </li>
          <li>الشهر المدفوع يُستكمل تسليم خدماته ولا يُسترد بعد التسليم.</li>
          <li>وإن تعذّر تسليم برنامج لسبب من عندنا، يُحوَّل المبلغ إلى برنامج بديل أو يُردّ.</li>
        </ul>
      </Section>

      <Section title="4. ما لا نضمنه">
        <p>
          نضمن <strong>تسليم الخدمة</strong> ومتابعتها والإبلاغ عنها. ولا نضمن نتيجة تعليمية أو
          صحّية بعينها، فتلك تتوقّف على الطفل وظروفه، ولا يملك أحد أن يعِد بها.
        </p>
      </Section>

      <Section title="5. خصوصية الطفل: التزام عليك">
        <p>ما تراه من بيانات الأيتام مُقدَّم لغرض الكفالة وحده. ويُمنع منعاً باتّاً:</p>
        <ul>
          <li>نشر صور الأيتام أو بياناتهم خارج المنصّة.</li>
          <li>محاولة التواصل المباشر مع الطفل أو أسرته خارج القنوات الرسمية.</li>
          <li>استعمال البيانات لأي غرض تجاري أو دعائي.</li>
        </ul>
        <p>ومخالفة هذا البند تُنهي حسابك فوراً، وقد تترتّب عليها مسؤولية نظامية.</p>
      </Section>

      <Section title="6. الاستخدام المقبول">
        <ul>
          <li>لا محاولات لتجاوز الصلاحيات أو الوصول إلى بيانات ليست لك.</li>
          <li>لا رفع بيانات كاذبة أو وثائق مزوّرة.</li>
          <li>لا إساءة استعمال آلية للمنصّة.</li>
        </ul>
      </Section>

      <Section title="7. إنهاء الحساب">
        <p>
          لك أن تُغلق حسابك متى شئت. ولنا أن نُعلّقه إن خولفت هذه الشروط، مع إشعارك بالسبب، إلا حين
          يكون الإشعار نفسه ضارّاً بطفل.
        </p>
      </Section>

      <Section title="8. التواصل">
        <p>نموذج التواصل الرسمي قيد الإعداد وسيُتاح في هذه الصفحة.</p>
      </Section>
    </LegalPage>
  );
}

function TermsEn() {
  return (
    <LegalPage
      title="Terms of use"
      binding
      updated="2026-08-26"
      intro="By using the platform you agree to the following. Please read it: it defines what you are paying for and what we commit to."
    >
      <Section title="1. What exactly you are paying for">
        <p>
          Sponsorship on this platform isn't a bare donation; it is a{" "}
          <strong>monthly subscription to specific service programs</strong> delivered to the
          orphan: academic support, vocational qualification, psychosocial support, health
          follow-up, or a managed living need.
        </p>
        <p>
          Each program has a published description, defined outcomes, a monthly price, a duration
          and an implementing organization.
        </p>
        <p>
          You receive <strong>regular impact reports</strong> on what was actually delivered, after
          the administration has reviewed them.
        </p>
      </Section>

      <Section title="2. Roles">
        <ul>
          <li>
            <strong>Sponsor:</strong> chooses a file and programs, pays monthly, and follows the
            impact.
          </li>
          <li>
            <strong>Field organization:</strong> uploads files with their documents, runs the
            programs and submits reports. It is responsible for the accuracy of what it uploads.
          </li>
          <li>
            <strong>Guardian:</strong> grants consents and follows the services delivered.
          </li>
          <li>
            <strong>Administration:</strong> reviews, approves and documents. No file or report is
            published before its approval.
          </li>
        </ul>
      </Section>

      <Section title="3. Subscription and cancellation">
        <ul>
          <li>The subscription renews monthly until you cancel it.</li>
          <li>
            <strong>You can cancel at any time</strong> from your dashboard; it takes effect from
            the next cycle.
          </li>
          <li>
            A paid month's services are delivered in full and are not refunded once delivered.
          </li>
          <li>
            If a program can't be delivered for a reason on our side, the amount is moved to an
            alternative program or refunded.
          </li>
        </ul>
      </Section>

      <Section title="4. What we don't guarantee">
        <p>
          We guarantee <strong>delivery of the service</strong>, its follow-up and reporting on it.
          We don't guarantee a particular educational or health outcome; that depends on the child
          and their circumstances, and no one can promise it.
        </p>
      </Section>

      <Section title="5. The child's privacy: your obligation">
        <p>
          Children's data you see is provided for the purpose of sponsorship only. It is strictly
          forbidden to:
        </p>
        <ul>
          <li>Publish children's photos or data outside the platform.</li>
          <li>Try to contact the child or their family directly outside official channels.</li>
          <li>Use the data for any commercial or promotional purpose.</li>
        </ul>
        <p>Breaching this clause ends your account immediately and may carry legal liability.</p>
      </Section>

      <Section title="6. Acceptable use">
        <ul>
          <li>No attempts to bypass permissions or access data that isn't yours.</li>
          <li>No uploading false data or forged documents.</li>
          <li>No automated abuse of the platform.</li>
        </ul>
      </Section>

      <Section title="7. Closing an account">
        <p>
          You may close your account whenever you wish. We may suspend it if these terms are
          breached, and tell you why, unless telling you would itself harm a child.
        </p>
      </Section>

      <Section title="8. Contact">
        <p>The official contact form is being prepared and will be available on this page.</p>
      </Section>
    </LegalPage>
  );
}
