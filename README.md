# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/sam666-byte/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/sam666-byte/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks 200 pre-token DeFi protocols by what a launch would be worth, each with the steps to farm it. Implied value is a category comparison, not a flat multiple: TVL times the median market-cap-to-TVL of the live tokens in the same category (measured from the same DefiLlama snapshot, shrunk toward the global median when a category has few live comps), times seven-day growth, maturity with no token, and chain breadth. The board covers the whole 40-protocol watchlist plus 160 early pre-token protocols below the $50M floor, and the live-token protocols are set aside with their market caps shown. The dashboard is a static page — board, top five, filters by category, chain, TVL and implied value, a detail view with the model's own inputs and a seven-step farm plan per protocol — and it renders with no network and no framework.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

Then open `out/dashboard/index.html`. Node 22, standard library only; no install, no build step.

---

<sub>Entered on [make.fun](https://make.fun/?ref=32fhk82g&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
