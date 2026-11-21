import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Loader2, Lock, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DuplicateMatch, PersonPayload } from "@/lib/data-entry";
import {
  addPerson,
  findPersons,
  getApprovedOrgs,
  getGroups,
  getRegions,
  type PersonResult,
} from "@/lib/data-entry.functions";
import { ORPHAN_STATUS_LABELS } from "@/lib/format";
import { useCopy } from "@/lib/locale";
import { cn } from "@/lib/utils";

import { COPY } from "./copy";
import {
  CARD,
  CountrySelect,
  Field,
  NeedsUpdate,
  Pill,
  SectionHead,
  SELECT,
  useErrorText,
  type Shared,
} from "./shared";

type Draft = {
  region: string;
  displayName: string;
  gender: "" | "male" | "female";
  birthDate: string;
  educationStage: string;
  monthlyNeed: string;
  groupId: string;
  orgId: string;
  fullName: string;
  guardianName: string;
  guardianPhone: string;
};
const EMPTY: Draft = {
  region: "",
  displayName: "",
  gender: "",
  birthDate: "",
  educationStage: "",
  monthlyNeed: "",
  groupId: "",
  orgId: "",
  fullName: "",
  guardianName: "",
  guardianPhone: "",
};

/**
 * إضافة شخص — أقلّ ما يلزم: الدولة ثم الاسم المستعار والجنس. الدولة تُختار
 * أوّلاً فتأتي منها قائمة المناطق والعملة والمجموعات؛ لا نصّ حرّ للدولة.
 */
export function PersonForm({ shared }: { shared: Shared }) {
  const c = useCopy(COPY);
  const t = c.persons;
  const errorText = useErrorText();
  const qc = useQueryClient();
  const fetchRegions = useServerFn(getRegions);
  const fetchGroups = useServerFn(getGroups);
  const fetchOrgs = useServerFn(getApprovedOrgs);
  const fetchRecent = useServerFn(findPersons);
  const submit = useServerFn(addPerson);
  const country = shared.country;
  const countryRow = shared.countries.find((x) => x.code === country);
  const currency = countryRow?.currency ?? shared.platformCurrency ?? "";

  const regions = useQuery({
    queryKey: ["data-regions", country],
    queryFn: () => fetchRegions({ data: { country } }),
    enabled: Boolean(country),
  });
  const groups = useQuery({
    queryKey: ["data-groups", country],
    queryFn: () => fetchGroups({ data: { country } }),
    enabled: Boolean(country),
  });
  const orgs = useQuery({ queryKey: ["approved-orgs"], queryFn: () => fetchOrgs() });
  const recent = useQuery({
    queryKey: ["data-recent", country],
    queryFn: () => fetchRecent({ data: { ...(country ? { country } : {}), limit: 8 } }),
  });

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [more, setMore] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [dups, setDups] = useState<DuplicateMatch[] | null>(null);
  const another = useRef(true);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const regionList = regions.data?.ok ? regions.data.data.regions.filter((r) => r.active) : [];
  const groupList = groups.data?.ok ? groups.data.data.filter((g) => !g.source) : [];
  const missing =
    (regions.data && !regions.data.ok && regions.data.missing) ||
    (recent.data && !recent.data.ok && recent.data.missing);
  const has = (code: string) => errors.includes(code);
  const rowError = (code: string) => (t.rowErrors as Record<string, string>)[code];

  function payload(): PersonPayload {
    const p: PersonPayload = {
      display_name: draft.displayName.trim(),
      gender: draft.gender,
      country,
    };
    if (draft.region) p.region = draft.region;
    if (draft.birthDate) p.birth_date = draft.birthDate;
    if (draft.educationStage.trim()) p.education_stage = draft.educationStage.trim();
    if (draft.monthlyNeed.trim()) p.monthly_need = draft.monthlyNeed.trim();
    if (draft.groupId) p.group_id = draft.groupId;
    if (draft.orgId) p.org_id = draft.orgId;
    if (draft.fullName.trim()) p.full_name = draft.fullName.trim();
    if (draft.guardianName.trim()) p.guardian_name = draft.guardianName.trim();
    if (draft.guardianPhone.trim()) p.guardian_phone = draft.guardianPhone.trim();
    return p;
  }

  async function send(confirmDuplicates: boolean) {
    const local: string[] = [];
    if (!country) local.push("country_required");
    if (draft.displayName.trim().length < 2) local.push("name_required");
    if (!draft.gender) local.push("gender_invalid");
    setErrors(local);
    if (local.length > 0) return;

    setBusy(true);
    const res = await submit({ data: { row: payload(), confirmDuplicates, dryRun: false } });
    setBusy(false);
    if (!res.ok) {
      toast.error(errorText(res.error));
      return;
    }
    const out: PersonResult = res.data;
    if (!out.ok) {
      if (out.code === "possible_duplicate") setDups(out.duplicates);
      else setErrors(out.errors);
      return;
    }
    setDups(null);
    toast.success(
      t.savedAs(out.code ?? "", ORPHAN_STATUS_LABELS[out.status ?? ""] ?? out.status ?? ""),
      {
        description: out.warnings.includes("region_from_group")
          ? t.regionFromGroup(out.region ?? "")
          : out.warnings.includes("group_region_differs")
            ? t.groupRegionDiffers
            : another.current
              ? t.keptDefaults
              : undefined,
      },
    );
    // الدولة والمنطقة والمجموعة والجهة تبقى للشخص التالي؛ وما يخصّ الشخص يُمسح.
    setDraft((d) => ({ ...EMPTY, region: d.region, groupId: d.groupId, orgId: d.orgId }));
    void qc.invalidateQueries({ queryKey: ["data-recent"] });
    shared.reloadCountries();
    if (another.current) nameRef.current?.focus();
    else shared.go("countries");
  }

  if (missing) {
    return (
      <div className="space-y-6">
        <SectionHead title={t.heading} hint={t.hint} />
        <NeedsUpdate />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <form
        noValidate
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void send(false);
        }}
      >
        <SectionHead title={t.heading} hint={t.hint} />

        <div className={cn(CARD, "space-y-5 p-5")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t.country}
              htmlFor="person-country"
              hint={t.countryHint}
              error={
                has("country_required")
                  ? rowError("country_required")
                  : has("country_unknown")
                    ? rowError("country_unknown")
                    : undefined
              }
            >
              <CountrySelect
                id="person-country"
                value={country}
                countries={shared.countries}
                invalid={has("country_required")}
                onChange={(code) => {
                  shared.setCountry(code);
                  // منطقة دولةٍ ليست منطقة أخرى: تُمسح مع تغيّر الدولة، ومعها المجموعة.
                  setDraft((d) => ({ ...d, region: "", groupId: "" }));
                  setDups(null);
                }}
              />
            </Field>
            <Field
              label={t.region}
              htmlFor="person-region"
              hint={countryRow ? t.regionOf(countryRow.name_ar) : undefined}
              error={has("region_unknown") ? rowError("region_unknown") : undefined}
            >
              <select
                id="person-region"
                className={SELECT}
                disabled={!country || regions.isPending}
                value={draft.region}
                onChange={(e) => set("region", e.target.value)}
              >
                <option value="">{country ? c.noRegion : c.chooseCountry}</option>
                {regionList.map((r) => (
                  <option key={r.id} value={r.name_ar}>
                    {r.name_ar}
                    {r.name_local ? ` (${r.name_local})` : ""}
                  </option>
                ))}
              </select>
              {country && regions.data?.ok && regionList.length === 0 && (
                <p className="mt-1.5 text-xs text-bridge-ink">
                  {t.regionEmpty}{" "}
                  <button
                    type="button"
                    className="font-bold underline underline-offset-2"
                    onClick={() => shared.go("regions", country)}
                  >
                    {t.regionEmptyAction}
                  </button>
                </p>
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t.displayName}
              htmlFor="person-name"
              hint={t.displayNameHint}
              error={
                has("name_required")
                  ? rowError("name_required")
                  : has("demo_reference")
                    ? rowError("demo_reference")
                    : undefined
              }
            >
              <Input
                id="person-name"
                ref={nameRef}
                value={draft.displayName}
                onChange={(e) => {
                  set("displayName", e.target.value);
                  setDups(null);
                }}
                maxLength={80}
                autoComplete="off"
                aria-invalid={has("name_required") || undefined}
                aria-describedby="person-name-msg"
              />
            </Field>
            <fieldset>
              <legend className="mb-1.5 block text-sm font-semibold">{t.gender}</legend>
              <div className="grid grid-cols-2 gap-2">
                {(["male", "female"] as const).map((g) => (
                  <label
                    key={g}
                    className={cn(
                      "flex h-11 cursor-pointer items-center justify-center rounded-md border text-sm transition-colors focus-within:ring-2 focus-within:ring-ring",
                      draft.gender === g
                        ? "border-primary bg-primary/10 font-bold text-primary"
                        : "border-input text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <input
                      type="radio"
                      name="person-gender"
                      className="sr-only"
                      checked={draft.gender === g}
                      onChange={() => set("gender", g)}
                    />
                    {t[g]}
                  </label>
                ))}
              </div>
              {has("gender_invalid") && (
                <p role="alert" className="mt-1.5 text-xs font-medium text-destructive">
                  {rowError("gender_invalid")}
                </p>
              )}
            </fieldset>
          </div>

          <button
            type="button"
            aria-expanded={more}
            aria-controls="person-more"
            onClick={() => setMore((v) => !v)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown
              aria-hidden="true"
              className={cn("size-4 transition-transform duration-200", more && "rotate-180")}
            />
            {t.more} <span className="font-normal text-muted-foreground">({c.optional})</span>
          </button>

          {more && (
            <div id="person-more" className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  label={t.birthDate}
                  htmlFor="person-birth"
                  error={has("birth_date_invalid") ? rowError("birth_date_invalid") : undefined}
                >
                  <Input
                    id="person-birth"
                    type="date"
                    value={draft.birthDate}
                    onChange={(e) => set("birthDate", e.target.value)}
                  />
                </Field>
                <Field label={t.educationStage} htmlFor="person-stage">
                  <Input
                    id="person-stage"
                    value={draft.educationStage}
                    onChange={(e) => set("educationStage", e.target.value)}
                    maxLength={80}
                  />
                </Field>
                <Field
                  label={t.monthlyNeed}
                  htmlFor="person-need"
                  hint={currency ? t.monthlyNeedHint(currency) : undefined}
                  error={has("need_invalid") ? rowError("need_invalid") : undefined}
                >
                  <Input
                    id="person-need"
                    inputMode="decimal"
                    dir="ltr"
                    className="text-end tabular-nums"
                    value={draft.monthlyNeed}
                    onChange={(e) => set("monthlyNeed", e.target.value)}
                    maxLength={9}
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t.group}
                  htmlFor="person-group"
                  hint={t.groupHint}
                  error={
                    has("group_country_mismatch")
                      ? rowError("group_country_mismatch")
                      : has("group_unknown")
                        ? rowError("group_unknown")
                        : undefined
                  }
                >
                  <select
                    id="person-group"
                    className={SELECT}
                    disabled={!country}
                    value={draft.groupId}
                    onChange={(e) => set("groupId", e.target.value)}
                  >
                    <option value="">{t.groupNone}</option>
                    {groupList.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                        {g.region ? ` — ${g.region}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label={t.org}
                  htmlFor="person-org"
                  hint={t.orgHint}
                  error={has("org_unknown") ? rowError("org_unknown") : undefined}
                >
                  <select
                    id="person-org"
                    className={SELECT}
                    value={draft.orgId}
                    onChange={(e) => set("orgId", e.target.value)}
                  >
                    <option value="">{t.orgNone}</option>
                    {(orgs.data?.orgs ?? []).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <fieldset className="rounded-xl bg-secondary/50 p-4">
                <legend className="flex items-center gap-1.5 px-1 text-sm font-bold">
                  <Lock className="size-3.5" aria-hidden="true" />
                  {t.privateTitle}
                </legend>
                <p className="text-xs text-muted-foreground">{t.privateHint}</p>
                <div className="mt-3 grid gap-4 sm:grid-cols-3">
                  <Field label={t.fullName} htmlFor="person-full">
                    <Input
                      id="person-full"
                      value={draft.fullName}
                      onChange={(e) => set("fullName", e.target.value)}
                      maxLength={140}
                      autoComplete="off"
                    />
                  </Field>
                  <Field label={t.guardianName} htmlFor="person-guardian">
                    <Input
                      id="person-guardian"
                      value={draft.guardianName}
                      onChange={(e) => set("guardianName", e.target.value)}
                      maxLength={140}
                      autoComplete="off"
                    />
                  </Field>
                  <Field label={t.guardianPhone} htmlFor="person-phone">
                    <Input
                      id="person-phone"
                      type="tel"
                      dir="ltr"
                      className="text-end"
                      value={draft.guardianPhone}
                      onChange={(e) => set("guardianPhone", e.target.value)}
                      maxLength={40}
                      autoComplete="off"
                    />
                  </Field>
                </div>
              </fieldset>
            </div>
          )}
        </div>

        {dups && (
          <div
            role="alert"
            className="map-rise rounded-2xl border border-bridge/50 bg-bridge/10 p-4"
          >
            <p className="flex items-center gap-2 font-bold text-bridge-ink">
              <ShieldAlert className="size-4" aria-hidden="true" />
              {t.dupTitle}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{t.dupText}</p>
            <ul className="mt-3 space-y-2">
              {dups.map((d) => (
                <li key={d.id} className="rounded-xl bg-card p-3 text-sm">
                  <p className="font-semibold">
                    <bdi>{d.name}</bdi> ·{" "}
                    <bdi dir="ltr" className="text-muted-foreground">
                      {d.code}
                    </bdi>
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    <Pill tone="quiet">{ORPHAN_STATUS_LABELS[d.status] ?? d.status}</Pill>
                    {d.region && <Pill tone="quiet">{d.region}</Pill>}
                    {d.reasons.map((r) => (
                      <Pill key={r} tone="gold">
                        {(t.dupReasons as Record<string, string>)[r] ?? r}
                      </Pill>
                    ))}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void send(true)}
              >
                {t.dupConfirm}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setDups(null)}>
                {c.cancel}
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={busy} onClick={() => (another.current = true)}>
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            {t.saveAnother}
          </Button>
          <Button
            type="submit"
            variant="outline"
            disabled={busy}
            onClick={() => (another.current = false)}
          >
            {t.saveOne}
          </Button>
        </div>
        <p className="text-xs leading-6 text-muted-foreground">{t.notPublished}</p>
      </form>

      <aside aria-labelledby="recent-title">
        <h4 id="recent-title" className="font-bold">
          {t.recentTitle}
        </h4>
        {recent.isPending ? (
          <Loader2 className="mt-4 size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : !recent.data?.ok || recent.data.data.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t.recentEmpty}
          </p>
        ) : (
          <ul className={cn(CARD, "mt-3 divide-y divide-border")}>
            {recent.data.data.map((p) => (
              <li key={p.id} className="p-3">
                <p className="truncate text-sm font-semibold">
                  <bdi>{p.name}</bdi>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <bdi dir="ltr">{p.code}</bdi>
                  <Pill tone="quiet">{ORPHAN_STATUS_LABELS[p.status] ?? p.status}</Pill>
                  {p.region && <span>{p.region}</span>}
                  {p.synced_source && <Pill tone="wine">{t.synced(p.synced_source)}</Pill>}
                  {p.locked && <Pill tone="gold">{t.locked}</Pill>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
