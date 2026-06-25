export function getTvGridCols(count: number): string {
    if (count === 0) return 'grid-cols-1';
    if (count === 1) return 'grid-cols-1 max-w-3xl mx-auto';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2 max-w-5xl mx-auto';
    return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
}

export function formatTimeElapsed(isoString: string | null | undefined): string {
    if (!isoString) return '';
    try {
        const past = new Date(isoString).getTime();
        const now = new Date().getTime();
        const diffMs = now - past;
        if (isNaN(past) || diffMs < 0) return '';

        const diffMins = Math.floor(diffMs / (1000 * 60));
        if (diffMins < 1) return 'hace unos segs';
        if (diffMins < 60) return `hace ${diffMins}m`;

        const hrs = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        return mins > 0 ? `hace ${hrs}h ${mins}m` : `hace ${hrs}h`;
    } catch (e) {
        return '';
    }
}

export function formatFechaEntrega(fechaStr?: string): string {
    if (!fechaStr) return '';
    const date = new Date(fechaStr);
    if (isNaN(date.getTime())) return '';
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 hour should be 12
    const formattedHours = String(hours).padStart(2, '0');
    
    return `${day}/${month}/${year} ${formattedHours}:${minutes}${ampm}`;
}

export function calculateAssignmentDurations(ass: any, docsForAss: any[]) {
    const start = ass.fecha_creacion ? new Date(ass.fecha_creacion).getTime() : null;
    const returnStart = ass.fecha_inicio_retorno ? new Date(ass.fecha_inicio_retorno).getTime() : null;
    const completed = ass.fecha_completada ? new Date(ass.fecha_completada).getTime() : null;
    
    const now = new Date().getTime();

    let activeDeliveryTime = "N/A";
    let returnTime = "N/A";
    let totalTime = "N/A";
    let activeDeliveryMins = 0;
    let returnMins = 0;
    let totalMins = 0;

    if (start) {
        const endDelivery = returnStart || completed || now;
        activeDeliveryMins = Math.round((endDelivery - start) / (1000 * 60));
        const hrs = Math.floor(activeDeliveryMins / 60);
        const mins = activeDeliveryMins % 60;
        activeDeliveryTime = `${hrs}h ${mins}m`;
    }

    if (returnStart) {
        const endReturn = completed || now;
        returnMins = Math.round((endReturn - returnStart) / (1000 * 60));
        const hrs = Math.floor(returnMins / 60);
        const mins = returnMins % 60;
        returnTime = `${hrs}h ${mins}m`;
    }

    if (start) {
        const endTotal = completed || now;
        totalMins = Math.round((endTotal - start) / (1000 * 60));
        const hrs = Math.floor(totalMins / 60);
        const mins = totalMins % 60;
        totalTime = `${hrs}h ${mins}m`;
    }

    // Group completed deliveries by client_nombre
    const completedDocs = docsForAss.filter(d => d.fecha_entrega);
    
    const clientStopsMap: Record<string, any> = {};
    for (const doc of completedDocs) {
        const time = new Date(doc.fecha_entrega).getTime();
        if (!clientStopsMap[doc.cliente_nombre]) {
            clientStopsMap[doc.cliente_nombre] = {
                cliente_nombre: doc.cliente_nombre,
                time: time,
                dateStr: doc.fecha_entrega,
                docNums: [doc.documento_numero],
                estado: doc.estado
            };
        } else {
            if (!clientStopsMap[doc.cliente_nombre].docNums.includes(doc.documento_numero)) {
                clientStopsMap[doc.cliente_nombre].docNums.push(doc.documento_numero);
            }
            if (time > clientStopsMap[doc.cliente_nombre].time) {
                clientStopsMap[doc.cliente_nombre].time = time;
                clientStopsMap[doc.cliente_nombre].dateStr = doc.fecha_entrega;
                clientStopsMap[doc.cliente_nombre].estado = doc.estado;
            }
        }
    }

    const stops = Object.values(clientStopsMap).map((stop: any) => ({
        ...stop,
        docNum: stop.docNums.join(', ')
    })).sort((a: any, b: any) => a.time - b.time);

    const stopsWithTransit = [];
    let prevTime = start;

    for (let i = 0; i < stops.length; i++) {
        const stop: any = stops[i];
        let transitStr = "N/A";
        if (prevTime) {
            const transitMins = Math.round((stop.time - prevTime) / (1000 * 60));
            transitStr = `${transitMins} min`;
        }
        stopsWithTransit.push({
            ...stop,
            transit: transitStr
        });
        prevTime = stop.time;
    }

    let returnTransit = "N/A";
    if (prevTime && returnStart) {
        const returnStartMins = Math.round((returnStart - prevTime) / (1000 * 60));
        returnTransit = `${returnStartMins} min`;
    }

    return {
        activeDeliveryTime,
        returnTime,
        totalTime,
        stopsCount: stops.length,
        stops: stopsWithTransit,
        returnTransit,
        activeDeliveryMins,
        returnMins,
        totalMins
    };
}
