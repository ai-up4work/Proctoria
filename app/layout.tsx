import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/context/SessionContext";


export const metadata: Metadata = {
  title: "PROCTORIA — AI Exam Monitor",
  description:
    "Live, on-device AI monitoring for secure interview and exam sessions.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}