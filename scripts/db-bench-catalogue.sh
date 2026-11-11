#!/usr/bin/env bash
# قياس زمن دليل الأطفال العامّ على حجمٍ كبير، في قاعدةٍ مؤقّتة تُحذف بعده.
#
#   scripts/db-bench-catalogue.sh                       # 2000 ثم 5000 طفل
#   BENCH_SIZES="1000 2000 5000" scripts/db-bench-catalogue.sh
#   ADMIN_URL=postgres://postgres:postgres@localhost:5432/postgres \
#   BENCH_BUDGET_MS=1000 scripts/db-bench-catalogue.sh
#
# لماذا: حماية الحشد (لا تُعرض المنطقة ولا المرحلة لطفلٍ في حشدٍ دون خمسة)
# كانت تُحسب لكلّ طفلٍ بمسحٍ كامل للأطفال، فيصير الدليل O(n²) ويتجاوز مهلة
# الزائر في Supabase (نحو ٣ ثوانٍ) عند بضع مئاتٍ من الأطفال، فيظهر الدليل
# فارغاً بصمت. هذا السكربت يبذر أطفالاً مختلَقين (بادئة BENCH-) في قاعدةٍ
# جديدة باسمٍ عشوائي، ويقيس النداءات بصفة الزائر والمسجَّل، ويفشل إن تجاوز
# أيّ نداءٍ الميزانية (الوسيط من خمس محاولات).
#
# لا يلمس قاعدةً قائمة: ينشئ قاعدته بـ CREATE DATABASE (يفشل إن وُجد الاسم)
# ويحذفها عند الخروج.
set -euo pipefail

ADMIN_URL="${ADMIN_URL:-postgres://postgres:postgres@localhost:5432/postgres}"
DB_NAME="${BENCH_DB:-catalogue_bench_$$}"
SIZES="${BENCH_SIZES:-2000 5000}"
BUDGET_MS="${BENCH_BUDGET_MS:-1000}"
RUNS="${BENCH_RUNS:-5}"
DB_URL="${ADMIN_URL%/*}/${DB_NAME}"

case "$DB_NAME" in
  postgres | template0 | template1) echo "اسم قاعدةٍ محجوز: $DB_NAME" >&2; exit 2 ;;
esac

psql "$ADMIN_URL" -v ON_ERROR_STOP=1 --quiet --no-psqlrc -c "CREATE DATABASE \"${DB_NAME}\""
trap 'psql "$ADMIN_URL" --quiet --no-psqlrc -c "DROP DATABASE IF EXISTS \"${DB_NAME}\"" >/dev/null' EXIT

PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=1 --quiet --no-psqlrc)

echo "▸ قاعدةٌ مؤقّتة ${DB_NAME}: المحاكاة والهجرات"
"${PSQL[@]}" -f supabase/tests/harness.sql >/dev/null
for f in $(ls supabase/migrations/*.sql | sort); do
  PGOPTIONS="-c client_min_messages=warning" "${PSQL[@]}" -f "$f" >/dev/null
done

# جهةٌ وكافلٌ ثابتان، وبرنامج تأهيلٍ يمرّ به بعض الأطفال كي لا يكون عمود
# «قيد البناء» فارغاً في القياس.
"${PSQL[@]}" >/dev/null <<'SQL'
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('b1000000-0000-4000-8000-000000000001', 'bench-org@example.test', '{"role":"care_org"}'),
  ('b1000000-0000-4000-8000-000000000002', 'bench-sponsor@example.test', '{}');
INSERT INTO public.care_organizations (id, owner_id, name, status)
VALUES ('b2000000-0000-4000-8000-000000000001',
        'b1000000-0000-4000-8000-000000000001', 'جهة القياس', 'approved');
SQL

failed=0
have=0
for n in $SIZES; do
  # البذر تراكميّ: من الحجم السابق إلى هذا الحجم، ببذرةٍ ثابتة لكلّ حجم.
  "${PSQL[@]}" >/dev/null <<SQL
SELECT setseed(0.42);
INSERT INTO public.orphans
  (code, display_name, gender, birth_date, country, region, education_stage,
   org_id, monthly_need, funded_monthly, status, approved_at, created_at)
SELECT 'BENCH-' || g,
       'طفل ' || g,
       CASE WHEN random() < 0.5 THEN 'male' ELSE 'female' END,
       CASE WHEN random() < 0.03 THEN NULL
            ELSE CURRENT_DATE - (floor(random() * 7300))::int END,
       c.country,
       /* مناطق كثيرة متفاوتة الحجم: بعضها يبلغ الحدّ وبعضها لا. */
       CASE WHEN random() < 0.05 THEN NULL
            ELSE c.country || '-R' || floor(power(random(), 2) * 40)::int END,
       (ARRAY['روضة', 'ابتدائي', 'متوسط', 'ثانوي'])[1 + floor(random() * 4)::int],
       'b2000000-0000-4000-8000-000000000001',
       100 + floor(random() * 200),
       0,
       s.status,
       now() - (floor(random() * 400) || ' days')::interval,
       now() - (floor(random() * 500) || ' days')::interval
  FROM generate_series(${have} + 1, ${n}) g
 CROSS JOIN LATERAL (
   SELECT (ARRAY['ألبانيا', 'اليمن', 'السودان', 'سوريا', 'غزة', 'الصومال'])
            [1 + floor(random() * 6 + g * 0)::int] AS country) c
 CROSS JOIN LATERAL (
   SELECT (CASE WHEN r < 0.80 THEN 'approved'
                WHEN r < 0.90 THEN 'fully_sponsored'
                WHEN r < 0.95 THEN 'under_review'
                ELSE 'draft' END)::public.orphan_status AS status
     FROM (SELECT random() + g * 0 AS r) z) s;
UPDATE public.orphans SET funded_monthly = monthly_need
 WHERE code LIKE 'BENCH-%' AND status = 'fully_sponsored';
ANALYZE public.orphans;
SQL
  have=$n

  out=$("${PSQL[@]}" 2>&1 <<SQL
SET statement_timeout = '120s';
CREATE TEMP TABLE _bench (label TEXT, ms NUMERIC);
GRANT ALL ON _bench TO anon, authenticated;
-- يُقاس النداء بصفة من يناديه فعلاً: الزائر للدليل، والمسجَّل للاقتراح.
CREATE FUNCTION pg_temp.time_it(_label TEXT, _sql TEXT, _runs INT)
RETURNS VOID LANGUAGE plpgsql AS \$fn\$
DECLARE _t TIMESTAMPTZ; _ms NUMERIC[] := '{}';
BEGIN
  FOR i IN 1.._runs LOOP
    _t := clock_timestamp();
    EXECUTE _sql;
    _ms := _ms || (extract(epoch FROM clock_timestamp() - _t) * 1000)::NUMERIC;
  END LOOP;
  INSERT INTO _bench
  SELECT _label, percentile_cont(0.5) WITHIN GROUP (ORDER BY m)
    FROM unnest(_ms) m;
END \$fn\$;
GRANT EXECUTE ON FUNCTION pg_temp.time_it(TEXT, TEXT, INT) TO anon, authenticated;

\o /dev/null
SET ROLE anon;
SELECT pg_temp.time_it('list_orphan_cards()', 'SELECT public.list_orphan_cards()', ${RUNS});
SELECT pg_temp.time_it('list_orphan_cards(region)',
  \$q\$SELECT public.list_orphan_cards(_country => 'اليمن', _region => 'اليمن-R1')\$q\$, ${RUNS});
SELECT pg_temp.time_it('list_orphan_cards(closest, p3)',
  \$q\$SELECT public.list_orphan_cards(_sort => 'closest', _offset => 48)\$q\$, ${RUNS});
SELECT pg_temp.time_it('orphan_filter_options()', 'SELECT public.orphan_filter_options()', ${RUNS});
SELECT pg_temp.time_it('orphan_view()',
  \$q\$SELECT public.orphan_view((SELECT id FROM public.orphans WHERE code = 'BENCH-7'))\$q\$, ${RUNS});
SELECT pg_temp.time_it('suggest_orphans_for_amount()',
  'SELECT * FROM public.suggest_orphans_for_amount(150)', ${RUNS});
RESET ROLE;

SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}';
SELECT pg_temp.time_it('suggest_orphans_for_sponsor()',
  'SELECT * FROM public.suggest_orphans_for_sponsor(200)', ${RUNS});
RESET ROLE;
\o

\pset format unaligned
\pset tuples_only on
\pset fieldsep '|'
SELECT (SELECT count(*) FROM public.orphans WHERE status IN ('approved', 'fully_sponsored'));
SELECT label, round(ms, 1) FROM _bench ORDER BY label;
SQL
  ) || { printf '%s\n' "$out" | sed 's/^/  ✗ /'; failed=1; continue; }

  public=$(printf '%s\n' "$out" | sed -n 1p)
  echo "▸ ${n} طفلاً (${public} منشوراً) — الوسيط من ${RUNS} محاولات، الميزانية ${BUDGET_MS}ms"
  while IFS='|' read -r label ms; do
    [ -n "$label" ] || continue
    if awk -v m="$ms" -v b="$BUDGET_MS" 'BEGIN { exit !(m > b) }'; then
      printf '  ✗ %-32s %8s ms\n' "$label" "$ms"
      failed=1
    else
      printf '  ✓ %-32s %8s ms\n' "$label" "$ms"
    fi
  done < <(printf '%s\n' "$out" | sed -n '2,$p')
done

exit "$failed"
