'use client';

import { useState } from 'react';
import Head from 'next/head';

export default function BuscarPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query || query.trim().length < 3) return;

    setIsSearching(true);
    setHasSearched(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
      } else {
        setResults([]);
      }
    } catch (err) {
      console.error("Error searching:", err);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-blue-500/30 relative overflow-hidden flex flex-col items-center">
      <Head>
        <title>Búsqueda Unificada de Personas - Venezuela</title>
      </Head>

      {/* Decorative Background */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-900/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-emerald-900/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Header */}
      <div className="w-full max-w-3xl mt-12 px-6 flex flex-col items-center text-center z-10">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
          Buscador Unificado
        </h1>
        <p className="text-neutral-400 text-lg md:text-xl max-w-xl">
          Escribe el nombre o cédula. Buscamos simultáneamente en bases de datos de hospitales, refugios y más de 10 ONGs.
        </p>
      </div>

      {/* Search Bar */}
      <div className="w-full max-w-3xl px-6 mt-10 z-10">
        <form onSubmit={handleSearch} className="relative w-full group">
          <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
            <svg className="w-6 h-6 text-neutral-400 group-focus-within:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            className="w-full pl-14 pr-32 py-5 bg-neutral-900/60 backdrop-blur-xl border border-neutral-800 rounded-2xl text-xl md:text-2xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-2xl"
            placeholder="Ej. José García o 12345678"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isSearching}
          />
          <button
            type="submit"
            disabled={isSearching || query.length < 3}
            className="absolute right-3 top-3 bottom-3 px-6 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-bold rounded-xl transition-colors flex items-center"
          >
            {isSearching ? (
              <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              'Buscar'
            )}
          </button>
        </form>
      </div>

      {/* Results Section */}
      <div className="w-full max-w-3xl px-6 mt-12 mb-20 z-10 flex flex-col gap-4">
        {hasSearched && !isSearching && results.length === 0 && (
          <div className="text-center p-12 bg-neutral-900/40 rounded-3xl border border-neutral-800/50 backdrop-blur-md">
            <p className="text-neutral-400 text-lg">No encontramos resultados para "{query}".</p>
            <p className="text-neutral-500 mt-2 text-sm">Verifica la ortografía o intenta buscar solo por un apellido.</p>
          </div>
        )}

        {results.map((person, idx) => {
          let sourcesArray = person.sources || [{ name: person.source, url: person.sourceUrl }];
          sourcesArray = sourcesArray.filter(s => s.name && !s.name.toLowerCase().includes('nodoayuda'));
          if (sourcesArray.length === 0 && person.source) sourcesArray = [{ name: person.source, url: person.sourceUrl }];
          
          const isDuplicated = sourcesArray.length > 1;
          const isRescatado = person.estado && person.estado.toLowerCase().includes('rescatado');
          const isDesaparecido = person.estado && (person.estado.toLowerCase().includes('desaparecido') || person.estado.toLowerCase().includes('incompleto'));
          
          const borderClass = person.cne_validado === 1 ? 'border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.15)] bg-emerald-950/20 hover:bg-emerald-950/30' : 
                              person.cne_validado === 2 ? 'border-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.15)] bg-yellow-950/20 hover:bg-yellow-950/30' : 
                              'bg-neutral-900/60 border-neutral-800 hover:bg-neutral-800/80 hover:border-neutral-700';

          return (
            <div key={idx} className={`backdrop-blur-md rounded-3xl p-6 transition-all duration-300 transform hover:scale-[1.01] border ${borderClass}`}>
              
              <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                {/* Person Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <h2 className="text-2xl font-bold text-white uppercase tracking-wide">
                      {person.nombre} {person.apellido}
                    </h2>
                    {person.cne_validado === 1 && (
                      <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs px-2.5 py-1 rounded-full flex items-center font-bold uppercase tracking-wider">
                        <svg className="w-3.5 h-3.5 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg>
                        CI VERIFICADA
                      </span>
                    )}
                    {person.cne_validado === 2 && (
                      <span className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-xs px-2.5 py-1 rounded-full flex items-center font-bold uppercase tracking-wider">
                        <svg className="w-3.5 h-3.5 mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"></path></svg>
                        CI PARCIAL
                      </span>
                    )}
                  </div>
                  
                  {person.cedula && (
                    <div className="text-neutral-400 text-lg mb-3 flex items-center font-mono">
                      <svg className="w-5 h-5 mr-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" /></svg>
                      CI: {person.cedula.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.')}
                    </div>
                  )}

                  {(person.centro || person.edad_sector) && (
                    <div className="flex flex-col gap-2 mt-4">
                      {person.centro && (
                        <div className="flex items-start text-blue-300 bg-blue-950/30 p-3 rounded-xl border border-blue-900/50">
                          <svg className="w-5 h-5 mr-3 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          <span className="leading-snug">{person.centro}</span>
                        </div>
                      )}
                      
                      {person.edad_sector && (
                        <div className="flex items-start text-neutral-300 bg-neutral-800/30 p-3 rounded-xl border border-neutral-700/50">
                          <svg className="w-5 h-5 mr-3 shrink-0 mt-0.5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          <span className="leading-snug text-sm">{person.edad_sector}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Status & Tags */}
                <div className="flex flex-col items-end gap-3 w-full md:w-auto shrink-0 mt-4 md:mt-0 pt-4 md:pt-0 border-t border-neutral-800 md:border-t-0">
                  {person.estado && (
                    <div className={`w-full md:w-auto text-center md:text-right px-4 py-2 rounded-xl border font-bold uppercase tracking-wider text-sm ${
                      isRescatado ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800/50' : 
                      isDesaparecido ? 'bg-red-950/50 text-red-400 border-red-800/50' : 
                      'bg-neutral-800 text-neutral-300 border-neutral-700'
                    }`}>
                      {person.estado}
                    </div>
                  )}

                  {isDuplicated && (
                    <div className="w-full md:w-auto text-center md:text-right bg-orange-950/30 text-orange-400 border border-orange-900/50 px-3 py-1.5 rounded-lg text-xs font-semibold">
                      VERIFICADO POR {sourcesArray.length} FUENTES
                    </div>
                  )}

                  {person.last_reencuentro_sync && (
                    <div className="w-full md:w-auto text-center md:text-right bg-blue-950/30 text-blue-400 border border-blue-900/50 px-3 py-1.5 rounded-lg text-[10px] font-mono mt-1">
                      SINC. REENCUENTRO: {new Date(person.last_reencuentro_sync + 'Z').toLocaleString('es-VE')}
                    </div>
                  )}
                </div>
              </div>

              {/* Metadata Tags */}
              {person.metadata && typeof person.metadata === 'object' && Object.keys(person.metadata).length > 0 && (
                <div className="mt-4 pt-4 flex flex-wrap gap-2 border-t border-neutral-800/60">
                  {Object.entries(person.metadata).map(([key, value]) => {
                    // Ignorar campos ruidosos o internos comunes
                    const ignoreKeys = ['id', 'created_at', 'updated_at', 'nombre', 'apellido', 'nombres', 'apellidos', 'cedula', 'ci', 'estado', 'status', 'centro', 'hospital', 'location', 'edad_sector', 'descripcion', 'tipo'];
                    if (ignoreKeys.includes(key.toLowerCase()) || !value || typeof value === 'object' || value.toString().trim() === '') return null;
                    
                    const strValue = value.toString();
                    const isImageUrl = strValue.match(/\.(jpeg|jpg|gif|png|webp|bmp)$/i) || strValue.includes('s3.') || key.toLowerCase().includes('foto');

                    if (isImageUrl) {
                      return (
                        <div key={key} className="w-full sm:w-auto flex flex-col gap-1.5 p-2 bg-neutral-950/50 border border-neutral-800 rounded-lg">
                          <span className="opacity-60 text-[10px] font-bold uppercase tracking-wider">{key.replace(/_/g, ' ')}</span>
                          <img src={strValue} alt={key} className="max-h-40 max-w-full rounded-md object-contain border border-neutral-800/50" onError={(e) => { e.target.style.display = 'none'; }} />
                        </div>
                      );
                    }

                    return (
                      <span key={key} className="inline-flex items-center bg-blue-950/20 text-blue-300 border border-blue-900/30 px-2 py-1 rounded text-[11px] font-medium tracking-wide">
                        <span className="opacity-70 mr-1 capitalize">{key.replace(/_/g, ' ')}:</span> 
                        {strValue}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Sources List */}
              <div className="mt-6 pt-4 border-t border-neutral-800/60 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest shrink-0 mr-1">Visto en:</span>
                {sourcesArray.map((src, i) => (
                  <a 
                    key={i} 
                    href={src.url && src.url !== '#' ? src.url : '#'} 
                    target={src.url && src.url !== '#' ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className={`shrink-0 text-xs px-2.5 py-1 rounded border font-medium flex items-center transition-colors ${
                      src.url && src.url !== '#' 
                        ? 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700 hover:text-white'
                        : 'bg-neutral-900 text-neutral-500 border-neutral-800 cursor-default'
                    }`}
                  >
                    {src.name}
                    {src.url && src.url !== '#' && (
                      <svg className="w-3 h-3 ml-1.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    )}
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
