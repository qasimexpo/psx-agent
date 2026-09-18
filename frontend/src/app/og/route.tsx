import { ImageResponse } from "next/og";
import { getBriefByDate, getStock, getTopPicks } from "@/lib/db";
import { sectorBySlug } from "@/lib/sectors";
import { SITE_NAME } from "@/lib/site";

/**
 * Social share cards, rendered on demand.
 *
 * One route rather than per-page `opengraph-image.tsx` files, because the URL
 * has to be stable and guessable: Instagram's API cannot be handed an image,
 * only a public URL to fetch, and Next appends a content hash to the file
 * convention's path. `/og?type=stock&symbol=PSO` is the same URL forever, so
 * the pipeline can post it without asking the site what the image is called.
 *
 * This lives at /og rather than /api/og because robots.txt disallows /api and
 * some social crawlers honour that before fetching a card.
 */

export const revalidate = 900;

const WIDTH = 1200;
const HEIGHT = 630;

const NAVY = "#0b132b";
const NAVY_SOFT = "#16203d";
const EMERALD = "#34d399";
const ROSE = "#fb7185";
const SLATE = "#94a3b8";

function money(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function percent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

/** The frame every card shares, so all of them read as the same brand. */
function Frame({
  eyebrow,
  children,
  footer,
}: {
  eyebrow: string;
  children: React.ReactNode;
  footer: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: NAVY,
        backgroundImage: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_SOFT} 100%)`,
        padding: "56px 64px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            width: 14,
            height: 44,
            borderRadius: 7,
            backgroundColor: EMERALD,
            display: "flex",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: "#ffffff" }}>
            {SITE_NAME}
          </div>
          <div style={{ fontSize: 20, color: SLATE }}>{eyebrow}</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>{children}</div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 20,
          color: SLATE,
          borderTop: `1px solid ${NAVY_SOFT}`,
          paddingTop: 20,
        }}
      >
        <div style={{ display: "flex" }}>{footer}</div>
        <div style={{ display: "flex" }}>smartsarmaya.com</div>
      </div>
    </div>
  );
}

function Badge({ text, tone }: { text: string; tone: "halal" | "neutral" }) {
  const halal = tone === "halal";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        borderRadius: 999,
        padding: "8px 20px",
        fontSize: 22,
        fontWeight: 600,
        color: halal ? "#052e1b" : "#e2e8f0",
        backgroundColor: halal ? EMERALD : "#334155",
      }}
    >
      {text}
    </div>
  );
}

function card(node: React.ReactElement) {
  return new ImageResponse(node, {
    width: WIDTH,
    height: HEIGHT,
    headers: {
      // Cards change at most as often as the prices behind them. max-age
      // covers browsers; Vercel's edge only caches on s-maxage, and without
      // it every crawler fetch paid the full 2-3 s render.
      "cache-control":
        "public, no-transform, max-age=900, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

function fallbackCard() {
  return card(
    <Frame
      eyebrow="Halal AI research for the Pakistan Stock Exchange"
      footer="Free. No account. Not financial advice."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div
          style={{
            fontSize: 62,
            fontWeight: 800,
            color: "#ffffff",
            lineHeight: 1.1,
          }}
        >
          Halal stock picks, screened by the exchange
        </div>
        <div style={{ fontSize: 28, color: SLATE, display: "flex" }}>
          Every Shariah label comes from the KMI All Shares Islamic Index, not
          from a chatbot. Every pick is tracked publicly.
        </div>
      </div>
    </Frame>,
  );
}

async function stockCard(symbol: string) {
  const stock = await getStock(symbol);
  if (!stock) return fallbackCard();

  const up = stock.change_pct >= 0;
  return card(
    <Frame
      eyebrow={stock.sector_name || "Pakistan Stock Exchange"}
      footer="Live price, technicals and Shariah status"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ fontSize: 86, fontWeight: 800, color: "#ffffff" }}>
            {stock.symbol}
          </div>
          <Badge
            text={stock.is_kmi ? "Shariah compliant" : "Not KMI listed"}
            tone={stock.is_kmi ? "halal" : "neutral"}
          />
        </div>

        <div style={{ fontSize: 30, color: SLATE, display: "flex" }}>
          {stock.name.slice(0, 60)}
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 24 }}>
          <div style={{ fontSize: 72, fontWeight: 700, color: "#ffffff" }}>
            {money(stock.current_price)}
          </div>
          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              paddingBottom: 8,
              color: up ? EMERALD : ROSE,
            }}
          >
            {percent(stock.change_pct)}
          </div>
        </div>

        <div style={{ display: "flex", gap: 40, fontSize: 24, color: SLATE }}>
          <div style={{ display: "flex" }}>
            RSI {stock.rsi_14 === null ? "—" : stock.rsi_14}
          </div>
          <div style={{ display: "flex" }}>
            52w {money(stock.low_52w)} – {money(stock.high_52w)}
          </div>
        </div>
      </div>
    </Frame>,
  );
}

async function briefCard(day: string) {
  const brief = await getBriefByDate(day);
  if (!brief) return fallbackCard();

  const up = (brief.index_change_pct ?? 0) >= 0;
  return card(
    <Frame
      eyebrow={`Market brief · ${brief.brief_date}`}
      footer="Written twice each trading day"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            fontSize: 54,
            fontWeight: 800,
            color: "#ffffff",
            lineHeight: 1.15,
          }}
        >
          {brief.headline.slice(0, 120)}
        </div>
        {brief.index_value ? (
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ fontSize: 32, color: SLATE }}>KSE-100</div>
            <div style={{ fontSize: 44, fontWeight: 700, color: "#ffffff" }}>
              {brief.index_value.toLocaleString("en-PK", {
                maximumFractionDigits: 2,
              })}
            </div>
            <div
              style={{
                fontSize: 34,
                fontWeight: 700,
                color: up ? EMERALD : ROSE,
              }}
            >
              {percent(brief.index_change_pct)}
            </div>
          </div>
        ) : null}
      </div>
    </Frame>,
  );
}

async function picksCard(slug: string) {
  const sector = sectorBySlug(slug);
  if (!sector) return fallbackCard();

  const { picks } = await getTopPicks("daily", sector.name, 3);
  return card(
    <Frame
      eyebrow="Top halal picks"
      footer="Screened against the KMI All Shares Islamic Index"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 58, fontWeight: 800, color: "#ffffff" }}>
          {sector.title}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {picks.slice(0, 3).map((pick) => (
            <div
              key={pick.symbol}
              style={{ display: "flex", alignItems: "center", gap: 18 }}
            >
              <div
                style={{
                  fontSize: 34,
                  fontWeight: 700,
                  color: EMERALD,
                  width: 190,
                  display: "flex",
                }}
              >
                {pick.symbol}
              </div>
              <div style={{ fontSize: 30, color: "#e2e8f0", display: "flex" }}>
                {pick.current_price}
              </div>
            </div>
          ))}
          {picks.length === 0 ? (
            <div style={{ fontSize: 30, color: SLATE, display: "flex" }}>
              Ranked every trading morning.
            </div>
          ) : null}
        </div>
      </div>
    </Frame>,
  );
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const type = params.get("type") ?? "";

  try {
    if (type === "stock") {
      const symbol = (params.get("symbol") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (symbol) return await stockCard(symbol);
    }
    if (type === "brief") {
      const day = params.get("date") ?? "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return await briefCard(day);
    }
    if (type === "picks") {
      const slug = params.get("sector") ?? "";
      if (slug) return await picksCard(slug);
    }
  } catch {
    // A card is never worth failing a share for; fall through to the default.
  }

  return fallbackCard();
}
