import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "案件申請受付",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest?v=3",
  // iPhone Safari のWeb Pushは「ホーム画面に追加」したPWAでのみ動作する
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "申請管理",
  },
  // ?v=3 はキャッシュ破棄用(アイコン差し替え時は数値を上げる)
  icons: {
    icon: [
      { url: "/icons/favicon-32x32.png?v=3", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16x16.png?v=3", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico?v=3",
    // iOSのホーム画面アイコン(不透過・フルブリード)
    apple: "/icons/apple-touch-icon.png?v=3",
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
