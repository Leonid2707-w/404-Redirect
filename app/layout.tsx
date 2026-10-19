import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "404 Team — партнёрская программа для веб-мастеров",
  description: "Холдинг по офферам и трафику. 15+ офферов, CPA до $150, гибкие выплаты от 15 FTD.",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
