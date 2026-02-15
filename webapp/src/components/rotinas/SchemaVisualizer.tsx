"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ROUTINE_SCHEMA } from './RoutineSchema';
import { PlusIcon, CloseLineIcon } from '@/icons';
// Note: We'll use a minus icon manually or import if available, for now simple text or reusing close as 'remove' style if needed, 
// but standard zoom controls usually need plus/minus. I'll create simple buttons.

interface Position {
    x: number;
    y: number;
}

interface DragState {
    type: 'TABLE' | 'CANVAS';
    id?: string; // tableName if type is TABLE
    startX: number;
    startY: number;
    originalX: number;
    originalY: number;
}

export function SchemaVisualizer() {
    // Canvas State
    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState<Position>({ x: 0, y: 0 });

    // Table Positions
    const [positions, setPositions] = useState<Record<string, Position>>({
        PESPessoa: { x: 50, y: 250 },
        MATMatricula: { x: 450, y: 250 },
        REGRegistroPassagem: { x: 450, y: 600 },
        EQPEquipamento: { x: 50, y: 600 },
    });

    const [dragging, setDragging] = useState<DragState | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const TABLE_WIDTH = 260;
    const HEADER_HEIGHT = 44;
    const ROW_HEIGHT = 28; // Increased slightly for readability

    const getTableHeight = useCallback((tableName: string) => {
        const table = ROUTINE_SCHEMA.find(t => t.name === tableName);
        return HEADER_HEIGHT + (table?.fields.length || 0) * ROW_HEIGHT + 16;
    }, []);

    // --- Event Handlers ---

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const ZOOM_SENSITIVITY = 0.001;
            const delta = -e.deltaY * ZOOM_SENSITIVITY;
            const newScale = Math.min(Math.max(0.5, scale + delta), 2);
            setScale(newScale);
        }
    };

    const handleMouseDownCanvas = (e: React.MouseEvent) => {
        // Allow panning on any click that bubbles up (background, svg, transform container)
        // We rely on stopPropagation in children to prevent this for tables/controls
        setDragging({
            type: 'CANVAS',
            startX: e.clientX,
            startY: e.clientY,
            originalX: pan.x,
            originalY: pan.y,
        });
    };

    const handleMouseDownTable = (e: React.MouseEvent, tableName: string) => {
        e.stopPropagation(); // Explicitly stop propagation to prevent canvas pan
        const pos = positions[tableName];
        setDragging({
            type: 'TABLE',
            id: tableName,
            startX: e.clientX,
            startY: e.clientY,
            originalX: pos.x,
            originalY: pos.y,
        });
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!dragging) return;

        const deltaX = e.clientX - dragging.startX;
        const deltaY = e.clientY - dragging.startY;

        if (dragging.type === 'CANVAS') {
            setPan({
                x: dragging.originalX + deltaX,
                y: dragging.originalY + deltaY,
            });
        } else if (dragging.type === 'TABLE' && dragging.id) {
            // Apply scale correction for table movement
            setPositions(prev => ({
                ...prev,
                [dragging.id!]: {
                    x: dragging.originalX + (deltaX / scale),
                    y: dragging.originalY + (deltaY / scale),
                }
            }));
        }
    }, [dragging, scale]);

    const handleMouseUp = useCallback(() => {
        setDragging(null);
    }, []);

    useEffect(() => {
        if (dragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragging, handleMouseMove, handleMouseUp]);

    // --- Helpers ---

    const getFieldPosition = (tableName: string, fieldName: string | undefined) => {
        const pos = positions[tableName];
        const table = ROUTINE_SCHEMA.find(t => t.name === tableName);
        if (!pos || !table) return null;

        const fieldIndex = table.fields.findIndex(f => f.name === fieldName);
        if (fieldIndex === -1 && fieldName) return null;

        // If no field name (linking to table generally), go to header center
        // If field name, go to field row vertical center
        const yOffset = fieldName
            ? HEADER_HEIGHT + (fieldIndex * ROW_HEIGHT) + (ROW_HEIGHT / 2)
            : HEADER_HEIGHT / 2;

        return {
            x: pos.x,
            y: pos.y + yOffset,
            width: TABLE_WIDTH,
            right: pos.x + TABLE_WIDTH
        };
    };

    const getOrthogonalPath = (fromTable: string, fromField: string, toTable: string) => {
        const from = getFieldPosition(fromTable, fromField);
        // Find PK of target table for the connection
        const targetTableSchema = ROUTINE_SCHEMA.find(t => t.name === toTable);
        const targetPk = targetTableSchema?.fields.find(f => f.pk)?.name;
        const to = getFieldPosition(toTable, targetPk);

        if (!from || !to) return null;

        // Check for horizontal overlap to decide between "S" (side-to-side) or "C" (Vertical stack) shape
        const isHorizontalOverlap = (from.x < to.right && from.right > to.x);

        if (isHorizontalOverlap) {
            // Vertical stacking - use a "C" shape connection on the right side
            // This prevents lines cutting through tables
            const startX = from.right;
            const endX = to.right;
            const controlX = Math.max(startX, endX) + 40; // Margin to the right

            return `M ${startX} ${from.y} L ${controlX} ${from.y} L ${controlX} ${to.y} L ${endX} ${to.y}`;
        } else {
            // Side-by-side - use "S" or "Z" shape (Horizontal -> Vertical -> Horizontal)
            let startX, endX;

            // If target is to the right
            if (to.x > from.x) {
                startX = from.right;
                endX = to.x;
            } else {
                startX = from.x;
                endX = to.right;
            }

            const midX = (startX + endX) / 2;
            return `M ${startX} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${endX} ${to.y}`;
        }
    };

    // --- Fit to Screen ---
    const handleFitToScreen = () => {
        if (!containerRef.current) return;

        // 1. Calculate Bounding Box of all tables
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        Object.keys(positions).forEach(key => {
            const pos = positions[key];
            const height = getTableHeight(key);
            minX = Math.min(minX, pos.x);
            minY = Math.min(minY, pos.y);
            maxX = Math.max(maxX, pos.x + TABLE_WIDTH);
            maxY = Math.max(maxY, pos.y + height);
        });

        // Add padding
        const PADDING = 50;
        const contentWidth = maxX - minX + (PADDING * 2);
        const contentHeight = maxY - minY + (PADDING * 2);

        // 2. Get Container Dimensions
        const { width: containerWidth, height: containerHeight } = containerRef.current.getBoundingClientRect();

        // 3. Calculate Scale to fit
        const scaleX = containerWidth / contentWidth;
        const scaleY = containerHeight / contentHeight;
        const newScale = Math.min(scaleX, scaleY, 1); // Don't zoom in more than 100% just to fit

        // 4. Calculate Pan to center
        // Center of content
        const contentCenterX = minX + (maxX - minX) / 2;
        const contentCenterY = minY + (maxY - minY) / 2;

        // Target center (center of container)
        // We need to apply the reverse transform logic:
        // desiredPan = (containerCenter - contentCenter * newScale)
        const newPanX = (containerWidth / 2) - (contentCenterX * newScale);
        const newPanY = (containerHeight / 2) - (contentCenterY * newScale);

        setScale(newScale);
        setPan({ x: newPanX, y: newPanY });
    };

    return (
        <div
            ref={containerRef}
            className="w-full h-full overflow-hidden bg-slate-100 dark:bg-slate-950 relative select-none cursor-move"
            onWheel={handleWheel}
            onMouseDown={handleMouseDownCanvas}
        >
            {/* Grid Pattern Background */}
            <div
                className="absolute inset-0 opacity-10 pointer-events-none"
                style={{
                    backgroundImage: `radial-gradient(circle, #888 1px, transparent 1px)`,
                    backgroundSize: `${20 * scale}px ${20 * scale}px`,
                    backgroundPosition: `${pan.x}px ${pan.y}px`
                }}
            />

            {/* Transform Container */}
            <div
                style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                    transformOrigin: '0 0',
                    width: '100%',
                    height: '100%',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                }}
            >
                {/* Lines Layer - Using overflow visible to draw anywhere */}
                <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-0 overflow-visible">
                    <defs>
                        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
                        </marker>
                    </defs>

                    {ROUTINE_SCHEMA.map(table => table.fields.filter(f => f.fk).map(field => {
                        const d = getOrthogonalPath(table.name, field.name, field.fk!);
                        if (!d) return null;
                        return (
                            <path
                                key={`${table.name}-${field.fk}`}
                                d={d}
                                stroke="#94a3b8"
                                strokeWidth="2"
                                fill="none"
                                markerEnd="url(#arrowhead)"
                            />
                        );
                    }))}
                </svg>

                {ROUTINE_SCHEMA.map((table) => {
                    const pos = positions[table.name];
                    if (!pos) return null;
                    const isDragging = dragging?.id === table.name;

                    return (
                        <div
                            key={table.name}
                            style={{
                                transform: `translate(${pos.x}px, ${pos.y}px)`,
                                width: TABLE_WIDTH,
                            }}
                            onMouseDown={(e) => handleMouseDownTable(e, table.name)}
                            className={`absolute flex flex-col bg-white dark:bg-gray-900 border rounded-xl shadow-xl z-20 transition-shadow cursor-grab active:cursor-grabbing ${isDragging ? 'shadow-2xl ring-2 ring-indigo-500 border-indigo-500 z-30' : 'border-gray-200 dark:border-gray-800'}`}
                        >
                            {/* Header */}
                            <div
                                className="bg-gray-50 dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-700 p-3 rounded-t-xl flex justify-between items-center group"
                            >
                                <span className="font-bold text-gray-800 dark:text-gray-100 text-sm truncate">{table.alias}</span>
                                <span className="text-[10px] text-gray-400 font-mono opacity-0 group-hover:opacity-100 transition-opacity">{table.name}</span>
                            </div>

                            {/* Fields */}
                            <div className="p-2">
                                {table.fields.map(field => (
                                    <div key={field.name} className="flex justify-between items-center py-1 px-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded text-xs">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            {field.pk && <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-yellow-500" title="PK" />}
                                            {field.fk && <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-500" title="FK" />}
                                            {!field.pk && !field.fk && <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-700" />}
                                            <span className="font-mono text-gray-600 dark:text-gray-300 truncate">{field.name}</span>
                                        </div>
                                        <span className="text-gray-400 text-[10px] ml-2 flex-shrink-0">{field.type}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Controls */}
            <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-50">
                <button
                    onClick={() => setScale(s => Math.min(s + 0.1, 2))}
                    className="w-8 h-8 flex items-center justify-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold"
                    title="Zoom In"
                >
                    +
                </button>
                <div className="w-8 h-8 flex items-center justify-center bg-white/50 dark:bg-gray-900/50 text-[10px] border border-transparent font-mono text-gray-500">
                    {Math.round(scale * 100)}%
                </div>
                <button
                    onClick={() => setScale(s => Math.max(s - 0.1, 0.5))}
                    className="w-8 h-8 flex items-center justify-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold"
                    title="Zoom Out"
                >
                    -
                </button>

                <div className="h-2"></div> {/* Spacer */}

                <button
                    onClick={handleFitToScreen}
                    className="w-8 h-8 flex items-center justify-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                    title="Enquadrar (Fit to Screen)"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="5 9 2 9 2 15 5 15"></polyline>
                        <polyline points="9 5 9 2 15 2 15 5"></polyline>
                        <polyline points="19 9 22 9 22 15 19 15"></polyline>
                        <polyline points="9 19 9 22 15 22 15 19"></polyline>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                </button>
            </div>
        </div>
    );
}
