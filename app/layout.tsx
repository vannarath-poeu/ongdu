import type { Metadata } from "next";
import { Outfit, JetBrains_Mono, Noto_Sans_Khmer } from "next/font/google";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n/context";

const khmer = Noto_Sans_Khmer({
  variable: "--font-khmer",
  subsets: ["khmer", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "ONGDU — ល្បែងបៀ 3 ជួរ",
  description: "លេង ONGDU៖ រៀបបៀ 9 សន្លឹកជា 3 ជួរ ទល់នឹង AI។ គាំទ្រភាសាខ្មែរ និង English។",
  keywords: ["card game", "poker", "chinese poker", "strategy game", "multiplayer"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="km">
      <body
        className={`${outfit.variable} ${jetbrainsMono.variable} ${khmer.variable} antialiased font-sans`}
      >
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
