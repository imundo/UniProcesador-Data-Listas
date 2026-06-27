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
      
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
      // Also check extension as fallback for some OS
      const ext = file.name.toLowerCase().slice((file.name.lastIndexOf(".") - 1 >>> 0) + 2);
      const validExts = ['jpg', 'jpeg', 'png', 'pdf'];
      
      if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
        alert(`El archivo ${file.name} no es válido. Solo se permiten PDF e Imágenes (JPG, PNG). Videos y otros formatos fueron deshabilitados por estabilidad y costo.`);
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
      fetchHistory(); // Refresh history
      fetchHospitals(); // Refresh hospitals
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
      const response = await fetch("/api/uploadToPortal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, global }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Error desconocido");
      setPortalResponse(data);
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
              <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileChange} accept=".jpg,.jpeg,.png,.pdf" />
              
              <svg className={`w-12 h-12 mb-4 transition-colors ${isDragging ? 'text-blue-400' : 'text-neutral-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <h3 className="font-medium text-lg mb-1">Subir Archivos</h3>
              <p className="text-sm text-neutral-400">Arrastra archivos aquí o haz clic para explorar</p>
              <p className="text-xs text-neutral-500 mt-2">Max 5 archivos a la vez. Soporta JPG, PNG y PDF (Max 2MB c/u)</p>
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
                    Protección activa: {stats.totalDuplicados} duplicados ignorados en base de datos. {stats.archivosSaltados} archivos omitidos por MD5 Hash para ahorrar tokens.
                  </p>
                )}
              </div>
            </div>

            {/* Preview Subida */}
            {stats.nuevosPacientes && stats.nuevosPacientes.length > 0 && (
              <div className="mt-2 bg-neutral-950/60 rounded-2xl border border-green-500/30 overflow-hidden backdrop-blur-md flex flex-col">
                <div className="px-4 py-3 border-b border-green-500/30 bg-green-500/10 flex justify-between items-center gap-4">
                  <h5 className="text-sm font-semibold text-green-300">Vista Previa de Nuevos Ingresos</h5>
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
                    className="ml-auto px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Subir al Portal
                  </button>
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
                Conexión segura establecida con la plataforma asociada:<br/>
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
