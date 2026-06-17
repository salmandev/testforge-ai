import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { QueryProvider } from "@/components/query-provider";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { ThemeProvider } from "next-themes";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TestForge AI Dashboard",
  description: "AI-powered test automation dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <QueryProvider>
            <AuthProvider>
              <div className="flex h-screen">
                <Sidebar />
                <div className="flex flex-1 flex-col overflow-hidden">
                  <TopBar />
                  <main className="flex-1 overflow-auto p-6">{children}</main>
                </div>
              </div>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
