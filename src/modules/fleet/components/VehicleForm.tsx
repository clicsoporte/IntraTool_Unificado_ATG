'use client';

import { useState } from 'react';
import { Truck, Save, ArrowLeft, Camera, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { saveVehicleAction } from '../lib/actions';
import { useRouter } from 'next/navigation';
import { useToast } from '@/modules/core/hooks/use-toast';
import Image from 'next/image';

import { getCurrentUser } from '@/modules/core/lib/auth';
import { getTaxPayerInfo } from '@/modules/core/lib/api-actions';

export default function VehicleForm({ vehicle, settings }: { vehicle?: any, settings: any[] }) {
    const router = useRouter();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [haciendaLoading, setHaciendaLoading] = useState(false);
    const [photoPreview, setPhotoPreview] = useState<string | null>(
        vehicle?.photoUrl ? `/api/fleet/files/${vehicle.photoUrl}` : null
    );
    const [ownerName, setOwnerName] = useState(vehicle?.ownerName || '');
    const [ownerId, setOwnerId] = useState(vehicle?.ownerId || '');
    const [selectedUnit, setSelectedUnit] = useState(vehicle?.odometerUnit || 'km');

    const brands = settings.filter(s => s.category === 'brand');
    const fuels = settings.filter(s => s.category === 'fuel_type');

    async function handleSubmit(formData: FormData) {
        setLoading(true);
        try {
            await saveVehicleAction(formData);
            toast({
                title: "Éxito",
                description: vehicle ? "Vehículo actualizado correctamente." : "Vehículo registrado correctamente.",
            });
            router.push('/dashboard/fleet');
            router.refresh();
        } catch (error) {
            toast({
                variant: "destructive",
                title: "Error",
                description: "No se pudo guardar el vehículo. Verifique la placa única.",
            });
        } finally {
            setLoading(false);
        }
    }

    async function lookupHacienda() {
        if (!ownerId) return;
        setHaciendaLoading(true);
        try {
            const data = await getTaxPayerInfo(ownerId);
            if (data && data.nombre) {
                setOwnerName(data.nombre);
                toast({ title: "Datos recuperados", description: `Propietario: ${data.nombre}` });
            } else if (data.error) {
                toast({ variant: "destructive", title: "Error", description: data.message });
            }
        } catch (e) {
            toast({ variant: "destructive", title: "Error", description: "No se pudo consultar Hacienda." });
        } finally {
            setHaciendaLoading(false);
        }
    }

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setPhotoPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <form action={handleSubmit} className="space-y-8 max-w-5xl mx-auto pb-10 animate-in slide-in-from-bottom duration-500">
            <div className="flex items-center justify-between">
                <Button variant="ghost" type="button" onClick={() => router.back()} className="gap-2">
                    <ArrowLeft className="w-4 h-4" /> Volver
                </Button>
                <div className="flex gap-3">
                    <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700 min-w-[150px]">
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Guardando...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4 mr-2" /> Guardar Vehículo
                            </>
                        )}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Photo & Status */}
                <div className="lg:col-span-1 space-y-6">
                    <Card className="border-none shadow-md overflow-hidden">
                        <CardHeader className="bg-muted/50 pb-4 text-center">
                            <CardTitle className="text-sm uppercase tracking-widest text-muted-foreground">Foto del Activo</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center space-y-4 pt-6">
                            <div className="w-48 h-48 rounded-2xl bg-muted border-2 border-dashed border-muted-foreground/20 flex items-center justify-center overflow-hidden relative group">
                                {photoPreview ? (
                                    <Image 
                                        src={photoPreview} 
                                        alt="Preview" 
                                        className="w-full h-full object-cover" 
                                        width={192} 
                                        height={192} 
                                        unoptimized
                                    />
                                ) : (
                                    <Truck className="w-16 h-16 text-muted-foreground/20" />
                                )}
                                <label className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                                    <Camera className="w-8 h-8 text-white" />
                                    <input type="file" name="photo" className="hidden" accept="image/*" onChange={handlePhotoChange} />
                                </label>
                            </div>
                            <p className="text-xs text-center text-muted-foreground">Haga clic para subir una foto de la unidad.</p>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-md">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-bold">Estado Operativo</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Select name="status" defaultValue={vehicle?.status || 'active'}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar estado" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">Activo (Operativo)</SelectItem>
                                    <SelectItem value="maintenance">En Taller</SelectItem>
                                    <SelectItem value="inactive">Inactivo / Retirado</SelectItem>
                                </SelectContent>
                            </Select>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-md bg-blue-50/50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-bold">Configuración de Alertas</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>Unidad del Odómetro</Label>
                                <Select name="odometerUnit" defaultValue={selectedUnit} onValueChange={setSelectedUnit}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccionar unidad" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="km">Kilómetros (km)</SelectItem>
                                        <SelectItem value="mi">Millas (mi)</SelectItem>
                                        <SelectItem value="hr">Horas (hr)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Intervalo de Mantenimiento ({selectedUnit})</Label>
                                <Input name="oilChangeInterval" type="number" defaultValue={vehicle?.oilChangeInterval || 5000} />
                            </div>
                            <div className="space-y-2">
                                <Label>Vencimiento RTV</Label>
                                <Input name="rtvExpiration" type="date" defaultValue={vehicle?.rtvExpiration} />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Technical & Engine & Owner */}
                <div className="lg:col-span-2 space-y-6">
                    {/* General & Technical */}
                    <Card className="border-none shadow-md">
                        <CardHeader className="bg-slate-50">
                            <CardTitle>Información Identificativa</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
                            {vehicle?.id && <input type="hidden" name="id" value={vehicle.id} />}
                            {vehicle?.photoUrl && <input type="hidden" name="existingPhotoUrl" value={vehicle.photoUrl} />}
                            
                            <div className="space-y-2">
                                <Label>Placa / Matrícula *</Label>
                                <Input name="plate" defaultValue={vehicle?.plate} placeholder="Ej: ABC-123" required />
                            </div>
                            <div className="space-y-2">
                                <Label>Marca</Label>
                                <Select name="brand" defaultValue={vehicle?.brand}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccionar marca" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {brands.map((b: any) => <SelectItem key={b.id} value={b.value}>{b.value}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Modelo / Estilo</Label>
                                <Input name="model" defaultValue={vehicle?.model} placeholder="Hilux, UD, etc." />
                            </div>
                            <div className="space-y-2">
                                <Label>Año de Fabricación</Label>
                                <Input name="year" type="number" defaultValue={vehicle?.year || new Date().getFullYear()} />
                            </div>
                            <div className="space-y-2">
                                <Label>Color</Label>
                                <Input name="color" defaultValue={vehicle?.color} placeholder="Blanco, Gris, etc." />
                            </div>
                            <div className="space-y-2">
                                <Label>Número de Serie</Label>
                                <Input name="serialNumber" defaultValue={vehicle?.serialNumber} />
                            </div>
                            <div className="space-y-2">
                                <Label>VIN</Label>
                                <Input name="vin" defaultValue={vehicle?.vin} />
                            </div>
                            <div className="space-y-2">
                                <Label>Número de Chasis</Label>
                                <Input name="chassisNumber" defaultValue={vehicle?.chassisNumber} />
                            </div>
                            <div className="space-y-2">
                                <Label>Ubicación / Sede</Label>
                                <Input name="branchId" defaultValue={vehicle?.branchId} />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Technical Specs */}
                    <Card className="border-none shadow-md">
                        <CardHeader className="bg-slate-50">
                            <CardTitle>Especificaciones y Capacidades</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
                            <div className="space-y-2">
                                <Label>Carrocería</Label>
                                <Input name="bodyType" defaultValue={vehicle?.bodyType} placeholder="Ej: Pick-up, Furgón" />
                            </div>
                            <div className="space-y-2">
                                <Label>Tracción</Label>
                                <Select name="traction" defaultValue={vehicle?.traction || '4X2'}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Tracción" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Sencilla">Sencilla (Motos, etc.)</SelectItem>
                                        <SelectItem value="FWD (Delantera)">FWD (Delantera)</SelectItem>
                                        <SelectItem value="RWD (Trasera)">RWD (Trasera)</SelectItem>
                                        <SelectItem value="AWD (Integral)">AWD (Integral)</SelectItem>
                                        <SelectItem value="4X2">4X2</SelectItem>
                                        <SelectItem value="4X4 / 4WD">4X4 / 4WD</SelectItem>
                                        <SelectItem value="6X2">6X2</SelectItem>
                                        <SelectItem value="6X4">6X4</SelectItem>
                                        <SelectItem value="6X6">6X6</SelectItem>
                                        <SelectItem value="8X4">8X4</SelectItem>
                                        <SelectItem value="8X8">8X8</SelectItem>
                                        <SelectItem value="Orugas (Tracks)">Orugas (Tracks)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Capacidad (Personas)</Label>
                                <Input name="capacity" type="number" defaultValue={vehicle?.capacity || 2} />
                            </div>
                            <div className="space-y-2">
                                <Label>Tipo de Combustible</Label>
                                <Select name="fuelType" defaultValue={vehicle?.fuelType}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Combustible" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {fuels.map((f: any) => <SelectItem key={f.id} value={f.value}>{f.value}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Capacidad de Carga</Label>
                                <Input name="loadCapacity" defaultValue={vehicle?.loadCapacity} placeholder="3.5 Ton" />
                            </div>
                            <div className="space-y-2">
                                <Label>Cantidad de Ejes</Label>
                                <Input name="axes" type="number" defaultValue={vehicle?.axes || 2} />
                            </div>
                            <div className="space-y-2">
                                <Label>Odómetro Actual ({selectedUnit})</Label>
                                <Input name="currentMileage" type="number" step="0.1" defaultValue={vehicle?.currentMileage || 0} />
                            </div>
                            <div className="space-y-2">
                                <Label>Procedencia</Label>
                                <Input name="origin" defaultValue={vehicle?.origin} placeholder="Japón, Brasil, etc." />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Engine Details */}
                    <Card className="border-none shadow-md">
                        <CardHeader className="bg-slate-50">
                            <CardTitle>Características del Motor</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
                            <div className="space-y-2">
                                <Label>Número de Motor</Label>
                                <Input name="engineNumber" defaultValue={vehicle?.engineNumber} />
                            </div>
                            <div className="space-y-2">
                                <Label>Marca del Motor</Label>
                                <Input name="engineBrand" defaultValue={vehicle?.engineBrand} />
                            </div>
                            <div className="space-y-2">
                                <Label>Serie del Motor</Label>
                                <Input name="engineSerial" defaultValue={vehicle?.engineSerial} />
                            </div>
                            <div className="space-y-2">
                                <Label>Modelo del Motor</Label>
                                <Input name="engineModel" defaultValue={vehicle?.engineModel} />
                            </div>
                            <div className="space-y-2">
                                <Label>Cilindrada (cc)</Label>
                                <Input name="engineDisplacement" defaultValue={vehicle?.engineDisplacement} />
                            </div>
                            <div className="space-y-2">
                                <Label>Cantidad de Cilindros</Label>
                                <Input name="engineCylinders" type="number" defaultValue={vehicle?.engineCylinders} />
                            </div>
                            <div className="space-y-2">
                                <Label>Potencia (KW/HP)</Label>
                                <Input name="enginePower" defaultValue={vehicle?.enginePower} placeholder="Ej: 197 KW" />
                            </div>
                            <div className="space-y-2">
                                <Label>Fabricante</Label>
                                <Input name="engineManufacturer" defaultValue={vehicle?.engineManufacturer} />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Ownership Details */}
                    <Card className="border-none shadow-md">
                        <CardHeader className="bg-slate-50">
                            <CardTitle>Información de Propiedad</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                <div className="md:col-span-2 space-y-2">
                                    <Label>Identificación del Propietario (Cédula)</Label>
                                    <Input 
                                        name="ownerId" 
                                        value={ownerId} 
                                        onChange={(e) => setOwnerId(e.target.value)} 
                                        placeholder="Ej: 112340567" 
                                    />
                                </div>
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    onClick={lookupHacienda}
                                    disabled={haciendaLoading || !ownerId}
                                    className="gap-2"
                                >
                                    {haciendaLoading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Consultando...
                                        </>
                                    ) : 'Consultar Hacienda'}
                                </Button>
                            </div>
                            <div className="space-y-2">
                                <Label>Nombre Completo del Propietario</Label>
                                <Input 
                                    name="ownerName" 
                                    value={ownerName} 
                                    onChange={(e) => setOwnerName(e.target.value)} 
                                    placeholder="Auto-completado con Hacienda" 
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </form>
    );
}
