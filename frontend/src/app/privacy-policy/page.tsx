import type { Metadata } from "next";
import {
  Database,
  FileInput,
  Globe,
  Lock,
  RefreshCw,
  Shield,
  ShieldCheck,
  Trash2,
  UserX,
  Zap,
} from "lucide-react";
import TrustPageShell from "@/components/TrustPageShell";

export const metadata: Metadata = {
  title: "Privacy Policy — SmartSarmaya",
  description:
    "SmartSarmaya privacy policy: stateless design, no portfolio storage, session-only processing, and transparent data practices for PSX investors.",
  alternates: {
    canonical: "/privacy-policy",
  },
};

export default function PrivacyPolicyPage() {
  return (
    <TrustPageShell
      activePage="privacy"
      title="Privacy Policy"
      subtitle="How SmartSarmaya handles your data — transparent, minimal, and session-based."
      heroIcon={ShieldCheck}
      highlights={[
        {
          icon: UserX,
          title: "No Login Required",
          description:
            "No account registration, identity profiles, or authentication credentials collected.",
        },
        {
          icon: Database,
          title: "No Portfolio Storage",
          description:
            "We do not maintain a personal portfolio database or investor identity ledger.",
        },
        {
          icon: Zap,
          title: "Session-Only Processing",
          description:
            "Portfolio inputs are processed in memory and discarded after your report is generated.",
        },
      ]}
      topCallout={{
        icon: Shield,
        text: (
          <>
            <strong>Your portfolio is analyzed in memory and instantly discarded.</strong> We
            never store your financial holdings beyond the active session.
          </>
        ),
      }}
      sections={[
        {
          icon: Shield,
          title: "Stateless by Design",
          content: (
            <p>
              SmartSarmaya is a stateless application built for runtime analysis. We do not
              require account registration and we do not store user identity profiles,
              authentication credentials, or persistent portfolio records.
            </p>
          ),
        },
        {
          icon: FileInput,
          title: "Data We Process",
          content: (
            <p>
              When you submit portfolio inputs such as symbols, quantities, and buy prices,
              that information is processed in memory to generate AI insights. This processing
              is session-based and intended solely to return your requested report.
            </p>
          ),
        },
        {
          icon: Trash2,
          title: "No Permanent Portfolio Storage",
          content: (
            <p>
              Submitted portfolio data is discarded after analysis is completed. SmartSarmaya
              does not maintain a personal portfolio database, login history, or investor
              identity ledger for end users.
            </p>
          ),
        },
        {
          icon: Globe,
          title: "Third-Party Services",
          content: (
            <p>
              We rely on third-party market data and infrastructure providers to operate the
              platform. These providers may apply their own policies for service reliability,
              request handling, and telemetry. We recommend reviewing their privacy terms
              independently.
            </p>
          ),
        },
        {
          icon: Lock,
          title: "Security Practices",
          content: (
            <p>
              We use reasonable technical and operational safeguards to protect service traffic.
              However, no internet-based system is completely risk-free, and users should avoid
              submitting sensitive personal or account credentials to any analysis tool.
            </p>
          ),
        },
        {
          icon: RefreshCw,
          title: "Policy Updates",
          content: (
            <p>
              We may update this Privacy Policy to reflect legal, technical, or product changes.
              Updates become effective upon publication on this page, with the latest revision
              date shown above.
            </p>
          ),
        },
      ]}
    />
  );
}
