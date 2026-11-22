// lib/model.ts — the token-radar model (round 2, written fresh).
//
// The question the board answers: a protocol has no token yet, so what
// would its token be worth if it launched at the multiple its own
// category already trades at? The multiple comes from the snapshot
// itself: for each category, the median mcap/TVL of the protocols in
// that category whose token already trades, shrunk toward the global
// median so a category with one or two live tokens does not swing the
// whole board. CEX is left out of the comp pool: an exchange token
// trades against the exchange's user balances, not against protocol
// TVL, so its multiple says nothing about a protocol launch.
//
// implied = round(TVL x category multiple x growth x maturity x chains)
//   growth: the protocol's 7-day TVL change, clamped to [-60, 120],
//     counted at half weight (a hot week is a hint, not a value).
//   maturity: 0.6 for a protocol listed yesterday, rising to 1.0 at
//     three years old; unknown listing date counts as one year.
//   chains: each chain past the first adds 2%, up to five extra.
// No name is special-cased anywhere: the same formula scores all 758.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Comp {
  category: string;
  n: number;
  median: number;
  multiple: number;
}

export interface Score {
  implied: number;
  multiple: number;
  compN: number;
  compMedian: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  chainMult: number;
  ageDays: number;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: string;
  age_days: number;
  implied_value_usd: number;
  model: Score;
  farm_steps: string[];
}

const PRIOR_WEIGHT = 5;
const CLAMP_LOW = 0.02;
const CLAMP_HIGH = 1.0;
const MATURITY_DAYS = 1095;
const UNKNOWN_AGE_DAYS = 365;

export function isPreToken(p: Protocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

// The live-token comp pool: a protocol whose token trades, with a
// positive market cap and TVL, outside CEX. Zero-mcap tokens are out:
// a token with no recorded market cap carries no multiple.
export function compPool(protocols: Protocol[]): Protocol[] {
  return protocols.filter(
    (p) =>
      p.gecko_id !== null &&
      p.symbol !== null &&
      p.mcap_usd !== null &&
      p.mcap_usd > 0 &&
      p.tvl_usd > 0 &&
      p.category !== "CEX",
  );
}

export function computeComps(protocols: Protocol[]): {
  comps: Comp[];
  globalMedian: number;
  globalMultiple: number;
} {
  const pool = compPool(protocols);
  const globalMedian = median(pool.map((p) => p.mcap_usd! / p.tvl_usd));
  const globalMultiple = clamp(globalMedian, CLAMP_LOW, CLAMP_HIGH);
  const byCategory = new Map<string, number[]>();
  for (const p of pool) {
    const cat = p.category ?? "Uncategorized";
    const list = byCategory.get(cat) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCategory.set(cat, list);
  }
  const categories = [...new Set(protocols.map((p) => p.category ?? "Uncategorized"))].sort();
  const comps: Comp[] = categories.map((cat) => {
    const xs = byCategory.get(cat) ?? [];
    if (xs.length === 0) {
      return { category: cat, n: 0, median: globalMedian, multiple: globalMultiple };
    }
    const med = median(xs);
    const shrunk = (xs.length * med + PRIOR_WEIGHT * globalMedian) / (xs.length + PRIOR_WEIGHT);
    return { category: cat, n: xs.length, median: med, multiple: clamp(shrunk, CLAMP_LOW, CLAMP_HIGH) };
  });
  return { comps, globalMedian, globalMultiple };
}

export function ageDays(listedAt: string | null, asOf: string): number {
  if (!listedAt) return UNKNOWN_AGE_DAYS;
  const a = Date.parse(asOf + "T00:00:00Z");
  const b = Date.parse(listedAt + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return UNKNOWN_AGE_DAYS;
  const days = Math.floor((a - b) / 86400000);
  return days < 0 ? 0 : days;
}

export function scoreProtocol(
  p: Protocol,
  compByCategory: Map<string, Comp>,
  globalMultiple: number,
  asOf: string,
): Score {
  const cat = p.category ?? "Uncategorized";
  const comp = compByCategory.get(cat);
  const multiple = comp ? comp.multiple : globalMultiple;
  const growthPct = p.change_7d ?? 0;
  const growthClamped = clamp(growthPct, -60, 120);
  const growthMult = 1 + 0.5 * (growthClamped / 100);
  const age = ageDays(p.listed_at, asOf);
  const maturityMult = 0.6 + 0.4 * (Math.min(age, MATURITY_DAYS) / MATURITY_DAYS);
  const extraChains = Math.min(Math.max(p.chains.length - 1, 0), 5);
  const chainMult = 1 + 0.02 * extraChains;
  const implied = Math.round(p.tvl_usd * multiple * growthMult * maturityMult * chainMult);
  return {
    implied,
    multiple,
    compN: comp ? comp.n : 0,
    compMedian: comp ? comp.median : globalMultiple,
    growthPct,
    growthMult,
    maturityMult,
    chainMult,
    ageDays: age,
  };
}

// The qualifying action, phrased for the protocol's category, so the
// plan reads like it was written for this protocol and not pasted.
function depositAction(p: Protocol): string {
  const name = p.name;
  switch (p.category) {
    case "Dexs":
      return `Swap $150 through ${name}`;
    case "Lending":
      return `Lend $150 with ${name}`;
    case "Yield":
      return `Deposit $150 into a ${name} vault`;
    case "Bridge":
    case "Canonical Bridge":
    case "Cross Chain Bridge":
      return `Bridge $150 through ${name}`;
    case "Liquid Staking":
    case "Liquid Restaking":
    case "Restaked BTC":
      return `Stake $150 with ${name}`;
    case "Basis Trading":
      return `Open a $150 basis position on ${name}`;
    case "Liquidity Manager":
      return `Deposit $150 into a ${name} position`;
    case "Indexes":
      return `Buy $150 of the ${name} index`;
    case "Launchpad":
      return `Join the ${name} launchpad with $150`;
    case "Payments":
      return `Route $150 of payments through ${name}`;
    case "Options":
      return `Open a $150 options position on ${name}`;
    case "Yield Aggregator":
      return `Deposit $150 into the ${name} aggregator`;
    case "CDP":
      return `Open a $150 vault on ${name}`;
    default:
      return `Deposit $150 into ${name}`;
  }
}

export function farmSteps(p: Protocol): string[] {
  const chain = p.chains[0] ?? "Ethereum";
  const action = depositAction(p);
  return [
    "Open a fresh wallet that holds only the funds you plan to farm, and write its seed phrase down offline before you send anything. Cost: under $3 of gas for the first transaction. Time: 5 minutes.",
    `${action} on ${chain} and keep the position open; this is the action most launches count. Cost: $150 of capital and about $8 of gas. Time: 15 minutes to set up.`,
    `Do one qualifying action each week on ${p.name} — a deposit, a borrow, a swap or a vote — so your address stays active in the window. Cost: about $2 of gas a week. Time: 10 minutes a week.`,
    "Hold the position through the whole snapshot window and do not bridge it away; moving it can reset the eligibility you built up. Cost: none. Time: none.",
    `Check ${p.name}'s announcements once a week for a token or points program, and write down every snapshot date you see. Cost: none. Time: 5 minutes a week.`,
    `If ${p.name} also runs on a chain you already use, repeat the smallest qualifying action there to cover both. Cost: about $5 of gas. Time: 10 minutes.`,
    "No token is announced: this farm is speculative, so size it as money you can lose, and never buy a token that claims to be the launch. Cost: nothing you cannot afford to lose. Time: none.",
  ];
}

// Rank the board: the whole watchlist first by definition, then the
// pre-token protocols below the floor with the most TVL, until the
// board holds `target` rows. Rows come back sorted by implied value
// descending, ranks 1..n, ties broken by TVL then slug so the order
// is fixed and two runs write the same bytes.
export function buildBoard(
  protocols: Protocol[],
  watchlist: string[],
  comps: Comp[],
  globalMultiple: number,
  asOf: string,
  target: number,
): BoardRow[] {
  const compByCategory = new Map(comps.map((c) => [c.category, c]));
  const bySlug = new Map(protocols.map((p) => [p.slug, p]));
  const picked: Protocol[] = [];
  const seen = new Set<string>();
  for (const slug of watchlist) {
    const p = bySlug.get(slug);
    if (p && !seen.has(slug)) {
      seen.add(slug);
      picked.push(p);
    }
  }
  const floor = Math.min(...picked.map((p) => p.tvl_usd));
  const below = protocols
    .filter((p) => isPreToken(p) && !seen.has(p.slug) && p.tvl_usd < floor)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  for (const p of below) {
    if (picked.length >= target) break;
    seen.add(p.slug);
    picked.push(p);
  }
  const rows: BoardRow[] = picked.map((p) => {
    const model = scoreProtocol(p, compByCategory, globalMultiple, asOf);
    return {
      rank: 0,
      slug: p.slug,
      name: p.name,
      category: p.category ?? "Uncategorized",
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: "pre-token",
      age_days: model.ageDays,
      implied_value_usd: model.implied,
      model,
      farm_steps: farmSteps(p),
    };
  });
  rows.sort(
    (a, b) =>
      b.implied_value_usd - a.implied_value_usd ||
      b.tvl_usd - a.tvl_usd ||
      (a.slug < b.slug ? -1 : 1),
  );
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  return rows;
}
