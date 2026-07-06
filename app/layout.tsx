import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "案件申請受付",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  // iPhone Safari のWeb Pushは「ホーム画面に追加」したPWAでのみ動作する
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "申請管理",
  },
  icons: {
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
