import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlowCAD 3D — 스마트 배관·덕트 자동 생성",
  description: "설계 데이터를 1:1 실척 3D 모델 및 ISO 도면으로 자동 생성",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="h-screen overflow-hidden">{children}</body>
    </html>
  );
}
