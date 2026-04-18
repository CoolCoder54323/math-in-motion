import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Lexend } from "next/font/google";
import { Toaster } from "sonner";
import { Providers } from "./providers";
import "./globals.css";

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
  title: "Math In Motion",
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
        <Providers>{children}</Providers>
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
