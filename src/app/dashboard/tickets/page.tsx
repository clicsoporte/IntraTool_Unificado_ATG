'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { 
    getDepartments, 
    getTickets, 
    createTicket, 
    updateTicketStatus, 
    assignTicket, 
    getTechnicians,
    getInventoryItems,
    addPartToTicket,
    removePartFromTicket,
    getTicketParts,
    RepairTicket,
    TicketPart,
    InventoryItem,
    getMaintenanceTypesByDept,
    getTicketConsumables,
    deductTicketConsumables,
    removeConsumableFromTicket,
    getTicketHistory,
    updateTicketDetails
} from '@/modules/inventory/lib/actions';
import { 
    Card, CardContent, CardDescription, CardHeader, CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle 
} from '@/components/ui/dialog';
import { 
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
    Search, Plus, ShieldAlert, CheckCircle2, AlertCircle, Wrench, Settings, Trash2, Clock, User, HardDrive, Camera, SlidersHorizontal
} from 'lucide-react';

interface Department {
    id: number;
    name: string;
    description: string | null;
    is_active: number;
}

const parseLogPhoto = (text: string | null | undefined) => {
    if (!text) return { cleanText: "", photoFilename: null };
    const match = text.match(/\[Foto:\s*([^\]]+)\]/);
    if (match) {
        const photoFilename = match[1];
        const cleanText = text.replace(match[0], "").trim();
        return { cleanText, photoFilename };
    }
    return { cleanText: text, photoFilename: null };
};

interface Technician {
    id: number;
    name: string;
}

import { useAuthorization } from '@/modules/core/hooks/useAuthorization';

export default function SupportTicketsPage() {
    const { setTitle } = usePageTitle();
    const { user, isAuthReady } = useAuth();
    const { hasPermission } = useAuthorization();

    // Core States
    const [departments, setDepartments] = useState<Department[]>([]);
    const [selectedDeptId, setSelectedDeptId] = useState<number | undefined>(undefined);
    const [tickets, setTickets] = useState<RepairTicket[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [loadingDepts, setLoadingDepts] = useState(true);
    const [loadingTickets, setLoadingTickets] = useState(true);

    // Filters
    const [statusFilter, setStatusFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');

    // Sorting
    const [sortField, setSortField] = useState<'consecutive' | 'subject' | 'equipment_name' | 'status' | 'priority' | 'assignee_name' | null>(null);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    // Modals
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState<RepairTicket | null>(null);
    const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
    const [isOdometerDialogOpen, setIsOdometerDialogOpen] = useState(false);
    const [odometerValue, setOdometerValue] = useState<string>('');

    // Parts linking section inside detail modal
    const [ticketParts, setTicketParts] = useState<TicketPart[]>([]);
    const [loadingParts, setLoadingParts] = useState(false);
    const [invItems, setInvItems] = useState<InventoryItem[]>([]);
    const [searchItem, setSearchItem] = useState('');
    const [selectedItemId, setSelectedItemId] = useState('');
    const [consumeQty, setConsumeQty] = useState(1);
    
    // Dynamic Maintenance Types
    const [maintenanceTypes, setMaintenanceTypes] = useState<string[]>([]);
    
    // Forms
    const [newTicketForm, setNewTicketForm] = useState({
        subject: '',
        description: '',
        priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
        maintenanceType: 'corrective' as string,
        equipmentName: '',
        brand: '',
        model: '',
        serialNumber: ''
    });

    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // IT Assets & Consumables states
    const [itAssets, setItAssets] = useState<any[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [loadingAssets, setLoadingAssets] = useState(false);
    const [linkedAssetId, setLinkedAssetId] = useState<number | undefined>(undefined);

    const [ticketConsumables, setTicketConsumables] = useState<any[]>([]);
    const [loadingConsumables, setLoadingConsumables] = useState(false);
    const [selectedConsumableItemId, setSelectedConsumableItemId] = useState('');
    const [consumeConsumableQty, setConsumeConsumableQty] = useState(1);
    const [consumableSearchItem, setConsumableSearchItem] = useState('');
    const [invConsumables, setInvConsumables] = useState<InventoryItem[]>([]);
    const [ticketHistory, setTicketHistory] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({
        subject: '',
        description: '',
        priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
        maintenanceType: 'corrective' as string,
        equipmentName: '',
        brand: '',
        model: '',
        serialNumber: ''
    });

    const handleSort = (field: 'consecutive' | 'subject' | 'equipment_name' | 'status' | 'priority' | 'assignee_name') => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
    };

    const sortedTickets = useMemo(() => {
        return [...tickets].sort((a, b) => {
            if (!sortField) return 0;
            let valA = a[sortField] || '';
            let valB = b[sortField] || '';

            if (sortField === 'priority') {
                const weights = { low: 1, medium: 2, high: 3, urgent: 4 };
                const wA = weights[a.priority as keyof typeof weights] || 0;
                const wB = weights[b.priority as keyof typeof weights] || 0;
                return sortOrder === 'asc' ? wA - wB : wB - wA;
            }

            if (sortField === 'status') {
                const weights = { open: 1, in_progress: 2, on_hold: 3, completed: 4, canceled: 5 };
                const wA = weights[a.status as keyof typeof weights] || 0;
                const wB = weights[b.status as keyof typeof weights] || 0;
                return sortOrder === 'asc' ? wA - wB : wB - wA;
            }

            valA = String(valA).toLowerCase();
            valB = String(valB).toLowerCase();

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }, [tickets, sortField, sortOrder]);

    const loadHistoryList = async (ticketId: number) => {
        setLoadingHistory(true);
        try {
            const hist = await getTicketHistory(ticketId);
            setTicketHistory(hist);
        } catch (err) {
            console.error("Error loading ticket history", err);
        } finally {
            setLoadingHistory(false);
        }
    };

    useEffect(() => {
        if (selectedTicket) {
            setEditForm({
                subject: selectedTicket.subject,
                description: selectedTicket.description,
                priority: selectedTicket.priority,
                maintenanceType: selectedTicket.maintenance_type || 'corrective',
                equipmentName: selectedTicket.equipment_name,
                brand: selectedTicket.brand || '',
                model: selectedTicket.model || '',
                serialNumber: selectedTicket.serial_number || ''
            });
        } else {
            setIsEditing(false);
        }
    }, [selectedTicket]);

    const [collaborators, setCollaborators] = useState<any[]>([]);
    const [requesterName, setRequesterName] = useState('');

    const isItDept = selectedDeptId === 2 || 
        departments.find(d => d.id === selectedDeptId)?.name.toLowerCase().includes('ti') || 
        departments.find(d => d.id === selectedDeptId)?.name.toLowerCase().includes('tecnolog');

    const isFleetTaller = selectedDeptId === 1 || 
        departments.find(d => d.id === selectedDeptId)?.name.toLowerCase().includes('taller') || 
        departments.find(d => d.id === selectedDeptId)?.name.toLowerCase().includes('flota');

    useEffect(() => {
        if (isItDept) {
            setLoadingAssets(true);
            import('@/modules/it-tools/lib/actions')
                .then(async (mod) => {
                    const [assetsData, usersData, employeesData] = await Promise.all([
                        mod.getItAssets(),
                        mod.getSystemUsersList(),
                        mod.getPayrollEmployeesList()
                    ]);
                    setItAssets(assetsData);
                    
                    // Build system users list (only users of the system can request tickets)
                    const list: any[] = [];
                    usersData.forEach((u: any) => {
                        const linkedEmp = u.employeeId ? employeesData.find((emp: any) => String(emp.id) === String(u.employeeId)) : null;
                        list.push({
                            name: u.name,
                            detail: linkedEmp ? `${u.name} (Planilla: ${linkedEmp.name})` : `${u.name} (Usuario Local)`
                        });
                    });
                    setCollaborators(list.sort((a, b) => a.name.localeCompare(b.name)));
                    setLoadingAssets(false);
                })
                .catch((err) => {
                    console.error("Error loading IT assets", err);
                    setLoadingAssets(false);
                });
        } else if (isFleetTaller) {
            setLoadingAssets(true);
            Promise.all([
                import('@/modules/fleet/lib/actions'),
                import('@/modules/it-tools/lib/actions')
            ])
                .then(async ([fleetMod, itMod]) => {
                    const [vehiclesData, usersData, employeesData] = await Promise.all([
                        fleetMod.getAllVehiclesAction(),
                        itMod.getSystemUsersList(),
                        itMod.getPayrollEmployeesList()
                    ]);
                    setVehicles(vehiclesData);
                    
                    // Build system users list as collaborators (only users of the system can request/report tickets)
                    const list: any[] = [];
                    usersData.forEach((u: any) => {
                        const linkedEmp = u.employeeId ? employeesData.find((emp: any) => String(emp.id) === String(u.employeeId)) : null;
                        list.push({
                            name: u.name,
                            detail: linkedEmp ? `${u.name} (Planilla: ${linkedEmp.name})` : `${u.name} (Usuario Local)`
                        });
                    });
                    setCollaborators(list.sort((a, b) => a.name.localeCompare(b.name)));
                    setLoadingAssets(false);
                })
                .catch((err) => {
                    console.error("Error loading fleet vehicles/users", err);
                    setLoadingAssets(false);
                });
        } else {
            setItAssets([]);
            setVehicles([]);
            setCollaborators([]);
        }
    }, [selectedDeptId, isItDept, isFleetTaller, departments]);

    const handleUpdateTicketRelations = async (assetId: number | null, reqName: string | null) => {
        if (!selectedTicket) return;
        try {
            const { updateTicketAssetAndRequester } = await import('@/modules/inventory/lib/actions');
            const result = await updateTicketAssetAndRequester(selectedTicket.id, assetId, reqName);
            if (result.success) {
                setSelectedTicket({
                    ...selectedTicket,
                    linked_asset_id: assetId || undefined,
                    requester_name: reqName || undefined
                } as any);
                loadTickets();
            }
        } catch (err) {
            console.error("Error updating ticket relations", err);
        }
    };

    // Fetch catalog of consumables for the IT department
    const searchInventoryConsumables = useCallback(async () => {
        if (!selectedDeptId) return;
        try {
            const items = await getInventoryItems(selectedDeptId, consumableSearchItem);
            // Filter only items that are marked as consumables (is_consumable === 1)
            setInvConsumables(items.filter(item => Number((item as any).is_consumable) === 1));
        } catch (err) {
            console.error("Error searching consumables", err);
        }
    }, [selectedDeptId, consumableSearchItem]);

    useEffect(() => {
        if (isDetailOpen && isItDept) {
            searchInventoryConsumables();
        }
    }, [consumableSearchItem, isDetailOpen, isItDept, searchInventoryConsumables]);


    useEffect(() => {
        setTitle("Mesa de Tickets y Reparaciones");
    }, [setTitle]);

    useEffect(() => {
        if (!selectedDeptId) {
            setMaintenanceTypes([]);
            return;
        }
        async function loadTypes() {
            try {
                const types = await getMaintenanceTypesByDept(Number(selectedDeptId));
                const names = types.map(t => t.name);
                setMaintenanceTypes(names);
                if (names.length > 0) {
                    setNewTicketForm(prev => ({ ...prev, maintenanceType: names[0].toLowerCase() }));
                } else {
                    setNewTicketForm(prev => ({ ...prev, maintenanceType: 'corrective' }));
                }
            } catch (err) {
                console.error("Error loading maintenance types", err);
            }
        }
        loadTypes();
    }, [selectedDeptId]);
    // Load static depts dynamic based on role permissions
    useEffect(() => {
        if (!isAuthReady) return;
        async function loadDepts() {
            try {
                const depts = await getDepartments();
                // Filter only active departments
                let filtered = depts.filter((d: Department) => Number(d.is_active) === 1);
                
                // If not super administrator, filter departments where they have read or create permissions
                if (!hasPermission('admin:access')) {
                    filtered = filtered.filter((d: Department) => {
                        return hasPermission(`tickets:read:${d.id}`) || hasPermission('tickets:read') || hasPermission(`tickets:create:${d.id}`);
                    });
                }

                setDepartments(filtered);
                // Do not preselect any department automatically to show the welcome screen
                setSelectedDeptId(undefined);
            } catch (err) {
                console.error("Error loading departments", err);
            } finally {
                setLoadingDepts(false);
            }
        }
        loadDepts();
    }, [isAuthReady, hasPermission]);

    // Load technicians dynamically based on selected department or selected ticket's department
    useEffect(() => {
        const deptId = isDetailOpen && selectedTicket ? selectedTicket.department_id : selectedDeptId;
        if (!deptId) return;
        async function loadTechs() {
            try {
                const techs = await getTechnicians(deptId);
                setTechnicians(techs);
            } catch (err) {
                console.error("Error loading technicians", err);
            }
        }
        loadTechs();
    }, [selectedDeptId, selectedTicket, isDetailOpen]);

    // Load tickets
    const loadTickets = useCallback(async () => {
        if (!selectedDeptId) return;
        setLoadingTickets(true);
        try {
            const data = await getTickets(selectedDeptId, { status: statusFilter, priority: priorityFilter });
            setTickets(data);
        } catch (err) {
            console.error("Error loading tickets", err);
        } finally {
            setLoadingTickets(false);
        }
    }, [selectedDeptId, statusFilter, priorityFilter]);

    useEffect(() => {
        loadTickets();
    }, [loadTickets]);

    // Load parts related to the selected ticket
    const loadPartsList = async (ticketId: number) => {
        setLoadingParts(true);
        try {
            const parts = await getTicketParts(ticketId);
            setTicketParts(parts);
        } catch (err) {
            console.error("Error loading ticket parts", err);
        } finally {
            setLoadingParts(false);
        }
    };

    // Load inventory catalog when searching parts to link
    const searchInventoryParts = useCallback(async () => {
        if (!selectedDeptId) return;
        try {
            const items = await getInventoryItems(selectedDeptId, searchItem);
            setInvItems(items);
        } catch (err) {
            console.error("Error searching inventory parts", err);
        }
    }, [selectedDeptId, searchItem]);

    useEffect(() => {
        if (isDetailOpen) {
            searchInventoryParts();
        }
    }, [searchItem, isDetailOpen, searchInventoryParts]);

    // Handle Create ticket
    const handleCreateTicket = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        setSuccessMsg('');
        
        if (!newTicketForm.subject.trim() || !newTicketForm.description.trim() || !newTicketForm.equipmentName.trim()) {
            setErrorMsg('El asunto, descripción y nombre de equipo son obligatorios.');
            return;
        }

        if (!selectedDeptId) {
            setErrorMsg('Por favor seleccione un departamento.');
            return;
        }

        try {
            const result = await createTicket({
                ...newTicketForm,
                departmentId: selectedDeptId,
                user: user?.name || 'Sistema',
                linkedAssetId,
                requesterName: requesterName || undefined
            });

            if (result.success) {
                setSuccessMsg(`Ticket ${'consecutive' in result ? result.consecutive : ''} registrado.`);
                setIsCreateOpen(false);
                setNewTicketForm({
                    subject: '',
                    description: '',
                    priority: 'medium',
                    maintenanceType: 'corrective',
                    equipmentName: '',
                    brand: '',
                    model: '',
                    serialNumber: ''
                });
                setLinkedAssetId(undefined);
                setRequesterName('');
                loadTickets();
            } else {
                setErrorMsg(('error' in result ? result.error : null) || 'Error al guardar ticket.');
            }
        } catch (err: any) {
            setErrorMsg(err.message);
        }
    };

    // Load consumables related to the selected ticket
    const loadConsumablesList = async (ticketId: number) => {
        setLoadingConsumables(true);
        try {
            const list = await getTicketConsumables(ticketId);
            setTicketConsumables(list);
        } catch (err) {
            console.error("Error loading ticket consumables", err);
        } finally {
            setLoadingConsumables(false);
        }
    };

    // Open detail dialog
    const openTicketDetail = async (ticket: RepairTicket) => {
        setSelectedTicket(ticket);
        setIsDetailOpen(true);
        loadPartsList(ticket.id);
        loadHistoryList(ticket.id);
        
        // If it's a TI department ticket, load consumables
        const isTicketIt = ticket.department_id === 2 || selectedDeptId === 2;
        if (isTicketIt) {
            loadConsumablesList(ticket.id);
        }
    };

    // Consume consumable inside ticket
    const handleLinkConsumable = async () => {
        if (!selectedTicket || !selectedConsumableItemId || consumeConsumableQty <= 0) return;
        setErrorMsg('');
        try {
            const result = await deductTicketConsumables(
                selectedTicket.id, 
                selectedConsumableItemId, 
                consumeConsumableQty, 
                user?.name || 'Sistema'
            );
            if (result.success) {
                setSelectedConsumableItemId('');
                setConsumeConsumableQty(1);
                loadConsumablesList(selectedTicket.id);
                searchInventoryConsumables(); // reload quantities
                loadHistoryList(selectedTicket.id);
            } else {
                setErrorMsg(('error' in result ? result.error : null) || 'Error al vincular consumible.');
            }
        } catch (err: any) {
            setErrorMsg(err.message);
        }
    };

    // Remove consumable
    const handleUnlinkConsumable = async (consumableId: number) => {
        if (!selectedTicket) return;
        try {
            const result = await removeConsumableFromTicket(
                selectedTicket.id, 
                consumableId, 
                user?.name || 'Sistema'
            );
            if (result.success) {
                loadConsumablesList(selectedTicket.id);
                searchInventoryConsumables(); // reload quantities
                loadHistoryList(selectedTicket.id);
            }
        } catch (err) {
            console.error("Error removing consumable", err);
        }
    };

    // Handle status update
    const handleStatusChange = async (status: any) => {
        if (!selectedTicket) return;
        if (status === 'completed' && selectedTicket.department_id === 1) {
            setOdometerValue('');
            setIsOdometerDialogOpen(true);
            return;
        }
        try {
            const result = await updateTicketStatus(selectedTicket.id, status, user?.name || 'Sistema');
            if (result.success) {
                setSelectedTicket({ ...selectedTicket, status });
                loadTickets();
                loadHistoryList(selectedTicket.id);
            }
        } catch (err) {
            console.error("Error changing ticket status", err);
        }
    };

    const handleConfirmOdometerComplete = async () => {
        if (!selectedTicket) return;
        const odometerNum = odometerValue.trim() ? parseFloat(odometerValue.replace(',', '.')) : undefined;
        try {
            const result = await updateTicketStatus(selectedTicket.id, 'completed', user?.name || 'Sistema', odometerNum);
            if (result.success) {
                setSelectedTicket({ ...selectedTicket, status: 'completed' });
                loadTickets();
                loadHistoryList(selectedTicket.id);
                setIsOdometerDialogOpen(false);
            }
        } catch (err) {
            console.error("Error completing ticket with odometer", err);
        }
    };

    // Handle assigning technician
    const handleAssignChange = async (techId: number | null) => {
        if (!selectedTicket) return;
        try {
            const result = await assignTicket(selectedTicket.id, techId);
            if (result.success) {
                const tech = technicians.find(t => t.id === techId);
                setSelectedTicket({ ...selectedTicket, assignee_id: techId, assignee_name: tech ? tech.name : null });
                loadTickets();
                loadHistoryList(selectedTicket.id);
            }
        } catch (err) {
            console.error("Error assigning ticket", err);
        }
    };

    // Consume part inside ticket
    const handleLinkPart = async () => {
        if (!selectedTicket || !selectedItemId || consumeQty <= 0) return;
        setErrorMsg('');
        try {
            const result = await addPartToTicket(selectedTicket.id, selectedItemId, consumeQty, user?.name || 'Sistema');
            if (result.success) {
                setSelectedItemId('');
                setConsumeQty(1);
                loadPartsList(selectedTicket.id);
                searchInventoryParts(); // reload quantities
                loadHistoryList(selectedTicket.id);
            } else {
                setErrorMsg(('error' in result ? result.error : null) || 'Error al vincular repuesto.');
            }
        } catch (err: any) {
            setErrorMsg(err.message);
        }
    };

    // Unlink part
    const handleUnlinkPart = async (partId: number) => {
        if (!selectedTicket) return;
        try {
            const result = await removePartFromTicket(selectedTicket.id, partId, user?.name || 'Sistema');
            if (result.success) {
                loadPartsList(selectedTicket.id);
                searchInventoryParts(); // reload quantities
                loadHistoryList(selectedTicket.id);
            }
        } catch (err) {
            console.error("Error unlinking part", err);
        }
    };

    if (!isAuthReady || loadingDepts) {
        return (
            <div className="p-4 md:p-6 space-y-6">
                <Skeleton className="h-12 w-64 rounded-xl" />
                <Skeleton className="h-32 w-full rounded-2xl" />
                <Skeleton className="h-96 w-full rounded-2xl" />
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 space-y-6 animate-in fade-in duration-500">
            {/* Header section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl text-white shadow-lg shadow-blue-200 dark:shadow-none">
                        <Wrench className="w-8 h-8" />
                    </div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Mesa de Servicio Técnico</h1>
                        <p className="text-sm md:text-base text-muted-foreground font-medium">Control de soporte, reparaciones de equipos y consumo de repuestos en vivo.</p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <Label htmlFor="dept-selector" className="sr-only">Seleccionar Instancia</Label>
                    <select
                        id="dept-selector"
                        value={selectedDeptId || ''}
                        onChange={(e) => setSelectedDeptId(e.target.value ? Number(e.target.value) : undefined)}
                        className="flex h-10 w-full sm:w-64 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <option value="" disabled>-- Seleccionar Departamento --</option>
                        {departments.map((dept) => (
                            <option key={dept.id} value={dept.id}>{dept.name}</option>
                        ))}
                    </select>

                    <Button 
                        onClick={() => setIsCreateOpen(true)} 
                        disabled={!selectedDeptId}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-lg disabled:opacity-50"
                    >
                        <Plus className="w-4 h-4 mr-2" /> Abrir Ticket
                    </Button>
                </div>
            </div>

            {!selectedDeptId ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center max-w-4xl mx-auto space-y-8 animate-in fade-in zoom-in duration-500">
                    <div className="p-6 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-3xl text-white shadow-xl shadow-blue-200 dark:shadow-none animate-pulse">
                        <Wrench className="w-16 h-16 animate-spin" style={{ animationDuration: '6s' }} />
                    </div>
                    <div className="space-y-4">
                        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">¡Bienvenido a la Mesa de Servicio Técnico!</h2>
                        <p className="text-lg text-muted-foreground font-medium max-w-2xl">
                            Para poder registrar mantenimientos, consultar solicitudes de reparación o gestionar el inventario de repuestos consumidos, por favor selecciona el departamento con el que deseas trabajar en la lista de abajo o en el menú superior.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full pt-6">
                        {departments.map((dept) => (
                            <button
                                key={dept.id}
                                onClick={() => setSelectedDeptId(dept.id)}
                                className="group p-6 text-left border rounded-2xl bg-white dark:bg-slate-900 shadow-sm hover:shadow-md hover:border-blue-500 transition-all duration-300 transform hover:-translate-y-1"
                            >
                                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl w-fit text-blue-600 dark:text-blue-400 font-bold mb-4">
                                    🔧 Instancia {dept.id}
                                </div>
                                <h3 className="font-bold text-lg group-hover:text-blue-600 transition-colors">{dept.name}</h3>
                                <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                                    {dept.description || 'Haga clic para ingresar a este taller de soporte.'}
                                </p>
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <>
                    {/* Quick Metrics */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <Card className="border-none shadow-md bg-white/50 backdrop-blur-md dark:bg-slate-900/50">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-bold text-muted-foreground">Total Recibidos</CardTitle>
                                <AlertCircle className="w-4 h-4 text-blue-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl md:text-3xl font-extrabold">{tickets.length}</div>
                            </CardContent>
                        </Card>

                        <Card className="border-none shadow-md bg-white/50 backdrop-blur-md dark:bg-slate-900/50">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-bold text-muted-foreground">Pendientes</CardTitle>
                                <Clock className="w-4 h-4 text-amber-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl md:text-3xl font-extrabold text-amber-600">
                                    {tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-none shadow-md bg-white/50 backdrop-blur-md dark:bg-slate-900/50">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-bold text-muted-foreground">Completados</CardTitle>
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl md:text-3xl font-extrabold text-emerald-600">
                                    {tickets.filter(t => t.status === 'completed').length}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-none shadow-md bg-white/50 backdrop-blur-md dark:bg-slate-900/50">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-bold text-muted-foreground">Urgentes</CardTitle>
                                <ShieldAlert className="w-4 h-4 text-red-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl md:text-3xl font-extrabold text-red-600">
                                    {tickets.filter(t => t.priority === 'urgent' && t.status !== 'completed').length}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Filter and Grid */}
                    <Card className="border-none shadow-md bg-white/50 backdrop-blur-md dark:bg-slate-900/50 animate-in fade-in slide-in-from-bottom-6 duration-500">
                        <CardHeader className="pb-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <CardTitle className="text-lg font-bold">Mesa de Soporte Activa</CardTitle>
                                <CardDescription>Consulta el estatus, los técnicos asignados y repuestos consumidos.</CardDescription>
                            </div>
                            <div className="flex flex-col sm:flex-row items-center gap-3">
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="flex h-10 w-full sm:w-48 rounded-md border border-input bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                                >
                                    <option value="all">Todos los estados</option>
                                    <option value="open">Abiertos</option>
                                    <option value="in_progress">En Progreso</option>
                                    <option value="on_hold">En Espera</option>
                                    <option value="completed">Completados</option>
                                    <option value="canceled">Cancelados</option>
                                </select>
                                <select
                                    value={priorityFilter}
                                    onChange={(e) => setPriorityFilter(e.target.value)}
                                    className="flex h-10 w-full sm:w-48 rounded-md border border-input bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                                >
                                    <option value="all">Todas las prioridades</option>
                                    <option value="low">Baja</option>
                                    <option value="medium">Media</option>
                                    <option value="high">Alta</option>
                                    <option value="urgent">Urgente</option>
                                </select>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {loadingTickets ? (
                                <div className="space-y-3 py-6">
                                    <Skeleton className="h-10 w-full" />
                                    <Skeleton className="h-10 w-full" />
                                </div>
                            ) : tickets.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground font-medium">
                                    No se registran solicitudes de soporte técnico con estos filtros.
                                </div>
                            ) : (
                                <div className="overflow-x-auto rounded-lg border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-slate-50 dark:bg-slate-900">
                                                <TableHead className="cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('consecutive')}>
                                                    Ticket {sortField === 'consecutive' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                                                </TableHead>
                                                <TableHead className="cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('subject')}>
                                                    Asunto {sortField === 'subject' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                                                </TableHead>
                                                <TableHead className="cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('equipment_name')}>
                                                    Equipo / Activo {sortField === 'equipment_name' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                                                </TableHead>
                                                <TableHead className="cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('status')}>
                                                    Estatus {sortField === 'status' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                                                </TableHead>
                                                <TableHead className="cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('priority')}>
                                                    Prioridad {sortField === 'priority' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                                                </TableHead>
                                                <TableHead className="cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => handleSort('assignee_name')}>
                                                    Asignado A {sortField === 'assignee_name' ? (sortOrder === 'asc' ? '▲' : '▼') : '↕'}
                                                </TableHead>
                                                <TableHead className="text-center">Acciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {sortedTickets.map((t) => {
                                                const isCompleted = t.status === 'completed';
                                                return (
                                                    <TableRow key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors">
                                                        <TableCell className="font-mono text-xs font-bold text-blue-600">
                                                            <div>{t.consecutive}</div>
                                                            <div className="text-[10px] text-muted-foreground font-medium mt-0.5">
                                                                {new Date(t.created_at).toLocaleDateString()}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="font-bold text-slate-800 dark:text-slate-200">{t.subject}</div>
                                                            <div className="text-xs text-muted-foreground truncate max-w-xs">{t.description}</div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="font-semibold text-sm">{t.equipment_name}</div>
                                                            <div className="text-xs text-muted-foreground font-mono">{t.brand || '-'} {t.model ? `/ ${t.model}` : ''}</div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="space-y-1">
                                                                <Badge className={
                                                                    t.status === 'open' ? 'bg-slate-100 text-slate-800' :
                                                                    t.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                                                    t.status === 'on_hold' ? 'bg-amber-100 text-amber-800' :
                                                                    t.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                                                                    'bg-red-100 text-red-800'
                                                                }>
                                                                    {t.status === 'open' ? 'Abierto' :
                                                                     t.status === 'in_progress' ? 'En Progreso' :
                                                                     t.status === 'on_hold' ? 'En Espera' :
                                                                     t.status === 'completed' ? 'Completado' : 'Cancelado'}
                                                                </Badge>
                                                                <div className="text-[10px] text-blue-600 dark:text-blue-400 font-bold capitalize">
                                                                    {t.maintenance_type === 'preventive' ? '📅 Preventivo' : t.maintenance_type === 'corrective' ? '⚙️ Correctivo' : t.maintenance_type === 'predictive' ? '🔍 Predictivo' : t.maintenance_type === 'installation' ? '🔌 Instalar' : t.maintenance_type === 'upgrade' ? '🚀 Mejora' : `🔧 ${t.maintenance_type || 'Correctivo'}`}
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge className={
                                                                t.priority === 'urgent' ? 'bg-red-600 text-white' :
                                                                t.priority === 'high' ? 'bg-orange-500 text-white' :
                                                                t.priority === 'medium' ? 'bg-blue-500 text-white' :
                                                                'bg-slate-400 text-white'
                                                            }>
                                                                {t.priority === 'urgent' ? 'Urgente' :
                                                                 t.priority === 'high' ? 'Alta' :
                                                                 t.priority === 'medium' ? 'Media' : 'Baja'}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                                            <div className="flex items-center gap-1.5">
                                                                <User className="w-3.5 h-3.5 text-muted-foreground" />
                                                                {t.assignee_name || <span className="text-muted-foreground font-medium text-xs">Sin asignar</span>}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <Button size="sm" onClick={() => openTicketDetail(t)} className="h-8 bg-slate-800 hover:bg-slate-900 text-white font-semibold">
                                                                Gestionar Ticket
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}

            {/* Modal Open Ticket */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-950">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">Abrir Ticket de Soporte / Reparación</DialogTitle>
                        <DialogDescription>Registra el caso de falla o mantenimiento preventivo.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateTicket} className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                        {isItDept && (
                            <>
                                <div className="col-span-full space-y-2">
                                    <Label htmlFor="tkt-requester">Solicitante (Colaborador)</Label>
                                    <select
                                        id="tkt-requester"
                                        value={requesterName}
                                        onChange={(e) => setRequesterName(e.target.value)}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold"
                                    >
                                        <option value="">-- Seleccionar Solicitante --</option>
                                        {collaborators.map((collab, idx) => (
                                            <option key={idx} value={collab.name}>
                                                {collab.detail}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-span-full space-y-2">
                                    <Label htmlFor="tkt-asset">Vincular Activo de TI (Opcional)</Label>
                                    <select
                                        id="tkt-asset"
                                        value={linkedAssetId || ''}
                                        onChange={(e) => {
                                            const val = e.target.value ? Number(e.target.value) : undefined;
                                            setLinkedAssetId(val);
                                            if (val) {
                                                const asset = itAssets.find(a => a.id === val);
                                                if (asset) {
                                                    setNewTicketForm(prev => ({
                                                        ...prev,
                                                        equipmentName: `${asset.category} - ${asset.brand} ${asset.model}`,
                                                        brand: asset.brand,
                                                        model: asset.model,
                                                        serialNumber: asset.serial_number
                                                    }));
                                                }
                                            }
                                        }}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold"
                                    >
                                        <option value="">-- Seleccionar Activo de TI (Opcional) --</option>
                                        {itAssets.map(asset => (
                                            <option key={asset.id} value={asset.id}>
                                                {asset.category} - {asset.brand} {asset.model} (S/N: {asset.serial_number}) {asset.user_name || asset.employee_name ? `- Asignado a: ${asset.user_name || asset.employee_name}` : '- Disponible en stock'}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </>
                        )}
                        {isFleetTaller && (
                            <>
                                <div className="col-span-full space-y-2">
                                    <Label htmlFor="tkt-driver">Conductor / Reporta (Opcional)</Label>
                                    <select
                                        id="tkt-driver"
                                        value={requesterName}
                                        onChange={(e) => setRequesterName(e.target.value)}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold"
                                    >
                                        <option value="">-- Seleccionar Conductor --</option>
                                        {collaborators.map((collab, idx) => (
                                            <option key={idx} value={collab.name}>
                                                {collab.detail}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="col-span-full space-y-2">
                                    <Label htmlFor="tkt-vehicle">Vincular Vehículo de la Flota (Opcional)</Label>
                                    <select
                                        id="tkt-vehicle"
                                        value={linkedAssetId || ''}
                                        onChange={(e) => {
                                            const val = e.target.value ? Number(e.target.value) : undefined;
                                            setLinkedAssetId(val);
                                            if (val) {
                                                const vehicle = vehicles.find(v => v.id === val);
                                                if (vehicle) {
                                                    setNewTicketForm(prev => ({
                                                        ...prev,
                                                        equipmentName: `Placa: ${vehicle.plate} - ${vehicle.brand} ${vehicle.model}`,
                                                        brand: vehicle.brand,
                                                        model: vehicle.model,
                                                        serialNumber: vehicle.plate
                                                    }));
                                                }
                                            }
                                        }}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold"
                                    >
                                        <option value="">-- Seleccionar Vehículo --</option>
                                        {vehicles.map(vehicle => (
                                            <option key={vehicle.id} value={vehicle.id}>
                                                {vehicle.plate} - {vehicle.brand} {vehicle.model} ({vehicle.currentMileage?.toLocaleString()} {vehicle.odometerUnit || 'km'})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </>
                        )}
                        <div className="col-span-full space-y-2">
                            <Label htmlFor="tkt-subject">Asunto / Falla Reportada *</Label>
                            <Input
                                id="tkt-subject"
                                placeholder="Ej: Fuga de aceite hidráulico en empacadora"
                                value={newTicketForm.subject}
                                onChange={(e) => setNewTicketForm({...newTicketForm, subject: e.target.value})}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="tkt-eq">Equipo / Activo Principal *</Label>
                            <Input
                                id="tkt-eq"
                                placeholder="Ej: Montacargas Toyota #5"
                                value={newTicketForm.equipmentName}
                                onChange={(e) => setNewTicketForm({...newTicketForm, equipmentName: e.target.value})}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="tkt-priority">Prioridad de Atención</Label>
                            <select
                                id="tkt-priority"
                                value={newTicketForm.priority}
                                onChange={(e) => setNewTicketForm({...newTicketForm, priority: e.target.value as any})}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                                <option value="low">Baja</option>
                                <option value="medium">Media</option>
                                <option value="high">Alta</option>
                                <option value="urgent">Urgente</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="tkt-maint-type">Tipo de Mantenimiento</Label>
                            <select
                                id="tkt-maint-type"
                                value={newTicketForm.maintenanceType}
                                onChange={(e) => setNewTicketForm({...newTicketForm, maintenanceType: e.target.value})}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                                {maintenanceTypes.length > 0 ? (
                                    maintenanceTypes.map((type) => (
                                        <option key={type} value={type.toLowerCase()}>
                                            🔧 {type}
                                        </option>
                                    ))
                                ) : (
                                    <>
                                        <option value="corrective">⚙️ Correctivo (Falla)</option>
                                        <option value="preventive">📅 Preventivo (Cíclico)</option>
                                        <option value="predictive">🔍 Predictivo (Análisis)</option>
                                        <option value="installation">🔌 Instalación / Software</option>
                                        <option value="upgrade">🚀 Actualización / Mejora</option>
                                    </>
                                )}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="tkt-brand">Marca</Label>
                            <Input
                                id="tkt-brand"
                                placeholder="Ej: Toyota"
                                value={newTicketForm.brand}
                                onChange={(e) => setNewTicketForm({...newTicketForm, brand: e.target.value})}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="tkt-model">Modelo</Label>
                            <Input
                                id="tkt-model"
                                placeholder="Ej: 8FGU25"
                                value={newTicketForm.model}
                                onChange={(e) => setNewTicketForm({...newTicketForm, model: e.target.value})}
                            />
                        </div>
                        <div className="col-span-full space-y-2">
                            <Label htmlFor="tkt-serial">Número de Serie / Placa / Serie Motor</Label>
                            <Input
                                id="tkt-serial"
                                placeholder="Ej: TOY-98234-F"
                                value={newTicketForm.serialNumber}
                                onChange={(e) => setNewTicketForm({...newTicketForm, serialNumber: e.target.value})}
                            />
                        </div>
                        <div className="col-span-full space-y-2">
                            <Label htmlFor="tkt-desc">Descripción Detallada del Problema *</Label>
                            <Textarea
                                id="tkt-desc"
                                placeholder="Proporciona el máximo detalle del síntoma de la falla..."
                                value={newTicketForm.description}
                                onChange={(e) => setNewTicketForm({...newTicketForm, description: e.target.value})}
                                required
                            />
                        </div>

                        {errorMsg && <p className="text-sm font-bold text-red-500 col-span-full">{errorMsg}</p>}

                        <DialogFooter className="col-span-full pt-4">
                            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
                            <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">Generar Ticket</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Modal Detail & Management Ticket */}
            <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-950">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            <Badge className="bg-blue-100 text-blue-800 text-xs font-mono">{selectedTicket?.consecutive}</Badge>
                            <span>{selectedTicket?.subject}</span>
                        </DialogTitle>
                        <DialogDescription>Gestión técnica del caso, asignación e insumos del taller.</DialogDescription>
                    </DialogHeader>

                    {selectedTicket && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 py-4">
                            {/* Left technical details */}
                            <div className="lg:col-span-2 space-y-6">
                                <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl space-y-3">
                                    <div className="flex items-center justify-between pb-1 border-b dark:border-slate-800">
                                        <h4 className="font-bold text-sm text-muted-foreground uppercase tracking-wider">Reporte Técnico</h4>
                                        {(() => {
                                            const canEditOrCancel = selectedTicket && (
                                                user?.role === 'admin' ||
                                                hasPermission('admin:access') ||
                                                hasPermission(`tickets:manage:${selectedTicket.department_id}`) ||
                                                selectedTicket.created_by === user?.name ||
                                                selectedTicket.created_by === user?.email
                                            );
                                            return canEditOrCancel && selectedTicket.status !== 'completed' && selectedTicket.status !== 'canceled' && !isEditing && (
                                                <div className="flex items-center gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => setIsEditing(true)}
                                                        className="h-7 text-xs font-semibold px-2"
                                                    >
                                                        Editar
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="destructive"
                                                        onClick={async () => {
                                                            if (confirm("¿Estás seguro de que deseas cancelar este ticket?")) {
                                                                const res = await updateTicketStatus(selectedTicket.id, 'canceled', user?.name || 'Sistema');
                                                                if (res.success) {
                                                                    setSelectedTicket({ ...selectedTicket, status: 'canceled' });
                                                                    loadTickets();
                                                                    loadHistoryList(selectedTicket.id);
                                                                }
                                                            }
                                                        }}
                                                        className="h-7 text-xs font-semibold px-2 bg-red-600 hover:bg-red-700 text-white"
                                                    >
                                                        Cancelar Ticket
                                                    </Button>
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {isEditing ? (
                                        <div className="space-y-3 pt-2">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <Label className="text-xs font-bold">Asunto</Label>
                                                    <Input
                                                        value={editForm.subject}
                                                        onChange={(e) => setEditForm(prev => ({ ...prev, subject: e.target.value }))}
                                                        className="h-8 text-xs bg-white dark:bg-slate-950"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs font-bold">Equipo / Activo</Label>
                                                    <Input
                                                        value={editForm.equipmentName}
                                                        onChange={(e) => setEditForm(prev => ({ ...prev, equipmentName: e.target.value }))}
                                                        className="h-8 text-xs bg-white dark:bg-slate-950"
                                                    />
                                                </div>
                                            </div>
                                            
                                            <div className="space-y-1">
                                                <Label className="text-xs font-bold">Descripción del Problema</Label>
                                                <Textarea
                                                    value={editForm.description}
                                                    onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                                                    className="text-xs bg-white dark:bg-slate-950 min-h-[80px]"
                                                />
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                <div className="space-y-1">
                                                    <Label className="text-xs font-bold">Prioridad</Label>
                                                    <select
                                                        value={editForm.priority}
                                                        onChange={(e) => setEditForm(prev => ({ ...prev, priority: e.target.value as any }))}
                                                        className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs"
                                                    >
                                                        <option value="low">Baja</option>
                                                        <option value="medium">Media</option>
                                                        <option value="high">Alta</option>
                                                        <option value="urgent">Urgente</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs font-bold">Mantenimiento</Label>
                                                    <select
                                                        value={editForm.maintenanceType}
                                                        onChange={(e) => setEditForm(prev => ({ ...prev, maintenanceType: e.target.value }))}
                                                        className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs"
                                                    >
                                                        {maintenanceTypes.map(t => (
                                                            <option key={t} value={t.toLowerCase()}>{t}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs font-bold">Serie</Label>
                                                    <Input
                                                        value={editForm.serialNumber}
                                                        onChange={(e) => setEditForm(prev => ({ ...prev, serialNumber: e.target.value }))}
                                                        className="h-8 text-xs bg-white dark:bg-slate-950"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <Label className="text-xs font-bold">Marca</Label>
                                                    <Input
                                                        value={editForm.brand}
                                                        onChange={(e) => setEditForm(prev => ({ ...prev, brand: e.target.value }))}
                                                        className="h-8 text-xs bg-white dark:bg-slate-950"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-xs font-bold">Modelo</Label>
                                                    <Input
                                                        value={editForm.model}
                                                        onChange={(e) => setEditForm(prev => ({ ...prev, model: e.target.value }))}
                                                        className="h-8 text-xs bg-white dark:bg-slate-950"
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 pt-2">
                                                <Button
                                                    size="sm"
                                                    onClick={async () => {
                                                        const res = await updateTicketDetails(selectedTicket.id, {
                                                            subject: editForm.subject,
                                                            description: editForm.description,
                                                            priority: editForm.priority,
                                                            maintenanceType: editForm.maintenanceType,
                                                            equipmentName: editForm.equipmentName,
                                                            brand: editForm.brand,
                                                            model: editForm.model,
                                                            serialNumber: editForm.serialNumber,
                                                            user: user?.name || 'Sistema'
                                                        });
                                                        if (res.success) {
                                                            setSelectedTicket({
                                                                ...selectedTicket,
                                                                subject: editForm.subject,
                                                                description: editForm.description,
                                                                priority: editForm.priority,
                                                                maintenance_type: editForm.maintenanceType as any,
                                                                equipment_name: editForm.equipmentName,
                                                                brand: editForm.brand,
                                                                model: editForm.model,
                                                                serial_number: editForm.serialNumber
                                                            });
                                                            setIsEditing(false);
                                                            loadTickets();
                                                            loadHistoryList(selectedTicket.id);
                                                        }
                                                    }}
                                                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                                                >
                                                    Guardar Cambios
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => setIsEditing(false)}
                                                    className="text-xs font-semibold"
                                                >
                                                    Cancelar
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {(() => {
                                                const parsed = parseLogPhoto(selectedTicket.description);
                                                return (
                                                    <>
                                                        <p className="text-slate-800 dark:text-slate-200 text-sm whitespace-pre-line leading-relaxed font-medium">
                                                            {parsed.cleanText || 'Mantenimiento registrado desde Flota'}
                                                        </p>
                                                        {parsed.photoFilename && (
                                                            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                                                                <span className="text-xs text-muted-foreground font-semibold flex items-center gap-1">
                                                                    <Camera className="w-3.5 h-3.5 text-emerald-500" /> Hay un comprobante fotográfico adjunto.
                                                                </span>
                                                                <Button 
                                                                    type="button"
                                                                    variant="outline" 
                                                                    size="sm" 
                                                                    className="h-7 px-3 text-xs text-blue-600 hover:text-blue-700 bg-white hover:bg-blue-50 border-blue-200 flex items-center gap-1 font-semibold shadow-sm"
                                                                    onClick={() => setSelectedPhoto(parsed.photoFilename)}
                                                                >
                                                                    Ver Comprobante
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                            <div className="border-t pt-3 grid grid-cols-2 gap-2 text-xs">
                                                <div><span className="text-muted-foreground font-semibold">Equipo:</span> <span className="font-bold text-slate-800 dark:text-slate-200">{selectedTicket.equipment_name}</span></div>
                                                <div><span className="text-muted-foreground font-semibold">Mantenimiento:</span> <span className="font-bold text-blue-600 dark:text-blue-400 capitalize">{selectedTicket.maintenance_type === 'preventive' ? '📅 Preventivo' : selectedTicket.maintenance_type === 'corrective' ? '⚙️ Correctivo' : selectedTicket.maintenance_type === 'predictive' ? '🔍 Predictivo' : selectedTicket.maintenance_type === 'installation' ? '🔌 Instalación' : selectedTicket.maintenance_type === 'upgrade' ? '🚀 Mejora' : selectedTicket.maintenance_type || 'Mantenimiento'}</span></div>
                                                <div><span className="text-muted-foreground font-semibold">Marca/Modelo:</span> <span className="font-bold text-slate-800 dark:text-slate-200">{selectedTicket.brand || '-'} {selectedTicket.model ? `/ ${selectedTicket.model}` : ''}</span></div>
                                                <div><span className="text-muted-foreground font-semibold">N° Serie:</span> <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">{selectedTicket.serial_number || '-'}</span></div>
                                                <div><span className="text-muted-foreground font-semibold">Registrado por:</span> <span className="font-bold text-slate-800 dark:text-slate-200">{selectedTicket.created_by}</span></div>
                                                <div><span className="text-muted-foreground font-semibold">Fecha Registro:</span> <span className="font-bold text-slate-800 dark:text-slate-200">{new Date(selectedTicket.created_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })}</span></div>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Part Consumption Section */}
                                <div className="space-y-4">
                                    <h3 className="font-bold text-base flex items-center gap-1.5"><HardDrive className="w-5 h-5 text-blue-600" /> Repuestos Consumidos en Reparación</h3>
                                    
                                    {selectedTicket.status !== 'completed' && selectedTicket.status !== 'canceled' && (
                                        <div className="p-4 border rounded-xl space-y-3 bg-white dark:bg-slate-900/50">
                                            <Label className="font-bold text-xs">Vincular repuesto de bodega</Label>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                <div className="sm:col-span-2">
                                                    <select
                                                        value={selectedItemId}
                                                        onChange={(e) => setSelectedItemId(e.target.value)}
                                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                    >
                                                        <option value="">Selecciona repuesto...</option>
                                                        {invItems.map(item => (
                                                            <option key={item.id} value={item.id} disabled={item.quantity <= 0}>
                                                                {item.name} ({item.quantity} disponibles {item.unit}) - Lote: {item.batch_number || 'S/L'}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Input
                                                        type="number"
                                                        min="1"
                                                        value={consumeQty}
                                                        onChange={(e) => setConsumeQty(Number(e.target.value))}
                                                        className="w-20"
                                                    />
                                                    <Button type="button" onClick={handleLinkPart} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs">
                                                        Consumir
                                                    </Button>
                                                </div>
                                            </div>
                                            {errorMsg && <p className="text-xs font-bold text-red-500 mt-1">{errorMsg}</p>}
                                        </div>
                                    )}

                                    {/* Linked parts table */}
                                    {loadingParts ? (
                                        <Skeleton className="h-20 w-full" />
                                    ) : ticketParts.length === 0 ? (
                                        <p className="text-xs text-muted-foreground font-medium py-3">No se registran consumos de repuestos para esta reparación.</p>
                                    ) : (
                                        <div className="border rounded-lg overflow-hidden">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="bg-slate-50 dark:bg-slate-900">
                                                        <TableHead>Repuesto</TableHead>
                                                        <TableHead className="text-center">Cant.</TableHead>
                                                        <TableHead className="text-right">Costo Unit.</TableHead>
                                                        <TableHead className="text-right">Subtotal</TableHead>
                                                        <TableHead></TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {ticketParts.map(part => (
                                                        <TableRow key={part.id}>
                                                            <TableCell>
                                                                <div className="font-bold text-sm">{part.item_name}</div>
                                                                <div className="text-[10px] text-muted-foreground font-mono">
                                                                    Parte: {part.part_number || '-'} {part.batch_number ? `| Lote: ${part.batch_number}` : ''}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-center font-semibold text-sm">{part.quantity}</TableCell>
                                                            <TableCell className="text-right font-mono text-xs">₡{part.price.toLocaleString()}</TableCell>
                                                            <TableCell className="text-right font-mono text-sm font-bold">₡{(part.quantity * part.price).toLocaleString()}</TableCell>
                                                            <TableCell className="text-right">
                                                                {selectedTicket.status !== 'completed' && selectedTicket.status !== 'canceled' && (
                                                                    <Button size="icon" variant="ghost" onClick={() => handleUnlinkPart(part.id)} className="h-8 w-8 text-red-500 hover:text-red-700">
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </Button>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    )}
                                </div>

                                {/* Consumables Consumption Section */}
                                {(selectedTicket.department_id === 2 || selectedDeptId === 2) && (
                                    <div className="space-y-4 pt-4 border-t">
                                        <h3 className="font-bold text-base flex items-center gap-1.5"><SlidersHorizontal className="w-5 h-5 text-indigo-600" /> Materiales y Consumibles Utilizados</h3>
                                        
                                        {selectedTicket.status !== 'completed' && selectedTicket.status !== 'canceled' && (
                                            <div className="p-4 border rounded-xl space-y-3 bg-white dark:bg-slate-900/50">
                                                <Label className="font-bold text-xs">Vincular insumo/consumible de bodega (salida definitiva)</Label>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                    <div className="sm:col-span-2">
                                                        <select
                                                            value={selectedConsumableItemId}
                                                            onChange={(e) => setSelectedConsumableItemId(e.target.value)}
                                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                        >
                                                            <option value="">Selecciona consumible...</option>
                                                            {invConsumables.map(item => (
                                                                <option key={item.id} value={item.id} disabled={item.quantity <= 0}>
                                                                    {item.name} ({item.quantity} disponibles {item.unit})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <Input
                                                            type="number"
                                                            min="1"
                                                            value={consumeConsumableQty}
                                                            onChange={(e) => setConsumeConsumableQty(Number(e.target.value))}
                                                            className="w-20"
                                                        />
                                                        <Button type="button" onClick={handleLinkConsumable} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs">
                                                            Salida
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Linked consumables table */}
                                        {loadingConsumables ? (
                                            <Skeleton className="h-20 w-full" />
                                        ) : ticketConsumables.length === 0 ? (
                                            <p className="text-xs text-muted-foreground font-medium py-3">No se registran salidas de consumibles para esta solicitud.</p>
                                        ) : (
                                            <div className="border rounded-lg overflow-hidden">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow className="bg-slate-50 dark:bg-slate-900">
                                                            <TableHead>Consumible</TableHead>
                                                            <TableHead className="text-center">Cant.</TableHead>
                                                            <TableHead className="text-right">Costo Unit.</TableHead>
                                                            <TableHead className="text-right">Subtotal</TableHead>
                                                            <TableHead></TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {ticketConsumables.map(c => (
                                                            <TableRow key={c.id}>
                                                                <TableCell>
                                                                    <div className="font-bold text-sm">{c.item_name}</div>
                                                                    <div className="text-[10px] text-muted-foreground">
                                                                        Salida registrada el {new Date(c.registered_at).toLocaleString()}
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="text-center font-semibold text-sm">{c.quantity} {c.item_unit}</TableCell>
                                                                <TableCell className="text-right font-mono text-xs">₡{c.item_price?.toLocaleString() || 0}</TableCell>
                                                                <TableCell className="text-right font-mono text-sm font-bold">₡{((c.quantity || 0) * (c.item_price || 0)).toLocaleString()}</TableCell>
                                                                <TableCell className="text-right">
                                                                    {selectedTicket.status !== 'completed' && selectedTicket.status !== 'canceled' && (
                                                                        <Button size="icon" variant="ghost" onClick={() => handleUnlinkConsumable(c.id)} className="h-8 w-8 text-red-500 hover:text-red-700">
                                                                            <Trash2 className="w-4 h-4" />
                                                                        </Button>
                                                                    )}
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Timeline of Audit History */}
                                <div className="space-y-4 pt-4 border-t">
                                    <h3 className="font-bold text-base flex items-center gap-1.5"><Clock className="w-5 h-5 text-slate-600" /> Bitácora de Auditoría (ISO 9001)</h3>
                                    {loadingHistory ? (
                                        <Skeleton className="h-20 w-full" />
                                    ) : ticketHistory.length === 0 ? (
                                        <p className="text-xs text-muted-foreground font-medium py-3">No hay historial registrado.</p>
                                    ) : (
                                        <div className="relative border-l border-slate-200 dark:border-slate-800 ml-3.5 pl-6 space-y-4 py-2">
                                            {ticketHistory.map((h) => {
                                                const formattedDate = new Date(h.created_at).toLocaleString();
                                                return (
                                                    <div key={h.id} className="relative">
                                                        <span className="absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-900 ring-4 ring-white dark:ring-slate-950">
                                                            <div className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-600" />
                                                        </span>
                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                                            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{h.description}</div>
                                                            <div className="text-[10px] text-muted-foreground font-mono">{formattedDate} por {h.performed_by}</div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right ticket controller panel */}
                            <div className="space-y-6 lg:border-l lg:pl-6">
                                <div className="space-y-4">
                                    <h4 className="font-bold text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Settings className="w-4 h-4" /> Control del Ticket</h4>
                                    
                                    {/* Estatus dropdown */}
                                    <div className="space-y-2">
                                        <Label className="text-xs font-semibold">Estado del Caso</Label>
                                        <select
                                            value={selectedTicket.status}
                                            onChange={(e) => handleStatusChange(e.target.value)}
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-bold"
                                        >
                                            <option value="open">Abierto (Abierto)</option>
                                            <option value="in_progress">En Progreso (Taller)</option>
                                            <option value="on_hold">En Espera (Repuesto)</option>
                                            <option value="completed">Completado (Cerrado)</option>
                                            <option value="canceled">Cancelado</option>
                                        </select>
                                    </div>

                                    {/* Asignación dropdown */}
                                    <div className="space-y-2">
                                        <Label className="text-xs font-semibold">Asignado a:</Label>
                                        <select
                                            value={selectedTicket.assignee_id || ''}
                                            onChange={(e) => handleAssignChange(e.target.value ? Number(e.target.value) : null)}
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold"
                                        >
                                            <option value="">Sin Asignar</option>
                                            {selectedTicket.assignee_id && !technicians.some(t => t.id === selectedTicket.assignee_id) && (
                                                <option value={selectedTicket.assignee_id}>{selectedTicket.assignee_name || `Usuario #${selectedTicket.assignee_id}`}</option>
                                            )}
                                            {technicians.map(tech => (
                                                <option key={tech.id} value={tech.id}>{tech.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Requester dropdown for TI */}
                                    {(selectedTicket.department_id === 2 || selectedDeptId === 2) && (
                                        <div className="space-y-2 border-t pt-3">
                                            <Label className="text-xs font-semibold">Solicitante (Cliente)</Label>
                                            <select
                                                value={(selectedTicket as any).requester_name || ''}
                                                onChange={(e) => handleUpdateTicketRelations(selectedTicket.linked_asset_id || null, e.target.value || null)}
                                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold"
                                            >
                                                <option value="">Sin especificar solicitante</option>
                                                {collaborators.map((collab, idx) => (
                                                    <option key={idx} value={collab.name}>
                                                        {collab.detail}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {/* Asset linking / unlinking for TI */}
                                    {(selectedTicket.department_id === 2 || selectedDeptId === 2) && (
                                        <div className="space-y-2 border-t pt-3">
                                            <Label className="text-xs font-semibold">Activo de TI Vinculado</Label>
                                            {selectedTicket.linked_asset_id ? (
                                                <div className="space-y-2">
                                                    {(() => {
                                                        const asset = itAssets.find(a => a.id === selectedTicket.linked_asset_id);
                                                        return asset ? (
                                                            <div className="text-xs bg-muted p-2 rounded border font-medium">
                                                                <span className="font-bold text-blue-600 block">{asset.category}</span>
                                                                {asset.brand} {asset.model} (S/N: {asset.serial_number})
                                                            </div>
                                                        ) : (
                                                            <div className="text-xs text-muted-foreground italic">Activo #{selectedTicket.linked_asset_id}</div>
                                                        );
                                                    })()}
                                                    <Button 
                                                        size="sm" 
                                                        variant="outline" 
                                                        className="w-full text-xs text-red-600 border-red-200 hover:bg-red-50 font-semibold"
                                                        onClick={() => handleUpdateTicketRelations(null, (selectedTicket as any).requester_name || null)}
                                                    >
                                                        Desvincular Activo
                                                    </Button>
                                                </div>
                                            ) : (
                                                <select
                                                    value=""
                                                    onChange={(e) => {
                                                        const val = e.target.value ? Number(e.target.value) : null;
                                                        if (val) {
                                                            handleUpdateTicketRelations(
                                                                val, 
                                                                (selectedTicket as any).requester_name || null
                                                            );
                                                        }
                                                    }}
                                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold"
                                                >
                                                    <option value="">-- Vincular un Activo --</option>
                                                    {itAssets.map(asset => (
                                                        <option key={asset.id} value={asset.id}>
                                                            {asset.category} - {asset.brand} {asset.model} (S/N: {asset.serial_number})
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                    )}

                                    {/* Requester dropdown for Fleet */}
                                    {(selectedTicket.department_id === 1 || selectedDeptId === 1) && (
                                        <div className="space-y-2 border-t pt-3">
                                            <Label className="text-xs font-semibold">Conductor / Reporta</Label>
                                            <select
                                                value={(selectedTicket as any).requester_name || ''}
                                                onChange={(e) => handleUpdateTicketRelations(selectedTicket.linked_asset_id || null, e.target.value || null)}
                                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold"
                                            >
                                                <option value="">Sin especificar conductor</option>
                                                {collaborators.map((collab, idx) => (
                                                    <option key={idx} value={collab.name}>
                                                        {collab.detail}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {/* Asset linking / unlinking for Fleet */}
                                    {(selectedTicket.department_id === 1 || selectedDeptId === 1) && (
                                        <div className="space-y-2 border-t pt-3">
                                            <Label className="text-xs font-semibold">Vehículo de Flota Vinculado</Label>
                                            {selectedTicket.linked_asset_id ? (
                                                <div className="space-y-2">
                                                    {(() => {
                                                        const vehicle = vehicles.find(v => v.id === selectedTicket.linked_asset_id);
                                                        return vehicle ? (
                                                            <div className="text-xs bg-muted p-2 rounded border font-medium">
                                                                <span className="font-bold text-blue-600 block">Placa: {vehicle.plate}</span>
                                                                {vehicle.brand} {vehicle.model} ({vehicle.currentMileage?.toLocaleString()} {vehicle.odometerUnit || 'km'})
                                                            </div>
                                                        ) : (
                                                            <div className="text-xs text-muted-foreground italic">Vehículo ID #{selectedTicket.linked_asset_id}</div>
                                                        );
                                                    })()}
                                                    <Button 
                                                        size="sm" 
                                                        variant="outline" 
                                                        className="w-full text-xs text-red-600 border-red-200 hover:bg-red-50 font-semibold"
                                                        onClick={() => handleUpdateTicketRelations(null, (selectedTicket as any).requester_name || null)}
                                                    >
                                                        Desvincular Vehículo
                                                    </Button>
                                                </div>
                                            ) : (
                                                <select
                                                    value=""
                                                    onChange={(e) => {
                                                        const val = e.target.value ? Number(e.target.value) : null;
                                                        if (val) {
                                                            handleUpdateTicketRelations(
                                                                val, 
                                                                (selectedTicket as any).requester_name || null
                                                            );
                                                        }
                                                    }}
                                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold"
                                                >
                                                    <option value="">-- Vincular un Vehículo --</option>
                                                    {vehicles.map(vehicle => (
                                                        <option key={vehicle.id} value={vehicle.id}>
                                                            {vehicle.plate} - {vehicle.brand} {vehicle.model}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter className="pt-4">
                        <Button type="button" variant="outline" onClick={() => setIsDetailOpen(false)}>Cerrar Panel</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!selectedPhoto} onOpenChange={(open) => !open && setSelectedPhoto(null)}>
                <DialogContent className="max-w-lg p-0 overflow-hidden bg-black/95 border-none shadow-2xl rounded-2xl flex flex-col items-center justify-center">
                    <DialogHeader className="p-4 border-b border-white/10 w-full bg-slate-900/90 text-white flex flex-row items-center justify-between">
                        <div>
                            <DialogTitle className="text-base font-bold flex items-center gap-2">
                                <Camera className="w-4 h-4 text-emerald-400 animate-pulse" /> Comprobante Adjunto
                            </DialogTitle>
                            <DialogDescription className="text-xs text-slate-400">
                                Imagen cargada desde el sistema de Flota
                            </DialogDescription>
                        </div>
                    </DialogHeader>
                    {selectedPhoto && (
                        <div className="relative w-full max-h-[80vh] flex items-center justify-center p-2 bg-slate-950">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img 
                                src={`/api/fleet/files/${selectedPhoto}`} 
                                alt="Comprobante" 
                                className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-md border border-white/5 transition-all duration-300"
                            />
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={isOdometerDialogOpen} onOpenChange={setIsOdometerDialogOpen}>
                <DialogContent className="max-w-md bg-white dark:bg-slate-950">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            <span>🚗 Registro de Odómetro / Uso</span>
                        </DialogTitle>
                        <DialogDescription>
                            Para finalizar y completar este ticket del taller de flota, por favor ingresa la lectura actual del odómetro u horómetro del vehículo:
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="odo-val-input">Lectura de Odómetro / Uso Actual *</Label>
                            <Input
                                id="odo-val-input"
                                type="number"
                                placeholder="Ej: 145000"
                                value={odometerValue}
                                onChange={(e) => setOdometerValue(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={() => setIsOdometerDialogOpen(false)}>Cancelar</Button>
                        <Button type="button" onClick={handleConfirmOdometerComplete} className="bg-blue-600 hover:bg-blue-700 text-white">
                            Confirmar y Completar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
