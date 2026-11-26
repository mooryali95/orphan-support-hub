/**
 * «مصادر التحقق» و«مركز الثقة» في العرض التفاعلي: نسخٌ تجريبية لعمليات
 * `golden-record.functions` و`trust-center.functions` تُسجَّل في منفذ البيانات، فتعمل
 * الشاشات الحقيقية نفسها على بذرةٍ نموذجية في الجلسة (`try-verification.data.ts`).
 *
 * القواعد على روح القاعدة: الحرج لا يُحسم جماعياً، ومن رفع التغيير لا يحسمه (العينان)،
 * والمطّلع ومدخل البيانات لا يحسمان، وملفٌّ يُنشأ من سجلّ الندوة وحده. لا خادم، ولا
 * طفلٌ حقيقي، ولا دفع: كل شيءٍ في `sessionStorage` ويُمحى بـ«ابدأ من جديد».
 */
import { registerDemo } from "@/lib/data-port";
import {
  ADMIN_ACCESS,
  bulkEligible,
  canDo,
  effectiveOwner,
  FIELD_RULES,
  grantableRoles,
  ruleOf,
  searchKey,
  type BulkResult,
  type ChildFile,
  type ChildFileField,
  type CountryAccess,
  type CountryHealth,
  type CountryNeed,
  type CountryRole,
  type FieldValue,
  type IngestResult,
  type TrustState,
} from "@/lib/golden-record";
import type { AgingBucket, AgingItem, Decision, DecisionAction } from "@/lib/trust-center";
import { tryStore } from "@/lib/try-store";
import {
  demoId,
  seedVerification,
  type DemoFile,
  type VerificationState,
} from "@/lib/try-verification.data";

export const VERIFICATION_KEY = "try-verification:v1";
export const VERIFICATION_EVENT = "try-verification-change";
/** بريد الزائر في السجلّ: عامٌّ ولا يصل أحداً. */
export const VISITOR_EMAIL = "you@example.org";

let cache: VerificationState | null = null;

function load(): VerificationState {
  if (cache) return cache;
  try {
    const raw = tryStore()?.getItem(VERIFICATION_KEY);
    const parsed = raw ? (JSON.parse(raw) as VerificationState) : null;
    if (parsed && parsed.v === 1) return (cache = parsed);
  } catch {
    /* تالف أو محجوب: بذرةٌ جديدة */
  }
  return (cache = seedVerification());
}

function save(s: VerificationState) {
  cache = s;
  try {
    tryStore()?.setItem(VERIFICATION_KEY, JSON.stringify(s));
  } catch {
    /* محجوب: تبقى في ذاكرة الصفحة */
  }
}

if (typeof window !== "undefined") {
  // «ابدأ من جديد» يمحو المفتاح؛ فتُنسى الذاكرة أيضاً.
  for (const e of ["try-demo-change", "try-role-change"])
    window.addEventListener(e, () => {
      try {
        if (!tryStore()?.getItem(VERIFICATION_KEY)) cache = null;
      } catch {
        cache = null;
      }
    });
}

/* ── من يعمل الآن: الإدارة، أو عضو فريق دولة بدوره ─────────────── */

let actor: CountryAccess = ADMIN_ACCESS;

/** تضبطه شاشة التجربة قبل أن تعرض اللوحة: الإدارة، أو دورٌ في دولة. */
export function setVerificationActor(next: { country: string; role: CountryRole } | null) {
  if (!next) {
    actor = ADMIN_ACCESS;
    return actor;
  }
  const c = load().countries.find((x) => x.code === next.country);
  actor = {
    admin: false,
    countries: [{ code: next.country, name_ar: c?.name_ar ?? next.country, role: next.role }],
  };
  return actor;
}

export const verificationCountries = () =>
  load().countries.map((c) => ({ code: c.code, name_ar: c.name_ar }));

const allowed = (country: string, need: CountryNeed) => canDo(actor, country, need);
const visible = (country: string | null | undefined) => (code: string) =>
  (country ? code === country : true) && allowed(code, "read");

type Ok<T> = { ok: true; data: T };
type Fail = { ok: false; missing: false; error: string };
const ok = <T>(data: T): Ok<T> => ({ ok: true, data });
const fail = (error: string): Fail => ({ ok: false, missing: false, error });
const pause = () => new Promise((r) => setTimeout(r, 180));

/* ── حسابٌ على الحالة ─────────────────────────────────────────── */

function trustOf(s: VerificationState, f: DemoFile): TrustState {
  if (s.alerts.some((a) => a.orphan_id === f.id && !a.closed_at && a.severity === "critical"))
    return "flagged";
  if (s.conflicts.some((x) => x.orphan_id === f.id && !x.closed_at)) return "conflict";
  return f.base;
}

function health(s: VerificationState): CountryHealth[] {
  return s.countries.map((c) => {
    const trust = { ...c.background };
    for (const f of s.files.filter((x) => x.country === c.code)) trust[trustOf(s, f)]++;
    const open = s.conflicts.filter((x) => x.country === c.code && !x.closed_at);
    const alerts = s.alerts.filter((x) => x.country === c.code && !x.closed_at);
    return {
      code: c.code,
      name_ar: c.name_ar,
      status: "active",
      office_source: c.office_source,
      office_mode: c.office_mode,
      stale_after_days: c.stale_after_days,
      platforms: c.platforms,
      trust,
      conflicts: {
        critical: open.filter((x) => x.risk === "critical").length,
        other: open.filter((x) => x.risk !== "critical").length,
      },
      alerts: {
        critical: alerts.filter((a) => a.severity === "critical").length,
        warning: alerts.filter((a) => a.severity === "warning").length,
        info: alerts.filter((a) => a.severity === "info").length,
      },
      link_pending: s.links.filter((l) => l.country === c.code && !l.closed_at).length,
      last_wamy: c.last_wamy,
      last_office: c.last_office,
    };
  });
}

function nextId(s: VerificationState, kind: number) {
  s.seq++;
  return demoId(kind, s.seq);
}

function log(
  s: VerificationState,
  action: DecisionAction,
  country: string,
  detail: Decision["detail"],
  file: string | null = null,
) {
  s.decisions.unshift({
    id: nextId(s, 6),
    action,
    created_at: new Date().toISOString(),
    actor_email: VISITOR_EMAIL,
    country,
    file_code: file,
    detail,
  });
}

function week(s: VerificationState, country: string) {
  const rows = s.weeks[country];
  return rows?.[rows.length - 1] ?? null;
}

function settled(s: VerificationState, country: string) {
  const w = week(s, country);
  if (!w) return;
  w.settled++;
  w.open_at_end = Math.max(0, w.open_at_end - 1);
}

function opened(s: VerificationState, country: string, critical: boolean) {
  const w = week(s, country);
  if (!w) return;
  w.opened++;
  if (critical) w.opened_critical++;
  w.open_at_end++;
}

function setValue(
  f: DemoFile,
  field: string,
  value: FieldValue,
  role: "wamy" | "office" | "manual",
) {
  const was = f.values[field] ?? null;
  f.values[field] = value;
  if (field === "display_name" && typeof value === "string") f.name = value;
  f.history.unshift({
    field,
    role: role === "manual" ? "wamy" : role,
    source: role === "office" ? "office" : "wamy",
    value,
    was,
    changed: was !== value,
    observed_at: new Date().toISOString(),
    received_at: new Date().toISOString(),
  });
}

/* ── التنفيذ: حسمٌ واحد تمرّ به الدفعة أيضاً ─────────────────────── */

type Choice = "accept" | "keep" | "use_wamy" | "use_office" | "manual";

function settleConflict(
  s: VerificationState,
  id: string,
  choice: Choice,
  value?: string,
): string | null {
  const x = s.conflicts.find((c) => c.id === id);
  if (!x) return "conflict_closed";
  if (!allowed(x.country, "approve")) return "country_forbidden";
  if (x.closed_at) return "conflict_closed";
  if (x.mine && (x.risk === "critical" || x.kind !== "disagreement")) return "four_eyes_required";
  const f = s.files.find((o) => o.id === x.orphan_id);
  if (x.kind === "held_locked" && choice === "accept" && f?.sponsored) return "orphan_locked";
  if (choice === "manual" && !value) return "value_invalid";
  if (f) {
    const v =
      choice === "accept"
        ? x.proposed
        : choice === "use_wamy"
          ? x.wamy
          : choice === "use_office"
            ? x.office
            : choice === "manual"
              ? (value ?? null)
              : x.current;
    if (v !== null && v !== f.values[x.field])
      setValue(
        f,
        x.field,
        v,
        choice === "use_office" ? "office" : choice === "manual" ? "manual" : "wamy",
      );
    if (x.office !== null) f.office[x.field] = f.values[x.field] ?? null;
  }
  x.closed_at = new Date().toISOString();
  log(s, "golden_conflict_resolve", x.country, { field: x.field, choice }, x.code);
  settled(s, x.country);
  return null;
}

function createFrom(s: VerificationState, linkId: string): DemoFile | null {
  const l = s.links.find((x) => x.id === linkId);
  if (!l) return null;
  const n = s.files.filter((f) => f.country === l.country).length + 1;
  const name = l.name ?? "(نموذج)";
  const values: Record<string, FieldValue> = {
    display_name: name,
    birth_date: l.birth_date,
    gender: l.gender,
    country: l.country,
    program_status: "active",
    sponsorship_eligible: true,
  };
  const file: DemoFile = {
    id: nextId(s, 1),
    code: `DEMO-${l.country}-${100 + n}`,
    name,
    country: l.country,
    region: "",
    sponsored: false,
    wamy_ref: l.external_ref,
    office_ref: null,
    base: "single_source",
    values,
    office: {},
    history: Object.entries(values).map(([field, value]) => ({
      field,
      role: "wamy" as const,
      source: "wamy",
      value,
      was: null,
      changed: true,
      observed_at: l.created_at,
      received_at: new Date().toISOString(),
    })),
  };
  s.files.push(file);
  l.closed_at = new Date().toISOString();
  return file;
}

/* ── العمليات المسجّلة: الأسماء نفسها في الشاشات الحقيقية ───────── */

registerDemo("golden.health", async () => {
  await pause();
  return ok(health(load()).filter((r) => allowed(r.code, "read")));
});

registerDemo(
  "golden.setSource",
  async ({
    data,
  }: {
    data: {
      country: string;
      source: string | null;
      mode: "none" | "shadow" | "active";
      staleDays?: number;
    };
  }) => {
    await pause();
    if (!actor.admin) return fail("admin_only");
    const s = load();
    const c = s.countries.find((x) => x.code === data.country);
    if (!c) return fail("country_unknown");
    if (data.mode !== "none" && !c.platforms.some((p) => p.key === data.source))
      return fail("source_unknown");
    const from = c.office_mode;
    c.office_mode = data.mode;
    c.office_source = data.mode === "none" ? null : data.source;
    if (data.staleDays) c.stale_after_days = data.staleDays;
    const files = s.files.filter((f) => f.country === c.code);
    for (const f of files) {
      if (data.mode === "none") f.base = "single_source";
      else if (f.office_ref) f.base = "verified";
    }
    if (from !== data.mode) log(s, "country_source_mode", c.code, { from, to: data.mode });
    save(s);
    return ok({ ok: true as const, from, to: data.mode, reevaluated: files.length + 40 });
  },
);

registerDemo(
  "golden.import",
  async ({
    data,
  }: {
    data: {
      role: "wamy" | "office";
      country: string;
      source: string | null;
      records: Array<{
        external_ref: string;
        observed_at?: string;
        fields: Record<string, string | boolean>;
      }>;
    };
  }) => {
    await pause();
    if (!allowed(data.country, "import")) return fail("country_forbidden");
    const s = load();
    const c = s.countries.find((x) => x.code === data.country);
    if (!c) return fail("country_unknown");
    if (data.role === "office" && c.office_mode === "none") return fail("office_source_inactive");
    if (!data.records.length || data.records.length > 2000) return fail("rows_invalid");
    const out: IngestResult = {
      ok: true,
      observed: 0,
      unlinked: 0,
      skipped_count: 0,
      skipped: [],
      open_conflicts: 0,
    };
    const now = new Date().toISOString();
    data.records.forEach((r, index) => {
      const key = searchKey(r.external_ref);
      const f = s.files.find(
        (o) =>
          o.country === c.code &&
          searchKey(data.role === "wamy" ? o.wamy_ref : (o.office_ref ?? "")) === key,
      );
      if (!f) {
        const pending = s.links.find(
          (l) => !l.closed_at && l.country === c.code && searchKey(l.external_ref) === key,
        );
        if (!pending) {
          const name =
            typeof r.fields["display_name"] === "string" ? r.fields["display_name"] : null;
          s.links.unshift({
            id: nextId(s, 4),
            role: data.role,
            source: data.role === "wamy" ? "wamy" : (c.office_source ?? "office"),
            external_ref: r.external_ref,
            country: c.code,
            name: name ? (name.includes("نموذج") ? name : `${name} (نموذج)`) : null,
            birth_date: typeof r.fields["birth_date"] === "string" ? r.fields["birth_date"] : null,
            gender: typeof r.fields["gender"] === "string" ? r.fields["gender"] : null,
            created_at: now,
            candidates: s.files
              .filter(
                (o) =>
                  o.country === c.code &&
                  name &&
                  searchKey(o.name).includes(searchKey(name).split(" ")[0] ?? ""),
              )
              .slice(0, 3)
              .map((o) => ({
                id: o.id,
                code: o.code,
                name: o.name,
                birth_date:
                  typeof o.values["birth_date"] === "string" ? o.values["birth_date"] : null,
                region: o.region || null,
              })),
          });
        }
        out.unlinked++;
        return;
      }
      out.observed++;
      for (const [field, raw] of Object.entries(r.fields)) {
        const rule = ruleOf(field);
        if (!rule || rule.owner === "platform") {
          out.skipped.push({ index, ref: r.external_ref, field, reason: "field_unknown" });
          continue;
        }
        const value: FieldValue = raw;
        if (data.role === "office") f.office[field] = value;
        const current = f.values[field] ?? null;
        const same =
          typeof value === "string" && typeof current === "string"
            ? searchKey(value) === searchKey(current)
            : value === current;
        if (same) continue;
        const owner = effectiveOwner(rule.owner, c.office_mode);
        const already = s.conflicts.some(
          (x) => !x.closed_at && x.orphan_id === f.id && x.field === field,
        );
        if (already) continue;
        if (rule.risk === "critical" || (f.sponsored && rule.group === "identity")) {
          s.conflicts.unshift({
            id: nextId(s, 2),
            orphan_id: f.id,
            code: f.code,
            name: f.name,
            country: c.code,
            field,
            field_group: rule.group,
            kind: f.sponsored ? "held_locked" : "critical_change",
            risk: "critical",
            current,
            proposed: value,
            wamy: data.role === "wamy" ? value : (f.values[field] ?? null),
            office: data.role === "office" ? value : null,
            created_at: now,
            mine: true,
          });
          opened(s, c.code, true);
          if (f.sponsored)
            s.alerts.unshift({
              id: nextId(s, 3),
              orphan_id: f.id,
              code: f.code,
              name: f.name,
              country: c.code,
              field,
              signal: "change_after_sponsorship",
              severity: "critical",
              role: data.role,
              source: data.role === "wamy" ? "wamy" : c.office_source,
              detail: { from: String(current ?? ""), to: String(value) },
              hits: 1,
              created_at: now,
              updated_at: now,
              mine: true,
            });
        } else if (owner === data.role) {
          setValue(f, field, value, data.role);
          if (field === "display_name" && typeof current === "string" && typeof value === "string")
            s.alerts.unshift({
              id: nextId(s, 3),
              orphan_id: f.id,
              code: f.code,
              name: f.name,
              country: c.code,
              field,
              signal: "subtle_edit",
              severity: "warning",
              role: data.role,
              source: data.role === "wamy" ? "wamy" : c.office_source,
              detail: {
                from: current,
                to: value,
                distance: Math.abs(current.length - value.length) || 1,
              },
              hits: 1,
              created_at: now,
              updated_at: now,
              mine: true,
            });
        } else {
          s.conflicts.unshift({
            id: nextId(s, 2),
            orphan_id: f.id,
            code: f.code,
            name: f.name,
            country: c.code,
            field,
            field_group: rule.group,
            kind: "disagreement",
            risk: rule.risk,
            current,
            proposed: value,
            wamy: data.role === "wamy" ? value : current,
            office: data.role === "office" ? value : current,
            created_at: now,
            mine: true,
          });
          opened(s, c.code, false);
        }
      }
    });
    out.skipped_count = out.skipped.length;
    out.open_conflicts = s.conflicts.filter((x) => x.country === c.code && !x.closed_at).length;
    if (data.role === "wamy") c.last_wamy = now;
    else c.last_office = now;
    const w = week(s, c.code);
    if (w) w.files_observed += out.observed;
    log(s, "golden_ingest", c.code, { records: data.records.length });
    save(s);
    return ok(out);
  },
);

registerDemo("golden.conflicts", async ({ data }: { data: { country: string | null } }) => {
  await pause();
  if (data.country && !allowed(data.country, "read")) return fail("country_forbidden");
  const see = visible(data.country);
  return ok(
    load()
      .conflicts.filter((x) => !x.closed_at && see(x.country))
      .map(({ mine: _m, closed_at: _c, ...x }) => x),
  );
});

registerDemo(
  "golden.resolveConflict",
  async ({ data }: { data: { id: string; choice: Choice; value?: string } }) => {
    await pause();
    const s = load();
    const e = settleConflict(s, data.id, data.choice, data.value);
    if (e) return fail(e);
    save(s);
    return ok({ ok: true as const });
  },
);

registerDemo(
  "golden.resolveConflictsBulk",
  async ({ data }: { data: { ids: string[]; choice: "use_wamy" | "use_office" | "keep" } }) => {
    await pause();
    if (!data.ids.length) return fail("nothing_selected");
    if (data.ids.length > 200) return fail("too_many");
    if (!["use_wamy", "use_office", "keep"].includes(data.choice)) return fail("choice_unknown");
    const s = load();
    const results: BulkResult["results"] = data.ids.map((id) => {
      const x = s.conflicts.find((c) => c.id === id);
      if (x && !bulkEligible(x))
        return {
          id,
          ok: false,
          code: x.risk === "critical" ? "critical_not_bulk" : "not_disagreement",
        };
      const code = settleConflict(s, id, data.choice);
      return { id, ok: !code, code };
    });
    save(s);
    const done = results.filter((r) => r.ok).length;
    return ok({ ok: true as const, done, failed: results.length - done, results });
  },
);

registerDemo("golden.childFile", async ({ data }: { data: { id: string } }) => {
  await pause();
  const s = load();
  const f = s.files.find((o) => o.id === data.id);
  if (!f || !allowed(f.country, "read")) return fail("orphan_unknown");
  const c = s.countries.find((x) => x.code === f.country);
  const mode = c?.office_mode ?? "none";
  const fields: ChildFileField[] = FIELD_RULES.filter((r) => r.owner !== "platform").map((r) => {
    const value = f.values[r.field] ?? null;
    const last = f.history.find((h) => h.field === r.field);
    const officeV = f.office[r.field];
    return {
      field: r.field,
      field_group: r.group,
      risk: r.risk,
      owner: effectiveOwner(r.owner, mode),
      value,
      from_role: last ? last.role : value === null ? null : "wamy",
      applied_at: last?.received_at ?? null,
      pinned: f.sponsored && r.group === "identity",
      wamy: value === null ? null : { value, observed_at: c?.last_wamy ?? "", source: "wamy" },
      office:
        officeV === undefined || mode === "none"
          ? null
          : {
              value: officeV,
              observed_at: c?.last_office ?? "",
              source: c?.office_source ?? "office",
            },
      open_conflict: s.conflicts.some(
        (x) => !x.closed_at && x.orphan_id === f.id && x.field === r.field,
      ),
    };
  });
  const file: ChildFile = {
    id: f.id,
    code: f.code,
    name: f.name,
    country: f.country,
    status: f.sponsored ? "sponsored" : "available",
    trust: trustOf(s, f),
    office_mode: mode,
    fields,
    history: f.history,
  };
  return ok(file);
});

registerDemo("golden.links", async ({ data }: { data: { country: string | null } }) => {
  await pause();
  if (data.country && !allowed(data.country, "read")) return fail("country_forbidden");
  const see = visible(data.country);
  return ok(
    load()
      .links.filter((l) => !l.closed_at && see(l.country))
      .map(({ closed_at: _c, ...l }) => l),
  );
});

registerDemo(
  "golden.resolveLink",
  async ({
    data,
  }: {
    data: { id: string; action: "link" | "create" | "ignore"; orphanId?: string };
  }) => {
    await pause();
    const s = load();
    const l = s.links.find((x) => x.id === data.id);
    if (!l || l.closed_at) return fail("link_closed");
    if (!allowed(l.country, "approve")) return fail("country_forbidden");
    if (data.action === "create") {
      if (!actor.admin) return fail("admin_only");
      if (l.role !== "wamy") return fail("create_primary_only");
      const f = createFrom(s, l.id);
      log(s, "golden_ingest", l.country, { records: 1 }, f?.code ?? null);
    } else if (data.action === "link") {
      const f = s.files.find((o) => o.id === data.orphanId && o.country === l.country);
      if (!f) return fail("orphan_unknown");
      if (l.role === "office") {
        if (f.office_ref) return fail("already_linked");
        f.office_ref = l.external_ref;
        f.office = { ...f.values };
        f.base = "verified";
      } else f.wamy_ref = l.external_ref;
      l.closed_at = new Date().toISOString();
    } else l.closed_at = new Date().toISOString();
    save(s);
    return ok({ ok: true as const });
  },
);

registerDemo("golden.createUnmatched", async ({ data }: { data: { country: string } }) => {
  await pause();
  if (!actor.admin) return fail("admin_only");
  const s = load();
  const todo = s.links.filter(
    (l) =>
      !l.closed_at && l.country === data.country && l.role === "wamy" && l.candidates.length === 0,
  );
  let created = 0;
  for (const l of todo) if (createFrom(s, l.id)) created++;
  if (created) log(s, "golden_ingest", data.country, { records: created });
  save(s);
  return ok({ ok: true as const, created, failed: todo.length - created });
});

registerDemo("golden.alerts", async ({ data }: { data: { country: string | null } }) => {
  await pause();
  if (data.country && !allowed(data.country, "read")) return fail("country_forbidden");
  const see = visible(data.country);
  return ok(
    load()
      .alerts.filter((a) => !a.closed_at && see(a.country))
      .map(({ mine: _m, closed_at: _c, ...a }) => a),
  );
});

registerDemo(
  "golden.resolveAlert",
  async ({
    data,
  }: {
    data: { id: string; status: "reviewed" | "false_positive" | "confirmed"; note?: string };
  }) => {
    await pause();
    const s = load();
    const a = s.alerts.find((x) => x.id === data.id);
    if (!a || a.closed_at) return fail("alert_closed");
    if (!allowed(a.country, "approve")) return fail("country_forbidden");
    if (a.mine) return fail("four_eyes_required");
    if (data.status === "confirmed" && !data.note) return fail("note_required");
    a.closed_at = new Date().toISOString();
    if (data.status === "confirmed" && a.orphan_id) {
      const f = s.files.find((o) => o.id === a.orphan_id);
      if (f) f.base = "flagged";
    }
    log(s, "golden_alert_resolve", a.country, { signal: a.signal, status: data.status }, a.code);
    settled(s, a.country);
    save(s);
    return ok({ ok: true as const });
  },
);

registerDemo("golden.staff", async ({ data }: { data: { country: string } }) => {
  await pause();
  if (!allowed(data.country, "read")) return fail("country_forbidden");
  return ok(
    load()
      .staff.filter((m) => m.country === data.country)
      .map(({ country: _c, ...m }) => m),
  );
});

registerDemo(
  "golden.setStaff",
  async ({ data }: { data: { country: string; email: string; role: CountryRole | null } }) => {
    await pause();
    if (!allowed(data.country, "manage")) return { ...fail("country_forbidden"), invited: false };
    const roles = grantableRoles(actor, data.country);
    const s = load();
    const email = data.email.trim().toLowerCase();
    const existing = s.staff.find((m) => m.country === data.country && m.email === email);
    if (existing && !roles.includes(existing.role))
      return { ...fail("role_forbidden"), invited: false };
    if (data.role && !roles.includes(data.role))
      return { ...fail("role_forbidden"), invited: false };
    const from = existing?.role ?? "";
    if (data.role === null) {
      if (!existing) return { ...fail("user_not_found"), invited: false };
      s.staff = s.staff.filter((m) => m !== existing);
    } else if (existing) existing.role = data.role;
    else
      s.staff.push({
        user_id: nextId(s, 5),
        email,
        role: data.role,
        pending: true,
        created_at: new Date().toISOString(),
        country: data.country,
      });
    log(s, "country_staff_set", data.country, { from, to: data.role ?? "" });
    save(s);
    // دعوةٌ محاكاة: لا بريد يُرسل في العرض.
    return {
      ok: true as const,
      data: { ok: true as const },
      invited: !existing && data.role !== null,
    };
  },
);

/* ── مركز الثقة: قراءاتٌ للإدارة على الحالة نفسها ────────────────── */

const adminOnly = () => (actor.admin ? null : fail("admin_only"));

registerDemo("trust.overview", async () => {
  await pause();
  const no = adminOnly();
  if (no) return no;
  const s = load();
  return ok(
    health(s).map((h) => {
      const c = s.countries.find((x) => x.code === h.code)!;
      const files = Object.values(h.trust).reduce((a, b) => a + b, 0) - h.trust.legacy;
      return {
        code: h.code,
        name_ar: h.name_ar,
        name_local: c.name_local,
        office_mode: h.office_mode,
        office_source: h.office_source,
        files,
        verified: h.trust.verified,
        critical: h.conflicts.critical,
        other: h.conflicts.other,
        link_pending: h.link_pending,
        last_wamy: h.last_wamy,
        last_office: h.last_office,
      };
    }),
  );
});

registerDemo("trust.aging", async () => {
  await pause();
  const no = adminOnly();
  if (no) return no;
  const s = load();
  const now = Date.now();
  const items: AgingItem[] = [
    ...s.conflicts
      .filter((x) => !x.closed_at)
      .map((x) => ({
        kind: "conflict" as const,
        id: x.id,
        country: x.country,
        file_code: x.code,
        field: x.field,
        signal: null,
        created_at: x.created_at,
      })),
    ...s.alerts
      .filter((a) => !a.closed_at)
      .map((a) => ({
        kind: "alert" as const,
        id: a.id,
        country: a.country,
        file_code: a.code,
        field: a.field,
        signal: a.signal,
        created_at: a.created_at,
      })),
  ].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const buckets: AgingBucket[] = s.countries.map((c) => {
    const mine = items.filter((i) => i.country === c.code);
    const age = (i: AgingItem) => (now - Date.parse(i.created_at)) / 86_400_000;
    return {
      code: c.code,
      name_ar: c.name_ar,
      name_local: c.name_local,
      lt1: mine.filter((i) => age(i) < 1).length,
      d1_3: mine.filter((i) => age(i) >= 1 && age(i) < 3).length,
      d3_7: mine.filter((i) => age(i) >= 3 && age(i) < 7).length,
      gt7: mine.filter((i) => age(i) >= 7).length,
      oldest: mine[0]?.created_at ?? null,
    };
  });
  return ok({ buckets, oldest: items.slice(0, 20), total: items.length });
});

registerDemo("trust.team", async () => {
  await pause();
  const no = adminOnly();
  if (no) return no;
  const s = load();
  return ok(
    s.countries.map((c) => {
      const m = s.staff.filter((x) => x.country === c.code);
      return {
        code: c.code,
        name_ar: c.name_ar,
        name_local: c.name_local,
        supervisors: m.filter((x) => x.role === "supervisor").length,
        data_entry: m.filter((x) => x.role === "data_entry").length,
        viewers: m.filter((x) => x.role === "viewer").length,
        active_supervisors: m.filter((x) => x.role === "supervisor" && !x.pending).length,
        pending: m.filter((x) => x.pending).length,
      };
    }),
  );
});

registerDemo(
  "trust.decisions",
  async ({
    data,
  }: {
    data: {
      country: string | null;
      action: DecisionAction | null;
      beforeAt: string | null;
      beforeId: string | null;
    };
  }) => {
    await pause();
    const no = adminOnly();
    if (no) return no;
    const rows = load().decisions.filter(
      (d) =>
        (!data.country || d.country === data.country) &&
        (!data.action || d.action === data.action) &&
        (!data.beforeAt ||
          d.created_at < data.beforeAt ||
          (d.created_at === data.beforeAt && !!data.beforeId && d.id < data.beforeId)),
    );
    return ok({ rows: rows.slice(0, 25), has_more: rows.length > 25 });
  },
);

registerDemo("trust.weekly", async ({ data }: { data: { country: string } }) => {
  await pause();
  const no = adminOnly();
  if (no) return no;
  const s = load();
  const h = health(s).find((x) => x.code === data.country);
  if (!h) return fail("country_unknown");
  const files = Object.values(h.trust).reduce((a, b) => a + b, 0) - h.trust.legacy;
  return ok({
    country: data.country,
    files,
    verified_now: h.trust.verified,
    weeks: s.weeks[data.country] ?? [],
  });
});
