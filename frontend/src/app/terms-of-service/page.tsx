import type { Metadata } from "next";
import {
  AlertTriangle,
  Bot,
  Clock,
  FileCheck,
  GraduationCap,
  RefreshCw,
  Scale,
  ScrollText,
  UserCheck,
} from "lucide-react";
import TrustPageShell from "@/components/TrustPageShell";

export const metadata: Metadata = {
  title: "Terms of Service — SmartSarmaya",
  description:
    "SmartSarmaya terms of service: educational use only, algorithmic estimates, user responsibility, and limitation of liability for PSX investors.",
  alternates: {
    canonical: "/terms-of-service",
  },
};

export default function TermsOfServicePage() {
  return (
    <TrustPageShell
      activePage="terms"
      title="Terms of Service"
      subtitle="Clear rules governing your use of SmartSarmaya's AI-powered educational platform."
      heroIcon={ScrollText}
      highlights={[
        {
          icon: GraduationCap,
          title: "Educational Tool Only",
          description:
            "Provided for informational and learning purposes — not personalized investment advice.",
        },
        {
          icon: Bot,
          title: "Algorithmic Estimates",
          description:
            "AI outputs are estimates based on market inputs, not guarantees of performance.",
        },
        {
          icon: UserCheck,
          title: "You Own Your Decisions",
          description:
            "You are solely responsible for trades, risk management, and regulatory compliance.",
        },
      ]}
      topCallout={{
        icon: AlertTriangle,
        variant: "warning",
        text: (
          <>
            <strong>SmartSarmaya is not a licensed broker or financial advisor.</strong> All
            content is for educational use only. Consult a licensed professional before
            investing.
          </>
        ),
      }}
      sections={[
        {
          icon: FileCheck,
          title: "Acceptance of Terms",
          content: (
            <p>
              By accessing or using SmartSarmaya, you agree to be bound by these Terms of
              Service. If you do not accept these terms, you must discontinue use of the
              platform.
            </p>
          ),
        },
        {
          icon: AlertTriangle,
          title: "Financial Disclaimer",
          variant: "warning",
          content: (
            <p>
              SmartSarmaya is an AI-powered informational tool and is provided for educational
              use only. SmartSarmaya is not a licensed broker, dealer, portfolio manager, or
              financial advisor, and does not provide personalized investment advice.
            </p>
          ),
        },
        {
          icon: Bot,
          title: "Algorithmic Estimates Only",
          content: (
            <p>
              Any AI-generated outputs, including buy or sell targets, risk signals, and
              scenario projections, are algorithmic estimates based on available market inputs.
              They are not guarantees of future performance or execution outcomes.
            </p>
          ),
        },
        {
          icon: Clock,
          title: "Data Timeliness and Sources",
          content: (
            <p>
              Market data is sourced from third-party providers including TradingView and PSX
              feeds. Data may be delayed, incomplete, or temporarily unavailable, including
              delays of 15 minutes or more. Users are responsible for independently verifying
              prices before placing trades.
            </p>
          ),
        },
        {
          icon: UserCheck,
          title: "User Responsibility",
          content: (
            <p>
              You are solely responsible for your investment decisions, trade execution, risk
              management, and regulatory compliance. Use of SmartSarmaya does not create an
              advisor-client, fiduciary, or brokerage relationship.
            </p>
          ),
        },
        {
          icon: Scale,
          title: "Limitation of Liability",
          variant: "warning",
          content: (
            <p>
              To the maximum extent permitted by law, SmartSarmaya and its operators bear no
              liability for direct or indirect financial losses, missed opportunities, or
              damages arising from use of the platform, reliance on AI outputs, or third-party
              data interruptions.
            </p>
          ),
        },
        {
          icon: RefreshCw,
          title: "Changes to Terms",
          content: (
            <p>
              We may revise these terms from time to time. Continued use of SmartSarmaya after
              updates are posted constitutes acceptance of the revised Terms of Service.
            </p>
          ),
        },
      ]}
    />
  );
}
