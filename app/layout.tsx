import type { Metadata, Viewport } from "next";
import "./globals.css";
import ViewportFit from "./_components/ViewportFit";
import SeedBootstrap from "./_components/SeedBootstrap";

export const metadata: Metadata = {
  title: "BokBok",
  description: "BokBok creature diary",
};

// Allow the viewport to scale freely on mobile (we handle scaling in JS).
// Without this, mobile browsers add a default 980px viewport that breaks
// the resize math.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SeedBootstrap />
        <ViewportFit>{children}</ViewportFit>
      </body>
    </html>
  );
}
