#!/usr/bin/env bash
# يبني ملف نشرٍ واحداً من الهجرات التي لم تُطبَّق بعد.
#
#   scripts/release-bundle.sh 20260904100000      # كل ما بعد هذا الرقم
#
# الرقم = آخر version أظهره supabase/release/00-check-applied.sql.
# الناتج supabase/release/bundle-<from>.sql: معاملةٌ واحدة، كلّها أو لا شيء،
# وكل هجرة تُسجَّل في schema_migrations كي لا تُعاد.
set -euo pipefail
since="${1:?مرّر آخر version مطبّق}"
out="supabase/release/bundle-after-${since}.sql"

{
  echo "-- ملف نشر كهاتين — كل الهجرات بعد ${since}"
  echo "-- يُولَّد آلياً؛ لا تعدّله يدوياً. أُنشئ: $(date -u +%Y-%m-%dT%H:%MZ)"
  echo "\\set ON_ERROR_STOP on"
  echo "BEGIN;"
  for f in $(ls supabase/migrations/*.sql | sort); do
    v=$(basename "$f" | cut -d_ -f1)
    [[ "$v" > "$since" ]] || continue
    name=$(basename "$f" .sql | cut -d_ -f2-)
    echo ""
    echo "-- >>> migration ${v} ${name}"
    # هجرةٌ مسجّلة سلفاً توقف النشر بدل أن تُطبَّق مرتين.
    echo "DO \$guard\$ BEGIN"
    echo "  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '${v}') THEN"
    echo "    RAISE EXCEPTION 'الهجرة ${v} مطبّقة سلفاً — أعد التوليد برقمٍ أحدث';"
    echo "  END IF;"
    echo "END \$guard\$;"
    cat "$f"
    echo ""
    echo "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('${v}', '${name}');"
  done
  echo ""
  echo "COMMIT;"
} > "$out"

echo "✓ ${out} ($(grep -c "^-- >>> migration" "$out") هجرة)"
