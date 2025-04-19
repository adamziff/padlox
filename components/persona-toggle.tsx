'use client'

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils"; // Import cn from the utility file

export type Persona = 'insurer' | 'policyholder';

interface PersonaToggleProps {
    initialPersona?: Persona;
    onPersonaChange: (persona: Persona) => void;
}

export function PersonaToggle({
    initialPersona = 'policyholder',
    onPersonaChange
}: PersonaToggleProps) {
    const [activePersona, setActivePersona] = useState<Persona>(initialPersona);

    const handleToggle = (persona: Persona) => {
        setActivePersona(persona);
        onPersonaChange(persona);
    };

    // Define base classes for consistent styling
    const baseButtonClasses = "px-4 py-2 text-sm font-medium transition-colors duration-200 ease-in-out focus:z-10 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background";
    const activeClasses = "bg-primary text-primary-foreground hover:bg-primary/90";
    const inactiveClasses = "bg-background text-foreground hover:bg-muted border border-border"; // Use border for inactive

    return (
        <div className="inline-flex rounded-md shadow-sm" role="group">
            <Button
                variant="ghost" // Use ghost to allow full background control via className
                size="sm"
                onClick={() => handleToggle('policyholder')}
                className={cn(
                    baseButtonClasses,
                    "rounded-r-none border-r-0", // Adjust borders for adjacency
                    activePersona === 'policyholder' ? activeClasses : inactiveClasses
                )}
            >
                For Policyholders
            </Button>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => handleToggle('insurer')}
                className={cn(
                    baseButtonClasses,
                    "rounded-l-none",
                    activePersona === 'insurer' ? activeClasses : inactiveClasses
                )}
            >
                For Insurers
            </Button>
        </div>
    );
} 