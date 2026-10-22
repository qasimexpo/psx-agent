import { RATINGS, summarise, technicalVotes, type TechnicalInputs } from "@/lib/technical";

/**
 * A semicircle gauge from Strong sell to Strong buy, with every vote listed
 * beside it so the reading is never a black box.
 *
 * Colours are the reference diverging pair, red and blue arms around a gray
 * midpoint: blue rather than green keeps the two arms apart for red-green
 * colour blindness, and the needle, the rating in words and the vote list
 * carry the reading without colour.
 */
const BANDS = ["#e34948", "#f2a3a2", "#d9d7d2", "#86b6ef", "#2a78d6"];

function polar(cx: number, cy: number, r: number, degrees: number): [number, number] {
  const radians = (degrees * Math.PI) / 180;
  return [cx + r * Math.cos(radians), cy - r * Math.sin(radians)];
}

function band(cx: number, cy: number, outer: number, inner: number, from: number, to: number): string {
  const [x1, y1] = polar(cx, cy, outer, from);
  const [x2, y2] = polar(cx, cy, outer, to);
  const [x3, y3] = polar(cx, cy, inner, to);
  const [x4, y4] = polar(cx, cy, inner, from);
  return `M${x1},${y1} A${outer},${outer} 0 0 1 ${x2},${y2} L${x3},${y3} A${inner},${inner} 0 0 0 ${x4},${y4} Z`;
}

export default function TechnicalSummary({ stock }: { stock: TechnicalInputs }) {
  const votes = technicalVotes(stock);
  const summary = summarise(votes);
  if (!summary) return null;

  const width = 240;
  const cx = width / 2;
  const cy = 120;
  const outer = 104;
  const inner = 80;
  const gap = 1.2; // degrees, about 2px at this radius
  const needleAngle = 180 - ((summary.score + 1) / 2) * 180;
  const [nx, ny] = polar(cx, cy, inner - 8, needleAngle);
  const up = votes.filter((v) => v.vote > 0).length;
  const down = votes.filter((v) => v.vote < 0).length;

  return (
    <section className="card mt-4 p-5 sm:p-6" aria-labelledby="tech-summary-title">
      <h2 id="tech-summary-title" className="text-base font-bold text-navy-900">
        Technical summary
      </h2>
      <div className="mt-4 flex flex-col items-center gap-6 md:flex-row md:items-start">
        <div className="shrink-0 text-center">
          <svg
            width={width}
            height={cy + 8}
            viewBox={`0 0 ${width} ${cy + 8}`}
            role="img"
            aria-label={`Technical summary: ${summary.rating}. ${up} indicators up, ${down} down, ${votes.length - up - down} neutral.`}
          >
            {RATINGS.map((rating, index) => {
              const from = 180 - index * 36 - (index ? gap / 2 : 0);
              const to = 180 - (index + 1) * 36 + (index < RATINGS.length - 1 ? gap / 2 : 0);
              return (
                <path
                  key={rating}
                  d={band(cx, cy, outer, inner, from, to)}
                  fill={BANDS[index]}
                  opacity={rating === summary.rating ? 1 : 0.45}
                />
              );
            })}
            <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#0b132b" strokeWidth={3} strokeLinecap="round" />
            <circle cx={cx} cy={cy} r={6} fill="#0b132b" stroke="#ffffff" strokeWidth={2} />
          </svg>
          <div className="-mt-1 flex justify-between px-1 text-[11px] text-slate-500" style={{ width }}>
            <span>Strong sell</span>
            <span>Strong buy</span>
          </div>
          <p className="mt-2 text-xl font-bold text-navy-900">{summary.rating}</p>
          <p className="text-xs text-slate-500">
            {up} up · {votes.length - up - down} neutral · {down} down
          </p>
        </div>

        <ul className="w-full min-w-0 divide-y divide-slate-100 text-sm">
          {votes.map((vote) => (
            <li key={vote.label} className="flex items-center gap-3 py-2">
              <span
                aria-hidden
                className={`w-4 text-center text-xs ${vote.vote > 0 ? "text-[#2a78d6]" : vote.vote < 0 ? "text-[#d03b3b]" : "text-slate-400"}`}
              >
                {vote.vote > 0 ? "▲" : vote.vote < 0 ? "▼" : "■"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-navy-900">{vote.label}</span>
                <span className="block text-xs text-slate-500">{vote.detail}</span>
              </span>
              <span className="text-xs font-semibold text-slate-600">
                {vote.vote > 0 ? "Buy" : vote.vote < 0 ? "Sell" : "Neutral"}
              </span>
            </li>
          ))}
          <li className="pt-3 text-xs leading-relaxed text-slate-500">
            A mechanical reading of moving averages, RSI and momentum from daily closes. It describes
            the chart, not the company, and is not advice to buy or sell.
          </li>
        </ul>
      </div>
    </section>
  );
}
