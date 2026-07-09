"use client";

import { useEffect, useRef } from "react";
import { getAdsenseClientId } from "@/lib/adsense";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type GoogleAdProps = {
  slot?: string;
  className?: string;
  format?: "auto" | "rectangle" | "horizontal" | "vertical";
  fullWidthResponsive?: boolean;
};

const ADS_CLIENT = getAdsenseClientId();
const PLACEHOLDER_SLOTS = new Set(["1234567890", "0000000000"]);

export default function GoogleAd({
  slot,
  className = "",
  format = "auto",
  fullWidthResponsive = true,
}: GoogleAdProps) {
  const pushedRef = useRef(false);
  const normalizedSlot = slot?.trim() ?? "";
  const hasValidSlot =
    normalizedSlot.length > 0 &&
    /^\d+$/.test(normalizedSlot) &&
    !PLACEHOLDER_SLOTS.has(normalizedSlot);

  useEffect(() => {
    if (!hasValidSlot || !ADS_CLIENT || pushedRef.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushedRef.current = true;
    } catch {
      // Ignore AdSense push errors in development/re-renders.
    }
  }, [hasValidSlot]);

  if (!hasValidSlot || !ADS_CLIENT) {
    return (
      <div
        className={`flex min-h-[90px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-100 px-4 text-xs font-medium uppercase tracking-wide text-slate-500 ${className}`}
      >
        Advertisement
      </div>
    );
  }

  return (
    <div
      suppressHydrationWarning
      className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      <ins
        suppressHydrationWarning
        className="adsbygoogle block"
        style={{ display: "block" }}
        data-ad-client={ADS_CLIENT}
        data-ad-slot={normalizedSlot}
        data-ad-format={format}
        data-full-width-responsive={fullWidthResponsive ? "true" : "false"}
      />
    </div>
  );
}

