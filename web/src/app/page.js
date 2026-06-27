"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from 'next/dynamic';

const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => <div className="w-full h-[500px] rounded-3xl bg-neutral-900 border border-neutral-800 animate-pulse"></div>
});

export default function Home() {
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);

  const [globalPreview, setGlobalPreview] = useState(null);
  const [isFetchingGlobal, setIsFetchingGlobal] = useState(false);
  const [showGlobalPreview, setShowGlobalPreview] = useState(false);

  const [batchPreview, setBatchPreview] = useState(null);
  const [isFetchingBatch, setIsFetchingBatch] = useState(false);
  const [showBatchPreview, setShowBatchPreview] = useState(false);

  const [isUploadingToPortal, setIsUploadingToPortal] = useState(false);
  const [portalResponse, setPortalResponse] = useState(null);

  const [massCentroValue, setMassCentroValue] = useState("");
  const [isUpdatingCentro, setIsUpdatingCentro] = useState(false);
  const [massSectorValue, setMassSectorValue] = useState("");
  const [isUpdatingSector, setIsUpdatingSector] = useState(false);

  const [hospitals, setHospitals] = useState([]);

  const [localSearch, setLocalSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [batchSearch, setBatchSearch] = useState("");

  // Pagination States
  const [localPage, setLocalPage] = useState(1);
  const [globalPage, setGlobalPage] = useState(1);
  const [batchPage, setBatchPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  const itemsPerPage = 100;
  const historyItemsPerPage = 10;

  // Emergency Search States
  const [emergencySearchQuery, setEmergencySearchQuery] = useState("");
  const [emergencySearchResults, setEmergencySearchResults] = useState([]);
  const [isEmergencySearching, setIsEmergencySearching] = useState(false);

  const fileInputRef = useRef(null);

  const fetchGlobalPreview = async () => {
    setIsFetchingGlobal(true);
    try {
      const res = await fetch("/api/global");
      const data = await res.json();
      setGlobalPreview(data);
      setShowGlobalPreview(true);
      setGlobalPage(1); // Reset page on open
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetchingGlobal(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/history");
      const data = await res.json();
      setHistory(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchHospitals = async () => {
    try {
      const res = await fetch("/api/hospitals");
      const data = await res.json();
      setHospitals(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchBatchPreview = async (batchId) => {
    setIsFetchingBatch(true);
    try {
      const res = await fetch(`/api/batch?id=${batchId}`);
      const data = await res.json();
      setBatchPreview(data);
      setShowBatchPreview(true);
      setBatchPage(1); // Reset page on open
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetchingBatch(false);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (emergencySearchQuery.trim().length >= 3) {
        setIsEmergencySearching(true);
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(emergencySearchQuery)}`);
          const data = await res.json();
          setEmergencySearchResults(data);
        } catch(e) {
          console.error(e);
        } finally {
          setIsEmergencySearching(false);
        }
      } else {
        setEmergencySearchResults([]);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [emergencySearchQuery]);


  useEffect(() => {
    fetchHistory();
    fetchHospitals();
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleMassUpdate = async (type) => {
    const value = type === 'centro' ? massCentroValue : massSectorValue;
    if (!value.trim() || !stats?.batchId) return;

    if (type === 'centro') setIsUpdatingCentro(true);
    else setIsUpdatingSector(true);

    try {
      // Actúa como caché: solo actualizamos el estado local
      const updatedPacientes = stats.nuevosPacientes.map(p => {
        let newEdadSector = value;
        if (type === 'sector' && p.edad_sector) {
          const parts = p.edad_sector.split(' · ');
          if (parts.length > 1) {
            newEdadSector = `${parts[0]} · ${value}`;
          } else {
            if (p.edad_sector !== value) {
              newEdadSector = `${p.edad_sector} · ${value}`;
            }
          }
        }
        return {
          ...p,
          ...(type === 'centro' ? { centro: value } : { edad_sector: newEdadSector })
        };
      });
      setStats({ ...stats, nuevosPacientes: updatedPacientes });
      if (type === 'centro') setMassCentroValue("");
      else setMassSectorValue("");
    } catch (e) {
      console.error(e);
    } finally {
      if (type === 'centro') setIsUpdatingCentro(false);
      else setIsUpdatingSector(false);
    }
  };

  const handleFilesValidation = (newFiles) => {
    if (newFiles.length > 5) {
      alert("Solo puedes subir un máximo de 5 archivos a la vez.");
      return;
    }

    const validFiles = newFiles.filter(file => {
      if (file.size > 2 * 1024 * 1024) {
        alert(`El archivo ${file.name} supera el límite de 2MB.`);
        return false;
      }

      const validTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'application/pdf',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
        'application/vnd.ms-excel', // xls
        'text/csv', // csv
        'application/msword', // doc
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // docx
      ];
      // Also check extension as fallback for some OS
      const ext = file.name.toLowerCase().slice((file.name.lastIndexOf(".") - 1 >>> 0) + 2);
      const validExts = ['jpg', 'jpeg', 'png', 'pdf', 'xlsx', 'xls', 'csv', 'doc', 'docx'];

      if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
        alert(`El archivo ${file.name} no es válido. Solo se permiten PDFs, Imágenes y documentos de Office (Excel, Word, CSV).`);
        return false;
      }

      return true;
    });

    if (validFiles.length > 0) {
      setFiles(validFiles);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesValidation(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesValidation(Array.from(e.target.files));
    }
  };

  const processFiles = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setStats(null);
    setLocalPage(1); // Reset local page

    const formData = new FormData();
    files.forEach(file => {
      formData.append("files", file);
    });

    try {
      const response = await fetch("/api/process", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      setStats(data);
      setFiles([]); // Clear selection
    } catch (error) {
      console.error("Error al procesar", error);
      alert("Hubo un error procesando los archivos.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUploadToPortal = async (batchId = null, global = false) => {
    setIsUploadingToPortal(true);
    try {
      const payload = { batchId, global };
      // Si no es global, enviamos los pacientes cacheados localmente para que se guarden y suban
      if (!global && stats) {
        payload.pacientes = stats.nuevosPacientes || [];
        payload.stats = stats;
      }
      const response = await fetch("/api/uploadToPortal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Error desconocido");
      setPortalResponse(data);

      // Ya se guardaron en BD, refrescamos el historial
      fetchHistory();
      fetchHospitals();

      // Opcional: podríamos limpiar el preview (stats) aquí, pero dejarlo visible con el portalResponse está bien
    } catch (error) {
      console.error("Error subiendo al portal:", error);
      alert(`Error al enviar los datos al portal: ${error.message}`);
    } finally {
      setIsUploadingToPortal(false);
    }
  };

  // Pagination Logic Helpers
  const renderPagination = (currentPage, totalItems, setPageFunc) => {
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    return (
      <div className="flex items-center justify-between px-4 py-3 bg-neutral-900/80 border-t border-neutral-700">
        <div className="text-xs text-neutral-400">
          Mostrando {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, totalItems)} de {totalItems} registros
        </div>
        <div className="flex gap-2">
          <button
            disabled={currentPage === 1}
            onClick={() => setPageFunc(currentPage - 1)}
            className="px-3 py-1 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-medium"
          >
            Anterior
          </button>
          <span className="px-3 py-1 text-xs font-medium text-neutral-400">
            Página {currentPage} de {totalPages}
          </span>
          <button
            disabled={currentPage === totalPages}
            onClick={() => setPageFunc(currentPage + 1)}
            className="px-3 py-1 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-medium"
          >
            Siguiente
          </button>
        </div>
      </div>
    );
  };

  // Data Filtering
  const localFiltered = stats?.nuevosPacientes?.filter(p =>
    `${p.nombre} ${p.apellido} ${p.cedula} ${p.centro}`.toLowerCase().includes(localSearch.toLowerCase())
  ) || [];
  const localCurrent = localFiltered.slice((localPage - 1) * itemsPerPage, localPage * itemsPerPage);

  const globalFiltered = globalPreview?.pacientes?.filter(p =>
    `${p.nombre} ${p.apellido} ${p.cedula} ${p.centro}`.toLowerCase().includes(globalSearch.toLowerCase())
  ) || [];
  const globalCurrent = globalFiltered.slice((globalPage - 1) * itemsPerPage, globalPage * itemsPerPage);

  const batchFiltered = batchPreview?.nuevosPacientes?.filter(p =>
    `${p.nombre} ${p.apellido} ${p.cedula} ${p.centro}`.toLowerCase().includes(batchSearch.toLowerCase())
  ) || [];
  const batchCurrent = batchFiltered.slice((batchPage - 1) * itemsPerPage, batchPage * itemsPerPage);

  const historyCurrent = history.slice((historyPage - 1) * historyItemsPerPage, historyPage * historyItemsPerPage);

  // Dashboard Metrics
  const totalPacientesLeidos = history.reduce((acc, curr) => acc + (curr.newPatients || 0), 0);
  const totalArchivosProcesados = history.reduce((acc, curr) => acc + (curr.filesUploaded || 0), 0);
  const totalCentros = hospitals.length;

  return (
    <div
      className="min-h-screen text-white font-sans flex flex-col items-center relative"
      style={{ backgroundImage: "url('/venezuela-bg.png')", backgroundSize: 'cover', backgroundAttachment: 'fixed', backgroundPosition: 'center' }}
    >
      <div className="absolute inset-0 bg-neutral-950/85 backdrop-blur-[2px] z-0" />

      <div className="w-full max-w-4xl flex flex-col gap-8 p-8 relative z-10">

        {/* Header */}
        <header className="text-center space-y-4">
          <div className="inline-flex items-center justify-center p-3 bg-blue-500/10 rounded-2xl mb-2">
            <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">Unificar Lista para Hospitales</h1>
          <p className="text-neutral-400 max-w-2xl mx-auto">
            Sube tus imágenes, videos y PDFs médicos. Nuestra IA extraerá automáticamente la información y la consolidará en una sola base de datos unificada sin duplicados. Con formato para ser subidos a portales como <a href="https://hospitalesenvenezuela.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors">https://hospitalesenvenezuela.com/</a>
          </p>
        </header>

        {/* Dashboard Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
          <div className="bg-neutral-900/60 backdrop-blur-md border border-neutral-800/50 rounded-2xl p-5 flex flex-col items-center text-center group hover:bg-neutral-800/60 transition-colors">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl mb-3 group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider mb-1">Pacientes Leídos</p>
            <p className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">{totalPacientesLeidos.toLocaleString()}</p>
          </div>

          <div className="bg-neutral-900/60 backdrop-blur-md border border-neutral-800/50 rounded-2xl p-5 flex flex-col items-center text-center group hover:bg-neutral-800/60 transition-colors">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl mb-3 group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            </div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider mb-1">Sincronizados</p>
            <p className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">{totalPacientesLeidos.toLocaleString()}</p>
          </div>

          <div className="bg-neutral-900/60 backdrop-blur-md border border-neutral-800/50 rounded-2xl p-5 flex flex-col items-center text-center group hover:bg-neutral-800/60 transition-colors">
            <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl mb-3 group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
            </div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider mb-1">Centros Únicos</p>
            <p className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">{totalCentros.toLocaleString()}</p>
          </div>

          <div className="bg-neutral-900/60 backdrop-blur-md border border-neutral-800/50 rounded-2xl p-5 flex flex-col items-center text-center group hover:bg-neutral-800/60 transition-colors">
            <div className="p-2 bg-orange-500/10 text-orange-400 rounded-xl mb-3 group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            </div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider mb-1">Archivos Procesados</p>
            <p className="text-3xl font-bold bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">{totalArchivosProcesados.toLocaleString()}</p>
          </div>
        </div>

        {/* Emergency Search Bar */}
        <div className="w-full flex flex-col gap-3 relative z-20">
          <div className="relative w-full group">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl blur opacity-25 group-hover:opacity-50 transition-opacity"></div>
            <div className="relative flex items-center bg-neutral-900/90 backdrop-blur-xl border border-neutral-700 rounded-2xl p-2 focus-within:border-blue-500 transition-colors">
              <div className="pl-4 pr-3 text-neutral-400">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              </div>
              <input
                type="text"
                placeholder="Busca fácilmente a tu ser querido por nombre o cédula 💙"
                className="w-full bg-transparent text-lg text-white font-medium focus:outline-none placeholder-neutral-500 py-3"
                value={emergencySearchQuery}
                onChange={(e) => setEmergencySearchQuery(e.target.value)}
              />
              {isEmergencySearching && (
                <div className="pr-4">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>
          </div>

          {/* Search Results */}
          {emergencySearchResults.length > 0 && (
            <div className="flex flex-col gap-3 w-full">
              {emergencySearchResults.map((person, idx) => {
                const isExternal = !!person.sourceUrl;
                const badgeColor = person.source === 'HospitalesEnVenezuela.com' ? 'bg-blue-500/20 text-blue-400' :
                                   person.source === 'RedSolidariaVenezuela.com' ? 'bg-red-500/20 text-red-400' :
                                   person.source === 'DesaparecidosTerremotoVenezuela.com' ? 'bg-purple-500/20 text-purple-400' :
                                   'bg-emerald-500/20 text-emerald-400';
                                   
                const shareText = encodeURIComponent(`🚨 PERSONA LOCALIZADA\nNombre: ${person.nombre} ${person.apellido}\nCédula: ${person.cedula}\nUbicación: ${person.centro}\n${person.edad_sector ? `Sector/Nota: ${person.edad_sector}\n` : ''}Fuente: ${person.source}`);
                
                return (
                  <div key={idx} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-neutral-700 transition-colors">
                    <div className="flex-1">
                      <h4 className="text-lg font-bold text-white">{person.nombre} {person.apellido}</h4>
                      <p className="text-neutral-400 text-sm font-mono mt-1">CI: {person.cedula}</p>
                      <p className="text-blue-400 font-medium text-sm mt-1 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        {person.centro}
                      </p>
                    </div>
                    
                    <div className="flex flex-col items-start sm:items-end gap-3 w-full sm:w-auto">
                      <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-full ${badgeColor}`}>
                          {isExternal ? '🌐 ' : '🏢 '} {person.source}
                      </span>
                      <a
                        href={`https://wa.me/?text=${shareText}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-[#25D366] hover:bg-[#20bd5a] text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors w-full justify-center"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        Compartir
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Action Center (Drag & Drop + Download) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Upload Card */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />

            <div
              className={`relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center transition-colors
                ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-neutral-700 hover:border-neutral-500'}
                ${isProcessing ? 'opacity-50 pointer-events-none' : ''}
              `}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileChange} accept=".jpg,.jpeg,.png,.pdf,.xlsx,.xls,.csv,.doc,.docx" />

              <svg className={`w-12 h-12 mb-4 transition-colors ${isDragging ? 'text-blue-400' : 'text-neutral-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <h3 className="font-medium text-lg mb-1">Subir Archivos</h3>
              <p className="text-sm text-neutral-400">Arrastra archivos aquí o haz clic para explorar</p>
              <p className="text-xs text-neutral-500 mt-2">Max 5 archivos a la vez. Soporta JPG, PNG, PDF, Excel y Word (Max 2MB c/u)</p>
            </div>

            {files.length > 0 && (
              <div className="mt-4 flex flex-col gap-3 relative z-10">
                <div className="text-sm text-neutral-300 font-medium">{files.length} archivos seleccionados</div>
                <button
                  onClick={processFiles}
                  disabled={isProcessing}
                  className="w-full py-3 px-4 bg-white text-black font-semibold rounded-xl hover:bg-neutral-200 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Procesando con IA...
                    </>
                  ) : "Procesar Archivos"}
                </button>
              </div>
            )}
          </div>

          {/* Database Info Card */}
          <div className="bg-gradient-to-br from-blue-900/40 to-indigo-900/20 border border-blue-500/20 rounded-3xl p-6 flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center mb-4 border border-blue-500/30">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
              </div>
              <h2 className="text-xl font-bold mb-2">Base de Datos Global</h2>
              <p className="text-blue-200/60 text-sm">
                La plantilla CSV unificada sigue creciendo. Todos los datos están deduplicados y limpios.
              </p>
            </div>

            <div className="flex flex-col gap-3 mt-6">
              <button
                onClick={fetchGlobalPreview}
                disabled={isFetchingGlobal}
                className="w-full py-4 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 font-semibold rounded-xl transition-all flex items-center justify-center gap-3 backdrop-blur-md"
              >
                {isFetchingGlobal ? "Cargando..." : "Ver Preview Global"}
              </button>

              <a
                href="/api/download"
                className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Descargar CSV Global
              </a>

              <button
                onClick={() => handleUploadToPortal(history[0]?.id, false)}
                disabled={isUploadingToPortal || !history || history.length === 0}
                className="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded-xl transition-all shadow-[0_0_20px_rgba(234,88,12,0.3)] hover:shadow-[0_0_30px_rgba(234,88,12,0.5)] flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {isUploadingToPortal ? (
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                )}
                <div className="flex flex-col items-start text-left">
                  <span>Subir Último Lote al Portal</span>
                  <span className="text-[10px] opacity-75 font-normal leading-tight">Solo enviará tu última carga para no saturar el servidor</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Stats Notification */}
        {stats && (
          <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/10 border border-green-500/30 text-green-400 p-6 rounded-3xl flex flex-col gap-4 animate-in slide-in-from-bottom-4 fade-in backdrop-blur-xl shadow-lg shadow-green-900/20">
            <div className="flex items-start gap-4">
              <div className="mt-1 bg-green-500/20 p-2 rounded-full">
                <svg className="w-6 h-6 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h4 className="text-lg font-bold text-green-300">¡Proceso Completado Exitosamente!</h4>
                <p className="text-sm mt-1 opacity-90 text-green-100">Se añadieron <b>{stats.totalNuevos}</b> pacientes nuevos al CSV.</p>
                {(stats.totalDuplicados > 0 || stats.archivosSaltados > 0) && (
                  <p className="text-xs mt-2 opacity-75 text-green-200">
                    Protección activa: {stats.totalDuplicados} duplicados ignorados en base de datos. {stats.archivosSaltados} archivos omitidos por performance.
                  </p>
                )}
              </div>
            </div>

            {/* Preview Subida */}
            {stats.nuevosPacientes && stats.nuevosPacientes.length > 0 && (
              <div className="mt-2 bg-neutral-950/60 rounded-2xl border border-green-500/30 overflow-hidden backdrop-blur-md flex flex-col">
                <div className="px-4 py-3 border-b border-green-500/30 bg-green-500/10 flex flex-col gap-3">
                  <div className="flex flex-wrap justify-between items-center gap-4">
                    <h5 className="text-sm font-semibold text-green-300 whitespace-nowrap">Vista Previa de Nuevos Ingresos</h5>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        placeholder="Buscar..."
                        className="bg-black/40 border border-green-500/30 rounded-lg px-3 py-1 text-xs text-white focus:outline-none focus:border-green-400 placeholder-neutral-500 w-40"
                        value={localSearch}
                        onChange={(e) => {
                          setLocalSearch(e.target.value);
                          setLocalPage(1);
                        }}
                      />
                      <button
                        onClick={() => handleUploadToPortal(stats.batchId, false)}
                        disabled={isUploadingToPortal}
                        className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        Subir al Portal
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {/* Mass Assignment Input Centro */}
                    <div className="flex items-center bg-black/40 border border-green-500/30 rounded-lg overflow-hidden focus-within:border-green-400 transition-colors">
                      <input
                        type="text"
                        placeholder="Asignar Centro a Todos..."
                        list="hospitals-list"
                        className="bg-transparent px-3 py-1 text-xs text-white focus:outline-none placeholder-neutral-500 w-48"
                        value={massCentroValue}
                        onChange={(e) => setMassCentroValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleMassUpdate('centro')}
                      />
                      <datalist id="hospitals-list">
                        {hospitals.map((h, i) => <option key={i} value={h} />)}
                      </datalist>
                      <button
                        onClick={() => handleMassUpdate('centro')}
                        disabled={isUpdatingCentro || !massCentroValue.trim()}
                        className="bg-green-600 hover:bg-green-500 px-3 py-1 text-xs font-semibold text-white transition-colors disabled:opacity-50"
                        title="Aplicar Centro a todos los registros de esta carga"
                      >
                        {isUpdatingCentro ? "..." : "Aplicar"}
                      </button>
                    </div>

                    {/* Mass Assignment Input Sector */}
                    <div className="flex items-center bg-black/40 border border-green-500/30 rounded-lg overflow-hidden focus-within:border-green-400 transition-colors">
                      <input
                        type="text"
                        placeholder="Asignar Sector a Todos..."
                        className="bg-transparent px-3 py-1 text-xs text-white focus:outline-none placeholder-neutral-500 w-48"
                        value={massSectorValue}
                        onChange={(e) => setMassSectorValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleMassUpdate('sector')}
                      />
                      <button
                        onClick={() => handleMassUpdate('sector')}
                        disabled={isUpdatingSector || !massSectorValue.trim()}
                        className="bg-green-600 hover:bg-green-500 px-3 py-1 text-xs font-semibold text-white transition-colors disabled:opacity-50"
                        title="Aplicar Sector a todos los registros de esta carga"
                      >
                        {isUpdatingSector ? "..." : "Aplicar"}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto max-h-60 overflow-y-auto custom-scrollbar flex-1">
                  <table className="w-full text-left text-xs text-neutral-300">
                    <thead className="bg-neutral-950/90 text-neutral-400 uppercase font-semibold sticky top-0 backdrop-blur-md z-10 shadow-sm">
                      <tr>
                        <th className="px-4 py-3">Nombre</th>
                        <th className="px-4 py-3">Cédula</th>
                        <th className="px-4 py-3">Centro</th>
                        <th className="px-4 py-3">Edad/Sector</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/50">
                      {localCurrent.map((p, idx) => (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          <td className="px-4 py-2 font-medium text-white">{p.nombre} {p.apellido}</td>
                          <td className="px-4 py-2 font-mono text-green-200">{p.cedula || '-'}</td>
                          <td className="px-4 py-2 opacity-80">{p.centro}</td>
                          <td className="px-4 py-2 opacity-80">{p.edad_sector}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {renderPagination(localPage, localFiltered.length, setLocalPage)}
              </div>
            )}
          </div>
        )}

        {/* Hospitals Recognized Section */}
        {hospitals && hospitals.length > 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-xl">
            <h2 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-teal-400 bg-clip-text text-transparent mb-4">Centros Médicos Reconocidos</h2>
            <div className="flex flex-wrap gap-2">
              {hospitals.map((hospital, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setGlobalSearch(hospital);
                    fetchGlobalPreview();
                  }}
                  className="px-3 py-1.5 bg-white/5 hover:bg-blue-500/20 border border-white/10 hover:border-blue-500/50 rounded-full text-sm text-neutral-300 hover:text-white transition-all backdrop-blur-sm"
                >
                  {hospital}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* History Table */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden mt-4 shadow-xl">
          <div className="p-6 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur-sm">
            <h2 className="text-xl font-bold bg-gradient-to-r from-gray-200 to-gray-500 bg-clip-text text-transparent">Histórico de Procesamiento</h2>
          </div>

          <div className="overflow-x-auto">
            {history.length === 0 ? (
              <div className="p-8 text-center text-neutral-500">
                No hay historial de procesamientos aún.
              </div>
            ) : (
              <table className="w-full text-left text-sm text-neutral-400">
                <thead className="bg-neutral-950/50 text-neutral-300 uppercase text-xs font-semibold">
                  <tr>
                    <th className="px-6 py-4">Fecha y Hora</th>
                    <th className="px-6 py-4">Archivos Subidos</th>
                    <th className="px-6 py-4">Nuevos Pacientes</th>
                    <th className="px-6 py-4">Duplicados Omitidos</th>
                    <th className="px-6 py-4 text-right">Preview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {historyCurrent.map((item) => (
                    <tr key={item.id} className="hover:bg-neutral-800/50 transition-colors">
                      <td className="px-6 py-4 text-neutral-200">
                        {new Date(item.date).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-800/80 border border-neutral-700 text-xs font-medium">
                          {item.filesUploaded} archivo(s)
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-green-400 font-medium px-2 py-1 bg-green-500/10 rounded-md">+{item.newPatients}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-orange-400 font-medium px-2 py-1 bg-orange-500/10 rounded-md">{item.duplicatesIgnored}</span> / <span className="text-blue-400 px-2 py-1 bg-blue-500/10 rounded-md" title="Archivos saltados por Hash MD5">{item.filesSkippedByHash} hashes</span>
                      </td>
                      <td className="px-6 py-4 text-right flex justify-end gap-2">
                        <button onClick={() => fetchBatchPreview(item.id)} className="p-2 bg-neutral-800 hover:bg-blue-600 rounded-full text-neutral-400 hover:text-white transition-colors shadow-sm" title="Ver registros de esta carga">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        </button>
                        <a href={`/api/downloadBatch?id=${item.id}`} className="p-2 bg-neutral-800 hover:bg-green-600 rounded-full text-neutral-400 hover:text-white transition-colors shadow-sm inline-flex items-center justify-center" title="Descargar CSV de esta carga">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {history.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 bg-neutral-900/80 border-t border-neutral-700">
              <div className="text-xs text-neutral-400">
                Mostrando {(historyPage - 1) * historyItemsPerPage + 1} a {Math.min(historyPage * historyItemsPerPage, history.length)} de {history.length} lotes
              </div>
              <div className="flex gap-2">
                <button
                  disabled={historyPage === 1}
                  onClick={() => setHistoryPage(historyPage - 1)}
                  className="px-3 py-1 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-medium"
                >
                  Anterior
                </button>
                <span className="px-3 py-1 text-xs font-medium text-neutral-400">
                  Página {historyPage} de {Math.ceil(history.length / historyItemsPerPage) || 1}
                </span>
                <button
                  disabled={historyPage >= Math.ceil(history.length / historyItemsPerPage)}
                  onClick={() => setHistoryPage(p => p + 1)}
                  className="px-3 py-1 bg-neutral-800 text-neutral-300 rounded hover:bg-neutral-700 disabled:opacity-50 text-xs font-medium"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Map Section */}
        <div className="w-full mt-12 mb-8 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
          <MapView />
        </div>

      </div>

      {/* Global Preview Modal */}
      {showGlobalPreview && globalPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-neutral-900/90 border border-neutral-700 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 backdrop-blur-xl">
            <div className="p-6 border-b border-neutral-700 flex justify-between items-center bg-neutral-900/90 backdrop-blur-md">
              <div>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">Base de Datos Global</h2>
                <p className="text-sm text-neutral-400 mt-1">
                  Encontrados {globalFiltered.length} registros (Mostrando {globalPreview.total} en DB).
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Filtrar base de datos..."
                    className="bg-black/50 border border-neutral-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 placeholder-neutral-500 w-64 transition-colors"
                    value={globalSearch}
                    onChange={(e) => {
                      setGlobalSearch(e.target.value);
                      setGlobalPage(1);
                    }}
                  />
                </div>
                <button
                  onClick={() => setShowGlobalPreview(false)}
                  className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-full transition-colors text-neutral-400 hover:text-white"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-0 custom-scrollbar flex flex-col">
              {globalFiltered.length === 0 ? (
                <div className="p-12 text-center text-neutral-500 flex-1">No se encontraron registros.</div>
              ) : (
                <div className="flex-1">
                  <table className="w-full text-left text-sm text-neutral-300">
                    <thead className="bg-neutral-950/80 text-neutral-400 uppercase text-xs font-semibold sticky top-0 backdrop-blur-md shadow-sm z-10">
                      <tr>
                        <th className="px-6 py-4">Nombre Completo</th>
                        <th className="px-6 py-4">Cédula</th>
                        <th className="px-6 py-4">Centro Médico</th>
                        <th className="px-6 py-4">Edad / Sector</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/60">
                      {globalCurrent.map((p, idx) => (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-3 font-medium text-white">{p.nombre} {p.apellido}</td>
                          <td className="px-6 py-3 font-mono text-blue-300">{p.cedula || '-'}</td>
                          <td className="px-6 py-3 opacity-80">{p.centro}</td>
                          <td className="px-6 py-3 opacity-80">{p.edad_sector}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {renderPagination(globalPage, globalFiltered.length, setGlobalPage)}
          </div>
        </div>
      )}

      {/* Batch Preview Modal */}
      {showBatchPreview && batchPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-neutral-900/90 border border-neutral-700 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 backdrop-blur-xl">
            <div className="p-6 border-b border-neutral-700 flex justify-between items-center bg-neutral-900/90 backdrop-blur-md">
              <div>
                <h2 className="text-2xl font-bold bg-gradient-to-r from-teal-400 to-green-400 bg-clip-text text-transparent">Preview de Carga</h2>
                <p className="text-sm text-neutral-400 mt-1">Mostrando los {batchPreview.totalNuevos} registros de este lote.</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Filtrar pacientes..."
                    className="bg-black/50 border border-neutral-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-green-500 placeholder-neutral-500 w-64 transition-colors"
                    value={batchSearch}
                    onChange={(e) => {
                      setBatchSearch(e.target.value);
                      setBatchPage(1);
                    }}
                  />
                </div>
                <button
                  onClick={() => setShowBatchPreview(false)}
                  className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-full transition-colors text-neutral-400 hover:text-white"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-0 custom-scrollbar flex flex-col">
              {batchFiltered.length === 0 ? (
                <div className="p-12 text-center text-neutral-500 flex-1">No se encontraron pacientes.</div>
              ) : (
                <div className="flex-1">
                  <table className="w-full text-left text-sm text-neutral-300">
                    <thead className="bg-neutral-950/80 text-neutral-400 uppercase text-xs font-semibold sticky top-0 backdrop-blur-md shadow-sm z-10">
                      <tr>
                        <th className="px-6 py-4">Nombre Completo</th>
                        <th className="px-6 py-4">Cédula</th>
                        <th className="px-6 py-4">Centro Médico</th>
                        <th className="px-6 py-4">Edad / Sector</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/60">
                      {batchCurrent.map((p, idx) => (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-3 font-medium text-white">{p.nombre} {p.apellido}</td>
                          <td className="px-6 py-3 font-mono text-green-300">{p.cedula || '-'}</td>
                          <td className="px-6 py-3 opacity-80">{p.centro}</td>
                          <td className="px-6 py-3 opacity-80">{p.edad_sector}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {renderPagination(batchPage, batchFiltered.length, setBatchPage)}
          </div>
        </div>
      )}

      {/* Portal Response Modal */}
      {portalResponse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in">
          <div className="bg-neutral-900 border border-orange-500/30 rounded-3xl shadow-[0_0_50px_rgba(234,88,12,0.15)] w-full max-w-lg overflow-hidden animate-in zoom-in-95 backdrop-blur-xl">
            <div className="p-8 text-center bg-gradient-to-b from-orange-500/10 to-transparent">
              <div className="mx-auto w-16 h-16 bg-orange-500/20 text-orange-400 rounded-full flex items-center justify-center mb-6 border border-orange-500/30 shadow-[0_0_30px_rgba(234,88,12,0.3)]">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h2 className="text-2xl font-extrabold bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent mb-2">Transmisión Exitosa</h2>
              <p className="text-neutral-400 text-sm">
                Conexión segura establecida con la plataforma asociada:<br />
                <a href="https://hospitalesenvenezuela.com/" target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300 underline underline-offset-2 transition-colors font-medium">hospitalesenvenezuela.com</a>
              </p>
            </div>

            <div className="px-8 pb-8">
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-neutral-950/50 rounded-2xl p-4 border border-green-500/20 flex flex-col items-center justify-center text-center">
                  <span className="text-3xl font-black text-green-400 mb-1">{portalResponse.supabaseResponse?.insertados || 0}</span>
                  <span className="text-xs text-green-400/70 font-semibold uppercase tracking-wider">Insertados</span>
                </div>
                <div className="bg-neutral-950/50 rounded-2xl p-4 border border-blue-500/20 flex flex-col items-center justify-center text-center">
                  <span className="text-3xl font-black text-blue-400 mb-1">{portalResponse.supabaseResponse?.duplicados || 0}</span>
                  <span className="text-xs text-blue-400/70 font-semibold uppercase tracking-wider">Duplicados</span>
                </div>
                <div className="bg-neutral-950/50 rounded-2xl p-4 border border-red-500/20 flex flex-col items-center justify-center text-center">
                  <span className="text-3xl font-black text-red-400 mb-1">{portalResponse.supabaseResponse?.invalidos || 0}</span>
                  <span className="text-xs text-red-400/70 font-semibold uppercase tracking-wider">Inválidos</span>
                </div>
                <div className="bg-neutral-950/50 rounded-2xl p-4 border border-neutral-700/50 flex flex-col items-center justify-center text-center">
                  <span className="text-3xl font-black text-white mb-1">{portalResponse.supabaseResponse?.total || 0}</span>
                  <span className="text-xs text-neutral-400 font-semibold uppercase tracking-wider">Procesados</span>
                </div>
              </div>

              <button
                onClick={() => setPortalResponse(null)}
                className="w-full py-4 bg-neutral-800 hover:bg-neutral-700 text-white font-bold rounded-xl transition-all shadow-sm"
              >
                Aceptar y Continuar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
