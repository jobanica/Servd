"use client";

import { useEffect } from "react";

/** Fires the OS print dialog once on mount (for the HTML ticket fallback). */
export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, []);
  return null;
}
