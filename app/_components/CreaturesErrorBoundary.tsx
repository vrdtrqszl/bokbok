"use client";

import { Component, type ReactNode } from "react";

// Minimal class-based error boundary wrapped around the 3D ecosystem
// scene. r3f's useLoader throws into Suspense on a missing texture (e.g.
// stored creatures with imagePaths from a previous catalog), and without a
// boundary the entire React tree unmounts and shows the Next.js generic
// "Application error" overlay. With this wrapper, the 3D scene fails
// quietly (renders nothing) while the rest of the page stays usable.
export default class CreaturesErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error("[bokbok] ecosystem render failed:", error);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
