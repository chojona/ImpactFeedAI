type AssetMini = {
  symbol: string;
  change: number;
  direction: "UP" | "DOWN";
};

const REPLAY_ASSETS: readonly AssetMini[] = [
  { symbol: "SPY", change: 1.24, direction: "UP" },
  { symbol: "GC", change: -0.42, direction: "DOWN" },
  { symbol: "BTC", change: 2.58, direction: "UP" },
  { symbol: "DXY", change: -0.87, direction: "DOWN" },
];

const SURPRISE_ASSETS: ReadonlyArray<{ symbol: string; change: number }> = [
  { symbol: "SPY", change: -1.07 },
  { symbol: "TLT", change: -1.42 },
  { symbol: "GC", change: -0.42 },
  { symbol: "NQ", change: -1.31 },
];

const PATTERN_BARS: ReadonlyArray<{ symbol: string; value: number }> = [
  { symbol: "SPY", value: 0.77 },
  { symbol: "NQ", value: 0.51 },
  { symbol: "GC", value: -1.23 },
  { symbol: "BTC", value: 1.95 },
  { symbol: "DXY", value: -0.7 },
];

export function MockReplayVisual() {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/5 bg-[#080C10] p-3 shadow-2xl shadow-black/40">
      {REPLAY_ASSETS.map((it) => {
        const color = it.direction === "UP" ? "#00FF94" : "#FF4D4D";
        const path =
          it.direction === "UP"
            ? "M 0 28 L 22 26 L 42 24 L 64 10 L 100 4"
            : "M 0 4 L 22 6 L 42 8 L 64 22 L 100 28";
        return (
          <div key={it.symbol} className="rounded-md bg-white/[0.02] p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-zinc-200">
                {it.symbol}
              </span>
              <span
                className="font-mono text-[10px] font-semibold"
                style={{ color }}
              >
                {it.change > 0 ? "+" : ""}
                {it.change.toFixed(2)}%
              </span>
            </div>
            <svg
              viewBox="0 0 100 32"
              preserveAspectRatio="none"
              className="mt-1 h-8 w-full"
              aria-hidden
            >
              <path
                d={path}
                stroke={color}
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        );
      })}
    </div>
  );
}

export function MockSurpriseVisual() {
  return (
    <div className="rounded-xl border border-white/5 bg-[#080C10] p-5 shadow-2xl shadow-black/40">
      <div
        className="inline-block rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
        style={{
          backgroundColor: "#EF444420",
          color: "#EF4444",
          border: "1px solid #EF444440",
        }}
      >
        Inflation
      </div>
      <div className="mt-3 text-base font-semibold leading-snug text-zinc-100 sm:text-lg">
        January CPI Comes In Hot at 3.0%
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-zinc-800/60 px-3 py-1.5 text-xs text-zinc-400">
          Expected
          <span className="ml-1.5 font-mono font-semibold text-zinc-300">
            2.9%
          </span>
        </span>
        <span className="rounded-full bg-zinc-800/60 px-3 py-1.5 text-xs text-red-400">
          Actual
          <span className="ml-1.5 font-mono font-semibold">3.0%</span>
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {SURPRISE_ASSETS.map(({ symbol, change }) => (
          <span
            key={symbol}
            className="flex items-center gap-1.5 rounded-md bg-red-500/10 px-2 py-1 text-[11px]"
          >
            <span className="font-semibold text-zinc-200">{symbol}</span>
            <span className="font-mono font-semibold text-red-400">
              {change.toFixed(2)}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function MockPatternVisual() {
  const maxAbs = Math.max(...PATTERN_BARS.map((i) => Math.abs(i.value)));
  return (
    <div className="rounded-xl border border-white/5 bg-[#080C10] p-5 shadow-2xl shadow-black/40">
      <div className="flex items-center gap-2">
        <span
          className="rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
          style={{
            backgroundColor: "#FF6B3520",
            color: "#FF6B35",
            border: "1px solid #FF6B3540",
          }}
        >
          TARIFF
        </span>
        <span className="font-mono text-xs tabular-nums text-zinc-500">
          3 events
        </span>
      </div>
      <div className="mt-4 space-y-2">
        {PATTERN_BARS.map(({ symbol, value }) => {
          const isUp = value >= 0;
          const widthPct = (Math.abs(value) / maxAbs) * 50;
          return (
            <div
              key={symbol}
              className="grid grid-cols-[40px_1fr_56px] items-center gap-2.5"
            >
              <span className="text-xs font-semibold text-zinc-200">
                {symbol}
              </span>
              <div className="relative h-3.5 rounded bg-white/[0.02]">
                <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
                <div
                  className={`absolute inset-y-0 ${
                    isUp
                      ? "rounded-r bg-[#00FF94]/40"
                      : "rounded-l bg-red-400/40"
                  }`}
                  style={
                    isUp
                      ? { left: "50%", width: `${widthPct}%` }
                      : { right: "50%", width: `${widthPct}%` }
                  }
                />
              </div>
              <span
                className={`text-right font-mono text-[11px] font-semibold ${
                  isUp ? "text-[#00FF94]" : "text-red-400"
                }`}
              >
                {value > 0 ? "+" : ""}
                {value.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
