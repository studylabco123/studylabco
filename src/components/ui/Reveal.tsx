"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";

type RevealProps = {
  children: ReactNode;
  as?: "div" | "section" | "li" | "p";
  /** Stagger delay in milliseconds. */
  delay?: number;
  className?: string;
};

/**
 * Fades and slides content in the first time it scrolls into view. The hidden
 * starting state lives in globals.css and only applies when the user has not
 * asked for reduced motion and scripts are running.
 */
export function Reveal({ children, as: Tag = "div", delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      el.setAttribute("data-revealed", "");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-revealed", "");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const style = delay ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined;

  return (
    <Tag ref={ref as RefObject<never>} data-reveal="" className={className} style={style}>
      {children}
    </Tag>
  );
}
