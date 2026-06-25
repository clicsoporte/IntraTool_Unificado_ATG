'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DeliveriesSettingsRedirect() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/dashboard/admin/operations');
    }, [router]);

    return (
        <div className="p-6 text-center text-muted-foreground font-semibold">
            Redireccionando a la configuración administrativa...
        </div>
    );
}
