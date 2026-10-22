"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * The element's width, measured before the first paint and kept current.
 * Null until measured: the server cannot know it, so callers reserve the
 * space and draw once it arrives instead of flashing at a guessed width.
 */
export function useMeasuredWidth(min = 280) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = (value: number) => setWidth(Math.max(min, Math.round(value)));
    measure(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [min]);

  return [ref, width] as const;
}
