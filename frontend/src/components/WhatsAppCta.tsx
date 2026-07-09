"use client";

import { MessageCircle } from "lucide-react";

type WhatsAppCtaProps = {
  className?: string;
};

export default function WhatsAppCta({ className = "" }: WhatsAppCtaProps) {
  return (
    <a
      href="#"
      className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 ${className}`.trim()}
      aria-label="Join our Free WhatsApp Community for Daily AI Alerts"
    >
      <MessageCircle className="h-4 w-4" />
      Join our Free WhatsApp Community for Daily AI Alerts
    </a>
  );
}
