// main.ts — token-radar entrypoint (round 2, written fresh).
//
// Reads the sealed snapshot, scores every protocol with the model in
// lib/model.ts, and writes the entry's outputs:
//
//   <out>/board.json     the ranked board (200 rows, watchlist covered)
//   <out>/data.js        the dashboard's data, beside the page's folder
//   <out>/dashboard/     a copy of dashboard/
//   <out>/screenshots/   a copy of screenshots/
//   <out>/dossier.json   buildDossier from vendor/makefun-board.ts
//
// Run it as the kit does: MAKEFUN_OUTPUT_DIR=out node main.ts
// --input ../token-radar-01-kit/input/snapshot.json
// The grader runs it the same way with its own input and output
// paths. Node 22, standard library only, no network, deterministic:
// the same snapshot always writes the same bytes.

import { readFileSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { computeComps, compPool, buildBoard } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

const ROOT = dirname(fileURLToPath(import.meta.url));

function argValue(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

const inputPath = argValue("--input", "/input/snapshot.json");
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "out";
const BOARD_ROWS = 200;

const snapshot = JSON.parse(readFileSync(inputPath, "utf8"));
const protocols = snapshot.protocols as never[];
const watchlist = snapshot.watchlist as string[];
const asOf = snapshot.as_of as string;

const { comps, globalMedian, globalMultiple } = computeComps(
  protocols as never[],
);
const rows = buildBoard(
  protocols as never[],
  watchlist,
  comps,
  globalMultiple,
  asOf,
  BOARD_ROWS,
);

mkdirSync(join(outDir, "dashboard"), { recursive: true });
mkdirSync(join(outDir, "screenshots"), { recursive: true });

writeFileSync(
  join(outDir, "board.json"),
  JSON.stringify(
    {
      as_of: asOf,
      floor_usd: snapshot.floor_usd,
      model: "radar-2: category comps, shrunk to the global median",
      rows,
    },
    null,
    2,
  ) + "\n",
);

const live = compPool(protocols as never[]).map((p) => ({
  slug: p.slug,
  name: p.name,
  category: p.category ?? "Uncategorized",
  tvl_usd: p.tvl_usd,
  mcap_usd: p.mcap_usd!,
  multiple: p.mcap_usd! / p.tvl_usd,
}));

writeFileSync(
  join(outDir, "data.js"),
  "window.RADAR = " +
    JSON.stringify({
      meta: {
        as_of: asOf,
        floor_usd: snapshot.floor_usd,
        global_median: globalMedian,
        global_multiple: globalMultiple,
        rows: rows.length,
        watchlist: watchlist.length,
      },
      comps,
      live,
      rows,
    }) +
    ";\n",
);

cpSync(join(ROOT, "dashboard"), join(outDir, "dashboard"), { recursive: true });
cpSync(join(ROOT, "screenshots"), join(outDir, "screenshots"), { recursive: true });

const dossier = buildDossier(outDir, { text_max_bytes: 65536 });
writeFileSync(join(outDir, "dossier.json"), dossier);

const covered = rows.filter((r) => watchlist.includes(r.slug)).length;
console.error(
  `token-radar: ${rows.length} rows, watchlist ${covered}/${watchlist.length}, ` +
    `top ${rows[0].slug} $${rows[0].implied_value_usd.toLocaleString("en-US")}, ` +
    `dossier ${dossier.length} bytes`,
);
