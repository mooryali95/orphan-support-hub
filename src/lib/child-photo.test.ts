import { describe, expect, it } from "vitest";

import { CHILD_PHOTO_BUCKET, childPhotoPath, isChildPhotoPath } from "./child-photo";

const ID = "dcc30000-0000-4000-8000-00000000000b";

describe("isChildPhotoPath", () => {
  it("يقبل ملفّاً في مجلّد الطفل نفسه", () => {
    expect(isChildPhotoPath(ID, `${ID}/face.jpg`)).toBe(true);
  });

  it("يرفض رابط الخزنة العامّة القديم ورابطاً من نطاقٍ آخر", () => {
    expect(
      isChildPhotoPath(
        ID,
        `https://abcd.supabase.co/storage/v1/object/public/public-media/${ID}/face.jpg`,
      ),
    ).toBe(false);
    expect(isChildPhotoPath(ID, "https://evil.example/x.jpg")).toBe(false);
  });

  it("يرفض مجلّد طفلٍ آخر والصعود والمجلّدات الفرعية", () => {
    expect(isChildPhotoPath(ID, "11111111-1111-4111-8111-111111111111/face.jpg")).toBe(false);
    expect(isChildPhotoPath(ID, `${ID}/../other/face.jpg`)).toBe(false);
    expect(isChildPhotoPath(ID, `${ID}/sub/face.jpg`)).toBe(false);
    expect(isChildPhotoPath(ID, null)).toBe(false);
  });
});

describe("childPhotoPath", () => {
  it("يمرّر مسار مجلّد الطفل وحده، ولا يصدر رابطاً موقَّعاً", () => {
    expect(childPhotoPath(ID, `${ID}/face.jpg`)).toBe(`${ID}/face.jpg`);
    expect(childPhotoPath(ID, "https://evil.example/x.jpg")).toBeNull();
    expect(childPhotoPath(ID, null)).toBeNull();
    expect(CHILD_PHOTO_BUCKET).toBe("orphan-photos");
  });
});
