"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Points the layout skip link at the page's own <main> (after Header),
 * without wrapping the tree in a second landmark.
 */
export function AssignMainSkipTarget() {
  const pathname = usePathname();

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    main.id = "main";
    main.tabIndex = -1;
  }, [pathname]);

  return null;
}
