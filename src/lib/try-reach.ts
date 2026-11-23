/**
 * what a trial pledge's amount stands for, said the same way wherever the trial shows it (the
 * support sheet on the map and the impact hall both read this file, so the two cannot differ).
 *
 * A pledge to a region, a group or a country is pooled: it joins that place's fund, and the fund
 * (never one donor) carries the place's children. So the amount is shown as its share of the
 * fund, not as the whole place. The only unit the trial holds is its sample child's monthly need
 * in the country (`TryChild.need`, in the file's currency); the fund's sample monthly need is
 * that unit for each child of the place. A pledge typed in another currency is recorded as typed
 * and never converted, so no share is claimed for it.
 */
import { payableOptions, type Payable } from "@/lib/currency";
import { formatMoney } from "@/lib/format";
import { copyOf, defineCopy, pluralOf, type Locale } from "@/lib/locale";
import { TRY_CURRENCY } from "@/lib/try-demo";
import { tryChildOf } from "@/lib/try-places";
import { targetChildren, targetLabel, type TryTarget } from "@/lib/try-support";

/**
 * the currencies a trial pledge is typed in: the trial's file currency first (the one every
 * trial child's need is written in, so a journey reads in one currency), then the country's own
 * and the unified one. The sheet and the hall both offer this list.
 */
export const tryPledgeCurrencies = (co: string | null | undefined): Payable[] =>
  payableOptions(co, TRY_CURRENCY);

export type TryReach = {
  /** the children the fund carries: the catalogue's count for the target */
  children: number;
  /** sample: one child's monthly need in this country, and the fund's (unit × children) */
  unit: number;
  fund: number;
  currency: string;
  /** the amount's share of the fund's monthly need, 0..100 (unrounded); null when not comparable */
  share: number | null;
  /** whole children whose monthly need the amount equals, never more than the fund carries */
  equals: number | null;
};

/** the figures behind a pledge of `amount` a month to a trial target; null outside the catalogue */
export function tryPledgeReach(t: TryTarget, amount: number, currency: string): TryReach | null {
  const children = targetChildren(t);
  const unit = tryChildOf(t.co)?.need ?? 0;
  if (!children || !(unit > 0) || !(amount > 0)) return null;
  const fund = unit * children;
  const same = currency === TRY_CURRENCY;
  return {
    children,
    unit,
    fund,
    currency: TRY_CURRENCY,
    share: same ? Math.min(100, (amount / fund) * 100) : null,
    equals: same ? Math.min(children, Math.floor(amount / unit)) : null,
  };
}

const COPY = defineCopy("lib/try-reach", {
  ar: {
    children: pluralOf(
      { one: "طفلٌ واحد", two: "طفلان", few: "{0} أطفال", many: "{0} طفلاً", other: "{0} طفل" },
      0,
      "ar",
    ),
    head: (place: string) => `تعهّدك ينضمّ إلى صندوق ${place}`,
    under: "أقل من 1%",
    whole: "100%",
    shareOf: (place: string) => `حصّتك من صندوق ${place}`,
    joined: (place: string) => `في صندوق ${place} الذي انضممت إليه`,
    equals: pluralOf(
      {
        one: "{1} شهرياً تعادل الحاجة الشهرية لطفلٍ واحد من {2}، وهي {3} من حاجة الصندوق الشهرية النموذجية ({4}).",
        two: "{1} شهرياً تعادل الحاجة الشهرية لطفلين من {2}، وهي {3} من حاجة الصندوق الشهرية النموذجية ({4}).",
        few: "{1} شهرياً تعادل الحاجة الشهرية لـ{0} أطفال من {2}، وهي {3} من حاجة الصندوق الشهرية النموذجية ({4}).",
        many: "{1} شهرياً تعادل الحاجة الشهرية لـ{0} طفلاً من {2}، وهي {3} من حاجة الصندوق الشهرية النموذجية ({4}).",
        other:
          "{1} شهرياً تعادل الحاجة الشهرية لـ{0} طفل من {2}، وهي {3} من حاجة الصندوق الشهرية النموذجية ({4}).",
      },
      0,
      "ar",
    ),
    part: (money: string, pct: string, unit: string, n: string, share: string, fund: string) =>
      `${money} شهرياً تعادل ${pct} من الحاجة الشهرية لطفلٍ واحد (${unit}، رقمٌ نموذجي). الصندوق يحمل ${n}، وحصّتك ${share} من حاجته الشهرية النموذجية (${fund}).`,
    all: (money: string, n: string, fund: string) =>
      `${money} شهرياً تغطّي حاجة الصندوق الشهرية النموذجية كلّها (${fund}) لـ${n}.`,
    typed: (money: string, n: string, currency: string) =>
      `${money} شهرياً تنضمّ إلى صندوقٍ يحمل ${n}. حاجة الصندوق النموذجية مقيَّدة بعملة ${currency}، ومبلغك يُقيَّد كما كتبته بلا تحويل، فلا تُدَّعى له حصّة.`,
  },
  en: {
    children: pluralOf({ one: "{0} child", other: "{0} children" }),
    head: (place: string) => `Your pledge joins the ${place} fund`,
    under: "under 1%",
    whole: "100%",
    shareOf: (place: string) => `your share of the ${place} fund`,
    joined: (place: string) => `in the ${place} fund you joined`,
    equals: pluralOf({
      one: "{1} a month equals the monthly need of {0} child out of {2}: {3} of the fund's sample monthly need ({4}).",
      other:
        "{1} a month equals the monthly need of {0} children out of {2}: {3} of the fund's sample monthly need ({4}).",
    }),
    part: (money: string, pct: string, unit: string, n: string, share: string, fund: string) =>
      `${money} a month is ${pct} of one child's monthly need (${unit}, a sample figure). The fund carries ${n}, and your share is ${share} of its sample monthly need (${fund}).`,
    all: (money: string, n: string, fund: string) =>
      `${money} a month covers the fund's whole sample monthly need (${fund}) for ${n}.`,
    typed: (money: string, n: string, currency: string) =>
      `${money} a month joins a fund that carries ${n}. The fund's sample need is kept in ${currency}; your amount is recorded as typed, with no conversion, so no share is claimed for it.`,
  },
});

export type TryReachText = {
  /** «تعهّدك ينضمّ إلى صندوق …» */
  head: string;
  /** what the amount equals, in one sentence */
  line: string;
  /** the share as a figure («4%»، «أقل من 1%»), or null when not comparable */
  share: string | null;
  shareLabel: string;
  /** the children the fund carries, and the label that says whose they are */
  children: number;
  childrenLabel: string;
};

const percent = (v: number, locale: Locale) =>
  `⁨${new Intl.NumberFormat(locale === "ar" ? "ar-u-nu-latn" : locale, { maximumFractionDigits: 0 }).format(v)}%⁩`;

/** the share as it is written: never 0% for a real amount, never above the whole */
export function shareText(share: number, locale: Locale): string {
  const c = copyOf(COPY, locale);
  if (share >= 100) return c.whole;
  if (share < 1) return c.under;
  return percent(Math.floor(share), locale);
}

/**
 * a pledge's reach in words, for the sheet and for the hall alike. `currency` is the one the
 * pledge is typed in; null when the target is not in the catalogue.
 */
export function tryReachText(
  t: TryTarget,
  amount: number,
  currency: string,
  locale: Locale,
): TryReachText | null {
  const r = tryPledgeReach(t, amount, currency);
  if (!r) return null;
  const c = copyOf(COPY, locale);
  const place = targetLabel(t, locale).label;
  const money = formatMoney(amount, currency, locale);
  const n = c.children(r.children);
  const fund = formatMoney(r.fund, r.currency, locale);
  const share = r.share === null ? null : shareText(r.share, locale);
  let line: string;
  if (r.share === null || r.equals === null || share === null) {
    line = c.typed(money, n, r.currency);
  } else if (r.share >= 100) {
    line = c.all(money, n, fund);
  } else if (r.equals < 1) {
    const pct = percent(Math.max(1, Math.floor((amount / r.unit) * 100)), locale);
    line = c.part(money, pct, formatMoney(r.unit, r.currency, locale), n, share, fund);
  } else {
    line = c.equals(r.equals, money, n, share, fund);
  }
  return {
    head: c.head(place),
    line,
    share,
    shareLabel: c.shareOf(place),
    children: r.children,
    childrenLabel: c.joined(place),
  };
}
