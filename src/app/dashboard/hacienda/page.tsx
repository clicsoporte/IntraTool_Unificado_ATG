

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/modules/core/hooks/use-toast';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { getContributorInfo, getEnrichedExemptionStatus, getExemptionsAction } from '@/modules/hacienda/lib/actions';
import type { Customer, Exemption, HaciendaContributorInfo, EnrichedExemptionInfo, Product, EnrichedCabysItem } from '@/modules/core/types';
import { Loader2, Search, ShieldCheck, ShieldX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format, parseISO, isValid } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { logError, logInfo } from '@/modules/core/lib/logger';
import { SearchInput } from '@/components/ui/search-input';
import { cn } from '@/lib/utils';
import { useDebounce } from 'use-debounce';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/modules/core/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';

const ContributorInfoCard = ({ data }: { data: HaciendaContributorInfo | null }) => {
    if (!data) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Situación Tributaria (Hacienda)</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">No se encontró información del contribuyente.</p>
                </CardContent>
            </Card>
        )
    }
    return (
        <Card>
            <CardHeader>
                <CardTitle>Situación Tributaria (Hacienda)</CardTitle>
                 <CardDescription>{data.nombre}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-muted-foreground">Régimen</p>
                        <p>{data.regimen.descripcion}</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Administración</p>
                        <p>{data.administracionTributaria}</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Estado</p>
                        <Badge variant={data.situacion.estado.toLowerCase().includes('inscrito') ? 'default' : 'destructive'}>
                            {data.situacion.estado}
                        </Badge>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Moroso / Omiso</p>
                        <p>{data.situacion.moroso} / {data.situacion.omiso}</p>
                    </div>
                </div>
                <div className="space-y-2 pt-2">
                    <p className="font-medium text-muted-foreground">Actividades Económicas</p>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                        {data.actividades.map((act, index) => (
                            <div key={`${act.codigo}-${index}`} className="p-2 bg-muted/50 rounded-md text-xs">
                                <p className="font-semibold">{act.descripcion}</p>
                                <p className="text-muted-foreground">Código: {act.codigo} - Tipo: {act.tipo}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

const ErpExemptionCard = ({ erpData }: { erpData: Exemption | null }) => {
    if (!erpData) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Exoneración según ERP</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">Sin datos de exoneración en el ERP para este cliente.</p>
                </CardContent>
            </Card>
        );
    }
    
    const isErpValid = isValid(new Date(erpData.endDate)) && new Date(erpData.endDate) > new Date();
    
    return (
        <Card>
            <CardHeader>
                <CardTitle>Exoneración según ERP</CardTitle>
                <CardDescription>{erpData.institutionName || 'Exoneración Local'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-muted-foreground">Autorización</p>
                        <p>{erpData.authNumber}</p>
                    </div>
                     <div>
                        <p className="text-muted-foreground">Estado</p>
                        <div className={cn("flex items-center gap-1 font-medium", isErpValid ? 'text-green-600' : 'text-red-600')}>
                            {isErpValid ? <ShieldCheck className="h-4 w-4"/> : <ShieldX className="h-4 w-4"/>}
                            <span>{isErpValid ? 'Vigente' : 'Vencida'}</span>
                        </div>
                     </div>
                     <div>
                        <p className="text-muted-foreground">Exonerado</p>
                        <p className="font-bold">{erpData.percentage}%</p>
                    </div>
                     {isValid(parseISO(erpData.endDate)) &&
                        <div>
                            <p className="text-muted-foreground">Vencimiento</p>
                            <p className="font-bold">{format(parseISO(erpData.endDate), 'dd/MM/yyyy')}</p>
                        </div>
                     }
                </div>
            </CardContent>
        </Card>
    );
};

const HaciendaExemptionCard = ({ data, products }: { data: EnrichedExemptionInfo | null, products: Product[] }) => {
    const [cabysFilter, setCabysFilter] = useState('');

    const filteredCabys: (EnrichedCabysItem & { localMatches: Product[] })[] = useMemo(() => {
        if (!data || !data.enrichedCabys) return [];
        const enrichedWithLocalMatches = data.enrichedCabys.map((item: EnrichedCabysItem) => {
            const localMatches = products.filter(p => p.cabys === item.code);
            return { ...item, localMatches };
        });

        if (!cabysFilter) return enrichedWithLocalMatches;
        
        const lowerFilter = cabysFilter.toLowerCase();
        return enrichedWithLocalMatches.filter((item: (EnrichedCabysItem & { localMatches: Product[] })) => 
            item.code.toLowerCase().includes(lowerFilter) || 
            item.description.toLowerCase().includes(lowerFilter) ||
            item.localMatches.some(p => p.id.toLowerCase().includes(lowerFilter) || p.description.toLowerCase().includes(lowerFilter))
        );
    }, [data, cabysFilter, products]);

    if (!data) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Exoneración según Hacienda</CardTitle>
                </CardHeader>
                <CardContent>
                     <p className="text-muted-foreground">No se encontró información en Hacienda.</p>
                </CardContent>
            </Card>
        );
    }
    return (
        <Card>
            <CardHeader>
                 <CardTitle>Exoneración según Hacienda</CardTitle>
                 <CardDescription>{data.tipoDocumento.descripcion}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-muted-foreground">Autorización</p>
                        <p>{data.numeroDocumento}</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Identificación</p>
                        <p>{data.identificacion}</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Exonerado</p>
                        <p className="font-bold">{data.porcentajeExoneracion}%</p>
                    </div>
                    <div>
                         <p className="text-muted-foreground">Vencimiento</p>
                        <p className="font-bold">{format(parseISO(data.fechaVencimiento), 'dd/MM/yyyy')}</p>
                    </div>
                     <div>
                        <p className="text-muted-foreground">Tipo Autorización</p>
                        <p className="capitalize">{data.tipoAutorizacion}</p>
                    </div>
                     <div>
                        <p className="text-muted-foreground">Institución</p>
                        <p>{data.nombreInstitucion} ({data.CodigoInstitucion})</p>
                    </div>
                </div>
                <div className="space-y-2 pt-2">
                    <p className="font-medium text-muted-foreground">Artículos CABYS Incluidos ({filteredCabys.length})</p>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input 
                            placeholder="Buscar por código CABYS o de artículo..."
                            value={cabysFilter}
                            onChange={(e) => setCabysFilter(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                        {filteredCabys.map((item: (EnrichedCabysItem & { localMatches: Product[] }), index) => (
                            <div key={`${item.code}-${index}`} className="p-2 bg-muted/50 rounded-md text-xs">
                               <div className="flex justify-between items-center">
                                    <div>
                                        <p className="font-semibold">{item.description}</p>
                                        <p className="text-muted-foreground">Código: {item.code}</p>
                                    </div>
                                    <Badge variant="secondary">{item.taxRate * 100}%</Badge>
                                </div>
                                {item.localMatches.length > 0 && (
                                    <div className="pl-4 mt-1 border-l-2 border-green-500">
                                        <p className="text-xs font-semibold text-green-700">Artículos Locales Coincidentes:</p>
                                        <ul className="list-disc list-inside text-muted-foreground">
                                            {item.localMatches.map(p => <li key={p.id}>{p.id} - {p.description}</li>)}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};


export default function HaciendaQueryPage() {
    const { isAuthorized } = useAuthorization(['hacienda:query']);
    const { setTitle } = usePageTitle();
    const { toast } = useToast();
    const { user, customers, products, isAuthReady } = useAuth();
    
    const [exemptions, setExemptions] = useState<Exemption[]>([]);
    
    const [isUnifiedLoading, setIsUnifiedLoading] = useState(false);
    const [unifiedContributorData, setUnifiedContributorData] = useState<HaciendaContributorInfo | null>(null);
    const [unifiedExemptionData, setUnifiedExemptionData] = useState<EnrichedExemptionInfo | null>(null);
    const [unifiedErpExemption, setUnifiedErpExemption] = useState<Exemption | null>(null);

    const [unifiedSearchInput, setUnifiedSearchInput] = useState("");
    const [isUnifiedSearchOpen, setUnifiedSearchOpen] = useState(false);
    const [debouncedUnifiedSearch] = useDebounce(unifiedSearchInput, 500);

    const [taxpayerId, setTaxpayerId] = useState('');
    const [exemptionAuth, setExemptionAuth] = useState('');
    const [isTaxpayerLoading, setIsTaxpayerLoading] = useState(false);
    const [isExemptionLoading, setIsExemptionLoading] = useState(false);
    const [contributorData, setContributorData] = useState<HaciendaContributorInfo | null>(null);
    const [exemptionData, setExemptionData] = useState<EnrichedExemptionInfo | null>(null);
    

    useEffect(() => {
        setTitle("Consultas a Hacienda");
        const loadLocalData = async () => {
            if (user && isAuthorized) {
                logInfo('User accessed Hacienda module', { user: user.name });
            }
            try {
                const exemptionsData = await getExemptionsAction();
                setExemptions(exemptionsData);
            } catch (error) {
                toast({ title: "Error de carga", description: "No se pudieron cargar los datos locales de exoneraciones.", variant: "destructive" });
            }
        };
        if (isAuthorized) {
            loadLocalData();
        }
    }, [setTitle, toast, isAuthorized, user]);

    const customerOptions = useMemo(() => {
        if (debouncedUnifiedSearch.length < 2) return [];
        const searchLower = debouncedUnifiedSearch.toLowerCase();
        return customers
            .filter(c => c.id.toLowerCase().includes(searchLower) || c.name.toLowerCase().includes(searchLower))
            .map(c => ({ value: c.id, label: `[${c.id}] - ${c.name}` }));
    }, [customers, debouncedUnifiedSearch]);

    const performTaxpayerSearch = async (id: string, setData: (data: HaciendaContributorInfo | null) => void) => {
        try {
            const result = await getContributorInfo(id);
            if ('error' in result) {
                throw new Error(result.message);
            }
            setData(result as HaciendaContributorInfo);
            return result as HaciendaContributorInfo;
        } catch (error: any) {
            toast({ title: "Error en Consulta Tributaria", description: error.message, variant: "destructive" });
            setData(null);
            return null;
        }
    };

    const performExemptionSearch = async (auth: string, setData: (data: EnrichedExemptionInfo | null) => void) => {
        try {
            const result = await getEnrichedExemptionStatus(auth);
            if ('error' in result) {
                setData(null);
                return null;
            };
            setData(result as EnrichedExemptionInfo);
            return result as EnrichedExemptionInfo;
        } catch (error: any) {
            toast({ title: "Error en Consulta de Exoneración", description: error.message, variant: "destructive" });
            setData(null);
            return null;
        }
    };

    const executeUnifiedSearch = async (customerId: string) => {
        setUnifiedSearchOpen(false);
        setIsUnifiedLoading(true);
        // Reset all data states before starting a new search
        setUnifiedContributorData(null);
        setUnifiedExemptionData(null);
        setUnifiedErpExemption(null);
        
        const customer = customers.find(c => c.id === customerId);
        if (customer) {
            setUnifiedSearchInput(`[${customer.id}] ${customer.name}`);
        }

        const customerExemption = customer ? exemptions.find(ex => ex.customer === customer.id) : null;
        setUnifiedErpExemption(customerExemption || null);
        
        if (!customer || !customer.taxId) {
            toast({ title: "Cliente no encontrado", description: "No se encontró cliente o no tiene cédula registrada.", variant: "destructive" });
            setIsUnifiedLoading(false);
            return;
        }
    
        const contributorPromise = performTaxpayerSearch(customer.taxId, setUnifiedContributorData);
        const exemptionPromise = customerExemption 
            ? performExemptionSearch(customerExemption.authNumber, setUnifiedExemptionData) 
            : Promise.resolve();

        await Promise.all([contributorPromise, exemptionPromise]);

        setIsUnifiedLoading(false);
    };

    const handleIndividualTaxpayerSearch = async () => {
        if (!taxpayerId) return;
        setIsTaxpayerLoading(true);
        await performTaxpayerSearch(taxpayerId, setContributorData);
        setIsTaxpayerLoading(false);
    };

    const handleIndividualExemptionSearch = async () => {
        if (!exemptionAuth) return;
        setIsExemptionLoading(true);
        await performExemptionSearch(exemptionAuth, setExemptionData);
        setIsExemptionLoading(false);
    };

    const handleSearchInputChange = (value: string) => {
        setUnifiedSearchInput(value);
        if (value.length > 1) {
            setUnifiedSearchOpen(true);
        } else {
            setUnifiedSearchOpen(false);
            // Clear results when input is cleared
            setUnifiedContributorData(null);
            setUnifiedExemptionData(null);
            setUnifiedErpExemption(null);
        }
    };

    if (!isAuthReady) {
        return (
            <main className="flex-1 p-4 md:p-6 lg:p-8">
                 <Card className="max-w-4xl mx-auto">
                    <CardHeader>
                        <Skeleton className="h-8 w-64" />
                        <Skeleton className="h-6 w-full max-w-md mt-2" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-40 w-full" />
                    </CardContent>
                 </Card>
            </main>
        )
    }
    
    if (!isAuthorized) {
        return null;
    }

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-8">
            <Tabs defaultValue="unified">
                <TabsList className="w-full flex-wrap h-auto md:grid md:grid-cols-3 md:h-10">
                    <TabsTrigger value="unified">Búsqueda Unificada</TabsTrigger>
                    <TabsTrigger value="taxpayer">Situación Tributaria</TabsTrigger>
                    <TabsTrigger value="exemption">Exoneraciones</TabsTrigger>
                </TabsList>
                
                <TabsContent value="unified">
                    <Card>
                        <CardHeader>
                            <CardTitle>Búsqueda Unificada de Cliente</CardTitle>
                            <CardDescription>Busca un cliente para obtener la situación tributaria y la exoneración asociada (si existe).</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-2">
                                <SearchInput
                                    options={customerOptions}
                                    onSelect={(option) => executeUnifiedSearch(option.value)}
                                    value={unifiedSearchInput}
                                    onValueChange={handleSearchInputChange}
                                    placeholder="Buscar cliente por código, nombre o cédula..."
                                    open={isUnifiedSearchOpen}
                                    onOpenChange={setUnifiedSearchOpen}
                                />
                            </div>
                            {isUnifiedLoading && <div className="flex justify-center py-4"><Loader2 className="animate-spin" /></div>}
                            {!isUnifiedLoading && (unifiedContributorData || unifiedErpExemption || unifiedExemptionData) && (
                                <div className="grid md:grid-cols-2 gap-8 pt-4 border-t">
                                    <ContributorInfoCard data={unifiedContributorData} />
                                    <div className="space-y-6">
                                        <ErpExemptionCard erpData={unifiedErpExemption} />
                                        <HaciendaExemptionCard data={unifiedExemptionData} products={products} />
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="taxpayer">
                    <Card>
                        <CardHeader>
                            <CardTitle>Situación Tributaria</CardTitle>
                            <CardDescription>Consulta la información de un contribuyente en el sistema de Hacienda.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-2">
                                <Input
                                    id="taxpayer-id"
                                    placeholder="Nº de identificación"
                                    value={taxpayerId}
                                    onChange={(e) => setTaxpayerId(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleIndividualTaxpayerSearch()}
                                />
                                <Button onClick={handleIndividualTaxpayerSearch} disabled={isTaxpayerLoading}>
                                    {isTaxpayerLoading ? <Loader2 className="animate-spin" /> : <Search />}
                                </Button>
                            </div>
                            {isTaxpayerLoading && <div className="flex justify-center py-4"><Loader2 className="animate-spin" /></div>}
                            {!isTaxpayerLoading && contributorData && <ContributorInfoCard data={contributorData} />}
                        </CardContent>
                    </Card>
                </TabsContent>
                
                <TabsContent value="exemption">
                    <Card>
                        <CardHeader>
                            <CardTitle>Consulta de Exoneraciones</CardTitle>
                            <CardDescription>Verifica los detalles de una autorización de exoneración.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-2">
                                <Input
                                    id="exemption-auth"
                                    placeholder="Nº de autorización"
                                    value={exemptionAuth}
                                    onChange={(e) => setExemptionAuth(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleIndividualExemptionSearch()}
                                />
                                <Button onClick={handleIndividualExemptionSearch} disabled={isExemptionLoading}>
                                     {isExemptionLoading ? <Loader2 className="animate-spin" /> : <Search />}
                                </Button>
                            </div>
                            {isExemptionLoading && <div className="flex justify-center py-4"><Loader2 className="animate-spin" /></div>}
                            {!isExemptionLoading && exemptionData && <HaciendaExemptionCard data={exemptionData} products={products}/>}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
             {(isUnifiedLoading || isTaxpayerLoading || isExemptionLoading) && (
                <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-lg bg-primary p-3 text-primary-foreground shadow-lg">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Procesando...</span>
                </div>
            )}
        </main>
    );
}
