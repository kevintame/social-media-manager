import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Social Content Manager", description: "Local-first social content workflow" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
