/**
 * CSV للتصدير الإداري (PRD-13).
 *
 * - BOM في أوّله: Excel يقرأ العربية بلا تشويه.
 * - كلّ خليةٍ تبدأ بـ= أو + أو - أو @ أو بمحرف جدولة/رجوع تُسبَق بفاصلة
 *   عليا: اسمٌ يكتبه كافلٌ مثل «=HYPERLINK(...)» لا يصير صيغةً تُنفَّذ على
 *   جهاز الإدارة (حقن الصيغ).
 * - الأعمدة من اتّحاد مفاتيح الصفوف بترتيب ظهورها، فصفٌّ ناقصٌ لا يُزيح غيره.
 */
export function toCsv(rows: ReadonlyArray<Record<string, unknown>>): string {
  const columns: string[] = [];
  for (const row of rows)
    for (const k of Object.keys(row)) if (!columns.includes(k)) columns.push(k);
  const lines = [columns.map(cell).join(",")];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c])).join(","));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
