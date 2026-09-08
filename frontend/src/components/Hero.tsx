import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, Lock, ShieldCheck, Zap } from "lucide-react";
import ParallaxStage from "@/components/hero/ParallaxStage";
import { PICK_SECTORS } from "@/lib/sectors";
import type { IndexSnapshot, Pick, Quote, Scorecard } from "@/lib/db";

/**
 * The hero leads with the one thing no other PSX site offers: AI picks screened
 * against the exchange's own Islamic index, with a published track record.
 *
 * The orbit around the KSE-100 is not decoration for its own sake. Every chip
 * is a real pick linking to its stock page, and the rail underneath is the ten
 * sector pages, so the graphic doubles as internal navigation. The orbit
 * mechanics live in the hero block at the end of globals.css.
 */

/** One symbol riding an orbit. */
type Satellite = { symbol: string; changePct: number | null };

/**
 * Orbit geometry: an outer ring of four picks, a counter-turning middle ring of
 * three, and an inner ring of bare dots that lends the system depth without
 * crowding it with more labels. Radii are pixels, matching the approved design.
 */
const ORBITS = [
  { radius: 208, duration: "70s", reverse: false, angles: [18, 105, 196, 284] },
  { radius: 148, duration: "48s", reverse: true, angles: [52, 172, 296] },
] as const;

const INNER_ORBIT = { radius: 96, duration: "34s", angles: [0, 130, 238] } as const;

const SATELLITE_SLOTS = ORBITS.reduce((total, orbit) => total + orbit.angles.length, 0);

/**
 * Where each ring starts in the satellite list. Worked out once here rather
 * than with a running counter during render, so the picks fill the rings
 * outermost first without anything being reassigned mid-render.
 */
const ORBIT_RINGS = ORBITS.map((orbit, ring) => ({
  ...orbit,
  offset: ORBITS.slice(0, ring).reduce((total, earlier) => total + earlier.angles.length, 0),
}));

/** Placed by hand so no twinkle lands under the copy column or the index core. */
const TWINKLES = [
  { x: "18%", y: "26%", duration: "3.2s", delay: "0s" },
  { x: "64%", y: "16%", duration: "4.6s", delay: "0.8s" },
  { x: "31%", y: "82%", duration: "3.8s", delay: "1.6s" },
  { x: "88%", y: "64%", duration: "5.1s", delay: "0.4s" },
  { x: "7%", y: "52%", duration: "4.2s", delay: "2.1s" },
  { x: "45%", y: "8%", duration: "3.5s", delay: "1.2s" },
  { x: "72%", y: "88%", duration: "4.9s", delay: "0.2s" },
  { x: "95%", y: "34%", duration: "3.6s", delay: "2.6s" },
  { x: "24%", y: "68%", duration: "4.4s", delay: "1.9s" },
  { x: "55%", y: "44%", duration: "5.4s", delay: "0.9s" },
];

/**
 * The day's picks fill the orbits. When the picks job has not run yet the most
 * liquid Shariah compliant names take the empty slots, so the system is never
 * half built on a quiet morning.
 */
function buildSatellites(picks: Pick[], quotes: Quote[]): Satellite[] {
  const changeBySymbol = new Map(quotes.map((quote) => [quote.symbol, quote.change_pct]));
  const taken = new Set<string>();
  const satellites: Satellite[] = [];

  const add = (symbol: string) => {
    if (!symbol || taken.has(symbol) || satellites.length >= SATELLITE_SLOTS) return;
    taken.add(symbol);
    satellites.push({ symbol, changePct: changeBySymbol.get(symbol) ?? null });
  };

  for (const pick of picks) add(pick.symbol);
  for (const quote of quotes) if (quote.is_kmi) add(quote.symbol);

  return satellites;
}

export default function Hero({
  scorecard,
  halalCount,
  index,
  picks,
  quotes,
}: {
  scorecard: Scorecard;
  halalCount: number;
  index: IndexSnapshot | null;
  picks: Pick[];
  quotes: Quote[];
}) {
  const hasRecord = scorecard.total >= 10;
  const satellites = buildSatellites(picks, quotes);

  return (
    <section className="relative overflow-hidden">
      <ParallaxStage className="hero-stage">
        <div className="hero-stars hero-stars-far" aria-hidden />
        <div className="hero-stars hero-stars-mid" aria-hidden />
        <div className="hero-stars hero-stars-near" aria-hidden />

        {TWINKLES.map((star) => (
          <span
            key={`${star.x}-${star.y}`}
            className="hero-twinkle"
            aria-hidden
            style={
              {
                "--x": star.x,
                "--y": star.y,
                "--twinkle-duration": star.duration,
                "--twinkle-delay": star.delay,
              } as CSSProperties
            }
          />
        ))}

        <div className="hero-inner">
          <div className="hero-copy">
            <span className="badge badge-on-dark mb-5">
              <ShieldCheck className="h-3 w-3" aria-hidden />
              Screened against the KMI All Shares Islamic Index
            </span>

            <h1 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
              Halal stock research for the
              <span className="text-emerald-400"> Pakistan Stock Exchange</span>
            </h1>

            <p className="mt-5 max-w-md text-base leading-relaxed text-slate-300">
              Audit your portfolio, analyse any listed company, and read AI picks whose Shariah
              status comes from the exchange itself, not from a chatbot&apos;s guess. Free, and no
              account.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="#audit"
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-base font-semibold text-white transition hover:bg-emerald-600"
              >
                <Zap className="h-4 w-4" aria-hidden />
                Audit my portfolio
              </Link>
              <Link
                href="#picks"
                className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-6 py-3 text-base font-semibold text-white transition hover:bg-white/10"
              >
                See today&apos;s halal picks
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>

            <dl className="tabular mt-7 flex flex-wrap items-center gap-y-2 text-sm text-slate-400">
              <div className="pr-5">
                <dt className="sr-only">Halal stocks</dt>
                <dd>
                  <span className="font-bold text-white">{halalCount || "—"}</span> halal stocks
                </dd>
              </div>
              <div className="border-l border-white/10 px-5">
                <dt className="sr-only">Picks tracked</dt>
                <dd>
                  <span className="font-bold text-white">{scorecard.total || "—"}</span> picks
                  tracked
                </dd>
              </div>
              <div className="border-l border-white/10 pl-5">
                <dt className="sr-only">Currently in profit</dt>
                <dd>
                  <span className="font-bold text-emerald-400">
                    {hasRecord ? `${scorecard.hit_rate}%` : "—"}
                  </span>{" "}
                  in profit
                </dd>
              </div>
            </dl>

            <p className="mt-4 flex items-center gap-2 text-sm text-slate-400">
              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              No login, no fees. Your holdings are never written to disk.
            </p>
          </div>

          <div className="hero-scene">
            <div className="hero-system">
              {ORBIT_RINGS.map((orbit) => {
                const riders = satellites.slice(
                  orbit.offset,
                  orbit.offset + orbit.angles.length,
                );

                return (
                  <div
                    key={orbit.radius}
                    className={orbit.reverse ? "orbit orbit-reverse" : "orbit"}
                    style={{ "--r": `${orbit.radius}px`, "--dur": orbit.duration } as CSSProperties}
                  >
                    <div className="orbit-plane">
                      <div className="orbit-path" aria-hidden />
                      <div className="orbit-spin">
                        {orbit.angles.map((angle, slot) => {
                          const rider = riders[slot];
                          return (
                            <div
                              key={angle}
                              className="orbit-node"
                              style={{ "--a": `${angle}deg` } as CSSProperties}
                            >
                              <span className="orbit-moon" aria-hidden />
                              {rider ? (
                                <div className="orbit-node-level">
                                  <div className="orbit-node-unspin">
                                    <div className="orbit-node-face">
                                      <Link
                                        href={`/stock/${rider.symbol}`}
                                        className="orbit-chip focus-ring"
                                      >
                                        {rider.symbol}
                                        {rider.changePct === null ? null : (
                                          <span
                                            className={
                                              rider.changePct < 0
                                                ? "orbit-chip-change orbit-chip-down"
                                                : "orbit-chip-change orbit-chip-up"
                                            }
                                          >
                                            {rider.changePct < 0 ? "−" : "+"}
                                            {Math.abs(rider.changePct).toFixed(1)}%
                                          </span>
                                        )}
                                      </Link>
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}

              <div
                className="orbit"
                aria-hidden
                style={
                  {
                    "--r": `${INNER_ORBIT.radius}px`,
                    "--dur": INNER_ORBIT.duration,
                  } as CSSProperties
                }
              >
                <div className="orbit-plane">
                  <div className="orbit-path" />
                  <div className="orbit-spin">
                    {INNER_ORBIT.angles.map((angle) => (
                      <div
                        key={angle}
                        className="orbit-node"
                        style={{ "--a": `${angle}deg` } as CSSProperties}
                      >
                        <span className="orbit-moon" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <span className="orbit-pulse" aria-hidden />
              <span className="orbit-pulse orbit-pulse-late" aria-hidden />

              <div className="orbit-core">
                <div>
                  <p className="orbit-core-name">{index?.name ?? "KSE-100"}</p>
                  <p className="orbit-core-value tabular">
                    {index ? Math.round(index.value).toLocaleString("en-PK") : "—"}
                  </p>
                  {index ? (
                    <p
                      className={
                        index.change_pct < 0
                          ? "orbit-core-change orbit-chip-down"
                          : "orbit-core-change orbit-chip-up"
                      }
                    >
                      {index.change_pct < 0 ? "▼" : "▲"} {Math.abs(index.change_pct).toFixed(2)}%
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </ParallaxStage>

      <nav className="hero-rail" aria-label="Halal picks by sector">
        <Link href="/picks" className="hero-rail-link hero-rail-link-active focus-ring">
          <span className="hero-rail-dot" aria-hidden />
          All picks
        </Link>
        {PICK_SECTORS.map((sector) => (
          <Link
            key={sector.slug}
            href={`/picks/${sector.slug}`}
            className="hero-rail-link focus-ring"
          >
            {sector.name}
          </Link>
        ))}
      </nav>
    </section>
  );
}
