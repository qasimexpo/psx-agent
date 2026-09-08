"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Writes the pointer position onto the hero as --px / --py, each in the range
 * -0.5 to 0.5. Every bit of the movement itself is CSS, so the whole parallax
 * costs a few lines of JavaScript rather than an animation library, and the
 * orbit markup inside stays a server component.
 */
export default function ParallaxStage({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stage = ref.current;
    if (!stage) return;

    // Readers who asked for less motion get the resting layout and no listener.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;

    const write = (x: number, y: number) => {
      stage.style.setProperty("--px", x.toFixed(4));
      stage.style.setProperty("--py", y.toFixed(4));
    };

    const onMove = (event: PointerEvent) => {
      // A touch drag should scroll the page, not tilt the starfield.
      if (event.pointerType === "touch" || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = stage.getBoundingClientRect();
        if (!box.width || !box.height) return;
        write(
          (event.clientX - box.left) / box.width - 0.5,
          (event.clientY - box.top) / box.height - 0.5,
        );
      });
    };

    const onLeave = () => {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      write(0, 0);
    };

    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);

    return () => {
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
