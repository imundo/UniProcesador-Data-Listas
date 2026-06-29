"use client";

import { useState, useEffect } from "react";
import Link from 'next/link';

export default function StateHistoryPage() {
    const [events, setEvents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchEvents();
    }, []);

    const fetchEvents = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/state-history?limit=200");
            const data = await res.json();
            if (Array.isArray(data)) {
                setEvents(data);
            }
        } catch (e) {
            console.error("Error fetching state history:", e);
        } finally {
            setIsLoading(false);
        }
    };

    const formatDate = (isoString) => {
        const d = new Date(isoString);
        return d.toLocaleDateString('es-VE', { 
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div className="min-h-screen bg-neutral-950 text-white font-sans p-8">
            <div className="max-w-5xl mx-auto space-y-6">
                
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                            Historial de Estados (Observador)
                        </h1>
                        <p className="text-neutral-400 mt-2">
                            Registro automático de personas que han cambiado de estado (ej: de Desaparecido a Encontrado) en cualquier plataforma.
                        </p>
                    </div>
                    <Link href="/admin" className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors text-sm font-semibold">
                        Volver al Panel
                    </Link>
                </div>

                {/* Content */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl">
                    <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/50">
                        <h2 className="font-semibold text-neutral-200">Últimos Cambios de Estado</h2>
                        <button 
                            onClick={fetchEvents}
                            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                        >
                            Refrescar
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-neutral-300">
                            <thead className="bg-neutral-950/90 text-neutral-400 uppercase font-semibold text-xs">
                                <tr>
                                    <th className="px-6 py-4">Fecha</th>
                                    <th className="px-6 py-4">Persona</th>
                                    <th className="px-6 py-4">Cédula</th>
                                    <th className="px-6 py-4">Estado Anterior</th>
                                    <th className="px-6 py-4">Nuevo Estado</th>
                                    <th className="px-6 py-4">Origen</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-800/50">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-12 text-center text-neutral-500">
                                            Cargando historial...
                                        </td>
                                    </tr>
                                ) : events.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-12 text-center text-neutral-500">
                                            No se han detectado cambios de estado recientes.
                                        </td>
                                    </tr>
                                ) : (
                                    events.map((ev) => (
                                        <tr key={ev.id} className="hover:bg-white/5 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap text-xs text-neutral-400">
                                                {formatDate(ev.fecha)}
                                            </td>
                                            <td className="px-6 py-4 font-medium text-white">
                                                {ev.nombre_completo}
                                            </td>
                                            <td className="px-6 py-4 font-mono text-xs text-neutral-400">
                                                {ev.cedula || 'N/A'}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="px-2 py-1 rounded-md bg-neutral-800 text-neutral-300 text-xs font-semibold uppercase">
                                                    {ev.estado_anterior || 'Desconocido'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-semibold uppercase flex inline-flex items-center gap-1">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                                                    {ev.estado_nuevo}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="px-2 py-1 rounded-md bg-blue-500/10 text-blue-400 text-[10px] font-bold uppercase tracking-wider">
                                                    {ev.tipo_registro === 'local' ? 'Base Local' : 'Portales Externos'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
