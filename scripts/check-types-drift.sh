#!/usr/bin/env bash
# انجراف المخطط (ARC-01): كلّ ما يذكره src/integrations/supabase/types.ts
# — وهو مولَّدٌ من قاعدة الإنتاج — يجب أن تُنشئه سلسلة supabase/migrations.
#
#   DATABASE_URL=postgres://…/قاعدة_بُنيت_من_الهجرات scripts/check-types-drift.sh
#
# إن ذكر الملف جدولاً أو عرضاً أو دالّةً أو تعداداً في public لا تُنشئه الهجرات،
# فالإنتاج يحمل ما لا يحمله المستودع: تغييرٌ طُبّق من طريقٍ آخر (محرّر SQL،
# أو drizzle/ قديماً) ولم يُنقل. القاعدة الواحدة: مخطط الإنتاج = supabase/migrations.
#
# الاتجاه الآخر (هجرةٌ لم يُعِد Lovable توليد الأنواع بعدها) ليس انجرافاً:
# الأنواع تتأخّر عن الهجرات بطبعها حتى يُطبَّق الإصدار.
set -euo pipefail

DB="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/postgres}"
TYPES="${TYPES_FILE:-src/integrations/supabase/types.ts}"
PSQL=(psql "$DB" -v ON_ERROR_STOP=1 --quiet --no-psqlrc -At)

# أقسام مخطط public وحده: من `  public: {` حتى إغلاقه بمسافتين.
section() {
  awk -v want="$1" '
    /^  public: \{/ { inpub = 1; next }
    inpub && /^  \}/ { inpub = 0 }
    inpub && $0 ~ "^    " want ": \\{" { insec = 1; next }
    insec && /^    \}/ { insec = 0 }
    insec && /^      [a-z_][a-z_0-9]*: / { sub(/^      /, ""); sub(/:.*/, ""); print }
  ' "$TYPES" | sort -u
}

check() {
  local kind="$1" query="$2" names missing
  names=$(section "$kind")
  [[ -z "$names" ]] && return 0
  local have
  have=$("${PSQL[@]}" -c "$query" | sort -u)
  missing=$(comm -23 <(printf '%s\n' "$names") <(printf '%s\n' "$have"))
  if [[ -n "$missing" ]]; then
    printf '  ✗ %s في types.ts لا تُنشئها الهجرات:\n' "$kind"
    printf '      %s\n' $missing
    return 1
  fi
  printf '  ✓ %s: %s\n' "$kind" "$(printf '%s\n' "$names" | wc -l)"
}

rc=0
check Tables "SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','p')" || rc=1
check Views "SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('v','m')" || rc=1
check Functions "SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace" || rc=1
check Enums "SELECT typname FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typtype = 'e'" || rc=1

# drizzle/ ليس طريق هجرة: 0000–0002 نُقلت إلى 20261108200000_port_drizzle_policies.sql،
# و0003–0004 إلى 20261116100000_reconcile_live_drizzle.sql، و0005 إلى 20261119100000_port_drizzle_0005.sql، و0006 إلى 20261121140000_port_drizzle_0006.sql. ملفٌّ جديدٌ فيه يعني أنّ أحداً طبّق
# تغييراً على الإنتاج من خارج السلسلة.
if [[ -d drizzle/migrations ]]; then
  extra=$(find drizzle/migrations -maxdepth 1 -name '*.sql' \
    ! -name '0000_restrict_platform_settings_read.sql' \
    ! -name '0001_restrict_public_media_read.sql' \
    ! -name '0002_restrict_lookup_reads.sql' \
    ! -name '0003_support_network_countries.sql' \
    ! -name '0004_gate_enrollment_supervisor_lookups.sql' \
    ! -name '0005_restore_supervisor_approval_check.sql' \
    ! -name '0006_orphan_traits_server_only.sql' | sort)
  if [[ -n "$extra" ]]; then
    printf '  ✗ drizzle/migrations يحمل SQL لم يُنقل إلى supabase/migrations:\n'
    printf '      %s\n' $extra
    rc=1
  else
    printf '  ✓ drizzle/migrations: لا جديد خارج السلسلة\n'
  fi
fi

exit "$rc"
