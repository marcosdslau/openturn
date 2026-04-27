"use client";

import React from "react";

export interface LimiarFacialSliderProps {
    value: number;
    onChange: (value: number) => void;
    disabled?: boolean;
    label?: string;
    id?: string;
}

export default function LimiarFacialSlider({
    value,
    onChange,
    disabled = false,
    label = "Limiar facial",
    id = "limiar-facial",
}: LimiarFacialSliderProps) {
    const v = Math.min(1000, Math.max(0, Number.isFinite(value) ? value : 680));
    return (
        <div>
            <div className="flex items-center justify-between gap-2 mb-1">
                <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {label}
                </label>
                <span className="text-sm tabular-nums text-gray-600 dark:text-gray-400">{v}</span>
            </div>
            <input
                id={id}
                type="range"
                min={0}
                max={1000}
                step={1}
                value={v}
                disabled={disabled}
                onChange={(e) => onChange(parseInt(e.target.value, 10))}
                className="w-full h-2 cursor-pointer appearance-none rounded-lg bg-gray-200 accent-brand-500 dark:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <p className="mt-1 text-[10px] text-gray-400">Intervalo 0 a 1000.</p>
        </div>
    );
}
