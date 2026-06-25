'use client';

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Trash2, UserPlus } from "lucide-react";
import { useToast } from "@/modules/core/hooks/use-toast";
import { addFleetSettingAction, deleteFleetSettingAction } from "@/modules/fleet/lib/actions";

interface ManageDriversClientProps {
    currentDrivers: any[];
    allEmployees: any[];
}

export default function ManageDriversClient({ currentDrivers, allEmployees }: ManageDriversClientProps) {
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
    const [showInactive, setShowInactive] = useState<boolean>(false);
    const [showAllStaff, setShowAllStaff] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    // We show employees that are not already drivers, optionally filtering out inactive ones and restricting to 'TR' department by default
    const availableEmployees = allEmployees.filter(emp => {
        const isNotDriver = !currentDrivers.some(d => d.value === emp.id);
        const isStatusMatch = showInactive || emp.active === 'S';
        const isDeptMatch = showAllStaff || emp.DEPARTAMENTO === 'TR';
        return isNotDriver && isStatusMatch && isDeptMatch;
    });

    const handleAddDriver = async () => {
        if (!selectedEmployeeId) return;
        setIsLoading(true);
        try {
            await addFleetSettingAction('driver', selectedEmployeeId);
            toast({ title: "Chofer agregado", description: "El empleado ha sido agregado a la lista de choferes." });
            setSelectedEmployeeId("");
        } catch (error) {
            toast({ title: "Error", description: "No se pudo agregar al chofer.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    const handleRemoveDriver = async (settingId: number) => {
        setIsLoading(true);
        try {
            await deleteFleetSettingAction(settingId);
            toast({ title: "Chofer removido", description: "El empleado ya no es chofer de la flota." });
        } catch (error) {
            toast({ title: "Error", description: "No se pudo remover al chofer.", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <div className="flex gap-2">
                    <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId} disabled={isLoading}>
                        <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Seleccionar empleado para agregar..." />
                        </SelectTrigger>
                        <SelectContent>
                            {availableEmployees.map(emp => (
                                <SelectItem key={emp.id} value={emp.id}>
                                    {emp.name} ({emp.id}){emp.active === 'N' ? ' [INACTIVO]' : ''}
                                </SelectItem>
                            ))}
                            {availableEmployees.length === 0 && (
                                <SelectItem value="none" disabled>No hay más empleados disponibles</SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                    <Button onClick={handleAddDriver} disabled={!selectedEmployeeId || selectedEmployeeId === "none" || isLoading}>
                        <UserPlus className="w-4 h-4 mr-2" />
                        Agregar
                    </Button>
                </div>
                <div className="flex flex-wrap items-center gap-4 px-1">
                    <div className="flex items-center space-x-2">
                        <Checkbox 
                            id="showInactiveDrivers" 
                            checked={showInactive} 
                            onCheckedChange={(checked) => setShowInactive(!!checked)} 
                        />
                        <Label htmlFor="showInactiveDrivers" className="text-xs text-muted-foreground font-normal cursor-pointer select-none">
                            Mostrar también inactivos en el buscador
                        </Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                        <Checkbox 
                            id="showAllStaff" 
                            checked={showAllStaff} 
                            onCheckedChange={(checked) => setShowAllStaff(!!checked)} 
                        />
                        <Label htmlFor="showAllStaff" className="text-xs text-muted-foreground font-normal cursor-pointer select-none">
                            Habilitar toda la planilla (Mostrar todo)
                        </Label>
                    </div>
                </div>
            </div>

            <div className="rounded-md border">
                <div className="max-h-[300px] overflow-y-auto">
                    {currentDrivers.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                            No hay choferes configurados. Usa el buscador para agregar uno.
                        </div>
                    ) : (
                        <div className="divide-y bg-slate-50/50">
                            {currentDrivers.map(driverSetting => {
                                const employeeInfo = allEmployees.find(e => e.id === driverSetting.value);
                                const isInactive = employeeInfo?.active === 'N';
                                return (
                                    <div key={driverSetting.id} className="flex items-center justify-between p-3 bg-white">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium text-sm">{employeeInfo?.name || 'Empleado Desconocido'}</p>
                                                {employeeInfo && (
                                                    isInactive ? (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-800 border border-red-200">
                                                            Inactivo
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-800 border border-green-200">
                                                            Activo
                                                        </span>
                                                    )
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground">Código: {driverSetting.value}</p>
                                        </div>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            onClick={() => handleRemoveDriver(driverSetting.id)}
                                            disabled={isLoading}
                                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
