'use client';

import { useRef, useState } from 'react';
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addFleetSettingAction } from "../lib/actions";
import { useToast } from "@/modules/core/hooks/use-toast";

interface AddSettingFormProps {
    category: string;
    placeholder: string;
}

export default function AddSettingForm({ category, placeholder }: AddSettingFormProps) {
    const formRef = useRef<HTMLFormElement>(null);
    const [loading, setLoading] = useState(false);
    const { toast } = useToast();

    async function action(formData: FormData) {
        const value = formData.get('value') as string;
        const price = Number(formData.get('price')) || 0;
        if (!value || value.trim() === '') return;

        setLoading(true);
        try {
            await addFleetSettingAction(category, value, price);
            formRef.current?.reset();
            toast({
                title: "Éxito",
                description: "Parámetro agregado correctamente.",
            });
        } catch (error) {
            toast({
                variant: "destructive",
                title: "Error",
                description: "No se pudo agregar el parámetro.",
            });
        } finally {
            setLoading(false);
        }
    }

    return (
        <form ref={formRef} action={action} className="flex flex-col gap-2">
            <div className="flex gap-2">
                <Input 
                    name="value" 
                    placeholder={placeholder} 
                    className="flex-1"
                    disabled={loading}
                    required
                />
                {category === 'fuel_type' && (
                    <Input 
                        name="price" 
                        type="number"
                        step="0.01"
                        placeholder="Precio (CRC)" 
                        className="w-32"
                        disabled={loading}
                    />
                )}
                <Button size="sm" type="submit" disabled={loading}>
                    <Plus className="w-4 h-4 mr-1" /> {loading ? '...' : 'Añadir'}
                </Button>
            </div>
        </form>
    );
}
