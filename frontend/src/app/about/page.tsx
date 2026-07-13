import type { Metadata } from "next";
import Link from "next/link";
import {
  Ban,
  BookOpen,
  Clock,
  Cpu,
  GraduationCap,
  Info,
  Scale,
  Shield,
  Target,
  TrendingUp,
} from "lucide-react";
import TrustPageShell from "@/components/TrustPageShell";

export const metadata: Metadata = {
  title: "About — SmartSarmaya",
  description:
    "Learn about SmartSarmaya's mission to democratize PSX data with AI-powered educational portfolio analysis for Pakistan Stock Exchange investors.",
  alternates: {
    canonical: "/about",
  },
};

export default function AboutPage() {
  return (
    <TrustPageShell
      activePage="about"
      title="About SmartSarmaya"
      subtitle="Democratizing Pakistan Stock Exchange data with AI-powered educational tools."
      heroIcon={Info}
      highlights={[
        {
          icon: TrendingUp,
          title: "Democratizing PSX Data",
          description:
            "Institutional-grade portfolio context made accessible to everyday Pakistani investors.",
        },
        {
          icon: Shield,
          title: "Stateless & Private",
          description:
            "No accounts, no stored portfolios — your data is processed and discarded each session.",
        },
        {
          icon: GraduationCap,
          title: "Educational Only",
          description:
            "AI insights for learning purposes — not licensed financial or investment advice.",
        },
      ]}
      topCallout={{
        icon: Shield,
        text: (
          <>
            <strong>Built for Pakistani investors.</strong> SmartSarmaya is not a licensed
            broker, dealer, or financial advisor.
          </>
        ),
      }}
      sections={[
        {
          icon: Target,
          title: "Our Mission",
          content: (
            <p>
              SmartSarmaya exists to democratize Pakistan Stock Exchange (PSX) data with AI.
              We believe everyday Pakistani investors deserve access to the same kind of
              portfolio analysis and market context that was once limited to professional
              desks — presented clearly, for educational purposes, without requiring a paid
              brokerage research subscription.
            </p>
          ),
        },
        {
          icon: Cpu,
          title: "What SmartSarmaya Is",
          content: (
            <p>
              SmartSarmaya is a stateless, session-based AI analysis tool for PSX and
              KSE-100 portfolios. You submit your holdings, receive an AI-generated report,
              and your data is discarded after the session. There are no accounts, no stored
              portfolios, and no login required.
            </p>
          ),
        },
        {
          icon: Ban,
          title: "What SmartSarmaya Is Not",
          variant: "warning",
          content: (
            <p>
              SmartSarmaya is not a licensed broker, dealer, portfolio manager, or financial
              advisor. We do not execute trades, manage assets, or provide personalized
              investment advice. All AI outputs — including risk signals, price targets, and
              scenario projections — are algorithmic estimates based on available market
              inputs, not guarantees of future performance.
            </p>
          ),
        },
        {
          icon: Clock,
          title: "Data & Timeliness",
          content: (
            <p>
              Market data is sourced from third-party providers including TradingView and PSX
              feeds. Data may be delayed, incomplete, or temporarily unavailable, including
              delays of 15 minutes or more. Always verify prices independently before placing
              any trade.
            </p>
          ),
        },
        {
          icon: Scale,
          title: "Non-Liability Disclaimer",
          variant: "warning",
          content: (
            <p>
              You are solely responsible for your investment decisions, trade execution, risk
              management, and regulatory compliance. Use of SmartSarmaya does not create an
              advisor-client, fiduciary, or brokerage relationship. To the maximum extent
              permitted by law, SmartSarmaya and its operators bear no liability for direct or
              indirect financial losses, missed opportunities, or damages arising from use of
              the platform, reliance on AI outputs, or third-party data interruptions.
            </p>
          ),
        },
        {
          icon: BookOpen,
          title: "Learn More",
          content: (
            <p>
              For full details on how we handle your data and the terms governing use of this
              platform, please review our{" "}
              <Link href="/privacy-policy" className="text-emerald-600 hover:text-emerald-700">
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link href="/terms-of-service" className="text-emerald-600 hover:text-emerald-700">
                Terms of Service
              </Link>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
