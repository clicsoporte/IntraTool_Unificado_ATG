
import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/modules/core/hooks/useAuth";
import { LoadingProvider } from "@/modules/core/hooks/useLoading";

export const metadata: Metadata = {
  title: "Clic-Tools",
  description: "Your integrated tools dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="font-sans">
        <AuthProvider>
          <LoadingProvider>
            {children}
          </LoadingProvider>
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
