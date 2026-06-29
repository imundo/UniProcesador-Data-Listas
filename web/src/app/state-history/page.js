"use client";

import { useState, useEffect, useMemo } from "react";
import Link from 'next/link';

const SEARCH_SOURCES = [
  "🌐 Sincronizando con HospitalesEnVenezuela.com...",
  "🌐 Revisando RedSolidariaVenezuela.com...",
  "🌐 Analizando DesaparecidosTerremotoVenezuela...",
  "🌐 Extrayendo de RedAyudaVenezuela.com...",
  "🌐 Escaneando DesaparecidosVenezuela.com...",
  "🌐 Consultando Reencuentro.help...",
  "🌐 Buscando en SOSVenezuela2026.com...",
  "🌐 Conectando con NodoAyuda.com...",
  "⚙️ Procesando motor de desduplicación de estados..."
];

function MultiSourceLoader() {
  const [sourceIdx, setSourceIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSourceIdx((prev) => (prev + 1) % SEARCH_SOURCES.length);
    }, 1800); // Cambia cada 1.8 segundos
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col gap-2 mt-4">
      <div className="flex items-center gap-3">
        <div className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
        </div>
        <span className="text-sm font-medium text-emerald-400 font-mono">
          {SEARCH_SOURCES[sourceIdx]}
        </span>
      </div>
      <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
        <div className="bg-emerald-500 h-1.5 rounded-full w-1/3 animate-[pulse_1s_ease-in-out_infinite] blur-[1px]"></div>
      </div>
    </div>
  );
}

export default function StateHistoryPage() {
    const [events, setEvents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    useEffect(() => {
        fetchEvents();
    }, []);

    const fetchEvents = async () => {
        setIsLoading(true);
        try {
            const res = await fetch("/api/state-history?limit=1000"); // Ampliamos limite para buscador local
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

    const filteredEvents = useMemo(() => {
        if (!searchTerm.trim()) return events;
        const lower = searchTerm.toLowerCase();
        return events.filter(e => 
            (e.nombre_completo || '').toLowerCase().includes(lower) || 
            (e.cedula || '').toLowerCase().includes(lower) ||
            (e.origen_nombre || '').toLowerCase().includes(lower)
        );
    }, [events, searchTerm]);

    const totalPages = Math.ceil(filteredEvents.length / itemsPerPage) || 1;
    const currentEvents = filteredEvents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    return (
        <div className="min-h-screen bg-neutral-950 text-white font-sans p-4 md:p-8 relative">
            {/* Background elements */}
            <div className="absolute top-0 left-0 w-full h-96 bg-blue-900/10 blur-[100px] pointer-events-none" />

            <div className="max-w-6xl mx-auto space-y-6 relative z-10">
                
                {/* Header with Sync Bar */}
                <div className="bg-neutral-900/80 backdrop-blur-md border border-neutral-800 rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="space-y-3 flex-1 text-center md:text-left">
                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                            <h1 className="text-3xl font-extrabold bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent">
                                Observador Global de Estados
                            </h1>
                            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                <span className="text-xs font-semibold text-emerald-400 tracking-wide">SINCRONIZACIÓN ACTIVA</span>
                            </div>
                        </div>
                        <p className="text-neutral-400 text-sm md:text-base max-w-2xl">
                            Este módulo rastrea continuamente en segundo plano todas las plataformas de ayuda. Si el estado de una persona cambia (ej: pasa de Desaparecido a Encontrado), se consolida y registra aquí automáticamente.
                        </p>
                        <MultiSourceLoader />
                    </div>
                    <div className="shrink-0 flex gap-3">
                        <Link href="/" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors text-sm font-bold shadow-lg shadow-blue-900/20 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                            Volver al Inicio
                        </Link>
                    </div>
                </div>

                {/* Content */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl">
                    
                    {/* Toolbar */}
                    <div className="p-4 border-b border-neutral-800 flex flex-col md:flex-row justify-between items-center bg-neutral-900/50 gap-4">
                        <div className="relative w-full md:w-96">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                            </div>
                            <input
                                type="text"
                                placeholder="Buscar por nombre, cédula u origen..."
                                value={searchTerm}
                                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                                className="w-full pl-10 pr-4 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all text-white placeholder-neutral-500"
                            />
                        </div>
                        <button 
                            onClick={fetchEvents}
                            className="w-full md:w-auto text-xs bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2.5 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                            Refrescar Datos
                        </button>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-neutral-300">
                            <thead className="bg-neutral-950/90 text-neutral-400 uppercase font-semibold text-xs tracking-wider">
                                <tr>
                                    <th className="px-6 py-4">Última Actualización</th>
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
                                        <td colSpan="6" className="px-6 py-12 text-center text-neutral-500 animate-pulse">
                                            Analizando registros recientes...
                                        </td>
                                    </tr>
                                ) : currentEvents.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-12 text-center text-neutral-500">
                                            No se han detectado cambios de estado recientes con ese criterio.
                                        </td>
                                    </tr>
                                ) : (
                                    currentEvents.map((ev) => (
                                        <tr key={ev.id} className="hover:bg-white/5 transition-colors group">
                                            <td className="px-6 py-4 whitespace-nowrap text-xs text-neutral-400 font-medium">
                                                {formatDate(ev.fecha)}
                                            </td>
                                            <td className="px-6 py-4 font-bold text-white group-hover:text-blue-400 transition-colors">
                                                {ev.nombre_completo}
                                            </td>
                                            <td className="px-6 py-4 font-mono text-xs text-neutral-400">
                                                {ev.cedula || 'N/A'}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="px-2.5 py-1 rounded-md bg-neutral-800 text-neutral-400 border border-neutral-700 text-[10px] font-bold uppercase tracking-wider">
                                                    {ev.estado_anterior || 'Desconocido'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                                                    {ev.estado_nuevo}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                {ev.origen_url ? (
                                                    <a href={ev.origen_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold uppercase tracking-wider hover:bg-blue-500/20 transition-colors">
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                                                        {ev.origen_nombre || ev.tipo_registro}
                                                    </a>
                                                ) : (
                                                    <span className="px-2.5 py-1 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] font-bold uppercase tracking-wider">
                                                        {ev.origen_nombre || (ev.tipo_registro === 'local' ? 'Base Local' : 'Externo')}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    
                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="p-4 border-t border-neutral-800 bg-neutral-900/50 flex items-center justify-between">
                            <span className="text-xs text-neutral-400">
                                Mostrando {((currentPage - 1) * itemsPerPage) + 1} a {Math.min(currentPage * itemsPerPage, filteredEvents.length)} de {filteredEvents.length} resultados
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="p-1 rounded bg-neutral-800 text-neutral-400 disabled:opacity-50 hover:bg-neutral-700 hover:text-white transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
                                </button>
                                <span className="text-sm font-medium px-2">{currentPage} / {totalPages}</span>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="p-1 rounded bg-neutral-800 text-neutral-400 disabled:opacity-50 hover:bg-neutral-700 hover:text-white transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
