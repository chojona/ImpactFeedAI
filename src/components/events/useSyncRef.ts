"use client";

import { useEffect, type MutableRefObject } from "react";

/** Keep a ref aligned with a render value without reading the ref during render. */
export function useSyncRef<T>(ref: MutableRefObject<T>, value: T): void {
  useEffect(() => {
    ref.current = value;
  }, [ref, value]);
}
