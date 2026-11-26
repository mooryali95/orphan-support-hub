/**
 * منفذ البيانات — الموضع الواحد الذي تختار منه الشاشة مصدر بياناتها.
 *
 * الشاشة تطلب عمليةً باسمها (`useDataFn("golden.health", getDataHealth)`). في المنصّة
 * الحقيقية يُنادى الخادم. وفي جلسة التجربة (`useDemo()`) تُنادى نسختها التجريبية إن
 * سجّلتها وحدات التجربة، فتعمل الشاشة نفسها ببياناتٍ نموذجية في المتصفّح، بلا حسابٍ
 * ولا خادم.
 *
 * الكود الحقيقي لا يستورد وحدة تجربة أبداً: وحدات التجربة هي التي تسجّل نفسها هنا حين
 * يُحمَّل `/try`. فحذف التجربة يوم الإطلاق حذفُ مجلّدها ومساراتها وحده، ويبقى هذا
 * المنفذ يعيد الخادم دائماً. (src/lib/data-port.test.ts يقفل ذلك، وdocs/trial-mode.ar.md
 * يشرح الحذف.)
 */
import { useServerFn } from "@tanstack/react-start";

import { useCallback } from "react";

import { isDemoSession, useDemo } from "@/lib/demo-mode";

/** عمليةٌ كما تناديها الشاشة: مدخلٌ واحد اختياري، ونتيجةٌ موعودة. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PortFn = (input?: any) => Promise<any>;

const demo = new Map<string, PortFn>();

/** تسجّل وحدة التجربة نسختها من عملية. تُنادى من وحدات `src/lib/try-*` وحدها. */
export function registerDemo(name: string, fn: PortFn) {
  demo.set(name, fn);
}

/** للاختبار: أسماء العمليات المسجّلة. */
export const demoNames = () => [...demo.keys()];

/** للاختبار وحده. */
export function resetDemoRegistry() {
  demo.clear();
}

/**
 * العملية التي تناديها الشاشة: نسخة التجربة في جلسة التجربة إن وُجدت، وإلا الخادم.
 * الاسم ثابتٌ لكل عملية (`مجال.عملية`)، ويُكتب مرّةً في الشاشة ومرّةً في وحدة التجربة.
 */
export function useDataFn<F extends PortFn>(name: string, serverFn: F): F {
  const real = useServerFn(serverFn) as unknown as F;
  // يُعاد رسم الشاشة حين تتغيّر الجلسة، لكن المصدر يُقرَّر لحظة النداء: في أوّل تحميلٍ
  // تجريبي يقرأ الرسم «حقيقي» قبل أن يتّصل المتصفّح، فلا يُنادى الخادم خطأً.
  useDemo();
  return useCallback(
    ((input?: unknown) => {
      const fake = isDemoSession() ? demo.get(name) : undefined;
      return fake ? fake(input) : real(input);
    }) as F,
    [name, real],
  );
}

/** مفتاح الاستعلام يميّز المصدرين، فلا تختلط ذاكرة التجربة بذاكرة الخادم. */
export function useDataKey(key: readonly unknown[]): unknown[] {
  return useDemo() ? ["demo", ...key] : [...key];
}
