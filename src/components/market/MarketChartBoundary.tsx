"use client";

import { Component, type ReactNode } from "react";

/**
 * Isolates a chart rendering failure from the rest of the event page.
 *
 * Without this, a canvas or WebGL failure inside Lightweight Charts propagates
 * to the route's `error.tsx` and replaces an otherwise-correct research page
 * with a full-page error — losing the release values, the reaction table and
 * the historical distribution because one figure could not draw.
 *
 * It also keeps the two failure modes distinct, which matters more than it
 * looks: "we hold no intraday history for this event" is a fact about the data
 * and is rendered by `MarketChartUnavailable`, whereas this is a fact about the
 * application. Presenting a rendering bug as a data limitation would quietly
 * teach the reader that coverage is worse than it is.
 *
 * A class component because React error boundaries have no hook equivalent.
 */
interface Props {
  children: ReactNode;
  fallback: ReactNode;
}

interface State {
  failed: boolean;
}

export class MarketChartBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    console.error("[MarketChart] rendering failed", error);
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
