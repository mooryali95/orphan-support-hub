/**
 * بوّابة وضع التجربة — الموضع الواحد الذي يعرف منه الكود الحقيقي أنّ التجربة موجودة.
 *
 * لا يستورد الكود الحقيقي وحدة تجربة أبداً. وجود التجربة يُعرف من وجود ملفّ مدخلها
 * (`src/lib/try-entry.ts`، من ملفات `trial.manifest.json`): يُسأل عنه بـ`import.meta.glob`
 * فلا يُستورد هنا ولا يُحمَّل. فإذا حُذفت التجربة (`npm run trial:remove`) صار
 * `TRIAL_ENABLED` كاذباً، فاختفت روابط `/try` وجلسة العرض وفروعها من تلقاء نفسها، ولم يتغيّر
 * سطرٌ في الكود الحقيقي. (docs/trial-mode.ar.md)
 */
const entry = import.meta.glob("./try-entry.ts");

/** هل ملفّات التجربة موجودة في هذه النسخة؟ */
export const TRIAL_ENABLED: boolean = Object.keys(entry).length > 0;

/** مسارٌ من مسارات التجربة. */
export type TrialPath = `/try${string}`;

/**
 * مسار تجربة لرابطٍ في الكود الحقيقي. نوعه نوع الجذر عمداً: فلا يحتاج الكود الحقيقي إلى
 * أنواع مسارات `/try` التي تزول مع التجربة، ويبقى يُبنى بعد حذفها. ولا يُستعمل إلا في فرعٍ
 * لا يُبلغ إلا والتجربة موجودة (`TRIAL_ENABLED` أو جلسة العرض `useDemo()`).
 */
export const trialRoute = (path: TrialPath) => path as string as "/";
