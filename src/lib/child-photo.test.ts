import { describe, expect, it, vi } from "vitest";

import {
  CHILD_PHOTO_BUCKET,
  CHILD_PHOTO_TTL_SECONDS,
  isChildPhotoPath,
  signChildPhoto,
} from "./child-photo";

const ID = "dcc30000-0000-4000-8000-00000000000b";

function fakeClient(result: { data: { signedUrl: string } | null; error: unknown }) {
  const createSignedUrl = vi.fn(async () => result);
  const from = vi.fn(() => ({ createSignedUrl }));
  return { client: { storage: { from } }, from, createSignedUrl };
}

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

describe("signChildPhoto", () => {
  it("يوقّع من الخزنة الخاصّة بمدّةٍ قصيرة", async () => {
    const { client, from, createSignedUrl } = fakeClient({
      data: { signedUrl: "https://signed.example/x" },
      error: null,
    });
    await expect(signChildPhoto(client, ID, `${ID}/face.jpg`)).resolves.toBe(
      "https://signed.example/x",
    );
    expect(from).toHaveBeenCalledWith(CHILD_PHOTO_BUCKET);
    expect(createSignedUrl).toHaveBeenCalledWith(`${ID}/face.jpg`, CHILD_PHOTO_TTL_SECONDS);
    expect(CHILD_PHOTO_TTL_SECONDS).toBeLessThanOrEqual(900);
  });

  it("لا يمرّر رابطاً قديماً ولا يسأل الخزنة عنه", async () => {
    const { client, from } = fakeClient({ data: null, error: null });
    await expect(
      signChildPhoto(
        client,
        ID,
        `https://x.supabase.co/storage/v1/object/public/public-media/${ID}/a.jpg`,
      ),
    ).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("رفضُ الخزنة (لا نطاق، أو سُحبت الموافقة) يعني لا صورة", async () => {
    const { client } = fakeClient({ data: null, error: { message: "denied" } });
    await expect(signChildPhoto(client, ID, `${ID}/face.jpg`)).resolves.toBeNull();
  });
});
