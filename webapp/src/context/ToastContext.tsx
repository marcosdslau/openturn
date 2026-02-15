"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import Notification from "@/components/ui/notification/Notification";

export type ToastVariant = "success" | "info" | "warning" | "error";

interface Toast {
    id: string;
    variant: ToastVariant;
    title: string;
    description?: string;
    duration?: number;
}

interface ToastContextType {
    showToast: (variant: ToastVariant, title: string, description?: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error("useToast must be used within a ToastProvider");
    }
    return context;
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((variant: ToastVariant, title: string, description?: string, duration = 3000) => {
        const id = Math.random().toString(36).substring(7);
        const newToast = { id, variant, title, description, duration };

        setToasts((prev) => [...prev, newToast]);

        // Auto remove after duration + animation buffer
        // Note: The Notification component handles its own visibility timer, but we should remove it from state eventually
        // However, Notification implementation just hides itself.
        // To make this robust, we can just let Notification handle visual hiding, 
        // and we remove it from array after a safe margin.
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration + 500);
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-3 pointer-events-none">
                {toasts.map((toast) => (
                    <div key={toast.id} className="pointer-events-auto animate-fade-in-left">
                        <Notification
                            variant={toast.variant}
                            title={toast.title}
                            description={toast.description}
                            hideDuration={toast.duration}
                        />
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};
