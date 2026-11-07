#!/usr/bin/env bash
# يقسم ملف نشرٍ إلى قطعٍ صغيرة لمحرّر SQL الذي يرفض الملفّ الكبير.
#
#   scripts/release-chunks.sh supabase/release/bundle-after-20261001100000.sql [مجلد_الناتج]
#
# الطريقة نفسها التي طُبّق بها live-part2.sql على البثّ: القطع تُرفع إلى
# جدولٍ مؤقّت، ثم يُتحقّق md5 المجموع قبل تنفيذه بـ EXECUTE واحد ويُحذف الجدول.
# الناتج (افتراضياً <الملف>.chunks/):
#   00-start.sql        ينشئ مخطّط _release وجدول القطع (خارج public، فلا
#                       تصله صلاحيات Supabase الافتراضية ولا يراه anon).
#   01..NN.sql          قطعةٌ في كلّ ملف (≤ ٤٠ ك.ب)، يُعاد تشغيلها بأمان.
#   99-run.sql          يتحقّق العدد وmd5، ينفّذ الحزمة كلّها كجملةٍ واحدة
#                       (فهي ذرّية: كلّها أو لا شيء)، ثم يحذف المخطّط.
# شغّلها بالترتيب. إن سقط 99-run.sql بقيت القطع لتعيد المحاولة بعد الإصلاح.
set -euo pipefail
# الأطوال بالبايت لا بالحرف: الحدّ على حجم ما يُرسل، والعربية بايتان للحرف.
export LC_ALL=C

bundle="${1:?مرّر مسار ملف النشر}"
out="${2:-${bundle%.sql}.chunks}"
max=40000

mkdir -p "$out"
rm -f "$out"/*.sql

# BEGIN/COMMIT في الحزمة للمحرّر وpsql؛ داخل EXECUTE تكفي ذرّية الجملة
# الواحدة، والتحكّم بالمعاملة ممنوعٌ هناك. فيُحذف أوّل BEGIN وآخر COMMIT فقط.
body=$(mktemp)
trap 'rm -f "$body"' EXIT
awk '
  { lines[NR] = $0 }
  END {
    for (i = 1; i <= NR; i++) if (lines[i] == "BEGIN;") { b = i; break }
    for (i = NR; i >= 1; i--) if (lines[i] == "COMMIT;") { c = i; break }
    if (!b || !c) { print "no BEGIN;/COMMIT; pair" > "/dev/stderr"; exit 1 }
    for (i = 1; i <= NR; i++) if (i != b && i != c) print lines[i]
  }' "$bundle" >"$body"

sum=$(md5sum "$body" | cut -d' ' -f1)
tag="chunk_${sum:0:12}"
if grep -q "\$${tag}\$" "$body"; then
  echo "وسم الاقتباس ${tag} موجودٌ في الحزمة" >&2
  exit 1
fi

cat >"$out/00-start.sql" <<SQL
-- $(basename "$bundle") على قطع — الخطوة الأولى. md5: ${sum}
CREATE SCHEMA IF NOT EXISTS _release;
REVOKE ALL ON SCHEMA _release FROM PUBLIC;
CREATE TABLE IF NOT EXISTS _release.chunks (n INTEGER PRIMARY KEY, body TEXT NOT NULL);
SQL

# التقسيم على حدود الأسطر، والسطر يبقى بنهايته فيعود الملف كما هو حرفياً.
n=0
size=$max
while IFS= read -r line || [[ -n "$line" ]]; do
  if ((size + ${#line} + 1 > max)); then
    ((n > 0)) && printf '$%s$)\nON CONFLICT (n) DO UPDATE SET body = EXCLUDED.body;\n' "$tag" >>"$file"
    n=$((n + 1))
    file=$(printf '%s/%02d.sql' "$out" "$n")
    printf -- '-- القطعة %d — بعد 00-start.sql\nINSERT INTO _release.chunks (n, body) VALUES (%d, $%s$' "$n" "$n" "$tag" >"$file"
    size=0
  fi
  printf '%s\n' "$line" >>"$file"
  size=$((size + ${#line} + 1))
done <"$body"
printf '$%s$)\nON CONFLICT (n) DO UPDATE SET body = EXCLUDED.body;\n' "$tag" >>"$file"

cat >"$out/99-run.sql" <<SQL
-- $(basename "$bundle") على قطع — الخطوة الأخيرة: تحقّقٌ ثم تنفيذٌ ذرّيّ ثم تنظيف.
DO \$release\$
DECLARE _sql TEXT; _n INTEGER;
BEGIN
  SELECT string_agg(body, '' ORDER BY n), count(*) INTO _sql, _n FROM _release.chunks;
  IF _n IS DISTINCT FROM ${n} OR md5(_sql) IS DISTINCT FROM '${sum}' THEN
    RAISE EXCEPTION 'القطع ناقصة أو معدّلة: % من ${n}، md5 %', _n, md5(_sql);
  END IF;
  EXECUTE _sql;
END \$release\$;
DROP SCHEMA _release CASCADE;
SQL

echo "✓ ${out}: ${n} قطعة + 00-start.sql + 99-run.sql (md5 ${sum})"
