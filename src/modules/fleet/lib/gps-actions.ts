"use server";

import { fetchNavixyLiveTelemetry, NavixyTrackerState } from '@/modules/fleet/lib/gps-service';
import { getDeliverySettings } from '@/modules/operations/lib/actions';

export async function getLiveTelemetryAction(): Promise<{
    telemetry: NavixyTrackerState[];
    settings: Record<string, string>;
}> {
    try {
        const [telemetry, settings] = await Promise.all([
            fetchNavixyLiveTelemetry(),
            getDeliverySettings()
        ]);
        return JSON.parse(JSON.stringify({ telemetry, settings }));
    } catch (e: any) {
        console.error('Error fetching live telemetry action:', e);
        return { telemetry: [], settings: {} };
    }
}
