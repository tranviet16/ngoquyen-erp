import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "ERP Ngô Quyền",
  description: "Hệ thống quản lý ERP nội bộ",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const c = await cookies();
  const theme = c.get("nq-erp-theme")?.value === "dark" ? "dark" : "";
  return (
    <html
      lang="vi"
      className={`h-full antialiased ${theme}`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-foreground">
        {children}
        <Toaster richColors position="top-right" />
        <div id="portal" />
      </body>
    </html>
  );
}
