#!/usr/bin/env bash
# بروفة النشر على البثّ — قبل أن يلمس ملفُّ نشرٍ القاعدة الحيّة.
#
#   DATABASE_URL=postgres://…/قاعدة_فارغة scripts/release-rehearsal.sh supabase/release/bundle-after-20261001100000.sql
#   # حزمةٌ تبني على حزمةٍ لم تُطبَّق على البثّ بعد: مرّرهما بترتيب النشر،
#   # فتُطبَّق كلّها بالترتيب، وإعادة التشغيل تُجرَّب على الأخيرة.
#   DATABASE_URL=… scripts/release-rehearsal.sh supabase/release/bundle-after-20261001100000.sql \
#                                               supabase/release/bundle-after-20261106140000.sql
#
# `db-test.sh` يبني القاعدة من الهجرات بترتيب المستودع؛ والبثّ لم يُبنَ هكذا.
# فهذا السكربت يعيد الطريق الذي سلكه البثّ فعلاً (supabase/release/README.md):
#   ١. محاكاة Supabase بصلاحياتها الافتراضية (harness.sql) وجدول
#      supabase_migrations.schema_migrations كما على البثّ؛
#   ٢. ما طبّقه Lovable حتى 20260829083545 — كلّ هجرةٍ حتى ذلك الرقم عدا
#      ما حملته bundle-live-20261031.sql — مسجّلةً بأرقامها؛
#   ٣. ملفّات live-part1..8 بالترتيب الذي طُبّقت به، كلٌّ في معاملته؛
#   ٤. بياناتٌ بشكل البثّ يوم 2026-10-31: حسابان، ثلاثة أدوار منها مشرف،
#      وكفالتان بانتظار الدفع على طفلين من البذرة؛
#   ٥. فحص الدخان قبل الحزمة (للعلم)، ثم الحزمة، ثم فحص الدخان: كلّ سطرٍ true،
#      ولا يُحذف حسابٌ ولا دورٌ ولا كفالةٌ ولا طفل. والمتوقَّع من CP-07 وحده:
#      أطفال البذرة يُؤرشفون (أو يُسجَّلون للإدارة إن كانوا مقفلين) وتُلغى
#      الكفالة «بانتظار الدفع» عليهم؛
#   ٦. إعادة تشغيل الحزمة: يجب أن تُرفض ولا يتغيّر شيء.
# APPLY يختار طريق التطبيق:
#   file    (الافتراضي) psql -f، جملةً جملة؛
#   editor  النصّ كلّه طلبٌ واحد، كما يُرسله محرّر SQL في Lovable Cloud؛
#   chunks  قطعٌ صغيرة (scripts/release-chunks.sh) لمحرّرٍ يرفض الملف الكبير.
# يفشل عند أول خطأ. لا يُشغَّل على قاعدةٍ فيها بيانات.
set -euo pipefail

: "${1:?مرّر مسار ملف النشر}"
bundles=("$@")
bundle="${bundles[-1]}"
DB="${DATABASE_URL:?عيّن DATABASE_URL لقاعدةٍ فارغة}"
# DROP ... IF EXISTS تُصدر NOTICE على كلّ كائنٍ جديد؛ ضجيجٌ لا قيمة له هنا.
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
PSQL=(psql "$DB" -v ON_ERROR_STOP=1 --quiet --no-psqlrc)
R=supabase/release

echo "▸ محاكاة Supabase وجدول الهجرات"
"${PSQL[@]}" -f supabase/tests/harness.sql
"${PSQL[@]}" -c "CREATE SCHEMA IF NOT EXISTS supabase_migrations;
  CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
    version TEXT PRIMARY KEY, statements TEXT[], name TEXT);"

echo "▸ قاعدة البثّ قبل 2026-10-31 (ما طبّقه Lovable حتى 20260829083545)"
live_list=$(grep '^-- >>> migration ' "$R/bundle-live-20261031.sql" | awk '{print $4}')
base=0
for f in $(ls supabase/migrations/*.sql | sort); do
  v=$(basename "$f" | cut -d_ -f1)
  [[ "$v" > "20260829083545" ]] && continue
  grep -qx "$v" <<<"$live_list" && continue
  "${PSQL[@]}" -1 -f "$f"
  "${PSQL[@]}" -c "INSERT INTO supabase_migrations.schema_migrations (version, name)
    VALUES ('$v', '$(basename "$f" .sql | cut -d_ -f2-)');"
  base=$((base + 1))
done
echo "  $base هجرة"

echo "▸ أجزاء البثّ 2026-10-31 كما طُبّقت"
for part in live-part1.sql live-part2.sql live-part3-repair.sql live-part4-grants.sql \
            live-part5-profile-trust.sql live-part6-geo-layers.sql \
            live-part7-pledge-currency.sql live-part8-office-onboarding.sql; do
  printf '  %s\n' "$part"
  if grep -q '^BEGIN;' "$R/$part"; then
    "${PSQL[@]}" -f "$R/$part"
  else
    # الأجزاء ٥ و٧ و٨ نُسخٌ بلا BEGIN طُبّقت على البثّ في معاملةٍ واحدة.
    "${PSQL[@]}" -1 -f "$R/$part"
  fi
done
# ARC-01: Lovable طبّق ملفّات drizzle/migrations الثلاثة على البثّ في 2026-10-30/31
# من خارج السلسلة (لا تُسجَّل في schema_migrations). تُطبَّق هنا كما طُبّقت، فتُجرَّب
# 20261108200000_port_drizzle_policies على حال البثّ الحقيقية لا على قاعدةٍ تنقصها.
for f in $(ls drizzle/migrations/*.sql 2>/dev/null | sort); do
  printf '  %s (drizzle)\n' "$(basename "$f")"
  "${PSQL[@]}" -1 -f "$f"
done
# الجزءان ٧ و٨ سُجّلا على البثّ (٥٩ هجرة) ولا يحمل ملفّاهما سطر التسجيل.
"${PSQL[@]}" -c "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES
    ('20260930100000', 'pledge_currency'), ('20261001100000', 'office_onboarding')
  ON CONFLICT (version) DO NOTHING;"

latest=$("${PSQL[@]}" -Atc "SELECT max(version) FROM supabase_migrations.schema_migrations")
count=$("${PSQL[@]}" -Atc "SELECT count(*) FROM supabase_migrations.schema_migrations")
echo "  أحدث رقم: $latest (كما يُظهره 00-check-applied.sql على البثّ)"

echo "▸ بياناتٌ بشكل البثّ"
"${PSQL[@]}" <<'SQL'
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'founder@example.org', now()),
  ('00000000-0000-4000-8000-0000000000b2', 'sponsor@example.org', now());
INSERT INTO public.user_roles (user_id, role)
  VALUES ('00000000-0000-4000-8000-0000000000a1', 'admin') ON CONFLICT DO NOTHING;
INSERT INTO public.sponsorships (sponsor_id, orphan_id, amount, currency)
  SELECT '00000000-0000-4000-8000-0000000000b2', id, 50, 'EUR'
    FROM public.orphans WHERE code IN ('ORP-1001', 'ORP-1002');
SQL
state() {
  "${PSQL[@]}" -Atc "SELECT (SELECT count(*) FROM auth.users) || ' حساب، '
    || (SELECT count(*) FROM public.user_roles) || ' دور، '
    || (SELECT count(*) FROM public.user_roles WHERE role = 'admin') || ' مشرف، '
    || (SELECT count(*) FROM public.sponsorships) || ' كفالة، '
    || (SELECT count(*) FROM public.orphans) || ' أيتام'"
}
before_state=$(state)
echo "  $before_state"

apply_bundle() {
  case "${APPLY:-file}" in
    file) "${PSQL[@]}" -f "$bundle" ;;
    # طلبٌ واحد بالبروتوكول البسيط (أكبر من أن يُمرَّر لـ psql -c).
    editor)
      DB="$DB" BUNDLE="$bundle" bun -e '
        import postgres from "postgres";
        const sql = postgres(process.env.DB, { max: 1, onnotice: () => {} });
        try { await sql.unsafe(await Bun.file(process.env.BUNDLE).text()).simple(); }
        catch (e) { console.error(e.message); process.exitCode = 1; }
        finally { await sql.end(); }'
      ;;
    chunks)
      local dir f
      dir=$(mktemp -d)
      scripts/release-chunks.sh "$bundle" "$dir" >/dev/null
      for f in "$dir"/*.sql; do "${PSQL[@]}" -f "$f" || { rm -rf "$dir"; return 1; }; done
      rm -rf "$dir"
      ;;
    *) echo "APPLY غير معروف: ${APPLY}" >&2; return 2 ;;
  esac
}

smoke() {
  "${PSQL[@]}" -At -F'|' -f "$R/03-smoke-test.sql"
}

echo "▸ فحص الدخان قبل الحزمة (للعلم: false هنا ما تُصلحه الحزمة)"
smoke | awk -F'|' '$2 == "f" { print "  ✗ " $1 }'

last="$bundle"
for bundle in "${bundles[@]}"; do
  echo "▸ تطبيق $(basename "$bundle")(${APPLY:-file})"
  apply_bundle
done
bundle="$last"
after=$("${PSQL[@]}" -Atc "SELECT count(*) FROM supabase_migrations.schema_migrations")
echo "  سُجّلت $((after - count)) هجرة؛ أحدث رقم: $("${PSQL[@]}" -Atc "SELECT max(version) FROM supabase_migrations.schema_migrations")"

echo "▸ فحص الدخان بعد الحزمة"
out=$(smoke)
total=$(grep -c '|' <<<"$out")
bad=$(awk -F'|' '$2 != "t"' <<<"$out")
if [[ -n "$bad" ]]; then
  printf '  ✗ %s\n' "$bad"
  exit 1
fi
echo "  ✓ $total/$total"
after_state=$(state)
if [[ "$after_state" != "$before_state" ]]; then
  echo "  ✗ تغيّرت البيانات: $after_state"
  exit 1
fi
echo "  ✓ لا حذف: $after_state"
cp07=$("${PSQL[@]}" -Atc "SELECT
    (SELECT count(*) FROM public.audit_log
      WHERE action IN ('demo_seed.archived', 'demo_seed.archive_blocked')) = 5
    AND NOT EXISTS (SELECT 1 FROM public.sponsorships s JOIN public.orphans o ON o.id = s.orphan_id
                     WHERE o.status = 'archived' AND s.status = 'pending_payment')")
[[ "$cp07" == t ]] || { echo "  ✗ أطفال البذرة لم يُعالَجوا كما يجب"; exit 1; }
echo "  ✓ CP-07: $("${PSQL[@]}" -Atc "SELECT count(*) FROM public.orphans WHERE status = 'archived'") من أطفال البذرة مؤرشفون، و$("${PSQL[@]}" -Atc "SELECT count(*) FROM public.sponsorships WHERE status = 'cancelled'") كفالة بانتظار الدفع عليهم أُلغيت"

echo "▸ إعادة التشغيل تُرفض"
if again_out=$(apply_bundle 2>&1); then
  echo "  ✗ طُبّقت الحزمة مرّتين"
  exit 1
fi
grep -q 'مطبّقة سلفاً' <<<"$again_out" || { printf '  ✗ رُفضت لسببٍ آخر:\n%s\n' "$again_out"; exit 1; }
again=$("${PSQL[@]}" -Atc "SELECT count(*) FROM supabase_migrations.schema_migrations")
[[ "$again" == "$after" ]] || { echo "  ✗ تغيّر سجلّ الهجرات بعد الرفض"; exit 1; }
[[ "$("${PSQL[@]}" -Atc "SELECT to_regnamespace('_release') IS NULL")" == t ]] \
  || "${PSQL[@]}" -c "DROP SCHEMA _release CASCADE"
echo "  ✓ رُفضت «مطبّقة سلفاً» ولم يتغيّر شيء"

echo "▸ 00-check-applied.sql يقرأ علامات الإصدار"
missing=$("${PSQL[@]}" -At -F'|' -f "$R/00-check-applied.sql" | tail -n 1 | tr '|' '\n' | grep -c '^$' || true)
[[ "$missing" == 0 ]] || { echo "  ✗ $missing علامة فارغة"; exit 1; }
echo "  ✓ كلّ العلامات حاضرة"
