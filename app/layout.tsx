import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Lexend } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

/*
 * Typography choices for Math Animation Studio:
 *  - Lexend: research-backed typeface designed to improve reading proficiency
 *    (a perfect fit for an education product), used for all body copy.
 *  - Fraunces: expressive variable serif with chunky, playful optical sizes
 *    — feels confident and warm at display scales, never generic.
 */
const lexend = Lexend({
  variable: "--font-lexend",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Math Animation Studio",
  description:
    "Turn any worksheet or concept into a fun, visual explanation. Built for elementary and middle school teachers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${lexend.variable} ${fraunces.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-studio-gradient flex min-h-full flex-col">
        {children}
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{
            style: {
              fontFamily: "var(--font-fraunces)",
            },
          }}
        />
      </body>
    </html>
  );
}
