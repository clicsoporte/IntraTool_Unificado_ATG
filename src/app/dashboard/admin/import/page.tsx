/**
 * @fileoverview Admin page for managing data imports from external sources (files or SQL DB).
 * This component allows administrators to configure import paths, connection strings,
 * and SQL queries, and to trigger the import processes.
 */
"use client";

import { useState, useEffect, useCallback, ChangeEvent } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/modules/core/hooks/use-toast";
import { logError, logInfo } from "@/modules/core/lib/logger";
import { Loader2, FileUp, Database, Save } from "lucide-react";
import type { Company, SqlConfig, ImportQuery } from '@/modules/core/types';
import { usePageTitle } from "@/modules/core/hooks/usePageTitle";
import { importData, getCompanySettings, saveCompanySettings, testSqlConnection, saveSqlConfig, saveImportQueries, getImportQueries } from '@/modules/core/lib/db';
import { syncAllData } from '@/modules/core/lib/actions';
import { getSqlConfig } from '@/modules/core/lib/config-db';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

type ImportType = ImportQuery['type'];
const importTypes: ImportType[] = ['customers', 'products', 'exemptions', 'stock', 'locations', 'cabys', 'suppliers', 'erp_order_headers', 'erp_order_lines', 'erp_purchase_order_headers', 'erp_purchase_order_lines', 'erp_invoice_headers', 'erp_invoice_lines', 'employees', 'departments', 'positions', 'payrolls', 'salespersons', 'customer_shipment_addresses'];

const importTypeTranslations: { [key in ImportType]: string } = {
    customers: 'Clientes',
    products: 'Artículos',
    exemptions: 'Exoneraciones',
    stock: 'Existencias',
    locations: 'Ubicaciones',
    cabys: 'Catálogo CABYS',
    suppliers: 'Proveedores',
    erp_order_headers: 'Pedidos ERP (Cabeceras)',
    erp_order_lines: 'Pedidos ERP (Líneas)',
    erp_purchase_order_headers: 'Órdenes de Compra ERP (Cabeceras)',
    erp_purchase_order_lines: 'Órdenes de Compra ERP (Líneas)',
    erp_invoice_headers: 'Facturas ERP (Cabeceras)',
    erp_invoice_lines: 'Facturas ERP (Líneas)',
    employees: 'Empleados (RRHH)',
    departments: 'Departamentos (RRHH)',
    positions: 'Puestos (RRHH)',
    payrolls: 'Nóminas (RRHH)',
    salespersons: 'Vendedores (RRHH)',
    customer_shipment_addresses: 'Direcciones de Embarque / Entrega'
};

const defaultQueries: { [key in ImportType]?: string } = {
    customers: "SELECT [CLIENTE], [NOMBRE], [DIRECCION], [TELEFONO1], [CONTRIBUYENTE], [MONEDA], [LIMITE_CREDITO], [CONDICION_PAGO], [VENDEDOR], [ACTIVO], [E_MAIL], [EMAIL_DOC_ELECTRONICO] FROM [GAREND].[CLIENTE]",
    products: "SELECT [ARTICULO], [DESCRIPCION], [CLASIFICACION_2], [ULTIMO_INGRESO], [ACTIVO], [NOTAS], [UNIDAD_VENTA], [CANASTA_BASICA], [CODIGO_HACIENDA], [CODIGO_BARRAS_VENT] FROM [SOFTLAND].[GAREND].[ARTICULO]",
    exemptions: "SELECT [CODIGO], [DESCRIPCION], [CLIENTE], [NUM_AUTOR], [FECHA_RIGE], [FECHA_VENCE], [PORCENTAJE], [TIPO_DOC], [NOMBRE_INSTITUCION], [CODIGO_INSTITUCION] FROM [GAREND].[EXENCION]",
    stock: "SELECT [ARTICULO], [BODEGA], [CANT_DISPONIBLE] FROM [GAREND].[EXISTENCIA_BODEGA]",
    locations: "SELECT [CODIGO], [P. HORIZONTAL], [P. VERTICAL], [RACK], [CLIENTE], [DESCRIPCION] FROM [GAREND].[UBICACION]",
    suppliers: "SELECT [PROVEEDOR], [NOMBRE], [ALIAS], [E_MAIL], [TELEFONO1] FROM [GAREND].[PROVEEDOR]",
    erp_order_headers: "SELECT T0.[PEDIDO], T0.[ESTADO], T0.[CLIENTE], T0.[FECHA_PEDIDO], T0.[FECHA_PROMETIDA], T0.[ORDEN_COMPRA], T0.[TOTAL_UNIDADES], T0.[MONEDA_PEDIDO], T0.[USUARIO] FROM [GAREND].[PEDIDO] AS T0 WHERE T0.[FECHA_PEDIDO] >= DATEADD(day, -60, GETDATE()) AND T0.[ESTADO] NOT IN ('F', 'C') ORDER BY T0.[FECHA_PEDIDO] DESC",
    erp_order_lines: "SELECT T1.[PEDIDO], T1.[PEDIDO_LINEA], T1.[ARTICULO], T1.[CANTIDAD_PEDIDA], T1.[PRECIO_UNITARIO] FROM [GAREND].[PEDIDO_LINEA] AS T1 INNER JOIN [GAREND].[PEDIDO] AS T0 ON T1.PEDIDO = T0.PEDIDO WHERE T0.FECHA_PEDIDO >= DATEADD(day, -60, GETDATE()) AND T1.[ESTADO] NOT IN ('F', 'C')",
    erp_purchase_order_headers: "SELECT [ORDEN_COMPRA], [PROVEEDOR], [FECHA_HORA], [ESTADO], [CreatedBy] FROM [SOFTLAND].[GAREND].[ORDEN_COMPRA]",
    erp_purchase_order_lines: "SELECT [ORDEN_COMPRA], [ARTICULO], [CANTIDAD_ORDENADA] FROM [SOFTLAND].[GAREND].[ORDEN_COMPRA_LINEA]",
    erp_invoice_headers: "SELECT [CLIENTE], [NOMBRE_CLIENTE], [TIPO_DOCUMENTO], [FACTURA], [PEDIDO], [FACTURA_ORIGINAL], [FECHA], [FECHA_ENTREGA], [ANULADA], [DIREC_EMBARQUE], [EMBARCAR_A], [DIRECCION_FACTURA], [OBSERVACIONES], [RUTA], [USUARIO], [USUARIO_ANULA], [ZONA], [VENDEDOR], [REIMPRESO] FROM [SOFTLAND].[GAREND].[FACTURA]",
    erp_invoice_lines: "SELECT [FACTURA], [TIPO_DOCUMENTO], [LINEA], [BODEGA], [PEDIDO], [ARTICULO], [ANULADA], [FECHA_FACTURA], [CANTIDAD], [PRECIO_UNITARIO], [TOTAL_IMPUESTO1], [PRECIO_TOTAL], [DESCRIPCION], [DOCUMENTO_ORIGEN], [CANT_DESPACHADA], [ES_CANASTA_BASICA] FROM [SOFTLAND].[GAREND].[FACTURA_LINEA]",
    employees: '',
    departments: '',
    positions: '',
    payrolls: '',
    salespersons: '',
    customer_shipment_addresses: "SELECT [CLIENTE], [DIRECCION], [DETALLE_DIRECCION], [DESCRIPCION], [CONTACTO], [CARGO], [TELEFONO1], [TELEFONO2] FROM [SOFTLAND].[GAREND].[DIRECC_EMBARQUE]"
};


const importTypeFieldMapping: { [key in ImportType]?: keyof Company } = {
    customers: 'customerFilePath',
    products: 'productFilePath',
    exemptions: 'exemptionFilePath',
    stock: 'stockFilePath',
    locations: 'locationFilePath',
    cabys: 'cabysFilePath',
    suppliers: 'supplierFilePath',
    erp_purchase_order_headers: 'erpPurchaseOrderHeaderFilePath',
    erp_purchase_order_lines: 'erpPurchaseOrderLineFilePath',
    erp_invoice_headers: 'erpInvoiceHeaderFilePath',
    erp_invoice_lines: 'erpInvoiceLineFilePath',
};

/**
 * Renders the data import management page.
 * It provides UI for switching between import modes (file vs. SQL), configuring settings
 * for each mode, and executing import jobs.
 */
export default function ImportDataPage() {
    const { hasPermission } = useAuthorization(['admin:import:files', 'admin:import:sql', 'admin:import:sql-config']);
    const { toast } = useToast();
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingType, setProcessingType] = useState<string | null>(null);
    const [companyData, setCompanyData] = useState<Company | null>(null);
    const [sqlConfig, setSqlConfig] = useState<SqlConfig>({});
    const [importQueries, setImportQueries] = useState<ImportQuery[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const { setTitle } = usePageTitle();

    useEffect(() => {
        setTitle("Importar Datos");
        const loadConfig = async () => {
            const [company, sql, queries] = await Promise.all([
                getCompanySettings(),
                getSqlConfig(),
                getImportQueries()
            ]);
            setCompanyData(company);
            setSqlConfig(sql || {});
            
            const updatedQueries = [...queries];
            importTypes.forEach(type => {
                if (!queries.some((q: any) => q.type === type) && defaultQueries[type]) {
                    updatedQueries.push({ type, query: defaultQueries[type]! });
                }
            });
            setImportQueries(updatedQueries);
        };
        loadConfig();
    }, [setTitle]);

    /**
     * Handles the import of a single data type (e.g., customers).
     * @param {ImportType} type The type of data to import.
     */
    const handleImport = async (type: ImportType) => {
        setProcessingType(type);
        setIsProcessing(true);
        try {
            const result = await importData(type);
            toast({
                title: `Importación de ${importTypeTranslations[type]} Exitosa`,
                description: `Se han cargado ${result.count} registros desde ${result.source}.`,
            });
            await logInfo(`Importación de datos: ${result.count} ${type} cargados desde ${result.source}.`);
        } catch (error: any) {
            toast({
                title: "Error de Importación",
                description: error.message,
                variant: "destructive"
            });
            await logError(`Error al importar ${type}`, { error: error.message });
        } finally {
            setIsProcessing(false);
            setProcessingType(null);
        }
    };
    
    /**
     * Triggers a full data synchronization from the configured source (file or SQL).
     */
    const handleFullSync = async () => {
        setProcessingType('full-sync');
        setIsProcessing(true);
        toast({ title: "Iniciando Sincronización Completa", description: "Importando todos los datos desde el ERP..." });
        try {
            const { results, totalTasks } = await syncAllData();
            toast({
                title: "Sincronización Completa Exitosa",
                description: `Se han procesado ${results.length} de ${totalTasks} tipos de datos desde el ERP.`,
            });
            await logInfo("Full ERP data synchronization completed.", { results });
        } catch (error: any) {
             toast({
                title: "Error en Sincronización",
                description: error.message,
                variant: "destructive"
            });
            await logError(`Error durante la sincronización completa desde el ERP`, { error: error.message });
        } finally {
            setIsProcessing(false);
            setProcessingType(null);
        }
    }
    
    const handleCompanyDataChange = (field: keyof Company, value: any) => {
        if (!companyData) return;
        setCompanyData((prev: Company | null) => prev ? ({ ...prev, [field]: value }) : null);
    };

    const handleSqlConfigChange = (field: keyof SqlConfig, value: string) => {
        setSqlConfig((prev: SqlConfig) => ({ ...prev, [field]: value }));
    };

    const handleQueryChange = (type: ImportType, query: string) => {
        const existingQuery = importQueries.find(q => q.type === type);
        if (existingQuery) {
            setImportQueries(importQueries.map(q => q.type === type ? { ...q, query } : q));
        } else {
            setImportQueries([...importQueries, { type, query }]);
        }
    };
    
    /**
     * Saves all configuration changes made on the page to the database.
     */
    const handleSaveAllConfigs = async () => {
        setIsSaving(true);
        try {
            if (companyData) await saveCompanySettings(companyData);
            if (hasPermission('admin:import:sql-config')) {
                await saveSqlConfig(sqlConfig);
                await saveImportQueries(importQueries);
            }
            toast({ title: "Configuración Guardada", description: "Todos los ajustes de importación han sido guardados." });
            logInfo("Import settings saved.");
        } catch (error: any) {
            logError("Failed to save import settings", { error: error.message });
            toast({ title: "Error al Guardar", description: `No se pudieron guardar los ajustes. ${error.message}`, variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    /**
     * Tests the connection to the SQL Server database with the provided credentials.
     */
    const handleTestConnection = async () => {
        setIsSaving(true);
        try {
            await testSqlConnection();
            toast({ title: "Conexión Exitosa", description: "Se pudo conectar a la base de datos SQL Server correctamente." });
        } catch (error: any) {
            toast({ title: "Error de Conexión", description: error.message, variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    /**
     * Renders a card for a single file import type.
     * @param {ImportType} type The type of data this card is for.
     * @returns {JSX.Element} A card component for file import.
     */
    const renderFileImportCard = (type: ImportType) => {
        const fieldName = importTypeFieldMapping[type as keyof typeof importTypeFieldMapping];
        if (!fieldName) return null;

        return (
            <Card key={type} className="flex flex-col">
                <CardHeader>
                    <Label htmlFor={`${type}-path`}>{importTypeTranslations[type]}</Label>
                    <Input 
                        id={`${type}-path`}
                        placeholder={`Ej: C:\\import\\${type}.txt`}
                        value={companyData?.[fieldName] as string || ''}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => handleCompanyDataChange(fieldName, e.target.value)} 
                    />
                </CardHeader>
                <CardFooter>
                    <Button type="button" onClick={() => handleImport(type)} disabled={isProcessing}>
                        {isProcessing && processingType === type ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
                        Procesar Archivo
                    </Button>
                </CardFooter>
            </Card>
        );
    }
    
    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-8">
             <Card>
                <CardHeader>
                    <CardTitle>Configuración de Importación de Datos</CardTitle>
                    <CardDescription>
                        Elige cómo el sistema obtiene los datos transaccionales del ERP. El catálogo CABYS siempre se importa desde un archivo.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center space-x-2">
                        <Label htmlFor="import-mode">Importar desde Archivos</Label>
                        <Switch
                          id="import-mode"
                          checked={companyData?.importMode === 'sql'}
                          onCheckedChange={(checked: boolean) => handleCompanyDataChange('importMode', checked ? 'sql' : 'file')}
                          disabled={!hasPermission('admin:import:sql-config')}
                        />
                        <Label htmlFor="import-mode">Importar desde SQL Server</Label>
                    </div>
                </CardContent>
             </Card>
            
            {hasPermission('admin:import:files') && (
                <Card>
                    <CardHeader>
                        <CardTitle>Importación desde Archivos</CardTitle>
                        <CardDescription>
                            Procesa los archivos de datos (`.txt` o `.csv`) desde una ruta completa en el servidor. El catálogo CABYS siempre se puede importar desde un archivo.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {companyData?.importMode === 'file' && Object.keys(importTypeFieldMapping).map(type => renderFileImportCard(type as ImportType))}
                        {renderFileImportCard('cabys')}
                    </CardContent>
                </Card>
            )}

            {companyData?.importMode === 'sql' && hasPermission('admin:import:sql') && (
                 <Card>
                    <CardHeader>
                        <CardTitle>Importación desde SQL Server</CardTitle>
                        <CardDescription>
                           Ejecuta todas las consultas SQL configuradas para traer los datos directamente desde el ERP a la base de datos local.
                        </CardDescription>
                    </CardHeader>
                     <CardContent>
                        <Button type="button" onClick={handleFullSync} disabled={isProcessing} size="lg">
                             {isProcessing && processingType === 'full-sync' ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Database className="mr-2 h-5 w-5" />}
                            Importar Todos los Datos desde ERP
                        </Button>
                     </CardContent>
                </Card>
            )}

            {companyData?.importMode === 'sql' && hasPermission('admin:import:sql-config') && (
                <Accordion type="multiple" defaultValue={['sql-config', 'query-manager']} className="w-full space-y-6">
                    <Card>
                        <AccordionItem value="sql-config">
                            <AccordionTrigger className="p-6">
                                <CardTitle>Configuración de Conexión a SQL Server</CardTitle>
                            </AccordionTrigger>
                            <AccordionContent className="p-6 pt-0">
                                <CardDescription className="mb-4">
                                    Introduce los datos para conectar con la base de datos de tu ERP. Estos datos se guardan de forma segura en el archivo .env del servidor.
                                </CardDescription>
                                <div className="space-y-4">
                                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="sql-host">Servidor (Host o IP)</Label>
                                            <Input id="sql-host" value={sqlConfig.host || ''} onChange={(e: ChangeEvent<HTMLInputElement>) => handleSqlConfigChange('host', e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="sql-port">Puerto</Label>
                                            <Input id="sql-port" type="number" value={sqlConfig.port || ''} onChange={(e: ChangeEvent<HTMLInputElement>) => handleSqlConfigChange('port', e.target.value)} />
                                        </div>
                                         <div className="space-y-2">
                                            <Label htmlFor="sql-database">Nombre de Base de Datos</Label>
                                            <Input id="sql-database" value={sqlConfig.database || ''} onChange={(e: ChangeEvent<HTMLInputElement>) => handleSqlConfigChange('database', e.target.value)} />
                                        </div>
                                         <div className="space-y-2">
                                            <Label htmlFor="sql-user">Usuario</Label>
                                            <Input id="sql-user" value={sqlConfig.user || ''} onChange={(e: ChangeEvent<HTMLInputElement>) => handleSqlConfigChange('user', e.target.value)} />
                                        </div>
                                         <div className="space-y-2">
                                            <Label htmlFor="sql-password">Contraseña</Label>
                                            <Input id="sql-password" type="password" value={sqlConfig.password || ''} onChange={(e: ChangeEvent<HTMLInputElement>) => handleSqlConfigChange('password', e.target.value)} />
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-6">
                                    <Button type="button" onClick={handleTestConnection} disabled={isSaving} variant="secondary">
                                        {isSaving && processingType !== 'test-connection' ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                                        Probar Conexión
                                    </Button>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Card>
                    <Card>
                        <AccordionItem value="query-manager">
                            <AccordionTrigger className="p-6">
                                <CardTitle>Gestión de Consultas SQL</CardTitle>
                            </AccordionTrigger>
                            <AccordionContent className="p-6 pt-0">
                                 <CardDescription className="mb-4">
                                    Define la consulta SELECT para cada tipo de dato. El sistema mapeará las columnas automáticamente según los nombres definidos en la documentación.
                                </CardDescription>
                                <div className="space-y-4">
                                    {importTypes.map(type => (
                                        <div key={type} className="space-y-2">
                                            <Label htmlFor={`query-${type}`}>Consulta para {importTypeTranslations[type]}</Label>
                                            <Textarea
                                                id={`query-${type}`}
                                                value={importQueries.find(q => q.type === type)?.query || ''}
                                                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => handleQueryChange(type, e.target.value)}
                                                placeholder={`SELECT ... FROM tu_tabla_de_${type}`}
                                                rows={4}
                                                className="font-mono text-xs"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Card>
                </Accordion>
            )}

            <Card>
                <CardFooter>
                    <Button type="button" onClick={handleSaveAllConfigs} disabled={isSaving}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Guardar Toda la Configuración
                    </Button>
                </CardFooter>
            </Card>
             {isProcessing && (
                <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-lg bg-primary p-3 text-primary-foreground shadow-lg">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Procesando...</span>
                </div>
            )}
        </main>
    );
}
