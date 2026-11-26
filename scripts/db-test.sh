#!/usr/bin/env bash
# تشغيل مجموعات فحص RLS على قاعدة نظيفة.
#
#   scripts/db-test.sh                 # يستخدم DATABASE_URL أو الافتراضي المحلي
#   DATABASE_URL=postgres://… scripts/db-test.sh
#
# يطبّق المحاكاة ثم كل الهجرات بترتيب المستودع، ثم ينفّذ سيناريوهات الاستغلال.
# يفشل عند أول خطأ، فصلاحيته كبوابة دمج مضمونة.
set -euo pipefail

DB="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/postgres}"
PSQL=(psql "$DB" -v ON_ERROR_STOP=1 --quiet --no-psqlrc)

echo "▸ محاكاة بيئة Supabase"
"${PSQL[@]}" -f supabase/tests/harness.sql

echo "▸ تطبيق الهجرات بترتيب المستودع"
for f in $(ls supabase/migrations/*.sql | sort); do
  printf '  %s\n' "$(basename "$f")"
  # DROP ... IF EXISTS تُصدر NOTICE على قاعدة نظيفة؛ ضجيج لا قيمة له هنا
  "${PSQL[@]}" --set=client_min_messages=warning -f "$f"
done

# الهجرات لا تُعيد الترتيب بنفسها، فاكتشاف اعتماد سابق على لاحق يحتاج قاعدة
# نظيفة — وهذا ما يفعله هذا السكربت في كل تشغيل.

fail=0
for suite in supabase/tests/phase0-verification.sql \
              supabase/tests/founder-admin-verification.sql \
              supabase/tests/payments-verification.sql \
              supabase/tests/phase2-verification.sql \
              supabase/tests/phase4-verification.sql \
              supabase/tests/phase7-verification.sql \
              supabase/tests/m5-verification.sql \
              supabase/tests/notification-prefs-verification.sql \
              supabase/tests/qualification-verification.sql \
              supabase/tests/email-outbox-verification.sql \
              supabase/tests/matching-verification.sql \
              supabase/tests/protection-verification.sql \
              supabase/tests/integration-verification.sql \
              supabase/tests/profile-verification.sql \
              supabase/tests/scopes-verification.sql \
              supabase/tests/mirror-verification.sql \
              supabase/tests/offices-verification.sql \
              supabase/tests/catalog-verification.sql \
              supabase/tests/ledger-verification.sql \
              supabase/tests/scoped-verification.sql \
              supabase/tests/feed-verification.sql \
              supabase/tests/inbox-verification.sql \
              supabase/tests/field-verification.sql \
              supabase/tests/donors-verification.sql \
              supabase/tests/admin-console-verification.sql \
              supabase/tests/mirror-sync-verification.sql \
              supabase/tests/golden-record-verification.sql \
              supabase/tests/golden-integrity-verification.sql \
              supabase/tests/country-staff-verification.sql \
              supabase/tests/golden-gate-verification.sql \
              supabase/tests/sso-verification.sql \
              supabase/tests/trust-center-verification.sql \
              supabase/tests/guardian-verification.sql \
              supabase/tests/geo-verification.sql \
              supabase/tests/geo-layers-verification.sql \
              supabase/tests/pledge-currency-verification.sql \
              supabase/tests/office-onboarding-verification.sql \
              supabase/tests/integrity-verification.sql \
              supabase/tests/receipts-verification.sql \
              supabase/tests/invoices-verification.sql \
              supabase/tests/sponsor-qualification-verification.sql \
              supabase/tests/ops-health-verification.sql \
              supabase/tests/journey-e2e-verification.sql \
              supabase/tests/ui-i18n-verification.sql \
              supabase/tests/audit-path-verification.sql \
              supabase/tests/profile-trust-verification.sql \
              supabase/tests/child-exposure-verification.sql \
              supabase/tests/reconcile-drizzle-verification.sql \
              supabase/tests/grants-verification.sql \
              supabase/tests/trust-accountability-verification.sql \
              supabase/tests/cohort-perf-verification.sql \
              supabase/tests/review-fixes-verification.sql \
              supabase/tests/care-org-onboarding-verification.sql \
              supabase/tests/intake-drafts-verification.sql \
              supabase/tests/admin-ops-verification.sql \
              supabase/tests/workspace-relations-verification.sql \
              supabase/tests/sponsorship-lifecycle-verification.sql \
              supabase/tests/child-exit-verification.sql \
              supabase/tests/currency-totals-verification.sql \
              supabase/tests/ops-hardening-verification.sql \
              supabase/tests/unified-currency-verification.sql \
              supabase/tests/admin-support-summary-verification.sql \
              supabase/tests/data-building-verification.sql \
              supabase/tests/operating-link-verification.sql; do
  echo "▸ $(basename "$suite")"
  # ROLLBACK في نهاية كل مجموعة، فلا تتسرّب حالة بينها.
  if out=$("${PSQL[@]}" -f "$suite" 2>&1); then
    printf '%s\n' "$out" | grep -E 'NOTICE: *(PASS|──)' | sed 's/^NOTICE: */  /' || true
    printf '  ✓ %s فحصاً\n' "$(printf '%s\n' "$out" | grep -c 'NOTICE: *PASS' || true)"
  else
    printf '%s\n' "$out" | grep -E 'FAIL|ERROR' | head -5 | sed 's/^/  ✗ /'
    fail=1
  fi
done

# ARC-01: types.ts مولَّدٌ من البثّ؛ ما يذكره ولا تُنشئه السلسلة انجراف.
echo "▸ انجراف المخطط (types.ts و drizzle/ مقابل السلسلة)"
DATABASE_URL="$DB" scripts/check-types-drift.sh || fail=1

exit "$fail"
