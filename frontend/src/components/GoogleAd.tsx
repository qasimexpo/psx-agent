"use client";

import { useEffect, useRef, useState } from "react";
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
  const adRef = useRef<HTMLModElement | null>(null);
  const [isFilled, setIsFilled] = useState(false);
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

  useEffect(() => {
    const el = adRef.current;
    if (!el || !hasValidSlot || !ADS_CLIENT) return;

    const readStatus = () => {
      const status = el.getAttribute("data-ad-status");
      if (status === "filled") {
        setIsFilled(true);
      } else if (status === "unfilled") {
        setIsFilled(false);
      }
    };

    readStatus();
    const observer = new MutationObserver(readStatus);
    observer.observe(el, {
      attributes: true,
      attributeFilter: ["data-ad-status"],
    });
    return () => observer.disconnect();
  }, [hasValidSlot, ADS_CLIENT]);

  if (!hasValidSlot || !ADS_CLIENT) {
    return null;
  }

  return (
    <div
      suppressHydrationWarning
      className={`${isFilled ? "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" : "hidden"} ${className}`}
    >
      <ins
        ref={adRef}
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

