import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import ThemeProvider from "@/components/ThemeProvider";

const notoSansKr = Noto_Sans_KR({
    subsets: ["latin"],
    weight: ["400", "500", "600", "700", "800"],
    display: "swap",
});

export const metadata: Metadata = {
    title: "Sangdam Note",
    icons: {
        icon: "/consultation-note-icon.svg",
        shortcut: "/consultation-note-icon.svg",
        apple: "/consultation-note-icon.svg",
    },
    description: "선생님을 위한 스마트한 상담 관리 시스템",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ko" suppressHydrationWarning>
            <body className={notoSansKr.className}>
                <ThemeProvider>{children}</ThemeProvider>
            </body>
        </html>
    );
}
