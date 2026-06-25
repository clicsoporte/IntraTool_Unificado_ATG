'use client';

import React from 'react';
import { usePageTitle } from '@/modules/core/hooks/usePageTitle';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { FileSignature, Truck, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function OperationsPage() {
    const { setTitle } = usePageTitle();

    React.useEffect(() => {
        setTitle("Centro de Trazabilidad y Operaciones");
    }, [setTitle]);

    const submodules: any[] = [
        {
            href: "/dashboard/operations/logistics",
            title: "Logística y Despacho 🚛",
            description: "Monitoreo de entregas en tiempo real, despacho de camiones, control de rutas y gestión de solicitudes de recolección para compras.",
            icon: Truck,
            bgColor: "bg-teal-600",
            color: "text-teal-600"
        }
    ];

    return (
        <main className="flex-1 p-4 md:p-6 lg:p-8 animate-in fade-in duration-500">
            <div className="mx-auto max-w-5xl space-y-8">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-teal-600 rounded-2xl text-white shadow-lg shadow-teal-100">
                        <FileSignature className="w-8 h-8" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight">Centro de Operaciones</h1>
                        <p className="text-muted-foreground font-medium">Gestión de activos, formularios digitales y trazabilidad operativa.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {submodules.map((sub) => (
                        <Link key={sub.href} href={sub.href} prefetch={false}>
                            <Card className="group hover:shadow-xl transition-all border-none shadow-md overflow-hidden relative">
                                <div className={`absolute top-0 right-0 w-32 h-32 -mr-8 -mt-8 rounded-full ${sub.bgColor} opacity-20 group-hover:scale-110 transition-transform`} />
                                <CardHeader className="pb-2 flex flex-row items-center gap-4">
                                    <div className={`p-3 ${sub.bgColor} ${sub.color} rounded-xl`}>
                                        <sub.icon className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl">{sub.title}</CardTitle>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                                        {sub.description}
                                    </p>
                                    <div className={`flex items-center gap-1 text-sm font-bold ${sub.color}`}>
                                        Acceder ahora <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}

                    <Card className="border-dashed flex items-center justify-center p-8 bg-muted/30">
                        <div className="text-center space-y-2">
                            <div className="mx-auto bg-muted p-4 rounded-full w-fit">
                                <FileSignature className="h-8 w-8 text-muted-foreground/40" />
                            </div>
                            <CardTitle className="text-muted-foreground">Próximos Módulos</CardTitle>
                            <CardDescription>Boletas de entrega, control de rutas y más formularios digitales en desarrollo.</CardDescription>
                        </div>
                    </Card>
                </div>
            </div>
        </main>
    );
}
