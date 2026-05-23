/**
 * @fileoverview Main layout for the authenticated dashboard section of the application.
 * It handles session verification, ensuring only logged-in users can access this area.
 * It also provides the main structure including the sidebar, header, and content area,
 * and wraps the content in a PageTitleProvider for dynamic header titles.
 */
'use client';

import { AppSidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { usePageTitle, PageTitleProvider } from "@/modules/core/hooks/usePageTitle";
import { useAuth, REDIRECT_URL_KEY } from "@/modules/core/hooks/useAuth";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { AutomationTrigger } from "@/components/automation-trigger";

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { title } = usePageTitle();
  return (
    <>
      <Header title={title} />
      <div className="flex-1 overflow-auto">{children}</div>
    </>
  );
}

/**
 * Main layout component for the dashboard.
 * It wraps pages in providers, verifies user authentication, and sets up the
 * main UI structure.
 * @param {object} props - Component props.
 * @param {React.ReactNode} props.children - The page content to render inside the layout.
 * @returns {JSX.Element} The dashboard layout.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthReady } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthReady && !user) {
      const fullPath = window.location.pathname + window.location.search;
      if (fullPath && fullPath !== "/" && fullPath !== "/?") {
        sessionStorage.setItem(REDIRECT_URL_KEY, fullPath);
      }
      router.replace('/');
    } else if (isAuthReady && user?.forcePasswordChange) {
      // If user must change password, force them to profile page unless they are already there
      const currentPath = window.location.pathname;
      if (currentPath !== '/dashboard/profile') {
        router.replace('/dashboard/profile?forceChange=true');
      }
    }
  }, [isAuthReady, user, router]);

  if (!isAuthReady) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!user) {
      return null;
  }

  return (
      <PageTitleProvider initialTitle="Panel">
        <SidebarProvider>
          <div className="flex h-screen bg-muted/40">
            <AppSidebar />
            <SidebarInset className="flex flex-1 flex-col overflow-hidden">
                <DashboardContent>{children}</DashboardContent>
            </SidebarInset>
          </div>
          <AutomationTrigger />
        </SidebarProvider>
      </PageTitleProvider>
  );
}
