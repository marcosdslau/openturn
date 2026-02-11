"use client";
import React, { useState, useRef, useEffect } from "react";
import { useTenant } from "@/context/TenantContext";

export default function InstitutionSelector() {
    const { instituicoes, codigoInstituicao, switchInstituicao } = useTenant();
    const [searchTerm, setSearchTerm] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const currentInst = instituicoes?.find((i) => i.INSCodigo === codigoInstituicao);

    const filteredInstituicoes = instituicoes?.filter((inst) =>
        inst.INSNome.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    const toggleDropdown = () => {
        setIsOpen(!isOpen);
        if (!isOpen) setSearchTerm("");
    };

    const handleSwitch = (codigo: number) => {
        switchInstituicao(codigo);
        setIsOpen(false);
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    if (!instituicoes || instituicoes.length === 0) return null;

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={toggleDropdown}
                className="flex items-center justify-between h-10 gap-2 px-3 text-sm font-medium text-gray-700 transition-colors bg-white border border-gray-200 rounded-lg shadow-theme-xs hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700 min-w-[140px] max-w-[200px]"
            >
                <span className="truncate">
                    {currentInst?.INSNome || "Instituição"}
                </span>
                <svg
                    className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute left-0 z-99999 w-[260px] mt-2 bg-white border border-gray-200 rounded-xl shadow-theme-lg dark:bg-gray-900 dark:border-gray-800">
                    <div className="p-3 border-b border-gray-100 dark:border-gray-800">
                        <input
                            autoFocus
                            type="text"
                            placeholder="Buscar instituição..."
                            className="w-full px-3 py-2 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-brand-500 dark:bg-gray-950 dark:border-gray-700 dark:text-gray-300"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <ul className="max-h-60 overflow-y-auto custom-scrollbar py-2">
                        {filteredInstituicoes.map((inst) => (
                            <li key={inst.INSCodigo}>
                                <button
                                    onClick={() => handleSwitch(inst.INSCodigo)}
                                    className={`flex items-center w-full px-4 py-2.5 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${inst.INSCodigo === codigoInstituicao
                                            ? "text-brand-600 font-semibold bg-brand-50/50 dark:text-brand-400 dark:bg-brand-900/20"
                                            : "text-gray-700 dark:text-gray-300"
                                        }`}
                                >
                                    <span className="truncate">{inst.INSNome}</span>
                                    {inst.INSCodigo === codigoInstituicao && (
                                        <svg className="ml-auto w-4 h-4 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </button>
                            </li>
                        ))}
                        {filteredInstituicoes.length === 0 && (
                            <li className="px-4 py-3 text-xs text-center text-gray-500 dark:text-gray-400">
                                Nenhuma instituição encontrada
                            </li>
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
}
