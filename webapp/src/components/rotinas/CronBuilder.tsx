import React, { useState, useEffect } from 'react';
import { PlusIcon, CloseIcon } from '@/icons';

interface CronBuilderProps {
    value: string;
    onChange: (value: string) => void;
}

type ScheduleType = 'MINUTES' | 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';

// Helper to toggle value in array
const toggleValue = (arr: number[], val: number): number[] => {
    if (arr.includes(val)) return arr.filter(x => x !== val).sort((a, b) => a - b);
    return [...arr, val].sort((a, b) => a - b);
};

// Helper to parsing cron parts to numbers
const parsePart = (part: string, min: number, max: number): number[] => {
    if (part === '*') return [];
    if (part.includes('/')) return []; // Intervals not fully supported visually yet (treated as Custom)
    return part.split(',').map(Number).filter(n => !isNaN(n) && n >= min && n <= max).sort((a, b) => a - b);
};

export function CronBuilder({ value, onChange }: CronBuilderProps) {
    const [type, setType] = useState<ScheduleType>('CUSTOM');

    // Internal state: arrays for multi-select
    const [minutes, setMinutes] = useState<number[]>([0]);
    const [hours, setHours] = useState<number[]>([0]);
    const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1]); // 0-6
    const [daysOfMonth, setDaysOfMonth] = useState<number[]>([1]);

    // Minute Interval state
    const [minuteInterval, setMinuteInterval] = useState<number>(1);

    // Parse incoming value
    useEffect(() => {
        if (!value) return;
        const parts = value.split(' ');
        if (parts.length !== 5) {
            setType('CUSTOM');
            return;
        }

        const [minStr, hrStr, domStr, monStr, dowStr] = parts;

        // Detection Logic
        // MINUTES: */n * * * * or * * * * *
        if (hrStr === '*' && domStr === '*' && monStr === '*' && dowStr === '*') {
            if (minStr.includes('/')) {
                const [, interval] = minStr.split('/');
                setType('MINUTES');
                setMinuteInterval(Number(interval) || 1);
            } else if (minStr === '*') {
                setType('MINUTES');
                setMinuteInterval(1);
            } else {
                // Specific minutes, treat as HOURLY
                setType('HOURLY');
                setMinutes(parsePart(minStr, 0, 59));
            }
        }
        // DAILY: DOM=*, MON=*, DOW=*
        else if (domStr === '*' && monStr === '*' && dowStr === '*') {
            setType('DAILY');
            setMinutes(parsePart(minStr, 0, 59));
            setHours(parsePart(hrStr, 0, 23));
        }
        // WEEKLY: DOM=*, MON=*
        else if (domStr === '*' && monStr === '*' && dowStr !== '*') {
            setType('WEEKLY');
            setMinutes(parsePart(minStr, 0, 59));
            setHours(parsePart(hrStr, 0, 23));
            setDaysOfWeek(parsePart(dowStr, 0, 6));
        }
        // MONTHLY: MON=*, DOW=*
        else if (domStr !== '*' && monStr === '*' && dowStr === '*') {
            setType('MONTHLY');
            setMinutes(parsePart(minStr, 0, 59));
            setHours(parsePart(hrStr, 0, 23));
            setDaysOfMonth(parsePart(domStr, 1, 31));
        }
        // CUSTOM
        else {
            setType('CUSTOM');
        }
    }, []); // Run once on mount to init state.

    // Generate Cron String
    useEffect(() => {
        if (type === 'CUSTOM') return;

        const mins = minutes.length > 0 ? minutes.join(',') : '0';
        const hrs = hours.length > 0 ? hours.join(',') : '0';
        const dows = daysOfWeek.length > 0 ? daysOfWeek.join(',') : '*';
        const doms = daysOfMonth.length > 0 ? daysOfMonth.join(',') : '*';

        let newVal = '';
        switch (type) {
            case 'MINUTES':
                newVal = minuteInterval === 1 ? '* * * * *' : `*/${minuteInterval} * * * *`;
                break;
            case 'HOURLY':
                newVal = `${mins} * * * *`;
                break;
            case 'DAILY':
                newVal = `${mins} ${hrs} * * *`;
                break;
            case 'WEEKLY':
                newVal = `${mins} ${hrs} * * ${daysOfWeek.length > 0 ? daysOfWeek.join(',') : '*'}`;
                break;
            case 'MONTHLY':
                newVal = `${mins} ${hrs} ${daysOfMonth.length > 0 ? daysOfMonth.join(',') : '*'} * *`;
                break;
        }

        if (newVal && newVal !== value) {
            onChange(newVal);
        }
    }, [minutes, hours, daysOfWeek, daysOfMonth, minuteInterval, type]);


    // UI Helpers
    const toggleMinute = (m: number) => setMinutes(prev => toggleValue(prev, m));
    const toggleHour = (h: number) => setHours(prev => toggleValue(prev, h));
    const toggleDayOfWeek = (d: number) => setDaysOfWeek(prev => toggleValue(prev, d));
    const toggleDayOfMonth = (d: number) => setDaysOfMonth(prev => toggleValue(prev, d));


    return (
        <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            {/* Type Selector */}
            <div className="flex flex-wrap gap-2">
                {['MINUTES', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'].map((t) => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => setType(t as ScheduleType)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${type === t
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600'
                            }`}
                    >
                        {t === 'MINUTES' ? 'Minutos' : t.charAt(0) + t.slice(1).toLowerCase()}
                    </button>
                ))}
            </div>

            <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-4">

                {/* Minute Interval Selector */}
                {type === 'MINUTES' && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Executar a cada</span>
                        <input
                            type="number" min="1" max="59"
                            className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 font-medium text-center"
                            value={minuteInterval}
                            onChange={(e) => setMinuteInterval(Math.max(1, Math.min(59, Number(e.target.value))))}
                        />
                        <span className="text-sm text-gray-600 dark:text-gray-400">minuto(s)</span>
                    </div>
                )}

                {/* Specific Minute Selector (HOURLY) */}
                {type === 'HOURLY' && (
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">
                            Minutos ({minutes.join(', ') || '0'})
                        </label>
                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1 border rounded bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-600">
                            {[0, 15, 30, 45].map(m => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => toggleMinute(m)}
                                    className={`px-2 py-0.5 text-xs rounded ${minutes.includes(m) ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-600'}`}
                                >
                                    :{String(m).padStart(2, '0')}
                                </button>
                            ))}
                            <input
                                type="number" min="0" max="59"
                                className="w-12 px-1 text-xs border rounded dark:bg-gray-800 dark:border-gray-700"
                                placeholder="mm"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        const val = Number(e.currentTarget.value);
                                        if (!isNaN(val) && val >= 0 && val <= 59) {
                                            if (!minutes.includes(val)) setMinutes([...minutes, val].sort((a, b) => a - b));
                                            e.currentTarget.value = '';
                                        }
                                    }
                                }}
                            />
                            <span className="text-[10px] text-gray-400 self-center">Press Enter</span>
                        </div>
                        {minutes.length > 4 && <div className="flex flex-wrap gap-1 mt-1">
                            {minutes.filter(m => ![0, 15, 30, 45].includes(m)).map(m => (
                                <span key={m} className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded flex items-center gap-1">
                                    {m} <button onClick={() => toggleMinute(m)} className="hover:text-red-500">×</button>
                                </span>
                            ))}
                        </div>}
                    </div>
                )}

                {/* Hour Selector */}
                {['DAILY', 'WEEKLY', 'MONTHLY'].includes(type) && (
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">
                            Horas ({hours.join(', ') || '0'})
                        </label>
                        <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
                            {Array.from({ length: 24 }, (_, i) => i).map(h => (
                                <button
                                    key={h}
                                    type="button"
                                    onClick={() => toggleHour(h)}
                                    className={`px-1 py-1 text-xs rounded text-center transition-colors ${hours.includes(h)
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
                                        }`}
                                >
                                    {String(h).padStart(2, '0')}h
                                </button>
                            ))}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                            <span className="text-xs text-gray-500">No minuto:</span>
                            <input
                                type="number" min="0" max="59"
                                value={minutes[0] || 0}
                                onChange={e => setMinutes([Number(e.target.value)])}
                                className="w-12 px-1 py-0.5 text-xs border rounded dark:bg-gray-800 dark:border-gray-700"
                            />
                        </div>
                    </div>
                )}

                {/* Day of Week Selector */}
                {type === 'WEEKLY' && (
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Dias da Semana</label>
                        <div className="flex flex-wrap gap-1">
                            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => toggleDayOfWeek(idx)}
                                    className={`px-3 py-1.5 text-xs rounded-md transition-colors ${daysOfWeek.includes(idx)
                                            ? 'bg-purple-600 text-white'
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                                        }`}
                                >
                                    {day}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Day of Month Selector */}
                {type === 'MONTHLY' && (
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Dias do Mês</label>
                        <div className="grid grid-cols-7 sm:grid-cols-10 gap-1">
                            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                                <button
                                    key={d}
                                    type="button"
                                    onClick={() => toggleDayOfMonth(d)}
                                    className={`px-1 py-1 text-xs rounded text-center transition-colors ${daysOfMonth.includes(d)
                                            ? 'bg-green-600 text-white'
                                            : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200'
                                        }`}
                                >
                                    {d}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Custom Input */}
                {type === 'CUSTOM' && (
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Expressão Manual</label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 font-mono text-sm"
                            placeholder="* * * * *"
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                        />
                        <p className="text-xs text-gray-500 mt-1">Minuto Hora Dia Mês DiaSemana (0-6)</p>
                    </div>
                )}
            </div>

            {type !== 'CUSTOM' && (
                <div className="flex items-center gap-2 text-xs text-gray-500 font-mono pt-2 border-t border-gray-200 dark:border-gray-800">
                    <span className="font-semibold">Resultado:</span>
                    <span className="bg-gray-100 dark:bg-gray-900 px-2 py-0.5 rounded text-gray-900 dark:text-gray-200">{value}</span>
                </div>
            )}
        </div>
    );
}
