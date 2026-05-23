'use client';

import { useEffect } from 'react';
import { runSystemAuditsAction } from '@/modules/notifications/lib/actions';

/**
 * Silent trigger for automated tasks.
 * Runs once per session/mount if needed.
 */
export function AutomationTrigger() {
    useEffect(() => {
        // We run this in the background without blocking the UI
        runSystemAuditsAction().catch(err => {
            console.error('Failed to trigger background audits:', err);
        });
    }, []);

    return null; // Invisible component
}
