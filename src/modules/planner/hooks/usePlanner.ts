/**
 * @fileoverview Custom hook `usePlanner` for managing the state and logic of the Production Planner page.
 * This hook encapsulates all state and actions for the planner, keeping the UI component clean.
 */

'use client';

import React from 'react';
import { useState, useEffect, useCallback, useMemo, FormEvent } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { 
    getProductionOrders, saveProductionOrder, updateProductionOrder, 
    updateProductionOrderStatus, getOrderHistory, getPlannerSettings, 
    updateProductionOrderDetails, addNoteToOrder, updatePendingAction,
    confirmModification
} from '@/modules/planner/lib/actions';
import type { 
    ProductionOrder, ProductionOrderStatus, ProductionOrderPriority, 
    ProductionOrderHistoryEntry, User, PlannerSettings, DateRange, 
    PlannerNotePayload, UpdateProductionOrderPayload, AdministrativeActionPayload, Product, StockInfo 
} from '../../core/types';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useDebounce } from 'use-debounce';
import { getDaysRemaining as getSimpleDaysRemaining, getLocalDateStr } from '@/modules/core/lib/time-utils';
import { generateDocument } from '@/modules/core/lib/pdf-generator';
import type { RowInput } from 'jspdf-autotable';
import { addNoteToOrder as addNoteServer } from '@/modules/planner/lib/actions';
import { exportToExcel } from '@/modules/core/lib/excel-export';
import { AlertTriangle, Undo2, ChevronsLeft, ChevronsRight, Send, ShoppingBag } from 'lucide-react';
import { getStatusConfig } from '../lib/utils';
import { saveUserPreferences, getUserPreferences } from '@/modules/core/lib/db';

const normalizeText = (text: string | null | undefined): string => {
    if (!text) return "";
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

const emptyOrder: Omit<ProductionOrder, 'id' | 'consecutive' | 'requestDate' | 'status' | 'reopened' | 'erpPackageNumber' | 'erpTicketNumber' | 'machineId' | 'previousStatus' | 'scheduledStartDate' | 'scheduledEndDate' | 'requestedBy' | 'hasBeenModified' | 'lastModifiedBy' | 'lastModifiedAt' | 'shiftId'> = {
    deliveryDate: '',
    customerId: '',
    customerName: '',
    customerTaxId: '',
    productId: '',
    productDescription: '',
    quantity: 0,
    priority: 'medium',
    notes: '',
    inventory: 0,
    inventoryErp: 0,
    purchaseOrder: '',
    deliveredQuantity: undefined,
    defectiveQuantity: undefined,
    erpOrderNumber: undefined,
    pendingAction: 'none',
};

const priorityConfig = { 
    low: { label: "Baja", className: "text-gray-500" }, 
    medium: { label: "Media", className: "text-blue-500" }, 
    high: { label: "Alta", className: "text-yellow-600" }, 
    urgent: { label: "Urgente", className: "text-red-600" }
};

const availableColumns = [
    { id: 'consecutive', label: 'OP', defaultVisible: true },
    { id: 'customerName', label: 'Cliente', defaultVisible: true },
    { id: 'purchaseOrder', label: 'OC Cliente', defaultVisible: false },
    { id: 'productDescription', label: 'Producto', defaultVisible: true },
    { id: 'priority', label: 'Prioridad', defaultVisible: true },
    { id: 'machineId', label: 'Asignación', defaultVisible: true },
    { id: 'shiftId', label: 'Turno', defaultVisible: false },
    { id: 'quantity', label: 'Solicitado', defaultVisible: true, align: 'right' },
    { id: 'deliveredQuantity', label: 'Producido', defaultVisible: true, align: 'right' },
    { id: 'defectiveQuantity', label: 'Defectuoso', defaultVisible: true, align: 'right' },
    { id: 'netDifference', label: 'Dif. Neta', defaultVisible: true, align: 'right' },
    { id: 'inventory', label: 'Inv. Manual (Crea)', defaultVisible: false, align: 'right' },
    { id: 'inventoryErp', label: 'Inv. ERP (Crea)', defaultVisible: false, align: 'right' },
    { id: 'requestDate', label: 'Fecha Solicitud', defaultVisible: false },
    { id: 'deliveryDate', label: 'Fecha Requerida', defaultVisible: true },
    { id: 'scheduledDate', label: 'Fecha Programada', defaultVisible: true },
    { id: 'completionDate', label: 'Fecha Completada', defaultVisible: false },
    { id: 'productionDurationDays', label: 'Días Producción', defaultVisible: false, align: 'right' },
    { id: 'totalCycleDays', label: 'Días Ciclo Total', defaultVisible: false, align: 'right' },
    { id: 'requestedBy', label: 'Solicitante', defaultVisible: false },
];

export const usePlanner = () => {
    const { isAuthorized, hasPermission } = useAuthorization(['planner:read']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user: currentUser, companyData: authCompanyData, customers, products, stockLevels, isAuthReady } = useAuth();

    const [state, setState] = useState({
        isLoading: true,
        isSubmitting: false,
        isRefreshing: false,
        isNewOrderDialogOpen: false,
        isEditOrderDialogOpen: false,
        orders: [] as ProductionOrder[],
        viewingArchived: false,
        currentPage: 0,
        pageSize: 10,
        totalItems: 0,
        totalActiveCount: 0,
        totalArchivedCount: 0,
        plannerSettings: null as PlannerSettings | null,
        newOrder: emptyOrder,
        orderToEdit: null as ProductionOrder | null,
        searchTerm: "",
        statusFilter: [] as string[],
        classificationFilter: [] as string[],
        showOnlyMyOrders: !hasPermission('planner:read:all'),
        dateFilter: undefined as DateRange | undefined,
        customerSearchTerm: "",
        isCustomerSearchOpen: false,
        productSearchTerm: "",
        isProductSearchOpen: false,
        isStatusDialogOpen: false,
        orderToUpdate: null as ProductionOrder | null,
        newStatus: null as ProductionOrderStatus | null,
        statusUpdateNotes: "",
        deliveredQuantity: "" as number | string,
        defectiveQuantity: "" as number | string,
        erpPackageNumber: "",
        erpTicketNumber: "",
        isHistoryDialogOpen: false,
        historyOrder: null as ProductionOrder | null,
        history: [] as ProductionOrderHistoryEntry[],
        isHistoryLoading: false,
        isReopenDialogOpen: false,
        reopenStep: 0,
        reopenConfirmationText: '',
        dynamicStatusConfig: getStatusConfig(null),
        isAddNoteDialogOpen: false,
        notePayload: null as { orderId: number; notes: string } | null,
        isActionDialogOpen: false,
        activeOrdersForSelectedProduct: [] as ProductionOrder[], // For duplicate check
        visibleColumns: availableColumns.filter(c => c.defaultVisible).map(c => c.id),
        orderToConfirmModification: null as ProductionOrder | null,
    });
    
    const [debouncedSearchTerm] = useDebounce(state.searchTerm, authCompanyData?.searchDebounceTime ?? 500);
    const [debouncedCustomerSearch] = useDebounce(state.customerSearchTerm, authCompanyData?.searchDebounceTime ?? 500);
    const [debouncedProductSearch] = useDebounce(state.productSearchTerm, authCompanyData?.searchDebounceTime ?? 500);
    
    const updateState = useCallback((newState: Partial<typeof state>) => {
        setState(prevState => ({ ...prevState, ...newState }));
    }, []);

    const loadInitialData = useCallback(async (isRefresh = false) => {
        let isMounted = true;
        
        if (isRefresh) {
            updateState({ isRefreshing: true });
        } else {
            updateState({ isLoading: true });
        }

        try {
            const [ settingsData, ordersResponse ] = await Promise.all([
                getPlannerSettings(),
                getProductionOrders({
                    page: state.currentPage,
                    pageSize: state.pageSize,
                    isArchived: state.viewingArchived,
                    filters: {
                        searchTerm: debouncedSearchTerm,
                        status: state.statusFilter,
                        classification: state.classificationFilter,
                        showOnlyMy: state.showOnlyMyOrders ? currentUser?.name : undefined,
                        dateRange: state.dateFilter
                    }
                })
            ]);
            
            if (!isMounted) return;

            const newDynamicConfig = getStatusConfig(settingsData);
            
            updateState({
                plannerSettings: settingsData,
                dynamicStatusConfig: newDynamicConfig,
                orders: state.viewingArchived ? ordersResponse.archivedOrders : ordersResponse.activeOrders,
                totalItems: state.viewingArchived ? ordersResponse.totalArchivedCount : ordersResponse.totalActiveCount,
                totalActiveCount: ordersResponse.totalActiveCount,
                totalArchivedCount: ordersResponse.totalArchivedCount,
            });

        } catch (error) {
             if (isMounted) {
                logError("Failed to load planner data", { error: (error as Error).message });
                toast({ title: "Error", description: "No se pudieron cargar los datos del planificador.", variant: "destructive" });
            }
        } finally {
             if (isMounted) {
                updateState({ isLoading: false, isRefreshing: false });
            }
        }
         return () => { isMounted = false; };
    }, [toast, updateState, state.currentPage, state.pageSize, state.viewingArchived, debouncedSearchTerm, state.statusFilter, state.classificationFilter, state.showOnlyMyOrders, state.dateFilter, currentUser?.name]);
    
    useEffect(() => {
        setTitle("Planificador OP");
        const loadPrefs = async () => {
            if (currentUser) {
                const prefs = await getUserPreferences(currentUser.id, 'plannerPrefs');
                if (prefs && prefs.visibleColumns) {
                    updateState({ visibleColumns: prefs.visibleColumns });
                }
            }
        }

        if (isAuthReady) {
            loadPrefs();
        }
    }, [setTitle, isAuthReady, currentUser, updateState]);
    
    useEffect(() => {
        if (!isAuthReady) return;
        loadInitialData(false);
    }, [isAuthReady, loadInitialData]);

    const getOrderPermissions = useCallback((order: ProductionOrder): { [key: string]: { allowed: boolean; visible: boolean; reason: string | null } } => {
        const createResult = (allowed: boolean, reason: string | null = null, visible = true) => ({ allowed, reason: allowed ? null : reason, visible });
    
        const isPending = order.status === 'pending';
        const isPendingReview = order.status === 'pending-review';
        const isPendingApproval = order.status === 'pending-approval';
        const isApproved = order.status === 'approved';
        const isInQueue = order.status === 'in-queue';
        const isInProgress = order.status === 'in-progress';
        const isOnHold = order.status === 'on-hold' || order.status === 'in-maintenance';
        const isCompleted = order.status === 'completed';
    
        let finalArchivedStatus: ProductionOrderStatus = 'completed';
        if (state.plannerSettings?.useWarehouseReception) {
            finalArchivedStatus = 'received-in-warehouse';
        }
        const isFinalArchived = order.status === finalArchivedStatus || order.status === 'canceled';
        
        return {
            canEdit: createResult((isPending || isPendingReview || isPendingApproval) && hasPermission('planner:edit:pending'), 'Solo se puede editar en estados iniciales.'),
            canConfirmModification: createResult(!!order.hasBeenModified && hasPermission('planner:status:approve'), 'Se requiere permiso de aprobación para confirmar.'),
            canSendToReview: createResult(isPending && hasPermission('planner:status:review'), 'Solo desde estado Pendiente.'),
            canGoBackToPending: createResult(isPendingReview && hasPermission('planner:status:review'), 'Solo desde Revisión.'),
            canSendToApproval: createResult(isPendingReview && hasPermission('planner:status:pending-approval'), 'Solo desde Revisión.'),
            canGoBackToReview: createResult(isPendingApproval && hasPermission('planner:status:pending-approval'), 'Solo desde Pendiente Aprobación.'),
            canApprove: createResult(isPendingApproval && hasPermission('planner:status:approve'), 'Solo desde Pendiente Aprobación.'),
            canQueue: createResult(isApproved && hasPermission('planner:status:in-progress'), 'Solo para órdenes Aprobadas.'),
            canStart: createResult((isApproved || isInQueue) && hasPermission('planner:status:in-progress') && (!state.plannerSettings?.requireMachineForStart || !!order.machineId), 'Debe estar aprobada/en cola y tener asignación si es requerido.'),
            canResumeFromHold: createResult(isOnHold && hasPermission('planner:status:in-progress'), 'Solo desde estados de espera.'),
            canHold: createResult(isInProgress && hasPermission('planner:status:on-hold'), 'Solo para órdenes En Progreso.'),
            canMaintain: createResult(isInProgress && hasPermission('planner:status:on-hold'), 'Solo para órdenes En Progreso.'),
            canComplete: createResult((isInProgress || isOnHold) && hasPermission('planner:status:completed') && (!state.plannerSettings?.requireShiftForCompletion || !!order.shiftId), 'Debe estar en progreso/espera y tener turno asignado si es requerido.'),
            canRequestUnapproval: createResult((isApproved || isInQueue || isOnHold || isInProgress) && hasPermission('planner:status:unapprove-request'), 'Solo para órdenes activas post-aprobación.'),
            canCancelPending: createResult((isPending || isPendingReview || isPendingApproval) && hasPermission('planner:status:cancel'), 'Solo en estados iniciales.'),
            canRequestCancel: createResult((isApproved || isInQueue) && hasPermission('planner:status:cancel-approved'), 'Solo para órdenes aprobadas/en cola.'),
            canReceive: createResult(isCompleted && !!state.plannerSettings?.useWarehouseReception && hasPermission('planner:receive'), 'Paso no habilitado o estado incorrecto.'),
            canReopen: createResult(isFinalArchived && hasPermission('planner:reopen'), 'Solo para órdenes archivadas.'),
        };
    }, [hasPermission, state.plannerSettings]);
    
    const actions = {
        setNewOrderDialogOpen: (isOpen: boolean) => updateState({ isNewOrderDialogOpen: isOpen, activeOrdersForSelectedProduct: [] }),
        setEditOrderDialogOpen: (isOpen: boolean) => updateState({ isEditOrderDialogOpen: isOpen }),
        setViewingArchived: (isArchived: boolean) => updateState({ viewingArchived: isArchived, currentPage: 0 }),
        setCurrentPage: (page: number | ((p: number) => number)) => updateState({ currentPage: typeof page === 'function' ? page(state.currentPage) : page }),
        setPageSize: (size: number) => updateState({ pageSize: size, currentPage: 0 }),
        setNewOrder: (partialOrder: Partial<typeof state.newOrder>) => {
            updateState({ newOrder: { ...state.newOrder, ...partialOrder } });
        },
        setOrderToEdit: (order: ProductionOrder | null) => {
            updateState({ orderToEdit: order });
        },
        setOrderToUpdate: (order: ProductionOrder | null) => updateState({ orderToUpdate: order }),
        setSearchTerm: (term: string) => updateState({ searchTerm: term, currentPage: 0 }),
        setStatusFilter: (status: string[]) => updateState({ statusFilter: status, currentPage: 0 }),
        setClassificationFilter: (filter: string[]) => updateState({ classificationFilter: filter, currentPage: 0 }),
        setShowOnlyMyOrders: (show: boolean) => {
            if (!show && !hasPermission('planner:read:all')) {
                toast({ title: "Permiso Requerido", description: "No tienes permiso para ver todas las órdenes.", variant: "destructive"});
                return;
            }
            updateState({ showOnlyMyOrders: show, currentPage: 0 });
        },
        setDateFilter: (range: DateRange | undefined) => updateState({ dateFilter: range, currentPage: 0 }),
        setCustomerSearchTerm: (term: string) => updateState({ customerSearchTerm: term }),
        setCustomerSearchOpen: (isOpen: boolean) => updateState({ isCustomerSearchOpen: isOpen }),
        setProductSearchTerm: (term: string) => {
            updateState({ productSearchTerm: term });
            if (!term) updateState({ activeOrdersForSelectedProduct: [] });
        },
        setProductSearchOpen: (isOpen: boolean) => updateState({ isProductSearchOpen: isOpen }),
        setStatusDialogOpen: (isOpen: boolean) => updateState({ isStatusDialogOpen: isOpen }),
        setNewStatus: (status: ProductionOrderStatus | null) => updateState({ newStatus: status }),
        setStatusUpdateNotes: (notes: string) => updateState({ statusUpdateNotes: notes }),
        setDeliveredQuantity: (qty: number | string) => updateState({ deliveredQuantity: qty }),
        setDefectiveQuantity: (qty: number | string) => updateState({ defectiveQuantity: qty }),
        setErpPackageNumber: (num: string) => updateState({ erpPackageNumber: num }),
        setErpTicketNumber: (num: string) => updateState({ erpTicketNumber: num }),
        setHistoryDialogOpen: (isOpen: boolean) => updateState({ isHistoryDialogOpen: isOpen }),
        setReopenDialogOpen: (isOpen: boolean) => updateState({ isReopenDialogOpen: isOpen }),
        setReopenStep: (step: number) => updateState({ reopenStep: step }),
        setReopenConfirmationText: (text: string) => updateState({ reopenConfirmationText: text }),
        setAddNoteDialogOpen: (isOpen: boolean) => updateState({ isAddNoteDialogOpen: isOpen }),
        setNotePayload: (payload: { orderId: number; notes: string } | null) => updateState({ notePayload: payload }),
        setActionDialogOpen: (isOpen: boolean) => updateState({ isActionDialogOpen: isOpen }),
        handleColumnVisibilityChange: (columnId: string, checked: boolean) => {
            updateState({
                visibleColumns: checked
                    ? [...state.visibleColumns, columnId]
                    : state.visibleColumns.filter(id => id !== columnId)
            });
        },
        handleSaveColumnVisibility: async () => {
            if (!currentUser) return;
            try {
                await saveUserPreferences(currentUser.id, 'plannerPrefs', { visibleColumns: state.visibleColumns });
                toast({ title: "Preferencias Guardadas", description: "La visibilidad de las columnas ha sido guardada." });
            } catch (error: any) {
                logError("Failed to save planner column visibility", { error: error.message });
                toast({ title: "Error", description: "No se pudo guardar la configuración de columnas.", variant: "destructive" });
            }
        },
        
        loadInitialData,

        handleCreateOrder: async () => {
            if (!currentUser) {
                toast({ title: "Error de autenticación", variant: "destructive" });
                return;
            }
            if (!state.newOrder.customerId) {
                toast({ title: "Campo Requerido", description: "Por favor, seleccione un cliente.", variant: "destructive" });
                return;
            }
            if (!state.newOrder.productId) {
                toast({ title: "Campo Requerido", description: "Por favor, seleccione un producto.", variant: "destructive" });
                return;
            }
            if (!state.newOrder.quantity || state.newOrder.quantity <= 0) {
                toast({ title: "Campo Requerido", description: "La cantidad solicitada debe ser mayor a cero.", variant: "destructive" });
                return;
            }
            if (!state.newOrder.deliveryDate) {
                toast({ title: "Campo Requerido", description: "Por favor, especifique la fecha de entrega requerida.", variant: "destructive" });
                return;
            }

            updateState({ isSubmitting: true });
            try {
                const createdOrder = await saveProductionOrder(state.newOrder, currentUser.name);
                toast({ title: "Orden Creada" });
                updateState({
                    isNewOrderDialogOpen: false,
                    newOrder: { ...emptyOrder, deliveryDate: getLocalDateStr() },
                    customerSearchTerm: '',
                    productSearchTerm: '',
                    activeOrdersForSelectedProduct: [],
                });
                await loadInitialData(true);
            } catch (error: any) {
                logError("Failed to create order", { error: error.message });
                toast({ title: "Error", variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },

        handleEditOrder: async (e: React.FormEvent) => {
            e.preventDefault();
            if (!state.orderToEdit?.id || !currentUser) return;
            updateState({ isSubmitting: true });
            try {
                const payload: UpdateProductionOrderPayload = {
                    ...state.orderToEdit,
                    orderId: state.orderToEdit.id,
                    updatedBy: currentUser.name
                };
                const updated = await updateProductionOrder(payload);
                updateState({
                    orders: state.orders.map(o => o.id === updated.id ? updated : o),
                    isEditOrderDialogOpen: false
                });
                toast({ title: "Orden Actualizada" });
            } catch (error: any) {
                logError("Failed to edit order", { error: error.message });
                toast({ title: "Error", variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },

        openStatusDialog: (order: ProductionOrder, status: ProductionOrderStatus) => {
            updateState({
                orderToUpdate: order,
                newStatus: status,
                statusUpdateNotes: ".",
                deliveredQuantity: status === 'completed' ? order.quantity : "",
                defectiveQuantity: status === 'completed' ? (order.defectiveQuantity || "") : "",
                erpPackageNumber: "",
                erpTicketNumber: "",
                isStatusDialogOpen: true,
            });
        },
        
        openAdminActionDialog: async (order: ProductionOrder, action: 'unapproval-request' | 'cancellation-request') => {
            if (!currentUser) return;
            updateState({ isSubmitting: true });
            try {
                const payload: AdministrativeActionPayload = {
                    entityId: order.id,
                    action,
                    notes: `Solicitud de ${action === 'unapproval-request' ? 'desaprobación' : 'cancelación'} iniciada.`,
                    updatedBy: currentUser.name,
                };
                const updated = await updatePendingAction(payload);
                updateState({
                    orders: state.orders.map(o => o.id === updated.id ? updated : o)
                });
                toast({ title: "Solicitud Enviada", description: `Tu solicitud de ${action === 'unapproval-request' ? 'desaprobación' : 'cancelación'} ha sido enviada para revisión.` });
            } catch (error: any) {
                logError(`Failed to request ${action}`, { error: error.message });
                toast({ title: "Error al Solicitar", description: `No se pudo enviar la solicitud. ${error.message}`, variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },

        handleAdminAction: async (approve: boolean) => {
            if (!state.orderToUpdate || !currentUser || !state.orderToUpdate.pendingAction || state.orderToUpdate.pendingAction === 'none') return;
            updateState({ isSubmitting: true });
    
            try {
                if (approve) {
                    const targetStatus = state.orderToUpdate.pendingAction === 'unapproval-request' ? 'pending' : 'canceled';
                    await actions.handleStatusUpdate(targetStatus);
                } else {
                     const updated = await updatePendingAction({
                        entityId: state.orderToUpdate.id,
                        action: 'none',
                        notes: state.statusUpdateNotes,
                        updatedBy: currentUser.name,
                    });
                    toast({ title: 'Solicitud Rechazada' });
                    updateState({ 
                        orders: state.orders.map(o => o.id === updated.id ? updated : o)
                    });
                }
                updateState({ isActionDialogOpen: false });
            } catch (error: any) {
                logError("Failed to handle admin action", { error: error.message });
                toast({ title: "Error", variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },

        handleStatusUpdate: async (statusOverride?: ProductionOrderStatus) => {
            const finalStatus = statusOverride || state.newStatus;
            if (!state.orderToUpdate || !finalStatus || !currentUser) return;
            updateState({ isSubmitting: true });
            try {
                await updateProductionOrderStatus({ 
                    orderId: state.orderToUpdate.id, 
                    status: finalStatus, 
                    notes: state.statusUpdateNotes, 
                    updatedBy: currentUser.name, 
                    deliveredQuantity: finalStatus === 'completed' ? Number(state.deliveredQuantity) : undefined, 
                    defectiveQuantity: finalStatus === 'completed' ? Number(state.defectiveQuantity) : undefined, 
                    erpPackageNumber: finalStatus === 'received-in-warehouse' ? state.erpPackageNumber : undefined, 
                    erpTicketNumber: finalStatus === 'received-in-warehouse' ? state.erpTicketNumber : undefined, 
                    reopen: false 
                });
                toast({ title: "Estado Actualizado" });
                updateState({ isStatusDialogOpen: false, isActionDialogOpen: false });
                await loadInitialData(true);
            } catch (error: any) {
                logError("Failed to update status", { error: error.message });
                toast({ title: "Error", variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },

        handleDetailUpdate: async (orderId: number, details: { priority?: ProductionOrderPriority; machineId?: string | null; shiftId?: string | null; scheduledDateRange?: DateRange }) => {
            if (!currentUser) return;
            const finalDetails = {
                ...details,
                machineId: details.machineId === 'none' ? null : details.machineId,
                shiftId: details.shiftId === 'none' ? null : details.shiftId,
            };
            const updated = await updateProductionOrderDetails({ orderId, ...finalDetails, updatedBy: currentUser.name });
            updateState({ 
                orders: state.orders.map(o => o.id === orderId ? updated : o)
            });
        },
        
        handleOpenHistory: async (order: ProductionOrder) => {
            updateState({ historyOrder: order, isHistoryDialogOpen: true, isHistoryLoading: true });
            try {
                updateState({ history: await getOrderHistory(order.id) });
            } catch (error: any) {
                logError("Failed to get history", {error: error.message});
                toast({ title: "Error", variant: "destructive" });
            } finally {
                updateState({ isHistoryLoading: false });
            }
        },
        
        handleReopenOrder: async () => {
            if (!state.orderToUpdate || !currentUser || state.reopenStep !== 2 || state.reopenConfirmationText !== 'REABRIR') return;
            updateState({ isSubmitting: true });
            try {
                await updateProductionOrderStatus({ orderId: state.orderToUpdate.id, status: 'pending', notes: 'Orden reabierta.', updatedBy: currentUser.name, reopen: true });
                toast({ title: "Orden Reabierta" });
                updateState({ isReopenDialogOpen: false });
                await loadInitialData(true);
            } catch (error: any) {
                logError("Failed to reopen order", { error: error.message });
                toast({ title: "Error", variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },

        handleSelectProduct: (value: string) => {
            updateState({ isProductSearchOpen: false, activeOrdersForSelectedProduct: [] });
            const product = products.find(p => p.id === value);
            if (product) {
                const stock = stockLevels.find(s => s.itemId === product.id)?.totalStock ?? 0;
                
                const dataToUpdate = { 
                    productId: product.id, 
                    productDescription: product.description || '', 
                    inventoryErp: stock,
                    inventory: state.newOrder.inventory || stock,
                };

                const existingActive = state.orders.filter(o => o.productId === product.id && !state.viewingArchived);
                updateState({ activeOrdersForSelectedProduct: existingActive });

                if (state.orderToEdit) {
                    actions.setOrderToEdit({ ...state.orderToEdit, ...dataToUpdate });
                } else {
                    updateState({ newOrder: { ...state.newOrder, ...dataToUpdate }});
                }

                updateState({ productSearchTerm: `[${product.id}] - ${product.description}` });
            } else {
                 updateState({ productSearchTerm: '' });
            }
        },
    
        handleSelectCustomer: (value: string) => {
            updateState({ isCustomerSearchOpen: false });
            const customer = customers.find(c => c.id === value);
            if (customer) {
                const dataToUpdate = { customerId: customer.id, customerName: customer.name, customerTaxId: customer.taxId };
                if (state.orderToEdit) {
                     updateState({
                        orderToEdit: state.orderToEdit ? { ...state.orderToEdit, ...dataToUpdate } : null
                    });
                } else {
                    updateState({ newOrder: { ...state.newOrder, ...dataToUpdate }});
                }
                updateState({ customerSearchTerm: `[${customer.id}] ${customer.name} (${customer.taxId})` });
            } else {
                updateState({ customerSearchTerm: '' });
            }
        },

        handleProductInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && selectors.productOptions.length > 0) { e.preventDefault(); actions.handleSelectProduct(selectors.productOptions[0].value); }
        },
        handleCustomerInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && selectors.customerOptions.length > 0) { e.preventDefault(); actions.handleSelectCustomer(selectors.customerOptions[0].value); }
        },
        
        openAddNoteDialog: (order: ProductionOrder) => {
            updateState({ notePayload: { orderId: order.id, notes: '' }, isAddNoteDialogOpen: true });
        },
    
        handleAddNote: async () => {
            if (!state.notePayload || !state.notePayload.notes.trim() || !currentUser) return;
            updateState({ isSubmitting: true });
            try {
                const payload = { ...state.notePayload, updatedBy: currentUser.name };
                const updatedOrder = await addNoteServer(payload);
                toast({ title: "Nota Añadida" });
                setState(prevState => ({
                    ...prevState,
                    isAddNoteDialogOpen: false,
                    orders: prevState.orders.map(o => o.id === updatedOrder.id ? updatedOrder : o),
                }));
            } catch(error: any) {
                logError("Failed to add note", { error: error.message });
                toast({ title: "Error", variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },

        handleExportExcel: () => {
            if (!state.plannerSettings) return;
            
            const dataToExport = selectors.filteredOrders.map(order => [
                order.consecutive,
                order.customerName,
                `[${order.productId}] ${order.productDescription}`,
                order.quantity,
                format(parseISO(order.deliveryDate), 'dd/MM/yyyy'),
                order.scheduledStartDate ? `${format(parseISO(order.scheduledStartDate), 'dd/MM/yy')} - ${order.scheduledEndDate ? format(parseISO(order.scheduledEndDate), 'dd/MM/yy') : ''}` : 'N/A',
                selectors.statusConfig[order.status]?.label || order.status,
                state.plannerSettings?.machines.find(m => m.id === order.machineId)?.name || 'N/A',
                selectors.priorityConfig[order.priority]?.label || order.priority,
                order.requestedBy
            ]);

            exportToExcel({
                fileName: 'ordenes_produccion',
                sheetName: 'Órdenes',
                headers: ['OP', 'Cliente', 'Producto', 'Cantidad', 'Fecha Entrega', 'Fecha Prog.', 'Estado', state.plannerSettings.assignmentLabel || 'Asignación', 'Prioridad', 'Solicitante'],
                data: dataToExport,
                columnWidths: [10, 25, 40, 10, 15, 20, 15, 20, 10, 15],
            });
        },

        handleExportPDF: async (orientation: 'portrait' | 'landscape' = 'portrait') => {
            if (!authCompanyData || !state.plannerSettings) return;
        
            let logoDataUrl: string | null = null;
            if (authCompanyData.logoUrl) {
                try {
                    const response = await fetch(authCompanyData.logoUrl);
                    const blob = await response.blob();
                    logoDataUrl = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(blob);
                    });
                } catch (e) { console.error("Error processing logo for PDF:", e); }
            }
        
            const allPossibleColumns: { id: string; header: string; width?: number }[] = [
                { id: 'consecutive', header: 'OP', width: 45 },
                { id: 'customerName', header: 'Cliente' },
                { id: 'productDescription', header: 'Producto' },
                { id: 'quantity', header: 'Cant.', width: 35 },
                { id: 'deliveryDate', header: 'Entrega', width: 55 },
                { id: 'scheduledDate', header: 'Fecha Prog.', width: 85 },
                { id: 'status', header: 'Estado', width: 65 },
                { id: 'machineId', header: state.plannerSettings.assignmentLabel || 'Asignación', width: 75 },
                { id: 'priority', header: 'Prioridad', width: 55 },
            ];
        
            const selectedColumnIds = state.plannerSettings.pdfExportColumns || [];
            const tableHeaders = selectedColumnIds.map(id => allPossibleColumns.find(c => c.id === id)?.header || id);
            
            const tableRows: RowInput[] = selectors.filteredOrders.map(order => {
                return selectedColumnIds.map(id => {
                    switch (id) {
                        case 'consecutive': return order.consecutive;
                        case 'customerName': return order.customerName;
                        case 'productDescription': return `[${order.productId}] ${order.productDescription}`;
                        case 'quantity': return order.quantity.toLocaleString('es-CR');
                        case 'deliveryDate': return format(parseISO(order.deliveryDate), 'dd/MM/yy');
                        case 'scheduledDate': return (order.scheduledStartDate && order.scheduledEndDate) ? `${format(parseISO(order.scheduledStartDate), 'dd/MM/yy')} - ${format(parseISO(order.scheduledEndDate), 'dd/MM/yy')}` : 'N/A';
                        case 'status': return selectors.statusConfig[order.status]?.label || order.status;
                        case 'machineId': return state.plannerSettings?.machines.find(m => m.id === order.machineId)?.name || 'N/A';
                        case 'priority': return selectors.priorityConfig[order.priority]?.label || order.priority;
                        default: return '';
                    }
                });
            });

            const doc = generateDocument({
                docTitle: `Órdenes de Producción (${state.viewingArchived ? 'Archivadas' : 'Activas'})`,
                docId: '',
                companyData: authCompanyData,
                logoDataUrl,
                meta: [{ label: 'Generado', value: format(new Date(), 'dd/MM/yyyy HH:mm') }],
                blocks: [],
                table: {
                    columns: tableHeaders,
                    rows: tableRows,
                    columnStyles: selectedColumnIds.reduce((acc, id, index) => {
                        const col = allPossibleColumns.find(c => c.id === id);
                        if (col?.width) { (acc as any)[index] = { cellWidth: col.width }; }
                        if (id === 'quantity') { (acc as any)[index] = { ...(acc as any)[index], halign: 'right' }; }
                        return acc;
                    }, {} as { [key: number]: any })
                },
                totals: [],
                topLegend: state.plannerSettings.pdfTopLegend,
                paperSize: state.plannerSettings.pdfPaperSize,
                orientation: orientation,
            });
        
            doc.save(`ordenes_produccion_${new Date().getTime()}.pdf`);
        },

        handleExportSingleOrderPDF: async (order: ProductionOrder) => {
            if (!authCompanyData || !state.plannerSettings) return;
            
            let logoDataUrl: string | null = null;
            if (authCompanyData.logoUrl) {
                 try {
                    const response = await fetch(authCompanyData.logoUrl);
                    const blob = await response.blob();
                    logoDataUrl = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(blob);
                    });
                } catch(e) { console.error("Error adding logo to PDF:", e) }
            }
            
            const historyData = await getOrderHistory(order.id);

            const machineName = state.plannerSettings.machines.find(m => m.id === order.machineId)?.name || 'N/A';
            
            const details = [
                { title: 'Cliente:', content: order.customerName },
                { title: 'Producto:', content: `[${order.productId}] ${order.productDescription}` },
                { title: 'Cantidad:', content: order.quantity.toLocaleString('es-CR') },
                { title: 'Fecha Solicitud:', content: format(parseISO(order.requestDate), 'dd/MM/yyyy') },
                { title: 'Fecha Entrega:', content: format(parseISO(order.deliveryDate), 'dd/MM/yyyy') },
                { title: 'Estado:', content: selectors.statusConfig[order.status]?.label || order.status },
                { title: 'Prioridad:', content: selectors.priorityConfig[order.priority]?.label || order.priority },
                { title: 'Asignación:', content: machineName },
                { title: 'Notas:', content: order.notes || 'N/A' },
                { title: 'Solicitado por:', content: order.requestedBy },
                { title: 'Aprobado por:', content: order.approvedBy || 'N/A' },
                { title: 'Última actualización:', content: `${order.lastStatusUpdateBy || 'N/A'} - ${order.lastStatusUpdateNotes || ''}` }
            ];

            generateDocument({
                docTitle: 'Orden de Producción',
                docId: order.consecutive,
                companyData: authCompanyData,
                logoDataUrl,
                meta: [{ label: 'Generado', value: format(new Date(), 'dd/MM/yyyy HH:mm') }],
                blocks: [
                    { title: "Detalles de la Orden", content: details.map(d => `${d.title} ${d.content}`).join('\n') },
                ],
                table: {
                    columns: ["Fecha", "Estado", "Usuario", "Notas"],
                    rows: historyData.map(entry => [
                        format(parseISO(entry.timestamp), 'dd/MM/yy HH:mm'),
                        selectors.statusConfig[entry.status]?.label || entry.status,
                        entry.updatedBy,
                        entry.notes || ''
                    ]),
                    columnStyles: {},
                },
                totals: []
            }).save(`op_${order.consecutive}.pdf`);
        },
        handleConfirmModification: async () => {
            if (!state.orderToConfirmModification || !currentUser) return;
        
            await confirmModification(state.orderToConfirmModification.id, currentUser.name);
            
            toast({ title: "Modificación Confirmada", description: "La alerta de modificación ha sido eliminada." });
            
            setState(prevState => {
                const updatedOrder = { ...prevState.orderToConfirmModification!, hasBeenModified: false };
                return {
                    ...prevState,
                    orders: prevState.orders.map(o => o.id === updatedOrder.id ? updatedOrder : o),
                    orderToConfirmModification: null
                }
            });
        },
        setOrderToConfirmModification: (order: ProductionOrder | null) => {
            updateState({ orderToConfirmModification: order });
        },
    };

    const selectors = {
        hasPermission,
        priorityConfig,
        statusConfig: state.dynamicStatusConfig,
        getOrderPermissions,
        getDaysRemaining: (dateStr: string) => getSimpleDaysRemaining(dateStr),
        getScheduledDaysRemaining: (order: ProductionOrder) => {
            if (!order.scheduledStartDate || !order.scheduledEndDate) {
                return { label: 'Sin Programar', color: 'text-gray-500' };
            }
            try {
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const startDate = parseISO(order.scheduledStartDate);
                const endDate = parseISO(order.scheduledEndDate);
                
                const totalDuration = differenceInCalendarDays(endDate, startDate) + 1;
                const remainingDays = differenceInCalendarDays(endDate, today);

                if (remainingDays < 0) {
                    return { label: `Atrasado ${Math.abs(remainingDays)}d`, color: 'text-red-600' };
                }
                
                const percentageRemaining = totalDuration > 0 ? (remainingDays / totalDuration) : 0;
                let color = 'text-green-600';
                if (percentageRemaining <= 0.25) color = 'text-red-600';
                else if (percentageRemaining <= 0.50) color = 'text-orange-500';

                return { label: `Faltan ${remainingDays} de ${totalDuration}d`, color };
            } catch (error) {
                return { label: 'Fecha inv.', color: 'text-red-600' };
            }
        },
        customerOptions: useMemo(() => {
            if (debouncedCustomerSearch.length < 2) return [];
            const searchTerms = normalizeText(debouncedCustomerSearch).split(' ').filter(Boolean);
            return customers.filter(c => {
                const targetText = normalizeText(`${c.id} ${c.name} ${c.taxId}`);
                return searchTerms.every(term => targetText.includes(term));
            }).map(c => ({ value: c.id, label: `[${c.id}] ${c.name} (${c.taxId})` }));
        }, [customers, debouncedCustomerSearch]),
        productOptions: useMemo(() => {
            if (debouncedProductSearch.length < 2) return [];
            const searchTerms = normalizeText(debouncedProductSearch).split(' ').filter(Boolean);
            return products
                .filter(p => {
                    const targetText = normalizeText(`${p.id} ${p.description} ${p.barcode || ''}`);
                    return searchTerms.every(term => targetText.includes(term));
                })
                .map(p => ({ value: p.id, label: `[${p.id}] - ${p.description}` }));
        }, [products, debouncedProductSearch]),
        classifications: useMemo<string[]>(() => 
            Array.from(new Set(products.map(p => p.classification).filter(Boolean)))
        , [products]),
        filteredOrders: state.orders,
        stockLevels: stockLevels,
        totalItems: state.viewingArchived ? state.totalArchivedCount : state.totalActiveCount,
        totalActiveCount: state.totalActiveCount,
        totalArchivedCount: state.totalArchivedCount,
        availableColumns,
    };

    return {
        state,
        actions,
        selectors,
        isAuthorized,
    };
};
