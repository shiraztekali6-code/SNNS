import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Statistics Navigator for Non-Statisticians",
  description:
    "Upload a data table, answer plain-language design questions, and get transparent statistical guidance with runnable MVP analyses.",
  robots: {
    index: true,
    follow: true
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
