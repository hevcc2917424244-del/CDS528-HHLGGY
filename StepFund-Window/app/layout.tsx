import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StepFund · Milestone Funding",
  description:
    "Fund meaningful projects, verify milestones, and release funds together. An educational testnet dApp.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
