
/**
 * @fileoverview Custom hook `useRequests` for managing the state and logic of the Purchase Request page.
 * This hook encapsulates all state and actions for the module, keeping the UI component clean.
 */

'use client';

import React from 'react';
import { useState, useEffect, useCallback, useMemo, FormEvent } from 'react';
import { useToast } from '@/modules/core/hooks/use-toast';
import { ToastAction } from "@/components/ui/toast";
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { 
    getPurchaseRequests, savePurchaseRequest, updatePurchaseRequest, 
    updatePurchaseRequestStatus, getRequestHistory, getRequestSettings, 
    updatePendingAction, getErpOrderData, getUserByName, 
    getRolesWithPermission, addNoteToRequest, updateRequestDetails as updateRequestDetailsServer, 
    saveCostAnalysis as saveCostAnalysisAction
} from '@/modules/requests/lib/actions';
import { getAllErpPurchaseOrderHeaders, getAllErpPurchaseOrderLines } from '@/modules/core/lib/db';
import type { DateRange, UserPreferences, PurchaseSuggestion, PurchaseRequestPriority, ErpOrderHeader, ErpOrderLine, User, RequestNotePayload, PurchaseRequest, PurchaseRequestHistoryEntry, RequestSettings, Company, AdministrativeAction, AdministrativeActionPayload, StockInfo, Product, ErpPurchaseOrderHeader as ErpPOHeader, ErpPurchaseOrderLine, PurchaseRequestStatus } from '../../core/types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { useDebounce } from 'use-debounce';
import { generateDocument } from '@/modules/core/lib/pdf-generator';
import { getDaysRemaining as getSimpleDaysRemaining, getLocalDateStr, formatDateToLocal } from '@/modules/core/lib/time-utils';
import { exportToExcel } from '@/modules/core/lib/excel-export';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import type { RowInput } from 'jspdf-autotable';


const normalizeText = (text: string | null | undefined): string => {
    if (!text) return "";
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

const emptyRequest: Omit<PurchaseRequest, 'id' | 'consecutive' | 'requestDate' | 'status' | 'reopened' | 'requestedBy' | 'deliveredQuantity' | 'receivedInWarehouseBy' | 'receivedDate' | 'previousStatus' | 'lastModifiedAt' | 'lastModifiedBy' | 'hasBeenModified' | 'approvedBy' | 'lastStatusUpdateBy' | 'lastStatusUpdateNotes'> = {
    requiredDate: getLocalDateStr(),
    clientId: '',
    clientName: '',
    clientTaxId: '',
    itemId: '',
    itemDescription: '',
    quantity: 0,
    notes: '',
    unitSalePrice: undefined,
    salePriceCurrency: 'CRC',
    requiresCurrency: true,
    manualSupplier: '',
    erpOrderNumber: '',
    erpOrderLine: 0,
    purchaseOrder: '',
    route: '',
    shippingMethod: '',
    inventory: 0,
    inventoryErp: 0,
    priority: 'medium',
    purchaseType: 'single',
    arrivalDate: '',
    pendingAction: 'none',
    analysis: undefined,
};

type UIErpOrderLine = {
    PEDIDO: string;
    PEDIDO_LINEA: number;
    ARTICULO: string;
    PRECIO_UNITARIO: number;
    CANTIDAD_PEDIDA: number;
    // UI state
    product: Product;
    stock: StockInfo | null;
    selected: boolean;
    displayQuantity: string;
    displayPrice: string;
};


const statusConfig: { [key: string]: { label: string; color: string } } = {
    pending: { label: "Pendiente", color: "bg-yellow-500" },
    'purchasing-review': { label: "Revisión Compras", color: "bg-cyan-500" },
    'pending-approval': { label: "Pendiente Aprobación", color: "bg-orange-500" },
    approved: { label: "Aprobada", color: "bg-green-500" },
    ordered: { label: "Ordenada", color: "bg-blue-500" },
    'received-in-warehouse': { label: "Recibido en Bodega", color: "bg-teal-500" },
    'entered-erp': { label: "Ingresado ERP", color: "bg-indigo-500" },
    canceled: { label: "Cancelada", color: "bg-red-700" }
};

const priorityConfig = { 
    low: { label: "Baja", className: "text-gray-500" }, 
    medium: { label: "Media", className: "text-blue-500" }, 
    high: { label: "Alta", className: "text-yellow-600" }, 
    urgent: { label: "Urgente", className: "text-red-600" }
};

type State = {
    isLoading: boolean;
    isRefreshing: boolean;
    isSubmitting: boolean;
    isNewRequestDialogOpen: boolean;
    isEditRequestDialogOpen: boolean;
    requests: PurchaseRequest[];
    viewingArchived: boolean;
    currentPage: number;
    totalActive: number;
    totalArchived: number;
    requestSettings: RequestSettings | null;
    companyData: Company | null;
    newRequest: Omit<PurchaseRequest, 'id' | 'consecutive' | 'requestDate' | 'status' | 'reopened' | 'requestedBy' | 'deliveredQuantity' | 'receivedInWarehouseBy' | 'receivedDate' | 'previousStatus' | 'lastModifiedAt' | 'lastModifiedBy' | 'hasBeenModified' | 'approvedBy' | 'lastStatusUpdateBy' | 'lastStatusUpdateNotes'>;
    requestToEdit: PurchaseRequest | null;
    searchTerm: string;
    statusFilter: string[];
    classificationFilter: string;
    dateFilter: DateRange | undefined;
    showOnlyMyRequests: boolean;
    clientSearchTerm: string;
    isClientSearchOpen: boolean;
    itemSearchTerm: string;
    isItemSearchOpen: boolean;
    isStatusDialogOpen: boolean;
    requestToUpdate: PurchaseRequest | null;
    newStatus: PurchaseRequestStatus | null;
    statusUpdateNotes: string;
    deliveredQuantity: number | string;
    erpEntryNumber: string;
    isHistoryDialogOpen: boolean;
    historyRequest: PurchaseRequest | null;
    history: PurchaseRequestHistoryEntry[];
    isHistoryLoading: boolean;
    isReopenDialogOpen: boolean;
    reopenStep: number;
    reopenConfirmationText: string;
    arrivalDate: string;
    isActionDialogOpen: boolean;
    isErpOrderModalOpen: boolean;
    isErpItemsModalOpen: boolean;
    erpOrderNumber: string;
    erpOrderHeaders: ErpOrderHeader[];
    selectedErpOrderHeader: ErpOrderHeader | null;
    erpOrderLines: UIErpOrderLine[];
    isErpLoading: boolean;
    showOnlyShortageItems: boolean;
    isContextInfoOpen: boolean;
    contextInfoData: PurchaseRequest | null;
    isAddNoteDialogOpen: boolean;
    notePayload: RequestNotePayload | null;
    erpPoHeaders: ErpPOHeader[];
    erpPoLines: ErpPurchaseOrderLine[];
    isTransitsDialogOpen: boolean;
    activeTransits: { itemId: string; itemDescription: string; transits: any[] } | null;
    isCostAnalysisDialogOpen: boolean;
    analysisCost: string;
    analysisSalePrice: string;
    rowsPerPage: number;
};

// Helper function to ensure complex fields are in the correct format (array).
const sanitizeRequest = (request: any): PurchaseRequest => {
  const sanitized = { ...request };
  if (sanitized.sourceOrders && typeof sanitized.sourceOrders === 'string') {
    try {
      sanitized.sourceOrders = JSON.parse(sanitized.sourceOrders);
    } catch {
      sanitized.sourceOrders = [];
    }
  } else if (!Array.isArray(sanitized.sourceOrders)) {
      sanitized.sourceOrders = [];
  }
  
  if (sanitized.involvedClients && typeof sanitized.involvedClients === 'string') {
    try {
      sanitized.involvedClients = JSON.parse(sanitized.involvedClients);
    } catch {
      sanitized.involvedClients = [];
    }
  } else if (!Array.isArray(sanitized.involvedClients)) {
      sanitized.involvedClients = [];
  }

  try {
      if (sanitized.analysis && typeof sanitized.analysis === 'string') {
          sanitized.analysis = JSON.parse(sanitized.analysis);
      } else if (typeof sanitized.analysis !== 'object') { // Allow null, but not other non-object types
          sanitized.analysis = undefined;
      }
  } catch {
      sanitized.analysis = undefined;
  }

  return sanitized as PurchaseRequest;
};


export const useRequests = () => {
    const { isAuthorized, hasPermission } = useAuthorization(['requests:read']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user: currentUser, stockLevels: authStockLevels, companyData: authCompanyData, isAuthReady, products, customers } = useAuth();
    const searchParams = useSearchParams();
    
    const [state, setState] = useState<State>({
        isLoading: true,
        isRefreshing: false,
        isSubmitting: false,
        isNewRequestDialogOpen: false,
        isEditRequestDialogOpen: false,
        requests: [],
        viewingArchived: false,
        currentPage: 0,
        totalActive: 0,
        totalArchived: 0,
        requestSettings: null,
        companyData: null,
        newRequest: emptyRequest,
        requestToEdit: null,
        searchTerm: "",
        statusFilter: [],
        classificationFilter: "all",
        dateFilter: undefined,
        showOnlyMyRequests: true,
        clientSearchTerm: "",
        isClientSearchOpen: false,
        itemSearchTerm: "",
        isItemSearchOpen: false,
        isStatusDialogOpen: false,
        requestToUpdate: null,
        newStatus: null,
        statusUpdateNotes: "",
        deliveredQuantity: "",
        erpEntryNumber: "",
        isHistoryDialogOpen: false,
        historyRequest: null,
        history: [],
        isHistoryLoading: false,
        isReopenDialogOpen: false,
        reopenStep: 0,
        reopenConfirmationText: '',
        arrivalDate: '',
        isActionDialogOpen: false,
        isErpOrderModalOpen: false,
        isErpItemsModalOpen: false,
        erpOrderNumber: '',
        erpOrderHeaders: [],
        selectedErpOrderHeader: null,
        erpOrderLines: [],
        isErpLoading: false,
        showOnlyShortageItems: true,
        isContextInfoOpen: false,
        contextInfoData: null,
        isAddNoteDialogOpen: false,
        notePayload: null,
        erpPoHeaders: [],
        erpPoLines: [],
        isTransitsDialogOpen: false,
        activeTransits: null,
        isCostAnalysisDialogOpen: false,
        analysisCost: '',
        analysisSalePrice: '',
        rowsPerPage: 10,
    });
    
    const [debouncedSearchTerm] = useDebounce(state.searchTerm, state.companyData?.searchDebounceTime ?? 500);
    const [debouncedClientSearch] = useDebounce(state.clientSearchTerm, state.companyData?.searchDebounceTime ?? 500);
    const [debouncedItemSearch] = useDebounce(state.itemSearchTerm, state.companyData?.searchDebounceTime ?? 500);
    
    const updateState = useCallback((newState: Partial<State>) => {
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
             const [settingsData, requestsData, poHeaders, poLines] = await Promise.all([
                getRequestSettings(),
                getPurchaseRequests({
                    page: state.currentPage,
                    pageSize: state.rowsPerPage,
                    isArchived: state.viewingArchived,
                    filters: {
                        searchTerm: debouncedSearchTerm,
                        status: state.statusFilter,
                        classification: state.classificationFilter,
                        showOnlyMy: state.showOnlyMyRequests ? currentUser?.name : undefined,
                        dateRange: state.dateFilter,
                    }
                }),
                getAllErpPurchaseOrderHeaders(),
                getAllErpPurchaseOrderLines(),
            ]);
            
            if (!isMounted) return;

            updateState({ 
                requestSettings: settingsData, 
                erpPoHeaders: poHeaders,
                erpPoLines: poLines,
                requests: requestsData.requests.map(sanitizeRequest),
                totalActive: requestsData.totalActive,
                totalArchived: requestsData.totalArchived,
            });

        } catch (error) {
             if (isMounted) {
                logError("Failed to load purchase requests data", { context: 'useRequests.loadInitialData', error: (error as Error).message });
                toast({ title: "Error", description: "No se pudieron cargar las solicitudes de compra.", variant: "destructive" });
            }
        } finally {
            if (isMounted) {
                updateState({ isLoading: false, isRefreshing: false });
            }
        }
         return () => { isMounted = false; };
    }, [toast, updateState, state.currentPage, state.rowsPerPage, state.viewingArchived, debouncedSearchTerm, state.statusFilter, state.classificationFilter, state.showOnlyMyRequests, state.dateFilter, currentUser?.name]);
    
    useEffect(() => {
        setTitle("Solicitud de Compra");
        if (isAuthReady) {
            loadInitialData(false);
        }
    }, [setTitle, isAuthReady, loadInitialData]);

    // Effect to pre-fill form from URL parameters
    useEffect(() => {
        if (isAuthReady && customers.length > 0 && products.length > 0 && searchParams) {
            const itemId = searchParams.get('itemId');
            if (itemId) {
                const product = products.find(p => p.id === itemId);
                const customer = customers.find(c => c.id === searchParams.get('clientId'));

                if (product) {
                    const newRequestData: Partial<typeof emptyRequest> = {
                        itemId: product.id,
                        itemDescription: product.description,
                        quantity: Number(searchParams.get('quantity')) || 1,
                        clientId: customer?.id || '',
                        clientName: customer?.name || '',
                        clientTaxId: customer?.taxId || '',
                        purchaseOrder: searchParams.get('purchaseOrder') || '',
                        notes: searchParams.get('notes') || '',
                        requiredDate: searchParams.get('requiredDate') || getLocalDateStr(),
                    };
                    updateState({ newRequest: { ...emptyRequest, ...newRequestData }, isNewRequestDialogOpen: true });
                    // Clean URL
                    window.history.replaceState({}, '', '/dashboard/requests');
                }
            }
        }
    }, [isAuthReady, searchParams, customers, products, updateState]);

    useEffect(() => {
        updateState({ companyData: authCompanyData });
    }, [authCompanyData, updateState]);
    
    const getRequestPermissions = useCallback((request: PurchaseRequest): Record<string, { allowed: boolean; visible: boolean; reason: string | null }> => {
        const createResult = (allowed: boolean, reason: string | null = null, visible = true) => ({ allowed, reason: allowed ? null : reason, visible });
    
        const isPending = request.status === 'pending';
        const isPurchasingReview = request.status === 'purchasing-review';
        const isPendingApproval = request.status === 'pending-approval';
        const isApproved = request.status === 'approved';
        const isOrdered = request.status === 'ordered';
        const isReceivedInWarehouse = request.status === 'received-in-warehouse';
        
        let finalArchivedStatus: PurchaseRequestStatus = 'ordered';
        if (state.requestSettings?.useErpEntry) {
            finalArchivedStatus = 'entered-erp';
        } else if (state.requestSettings?.useWarehouseReception) {
            finalArchivedStatus = 'received-in-warehouse';
        }
        const isArchived = request.status === finalArchivedStatus || request.status === 'canceled';

        return {
            canEdit: createResult((isPending || isPurchasingReview || isPendingApproval) && hasPermission('requests:edit:pending'), 'Solo se puede editar en estados iniciales.'),
            canReopen: createResult(isArchived && hasPermission('requests:reopen'), 'Solo para solicitudes archivadas.'),
            canSendToReview: createResult(isPending && hasPermission('requests:status:review'), 'Solo desde estado Pendiente.'),
            canGoBackToPending: createResult(isPurchasingReview && hasPermission('requests:status:review'), 'Solo desde Revisión Compras.'),
            canSendToApproval: createResult(isPurchasingReview && hasPermission('requests:status:pending-approval'), 'Solo desde Revisión Compras.'),
            canGoBackToReview: createResult(isPendingApproval && hasPermission('requests:status:pending-approval'), 'Solo desde Pendiente Aprobación.'),
            canApprove: createResult(isPendingApproval && hasPermission('requests:status:approve'), 'Solo desde Pendiente Aprobación.'),
            canOrder: createResult(isApproved && hasPermission('requests:status:ordered'), 'Solo para solicitudes Aprobadas.'),
            canRevertToApproved: createResult(isOrdered && hasPermission('requests:status:revert-to-approved'), 'Solo para solicitudes Ordenadas.'),
            canReceiveInWarehouse: createResult(isOrdered && !!state.requestSettings?.useWarehouseReception && hasPermission('requests:status:received-in-warehouse'), 'Paso no habilitado o estado incorrecto.'),
            canEnterToErp: createResult(isReceivedInWarehouse && !!state.requestSettings?.useErpEntry && hasPermission('requests:status:entered-erp'), 'Paso no habilitado o estado incorrecto.'),
            canRequestCancel: createResult((isApproved || isOrdered) && hasPermission('requests:status:cancel'), 'Solo para solicitudes Aprobadas u Ordenadas.'),
            canCancelPending: createResult((isPending || isPurchasingReview || isPendingApproval) && hasPermission('requests:status:cancel'), 'Solo en estados iniciales.'),
            canRequestUnapproval: createResult((isApproved || isOrdered) && hasPermission('requests:status:unapproval-request'), 'Solo para solicitudes Aprobadas u Ordenadas.'),
            canAddNote: createResult(hasPermission('requests:notes:add'), 'Permiso requerido.'),
        };
    }, [hasPermission, state.requestSettings]);

    const executeStatusUpdate = async (statusOverride?: PurchaseRequestStatus) => {
        const finalStatus = statusOverride || state.newStatus;
        if (!state.requestToUpdate || !finalStatus || !currentUser) return;
        updateState({ isSubmitting: true });
        try {
            await updatePurchaseRequestStatus({ 
                requestId: state.requestToUpdate.id, 
                status: finalStatus, 
                notes: state.statusUpdateNotes, 
                updatedBy: currentUser.name, 
                reopen: false, 
                deliveredQuantity: finalStatus === 'received-in-warehouse' ? Number(state.deliveredQuantity) : undefined,
                arrivalDate: finalStatus === 'ordered' ? state.arrivalDate : undefined,
                erpEntryNumber: finalStatus === 'entered-erp' ? state.erpEntryNumber : undefined,
            });
            
            toast({ title: "Estado Actualizado" });
            
            updateState({
                isStatusDialogOpen: false,
                isActionDialogOpen: false,
            });
            // Reload data to correctly move items between active/archived lists
            await loadInitialData(true);

        } catch (error: any) {
            logError("Failed to update status", { context: 'useRequests.executeStatusUpdate', error: error.message });
            toast({ title: "Error", variant: "destructive" });
        } finally {
            updateState({ isSubmitting: false });
        }
    };
    
    const handleAdminAction = async (approve: boolean) => {
        if (!state.requestToUpdate || !currentUser || !state.requestToUpdate.pendingAction || state.requestToUpdate.pendingAction === 'none') return;
        updateState({ isSubmitting: true });

        try {
            if (approve) {
                const targetStatus = state.requestToUpdate.pendingAction === 'unapproval-request' ? 'pending' : 'canceled';
                await executeStatusUpdate(targetStatus);
            } else {
                 const rawUpdated = await updatePendingAction({
                    entityId: state.requestToUpdate.id,
                    action: 'none',
                    notes: state.statusUpdateNotes,
                    updatedBy: currentUser.name,
                });
                const updated = sanitizeRequest(rawUpdated);
                toast({ title: 'Solicitud Rechazada' });
                updateState({
                    requests: state.requests.map(r => r.id === updated.id ? updated : r)
                });
            }
            updateState({ isActionDialogOpen: false });
        } catch (error: any) {
            logError("Failed to handle admin action", { context: 'useRequests.handleAdminAction', error: error.message });
            toast({ title: "Error", variant: "destructive" });
        } finally {
            updateState({ isSubmitting: false });
        }
    };

    const handleExportSingleRequestPDF = async (request: PurchaseRequest) => {
        if (!authCompanyData || !state.requestSettings) return;

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
        
        const doc = generateDocument({
            docTitle: "Solicitud de Compra",
            docId: request.consecutive,
            companyData: authCompanyData,
            logoDataUrl,
            meta: [
                { label: 'Fecha Solicitud', value: format(parseISO(request.requestDate), 'dd/MM/yyyy HH:mm') },
                { label: 'Fecha Requerida', value: format(parseISO(request.requiredDate), 'dd/MM/yyyy') },
                { label: 'Estado', value: statusConfig[request.status]?.label || request.status },
            ],
            blocks: [
                { title: 'Cliente', content: `${request.clientName}\nCédula: ${request.clientTaxId}` },
                { title: 'Solicitado Por', content: request.requestedBy },
            ],
            table: {
                columns: ["Código", "Descripción", "Cantidad"],
                rows: [[request.itemId, request.itemDescription, request.quantity.toLocaleString('es-CR')]],
                columnStyles: { 2: { halign: 'right' } }
            },
            notes: request.notes,
            totals: [],
            topLegend: state.requestSettings.pdfTopLegend
        });
    
        doc.save(`sc_${request.consecutive}.pdf`);
    };
    
    const actions = {
        loadInitialData,
        handleStatusUpdate: executeStatusUpdate,
        handleAdminAction,
        handleCreateRequest: async () => {
            if (!currentUser) return;
            
            if (!state.newRequest.clientId || !state.newRequest.itemId || !state.newRequest.quantity || !state.newRequest.requiredDate) {
                toast({ title: "Campos Requeridos", description: "Cliente, artículo, cantidad y fecha requerida son obligatorios.", variant: "destructive" });
                return;
            }
            if (state.newRequest.requiresCurrency && (!state.newRequest.unitSalePrice || state.newRequest.unitSalePrice <= 0)) {
                toast({ title: "Precio de Venta Requerido", description: "Debe ingresar un precio de venta mayor a cero o desmarcar la casilla 'Registrar Precio de Venta'.", variant: "destructive" });
                return;
            }

            const requestWithFormattedDate = {
                ...state.newRequest,
                requiredDate: formatDateToLocal(state.newRequest.requiredDate)
            };

            updateState({ isSubmitting: true });
            try {
                await savePurchaseRequest(requestWithFormattedDate, currentUser.name);
                toast({ title: "Solicitud Creada" });
                updateState({
                    isNewRequestDialogOpen: false,
                    newRequest: { ...emptyRequest, requiredDate: '', requiresCurrency: true },
                    clientSearchTerm: '',
                    itemSearchTerm: '',
                });
                await loadInitialData(true);
            } catch (error: any) {
                logError("Failed to create request", { context: 'useRequests.handleCreateRequest', error: error.message });
                toast({ title: "Error al Crear", description: `No se pudo crear la solicitud. ${error.message}`, variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },
        handleEditRequest: async (e: FormEvent) => {
            e.preventDefault();
            if (!state.requestToEdit || !currentUser) return;
            updateState({ isSubmitting: true });
            try {
                const updated = await updatePurchaseRequest({ requestId: state.requestToEdit.id, updatedBy: currentUser.name, ...state.requestToEdit });
                updateState({
                    requests: state.requests.map(r => r.id === updated.id ? sanitizeRequest(updated) : r),
                    isEditRequestDialogOpen: false
                });
                toast({ title: "Solicitud Actualizada" });
            } catch (error: any) {
                logError("Failed to edit request", { context: 'useRequests.handleEditRequest', error: error.message });
                toast({ title: "Error", variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },
        openStatusDialog: (request: PurchaseRequest, status: PurchaseRequestStatus) => {
            updateState({
                requestToUpdate: request,
                newStatus: status,
                statusUpdateNotes: ".",
                deliveredQuantity: status === 'received-in-warehouse' ? request.quantity : "",
                erpEntryNumber: "",
                arrivalDate: '',
                isStatusDialogOpen: true
            });
        },
        openAdminActionDialog: async (request: PurchaseRequest, action: AdministrativeAction) => {
            if (!currentUser) return;
            updateState({ isSubmitting: true });
            try {
                const updated = await updatePendingAction({
                    entityId: request.id,
                    action,
                    notes: `Solicitud de ${action === 'unapproval-request' ? 'desaprobación' : 'cancelación'} iniciada.`,
                    updatedBy: currentUser.name,
                });
                updateState({
                    requests: state.requests.map(r => r.id === updated.id ? sanitizeRequest(updated) : r)
                });
                toast({ title: "Solicitud Enviada", description: `Tu solicitud de ${action === 'unapproval-request' ? 'desaprobación' : 'cancelación'} ha sido enviada para revisión.` });
            } catch (error: any) {
                logError(`Failed to request ${action}`, { context: 'useRequests.openAdminActionDialog', error: error.message });
                toast({ title: "Error al Solicitar", description: `No se pudo enviar la solicitud. ${error.message}`, variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },
        handleOpenHistory: async (request: PurchaseRequest) => {
            updateState({ historyRequest: request, isHistoryDialogOpen: true, isHistoryLoading: true });
            try {
                updateState({ history: await getRequestHistory(request.id) });
            } catch (error: any) {
                logError("Failed to get history", { context: 'useRequests.handleOpenHistory', error: error.message});
                toast({ title: "Error", variant: "destructive" });
            } finally {
                updateState({ isHistoryLoading: false });
            }
        },
        handleReopenRequest: async () => {
            if (!state.requestToUpdate || !currentUser || state.reopenStep !== 2 || state.reopenConfirmationText !== 'REABRIR') return;
            updateState({ isSubmitting: true });
            try {
                await updatePurchaseRequestStatus({ requestId: state.requestToUpdate.id, status: 'pending', notes: 'Solicitud reabierta.', updatedBy: currentUser.name, reopen: true });
                toast({ title: "Solicitud Reabierta" });
                updateState({ isReopenDialogOpen: false });
                await loadInitialData(true);
            } catch (error: any) {
                logError("Failed to reopen request", { context: 'useRequests.handleReopenRequest', error: error.message });
                toast({ title: "Error", variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },
        handleSelectItem: (value: string) => {
            updateState({ isItemSearchOpen: false });
            const product = products.find(p => p.id === value);
            if (product) {
                const stock = authStockLevels.find(s => s.itemId === product.id)?.totalStock ?? 0;
                const dataToUpdate = { 
                    itemId: product.id, 
                    itemDescription: product.description || '', 
                    inventoryErp: stock 
                };
                if (state.requestToEdit) {
                     updateState({
                        requestToEdit: state.requestToEdit ? { ...state.requestToEdit, ...dataToUpdate } : null
                    });
                } else {
                    updateState({ newRequest: { ...state.newRequest, ...dataToUpdate }});
                }
                updateState({ itemSearchTerm: `[${product.id}] - ${product.description}` });
            } else {
                 updateState({ itemSearchTerm: '' });
            }
        },
        handleSelectClient: (value: string) => {
            updateState({ isClientSearchOpen: false });
            const client = customers.find(c => c.id === value);
            if (client) {
                const dataToUpdate = { clientId: client.id, clientName: client.name, clientTaxId: client.taxId };
                if (state.requestToEdit) {
                     updateState({
                        requestToEdit: state.requestToEdit ? { ...state.requestToEdit, ...dataToUpdate } : null
                    });
                } else {
                    updateState({ newRequest: { ...state.newRequest, ...dataToUpdate }});
                }
                updateState({ clientSearchTerm: `[${client.id}] ${client.name} (${client.taxId})` });
            } else {
                updateState({ clientSearchTerm: '' });
            }
        },
        handleFetchErpOrder: async () => {
            if (!state.erpOrderNumber) return;
            updateState({ isErpLoading: true });
            
            try {
                const { headers } = await getErpOrderData(state.erpOrderNumber);
                
                const enrichedHeaders = headers.map(h => {
                    const client = customers.find(c => c.id === h.CLIENTE);
                    return { ...h, CLIENTE_NOMBRE: client?.name || 'Cliente no encontrado' };
                }).sort((a, b) => {
                    if (a.PEDIDO === state.erpOrderNumber) return -1;
                    if (b.PEDIDO === state.erpOrderNumber) return 1;
                    return a.PEDIDO.localeCompare(b.PEDIDO);
                });

                if (enrichedHeaders.length === 1) {
                    await actions.processSingleErpOrder(enrichedHeaders[0]);
                } else if (enrichedHeaders.length > 1) {
                    updateState({ erpOrderHeaders: enrichedHeaders });
                } else {
                     toast({ title: "Pedido no encontrado", description: `No se encontró ningún pedido con el número: ${state.erpOrderNumber}`, variant: "destructive" });
                }
                
            } catch (error: any) {
                logError('Failed to fetch ERP order data', { context: 'useRequests.handleFetchErpOrder', error: error.message, orderNumber: state.erpOrderNumber });
                toast({ title: "Error al Cargar Pedido", description: error.message, variant: "destructive" });
            } finally {
                updateState({ isErpLoading: false });
            }
        },
        processSingleErpOrder: async (header: ErpOrderHeader) => {
            const client = customers.find(c => c.id === header.CLIENTE);
            const enrichedHeader = { ...header, CLIENTE_NOMBRE: client?.name || 'Cliente no encontrado' };
            
            const { lines, inventory } = await getErpOrderData(header.PEDIDO);

            const enrichedLines: UIErpOrderLine[] = lines.map(line => {
                const product = products.find(p => p.id === line.ARTICULO) || {id: line.ARTICULO, description: `Artículo ${line.ARTICULO} no encontrado`, active: 'N', cabys: '', classification: '', isBasicGood: 'N', lastEntry: '', notes: '', unit: ''};
                const stock = inventory.find(s => s.itemId === line.ARTICULO) || null;
                const needsBuying = stock ? line.CANTIDAD_PEDIDA > stock.totalStock : true;
                return {
                    ...line,
                    product,
                    stock,
                    selected: needsBuying,
                    displayQuantity: String(line.CANTIDAD_PEDIDA),
                    displayPrice: String(line.PRECIO_UNITARIO),
                };
            }).sort((a, b) => (a.selected === b.selected) ? 0 : a.selected ? -1 : 1);

            updateState({
                selectedErpOrderHeader: enrichedHeader,
                erpOrderLines: enrichedLines,
                isErpOrderModalOpen: false,
                isErpItemsModalOpen: true,
            });
        },
        handleSelectErpOrderHeader: async (header: ErpOrderHeader) => {
            updateState({ isErpLoading: true, isErpOrderModalOpen: false });
            
            try {
                await actions.processSingleErpOrder(header);
            } catch (error: any) {
                logError('Failed to fetch lines for selected ERP order', { context: 'useRequests.handleSelectErpOrderHeader', error: error.message, orderNumber: header.PEDIDO });
                toast({ title: "Error al Cargar Líneas", description: error.message, variant: "destructive" });
            } finally {
                updateState({ isErpLoading: false });
            }
        },
        handleCancelErpFetch: () => {
            updateState({
                isErpLoading: false,
                isErpOrderModalOpen: false,
                erpOrderHeaders: [],
                erpOrderNumber: ''
            });
        },
        handleErpLineChange: (lineIndex: number, field: keyof UIErpOrderLine, value: string | boolean) => {
            if (lineIndex === -1) { // Select/Deselect all
                 updateState({ erpOrderLines: state.erpOrderLines.map(line => ({ ...line, selected: !!value })) });
            } else {
                updateState({
                    erpOrderLines: state.erpOrderLines.map((line, index) => 
                        index === lineIndex ? { ...line, [field]: value } : line
                    )
                });
            }
        },
        handleCreateRequestsFromErp: async () => {
            if (!state.selectedErpOrderHeader || !currentUser) return;
            const erpHeader = state.selectedErpOrderHeader;
            const client = customers.find(c => c.id === erpHeader.CLIENTE);

            const selectedLines = state.erpOrderLines.filter(line => line.selected);
            if (selectedLines.length === 0) {
                toast({ title: "No hay artículos seleccionados", description: "Marque al menos un artículo para crear solicitudes.", variant: "destructive" });
                return;
            }

            updateState({ isSubmitting: true });
            try {
                for (const line of selectedLines) {
                    const requestPayload: Omit<PurchaseRequest, 'id'|'consecutive'|'requestDate'|'status'|'reopened'|'requestedBy'|'deliveredQuantity'|'receivedInWarehouseBy'|'receivedDate'|'previousStatus'|'lastModifiedAt'|'lastModifiedBy'|'hasBeenModified'|'approvedBy'|'lastStatusUpdateBy'|'lastStatusUpdateNotes'> = {
                        requiredDate: formatDateToLocal(erpHeader.FECHA_PROMETIDA),
                        clientId: erpHeader.CLIENTE,
                        clientName: client?.name || erpHeader.CLIENTE_NOMBRE || '',
                        clientTaxId: customers.find(c => c.id === erpHeader.CLIENTE)?.taxId || '',
                        itemId: line.ARTICULO,
                        itemDescription: line.product.description,
                        quantity: parseFloat(line.displayQuantity) || 0,
                        notes: `Generado desde Pedido ERP: ${erpHeader.PEDIDO}`,
                        unitSalePrice: parseFloat(line.displayPrice) || 0,
                        salePriceCurrency: (erpHeader.MONEDA_PEDIDO === 'DOL' ? 'USD' : 'CRC') as 'CRC' | 'USD',
                        requiresCurrency: true,
                        purchaseOrder: erpHeader.ORDEN_COMPRA || '',
                        erpOrderNumber: erpHeader.PEDIDO,
                        erpOrderLine: line.PEDIDO_LINEA,
                        priority: 'medium' as PurchaseRequestPriority,
                        purchaseType: 'single' as const,
                        route: '',
                        shippingMethod: '',
                        inventory: 0,
                        inventoryErp: line.stock?.totalStock || 0,
                        manualSupplier: '',
                        arrivalDate: '',
                        pendingAction: 'none' as const,
                        analysis: undefined,
                    };
                    await savePurchaseRequest(requestPayload, currentUser.name);
                }
                toast({ title: "Solicitudes Creadas", description: `Se crearon ${selectedLines.length} solicitudes de compra.` });
                updateState({ isErpItemsModalOpen: false, erpOrderNumber: '' });
                await loadInitialData();
            } catch (error: any) {
                logError("Failed to create requests from ERP order", { context: 'useRequests.handleCreateRequestsFromErp', error: error.message });
                toast({ title: "Error al Crear Solicitudes", description: error.message, variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },
        handleExportExcel: () => {
            if (!state.requestSettings) return;
            
            const dataToExport = selectors.filteredRequests.map(request => [
                request.consecutive,
                request.itemDescription,
                request.clientName,
                request.quantity,
                format(parseISO(request.requiredDate), 'dd/MM/yyyy'),
                statusConfig[request.status]?.label || request.status,
                request.requestedBy,
                request.purchaseOrder,
                request.manualSupplier,
            ]);

            exportToExcel({
                fileName: 'solicitudes_compra',
                sheetName: 'Solicitudes',
                headers: ['Solicitud', 'Artículo', 'Cliente', 'Cant.', 'Fecha Req.', 'Estado', 'Solicitante', 'OC Cliente', 'Proveedor'],
                data: dataToExport,
                columnWidths: [12, 40, 25, 8, 12, 15, 15, 15, 20],
            });
        },
        handleExportPDF: async (orientation: 'portrait' | 'landscape' = 'portrait') => {
            if (!authCompanyData || !state.requestSettings) return;
        
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
            
            const tableHeaders = ['Solicitud', 'Artículo', 'Cliente', 'Cant.', 'Fecha Req.', 'Estado'];
            const tableRows: RowInput[] = selectors.filteredRequests.map(request => [
                request.consecutive,
                `[${request.itemId}] ${request.itemDescription}`,
                request.clientName,
                request.quantity.toLocaleString('es-CR'),
                format(parseISO(request.requiredDate), 'dd/MM/yy'),
                statusConfig[request.status]?.label || request.status,
            ]);

            const doc = generateDocument({
                docTitle: `Solicitudes de Compra (${state.viewingArchived ? 'Archivadas' : 'Activas'})`,
                docId: '',
                companyData: authCompanyData,
                logoDataUrl,
                meta: [{ label: 'Generado', value: format(new Date(), 'dd/MM/yyyy HH:mm') }],
                blocks: [],
                table: {
                    columns: tableHeaders,
                    rows: tableRows,
                    columnStyles: { 3: { halign: 'right' } }
                },
                totals: [],
                orientation: orientation,
                topLegend: state.requestSettings.pdfTopLegend
            });
        
            doc.save(`solicitudes_compra_${new Date().getTime()}.pdf`);
        },
        openAddNoteDialog: (request: PurchaseRequest) => {
            if (!currentUser) return;
            updateState({
                notePayload: { requestId: request.id, notes: '', updatedBy: currentUser.name },
                isAddNoteDialogOpen: true
            });
        },
    
        handleAddNote: async () => {
            if (!state.notePayload || !state.notePayload.notes.trim() || !currentUser) return;
            updateState({ isSubmitting: true });
            try {
                const updatedRequest = await addNoteToRequest(state.notePayload);
                toast({ title: "Nota Añadida" });
                setState(prevState => ({
                    ...prevState,
                    isAddNoteDialogOpen: false,
                    requests: prevState.requests.map(o => o.id === updatedRequest.id ? sanitizeRequest(updatedRequest) : o)
                }));
            } catch(error: any) {
                logError("Failed to add note to request", { context: 'useRequests.handleAddNote', error: error.message });
                toast({ title: "Error", variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },
        handleDetailUpdate: async (requestId: number, details: { priority: PurchaseRequestPriority }) => {
            if (!currentUser) return;
            const updated = await updateRequestDetailsServer({ requestId, ...details, updatedBy: currentUser.name });
            updateState({ 
                requests: state.requests.map(o => o.id === requestId ? sanitizeRequest(updated) : o)
            });
        },
        setNewRequest: (updater: (prev: State['newRequest']) => State['newRequest']) => {
            const newState = updater(state.newRequest);
            if (newState.requiresCurrency && !newState.salePriceCurrency) {
                newState.salePriceCurrency = 'CRC';
            }
            updateState({ newRequest: newState });
        },
        handleOpenTransits: (request: PurchaseRequest) => {
            const activePoNumbers = new Set(state.erpPoHeaders.filter(h => h.ESTADO === 'A').map(h => h.ORDEN_COMPRA));
            const transitsForProduct = state.erpPoLines
                .filter(line => line.ARTICULO === request.itemId && activePoNumbers.has(line.ORDEN_COMPRA))
                .map(line => {
                    const header = state.erpPoHeaders.find(h => h.ORDEN_COMPRA === line.ORDEN_COMPRA);
                    return {
                        ...header,
                        quantity: line.CANTIDAD_ORDENADA,
                        supplierName: 'Desconocido' // This needs to be fetched from suppliers table
                    };
                });
            
            updateState({ 
                activeTransits: {
                    itemId: request.itemId,
                    itemDescription: request.itemDescription,
                    transits: transitsForProduct
                },
                isTransitsDialogOpen: true 
            });
        },
        openCostAnalysisDialog: (request: PurchaseRequest) => {
            updateState({
                requestToUpdate: request,
                analysisCost: request.analysis?.cost?.toString() || '',
                analysisSalePrice: request.unitSalePrice?.toString() || '',
                isCostAnalysisDialogOpen: true,
            });
        },
        handleSaveCostAnalysis: async () => {
            if (!state.requestToUpdate) return;
            const cost = parseFloat(state.analysisCost);
            const salePrice = parseFloat(state.analysisSalePrice);
            if (isNaN(cost) || isNaN(salePrice)) {
                toast({ title: "Valores inválidos", description: "El costo y el precio de venta deben ser números.", variant: "destructive" });
                return;
            }
            updateState({ isSubmitting: true });
            try {
                const updatedRequest = await saveCostAnalysisAction(state.requestToUpdate.id, cost, salePrice);
                toast({ title: "Análisis Guardado" });
                setState(prevState => ({
                    ...prevState,
                    isCostAnalysisDialogOpen: false,
                    requests: prevState.requests.map(r => r.id === updatedRequest.id ? sanitizeRequest(updatedRequest) : r),
                }));
            } catch (error: any) {
                logError("Failed to save cost analysis", { error: error.message, requestId: state.requestToUpdate.id });
                toast({ title: "Error", description: `No se pudo guardar el análisis: ${error.message}`, variant: "destructive" });
            } finally {
                updateState({ isSubmitting: false });
            }
        },
        handleExportSingleRequestPDF,
        // setters
        setViewingArchived: (isArchived: boolean) => updateState({ viewingArchived: isArchived, currentPage: 0 }),
        setCurrentPage: (page: number | ((p: number) => number)) => updateState({ currentPage: typeof page === 'function' ? page(state.currentPage) : page }),
        setNewRequestDialogOpen: (isOpen: boolean) => updateState({ 
            isNewRequestDialogOpen: isOpen, 
            newRequest: { ...emptyRequest, requiredDate: getLocalDateStr(), requiresCurrency: true }, 
            clientSearchTerm: '', 
            itemSearchTerm: '' 
        }),
        setEditRequestDialogOpen: (isOpen: boolean) => updateState({ isEditRequestDialogOpen: isOpen }),
        setRequestToEdit: (request: PurchaseRequest | null) => updateState({ requestToEdit: request }),
        setStatusFilter: (filter: string[]) => updateState({ statusFilter: filter, currentPage: 0 }),
        setClassificationFilter: (filter: string) => updateState({ classificationFilter: filter, currentPage: 0 }),
        setShowOnlyMyRequests: (show: boolean) => {
            if (!show && !hasPermission('requests:read:all')) {
                toast({ title: "Permiso Requerido", description: "No tienes permiso para ver todas las solicitudes.", variant: "destructive"});
                return;
            }
            updateState({ showOnlyMyRequests: show, currentPage: 0 });
        },
        setClientSearchTerm: (term: string) => updateState({ clientSearchTerm: term }),
        setClientSearchOpen: (isOpen: boolean) => updateState({ isClientSearchOpen: isOpen }),
        setItemSearchTerm: (term: string) => updateState({ itemSearchTerm: term }),
        setItemSearchOpen: (isOpen: boolean) => updateState({ isItemSearchOpen: isOpen }),
        setStatusDialogOpen: (isOpen: boolean) => updateState({ isStatusDialogOpen: isOpen }),
        setRequestToUpdate: (request: PurchaseRequest | null) => updateState({ requestToUpdate: request }),
        setNewStatus: (status: PurchaseRequestStatus | null) => updateState({ newStatus: status }),
        setStatusUpdateNotes: (notes: string) => updateState({ statusUpdateNotes: notes }),
        setDeliveredQuantity: (qty: number | string) => updateState({ deliveredQuantity: qty }),
        setErpEntryNumber: (num: string) => updateState({ erpEntryNumber: num }),
        setHistoryDialogOpen: (isOpen: boolean) => updateState({ isHistoryDialogOpen: isOpen }),
        setReopenDialogOpen: (isOpen: boolean) => updateState({ isReopenDialogOpen: isOpen }),
        setReopenStep: (step: number) => updateState({ reopenStep: step }),
        setReopenConfirmationText: (text: string) => updateState({ reopenConfirmationText: text }),
        setArrivalDate: (date: string) => updateState({ arrivalDate: date }),
        setActionDialogOpen: (isOpen: boolean) => updateState({ isActionDialogOpen: isOpen }),
        setErpOrderModalOpen: (isOpen: boolean) => updateState({ isErpOrderModalOpen: isOpen, erpOrderHeaders: [], erpOrderNumber: '' }),
        setErpItemsModalOpen: (isOpen: boolean) => updateState({ isErpItemsModalOpen: isOpen }),
        setErpOrderNumber: (num: string) => updateState({ erpOrderNumber: num }),
        setShowOnlyShortageItems: (show: boolean) => updateState({ showOnlyShortageItems: show }),
        setContextInfoOpen: (request: PurchaseRequest | null) => updateState({ isContextInfoOpen: !!request, contextInfoData: request }),
        setAddNoteDialogOpen: (isOpen: boolean) => updateState({ isAddNoteDialogOpen: isOpen }),
        setNotePayload: (payload: RequestNotePayload | null) => updateState({ notePayload: payload }),
        setTransitsDialogOpen: (isOpen: boolean) => updateState({ isTransitsDialogOpen: isOpen }),
        setCostAnalysisDialogOpen: (isOpen: boolean) => updateState({ isCostAnalysisDialogOpen: isOpen }),
        setAnalysisCost: (cost: string) => updateState({ analysisCost: cost }),
        setAnalysisSalePrice: (price: string) => updateState({ analysisSalePrice: price }),
        setSearchTerm: (term: string) => updateState({ searchTerm: term, currentPage: 0 }),
        setDateFilter: (range: DateRange | undefined) => updateState({ dateFilter: range, currentPage: 0 }),
        setRowsPerPage: (size: number) => updateState({ rowsPerPage: size, currentPage: 0 }),
    };

    const selectors = {
        hasPermission,
        priorityConfig,
        statusConfig,
        getRequestPermissions,
        getDaysRemaining: (dateStr: string) => getSimpleDaysRemaining(dateStr),
        clientOptions: useMemo(() => {
            if (debouncedClientSearch.length < 2) return [];
            const searchTerms = normalizeText(debouncedClientSearch).split(' ').filter(Boolean);
            return customers.filter(c => {
                const targetText = normalizeText(`${c.id} ${c.name} ${c.taxId}`);
                return searchTerms.every(term => targetText.includes(term));
            }).map(c => ({ value: c.id, label: `[${c.id}] ${c.name} (${c.taxId})` }));
        }, [customers, debouncedClientSearch]),
        itemOptions: useMemo(() => {
            if (debouncedItemSearch.length < 2) return [];
            const searchTerms = normalizeText(debouncedItemSearch).split(' ').filter(Boolean);
            return products.filter(p => {
                const targetText = normalizeText(`${p.id} ${p.description}`);
                return searchTerms.every(term => targetText.includes(term));
            }).map(p => ({ value: p.id, label: `[${p.id}] - ${p.description}` }));
        }, [products, debouncedItemSearch]),
        classifications: useMemo(() => Array.from(new Set(products.map(p => p.classification).filter(Boolean))), [products]),
        filteredRequests: state.requests,
        stockLevels: authStockLevels,
        totalItems: state.viewingArchived ? state.totalArchived : state.totalActive,
        totalActive: state.totalActive,
        totalArchived: state.totalArchived,
        visibleErpOrderLines: useMemo(() => {
            if (!state.showOnlyShortageItems) {
                return state.erpOrderLines;
            }
            return state.erpOrderLines.filter(line => {
                const needsBuying = line.stock ? line.CANTIDAD_PEDIDA > line.stock.totalStock : true;
                return needsBuying;
            });
        }, [state.erpOrderLines, state.showOnlyShortageItems]),
        getInTransitStock: useCallback((itemId: string): number => {
            const activePoNumbers = new Set(state.erpPoHeaders.filter(h => h.ESTADO === 'A').map(h => h.ORDEN_COMPRA));
            return state.erpPoLines
                .filter(line => line.ARTICULO === itemId && activePoNumbers.has(line.ORDEN_COMPRA))
                .reduce((sum, line) => sum + line.CANTIDAD_ORDENADA, 0);
        }, [state.erpPoHeaders, state.erpPoLines]),
        costAnalysis: useMemo(() => {
            const cost = parseFloat(state.analysisCost);
            const salePrice = parseFloat(state.analysisSalePrice);
            let margin = 0;
            if (!isNaN(cost) && !isNaN(salePrice) && salePrice > 0) {
                 margin = ((salePrice - cost) / salePrice) * 100;
            }
            return { cost: state.analysisCost, salePrice: state.analysisSalePrice, margin };
        }, [state.analysisCost, state.analysisSalePrice]),
    };

    return {
        state,
        actions,
        selectors,
        isAuthorized
    };
}
