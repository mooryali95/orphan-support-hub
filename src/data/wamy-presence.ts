/**
 * حضور الندوة في كلّ دولة — **المصدر الوحيد** للرمز والاسم والحضور، ويُعدَّل هنا يدوياً.
 *
 * `wamy-network.ts` يبني منه قائمة الدول ويضيف إليها مؤشّرات الحاجة وسياقها
 * (`WAMY_NEED`)، فلا يتكرّر الحضور في الحزمة. صفحات الرؤية تستورد هذا الملفّ وحده
 * فتبقى خفيفة (ميزانية الحجم في CI)، والقاعة تحمل الاثنين بلا تكرار.
 * الترتيب هنا ترتيب الدول في كلّ مكان. (wamy-presence.test.ts، scripts/gen-wamy-presence.mjs)
 */
import type { Presence } from "@/data/wamy-network";

export type PresenceCountry = { code: string; nameAr: string; presence: Presence };

export const WAMY_PRESENCE: PresenceCountry[] = [
  {
    code: "SA",
    nameAr: "السعودية",
    presence: {
      status: "office",
      hq: true,
      city: {
        ar: "الرياض",
        en: "Riyadh",
      },
      type: {
        ar: "المقر الرئيسي — الأمانة العامة",
        en: "Headquarters — General Secretariat",
      },
      activity: {
        ar: "حفل الإفطار السنوي بحضور الأمين العام (فبراير 2026)",
        en: "Annual iftar attended by the Secretary-General (Feb 2026)",
      },
      year: 2026,
      source: "واس",
      url: "https://www.spa.gov.sa/N2522908",
      confidence: "high",
    },
  },
  {
    code: "TD",
    nameAr: "تشاد",
    presence: {
      status: "office",
      city: {
        ar: "أنجمينا",
        en: "N'Djamena",
      },
      type: {
        ar: "مكتب وطني",
        en: "Country office",
      },
      activity: {
        ar: "وزيرة الدولة للمرأة والطفولة تستقبل وفد المكتب وتشيد بكفالة الأيتام (يونيو 2026)، وحجر أساس مستوصف في أنجمينا (أبريل 2026)",
        en: "Minister of State for Women and Children receives the office and praises its orphan sponsorship (Jun 2026); clinic foundation stone in N'Djamena (Apr 2026)",
      },
      year: 2026,
      source: "صحيفة سبق",
      url: "https://sabq.org/article/lmirxd4",
      confidence: "high",
    },
  },
  {
    code: "NE",
    nameAr: "النيجر",
    presence: {
      status: "office",
      city: {
        ar: "نيامي",
        en: "Niamey",
      },
      type: {
        ar: "مكتب وطني",
        en: "Country office",
      },
      activity: {
        ar: "لقاء مع أمين عام وزارة الداخلية (أكتوبر 2026)، وصرف مستحقات معلمي القرآن (يوليو 2026)",
        en: "Meeting with the Interior Ministry's secretary-general (Oct 2026); Quran teachers paid (Jul 2026)",
      },
      year: 2026,
      source: "صحيفة سبق",
      url: "https://sabq.org/article/p5sni5i",
      confidence: "high",
    },
  },
  {
    code: "SD",
    nameAr: "السودان",
    presence: {
      status: "office",
      city: {
        ar: "الخرطوم",
        en: "Khartoum",
      },
      type: {
        ar: "مكتب وطني",
        en: "Country office",
      },
      activity: {
        ar: "ندوة الشراكات الاستراتيجية (سبتمبر 2026)، و3,400 سلة غذائية ومنظومات طاقة شمسية للمياه (ديسمبر 2025)",
        en: "Strategic partnerships seminar (Sep 2026); 3,400 food baskets and solar water systems (Dec 2025)",
      },
      year: 2026,
      source: "صحيفة سبق",
      url: "https://sabq.org/article/i8b3494",
      confidence: "high",
    },
  },
  {
    code: "KE",
    nameAr: "كينيا",
    presence: {
      status: "office",
      city: {
        ar: "نيروبي",
        en: "Nairobi",
      },
      type: {
        ar: "مكتب وطني",
        en: "Country office",
      },
      activity: {
        ar: "برنامج للأيتام في إسيولو ومويالي وأوكوندا (يونيو 2026)",
        en: "Orphan programme in Isiolo, Moyale and Okunda (Jun 2026)",
      },
      year: 2026,
      source: "واس عبر أردو بوينت؛ واس",
      url: "https://www.urdupoint.com/arabic/story/2211464.html",
      confidence: "high",
    },
  },
  {
    code: "DJ",
    nameAr: "جيبوتي",
    presence: {
      status: "office",
      city: {
        ar: "جيبوتي",
        en: "Djibouti",
      },
      type: {
        ar: "مكتب وطني وقاعدة إغاثية لليمن والصومال",
        en: "Country office and relief base for Yemen and Somalia",
      },
      activity: {
        ar: "رئيس الوزراء يزور أكاديمية العلوم والتكنولوجيا الصناعية التابعة للندوة (مارس 2026)",
        en: "Prime Minister visits WAMY's Academy of Industrial Science and Technology (Mar 2026)",
      },
      year: 2026,
      source: "واس",
      url: "https://www.spa.gov.sa/N2533732",
      confidence: "high",
    },
  },
  {
    code: "SN",
    nameAr: "السنغال",
    presence: {
      status: "office",
      city: {
        ar: "داكار",
        en: "Dakar",
      },
      type: {
        ar: "مكتب وطني",
        en: "Country office",
      },
      activity: {
        ar: "مسابقة القرآن والسنة لأفريقيا في داكار، والمنتدى الخامس للنخب (أبريل 2026)",
        en: "Africa Quran and Sunnah competition in Dakar and the 5th elites forum (Apr 2026)",
      },
      year: 2026,
      source: "جريدة المدينة؛ واس",
      url: "https://www.al-madina.com/article/986760",
      confidence: "high",
    },
  },
  {
    code: "GN",
    nameAr: "غينيا",
    presence: {
      status: "office",
      city: {
        ar: "كوناكري",
        en: "Conakry",
      },
      type: {
        ar: "مكتب وطني",
        en: "Country office",
      },
      activity: {
        ar: "حملة جراحة عيون (يناير 2026)، وقافلة جراحية أجرت 221 عملية (نوفمبر 2025)",
        en: "Eye-surgery campaign (Jan 2026); surgical caravan with 221 operations (Nov 2025)",
      },
      year: 2026,
      source: "صحيفة سبق / موقع الندوة",
      url: "https://sabq.org/saudia/regions/j9guxjjowd",
      confidence: "medium",
    },
  },
  {
    code: "MR",
    nameAr: "موريتانيا",
    presence: {
      status: "office",
      city: {
        ar: "نواكشوط",
        en: "Nouakchott",
      },
      type: {
        ar: "مكتب وطني",
        en: "Country office",
      },
      activity: {
        ar: "حجر أساس مجمع تعليمي في أغوركيت بولاية البراكنة (يوليو 2026)",
        en: "Foundation stone of an education complex in Aghorguit, Brakna (Jul 2026)",
      },
      year: 2026,
      source: "صحيفة سبق",
      url: "https://sabq.org/article/tjru6hl",
      confidence: "medium",
    },
  },
  {
    code: "EG",
    nameAr: "مصر",
    presence: {
      status: "office",
      city: {
        ar: "القاهرة",
        en: "Cairo",
      },
      type: {
        ar: "مكتب وطني يرعى طلاب الأزهر الوافدين",
        en: "Country office for international Al-Azhar students",
      },
      activity: {
        ar: "الملتقى الشبابي العاشر في الجلالة (أكتوبر 2026)",
        en: "10th youth forum in Galala (Oct 2026)",
      },
      year: 2026,
      source: "المجلس الإسلامي العالمي للدعوة والإغاثة؛ اليوم السابع",
      url: "https://iicdr.com/ar/%D8%A7%D9%84%D8%A3%D8%AE%D8%A8%D8%A7%D8%B1/%D8%A3%D8%AE%D8%A8%D8%A7%D8%B1-%D8%A7%D9%84%D9%85%D9%86%D8%B8%D9%85%D8%A7%D8%AA-%D8%A7%D9%84%D8%A3%D8%B9%D8%B6%D8%A7%D8%A1.html",
      confidence: "medium",
    },
  },
  {
    code: "NG",
    nameAr: "نيجيريا",
    presence: {
      status: "office",
      city: null,
      type: {
        ar: "مكتب وطني",
        en: "Country office",
      },
      activity: {
        ar: "حجر أساس مستوصف ضمن مركز تنموي في منطقة جيجاوا",
        en: "Clinic foundation stone in a development centre in Jigawa",
      },
      year: 2026,
      source: "موقع الندوة wamy.org",
      url: "https://wamy.org/en/blog/shy-4/lndw-l-lmy-twss-mstwsfan-tbyan-ywfr-l-lj-llmrd-wykfh-ntshr-lwby-fy-nyjyry-7",
      confidence: "medium",
    },
  },
  {
    code: "KG",
    nameAr: "قيرغيزستان",
    presence: {
      status: "office",
      city: null,
      type: {
        ar: "مكتب وطني",
        en: "Country office",
      },
      activity: {
        ar: "البرلمان القيرغيزي يكرّم المكتب بوسام (أغسطس 2026)، ومدرسة قرآنية في أوزغن (يوليو 2026)",
        en: "Kyrgyz parliament honours the office with a medal (Aug 2026); Quran school in Uzgen (Jul 2026)",
      },
      year: 2026,
      source: "واس عبر أردو بوينت؛ سبق",
      url: "https://www.urdupoint.com/arabic/story/2231616.html",
      confidence: "high",
    },
  },
  {
    code: "TH",
    nameAr: "تايلاند",
    presence: {
      status: "office",
      city: null,
      type: {
        ar: "مكتب وطني",
        en: "Country office",
      },
      activity: {
        ar: "550 سلة إغاثية لمتضرري الفيضانات، والحفل السنوي الـ17 لتكريم الأيتام المتفوقين (يناير 2026)",
        en: "550 relief baskets for flood victims and the 17th annual ceremony for high-achieving orphans (Jan 2026)",
      },
      year: 2026,
      source: "صحيفة سبق؛ واس عبر أردو بوينت",
      url: "https://sabq.org/article/QzQCCTa",
      confidence: "high",
    },
  },
  {
    code: "CM",
    nameAr: "الكاميرون",
    presence: {
      status: "office",
      city: null,
      type: {
        ar: "مكتب وطني",
        en: "Country office",
      },
      activity: {
        ar: "القافلة الجراحية الـ23 في ماروا بأقصى الشمال (ديسمبر 2025)",
        en: "23rd surgical caravan in Maroua, Far North (Dec 2025)",
      },
      year: 2025,
      source: "صحيفة سبق",
      url: "https://sabq.org/article/ehM4yLP",
      confidence: "high",
    },
  },
  {
    code: "ML",
    nameAr: "مالي",
    presence: {
      status: "office",
      city: null,
      type: {
        ar: "مكتب وطني",
        en: "Country office",
      },
      activity: {
        ar: "افتتاح مستوصف في سيقو يخدم أكثر من 800 أسرة",
        en: "Clinic opened in Ségou serving more than 800 families",
      },
      year: 2025,
      source: "صحيفة سبق (التاريخ مستنتج من مسار الصورة)",
      url: "https://sabq.org/article/p2ic-qc",
      confidence: "medium",
    },
  },
  {
    code: "ID",
    nameAr: "إندونيسيا",
    presence: {
      status: "office",
      city: {
        ar: "جاكرتا",
        en: "Jakarta",
      },
      type: {
        ar: "مكتب وطني",
        en: "Country office",
      },
      activity: {
        ar: "كسوة 700 يتيم في جاكرتا وتاسكمالايا وسوبانغ وسولو (أكتوبر 2025)",
        en: "Clothing for 700 orphans in Jakarta, Tasikmalaya, Subang and Solo (Oct 2025)",
      },
      year: 2025,
      source: "واس عبر أردو بوينت / مدونة الندوة",
      url: "https://www.urdupoint.com/arabic/story/2064070.html",
      confidence: "high",
    },
  },
  {
    code: "BD",
    nameAr: "بنغلاديش",
    presence: {
      status: "office",
      city: {
        ar: "دكا",
        en: "Dhaka",
      },
      type: {
        ar: "مكتب وطني",
        en: "Country office",
      },
      activity: {
        ar: "افتتاح مستوصف في باغيرهات (ديسمبر 2025)",
        en: "Clinic opened in Bagerhat (Dec 2025)",
      },
      year: 2025,
      source: "صحيفة سبق؛ حساب السفارة السعودية على X",
      url: "https://sabq.org/article/JTvn7mq",
      confidence: "high",
    },
  },
  {
    code: "BA",
    nameAr: "البوسنة والهرسك",
    presence: {
      status: "office",
      city: {
        ar: "سراييفو",
        en: "Sarajevo",
      },
      type: {
        ar: "مكتب وطني ينسّق أنشطة البلقان",
        en: "Country office coordinating Balkan programmes",
      },
      activity: {
        ar: "تخطيط لتعليم العربية (نوفمبر 2025)، وتصريح بعد مسابقة قرآنية (فبراير 2026)",
        en: "Arabic-teaching plans (Nov 2025); statement after a Quran competition (Feb 2026)",
      },
      year: 2025,
      source: "واس",
      url: "https://www.spa.gov.sa/N2448195",
      confidence: "high",
    },
  },
  {
    code: "BR",
    nameAr: "البرازيل",
    presence: {
      status: "office",
      city: {
        ar: "ساو برناردو دو كامبو",
        en: "São Bernardo do Campo",
      },
      type: {
        ar: "مكتب إقليمي لأمريكا اللاتينية",
        en: "Regional office for Latin America",
      },
      activity: {
        ar: "ختام الملتقى الإقليمي لشباب أمريكا اللاتينية في ساو باولو (يناير 2025)",
        en: "Latin American regional youth forum closes in São Paulo (Jan 2025)",
      },
      year: 2025,
      source: "واس؛ wamybr.org",
      url: "https://www.spa.gov.sa/N2248091",
      confidence: "high",
    },
  },
  {
    code: "PS",
    nameAr: "فلسطين",
    presence: {
      status: "office",
      city: {
        ar: "غزة",
        en: "Gaza",
      },
      type: {
        ar: "مكتب وطني",
        en: "Country office",
      },
      activity: {
        ar: "حملة إغاثية في غزة بأكثر من 1,200 سلة غذائية ومياه شرب (أغسطس 2024)",
        en: "Gaza relief campaign with more than 1,200 food baskets and drinking water (Aug 2024)",
      },
      year: 2024,
      source: "حساب الندوة الرسمي على X؛ صحيفة عناوين",
      url: "https://x.com/wamy/status/1825798791628280275",
      confidence: "high",
    },
  },
  {
    code: "AL",
    nameAr: "ألبانيا",
    presence: {
      status: "field",
      city: null,
      type: {
        ar: "نشاط ميداني — المكتب غير مؤكد",
        en: "Field activity — office not confirmed",
      },
      activity: {
        ar: "ضمن دول برنامج إفطار الصائم (مارس 2025)",
        en: "Included in the iftar programme (Mar 2025)",
      },
      year: 2025,
      source: "مدونة الندوة o.wamy.org",
      url: "https://o.wamy.org/blog/%D8%A7%D9%84%D9%86%D8%AF%D9%88%D8%A9-3/%D8%A7%D9%84%D9%86%D8%AF%D9%88%D8%A9-%D8%A7%D9%84%D8%B9%D8%A7%D9%84%D9%85%D9%8A%D8%A9-%D8%AA%D8%B7%D9%84%D9%82-%D8%A8%D8%B1%D9%86%D8%A7%D9%85%D8%AC-%D8%A7%D9%81%D8%B7%D8%A7%D8%B1-%D8%A7%D9%84%D8%B5%D8%A7%D9%8A%D9%85-%D9%81%D9%8A-%D8%B9%D8%AF%D8%AF-%D9%85%D9%86-%D8%A7%D9%84%D8%AF%D9%88%D9%84-%D8%A8%D8%AB%D9%84%D8%A7%D8%AB-%D9%82%D8%A7%D8%B1%D8%A7%D8%AA-68",
      confidence: "medium",
    },
  },
  {
    code: "XK",
    nameAr: "كوسوفو",
    presence: {
      status: "field",
      city: null,
      type: {
        ar: "نشاط ميداني — المكتب غير مؤكد",
        en: "Field activity — office not confirmed",
      },
      activity: {
        ar: "ضمن دول برنامج إفطار الصائم (مارس 2025)",
        en: "Included in the iftar programme (Mar 2025)",
      },
      year: 2025,
      source: "مدونة الندوة o.wamy.org",
      url: "https://o.wamy.org/blog/%D8%A7%D9%84%D9%86%D8%AF%D9%88%D8%A9-3/%D8%A7%D9%84%D9%86%D8%AF%D9%88%D8%A9-%D8%A7%D9%84%D8%B9%D8%A7%D9%84%D9%85%D9%8A%D8%A9-%D8%AA%D8%B7%D9%84%D9%82-%D8%A8%D8%B1%D9%86%D8%A7%D9%85%D8%AC-%D8%A7%D9%81%D8%B7%D8%A7%D8%B1-%D8%A7%D9%84%D8%B5%D8%A7%D9%8A%D9%85-%D9%81%D9%8A-%D8%B9%D8%AF%D8%AF-%D9%85%D9%86-%D8%A7%D9%84%D8%AF%D9%88%D9%84-%D8%A8%D8%AB%D9%84%D8%A7%D8%AB-%D9%82%D8%A7%D8%B1%D8%A7%D8%AA-68",
      confidence: "medium",
    },
  },
  {
    code: "MK",
    nameAr: "مقدونيا الشمالية",
    presence: {
      status: "field",
      city: null,
      type: {
        ar: "نشاط ميداني — المكتب غير مؤكد",
        en: "Field activity — office not confirmed",
      },
      activity: {
        ar: "أول برنامج غمرٍ لغوي لخريجي أقسام العربية (نحو يناير 2026)",
        en: "First Arabic immersion programme for Arabic-department graduates (around Jan 2026)",
      },
      year: 2026,
      source: "موقع الندوة wamy.org (التاريخ تقريبي، نحو يناير 2026)",
      url: "https://wamy.org/en/blog/t-lymy-2/lwl-mr-fy-dwl-mqdwny-lshmly-lndw-l-lmy-tqym-brnmj-lgmr-llgwy-lkhryjy-qsm-llg-l-rby-157",
      confidence: "medium",
    },
  },
  {
    code: "ET",
    nameAr: "إثيوبيا",
    presence: {
      status: "field",
      city: null,
      type: {
        ar: "نشاط ميداني — المكتب غير مؤكد",
        en: "Field activity — office not confirmed",
      },
      activity: {
        ar: "اختتام القافلة الجراحية الثانية بـ440 عملية (سبتمبر 2026)، والأولى في جيجيغا (أغسطس 2025)",
        en: "Second surgical caravan closes with 440 operations (Sep 2026); the first was in Jijiga (Aug 2025)",
      },
      year: 2026,
      source: "واس (بالإنجليزية)",
      url: "https://www.spa.gov.sa/en/N2675749",
      confidence: "high",
    },
  },
  {
    code: "TZ",
    nameAr: "تنزانيا",
    presence: {
      status: "field",
      city: null,
      type: {
        ar: "نشاط ميداني — المكتب غير مؤكد",
        en: "Field activity — office not confirmed",
      },
      activity: {
        ar: "القافلة الجراحية السابعة في جزيرة بمبا (نحو 250 عملية)",
        en: "Seventh surgical caravan on Pemba island (about 250 operations)",
      },
      year: 2025,
      source: "جريدة المدينة (السنة مستنتجة من تسلسل أرقام المقالات)؛ السفارة السعودية في تنزانيا",
      url: "https://www.al-madina.com/article/966689",
      confidence: "medium",
    },
  },
  {
    code: "RW",
    nameAr: "رواندا",
    presence: {
      status: "field",
      city: null,
      type: {
        ar: "نشاط ميداني وشراكة — المكتب غير مؤكد",
        en: "Field activity and partnership — office not confirmed",
      },
      activity: {
        ar: "مذكرة تفاهم مع المجلس الأعلى للشؤون الإسلامية في رواندا (أبريل 2025)",
        en: "Memorandum of understanding with Rwanda's Muslim council (Apr 2025)",
      },
      year: 2025,
      source: "المجلس الإسلامي العالمي للدعوة والإغاثة؛ حساب الندوة على X (27 أبريل 2025)",
      url: "https://x.com/wamy/status/1916573725291323690",
      confidence: "medium",
    },
  },
  {
    code: "CI",
    nameAr: "كوت ديفوار",
    presence: {
      status: "field",
      city: null,
      type: {
        ar: "نشاط ميداني عبر شريك — المكتب غير مؤكد",
        en: "Field activity through a partner — office not confirmed",
      },
      activity: {
        ar: "مشروع الحقيبة المدرسية (أبريل 2026)",
        en: "School-bag project (Apr 2026)",
      },
      year: 2026,
      source: "صحيفة سبق",
      url: "https://sabq.org/article/SEbR9LR",
      confidence: "high",
    },
  },
  {
    code: "SO",
    nameAr: "الصومال",
    presence: {
      status: "unconfirmed",
      lastEvidenceYear: 2023,
      source: "صحيفة سبق (التاريخ تقريبي)",
      url: "https://sabq.org/saudia/regions/4290mf2jtq",
    },
  },
  {
    code: "YE",
    nameAr: "اليمن",
    presence: {
      status: "unconfirmed",
      lastEvidenceYear: 2025,
      source: "فيديو على يوتيوب للجهة المنفذة",
      url: "https://www.youtube.com/watch?v=Ocoe3tWrQcA",
    },
  },
  {
    code: "PH",
    nameAr: "الفلبين",
    presence: {
      status: "unconfirmed",
      lastEvidenceYear: 2022,
      source: "حساب المكتب @wamyph",
      url: "https://x.com/wamyph",
    },
  },
  {
    code: "IQ",
    nameAr: "العراق",
    presence: {
      status: "unconfirmed",
      lastEvidenceYear: 2017,
      source: "المجلس الإسلامي العالمي للدعوة والإغاثة",
      url: "https://iicdr.com/ar/%D8%A7%D9%84%D8%A3%D8%AE%D8%A8%D8%A7%D8%B1/%D8%A3%D8%AE%D8%A8%D8%A7%D8%B1-%D8%A7%D9%84%D9%85%D9%86%D8%B8%D9%85%D8%A7%D8%AA-%D8%A7%D9%84%D8%A3%D8%B9%D8%B6%D8%A7%D8%A1/item/4200",
    },
  },
  {
    code: "ZA",
    nameAr: "جنوب أفريقيا",
    presence: {
      status: "unconfirmed",
      lastEvidenceYear: null,
      source: "wamy.co.za",
      url: "https://www.wamy.co.za/contact.html",
    },
  },
  {
    code: "MY",
    nameAr: "ماليزيا",
    presence: {
      status: "unconfirmed",
      lastEvidenceYear: 2010,
      source: "واس",
      url: "https://www.spa.gov.sa/775998",
    },
  },
  {
    code: "TJ",
    nameAr: "طاجيكستان",
    presence: {
      status: "unconfirmed",
      lastEvidenceYear: null,
      source: null,
      url: null,
    },
  },
  {
    code: "UG",
    nameAr: "أوغندا",
    presence: {
      status: "unconfirmed",
      lastEvidenceYear: null,
      source: null,
      url: null,
    },
  },
  {
    code: "LK",
    nameAr: "سريلانكا",
    presence: {
      status: "office",
      city: null,
      type: {
        ar: "مكتب وطني",
        en: "Country office",
      },
      activity: {
        ar: "دولة أساسية في المنصّة: كفالة الأيتام وتأهيلهم",
        en: "A core platform country: orphan sponsorship and qualification",
      },
      year: 2026,
      source: "إفادة إدارة الندوة للمنصّة (نوفمبر 2026)",
      url: "",
      confidence: "medium",
    },
  },
  {
    code: "PK",
    nameAr: "باكستان",
    presence: {
      status: "office",
      city: null,
      type: {
        ar: "مكتب وطني",
        en: "Country office",
      },
      activity: {
        ar: "دولة أساسية في المنصّة عبر برامج كشمير: كفالة الأيتام وتأهيلهم",
        en: "A core platform country through its Kashmir programs: orphan sponsorship and qualification",
      },
      year: 2026,
      source: "إفادة إدارة الندوة للمنصّة (نوفمبر 2026)",
      url: "",
      confidence: "medium",
    },
  },
];
