import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 교육 캔버스",
  description: "AI 교육 시간에 수강생이 아이디어를 함께 공유하고 발전시키는 실시간 캔버스"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
