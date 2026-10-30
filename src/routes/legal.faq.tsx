import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { LegalPage, Section } from "@/components/LegalPage";
import { brandFor, pageTitle } from "@/config/brand";
import { useLocale } from "@/lib/locale";

export const Route = createFileRoute("/legal/faq")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(l === "en" ? "FAQ" : "الأسئلة الشائعة", true, l) },
        { name: "description", content: brandFor(l).description },
      ],
    };
  },
  component: Faq,
});

function Faq() {
  const locale = useLocale();
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      {locale === "en" ? <FaqEn /> : <FaqAr />}
      <SiteFooter />
    </div>
  );
}

function FaqAr() {
  return (
    <LegalPage title="الأسئلة الشائعة" updated="2026-08-26">
      <Section title="ما الذي أدفع مقابله؟">
        <p>
          اشتراك شهري في برامج محدّدة تُقدَّم لليتيم — دعم دراسي أو تأهيل مهني أو دعم نفسي أو متابعة
          صحّية أو احتياج معيشي. ولكل برنامج وصف ومخرجات وسعر معلن، وتصلك تقارير عمّا سُلِّم فعلاً.
        </p>
      </Section>

      <Section title="هل هذا تبرّع؟">
        <p>
          لا. ما تقدّمه هنا الآن <strong>كفالةٌ شهرية لطفلٍ بعينه</strong>، أو{" "}
          <strong>دعمٌ لبرنامج تأهيلٍ مسمّى</strong> (لطفل أو مجموعة أو منطقة أو دولة أو مؤسسة). كل
          مبلغٍ مربوطٌ بطفلٍ أو برنامج، وله فاتورة وإيصالٌ شهري. التبرّعات العامة ستُضاف لاحقاً.
        </p>
      </Section>

      <Section title="ماذا أرى من رحلة الطفل؟">
        <p>
          من صفحة كفالتك: برنامج التأهيل ومرحلته من ستّ (المفهوم، السمة، النظام، الأفعال، القياس،
          الأهلية)، والجلسات التي اجتازها وشهر كلٍّ منها — بجانب شهر الدفع نفسه — ونموّ أبعاد سماته
          بين أوّل قياسٍ وآخره. أمّا مخرجات الجلسات وملاحظات المشرف وتفاصيل السمات فتبقى للدائرة
          القريبة من الطفل، وتُطلب بإذن من الإدارة.
        </p>
      </Section>

      <Section title="كيف أعرف أن الملف حقيقي؟">
        <p>
          كل ملف ترفعه جهة رعاية مسجّلة، ومعه شهادة وفاة وإثبات وصاية على الأقل. والإدارة تفتح كل
          وثيقة وتوثّقها قبل النشر. والملف الذي لا يجتاز ذلك لا يُنشر.
        </p>
      </Section>

      <Section title="لماذا لا أرى صورة الطفل غالباً؟">
        <p>
          لأن الأصل عندنا هو <strong>عدم النشر</strong>. ولا تظهر صورة إلا بموافقة موثّقة من ولي
          الأمر، أو بصورة لا تُعرّف صاحبها. وحماية الطفل تسبق ما قد يكون أدعى للتعاطف.
        </p>
      </Section>

      <Section title="هل يمكنني التواصل مع الطفل؟">
        <p>
          لا. وهذا مقصود: التواصل المباشر يُنشئ علاقة غير محمية لطرفين أحدهما طفل. والتقارير الدورية
          هي القناة، وتمرّ بجهة الرعاية والإدارة.
        </p>
      </Section>

      <Section title="متى تصلني التقارير؟">
        <p>
          دورياً من جهة الرعاية، وبعد اعتماد الإدارة لها. ويصلك إشعار في المنصة وبريد عند نشر كل
          تقرير.
        </p>
      </Section>

      <Section title="هل أستطيع الإلغاء؟">
        <p>نعم، في أي وقت من لوحتك، ويسري من الدورة التالية بلا رسوم ولا مساءلة.</p>
      </Section>

      <Section title="لماذا الدفع الإلكتروني موقوف الآن؟">
        <p>
          لأننا في مرحلة تحقّق مع مزوّد الدفع من قبوله لحالة استخدام كفالة الأيتام. وتشغيل التحصيل
          قبل الجواب يعرّض أموال الكفلاء للتجميد — وذلك أسوأ من التأجيل. وحتى ذلك الحين تُستكمل
          الكفالة بتحويل بنكي تؤكّده الإدارة.
        </p>
      </Section>

      <Section title="إلى أين يذهب المال؟">
        <p>
          إلى البرامج المشترى بها، تُنفّذها جهة الرعاية أو المنصة. ولوحة الإدارة تعرض المحصَّل
          والمصروف والمتبقّي لكل ملف، وكل قرار مالي له أثر تدقيقي.
        </p>
      </Section>

      <Section title="أنا جهة رعاية — كيف أنضمّ؟">
        <p>
          سجّل حساباً واختر «جهة رعاية»، ثم أدخل بيانات الجهة ورقم ترخيصها. وتراجعها الإدارة قبل
          السماح برفع الملفّات.
        </p>
      </Section>
    </LegalPage>
  );
}

function FaqEn() {
  return (
    <LegalPage title="Frequently asked questions" updated="2026-08-26">
      <Section title="What am I paying for?">
        <p>
          A monthly subscription to specific programs delivered to the orphan — academic support,
          vocational qualification, psychosocial support, health follow-up or a living need. Each
          program has a published description, outcomes and price, and you receive reports on what
          was actually delivered.
        </p>
      </Section>

      <Section title="Is this a donation?">
        <p>
          No. What you give here today is a{" "}
          <strong>monthly sponsorship for a specific child</strong>, or{" "}
          <strong>support for a named qualification program</strong> (for a child, a group, a
          region, a country or an organization). Every amount is tied to a child or a program and
          comes with an invoice and a monthly receipt. General donations will be added later.
        </p>
      </Section>

      <Section title="What do I see of the child's journey?">
        <p>
          On your sponsorship page: the qualification program and its stage out of six (concept,
          trait, system, actions, measurement, qualification), the sessions the child has passed and
          the month of each — right next to that month's payment — and how their trait dimensions
          have grown between the first and latest measurement. Session work, supervisor notes and
          trait details stay with the child's close circle and are available only with permission
          from the administration.
        </p>
      </Section>

      <Section title="How do I know a file is real?">
        <p>
          Every file is uploaded by a registered care organization, with at least a death
          certificate and proof of guardianship. The administration opens and verifies every
          document before publishing. A file that doesn't pass isn't published.
        </p>
      </Section>

      <Section title="Why do I usually not see the child's photo?">
        <p>
          Because our default is <strong>not to publish</strong>. A photo appears only with
          documented consent from the guardian, or if it doesn't identify the child. Protecting the
          child comes before whatever might draw more sympathy.
        </p>
      </Section>

      <Section title="Can I contact the child?">
        <p>
          No — by design. Direct contact creates an unprotected relationship between two parties,
          one of whom is a child. Regular reports are the channel, and they pass through the care
          organization and the administration.
        </p>
      </Section>

      <Section title="When will I receive reports?">
        <p>
          Regularly from the care organization, after the administration approves them. You get a
          notification on the platform and an email whenever a report is published.
        </p>
      </Section>

      <Section title="Can I cancel?">
        <p>
          Yes, at any time from your dashboard. It takes effect from the next cycle, with no fees
          and no questions.
        </p>
      </Section>

      <Section title="Why is online payment paused right now?">
        <p>
          Because we are confirming with the payment provider that it accepts orphan sponsorship as
          a use case. Collecting payments before that answer could get sponsors' money frozen —
          which is worse than waiting. Until then, sponsorships are completed by bank transfer
          confirmed by the administration.
        </p>
      </Section>

      <Section title="Where does the money go?">
        <p>
          To the programs it pays for, delivered by the care organization or the platform. The
          administration dashboard shows what was collected, spent and remaining for each file, and
          every financial decision leaves an audit trail.
        </p>
      </Section>

      <Section title="I'm a care organization — how do we join?">
        <p>
          Create an account and choose “Care organization”, then enter the organization's details
          and license number. The administration reviews it before you can upload files.
        </p>
      </Section>
    </LegalPage>
  );
}
