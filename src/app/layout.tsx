import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

const notoThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "CRM โทรติดตามลูกค้า",
  description: "ระบบ CRM โทรติดตามลูกค้าขาดฝาก (เวอร์ชันตัวอย่าง)",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // ใส่ data-theme ก่อนเพนต์ (กันจอกระพริบตอนโหลด) — อ่านจาก localStorage
  const themeScript = `(function(){try{if(localStorage.getItem('theme')==='dark'){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}})();`;
  return (
    <html lang="th" suppressHydrationWarning>
      <body className={notoThai.className}>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
