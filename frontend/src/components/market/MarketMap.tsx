import Link from "next/link";

import type { MapTile } from "@/lib/db";
import { inset, treemap, type Tile } from "@/lib/treemap";

/**
 * The KSE-100 as a sector-grouped heat map, rendered on the server into plain
 * SVG: no client JavaScript, so it costs nothing to load and search engines
 * read it.
 *
 * Two levels. Sectors are laid out by their share of the day's value traded,
 * then each sector's companies are laid out inside its rectangle by the same
 * measure. One metric at both levels, so a tile twice the size of another
 * means exactly one thing: twice the money went through it.
 *
 * Colour is the day's move, on a fixed scale rather than one that adapts to
 * the day. A fixed scale means today's green can be compared with yesterday's;
 * an adaptive one would paint a flat session as dramatically as a crash.
 *
 * Two maps are laid out, not one. A hundred tiles across a phone gives each
 * about forty square pixels, which cannot hold a ticker, so small screens get
 * a taller map of the most traded names and the table below carries the rest.
 * The layout is a pure function of a rectangle, so computing it twice costs
 * nothing worth measuring.
 */

const GAP = 3;
const SECTOR_LABEL_H = 22;

/** Above this share of the day, a sector is worth its own labelled block. */
const MIN_SECTOR_SHARE = 0.012;

const PHONE_TILES = 30;

type SectorGroup = { code: string; name: string; value: number; tiles: MapTile[] };

/**
 * Emerald for up, rose for down, slate for unchanged, saturating at ±5%.
 * Daily limits on the PSX are ±10%, but most sessions live inside ±3%, so
 * ±5% is where the scale has to top out to show any variation at all.
 */
function fill(changePct: number): string {
  if (changePct === 0) return "#94a3b8";
  const strength = Math.min(Math.abs(changePct) / 5, 1);
  const step = strength < 0.25 ? 0 : strength < 0.5 ? 1 : strength < 0.8 ? 2 : 3;
  return changePct > 0
    ? ["#34d399", "#10b981", "#059669", "#047857"][step]
    : ["#fda4af", "#fb7185", "#e11d48", "#be123c"][step];
}

function money(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)} bn`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)} mn`;
  return value.toFixed(0);
}

function truncate(value: string, chars: number): string {
  if (chars <= 1) return "";
  return value.length <= chars ? value : value.slice(0, Math.max(1, chars - 1)) + "…";
}

function group(tiles: MapTile[]): SectorGroup[] {
  const byCode = new Map<string, SectorGroup>();
  for (const tile of tiles) {
    const key = tile.sector_code || tile.sector_name;
    const existing = byCode.get(key);
    if (existing) {
      existing.value += tile.value_traded;
      existing.tiles.push(tile);
    } else {
      byCode.set(key, { code: key, name: tile.sector_name, value: tile.value_traded, tiles: [tile] });
    }
  }

  // Sectors too small to label would be unreadable slivers; pooling them keeps
  // the areas honest without pretending the text would fit.
  const all = [...byCode.values()];
  const total = all.reduce((sum, sector) => sum + sector.value, 0) || 1;
  const big = all.filter((sector) => sector.value / total >= MIN_SECTOR_SHARE);
  const small = all.filter((sector) => sector.value / total < MIN_SECTOR_SHARE);
  if (small.length > 1) {
    big.push({
      code: "__other",
      name: `${small.length} smaller sectors`,
      value: small.reduce((sum, sector) => sum + sector.value, 0),
      tiles: small.flatMap((sector) => sector.tiles),
    });
  } else {
    big.push(...small);
  }
  return big.sort((a, b) => b.value - a.value);
}

function MapSvg({
  tiles,
  width,
  height,
  className,
  description,
}: {
  tiles: MapTile[];
  width: number;
  height: number;
  className: string;
  description: string;
}) {
  const sectors = group(tiles);
  const sectorRects = treemap(
    sectors.map((sector) => ({ value: sector.value, item: sector })),
    { x: 0, y: 0, w: width, h: height },
  );

  const companies: Tile<MapTile>[] = [];
  for (const block of sectorRects) {
    const inner = inset({ x: block.x, y: block.y, w: block.w, h: block.h }, GAP, SECTOR_LABEL_H);
    companies.push(
      ...treemap(
        block.item.tiles.map((tile) => ({ value: tile.value_traded, item: tile })),
        inner,
      ),
    );
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 bg-slate-50 ${className}`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full"
        role="img"
        aria-label={description}
      >
        {sectorRects.map((block) => (
          <g key={block.item.code}>
            <rect
              x={block.x + 1}
              y={block.y + 1}
              width={Math.max(0, block.w - 2)}
              height={Math.max(0, block.h - 2)}
              fill="#0b132b"
              rx={6}
            />
            {block.w > 96 ? (
              <text
                x={block.x + GAP + 4}
                y={block.y + 15}
                fill="#cbd5e1"
                fontSize={11}
                fontWeight={700}
              >
                {truncate(block.item.name.toUpperCase(), Math.floor((block.w - 18) / 7.1))}
              </text>
            ) : null}
          </g>
        ))}

        {companies.map((rect) => {
          const tile = rect.item;
          const showSymbol = rect.w > 34 && rect.h > 18;
          const showChange = rect.w > 44 && rect.h > 32;
          const size = Math.max(8, Math.min(15, rect.w / 5.2, rect.h / 2.6));
          return (
            <g key={tile.symbol}>
              <rect
                x={rect.x}
                y={rect.y}
                width={Math.max(0, rect.w - 1)}
                height={Math.max(0, rect.h - 1)}
                fill={fill(tile.change_pct)}
                rx={3}
              />
              {showSymbol ? (
                <text
                  x={rect.x + rect.w / 2}
                  y={rect.y + rect.h / 2 + (showChange ? -2 : 4)}
                  textAnchor="middle"
                  fill="#0b132b"
                  fontSize={size}
                  fontWeight={700}
                >
                  {truncate(tile.symbol, Math.floor(rect.w / (size * 0.62)))}
                </text>
              ) : null}
              {showChange ? (
                <text
                  x={rect.x + rect.w / 2}
                  y={rect.y + rect.h / 2 + size - 1}
                  textAnchor="middle"
                  fill="#0b132b"
                  fontSize={Math.max(8, size - 3)}
                >
                  {tile.change_pct > 0 ? "+" : ""}
                  {tile.change_pct.toFixed(2)}%
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function MarketMap({ tiles }: { tiles: MapTile[] }) {
  if (tiles.length === 0) return null;

  const byValue = [...tiles].sort((a, b) => b.value_traded - a.value_traded);
  const phone = byValue.slice(0, PHONE_TILES);

  return (
    <figure className="m-0">
      <MapSvg
        tiles={tiles}
        width={1200}
        height={720}
        className="hidden sm:block"
        description={`KSE-100 market map: ${tiles.length} companies grouped by sector, sized by the day's value traded and coloured by today's move. The table below this map has the same numbers.`}
      />
      <MapSvg
        tiles={phone}
        width={640}
        height={860}
        className="sm:hidden"
        description={`The ${phone.length} most traded KSE-100 companies today, grouped by sector, sized by value traded and coloured by today's move. The table below has all ${tiles.length}.`}
      />

      <figcaption className="mt-3 space-y-2 text-xs text-slate-500">
        <p>
          Each tile is one company, sized by the day&apos;s value traded and coloured by its move,
          grouped by sector.
          <span className="sm:hidden"> On a small screen the map shows the {PHONE_TILES} most
            traded; the table below has all {tiles.length}.</span>
        </p>
        <p className="flex flex-wrap items-center gap-1.5">
          <Swatch colour="#be123c" />
          <Swatch colour="#e11d48" />
          <Swatch colour="#fb7185" />
          <Swatch colour="#fda4af" />
          <span className="px-1">−5% to +5%</span>
          <Swatch colour="#34d399" />
          <Swatch colour="#10b981" />
          <Swatch colour="#059669" />
          <Swatch colour="#047857" />
        </p>
      </figcaption>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-emerald-700 hover:text-emerald-800">
          Show all {tiles.length} as a table
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[540px] text-left text-sm">
            <caption className="sr-only">
              KSE-100 constituents with today&apos;s move, and the day&apos;s approximate value traded
            </caption>
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="py-2 pr-3 font-semibold">Symbol</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Sector</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Price</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Change</th>
                <th scope="col" className="py-2 text-right font-semibold">Value traded</th>
              </tr>
            </thead>
            <tbody>
              {byValue.map((tile) => (
                <tr key={tile.symbol} className="border-b border-slate-100">
                  <th scope="row" className="py-2 pr-3 font-semibold text-navy-900">
                    <Link href={`/stock/${tile.symbol}`} className="hover:text-emerald-700">
                      {tile.symbol}
                    </Link>
                  </th>
                  <td className="py-2 pr-3 text-slate-600">{tile.sector_name}</td>
                  <td className="tabular py-2 pr-3 text-right text-navy-900">
                    {tile.price.toFixed(2)}
                  </td>
                  <td
                    className={`tabular py-2 pr-3 text-right font-semibold ${
                      tile.change_pct > 0
                        ? "text-emerald-700"
                        : tile.change_pct < 0
                          ? "text-rose-600"
                          : "text-slate-500"
                    }`}
                  >
                    {tile.change_pct > 0 ? "+" : ""}
                    {tile.change_pct.toFixed(2)}%
                  </td>
                  <td className="tabular py-2 text-right text-slate-600">
                    Rs {money(tile.value_traded)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function Swatch({ colour }: { colour: string }) {
  return (
    <span
      className="inline-block h-3 w-3 rounded-sm"
      style={{ backgroundColor: colour }}
      aria-hidden
    />
  );
}
