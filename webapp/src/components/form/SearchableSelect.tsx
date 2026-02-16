"use client";
import React, { useState, useRef, useEffect } from "react";
import { ChevronDownIcon } from "@/icons";

interface Option {
    value: string | number;
    label: string;
}

interface SearchableSelectProps {
    options: Option[];
    value: string | number;
    onChange: (value: string | number) => void;
    placeholder?: string;
    label?: string;
    className?: string;
}

export default function SearchableSelect({
    options,
    value,
    onChange,
    placeholder = "Selecione uma opção",
    label,
    className = "",
}: SearchableSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find((opt) => opt.value === value);

    const filteredOptions = options.filter((opt) =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const toggleDropdown = () => {
        setIsOpen(!isOpen);
        if (!isOpen) setSearchTerm("");
    };

    const handleSelect = (optionValue: string | number) => {
        onChange(optionValue);
        setIsOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            {label && (
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                    {label}
                </label>
            )}
            <button
                type="button"
                onClick={toggleDropdown}
                className="flex items-center justify-between w-full h-11 px-3 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg shadow-theme-xs hover:bg-gray-50 focus:outline-none focus:border-brand-500 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
            >
                <span className={`truncate ${!selectedOption ? "text-gray-400" : ""}`}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDownIcon className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
            </button>

            {isOpen && (
                <div className="absolute left-0 z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-theme-lg dark:bg-gray-900 dark:border-gray-800">
                    <div className="p-3 border-b border-gray-100 dark:border-gray-800">
                        <input
                            autoFocus
                            type="text"
                            placeholder="Pesquisar..."
                            className="w-full px-3 py-2 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-950 dark:border-gray-700 dark:text-gray-300"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <ul className="max-h-60 overflow-y-auto custom-scrollbar py-2">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((opt) => (
                                <li key={opt.value}>
                                    <button
                                        type="button"
                                        onClick={() => handleSelect(opt.value)}
                                        className={`flex items-center w-full px-4 py-2.5 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${opt.value === value
                                            ? "text-brand-600 font-semibold bg-brand-50/50 dark:text-brand-400 dark:bg-brand-900/20"
                                            : "text-gray-700 dark:text-gray-300"
                                            }`}
                                    >
                                        <span className="truncate">{opt.label}</span>
                                        {opt.value === value && (
                                            <svg className="ml-auto w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </button>
                                </li>
                            ))
                        ) : (
                            <li className="px-4 py-3 text-sm text-center text-gray-500 dark:text-gray-400">
                                Nenhum resultado encontrado.
                            </li>
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
}
