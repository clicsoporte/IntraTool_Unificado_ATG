'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { 
  getDriverActiveAssignmentAction, 
  getDriverAvailableRoutesAndVehiclesAction,
  startDriverRouteAction,
  departDriverRouteAction,
  autoloadInvoiceAction,
  processDriverDeliveryAction,
  reportDriverBreakdownAction,
  finishDriverRouteAction,
  fetchDocumentLinesAction
} from '@/modules/operations/lib/driver-actions';
import { DriverDeliveriesTab } from '@/modules/operations/components/driver/DriverDeliveriesTab';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldAlert, Loader2 } from 'lucide-react';

export default function DriverWebPortalPage() {
  const { user, hasPermission } = useAuth();
  const [activeAssignmentData, setActiveAssignmentData] = useState<any>(null);
  const [availableRoutes, setAvailableRoutes] = useState<any[]>([]);
  const [availableVehicles, setAvailableVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Check permission
  const canAccessDriverWeb = hasPermission('operaciones_chofer_web') || hasPermission('deliveries:write') || hasPermission('admin:access');

  const loadPortalData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const [assignmentData, routesVehicles] = await Promise.all([
        getDriverActiveAssignmentAction(),
        getDriverAvailableRoutesAndVehiclesAction()
      ]);
      setActiveAssignmentData(assignmentData);
      setAvailableRoutes(routesVehicles.routes || []);
      setAvailableVehicles(routesVehicles.vehicles || []);
    } catch (err) {
      console.error("Error loading driver portal data:", err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && canAccessDriverWeb) {
      loadPortalData(false);
      const interval = setInterval(() => {
        loadPortalData(true);
      }, 30000);
      return () => clearInterval(interval);
    } else {
      setLoading(false);
    }
  }, [user, canAccessDriverWeb, loadPortalData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <p className="text-xs font-semibold">Cargando Portal Entregas Móvil...</p>
      </div>
    );
  }

  if (!canAccessDriverWeb) {
    return (
      <div className="p-4 max-w-md mx-auto py-12">
        <Card className="border-red-200 bg-red-50/60 rounded-2xl shadow-sm text-center">
          <CardContent className="p-6 space-y-3">
            <ShieldAlert className="w-12 h-12 text-red-600 mx-auto" />
            <h2 className="font-bold text-base text-red-900">Acceso No Autorizado</h2>
            <p className="text-xs text-red-700">
              No posees el permiso <strong className="font-mono">operaciones_chofer_web</strong> necesario para ingresar al Portal Entregas Móvil.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg mx-auto p-2 sm:p-4 space-y-3 min-h-screen">
      <DriverDeliveriesTab
        activeAssignmentData={activeAssignmentData}
        availableRoutes={availableRoutes}
        availableVehicles={availableVehicles}
        driverName={user?.name || 'Chofer'}
        onStartRoute={startDriverRouteAction}
        onDepartRoute={departDriverRouteAction}
        onAutoloadInvoice={autoloadInvoiceAction}
        onProcessDelivery={processDriverDeliveryAction}
        onReportBreakdown={reportDriverBreakdownAction}
        onFinishRoute={finishDriverRouteAction}
        onFetchLines={fetchDocumentLinesAction}
        onRefresh={loadPortalData}
      />
    </div>
  );
}
