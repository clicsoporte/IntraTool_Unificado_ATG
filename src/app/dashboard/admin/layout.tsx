/**
 * @fileoverview Main layout for the administration section.
 * This component establishes a context provider for the page title, allowing
 * any child page within the admin section to dynamically set the header title.
 */
'use client';

import type { ReactNode } from "react";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { adminTools } from "@/modules/core/lib/data";
import { useAuthorization } from "@/modules/core/hooks/useAuthorization";

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
    const pathname = usePathname();
    const { hasPermission, isLoading } = useAuthorization();
    
    return (
        <div className="flex flex-col h-full">
            <div className="border-b">
                <div className="px-4 md:px-6 lg:px-8">
                     <nav className="hidden md:flex flex-wrap items-center gap-x-6 gap-y-2 py-4">
                        {!isLoading && adminTools
                            .filter(link => hasPermission(link.id))
                            .sort((a,b) => a.name.localeCompare(b.name))
                            .map(link => (
                                <Link 
                                    key={link.href}
                                    href={link.href}
                                    className={cn(
                                        "text-sm font-medium transition-colors hover:text-primary",
                                        pathname === link.href ? "text-primary" : "text-muted-foreground"
                                    )}
                                >
                                    {link.name}
                                </Link>
                            ))
                        }
                    </nav>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto">
                {children}
            </div>
        </div>
    );
}
