import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { LegalPage, Section } from "@/components/LegalPage";
import { brandFor, pageTitle } from "@/config/brand";
import { useLocale } from "@/lib/locale";

export const Route = createFileRoute("/legal/privacy")({
  head: ({ match }) => {
    const l = match.context.locale ?? "ar";
    return {
      meta: [
        { title: pageTitle(l !== "ar" ? "Privacy policy" : "سياسة الخصوصية", true, l) },
        { name: "description", content: brandFor(l).description },
      ],
    };
  },
  component: Privacy,
});

function Privacy() {
  const locale = useLocale();
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      {locale !== "ar" ? <PrivacyEn /> : <PrivacyAr />}
      <SiteFooter />
    </div>
  );
}

function PrivacyAr() {
  return (
    <LegalPage
      title="سياسة الخصوصية"
      updated="2026-08-26"
      intro="هذه المنصة تعالج بيانات أطفال. وهي من أعلى فئات الحساسية في كل نظام لحماية البيانات، ونتعامل معها على هذا الأساس لا على أساس أنها بيانات مستخدمين عاديين."
    >
      <Section title="1. البيانات التي نجمعها">
        <p className="font-medium">عن اليتيم:</p>
        <ul>
          <li>
            <strong>معروضة للعموم:</strong> اسم عرض مختصر، الجنس، العمر، المدينة، المرحلة الدراسية،
            قصّة مختصرة، الاحتياج الشهري.
          </li>
          <li>
            <strong>سرّية ولا تُعرض لأحد خارج الجهة والإدارة وولي الأمر:</strong> الاسم الكامل، رقم
            الهوية، بيانات ولي الأمر، العنوان، الوضع الأسري والدخل، الملاحظات الصحّية.
          </li>
          <li>
            <strong>وثائق الإثبات:</strong> شهادة الوفاة، إثبات الوصاية، وما يلحقهما. تُحفظ في خزنة
            خاصة ولا تُقرأ إلا برابط موقّت لمن يملك الحقّ.
          </li>
        </ul>
        <p className="font-medium">عن الكافل:</p>
        <ul>
          <li>البريد الإلكتروني والاسم، وسجلّ كفالاته ومدفوعاته.</li>
          <li>
            <strong>لا نحفظ بيانات بطاقتك.</strong> الدفع يتمّ لدى مزوّد الدفع مباشرةً، ولا يمرّ رقم
            البطاقة بخوادمنا في أي لحظة.
          </li>
        </ul>
      </Section>

      <Section title="2. أساس المعالجة">
        <ul>
          <li>
            <strong>موافقة ولي الأمر</strong> — لبيانات اليتيم السرّية ووثائقه وصورته.
          </li>
          <li>
            <strong>المصلحة المشروعة</strong> — لتشغيل الكفالة وإيصال التقارير.
          </li>
          <li>
            <strong>الالتزام النظامي</strong> — للسجلّات المالية.
          </li>
        </ul>
      </Section>

      <Section title="3. صورة اليتيم">
        <p>
          الأصل هو <strong>عدم النشر</strong>. ولا تُنشر صورة إلا في إحدى حالتين:
        </p>
        <ul>
          <li>
            <strong>موافقة موثّقة</strong> من ولي الأمر، مرفوعة كوثيقة في النظام.
          </li>
          <li>
            <strong>صورة لا تُعرّف صاحبها</strong> (الوجه محجوب) — ولا تحتاج وثيقة.
          </li>
        </ul>
        <p>
          وسحب الموافقة يُزيل الصورة <strong>في الحال</strong>، لا بعد مراجعة ولا بعد مدّة. هذا
          مفروض في قاعدة البيانات نفسها لا في الواجهة، فلا يمكن تجاوزه.
        </p>
      </Section>

      <Section title="4. من يرى ماذا">
        <ul>
          <li>
            <strong>الزائر والكافل:</strong> البيانات العامة فقط. لا اسم كامل، لا هوية، لا وثائق، لا
            بيانات صحّية.
          </li>
          <li>
            <strong>الجهة الميدانية:</strong> ملفّات أيتامها وحدها.
          </li>
          <li>
            <strong>ولي الأمر:</strong> ملف من يرعاه وتقاريره — ولا يرى شيئاً عن الكفلاء.
          </li>
          <li>
            <strong>الإدارة:</strong> ما يلزم للمراجعة، وكل قرار تتّخذه يُسجَّل في سجلّ تدقيق.
          </li>
        </ul>
      </Section>

      <Section title="5. مدّة الاحتفاظ">
        <table>
          <thead>
            <tr>
              <th>البيانات</th>
              <th>المدّة</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>البيانات السرّية والوثائق</td>
              <td>سنتان بعد انتهاء آخر كفالة، أو فور سحب الموافقة</td>
            </tr>
            <tr>
              <td>الصورة</td>
              <td>تُحذف فور سحب الموافقة — بلا انتظار</td>
            </tr>
            <tr>
              <td>تقارير الأثر</td>
              <td>خمس سنوات بعد انتهاء الكفالة</td>
            </tr>
            <tr>
              <td>السجلّ المالي</td>
              <td>يُحتفظ به بمقتضى الالتزامات المحاسبية</td>
            </tr>
            <tr>
              <td>الإشعارات</td>
              <td>سنة</td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section title="6. حقوقك">
        <p>
          لك أن تطلب نسخة من بياناتك، أو تصحيحها، أو حذفها، أو سحب موافقتك. ويُستثنى من الحذف ما
          يلزمنا الاحتفاظ به نظاماً — وأهمّه السجلّ المالي.
        </p>
        <p>
          ولطلبات بيانات الأطفال: يُقدّمها <strong>ولي الأمر</strong> أو الجهة الميدانية المسؤولة.
        </p>
        <p>
          نموذج التواصل الرسمي قيد الإعداد وسيُتاح في هذه الصفحة، ونردّ على كل طلبٍ يصلنا عبره خلال
          ثلاثين يوماً.
        </p>
      </Section>

      <Section title="7. الأمن">
        <ul>
          <li>عزل البيانات مفروض في قاعدة البيانات نفسها لا في الواجهة.</li>
          <li>الوثائق في خزنة خاصة، تُقرأ بروابط موقّعة تنتهي بعد دقيقة.</li>
          <li>كل قرار إداري يُسجَّل في سجلّ تدقيق لا يُحذف.</li>
          <li>الاتصال مشفّر، ورؤوس الأمان مفروضة على كل استجابة.</li>
        </ul>
      </Section>

      <Section title="8. أطراف ثالثة">
        <ul>
          <li>
            <strong>مزوّد الاستضافة وقاعدة البيانات</strong> — لتشغيل المنصة.
          </li>
          <li>
            <strong>مزوّد الدفع</strong> — يعالج الدفع ولا نحفظ نحن بيانات البطاقة.
          </li>
          <li>
            <strong>مزوّد البريد</strong> — لإرسال الإشعارات.
          </li>
        </ul>
        <p>ولا نبيع بياناتك ولا نؤجّرها لأحد، ولا نستعملها في إعلانات.</p>
      </Section>
    </LegalPage>
  );
}

function PrivacyEn() {
  return (
    <LegalPage
      title="Privacy policy"
      binding
      updated="2026-08-26"
      intro="This platform processes children's data — among the most sensitive categories in any data protection regime — and we treat it that way, not as ordinary user data."
    >
      <Section title="1. Data we collect">
        <p className="font-medium">About the orphan:</p>
        <ul>
          <li>
            <strong>Shown publicly:</strong> a short display name, gender, age, city, school stage,
            a short story, and the monthly need.
          </li>
          <li>
            <strong>
              Confidential, never shown to anyone outside the organization, the administration and
              the guardian:
            </strong>{" "}
            full name, ID number, guardian details, address, family and income situation, health
            notes.
          </li>
          <li>
            <strong>Supporting documents:</strong> death certificate, proof of guardianship and
            related papers. They are kept in a private vault and can only be read through a
            short-lived link by someone entitled to it.
          </li>
        </ul>
        <p className="font-medium">About the sponsor:</p>
        <ul>
          <li>Email address and name, and the history of your sponsorships and payments.</li>
          <li>
            <strong>We don't store your card details.</strong> Payment happens directly with the
            payment provider; your card number never passes through our servers.
          </li>
        </ul>
      </Section>

      <Section title="2. Legal basis">
        <ul>
          <li>
            <strong>Guardian consent</strong> — for the orphan's confidential data, documents and
            photo.
          </li>
          <li>
            <strong>Legitimate interest</strong> — to run the sponsorship and deliver reports.
          </li>
          <li>
            <strong>Legal obligation</strong> — for financial records.
          </li>
        </ul>
      </Section>

      <Section title="3. The orphan's photo">
        <p>
          The default is <strong>not to publish</strong>. A photo is published only in one of two
          cases:
        </p>
        <ul>
          <li>
            <strong>Documented consent</strong> from the guardian, uploaded as a document in the
            system.
          </li>
          <li>
            <strong>A photo that doesn't identify the child</strong> (face hidden) — no document
            needed.
          </li>
        </ul>
        <p>
          Withdrawing consent removes the photo <strong>immediately</strong> — not after a review or
          a delay. This is enforced in the database itself, not the interface, so it can't be
          bypassed.
        </p>
      </Section>

      <Section title="4. Who sees what">
        <ul>
          <li>
            <strong>Visitors and sponsors:</strong> public data only. No full name, no ID, no
            documents, no health data.
          </li>
          <li>
            <strong>Field organization:</strong> only its own children's files.
          </li>
          <li>
            <strong>Guardian:</strong> the file and reports of the child in their care — and nothing
            about the sponsors.
          </li>
          <li>
            <strong>Administration:</strong> what review requires, and every decision it takes is
            recorded in an audit log.
          </li>
        </ul>
      </Section>

      <Section title="5. Retention">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Period</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Confidential data and documents</td>
              <td>Two years after the last sponsorship ends, or as soon as consent is withdrawn</td>
            </tr>
            <tr>
              <td>Photo</td>
              <td>Deleted as soon as consent is withdrawn — no waiting</td>
            </tr>
            <tr>
              <td>Impact reports</td>
              <td>Five years after the sponsorship ends</td>
            </tr>
            <tr>
              <td>Financial records</td>
              <td>Kept as accounting obligations require</td>
            </tr>
            <tr>
              <td>Notifications</td>
              <td>One year</td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Section title="6. Your rights">
        <p>
          You may ask for a copy of your data, its correction or deletion, or withdraw your consent.
          Data we are legally required to keep — above all financial records — is exempt from
          deletion.
        </p>
        <p>
          Requests about children's data are made by the <strong>guardian</strong> or the
          responsible field organization.
        </p>
        <p>
          The official contact form is being prepared and will be available on this page; we reply
          to every request received through it within thirty days.
        </p>
      </Section>

      <Section title="7. Security">
        <ul>
          <li>Data isolation is enforced in the database itself, not the interface.</li>
          <li>
            Documents sit in a private vault, read through signed links that expire after a minute.
          </li>
          <li>Every administrative decision is recorded in an audit log that can't be deleted.</li>
          <li>Connections are encrypted, and security headers are enforced on every response.</li>
        </ul>
      </Section>

      <Section title="8. Third parties">
        <ul>
          <li>
            <strong>Hosting and database provider</strong> — to run the platform.
          </li>
          <li>
            <strong>Payment provider</strong> — processes payments; we never store card data.
          </li>
          <li>
            <strong>Email provider</strong> — to send notifications.
          </li>
        </ul>
        <p>We don't sell or rent your data to anyone, and we don't use it for advertising.</p>
      </Section>
    </LegalPage>
  );
}
