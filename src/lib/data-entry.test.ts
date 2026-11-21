import { describe, expect, it } from "vitest";

import {
  checkPerson,
  duplicatesInFile,
  isDemoReference,
  isMissingObject,
  latinDigits,
  mapHeader,
  matchCountry,
  matchRegion,
  networkDiff,
  networkDiffSize,
  parseCsv,
  parseDate,
  parseGender,
  readSheet,
  templateCsv,
  type ValidationContext,
} from "@/lib/data-entry";

const countries = [
  { code: "AL", name_ar: "ألبانيا", name_local: "Shqipëri" },
  { code: "JO", name_ar: "الأردن", name_local: "Jordan" },
];
const alRegions = [
  { name_ar: "تيرانا", name_local: "Tiranë", active: true },
  { name_ar: "شكودر", name_local: "Shkodër", active: true },
  { name_ar: "ديبر", name_local: "Dibër", active: false },
];
const ctx: ValidationContext = {
  countries,
  regionsByCountry: new Map([
    ["AL", alRegions],
    ["JO", [{ name_ar: "عمّان", name_local: "Amman", active: true }]],
  ]),
  groups: [
    { id: "g-al", name: "حلقة شكودر", country_code: "AL", region: "شكودر", source: null },
    { id: "g-jo", name: "حلقة عمّان", country_code: "JO", region: null, source: null },
    {
      id: "g-sync",
      name: "مجموعة الرواد",
      country_code: "AL",
      region: "تيرانا",
      source: "rowad-albania",
    },
  ],
  today: "2026-11-21",
};
const base = { display_name: "سالم", gender: "ذكر", country: "ألبانيا" };

describe("هجرةٌ لم تُطبَّق ليست خطأً", () => {
  it("الدالّة أو الجدول أو العمود الغائب يُعرف برمزه أو برسالته", () => {
    expect(isMissingObject({ code: "PGRST202", message: "x" })).toBe(true);
    expect(isMissingObject({ code: "42P01" })).toBe(true);
    expect(isMissingObject({ code: "42703" })).toBe(true);
    expect(
      isMissingObject({
        message: "Could not find the function public.admin_regions(_country) in the schema cache",
      }),
    ).toBe(true);
    expect(isMissingObject({ message: 'relation "public.country_regions" does not exist' })).toBe(
      true,
    );
  });

  it("رفض الصلاحية والخطأ العامّ يبقيان خطأً", () => {
    expect(isMissingObject({ code: "42501", message: "admin_only" })).toBe(false);
    expect(isMissingObject({ code: "23505", message: "region_exists" })).toBe(false);
    expect(isMissingObject(null)).toBe(false);
  });
});

describe("دول الشبكة: الفرق قبل التطبيق", () => {
  const network = [
    { code: "AL", nameAr: "ألبانيا" },
    { code: "JO", nameAr: "الأردن" },
    { code: "SN", nameAr: "السنغال" },
  ];

  it("الغائبة تُضاف، وغير المعلَّمة تُعلَّم، والمعلَّمة خارج القائمة يُرفع تعليمها", () => {
    const diff = networkDiff(
      [
        { code: "AL", name_ar: "ألبانيا", in_network: true },
        { code: "JO", name_ar: "الأردن", in_network: false },
        { code: "FR", name_ar: "فرنسا", in_network: true },
        { code: "DE", name_ar: "ألمانيا", in_network: false },
      ],
      network,
    );
    expect(diff.add.map((c) => c.code)).toEqual(["SN"]);
    expect(diff.enable.map((c) => c.code)).toEqual(["JO"]);
    expect(diff.disable.map((c) => c.code)).toEqual(["FR"]);
    expect(diff.unchanged).toBe(1);
    expect(networkDiffSize(diff)).toBe(3);
  });

  it("قاعدةٌ مطابقة لا فرق فيها", () => {
    const diff = networkDiff(
      network.map((n) => ({ code: n.code, name_ar: n.nameAr, in_network: true })),
      network,
    );
    expect(networkDiffSize(diff)).toBe(0);
    expect(diff.unchanged).toBe(3);
  });
});

describe("الدولة أوّلاً ثم منطقتها", () => {
  it("الدولة تُعرف برمزها واسمها بأيّ لغة — من سجلّ المنصّة وحده", () => {
    expect(matchCountry("al", countries)).toBe("AL");
    expect(matchCountry("ألبانيا", countries)).toBe("AL");
    expect(matchCountry("Albania", countries)).toBe("AL");
    expect(matchCountry("Shqipëri", countries)).toBe("AL");
    expect(matchCountry("الاردن", countries)).toBe("JO");
    // دولةٌ حقيقية ليست في السجلّ لا تُقبل.
    expect(matchCountry("فرنسا", countries)).toBeNull();
    expect(matchCountry("", countries)).toBeNull();
  });

  it("المنطقة من مناطق تلك الدولة، بالاسم المعتمد، والموقوفة لا تُقبل", () => {
    expect(matchRegion("Shkodër", alRegions)).toBe("شكودر");
    expect(matchRegion(" شكودر ", alRegions)).toBe("شكودر");
    expect(matchRegion("ديبر", alRegions)).toBeNull();
    expect(matchRegion("عمّان", alRegions)).toBeNull();
  });

  it("منطقةٌ من دولةٍ أخرى خطأ في الصفّ", () => {
    const row = checkPerson({ ...base, region: "عمّان" }, ctx);
    expect(row.errors).toEqual(["region_unknown"]);
    expect(row.payload).toBeNull();
    expect(checkPerson({ ...base, country: "الأردن", region: "Amman" }, ctx).payload).toMatchObject(
      { country: "JO", region: "عمّان" },
    );
  });

  it("مناطق الدولة إن لم تُحمَّل: تنبيهٌ والنصّ يُرسل ليطابقه الخادم", () => {
    const row = checkPerson({ ...base, region: "تيرانا" }, { ...ctx, regionsByCountry: new Map() });
    expect(row.warnings).toEqual(["regions_not_loaded"]);
    expect(row.payload?.region).toBe("تيرانا");
  });
});

describe("فحص الصفّ", () => {
  it("الحدّ الأدنى: اسمٌ وجنسٌ ودولة — والدولة تخرج رمزاً", () => {
    const row = checkPerson(base, ctx);
    expect(row.errors).toEqual([]);
    expect(row.payload).toEqual({ display_name: "سالم", gender: "male", country: "AL" });
  });

  it("الأخطاء مسمّاة كما تسمّيها القاعدة", () => {
    const row = checkPerson(
      {
        display_name: "أ",
        gender: "؟",
        country: "أطلانطس",
        birth_date: "31/02/2015",
        monthly_need: "كثير",
        external_ref: "try-07",
      },
      ctx,
    );
    expect(row.errors).toEqual([
      "name_required",
      "gender_invalid",
      "country_unknown",
      "birth_date_invalid",
      "need_invalid",
      "demo_reference",
    ]);
    expect(checkPerson({ display_name: "سالم", gender: "ذكر" }, ctx).errors).toEqual([
      "country_required",
    ]);
  });

  it("التاريخ والجنس والأرقام بصيغها الشائعة", () => {
    expect(parseDate("2015-3-2")).toBe("2015-03-02");
    expect(parseDate("02/03/2015")).toBe("2015-03-02");
    expect(parseDate(String.fromCharCode(0x0662, 0x0660, 0x0661, 0x0665) + "-03-02")).toBe(
      "2015-03-02",
    );
    expect(parseDate("2015-13-01")).toBeNull();
    expect(parseGender("أنثى")).toBe("female");
    expect(parseGender("M")).toBe("male");
    expect(parseGender("طفل")).toBeNull();
    expect(latinDigits(String.fromCharCode(0x0664, 0x0660))).toBe("40");
    const row = checkPerson({ ...base, birth_date: "2/3/2015", monthly_need: "40,5" }, ctx);
    expect(row.payload).toMatchObject({ birth_date: "2015-03-02", monthly_need: "40.5" });
    expect(checkPerson({ ...base, birth_date: "2030-01-01" }, ctx).errors).toEqual([
      "birth_date_invalid",
    ]);
    expect(checkPerson({ ...base, birth_date: "1990-01-01" }, ctx).errors).toEqual([
      "birth_date_invalid",
    ]);
  });

  it("مراجع العرض التجريبي لا تدخل", () => {
    expect(isDemoReference("try-12")).toBe(true);
    expect(isDemoReference("DEMO-AL-3")).toBe(true);
    expect(isDemoReference("csv-12")).toBe(false);
    expect(checkPerson({ ...base, display_name: "DEMO-طفل" }, ctx).errors).toEqual([
      "demo_reference",
    ]);
  });
});

describe("المجموعة: العضو يتبعها، والتعارض ظاهر", () => {
  it("بلا منطقة: يأخذ منطقة مجموعته مع تنبيه", () => {
    const row = checkPerson({ ...base, group: "حلقة شكودر" }, ctx);
    expect(row.payload).toMatchObject({ group_id: "g-al", region: "شكودر" });
    expect(row.warnings).toEqual(["region_from_group"]);
  });

  it("منطقةٌ تخالف المجموعة: تبقى كما كُتبت، مع تنبيه", () => {
    const row = checkPerson({ ...base, group: "حلقة شكودر", region: "تيرانا" }, ctx);
    expect(row.payload?.region).toBe("تيرانا");
    expect(row.warnings).toEqual(["group_region_differs"]);
  });

  it("مجموعةٌ من دولةٍ أخرى أو مرآوية أو مجهولة: خطأ", () => {
    expect(checkPerson({ ...base, group: "حلقة عمّان" }, ctx).errors).toEqual([
      "group_country_mismatch",
    ]);
    expect(checkPerson({ ...base, group: "مجموعة الرواد" }, ctx).errors).toEqual(["group_synced"]);
    expect(checkPerson({ ...base, group: "لا وجود لها" }, ctx).errors).toEqual(["group_unknown"]);
  });
});

describe("التكرار داخل الملفّ", () => {
  it("الاسم نفسه في الدولة نفسها (مع اختلاف التشكيل والهمزة)، أو المرجع نفسه", () => {
    const rows = [
      checkPerson(base, ctx),
      checkPerson({ ...base, display_name: "سَالِم" }, ctx),
      checkPerson({ ...base, country: "JO" }, ctx),
      checkPerson({ ...base, display_name: "هدى", gender: "أنثى", external_ref: "r-1" }, ctx),
      checkPerson({ ...base, display_name: "نور", gender: "أنثى", external_ref: "r-1" }, ctx),
      checkPerson({ display_name: "", gender: "", country: "" }, ctx),
    ];
    const dups = duplicatesInFile(rows);
    expect([...dups.entries()]).toEqual([
      [1, 0],
      [4, 3],
    ]);
  });
});

describe("CSV", () => {
  it("BOM وعلامات التنصيص والأسطر داخل الخلية والفاصلة العليا الواقية", () => {
    const rows = parseCsv(
      '\uFEFFالاسم المستعار,الجنس,الدولة\r\n"سالم, الصغير",ذكر,AL\r\n"سطر\nثانٍ","قال ""نعم""",\'=AL\r\n\r\n',
    );
    expect(rows).toEqual([
      ["الاسم المستعار", "الجنس", "الدولة"],
      ["سالم, الصغير", "ذكر", "AL"],
      ["سطر\nثانٍ", 'قال "نعم"', "=AL"],
    ]);
  });

  it("الفاصل يُستنتج: فاصلة منقوطة أو جدولة", () => {
    expect(parseCsv("name;gender;country\nA B;m;AL")).toEqual([
      ["name", "gender", "country"],
      ["A B", "m", "AL"],
    ]);
    expect(parseCsv("name\tgender\nA, B\tf")).toEqual([
      ["name", "gender"],
      ["A, B", "f"],
    ]);
  });

  it("العناوين بالعربية والإنجليزية، والمجهول يُذكر، والإلزاميّ الغائب يُذكر", () => {
    expect(mapHeader("الاسم المستعار")).toBe("display_name");
    expect(mapHeader("Country")).toBe("country");
    expect(mapHeader("المحافظة")).toBe("region");
    expect(mapHeader("لون العين")).toBeNull();
    const sheet = readSheet("الاسم,المنطقة,لون العين,الاسم\nسالم,تيرانا,بنّي,آخر\n");
    expect(sheet.rows).toEqual([{ display_name: "سالم", region: "تيرانا" }]);
    expect(sheet.ignored).toEqual(["لون العين"]);
    expect(sheet.missing).toEqual(["gender", "country"]);
    expect(readSheet("").missing).toEqual(["display_name", "gender", "country"]);
  });

  it("القالب يُقرأ كما كُتب: كلّ عمودٍ فيه حقلٌ معروف", () => {
    const sheet = readSheet(
      templateCsv({ name: "اسم مستعار", gender: "ذكر", country: "ألبانيا", region: "تيرانا" }),
    );
    expect(sheet.ignored).toEqual([]);
    expect(sheet.missing).toEqual([]);
    expect(checkPerson(sheet.rows[0]!, ctx).payload).toMatchObject({
      country: "AL",
      region: "تيرانا",
      gender: "male",
    });
  });
});
