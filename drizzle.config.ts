// ليس طريق هجرة (ARC-01). مخطط الإنتاج = supabase/migrations وحدها.
// ملفّات drizzle/migrations الثلاثة طبّقها Lovable على البثّ في 2026-10-30/31،
// ونُقل أثرها إلى supabase/migrations/20261108200000_port_drizzle_policies.sql.
// scripts/check-types-drift.sh (يشغّله db-test.sh في CI) يسقط إن ظهر هنا ملفٌّ
// جديد: كلّ تغييرٍ في المخطط هجرةٌ في supabase/migrations ثم حزمة نشر.
// يبقى الملف لأن أدوات Lovable تقرؤه؛ لا تشغّل `drizzle-kit push/migrate` عليه.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    url: process.env.LOVABLE_DB_MIGRATION_URL ?? "",
  },
});
