'use client';

import React, { useState, useEffect, useMemo, useTransition } from 'react';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { useAuthorization } from '@/modules/core/hooks/useAuthorization';
import { useToast } from '@/modules/core/hooks/use-toast';
import { 
    getMobileFleetData, 
    saveMobileDeviceAssignment, 
    deleteMobileDeviceAction,
    publishAppVersion, 
    toggleOtaPause, 
    resetDeviceOtaFailures,
    getSystemUsersList,
    saveDeviceMdmPolicy,
    requestAppUninstallAction,
    requestDeviceRebootAction,
    saveFleetServerUrlsAction
} from '@/modules/it-tools/lib/actions';
import { generateOtpFromChallenge } from '@/modules/it-tools/lib/otp-calculator';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { 
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from '@/components/ui/select';
import { 
    Smartphone, 
    RefreshCw, 
    CheckCircle2, 
    AlertTriangle, 
    PauseCircle, 
    PlayCircle, 
    Battery, 
    UserCheck, 
    Phone, 
    UploadCloud, 
    RotateCcw, 
    ShieldAlert, 
    ArrowLeft,
    MapPin,
    AppWindow,
    Check,
    X,
    Edit2,
    Trash2,
    Zap,
    HardDrive,
    Volume2,
    Radio,
    Gauge,
    Wifi,
    Flame,
    Activity,
    Search,
    Lock,
    Clock,
    Pin,
    Cpu
} from 'lucide-react';
import Link from 'next/link';

export default function MobileFleetPage() {
    const { setTitle } = usePageTitle();
    const { isAuthorized, isLoading: authLoading } = useAuthorization(['it-tools:access']);
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();

    const [loading, setLoading] = useState(true);
    const [versionSettings, setVersionSettings] = useState<any>(null);
    const [devices, setDevices] = useState<any[]>([]);
    const [usersList, setUsersList] = useState<any[]>([]);

    // Publish Version Form State
    const [versionName, setVersionName] = useState('1.2.35');
    const [versionCode, setVersionCode] = useState('54');
    const [apkUrl, setApkUrl] = useState('/downloads/apk/ClicDriver.apk');
    const [releaseNotes, setReleaseNotes] = useState('Actualización Oficial v1.2.35: Soporte de Acceso Rápido Nativo con Huella Dactilar, Patrón o PIN de Android, y cierre de sesión limpio multi-chofer.');
    const [serverUrlPrimary, setServerUrlPrimary] = useState('http://192.168.1.14:9001');
    const [serverUrlFallback, setServerUrlFallback] = useState('');
    const [forceUpdate, setForceUpdate] = useState(false);
    const [backgroundSyncMinutes, setBackgroundSyncMinutes] = useState('5');
    const [adminPin, setAdminPin] = useState('0000');
    const [telegramAlertsChatId, setTelegramAlertsChatId] = useState('');
    const [smsGatewayItPhones, setSmsGatewayItPhones] = useState('');
    const [publicIpApiPrimary, setPublicIpApiPrimary] = useState('https://api.ipify.org');
    const [publicIpApiFallback, setPublicIpApiFallback] = useState('https://icanhazip.com');

    // Edit Device Modal/Inline State
    const [editingHwid, setEditingHwid] = useState<string | null>(null);
    const [editPhone, setEditPhone] = useState('');
    const [editUserId, setEditUserId] = useState<string>('');
    const [editName, setEditName] = useState('');

    // Fleet Table Sorting, Search & Work Tracking
    const [fleetSearchQuery, setFleetSearchQuery] = useState('');
    const [fleetSortBy, setFleetSortBy] = useState<'name' | 'driver' | 'last_seen' | 'battery'>('name');
    const [lastWorkedHwid, setLastWorkedHwid] = useState<string | null>(null);

    // Apps Modal State
    const [selectedAppsDevice, setSelectedAppsDevice] = useState<any | null>(null);
    const [whitelistedPkgs, setWhitelistedPkgs] = useState<string[]>([]);
    const [pinnedPkgs, setPinnedPkgs] = useState<string[]>([]);
    const [appSearchQuery, setAppSearchQuery] = useState('');
    const [appFilterTab, setAppFilterTab] = useState<'all' | 'user' | 'system'>('all');

    // Hardware & Telemetry Modal State
    const [selectedHardwareDevice, setSelectedHardwareDevice] = useState<any | null>(null);

    // MDM Hardening Modal State
    const [selectedMdmDevice, setSelectedMdmDevice] = useState<any | null>(null);
    const [mdmKioskEnabled, setMdmKioskEnabled] = useState(false);
    const [mdmForceGps, setMdmForceGps] = useState(true);
    const [mdmDisallowAirplaneMode, setMdmDisallowAirplaneMode] = useState(false);
    const [mdmDisallowMobileDataOff, setMdmDisallowMobileDataOff] = useState(false);
    const [mdmDisallowBatterySaver, setMdmDisallowBatterySaver] = useState(false);
    const [mdmBlockUninstall, setMdmBlockUninstall] = useState(true);
    const [mdmDisallowSettings, setMdmDisallowSettings] = useState(false);
    const [mdmDisallowTethering, setMdmDisallowTethering] = useState(false);
    const [mdmDisallowInstallApps, setMdmDisallowInstallApps] = useState(false);
    const [mdmDisallowPlayStoreInstall, setMdmDisallowPlayStoreInstall] = useState(false);
    const [mdmAlwaysOnVpn, setMdmAlwaysOnVpn] = useState(false);

    // OTP Token Modal State
    const [selectedOtpDevice, setSelectedOtpDevice] = useState<any | null>(null);
    const [otpChallengeInput, setOtpChallengeInput] = useState('');

    // Sorted & Filtered Devices
    const processedDevices = useMemo(() => {
        let list = [...devices];
        if (fleetSearchQuery.trim()) {
            const q = fleetSearchQuery.toLowerCase().trim();
            list = list.filter((d: any) => 
                (d.device_name && d.device_name.toLowerCase().includes(q)) ||
                (d.last_driver_name && d.last_driver_name.toLowerCase().includes(q)) ||
                (d.hardware_id && d.hardware_id.toLowerCase().includes(q)) ||
                (d.device_model && d.device_model.toLowerCase().includes(q)) ||
                (d.phone_number && d.phone_number.includes(q)) ||
                (d.driver_phone && d.driver_phone.includes(q))
            );
        }

        list.sort((a: any, b: any) => {
            if (fleetSortBy === 'name') {
                const nameA = (a.device_name || a.hardware_id || '').toLowerCase();
                const nameB = (b.device_name || b.hardware_id || '').toLowerCase();
                return nameA.localeCompare(nameB);
            }
            if (fleetSortBy === 'driver') {
                const drvA = (a.last_driver_name || 'zzz').toLowerCase();
                const drvB = (b.last_driver_name || 'zzz').toLowerCase();
                return drvA.localeCompare(drvB);
            }
            if (fleetSortBy === 'battery') {
                return (b.battery_level ?? 0) - (a.battery_level ?? 0);
            }
            // Default last_seen
            return new Date(b.last_seen || 0).getTime() - new Date(a.last_seen || 0).getTime();
        });

        return list;
    }, [devices, fleetSearchQuery, fleetSortBy]);

    const handleOpenMdmModal = (device: any) => {
        setSelectedMdmDevice(device);
        setLastWorkedHwid(device.hardware_id);
        setMdmKioskEnabled(device.mdm_kiosk_enabled === 1);
        setMdmForceGps(device.mdm_force_gps !== 0);
        setMdmDisallowAirplaneMode(device.mdm_disallow_airplane_mode === 1);
        setMdmDisallowMobileDataOff(device.mdm_disallow_mobile_data_off === 1);
        setMdmDisallowBatterySaver(device.mdm_disallow_battery_saver === 1);
        setMdmBlockUninstall(device.mdm_block_uninstall !== 0);
        setMdmDisallowSettings(device.mdm_disallow_settings === 1);
        setMdmDisallowTethering(device.mdm_disallow_tethering === 1);
        setMdmDisallowInstallApps(device.mdm_disallow_install_apps === 1);
        setMdmDisallowPlayStoreInstall(device.mdm_disallow_play_store_install === 1);
        setMdmAlwaysOnVpn(device.mdm_always_on_vpn === 1);
    };

    const handleSaveMdmPolicy = (andNext: boolean = false) => {
        if (!selectedMdmDevice) return;
        const currentHwid = selectedMdmDevice.hardware_id;
        const currentIndex = processedDevices.findIndex((d: any) => d.hardware_id === currentHwid);
        const nextDevice = andNext && currentIndex >= 0 && currentIndex < processedDevices.length - 1
            ? processedDevices[currentIndex + 1]
            : null;

        startTransition(async () => {
            try {
                const res = await saveDeviceMdmPolicy(selectedMdmDevice.hardware_id, {
                    mdm_kiosk_enabled: mdmKioskEnabled ? 1 : 0,
                    mdm_force_gps: mdmForceGps ? 1 : 0,
                    mdm_disallow_airplane_mode: mdmDisallowAirplaneMode ? 1 : 0,
                    mdm_disallow_mobile_data_off: mdmDisallowMobileDataOff ? 1 : 0,
                    mdm_disallow_battery_saver: mdmDisallowBatterySaver ? 1 : 0,
                    mdm_block_uninstall: mdmBlockUninstall ? 1 : 0,
                    mdm_disallow_settings: mdmDisallowSettings ? 1 : 0,
                    mdm_disallow_tethering: mdmDisallowTethering ? 1 : 0,
                    mdm_disallow_install_apps: mdmDisallowInstallApps ? 1 : 0,
                    mdm_disallow_play_store_install: mdmDisallowPlayStoreInstall ? 1 : 0,
                    mdm_always_on_vpn: mdmAlwaysOnVpn ? 1 : 0,
                });
                if (res?.success) {
                    toast({
                        title: "Políticas MDM Guardadas 🛡️",
                        description: `Restricciones actualizadas para ${selectedMdmDevice.device_name || selectedMdmDevice.hardware_id}.`
                    });
                    setLastWorkedHwid(currentHwid);
                    if (andNext && nextDevice) {
                        handleOpenMdmModal(nextDevice);
                    } else {
                        setSelectedMdmDevice(null);
                    }
                    loadData(true);
                }
            } catch (err: any) {
                toast({
                    title: "Error guardando políticas MDM",
                    description: err?.message,
                    variant: "destructive"
                });
            }
        });
    };

    // Confirmation Dialog States (Evitar window.confirm del navegador)
    const [confirmUninstall, setConfirmUninstall] = useState<{ hwid: string; appName: string; packageName: string } | null>(null);
    const [confirmReboot, setConfirmReboot] = useState<{ hwid: string; deviceName: string } | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<{ hwid: string; name: string } | null>(null);

    const handleOpenAppsModal = (device: any) => {
        setSelectedAppsDevice(device);
        setLastWorkedHwid(device.hardware_id);
        setAppSearchQuery('');
        setAppFilterTab('all');
        let currentWhitelist: string[] = [];
        if (device.mdm_whitelisted_packages) {
            try {
                currentWhitelist = JSON.parse(device.mdm_whitelisted_packages);
            } catch (_) {}
        }
        setWhitelistedPkgs(currentWhitelist);

        let currentPinned: string[] = [];
        if (device.mdm_pinned_apps) {
            try {
                currentPinned = JSON.parse(device.mdm_pinned_apps);
            } catch (_) {}
        }
        setPinnedPkgs(currentPinned);
    };

    const handleConfirmUninstall = () => {
        if (!confirmUninstall) return;
        const { hwid, appName, packageName } = confirmUninstall;
        setConfirmUninstall(null);

        startTransition(async () => {
            try {
                const res = await requestAppUninstallAction(hwid, packageName);
                if (res?.success) {
                    toast({
                        title: "Orden de Desinstalación Encolada 🗑️",
                        description: `"${appName}" se desinstalará silenciosamente en la próxima sincronización del teléfono.`
                    });
                    loadData(true);
                } else {
                    toast({
                        title: "Acción no permitida",
                        description: res?.error || "No se pudo encolar la desinstalación",
                        variant: "destructive"
                    });
                }
            } catch (err: any) {
                toast({
                    title: "Error del servidor",
                    description: err?.message,
                    variant: "destructive"
                });
            }
        });
    };

    const handleConfirmReboot = () => {
        if (!confirmReboot) return;
        const { hwid, deviceName } = confirmReboot;
        setConfirmReboot(null);

        startTransition(async () => {
            try {
                const res = await requestDeviceRebootAction(hwid);
                if (res?.success) {
                    toast({
                        title: "Orden de Reinicio Enviada 🔄",
                        description: `El dispositivo ${deviceName || hwid} se reiniciará en su próxima sincronización.`
                    });
                    loadData(true);
                }
            } catch (err: any) {
                toast({
                    title: "Error enviando reinicio",
                    description: err?.message,
                    variant: "destructive"
                });
            }
        });
    };

    const handleToggleAppWhitelist = (packageName: string, isAllowed: boolean) => {
        setWhitelistedPkgs(prev => {
            let currentList = prev;
            // Si la lista actual está vacía (todas permitidas por defecto), poblarla con todas las apps del celular
            if (currentList.length === 0 && modalAppsList.length > 0) {
                currentList = modalAppsList.map((a: any) => a.packageName).filter(Boolean);
            }

            if (isAllowed) {
                if (!currentList.includes(packageName)) return [...currentList, packageName];
                return currentList;
            } else {
                return currentList.filter(p => p !== packageName);
            }
        });
    };

    const handleToggleAppPinned = (packageName: string) => {
        setPinnedPkgs(prev => {
            if (prev.includes(packageName)) {
                return prev.filter(p => p !== packageName);
            } else {
                return [...prev, packageName];
            }
        });
    };

    const handleSaveAppWhitelist = (andNext: boolean = false) => {
        if (!selectedAppsDevice) return;
        const currentHwid = selectedAppsDevice.hardware_id;
        const currentIndex = processedDevices.findIndex((d: any) => d.hardware_id === currentHwid);
        const nextDevice = andNext && currentIndex >= 0 && currentIndex < processedDevices.length - 1
            ? processedDevices[currentIndex + 1]
            : null;

        startTransition(async () => {
            try {
                const res = await saveDeviceMdmPolicy(selectedAppsDevice.hardware_id, {
                    mdm_whitelisted_packages: JSON.stringify(whitelistedPkgs),
                    mdm_pinned_apps: JSON.stringify(pinnedPkgs)
                });
                if (res?.success) {
                    toast({
                        title: "Lista de Apps & Herramientas de Ruta Guardada 📱",
                        description: `Políticas de aplicaciones y accesos directos actualizados.`
                    });
                    setLastWorkedHwid(currentHwid);
                    if (andNext && nextDevice) {
                        handleOpenAppsModal(nextDevice);
                    } else {
                        setSelectedAppsDevice(null);
                    }
                    loadData(true);
                }
            } catch (err: any) {
                toast({
                    title: "Error guardando lista blanca",
                    description: err?.message,
                    variant: "destructive"
                });
            }
        });
    };

    useEffect(() => {
        setTitle("Gestión de Flota Móvil, MDM y APK OTA");
    }, [setTitle]);

    const loadData = React.useCallback((silentParam?: boolean | React.MouseEvent) => {
        const isSilent = silentParam === true;
        if (!isSilent) setLoading(true);
        
        Promise.all([
            getMobileFleetData(),
            getSystemUsersList()
        ])
        .then(([fleetRes, usersRes]) => {
            if (fleetRes) {
                setVersionSettings(fleetRes.versionSettings);
                setDevices(fleetRes.devices || []);
                if (fleetRes.versionSettings && !isSilent) {
                    setVersionName(fleetRes.versionSettings.version_name || '1.2.4');
                    setVersionCode(String(fleetRes.versionSettings.version_code || '23'));
                    setApkUrl(fleetRes.versionSettings.apk_url || '/downloads/apk/ClicDriver.apk');
                    setReleaseNotes(fleetRes.versionSettings.release_notes || '');
                    setServerUrlPrimary(fleetRes.versionSettings.server_url_primary || 'http://192.168.1.14:9001');
                    setServerUrlFallback(fleetRes.versionSettings.server_url_fallback || '');
                    setForceUpdate(fleetRes.versionSettings.force_update === 1);
                }
                if (fleetRes.backgroundSyncMinutes && !isSilent) {
                    setBackgroundSyncMinutes(String(fleetRes.backgroundSyncMinutes));
                }
                if (fleetRes.adminPin && !isSilent) {
                    setAdminPin(String(fleetRes.adminPin));
                }
                if (fleetRes.telegramAlertsChatId !== undefined && !isSilent) {
                    setTelegramAlertsChatId(String(fleetRes.telegramAlertsChatId || ''));
                }
                if (fleetRes.smsGatewayItPhones !== undefined && !isSilent) {
                    setSmsGatewayItPhones(String(fleetRes.smsGatewayItPhones || ''));
                }
                if (fleetRes.publicIpApiPrimary && !isSilent) {
                    setPublicIpApiPrimary(String(fleetRes.publicIpApiPrimary));
                }
                if (fleetRes.publicIpApiFallback && !isSilent) {
                    setPublicIpApiFallback(String(fleetRes.publicIpApiFallback));
                }
            }
            if (usersRes) {
                setUsersList(usersRes);
            }
        })
        .catch((err) => {
            toast({
                title: "Error cargando datos de flota",
                description: err?.message || "No se pudieron obtener los dispositivos",
                variant: "destructive"
            });
        })
        .finally(() => {
            if (!isSilent) setLoading(false);
        });
    }, [toast]);

    useEffect(() => {
        if (isAuthorized) {
            loadData();
        }
    }, [isAuthorized, loadData]);

    const handlePublishVersion = (e: React.FormEvent) => {
        e.preventDefault();
        startTransition(async () => {
            try {
                const res = await publishAppVersion({
                    version_name: versionName,
                    version_code: parseInt(versionCode, 10),
                    apk_url: apkUrl,
                    release_notes: releaseNotes,
                    force_update: forceUpdate,
                    server_url_primary: serverUrlPrimary,
                    server_url_fallback: serverUrlFallback,
                    background_sync_minutes: backgroundSyncMinutes,
                    admin_pin: adminPin,
                    telegram_alerts_chat_id: telegramAlertsChatId,
                    sms_gateway_it_phones: smsGatewayItPhones,
                    public_ip_api_primary: publicIpApiPrimary,
                    public_ip_api_fallback: publicIpApiFallback
                });
                if (res?.success) {
                    toast({
                        title: "Configuración y Versión Publicada 🚀",
                        description: `v${versionName} (Build ${versionCode}), URLs, APIs de IP Pública, intervalo de sync (${backgroundSyncMinutes} min), PIN y canal Telegram actualizados para la flota.`
                    });
                    loadData(true);
                } else {
                    toast({
                        title: "Error publicando versión",
                        description: res?.error || "Ocurrió un problema",
                        variant: "destructive"
                    });
                }
            } catch (err: any) {
                toast({
                    title: "Error de servidor",
                    description: err?.message,
                    variant: "destructive"
                });
            }
        });
    };

    const handleToggleGlobalPause = () => {
        startTransition(async () => {
            try {
                const res = await toggleOtaPause({ target: 'global' });
                if (res?.success) {
                    toast({
                        title: res.isPaused ? "Distribución OTA Pausada ⏸️" : "Distribución OTA Reanudada 🟢",
                        description: res.isPaused ? "Ningún equipo descargará actualizaciones hasta reanudar." : "Los equipos pendientes continuarán descargando la versión objetivo."
                    });
                    loadData(true);
                }
            } catch (err: any) {
                toast({
                    title: "Error alternando pausa global",
                    description: err?.message,
                    variant: "destructive"
                });
            }
        });
    };

    const handleToggleDevicePause = (hwid: string) => {
        startTransition(async () => {
            try {
                const res = await toggleOtaPause({ target: 'device', hwid });
                if (res?.success) {
                    toast({
                        title: res.isPaused ? "OTA Pausada en Dispositivo ⏸️" : "OTA Reanudada en Dispositivo 🟢",
                        description: `Configuración actualizada para ${hwid}`
                    });
                    loadData(true);
                }
            } catch (err: any) {
                toast({
                    title: "Error alternando pausa en dispositivo",
                    description: err?.message,
                    variant: "destructive"
                });
            }
        });
    };

    const handleResetFailures = (hwid: string) => {
        startTransition(async () => {
            try {
                const res = await resetDeviceOtaFailures(hwid);
                if (res?.success) {
                    toast({
                        title: "Circuit Breaker Reseteado 🔄",
                        description: `Se borró el historial de 3 errores. El celular ${hwid} reintentará actualizar.`
                    });
                    loadData(true);
                }
            } catch (err: any) {
                toast({
                    title: "Error reseteando contador",
                    description: err?.message,
                    variant: "destructive"
                });
            }
        });
    };

    const handleStartEdit = (device: any) => {
        setEditingHwid(device.hardware_id);
        setEditPhone(device.phone_number || '');
        setEditUserId(device.driver_user_id ? String(device.driver_user_id) : 'unassigned');
        setEditName(device.device_name || '');
    };

    const handleSaveDeviceEdit = (hwid: string) => {
        startTransition(async () => {
            try {
                const res = await saveMobileDeviceAssignment({
                    hardwareId: hwid,
                    deviceName: editName,
                    phoneNumber: editPhone,
                    driverUserId: (editUserId && editUserId !== 'unassigned') ? parseInt(editUserId, 10) : undefined
                });
                if (res?.success) {
                    toast({
                        title: "Asignación Guardada ✅",
                        description: "Datos del celular y chofer actualizados."
                    });
                    setEditingHwid(null);
                    loadData(true);
                }
            } catch (err: any) {
                toast({
                    title: "Error guardando asignación",
                    description: err?.message,
                    variant: "destructive"
                });
            }
        });
    };

    const handleConfirmDelete = () => {
        if (!confirmDelete) return;
        const { hwid, name } = confirmDelete;
        setConfirmDelete(null);

        startTransition(async () => {
            try {
                const res = await deleteMobileDeviceAction(hwid);
                if (res?.success) {
                    toast({
                        title: "Dispositivo Eliminado 🗑️",
                        description: `El dispositivo ${name || hwid} ha sido retirado de la lista.`
                    });
                    loadData(true);
                }
            } catch (err: any) {
                toast({
                    title: "Error al eliminar dispositivo",
                    description: err?.message,
                    variant: "destructive"
                });
            }
        });
    };

    if (authLoading || loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-muted-foreground">
                <RefreshCw className="w-8 h-8 animate-spin text-purple-600" />
                <p className="text-sm font-medium">Cargando inventario de flota móvil y estado OTA...</p>
            </div>
        );
    }

    if (!isAuthorized) {
        return (
            <div className="p-8 text-center text-rose-600 font-bold">
                No posee permisos suficientes para acceder a la gestión de flota móvil (it-tools:access).
            </div>
        );
    }

    const targetCode = versionSettings?.version_code || 0;
    const isGlobalPaused = versionSettings?.global_ota_paused === 1;

    // Metrics calculations
    const totalDevices = devices.length;
    const updatedCount = devices.filter(d => (d.current_version_code || 0) >= targetCode && targetCode > 0).length;
    const pendingCount = totalDevices - updatedCount;
    const failedCount = devices.filter(d => (d.install_failed_count || 0) >= 3).length;

    // Installed apps parse helper
    let modalAppsList: any[] = [];
    if (selectedAppsDevice?.installed_apps_json) {
        try {
            modalAppsList = JSON.parse(selectedAppsDevice.installed_apps_json);
        } catch (_) {}
    }

    return (
        <main className="w-full px-4 md:px-8 py-6 space-y-6">
            {/* Top Navigation & Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 p-6 rounded-2xl text-white shadow-xl">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Link href="/dashboard/it-tools">
                            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 rounded-full h-8 w-8">
                                <ArrowLeft className="w-4 h-4" />
                            </Button>
                        </Link>
                        <Badge variant="outline" className="text-purple-300 border-purple-400/40 text-[10px] uppercase font-bold tracking-wider">
                            Herramientas de TI & MDM
                        </Badge>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-3">
                        <Smartphone className="w-8 h-8 text-purple-400" /> Gestión de Flota Móvil, MDM y APK OTA
                    </h1>
                    <p className="text-xs text-purple-200/80 max-w-2xl">
                        Control centralizado de dispositivos Android Clic Driver (Device Owner). Publicación de versiones silenciosas, telemetría de batería, RAM, almacenamiento, ubicación GPS e inventario de aplicaciones.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 self-start sm:self-center">
                    <Link href="/dashboard/admin/ai-auditor">
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            className="bg-purple-600 hover:bg-purple-700 text-white border-0 gap-2 text-xs font-bold shadow-lg"
                            title="Auditar celulares Android, estados de batería, fallos OTA y telemetría con IA"
                        >
                            <Cpu className="w-3.5 h-3.5" /> Auditar Celulares con IA
                        </Button>
                    </Link>

                    <Button 
                        onClick={loadData} 
                        variant="outline" 
                        size="sm" 
                        className="bg-white/10 text-white border-white/20 hover:bg-white/20 gap-2 text-xs font-bold"
                    >
                        <RefreshCw className="w-3.5 h-3.5" /> Actualizar Datos
                    </Button>

                    <Button 
                        onClick={handleToggleGlobalPause} 
                        disabled={isPending}
                        variant={isGlobalPaused ? "default" : "destructive"} 
                        size="sm" 
                        className="gap-2 text-xs font-bold shadow-md"
                    >
                        {isGlobalPaused ? <PlayCircle className="w-4 h-4 text-emerald-400" /> : <PauseCircle className="w-4 h-4" />}
                        {isGlobalPaused ? "Reanudar OTA Global" : "Pausar OTA Global"}
                    </Button>
                </div>
            </div>

            {/* KPI Overview Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-purple-100 dark:border-purple-900/30 bg-purple-50/50 dark:bg-purple-950/20">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase text-purple-700 dark:text-purple-300">Total Dispositivos 📱</p>
                            <h3 className="text-2xl font-black text-purple-950 dark:text-purple-100 mt-1">{totalDevices}</h3>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Celulares Android Registrados</p>
                        </div>
                        <div className="p-3 bg-purple-600 text-white rounded-xl">
                            <Smartphone className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/50 dark:bg-emerald-950/20">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-300">Actualizados 🟢</p>
                            <h3 className="text-2xl font-black text-emerald-950 dark:text-emerald-100 mt-1">{updatedCount}</h3>
                            <p className="text-[11px] text-muted-foreground mt-0.5">En versión v{versionSettings?.version_name || '1.0.3'}</p>
                        </div>
                        <div className="p-3 bg-emerald-600 text-white rounded-xl">
                            <CheckCircle2 className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-amber-100 dark:border-amber-900/30 bg-amber-50/50 dark:bg-amber-950/20">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase text-amber-700 dark:text-amber-300">Pendientes ⚠️</p>
                            <h3 className="text-2xl font-black text-amber-950 dark:text-amber-100 mt-1">{pendingCount}</h3>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Versión previa instalada</p>
                        </div>
                        <div className="p-3 bg-amber-600 text-white rounded-xl">
                            <AlertTriangle className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-rose-100 dark:border-rose-900/30 bg-rose-50/50 dark:bg-rose-950/20">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase text-rose-700 dark:text-rose-300">Fallos Circuit Breaker 🔴</p>
                            <h3 className="text-2xl font-black text-rose-950 dark:text-rose-100 mt-1">{failedCount}</h3>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Pausados tras 3 errores</p>
                        </div>
                        <div className="p-3 bg-rose-600 text-white rounded-xl">
                            <ShieldAlert className="w-6 h-6" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Target Version Publisher Card */}
            <Card className="shadow-lg border-purple-100 dark:border-purple-900/30">
                <CardHeader className="bg-gradient-to-r from-purple-50 via-indigo-50 to-purple-50 dark:from-purple-950/30 dark:via-indigo-950/30 dark:to-purple-950/30 border-b border-purple-100 dark:border-purple-900/30">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-purple-600 text-white rounded-lg">
                                <UploadCloud className="w-5 h-5" />
                            </div>
                            <div>
                                <CardTitle className="text-lg font-bold text-purple-950 dark:text-purple-100">
                                    Publicar Nueva Versión Oficial de la APK (Over-The-Air)
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Declare la nueva versión oficial. Al guardar, los celulares con Device Owner descargarán silenciosamente el APK de la ruta asignada.
                                </CardDescription>
                            </div>
                        </div>

                        {versionSettings && (
                            <Badge variant={isGlobalPaused ? "destructive" : "secondary"} className="font-mono text-xs px-3 py-1">
                                {isGlobalPaused ? 'PAUSADO GLOBALMENTE ⏸️' : `OFICIAL: v${versionSettings.version_name} (Build ${versionSettings.version_code}) 🟢`}
                            </Badge>
                        )}
                    </div>
                </CardHeader>

                <CardContent className="p-6">
                    <form onSubmit={handlePublishVersion} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="space-y-1">
                                <Label htmlFor="versionName" className="text-xs font-bold uppercase text-muted-foreground">Versión Name *</Label>
                                <Input 
                                    id="versionName" 
                                    placeholder="Ej: 1.0.3" 
                                    value={versionName} 
                                    onChange={(e) => setVersionName(e.target.value)} 
                                    className="h-9 text-xs font-mono font-bold"
                                    required
                                />
                            </div>

                            <div className="space-y-1">
                                <Label htmlFor="versionCode" className="text-xs font-bold uppercase text-muted-foreground">Version Code *</Label>
                                <Input 
                                    id="versionCode" 
                                    type="number"
                                    min="1"
                                    placeholder="Ej: 2" 
                                    value={versionCode} 
                                    onChange={(e) => setVersionCode(e.target.value)} 
                                    className="h-9 text-xs font-mono font-bold"
                                    required
                                />
                            </div>

                            <div className="md:col-span-2 space-y-1">
                                <Label htmlFor="apkUrl" className="text-xs font-bold uppercase text-muted-foreground">Ruta / URL del APK *</Label>
                                <Input 
                                    id="apkUrl" 
                                    placeholder="/downloads/apk/ClicDriver_v1.0.3.apk" 
                                    value={apkUrl} 
                                    onChange={(e) => setApkUrl(e.target.value)} 
                                    className="h-9 text-xs font-mono"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-3 bg-purple-50/50 dark:bg-purple-950/20 rounded-xl border border-purple-100 dark:border-purple-900/30">
                            <div className="space-y-1">
                                <Label htmlFor="serverUrlPrimary" className="text-xs font-bold uppercase text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
                                    🌐 URL Primaria (LAN/WAN) *
                                </Label>
                                <Input 
                                    id="serverUrlPrimary" 
                                    placeholder="http://192.168.1.14:9001 o https://midominio.com" 
                                    value={serverUrlPrimary} 
                                    onChange={(e) => setServerUrlPrimary(e.target.value)} 
                                    className="h-9 text-xs font-mono font-semibold bg-white dark:bg-zinc-900"
                                    required
                                />
                                <p className="text-[10px] text-muted-foreground">Dirección principal que la flota intentará conectar primero.</p>
                            </div>

                            <div className="space-y-1">
                                <Label htmlFor="serverUrlFallback" className="text-xs font-bold uppercase text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                                    🛡️ URL Fallback (Opcional)
                                </Label>
                                <Input 
                                    id="serverUrlFallback" 
                                    placeholder="http://192.168.1.50:9001" 
                                    value={serverUrlFallback} 
                                    onChange={(e) => setServerUrlFallback(e.target.value)} 
                                    className="h-9 text-xs font-mono font-semibold bg-white dark:bg-zinc-900"
                                />
                                <p className="text-[10px] text-muted-foreground">Si la primaria no responde en 5s, conmutan aquí.</p>
                            </div>

                            <div className="space-y-1">
                                <Label htmlFor="backgroundSyncMinutes" className="text-xs font-bold uppercase text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                                    ⏱️ Sync Fondo (Min) *
                                </Label>
                                <div className="flex items-center gap-2">
                                    <Input 
                                        id="backgroundSyncMinutes" 
                                        type="number"
                                        min="5"
                                        max="120"
                                        placeholder="5" 
                                        value={backgroundSyncMinutes} 
                                        onChange={(e) => setBackgroundSyncMinutes(e.target.value)} 
                                        className="h-9 text-xs font-mono font-bold text-center bg-white dark:bg-zinc-900"
                                        required
                                    />
                                    <span className="text-xs font-bold text-muted-foreground">min</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground">Frecuencia en segundo plano (Mín: 5 min).</p>
                            </div>

                            <div className="space-y-1">
                                <Label htmlFor="adminPin" className="text-xs font-bold uppercase text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                                    🔒 PIN Admin APK *
                                </Label>
                                <Input 
                                    id="adminPin" 
                                    placeholder="0000" 
                                    maxLength={8}
                                    value={adminPin} 
                                    onChange={(e) => setAdminPin(e.target.value)} 
                                    className="h-9 text-xs font-mono font-bold tracking-widest text-center bg-white dark:bg-zinc-900"
                                    required
                                />
                                <p className="text-[10px] text-muted-foreground">Protege menú de configuración e IP en celulares.</p>
                            </div>
                        </div>

                        {/* Emergency IT Alert Channels (Telegram + SMS Directo) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Telegram MDM & Shutdown Alert Channel */}
                            <div className="p-3 bg-sky-50/60 dark:bg-sky-950/20 rounded-xl border border-sky-200/70 dark:border-sky-900/40 space-y-1">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <Label htmlFor="telegramAlertsChatId" className="text-xs font-bold uppercase text-sky-950 dark:text-sky-300 flex items-center gap-1.5">
                                        ✈️ Chat / Group ID de Telegram para Alertas MDM & Contingencia
                                    </Label>
                                </div>
                                <Input 
                                    id="telegramAlertsChatId" 
                                    placeholder="Ej: -1002345678901 o 123456789 (Opcional)" 
                                    value={telegramAlertsChatId} 
                                    onChange={(e) => setTelegramAlertsChatId(e.target.value)} 
                                    className="h-9 text-xs font-mono bg-white dark:bg-zinc-900"
                                />
                                <p className="text-[10px] text-muted-foreground">
                                    Notifica en menos de 1s apagados o pérdida total de conexión (Failover SOS anti-spam 30 min).
                                </p>
                            </div>

                            {/* SMS Emergency IT Alert Phones */}
                            <div className="p-3 bg-amber-50/60 dark:bg-amber-950/20 rounded-xl border border-amber-200/70 dark:border-amber-900/40 space-y-1">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <Label htmlFor="smsGatewayItPhones" className="text-xs font-bold uppercase text-amber-950 dark:text-amber-300 flex items-center gap-1.5">
                                        📱 Teléfonos Departamento de TI (Alertas Críticas SMS)
                                    </Label>
                                </div>
                                <Input 
                                    id="smsGatewayItPhones" 
                                    placeholder="Ej: +50688888888, +50677777777 (Separados por coma)" 
                                    value={smsGatewayItPhones} 
                                    onChange={(e) => setSmsGatewayItPhones(e.target.value)} 
                                    className="h-9 text-xs font-mono bg-white dark:bg-zinc-900"
                                />
                                <p className="text-[10px] text-muted-foreground">
                                    El celular del chofer enviará SMS directos desde su SIM a estos números ante fallas de servidor o errores críticos.
                                </p>
                            </div>
                        </div>

                        {/* Public IP Lookup APIs Configuration */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-slate-50/60 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-800">
                            <div className="space-y-1">
                                <Label htmlFor="publicIpApiPrimary" className="text-xs font-bold uppercase text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                    🌐 API IP Pública Primaria *
                                </Label>
                                <Input 
                                    id="publicIpApiPrimary" 
                                    placeholder="https://api.ipify.org" 
                                    value={publicIpApiPrimary} 
                                    onChange={(e) => setPublicIpApiPrimary(e.target.value)} 
                                    className="h-9 text-xs font-mono font-medium bg-white dark:bg-zinc-900"
                                    required
                                />
                                <p className="text-[10px] text-muted-foreground">Servicio principal para detectar la IP 4G/5G del chofer.</p>
                            </div>

                            <div className="space-y-1">
                                <Label htmlFor="publicIpApiFallback" className="text-xs font-bold uppercase text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                    🛡️ API IP Pública Fallback *
                                </Label>
                                <Input 
                                    id="publicIpApiFallback" 
                                    placeholder="https://icanhazip.com" 
                                    value={publicIpApiFallback} 
                                    onChange={(e) => setPublicIpApiFallback(e.target.value)} 
                                    className="h-9 text-xs font-mono font-medium bg-white dark:bg-zinc-900"
                                    required
                                />
                                <p className="text-[10px] text-muted-foreground">Respaldo si el primer servicio de IP no responde.</p>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <Label htmlFor="releaseNotes" className="text-xs font-bold uppercase text-muted-foreground">Notas del Release / Cambios</Label>
                            <Textarea 
                                id="releaseNotes" 
                                placeholder="Describa los cambios de esta versión..." 
                                value={releaseNotes} 
                                onChange={(e) => setReleaseNotes(e.target.value)} 
                                className="min-h-[60px] text-xs"
                            />
                        </div>

                        <div className="flex items-center justify-between pt-2">
                            <div className="flex items-center space-x-2">
                                <Checkbox 
                                    id="forceUpdate" 
                                    checked={forceUpdate} 
                                    onCheckedChange={(c) => setForceUpdate(!!c)} 
                                />
                                <Label htmlFor="forceUpdate" className="text-xs font-medium cursor-pointer">
                                    Forzar actualización prioritaria al abrir
                                </Label>
                            </div>

                            <Button type="submit" disabled={isPending} className="bg-purple-600 hover:bg-purple-700 text-white font-bold gap-2 text-xs h-9">
                                {isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                                Publicar Versión OTA
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            {/* Mobile Fleet Inventory Table */}
            <Card className="shadow-lg border-purple-100 dark:border-purple-900/30">
                <CardHeader className="bg-purple-50/50 dark:bg-purple-950/20 border-b border-purple-100 dark:border-purple-900/30">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <CardTitle className="text-lg font-bold text-purple-950 dark:text-purple-100 flex items-center gap-2">
                                <Smartphone className="w-5 h-5 text-purple-600" /> Inventario de Celulares & Telemetría MDM ({processedDevices.length}{fleetSearchQuery ? ` de ${devices.length}` : ''})
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Administre la asignación de choferes, líneas telefónicas, localización GPS en Google Maps, auditoría de apps y estado OTA.
                            </CardDescription>
                        </div>

                        {/* Search & Sort Controls */}
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="relative">
                                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input 
                                    placeholder="Buscar celular, chofer, modelo..."
                                    value={fleetSearchQuery}
                                    onChange={(e) => setFleetSearchQuery(e.target.value)}
                                    className="h-8 text-xs pl-8 pr-7 w-48 sm:w-56 bg-white dark:bg-zinc-900 border-purple-200 dark:border-purple-900/40"
                                />
                                {fleetSearchQuery && (
                                    <button 
                                        type="button"
                                        onClick={() => setFleetSearchQuery('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>

                            <Select value={fleetSortBy} onValueChange={(val: any) => setFleetSortBy(val)}>
                                <SelectTrigger className="h-8 text-xs font-semibold w-40 bg-white dark:bg-zinc-900 border-purple-200 dark:border-purple-900/40">
                                    <SelectValue placeholder="Ordenar por..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="name" className="text-xs">🔤 Nombre (A - Z)</SelectItem>
                                    <SelectItem value="driver" className="text-xs">👤 Chofer Asignado</SelectItem>
                                    <SelectItem value="last_seen" className="text-xs">⏱️ Última Conexión</SelectItem>
                                    <SelectItem value="battery" className="text-xs">🔋 Nivel de Batería</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="p-0">
                    {devices.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground text-sm">
                            No hay celulares registrados aún. Al abrir la APK Clic Driver en los dispositivos, se aprovisionarán automáticamente aquí.
                        </div>
                    ) : processedDevices.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground text-sm space-y-2">
                            <p>No se encontraron celulares con el término &quot;{fleetSearchQuery}&quot;.</p>
                            <Button size="sm" variant="outline" onClick={() => setFleetSearchQuery('')} className="text-xs h-7">
                                Limpiar Búsqueda
                            </Button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[1050px] text-xs text-left">
                                <thead className="bg-purple-100/60 dark:bg-purple-950/40 text-purple-950 dark:text-purple-200 uppercase text-[10px]">
                                    <tr>
                                        <th className="p-3 whitespace-nowrap">Dispositivo / HWID</th>
                                        <th className="p-3 whitespace-nowrap">Chofer</th>
                                        <th className="p-3 whitespace-nowrap">Línea SIM</th>
                                        <th className="p-3 whitespace-nowrap">Impresora</th>
                                        <th className="p-3 whitespace-nowrap">Versión & Conexión</th>
                                        <th className="p-3 whitespace-nowrap text-center">GPS</th>
                                        <th className="p-3 whitespace-nowrap">Batería & Red</th>
                                        <th className="p-3 text-right whitespace-nowrap">Acciones TI</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                                    {processedDevices.map((dev: any, devIndex: number) => {
                                        const isEditing = editingHwid === dev.hardware_id;
                                        const devCode = dev.current_version_code || 0;
                                        const isUpToDate = devCode >= targetCode && targetCode > 0;
                                        const isFailed = dev.install_failed_count >= 3;
                                        const isDevicePaused = dev.ota_paused === 1;
                                        const isLastWorked = lastWorkedHwid === dev.hardware_id;

                                        // Calculate online status (< 15 mins)
                                        const lastSeenDate = new Date(dev.last_seen);
                                        const diffMins = Math.floor((new Date().getTime() - lastSeenDate.getTime()) / (1000 * 60));
                                        const isOnline = diffMins < 15;

                                        const hasCurrentGps = dev.current_lat && dev.current_lng;
                                        const hasShutdownGps = dev.shutdown_lat && dev.shutdown_lng;

                                        let installedCount = 0;
                                        if (dev.installed_apps_json) {
                                            try {
                                                installedCount = JSON.parse(dev.installed_apps_json).length;
                                            } catch (_) {}
                                        }

                                        return (
                                            <tr 
                                                key={dev.hardware_id} 
                                                className={`transition-colors ${
                                                    isLastWorked 
                                                        ? 'bg-purple-500/10 dark:bg-purple-950/40 border-l-4 border-purple-600' 
                                                        : 'hover:bg-muted/10'
                                                }`}
                                            >
                                                <td className="p-3">
                                                    {isEditing ? (
                                                        <Input 
                                                            value={editName} 
                                                            onChange={(e) => setEditName(e.target.value)} 
                                                            className="h-8 text-xs font-bold"
                                                        />
                                                    ) : (
                                                        <div className="space-y-1">
                                                            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 flex-wrap">
                                                                <span className="text-[11px] text-muted-foreground font-mono font-normal">#{devIndex + 1}</span>
                                                                <span>{dev.device_name || 'Celular Android'}</span>
                                                                {dev.is_device_owner === 1 && (
                                                                    <Badge className="bg-purple-600 text-white text-[10px] px-2 py-0.5 font-semibold whitespace-nowrap shrink-0">
                                                                        Device Owner
                                                                    </Badge>
                                                                )}
                                                                {isLastWorked && (
                                                                    <Badge variant="outline" className="bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 border-purple-300 text-[9px] px-1.5 py-0 font-bold animate-pulse">
                                                                        ⚡ Activo
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                                                        {dev.hardware_id}
                                                    </div>
                                                    {(dev.serial_number || dev.imei) && (
                                                        <div className="flex items-center gap-1.5 flex-wrap text-[9px] mt-0.5 font-mono">
                                                            {dev.serial_number && (
                                                                <span className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-1 py-0.5 rounded font-semibold">
                                                                    S/N: {dev.serial_number}
                                                                </span>
                                                            )}
                                                            {dev.imei && (
                                                                <span className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 px-1 py-0.5 rounded font-semibold">
                                                                    IMEI: {dev.imei}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>

                                                <td className="p-3">
                                                    {isEditing ? (
                                                        <Select value={editUserId} onValueChange={setEditUserId}>
                                                            <SelectTrigger className="h-8 text-xs bg-white dark:bg-zinc-950">
                                                                <SelectValue placeholder="Seleccionar chofer..." />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="unassigned">Sin asignación</SelectItem>
                                                                {usersList.map(u => (
                                                                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    ) : (
                                                        <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                                                            <UserCheck className="w-3.5 h-3.5 text-purple-600" />
                                                            {dev.driver_user_name || dev.last_driver_name || 'Sin asignar'}
                                                        </div>
                                                    )}
                                                </td>

                                                <td className="p-3">
                                                    {isEditing ? (
                                                        <Input 
                                                            placeholder="Ej: 88887777"
                                                            value={editPhone} 
                                                            onChange={(e) => setEditPhone(e.target.value)} 
                                                            className="h-8 text-xs font-mono"
                                                        />
                                                    ) : (
                                                        <div className="font-mono font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1">
                                                            <Phone className="w-3 h-3 text-emerald-600" />
                                                            {dev.phone_number || dev.driver_phone || 'N/D'}
                                                        </div>
                                                    )}
                                                </td>

                                                <td className="p-3 whitespace-nowrap">
                                                    <div className="font-mono text-[10px] text-slate-600 dark:text-slate-300">
                                                        {dev.printer_mac || 'Sin impresora'}
                                                    </div>
                                                </td>

                                                {/* Columna Fusionada: Versión Instalada, Estado OTA & Última Conexión */}
                                                <td className="p-3 whitespace-nowrap space-y-1">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                                            v{dev.current_app_version || '1.0.0'}
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground font-mono">
                                                            (b{dev.current_version_code || 1})
                                                        </span>

                                                        {isFailed ? (
                                                            <Badge variant="destructive" className="gap-1 font-bold text-[9px] py-0 px-1.5">
                                                                <ShieldAlert className="w-2.5 h-2.5" /> FALLÓ
                                                            </Badge>
                                                        ) : isDevicePaused ? (
                                                            <Badge variant="outline" className="gap-1 font-bold text-[9px] py-0 px-1.5 border-amber-300 bg-amber-50 text-amber-800">
                                                                <PauseCircle className="w-2.5 h-2.5" /> PAUSADO
                                                            </Badge>
                                                        ) : isUpToDate ? (
                                                            <Badge variant="secondary" className="gap-1 font-bold text-[9px] py-0 px-1.5 bg-emerald-100 text-emerald-800 border-0 dark:bg-emerald-950/40 dark:text-emerald-300">
                                                                <CheckCircle2 className="w-2.5 h-2.5" /> ACTUALIZADO
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="gap-1 font-bold text-[9px] py-0 px-1.5 border-indigo-300 bg-indigo-50 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300">
                                                                <AlertTriangle className="w-2.5 h-2.5" /> PENDIENTE v{versionSettings?.version_name}
                                                            </Badge>
                                                        )}
                                                    </div>

                                                    {dev.last_install_error && (
                                                        <p className="text-[9px] text-rose-600 truncate max-w-[170px]" title={dev.last_install_error}>
                                                            Error: {dev.last_install_error}
                                                        </p>
                                                    )}

                                                    <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                                                        <Clock className="w-3 h-3 text-slate-400" />
                                                        {dev.last_seen ? new Date(dev.last_seen).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/D'}
                                                    </div>
                                                </td>

                                                {/* Localizacion GPS Compacta */}
                                                <td className="p-3 whitespace-nowrap text-center">
                                                    {hasCurrentGps ? (
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm"
                                                            onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${dev.current_lat},${dev.current_lng}`, '_blank')}
                                                            className="h-7 text-[10px] font-bold text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100 gap-1 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800"
                                                            title="Ver Ubicación GPS en Google Maps"
                                                        >
                                                            <MapPin className="w-3 h-3 text-blue-600" /> GPS
                                                        </Button>
                                                    ) : hasShutdownGps ? (
                                                        <Button 
                                                            variant="outline" 
                                                            size="sm"
                                                            onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${dev.shutdown_lat},${dev.shutdown_lng}`, '_blank')}
                                                            className="h-7 text-[10px] font-bold text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100 gap-1 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800"
                                                            title={`Último reporte antes de apagarse: ${dev.shutdown_at ? new Date(dev.shutdown_at).toLocaleTimeString() : ''}`}
                                                        >
                                                            <MapPin className="w-3 h-3 text-rose-600" /> GPS (Apagado)
                                                        </Button>
                                                    ) : (
                                                        <span className="text-[10px] text-muted-foreground italic">Sin GPS</span>
                                                    )}

                                                    {dev.shutdown_at && (
                                                        <div className="text-[9px] text-rose-600 font-semibold mt-0.5">
                                                            🚨 {new Date(dev.shutdown_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            {dev.shutdown_battery !== undefined && dev.shutdown_battery !== null && (
                                                                <span className={`block font-mono ${dev.shutdown_battery > 15 ? 'text-rose-700 font-bold' : 'text-amber-700'}`}>
                                                                    {dev.shutdown_battery > 15 ? `⚠️ Apagado con ${dev.shutdown_battery}%` : `🔋 Agotado (${dev.shutdown_battery}%)`}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>

                                                <td className="p-3 whitespace-nowrap">
                                                    <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-bold">
                                                        <Battery className={`w-3.5 h-3.5 ${(dev.battery_level ?? 100) < 20 ? 'text-rose-600' : 'text-emerald-600'}`} />
                                                        <span>{dev.battery_level ?? 100}%</span>
                                                        {dev.is_charging === 1 && (
                                                            <span className="text-[11px] text-amber-500 font-black animate-pulse ml-0.5" title="Dispositivo Conectado al Cargador">⚡</span>
                                                        )}
                                                        {dev.battery_temp_c != null && (
                                                            <span className={`text-[10px] font-mono px-1 py-0.2 rounded font-semibold ml-1 ${dev.battery_temp_c > 42 ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50' : 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-300'}`} title="Temperatura de Batería">
                                                                🌡️ {dev.battery_temp_c}°C
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                                        <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-ping' : 'bg-slate-300'}`} />
                                                        <span>{isOnline ? 'En línea' : `Hace ${diffMins} min`}</span>
                                                        {dev.network_type && (
                                                            <span className="text-[9px] font-mono font-semibold text-purple-700 dark:text-purple-300 ml-1">
                                                                • {dev.network_type}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>

                                                <td className="p-3 text-right whitespace-nowrap">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Button 
                                                            size="sm" 
                                                            variant="outline" 
                                                            onClick={() => {
                                                                setSelectedHardwareDevice(dev);
                                                                setLastWorkedHwid(dev.hardware_id);
                                                            }}
                                                            className="h-7 text-[10px] font-bold text-cyan-700 bg-cyan-50 border-cyan-200 hover:bg-cyan-100 gap-1 dark:bg-cyan-950/30 dark:text-cyan-300 dark:border-cyan-800"
                                                            title="Ver Telemetría Extendida de Hardware, SIM, Batería, RAM y Almacenamiento"
                                                        >
                                                            <Activity className="w-3 h-3 text-cyan-600 dark:text-cyan-400" /> Hardware
                                                        </Button>

                                                        <Button 
                                                            size="sm" 
                                                            variant="outline" 
                                                            onClick={() => handleOpenMdmModal(dev)}
                                                            className="h-7 text-[10px] font-bold text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100 gap-1"
                                                        >
                                                            <ShieldAlert className="w-3 h-3" /> Blindaje
                                                        </Button>
                                                        
                                                        <Button 
                                                            size="sm" 
                                                            variant="outline" 
                                                            onClick={() => {
                                                                setSelectedOtpDevice(dev);
                                                                setOtpChallengeInput('');
                                                            }}
                                                            className="h-7 text-[10px] font-bold text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100 gap-1 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800"
                                                            title="Generador de Token OTP / PIN de Emergencia (Sin Internet)"
                                                        >
                                                            <Lock className="w-3 h-3 text-emerald-600" /> Token OTP
                                                        </Button>

                                                        {installedCount > 0 && (
                                                            <Button 
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleOpenAppsModal(dev)}
                                                                className="h-7 text-[10px] font-bold text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-100 gap-1"
                                                            >
                                                                <AppWindow className="w-3 h-3" /> Apps ({installedCount})
                                                            </Button>
                                                        )}

                                                        {isEditing ? (
                                                            <>
                                                                <Button 
                                                                    size="icon" 
                                                                    variant="ghost" 
                                                                    type="button" 
                                                                    onClick={() => handleSaveDeviceEdit(dev.hardware_id)}
                                                                    className="h-7 w-7 text-emerald-600 hover:bg-emerald-50"
                                                                    title="Guardar"
                                                                >
                                                                    <Check className="w-3.5 h-3.5" />
                                                                </Button>
                                                                <Button 
                                                                    size="icon" 
                                                                    variant="ghost" 
                                                                    type="button" 
                                                                    onClick={() => setEditingHwid(null)}
                                                                    className="h-7 w-7 text-slate-400 hover:bg-slate-100"
                                                                    title="Cancelar"
                                                                >
                                                                    <X className="w-3.5 h-3.5" />
                                                                </Button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Button 
                                                                    size="icon" 
                                                                    variant="ghost" 
                                                                    type="button" 
                                                                    onClick={() => handleStartEdit(dev)}
                                                                    className="h-7 w-7 text-purple-700 hover:bg-purple-50"
                                                                    title="Editar Dispositivo"
                                                                >
                                                                    <Edit2 className="w-3.5 h-3.5" />
                                                                </Button>

                                                                <Button 
                                                                    size="icon" 
                                                                    variant="ghost" 
                                                                    type="button" 
                                                                    onClick={() => handleToggleDevicePause(dev.hardware_id)}
                                                                    className="h-7 w-7 text-amber-700 hover:bg-amber-50"
                                                                    title={isDevicePaused ? "Reanudar OTA" : "Pausar OTA"}
                                                                >
                                                                    {isDevicePaused ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
                                                                </Button>

                                                                 {dev.is_device_owner === 1 && (
                                                                    <Button 
                                                                        size="icon" 
                                                                        variant="ghost" 
                                                                        type="button" 
                                                                        onClick={() => setConfirmReboot({ hwid: dev.hardware_id, deviceName: dev.device_name || dev.hardware_id })}
                                                                        className="h-7 w-7 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                                                                        title="Reiniciar Teléfono Remotamente"
                                                                    >
                                                                        <RotateCcw className="w-3.5 h-3.5" />
                                                                    </Button>
                                                                )}

                                                                <Button 
                                                                    size="icon" 
                                                                    variant="ghost" 
                                                                    type="button" 
                                                                    onClick={() => setConfirmDelete({ hwid: dev.hardware_id, name: dev.device_name || dev.hardware_id })}
                                                                    className="h-7 w-7 text-rose-600 hover:bg-rose-50"
                                                                    title="Eliminar Dispositivo de la Lista"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </Button>

                                                                {isFailed && (
                                                                    <Button 
                                                                        size="icon" 
                                                                        variant="ghost" 
                                                                        type="button" 
                                                                        onClick={() => handleResetFailures(dev.hardware_id)}
                                                                        className="h-7 w-7 text-rose-600 hover:bg-rose-50"
                                                                        title="Resetear Contador de Fallos"
                                                                    >
                                                                        <RotateCcw className="w-3.5 h-3.5" />
                                                                    </Button>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* MDM Hardening Dialog */}
            <Dialog open={!!selectedMdmDevice} onOpenChange={() => setSelectedMdmDevice(null)}>
                <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
                    {(() => {
                        const currentHwid = selectedMdmDevice?.hardware_id;
                        const currentIndex = processedDevices.findIndex((d: any) => d.hardware_id === currentHwid);
                        const total = processedDevices.length;
                        const prevDev = currentIndex > 0 ? processedDevices[currentIndex - 1] : null;
                        const nextDev = currentIndex >= 0 && currentIndex < total - 1 ? processedDevices[currentIndex + 1] : null;

                        return (
                            <>
                                <DialogHeader>
                                    <div className="flex items-center justify-between gap-2 border-b pb-2">
                                        <DialogTitle className="flex items-center gap-2 text-base font-bold text-amber-800 dark:text-amber-400">
                                            <ShieldAlert className="w-5 h-5 text-amber-600" /> Blindaje & Restricciones MDM
                                        </DialogTitle>
                                        <div className="flex items-center gap-1">
                                            <span className="text-[11px] font-bold text-muted-foreground mr-1">
                                                {currentIndex >= 0 ? `${currentIndex + 1} de ${total}` : ''}
                                            </span>
                                            <Button
                                                size="icon"
                                                variant="outline"
                                                disabled={!prevDev}
                                                onClick={() => prevDev && handleOpenMdmModal(prevDev)}
                                                className="h-7 w-7"
                                                title={prevDev ? `Anterior: ${prevDev.device_name || prevDev.hardware_id}` : 'No hay anterior'}
                                            >
                                                <ArrowLeft className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button
                                                size="icon"
                                                variant="outline"
                                                disabled={!nextDev}
                                                onClick={() => nextDev && handleOpenMdmModal(nextDev)}
                                                className="h-7 w-7"
                                                title={nextDev ? `Siguiente: ${nextDev.device_name || nextDev.hardware_id}` : 'No hay siguiente'}
                                            >
                                                <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                                            </Button>
                                        </div>
                                    </div>
                                    <DialogDescription className="text-xs pt-1">
                                        Dispositivo: <span className="font-bold text-slate-800 dark:text-slate-200">{selectedMdmDevice?.device_name}</span> ({selectedMdmDevice?.hardware_id})
                                    </DialogDescription>
                                </DialogHeader>

                                <div className="flex-1 overflow-y-auto space-y-3 pr-1 my-2 text-xs">
                                    {selectedMdmDevice?.is_device_owner !== 1 && (
                                        <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 space-y-1">
                                            <div className="font-bold flex items-center gap-1.5 text-xs">
                                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                                Requiere Aprovisionamiento Device Owner
                                            </div>
                                            <p className="text-[11px] leading-relaxed">
                                                Este celular está registrado pero aún no tiene privilegios de Administrador de Dispositivo (Device Owner). Para activar las restricciones del sistema operativo, aprovisiónelo vía QR o ADB.
                                            </p>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        {/* Modo Kiosco Nativo (LockTask) */}
                                        <div className="flex items-center justify-between p-3 rounded-lg border-2 border-purple-500/30 bg-purple-50/50 dark:bg-purple-950/20 shadow-sm">
                                            <div className="space-y-0.5 pr-2">
                                                <Label className="text-xs font-bold flex items-center gap-1.5 text-purple-900 dark:text-purple-300">
                                                    🔒 Modo Kiosco Nativo (LockTask)
                                                </Label>
                                                <span className="text-[11px] text-purple-700/80 dark:text-purple-300/70 block">
                                                    Bloquea el celular en pantalla completa con Clic Driver. Impide salir al escritorio o cambiar de app (Desactive para mantenimientos).
                                                </span>
                                            </div>
                                            <Switch checked={mdmKioskEnabled} onCheckedChange={setMdmKioskEnabled} />
                                        </div>

                                        {/* Forzar GPS Siempre Encendido */}
                                        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                                            <div className="space-y-0.5">
                                                <Label className="text-xs font-bold flex items-center gap-1.5">
                                                    📍 Forzar GPS & Ubicación Siempre Encendidos
                                                </Label>
                                                <span className="text-[11px] text-muted-foreground block">
                                                    Impide que el chofer apague el GPS o el modo de alta precisión desde la barra de notificaciones.
                                                </span>
                                            </div>
                                            <Switch checked={mdmForceGps} onCheckedChange={setMdmForceGps} />
                                        </div>

                                        {/* Prohibir Modo Avión */}
                                        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                                            <div className="space-y-0.5">
                                                <Label className="text-xs font-bold flex items-center gap-1.5">
                                                    ✈️ Bloqueo de Modo Avión
                                                </Label>
                                                <span className="text-[11px] text-muted-foreground block">
                                                    Evita que el chofer active el modo avión para evadir la telemetría en tiempo real.
                                                </span>
                                            </div>
                                            <Switch checked={mdmDisallowAirplaneMode} onCheckedChange={setMdmDisallowAirplaneMode} />
                                        </div>

                                        {/* Prohibir Apagar Datos Móviles */}
                                        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                                            <div className="space-y-0.5">
                                                <Label className="text-xs font-bold flex items-center gap-1.5">
                                                    📶 Bloqueo de Apagar Datos Móviles
                                                </Label>
                                                <span className="text-[11px] text-muted-foreground block">
                                                    Impide desconectar la red celular o los datos móviles de la empresa.
                                                </span>
                                            </div>
                                            <Switch checked={mdmDisallowMobileDataOff} onCheckedChange={setMdmDisallowMobileDataOff} />
                                        </div>

                                        {/* Prohibir Modo Ahorro Batería */}
                                        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                                            <div className="space-y-0.5">
                                                <Label className="text-xs font-bold flex items-center gap-1.5">
                                                    🔋 Bloqueo de Modo Ahorro de Batería
                                                </Label>
                                                <span className="text-[11px] text-muted-foreground block">
                                                    Evita que Android ponga las antenas en suspensión profunda (Doze Mode).
                                                </span>
                                            </div>
                                            <Switch checked={mdmDisallowBatterySaver} onCheckedChange={setMdmDisallowBatterySaver} />
                                        </div>

                                        {/* Bloquear Desinstalación ClicDriver */}
                                        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                                            <div className="space-y-0.5">
                                                <Label className="text-xs font-bold flex items-center gap-1.5">
                                                    🛡️ Anti-Desinstalación de ClicDriver
                                                </Label>
                                                <span className="text-[11px] text-muted-foreground block">
                                                    Hace imposible desinstalar la app administradora desde Android.
                                                </span>
                                            </div>
                                            <Switch checked={mdmBlockUninstall} onCheckedChange={setMdmBlockUninstall} />
                                        </div>

                                        {/* Bloquear Ajustes de Android */}
                                        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                                            <div className="space-y-0.5">
                                                <Label className="text-xs font-bold flex items-center gap-1.5">
                                                    🔒 Bloqueo de Ajustes del Sistema
                                                </Label>
                                                <span className="text-[11px] text-muted-foreground block">
                                                    Impide que el usuario acceda a la app de Configuración de Android.
                                                </span>
                                            </div>
                                            <Switch checked={mdmDisallowSettings} onCheckedChange={setMdmDisallowSettings} />
                                        </div>

                                        {/* Bloquear Tethering / Hotspot */}
                                        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                                            <div className="space-y-0.5">
                                                <Label className="text-xs font-bold flex items-center gap-1.5">
                                                    🚫 Bloqueo de Compartir Internet (Zona Wi-Fi)
                                                </Label>
                                                <span className="text-[11px] text-muted-foreground block">
                                                    Impide crear puntos de acceso Wi-Fi para compartir datos con otros equipos.
                                                </span>
                                            </div>
                                            <Switch checked={mdmDisallowTethering} onCheckedChange={setMdmDisallowTethering} />
                                        </div>

                                        {/* Bloquear Instalaciones APK Locales */}
                                        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                                            <div className="space-y-0.5">
                                                <Label className="text-xs font-bold flex items-center gap-1.5">
                                                    🚫 Bloqueo de Instalaciones APK Locales
                                                </Label>
                                                <span className="text-[11px] text-muted-foreground block">
                                                    Impide la instalación manual de archivos APK desde almacenamiento local o fuentes desconocidas.
                                                </span>
                                            </div>
                                            <Switch checked={mdmDisallowInstallApps} onCheckedChange={setMdmDisallowInstallApps} />
                                        </div>

                                        {/* Bloquear Nuevas Apps en Google Play Store */}
                                        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
                                            <div className="space-y-0.5">
                                                <Label className="text-xs font-bold flex items-center gap-1.5">
                                                    🚫 Bloqueo de Nuevas Apps en Play Store
                                                </Label>
                                                <span className="text-[11px] text-muted-foreground block">
                                                    Impide descargar nuevos juegos o apps desde Google Play Store. Las apps ya instaladas podrán seguir actualizándose.
                                                </span>
                                            </div>
                                            <Switch checked={mdmDisallowPlayStoreInstall} onCheckedChange={setMdmDisallowPlayStoreInstall} />
                                        </div>

                                        {/* Forzar WireGuard VPN Siempre Activa (Always-On VPN) */}
                                        <div className="flex items-center justify-between p-3 rounded-lg border bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800/60">
                                            <div className="space-y-0.5">
                                                <Label className="text-xs font-bold flex items-center gap-1.5 text-indigo-900 dark:text-indigo-300">
                                                    🛡️ VPN WireGuard Siempre Activa (Always-On)
                                                </Label>
                                                <span className="text-[11px] text-indigo-700/80 dark:text-indigo-300/70 block">
                                                    Obliga al sistema operativo a mantener activo y relanzar el servicio de WireGuard (<code>com.wireguard.android</code>) en segundo plano de forma continua y sin aislar la red base del dispositivo.
                                                </span>
                                            </div>
                                            <Switch checked={mdmAlwaysOnVpn} onCheckedChange={setMdmAlwaysOnVpn} />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t flex-wrap gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setSelectedMdmDevice(null)}>
                                        Cancelar
                                    </Button>

                                    <div className="flex items-center gap-2">
                                        <Button 
                                            size="sm" 
                                            onClick={() => handleSaveMdmPolicy(false)}
                                            disabled={isPending}
                                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
                                        >
                                            Guardar
                                        </Button>

                                        {nextDev && (
                                            <Button 
                                                size="sm" 
                                                onClick={() => handleSaveMdmPolicy(true)}
                                                disabled={isPending}
                                                className="bg-purple-600 hover:bg-purple-700 text-white font-bold gap-1"
                                            >
                                                Guardar y Siguiente ➔
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </>
                        );
                    })()}
                </DialogContent>
            </Dialog>

            {/* Installed Apps & Whitelist Manager Modal */}
            <Dialog open={!!selectedAppsDevice} onOpenChange={() => setSelectedAppsDevice(null)}>
                <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
                    {(() => {
                        const currentHwid = selectedAppsDevice?.hardware_id;
                        const currentIndex = processedDevices.findIndex((d: any) => d.hardware_id === currentHwid);
                        const total = processedDevices.length;
                        const prevDev = currentIndex > 0 ? processedDevices[currentIndex - 1] : null;
                        const nextDev = currentIndex >= 0 && currentIndex < total - 1 ? processedDevices[currentIndex + 1] : null;

                        return (
                            <>
                                <DialogHeader>
                                    <div className="flex items-center justify-between gap-2 border-b pb-2">
                                        <DialogTitle className="flex items-center gap-2 text-base font-bold text-purple-800 dark:text-purple-400">
                                            <AppWindow className="w-5 h-5 text-purple-600" /> Gestor de Aplicaciones & Blindaje ({modalAppsList.length})
                                        </DialogTitle>
                                        <div className="flex items-center gap-1">
                                            <span className="text-[11px] font-bold text-muted-foreground mr-1">
                                                {currentIndex >= 0 ? `${currentIndex + 1} de ${total}` : ''}
                                            </span>
                                            <Button
                                                size="icon"
                                                variant="outline"
                                                disabled={!prevDev}
                                                onClick={() => prevDev && handleOpenAppsModal(prevDev)}
                                                className="h-7 w-7"
                                                title={prevDev ? `Anterior: ${prevDev.device_name || prevDev.hardware_id}` : 'No hay anterior'}
                                            >
                                                <ArrowLeft className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button
                                                size="icon"
                                                variant="outline"
                                                disabled={!nextDev}
                                                onClick={() => nextDev && handleOpenAppsModal(nextDev)}
                                                className="h-7 w-7"
                                                title={nextDev ? `Siguiente: ${nextDev.device_name || nextDev.hardware_id}` : 'No hay siguiente'}
                                            >
                                                <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                                            </Button>
                                        </div>
                                    </div>
                                    <DialogDescription className="text-xs pt-1">
                                        Dispositivo: <span className="font-bold text-slate-800 dark:text-slate-200">{selectedAppsDevice?.device_name}</span> ({selectedAppsDevice?.hardware_id}). Desinstale aplicaciones externas o suspenda accesos en modo kiosco.
                                    </DialogDescription>
                                </DialogHeader>

                                {/* Search and Category Tabs */}
                                <div className="space-y-2 pt-1">
                                    <div className="relative">
                                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                                        <Input 
                                            placeholder="Buscar aplicación por nombre o paquete..."
                                            value={appSearchQuery}
                                            onChange={(e) => setAppSearchQuery(e.target.value)}
                                            className="h-8 text-xs pl-8 bg-slate-50 dark:bg-zinc-900"
                                        />
                                    </div>

                                    <div className="flex items-center gap-1.5 border-b pb-2 text-xs">
                                        <button
                                            type="button"
                                            onClick={() => setAppFilterTab('all')}
                                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                                                appFilterTab === 'all' 
                                                    ? 'bg-purple-600 text-white' 
                                                    : 'text-muted-foreground hover:bg-slate-100 dark:hover:bg-zinc-800'
                                            }`}
                                        >
                                            Todas ({modalAppsList.length})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setAppFilterTab('user')}
                                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                                                appFilterTab === 'user' 
                                                    ? 'bg-purple-600 text-white' 
                                                    : 'text-muted-foreground hover:bg-slate-100 dark:hover:bg-zinc-800'
                                            }`}
                                        >
                                            👤 Chofer / Terceros ({modalAppsList.filter((a: any) => !a.isSystem).length})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setAppFilterTab('system')}
                                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                                                appFilterTab === 'system' 
                                                    ? 'bg-purple-600 text-white' 
                                                    : 'text-muted-foreground hover:bg-slate-100 dark:hover:bg-zinc-800'
                                            }`}
                                        >
                                            🔒 Sistema ({modalAppsList.filter((a: any) => a.isSystem).length})
                                        </button>
                                    </div>
                                </div>

                                {/* Apps List */}
                                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 my-2 min-h-[260px]">
                                    {(() => {
                                        const filtered = modalAppsList.filter((app: any) => {
                                            const matchQuery = !appSearchQuery.trim() || 
                                                (app.name && app.name.toLowerCase().includes(appSearchQuery.toLowerCase())) ||
                                                (app.packageName && app.packageName.toLowerCase().includes(appSearchQuery.toLowerCase()));
                                            
                                            if (!matchQuery) return false;
                                            if (appFilterTab === 'user') return !app.isSystem;
                                            if (appFilterTab === 'system') return !!app.isSystem;
                                            return true;
                                        });

                                        if (filtered.length === 0) {
                                            return (
                                                <div className="p-8 text-center text-xs text-muted-foreground">
                                                    No se encontraron aplicaciones con el filtro actual.
                                                </div>
                                            );
                                        }

                                        // Apps críticas vitales que NUNCA deben suspenderse ni modificarse (incluye Play Store para actualización de apps)
                                        const protectedCriticalPkgs = [
                                            'com.clicsoporte.clic_driver',
                                            'com.android.systemui',
                                            'com.android.settings',
                                            'com.android.vending',                   // Google Play Store (Siempre activa para actualizar apps)
                                            'com.google.android.gms',
                                            'com.google.android.gsf',
                                            'com.google.android.inputmethod.latin',
                                            'com.samsung.android.honeyboard',
                                            'com.sec.android.app.launcher',
                                            'com.miui.home',
                                            'com.mi.android.globallauncher',
                                            'com.google.android.apps.nexuslauncher',
                                            'com.android.launcher3',
                                            'com.huawei.android.launcher',
                                            'com.oppo.launcher',
                                            'com.coloros.home',
                                            'com.android.packageinstaller',
                                            'com.google.android.packageinstaller',
                                            'com.miui.packageinstaller',
                                            'com.samsung.android.packageinstaller',
                                            'com.miui.securitycenter',
                                            'com.google.android.dialer',
                                            'com.android.dialer',
                                            'com.android.phone',
                                            'com.android.server.telecom',
                                            'com.samsung.android.incallui',
                                            'com.sec.location.nfwlocationprivacy'
                                        ];

                                        // Obtener lista de desinstalaciones pendientes de este dispositivo
                                        let pendingUninstallsList: string[] = [];
                                        if (selectedAppsDevice?.mdm_pending_uninstalls) {
                                            try {
                                                pendingUninstallsList = JSON.parse(selectedAppsDevice.mdm_pending_uninstalls);
                                            } catch (_) {}
                                        }

                                        return filtered.map((app: any, idx: number) => {
                                            const isSystemApp = app.isSystem === true;
                                            const isAllowed = whitelistedPkgs.length === 0 || whitelistedPkgs.includes(app.packageName);
                                            const isClicApp = app.packageName === 'com.clicsoporte.clic_driver';
                                            const isProtectedCritical = protectedCriticalPkgs.includes(app.packageName) || 
                                                app.packageName.startsWith('com.android.internal') || 
                                                app.packageName.includes('launcher') || 
                                                app.packageName.includes('home');
                                            
                                            const isPendingUninstall = pendingUninstallsList.includes(app.packageName);

                                            return (
                                                <div 
                                                    key={idx} 
                                                    className={`p-2.5 rounded-lg border transition-all flex items-center justify-between gap-3 ${
                                                        isPendingUninstall
                                                            ? 'bg-rose-100/70 border-rose-400 dark:bg-rose-950/40 dark:border-rose-700 shadow-sm'
                                                            : isAllowed 
                                                                ? 'bg-emerald-50/40 border-emerald-200 dark:bg-emerald-950/10' 
                                                                : 'bg-amber-50/40 border-amber-200 dark:bg-amber-950/10'
                                                    }`}
                                                >
                                                    <div className="space-y-0.5 overflow-hidden flex-1">
                                                        <div className="font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                                                            <span className={isPendingUninstall ? 'line-through text-rose-700 dark:text-rose-400' : ''}>
                                                                {app.name || 'Aplicación'}
                                                            </span>
                                                            
                                                            {isPendingUninstall && (
                                                                <Badge className="bg-rose-600 text-white text-[9px] py-0 px-1 font-bold animate-pulse">
                                                                    🗑️ Encolada para Desinstalar
                                                                </Badge>
                                                            )}

                                                            {isProtectedCritical ? (
                                                                <Badge variant="outline" className="text-[9px] py-0 px-1 bg-slate-200/80 dark:bg-zinc-800 text-slate-700 dark:text-slate-300 font-semibold border-slate-300">
                                                                    <Lock className="w-2.5 h-2.5 mr-0.5 text-amber-600" /> Vital / Intocable
                                                                </Badge>
                                                            ) : isSystemApp ? (
                                                                <Badge variant="outline" className="text-[9px] py-0 px-1 bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 font-semibold">
                                                                    Sistema
                                                                </Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="text-[9px] py-0 px-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 font-semibold">
                                                                    Terceros
                                                                </Badge>
                                                            )}

                                                            {isClicApp && (
                                                                <Badge className="bg-purple-600 text-white text-[9px] py-0 px-1 font-semibold">
                                                                    Principal
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <div className="font-mono text-[10px] text-muted-foreground truncate">
                                                            {app.packageName} {app.version ? `(v${app.version})` : ''}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {/* Fijar en menú de Herramientas de Ruta de la APK */}
                                                        {!isProtectedCritical && !isClicApp && (
                                                            <Button
                                                                size="sm"
                                                                variant={pinnedPkgs.includes(app.packageName) ? "default" : "outline"}
                                                                disabled={isPendingUninstall || !isAllowed}
                                                                onClick={() => handleToggleAppPinned(app.packageName)}
                                                                className={`h-7 px-2 text-[10px] font-bold gap-1 ${
                                                                    pinnedPkgs.includes(app.packageName)
                                                                        ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-sm'
                                                                        : 'text-slate-600 hover:text-purple-700 hover:bg-purple-50 dark:text-slate-300 dark:hover:bg-purple-950/30'
                                                                }`}
                                                                title={pinnedPkgs.includes(app.packageName) ? "Fijada en Herramientas de Ruta de la APK (Clic para desfijar)" : "Fijar acceso rápido en Herramientas de Ruta de la APK"}
                                                            >
                                                                <Pin className={`w-3 h-3 ${pinnedPkgs.includes(app.packageName) ? 'rotate-45 fill-current' : ''}`} />
                                                                {pinnedPkgs.includes(app.packageName) ? 'En Ruta' : 'Fijar'}
                                                            </Button>
                                                        )}

                                                        {/* Desinstalación segura: solo apps de terceros y que no sean críticas */}
                                                        {!isSystemApp && !isProtectedCritical && !isClicApp && (
                                                            <Button
                                                                size="sm"
                                                                variant={isPendingUninstall ? "outline" : "ghost"}
                                                                disabled={isPendingUninstall}
                                                                onClick={() => setConfirmUninstall({
                                                                    hwid: selectedAppsDevice.hardware_id,
                                                                    appName: app.name || app.packageName,
                                                                    packageName: app.packageName
                                                                })}
                                                                className={`h-7 px-2 text-[10px] font-bold gap-1 ${
                                                                    isPendingUninstall 
                                                                        ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/50 dark:text-rose-300' 
                                                                        : 'text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                                                                }`}
                                                                title={isPendingUninstall ? "Esta app ya está encolada para desinstalarse" : "Desinstalar silenciosamente en el celular"}
                                                            >
                                                                <Trash2 className="w-3 h-3" /> 
                                                                {isPendingUninstall ? 'Marcada' : 'Desinstalar'}
                                                            </Button>
                                                        )}

                                                        <div className="flex items-center gap-1.5 border-l pl-2 dark:border-zinc-800">
                                                            {isProtectedCritical ? (
                                                                <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium py-1 px-1.5 bg-slate-100 dark:bg-zinc-800 rounded">
                                                                    <Lock className="w-3 h-3 text-slate-400" /> Siempre Activa
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <span className={`text-[10px] font-bold ${isAllowed ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                                                                        {isAllowed ? 'Permitida' : 'Suspendida'}
                                                                    </span>
                                                                    <Switch 
                                                                        checked={isAllowed} 
                                                                        disabled={isPendingUninstall}
                                                                        onCheckedChange={(val) => handleToggleAppWhitelist(app.packageName, val)} 
                                                                    />
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t flex-wrap gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setSelectedAppsDevice(null)}>
                                        Cerrar
                                    </Button>

                                    <div className="flex items-center gap-2">
                                        <Button 
                                            size="sm" 
                                            onClick={() => handleSaveAppWhitelist(false)}
                                            disabled={isPending}
                                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold"
                                        >
                                            Guardar Lista Blanca
                                        </Button>

                                        {nextDev && (
                                            <Button 
                                                size="sm" 
                                                onClick={() => handleSaveAppWhitelist(true)}
                                                disabled={isPending}
                                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-1"
                                            >
                                                Guardar y Siguiente ➔
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </>
                        );
                    })()}
                </DialogContent>
            </Dialog>

            {/* Hardware & Extended Telemetry Modal */}
            <Dialog open={!!selectedHardwareDevice} onOpenChange={() => setSelectedHardwareDevice(null)}>
                <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
                    {(() => {
                        const currentHwid = selectedHardwareDevice?.hardware_id;
                        const currentIndex = processedDevices.findIndex((d: any) => d.hardware_id === currentHwid);
                        const total = processedDevices.length;
                        const prevDev = currentIndex > 0 ? processedDevices[currentIndex - 1] : null;
                        const nextDev = currentIndex >= 0 && currentIndex < total - 1 ? processedDevices[currentIndex + 1] : null;

                        return (
                            <>
                                <DialogHeader>
                                    <div className="flex items-center justify-between gap-2 border-b pb-2">
                                        <DialogTitle className="flex items-center gap-2 text-base font-bold text-cyan-800 dark:text-cyan-400">
                                            <Activity className="w-5 h-5 text-cyan-600" /> Diagnóstico de Hardware & Telemetría
                                        </DialogTitle>
                                        <div className="flex items-center gap-1">
                                            <span className="text-[11px] font-bold text-muted-foreground mr-1">
                                                {currentIndex >= 0 ? `${currentIndex + 1} de ${total}` : ''}
                                            </span>
                                            <Button
                                                size="icon"
                                                variant="outline"
                                                disabled={!prevDev}
                                                onClick={() => {
                                                    if (prevDev) {
                                                        setSelectedHardwareDevice(prevDev);
                                                        setLastWorkedHwid(prevDev.hardware_id);
                                                    }
                                                }}
                                                className="h-7 w-7"
                                                title={prevDev ? `Anterior: ${prevDev.device_name || prevDev.hardware_id}` : 'No hay anterior'}
                                            >
                                                <ArrowLeft className="w-3.5 h-3.5" />
                                            </Button>
                                            <Button
                                                size="icon"
                                                variant="outline"
                                                disabled={!nextDev}
                                                onClick={() => {
                                                    if (nextDev) {
                                                        setSelectedHardwareDevice(nextDev);
                                                        setLastWorkedHwid(nextDev.hardware_id);
                                                    }
                                                }}
                                                className="h-7 w-7"
                                                title={nextDev ? `Siguiente: ${nextDev.device_name || nextDev.hardware_id}` : 'No hay siguiente'}
                                            >
                                                <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                                            </Button>
                                        </div>
                                    </div>
                                    <DialogDescription className="text-xs pt-1">
                                        Dispositivo: <span className="font-bold text-slate-800 dark:text-slate-200">{selectedHardwareDevice?.device_name}</span> ({selectedHardwareDevice?.hardware_id})
                                    </DialogDescription>
                                </DialogHeader>

                    {selectedHardwareDevice && (
                        <div className="flex-1 overflow-y-auto space-y-4 pr-1 my-2 text-xs">
                            {/* Device & OS Card */}
                            <div className="p-3 bg-slate-50 dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-2">
                                <div className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 text-xs">
                                    <Smartphone className="w-4 h-4 text-purple-600" /> Dispositivo & Sistema
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[11px]">
                                    <div>
                                        <span className="text-muted-foreground block text-[10px]">Modelo:</span>
                                        <span className="font-semibold text-slate-900 dark:text-slate-100">{selectedHardwareDevice.device_model || 'Android Genérico'}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground block text-[10px]">Versión OS:</span>
                                        <span className="font-semibold text-slate-900 dark:text-slate-100">{selectedHardwareDevice.os_version || 'Android'}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground block text-[10px]">Serial / Hardware ID:</span>
                                        <span className="font-mono text-[10px] text-slate-700 dark:text-slate-300 truncate block">{selectedHardwareDevice.hardware_id}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground block text-[10px]">Serial Real (Fábrica):</span>
                                        <span className="font-mono text-[10px] font-bold text-purple-700 dark:text-purple-300 truncate block">
                                            {selectedHardwareDevice.serial_number || 'N/D'}
                                        </span>
                                    </div>
                                    <div className="col-span-2">
                                        <span className="text-muted-foreground block text-[10px]">IMEI Módem:</span>
                                        <span className="font-mono text-[10px] text-slate-700 dark:text-slate-300">{selectedHardwareDevice.imei || 'N/D'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* SIM, Phone & Network Card */}
                            <div className="p-3 bg-cyan-50/50 dark:bg-cyan-950/20 rounded-xl border border-cyan-200 dark:border-cyan-900/40 space-y-2">
                                <div className="font-bold text-cyan-800 dark:text-cyan-300 flex items-center gap-1.5 text-xs">
                                    <Radio className="w-4 h-4 text-cyan-600" /> Línea Celular, SIM & Conectividad
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[11px]">
                                    <div>
                                        <span className="text-muted-foreground block text-[10px]">Teléfono / Línea:</span>
                                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                                            {selectedHardwareDevice.phone_number || selectedHardwareDevice.driver_phone || 'No detectado (N/D)'}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground block text-[10px]">Operador SIM:</span>
                                        <Badge variant="outline" className="bg-white dark:bg-zinc-900 text-cyan-700 dark:text-cyan-300 border-cyan-300 text-[10px] font-bold">
                                            {selectedHardwareDevice.sim_carrier || 'SIM / Móvil N/D'}
                                        </Badge>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground block text-[10px]">Tipo de Conexión:</span>
                                        <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                                            <Wifi className="w-3 h-3 text-cyan-600" />
                                            {selectedHardwareDevice.network_type || 'Desconectado / Desconocido'}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground block text-[10px]">Modo MDM:</span>
                                        <Badge className={`text-[9px] ${selectedHardwareDevice.is_device_owner === 1 ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                                            {selectedHardwareDevice.is_device_owner === 1 ? '👑 Device Owner' : 'App Estándar'}
                                        </Badge>
                                    </div>
                                </div>
                            </div>

                            {/* Battery & Thermal Health Card */}
                            <div className="p-3 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-900/40 space-y-2">
                                <div className="font-bold text-amber-800 dark:text-amber-300 flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1.5">
                                        <Battery className="w-4 h-4 text-amber-600" /> Batería & Temperatura
                                    </span>
                                    <span className="font-mono text-xs font-black">
                                        {selectedHardwareDevice.battery_level ?? 100}% {selectedHardwareDevice.is_charging === 1 ? '⚡ Cargando' : ''}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 bg-white dark:bg-zinc-900 rounded-lg border">
                                            <Flame className={`w-4 h-4 ${(selectedHardwareDevice.battery_temp_c ?? 0) > 42 ? 'text-rose-600' : 'text-amber-500'}`} />
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground block text-[10px]">Temperatura:</span>
                                            <span className={`font-bold font-mono ${(selectedHardwareDevice.battery_temp_c ?? 0) > 42 ? 'text-rose-600 font-black' : 'text-slate-800 dark:text-slate-200'}`}>
                                                {selectedHardwareDevice.battery_temp_c != null ? `${selectedHardwareDevice.battery_temp_c}°C` : 'N/D'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 bg-white dark:bg-zinc-900 rounded-lg border">
                                            <Zap className="w-4 h-4 text-amber-500" />
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground block text-[10px]">Estado / Voltaje:</span>
                                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                                                {selectedHardwareDevice.is_charging === 1 ? '⚡ Cargando' : 'En batería'}
                                                {selectedHardwareDevice.battery_voltage ? ` (${selectedHardwareDevice.battery_voltage}V)` : ''}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="col-span-2 pt-1 border-t border-amber-200/50 dark:border-amber-900/30 flex items-center justify-between text-[10px]">
                                        <span className="text-muted-foreground">Salud de Celda:</span>
                                        <span className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                                            🛡️ {selectedHardwareDevice.battery_health || 'Buena (Óptima)'} {selectedHardwareDevice.battery_tech ? `• ${selectedHardwareDevice.battery_tech}` : ''}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* RAM & Storage Memory Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {/* RAM */}
                                <div className="p-3 bg-slate-50 dark:bg-zinc-900 rounded-xl border space-y-1.5">
                                    <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between text-[11px]">
                                        <span className="flex items-center gap-1">
                                            <Gauge className="w-3.5 h-3.5 text-indigo-600" /> Memoria RAM
                                        </span>
                                        {selectedHardwareDevice.ram_total_mb && (
                                            <span className="font-mono text-[10px] text-muted-foreground">
                                                {selectedHardwareDevice.ram_free_mb} MB libres
                                            </span>
                                        )}
                                    </div>
                                    {selectedHardwareDevice.ram_total_mb ? (
                                        <>
                                            <div className="w-full bg-slate-200 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                                                <div 
                                                    className="bg-indigo-600 h-full rounded-full transition-all"
                                                    style={{ width: `${Math.round(((selectedHardwareDevice.ram_total_mb - (selectedHardwareDevice.ram_free_mb || 0)) / selectedHardwareDevice.ram_total_mb) * 100)}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                                                <span>Usado: {selectedHardwareDevice.ram_total_mb - (selectedHardwareDevice.ram_free_mb || 0)} MB</span>
                                                <span>Total: {(selectedHardwareDevice.ram_total_mb / 1024).toFixed(1)} GB</span>
                                            </div>
                                        </>
                                    ) : (
                                        <p className="text-[10px] text-muted-foreground italic">Se reportará en la próxima sincronización.</p>
                                    )}
                                </div>

                                {/* Flash Storage */}
                                <div className="p-3 bg-slate-50 dark:bg-zinc-900 rounded-xl border space-y-1.5">
                                    <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between text-[11px]">
                                        <span className="flex items-center gap-1">
                                            <HardDrive className="w-3.5 h-3.5 text-purple-600" /> Almacenamiento
                                        </span>
                                        {selectedHardwareDevice.storage_total_mb && (
                                            <span className="font-mono text-[10px] text-muted-foreground">
                                                {((selectedHardwareDevice.storage_free_mb || 0) / 1024).toFixed(1)} GB libres
                                            </span>
                                        )}
                                    </div>
                                    {selectedHardwareDevice.storage_total_mb ? (
                                        <>
                                            <div className="w-full bg-slate-200 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                                                <div 
                                                    className="bg-purple-600 h-full rounded-full transition-all"
                                                    style={{ width: `${Math.round(((selectedHardwareDevice.storage_total_mb - (selectedHardwareDevice.storage_free_mb || 0)) / selectedHardwareDevice.storage_total_mb) * 100)}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                                                <span>Libre: {((selectedHardwareDevice.storage_free_mb || 0) / 1024).toFixed(1)} GB</span>
                                                <span>Total: {Math.round(selectedHardwareDevice.storage_total_mb / 1024)} GB</span>
                                            </div>
                                        </>
                                    ) : (
                                        <p className="text-[10px] text-muted-foreground italic">Se reportará en la próxima sincronización.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                                <div className="flex justify-end pt-2 border-t">
                                    <Button variant="outline" size="sm" onClick={() => setSelectedHardwareDevice(null)}>
                                        Cerrar
                                    </Button>
                                </div>
                            </>
                        );
                    })()}
                </DialogContent>
            </Dialog>

            {/* AlertDialog: Confirmación de Desinstalación de Aplicación */}
            <AlertDialog open={!!confirmUninstall} onOpenChange={() => setConfirmUninstall(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-rose-600">
                            <Trash2 className="w-5 h-5" /> Confirmar Desinstalación Remota
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                            <p>
                                ¿Está seguro de solicitar la desinstalación silenciosa de <strong className="text-slate-900 dark:text-slate-100">{confirmUninstall?.appName}</strong> (<span className="font-mono">{confirmUninstall?.packageName}</span>)?
                            </p>
                            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/30 rounded-lg border border-rose-200 dark:border-rose-900/50 text-[11px] text-rose-800 dark:text-rose-300">
                                ⚠️ La aplicación será removida por hardware del teléfono en su próxima sincronización automática (aproximadamente en 5 minutos).
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setConfirmUninstall(null)}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={handleConfirmUninstall}
                            className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
                        >
                            Desinstalar Aplicación
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* AlertDialog: Confirmación de Reinicio Remoto */}
            <AlertDialog open={!!confirmReboot} onOpenChange={() => setConfirmReboot(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-indigo-600">
                            <RotateCcw className="w-5 h-5" /> Confirmar Reinicio Remoto de Teléfono
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                            <p>
                                ¿Está seguro de enviar una orden de reinicio por hardware al dispositivo <strong className="text-slate-900 dark:text-slate-100">{confirmReboot?.deviceName}</strong>?
                            </p>
                            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg border border-indigo-200 dark:border-indigo-900/50 text-[11px] text-indigo-800 dark:text-indigo-300">
                                🔄 El sistema operativo Android se reiniciará por completo tan pronto el dispositivo reporte su próxima sincronización.
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setConfirmReboot(null)}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={handleConfirmReboot}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                        >
                            Reiniciar Dispositivo
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* AlertDialog: Confirmación de Eliminación de Registro */}
            <AlertDialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-rose-600">
                            <Trash2 className="w-5 h-5" /> Eliminar Dispositivo de la Flota
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-slate-600 dark:text-slate-300">
                            ¿Está seguro de eliminar el registro de <strong className="text-slate-900 dark:text-slate-100">{confirmDelete?.name}</strong>? Si el teléfono vuelve a conectarse, se volverá a aprovisionar automáticamente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setConfirmDelete(null)}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={handleConfirmDelete}
                            className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
                        >
                            Eliminar Registro
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* OTP Emergency Token Generator Modal */}
            <Dialog open={!!selectedOtpDevice} onOpenChange={(open) => !open && setSelectedOtpDevice(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                            <Lock className="w-5 h-5" /> Generador de Token OTP / PIN de Emergencia
                        </DialogTitle>
                        <DialogDescription>
                            Genera un PIN de 4 dígitos de un solo uso para acceder a los Ajustes del APK sin internet.
                        </DialogDescription>
                    </DialogHeader>

                    {selectedOtpDevice && (
                        <div className="space-y-4 py-2">
                            <div className="bg-slate-100 dark:bg-slate-900 p-3 rounded-lg border text-xs space-y-1">
                                <p className="font-semibold text-slate-800 dark:text-slate-200">
                                    📱 Dispositivo: <span className="font-bold">{selectedOtpDevice.device_name || selectedOtpDevice.hardware_id}</span>
                                </p>
                                {selectedOtpDevice.last_driver_name && (
                                    <p className="text-muted-foreground">
                                        Chofer: {selectedOtpDevice.last_driver_name}
                                    </p>
                                )}
                                <p className="font-mono text-[11px] text-slate-500">
                                    HWID: {selectedOtpDevice.hardware_id}
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-bold">Código de Desafío (Challenge Code del Celular)</Label>
                                <Input 
                                    placeholder="Ej: 849-201 o 849201"
                                    value={otpChallengeInput}
                                    onChange={(e) => setOtpChallengeInput(e.target.value)}
                                    className="h-10 text-center font-mono text-lg font-bold tracking-widest bg-white dark:bg-zinc-950"
                                    maxLength={7}
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    Introduce el código de 6 dígitos que el chofer ve en la pantalla de su celular.
                                </p>
                            </div>

                            {otpChallengeInput.trim().length >= 6 && (
                                <div className="bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-500/50 p-4 rounded-xl text-center space-y-1 animate-in fade-in zoom-in-95 duration-150">
                                    <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block">
                                        🔑 PIN Temporal de Emergencia (Un Solo Uso)
                                    </span>
                                    <div className="text-3xl font-black font-mono text-emerald-700 dark:text-emerald-400 tracking-widest">
                                        {generateOtpFromChallenge(otpChallengeInput)}
                                    </div>
                                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400/80 italic">
                                        Dicta este número de 4 dígitos al chofer para desbloquear el acceso.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </main>
    );
}
