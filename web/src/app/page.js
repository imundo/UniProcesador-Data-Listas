"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from 'next/dynamic';

const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => <div className="w-full h-[500px] rounded-3xl bg-neutral-900 border border-neutral-800 animate-pulse"></div>
});

const SEARCH_SOURCES = [
  "🏢 Consultando Base Local...",
  "🌐 Conectando con HospitalesEnVenezuela.com...",
  "🌐 Revisando RedSolidariaVenezuela.com...",
  "🌐 Buscando en DesaparecidosTerremotoVenezuela...",
  "🌐 Consultando RedAyudaVenezuela.com...",
  "🌐 Escaneando DesaparecidosVenezuela.com...",
  "🌐 Consultando Reencuentro.help...",
  "🌐 Buscando en SOSVenezuela2026.com...",
  "🌐 Conectando con NodoAyuda.com..."
];

function MultiSourceLoader() {
  const [sourceIdx, setSourceIdx] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSourceIdx((prev) => (prev + 1) % SEARCH_SOURCES.length);
    }, 450); // Cambia cada 450ms para un efecto rápido de escaneo
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="pr-4 flex items-center gap-3">
      <span className="text-[10px] sm:text-xs font-bold tracking-wider uppercase text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400 transition-opacity duration-200">
        {SEARCH_SOURCES[sourceIdx]}
      </span>
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 bg-blue-500 rounded-full animate-[bounce_1s_infinite_-0.4s] shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>
        <div className="w-2 h-2 bg-purple-500 rounded-full animate-[bounce_1s_infinite_-0.2s] shadow-[0_0_8px_rgba(168,85,247,0.8)]"></div>
        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-[bounce_1s_infinite_0s] shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
      </div>
    </div>
  );
}

const AnimatedNumber = ({ value }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let start = displayValue;
    const end = value;
    if (start === end) return;

    const duration = 1500; // 1.5 seconds animation
    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsedTime = currentTime - startTime;
      const progress = Math.min(elapsedTime / duration, 1);
      
      const easeOut = 1 - Math.pow(1 - progress, 4);
      const currentVal = Math.floor(start + (end - start) * easeOut);
      
      setDisplayValue(currentVal);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setDisplayValue(end);
      }
    };
    
    requestAnimationFrame(animate);
  }, [value]);

  return <>{displayValue.toLocaleString()}</>;
};

export default function Home() {
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiThought, setAiThought] = useState("Iniciando análisis...");
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);

  const [dashboardStats, setDashboardStats] = useState({ total: 0, externalCount: 0, crossesFound: 0 });
  const [adminSeedStats, setAdminSeedStats] = useState(null);
  const [globalPreview, setGlobalPreview] = useState(null);
  const [isFetchingGlobal, setIsFetchingGlobal] = useState(false);
  const [showGlobalPreview, setShowGlobalPreview] = useState(false);

  const [batchPreview, setBatchPreview] = useState(null);
  const [isFetchingBatch, setIsFetchingBatch] = useState(false);
  const [showBatchPreview, setShowBatchPreview] = useState(false);

  const [invalidsPreview, setInvalidsPreview] = useState(null);
  const [isFetchingInvalids, setIsFetchingInvalids] = useState(false);
  const [showInvalidsPreview, setShowInvalidsPreview] = useState(false);

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
  const [invalidsSearch, setInvalidsSearch] = useState("");
  const [localDuplicatesSearch, setLocalDuplicatesSearch] = useState("");

  // Pagination States
  const [localPage, setLocalPage] = useState(1);
  const [globalPage, setGlobalPage] = useState(1);
  const [batchPage, setBatchPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [invalidsPage, setInvalidsPage] = useState(1);
  const [localDuplicatesPage, setLocalDuplicatesPage] = useState(1);

  const itemsPerPage = 100;
  const historyItemsPerPage = 10;

  // Emergency Search States
  const [emergencySearchQuery, setEmergencySearchQuery] = useState("");
  const [emergencySearchResults, setEmergencySearchResults] = useState([]);
  const [isEmergencySearching, setIsEmergencySearching] = useState(false);

  // Cross-Match States
  const [crossMatchResults, setCrossMatchResults] = useState([]);
  const [crossMatchFilter, setCrossMatchFilter] = useState(40);
  const [crossMatchTextFilter, setCrossMatchTextFilter] = useState('');
  const [recognizeModal, setRecognizeModal] = useState(null); // holds the match being recognized
  const [recognizeForm, setRecognizeForm] = useState({ nombre: '', email: '', telefono: '' });
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [crossMatchRecognizedCount, setCrossMatchRecognizedCount] = useState(0);

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

  const fetchInvalidsPreview = async () => {
    setIsFetchingInvalids(true);
    try {
      const res = await fetch("/api/invalids");
      const data = await res.json();
      setInvalidsPreview(data);
      setShowInvalidsPreview(true);
      setInvalidsPage(1);
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetchingInvalids(false);
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

  const fetchDashboardStats = async () => {
    try {
      const res = await fetch("/api/global?cacheBuster=" + new Date().getTime());
      const data = await res.json();
      setDashboardStats({
        total: data.total || 0,
        externalCount: data.externalCount || 0,
        crossesFound: data.crossesFound || 0
      });
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAdminSeedStats = async () => {
    try {
      const res = await fetch("/api/admin/seed");
      if (res.ok) {
        const data = await res.json();
        setAdminSeedStats(data);
      }
    } catch (err) {
      // Ignorar errores menores
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
    const abortController = new AbortController();

    const delayDebounceFn = setTimeout(async () => {
      if (emergencySearchQuery.trim().length >= 3) {
        setIsEmergencySearching(true);
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(emergencySearchQuery)}`, {
            signal: abortController.signal
          });
          const data = await res.json();
          setEmergencySearchResults(data);
        } catch (e) {
          if (e.name !== 'AbortError') {
            console.error(e);
          }
        } finally {
          // Only stop loading if we haven't aborted (meaning this is the latest request)
          if (!abortController.signal.aborted) {
            setIsEmergencySearching(false);
          }
        }
      } else {
        setEmergencySearchResults([]);
      }
    }, 500);

    return () => {
      clearTimeout(delayDebounceFn);
      abortController.abort(); // Cancelar la petición anterior si el usuario sigue escribiendo
    };
  }, [emergencySearchQuery]);


  // Fetch cross-match results on mount
  const fetchCrossMatchResults = async (minScore = 40) => {
    try {
      const res = await fetch(`/api/crossmatch?mode=results&minScore=${minScore}`);
      const data = await res.json();
      if (data.matches) setCrossMatchResults(data.matches);
      if (data.recognizedCount !== undefined) setCrossMatchRecognizedCount(data.recognizedCount);
    } catch (e) { console.error('CrossMatch fetch error:', e); }
  };

  const handleRecognizeSubmit = async (e) => {
    e.preventDefault();
    if (!recognizeForm.nombre || !recognizeForm.email) {
      alert("Por favor, ingresa tu nombre y correo.");
      return;
    }
    setIsRecognizing(true);
    try {
      const res = await fetch('/api/crossmatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'recognize',
          matchId: recognizeModal.id,
          nombre: recognizeForm.nombre,
          email: recognizeForm.email,
          telefono: recognizeForm.telefono
        })
      });
      if (res.ok) {
        setRecognizeModal(null);
        setRecognizeForm({ nombre: '', email: '', telefono: '' });
        fetchCrossMatchResults(crossMatchFilter);
      } else {
        const data = await res.json();
        alert(data.error || "Error al registrar el reconocimiento.");
      }
    } catch (e) {
      console.error(e);
      alert("Error de red.");
    } finally {
      setIsRecognizing(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    fetchHospitals();
    fetchCrossMatchResults();
    fetchDashboardStats();
    fetchAdminSeedStats();
  }, []);

  useEffect(() => {
    const fetchInterval = setInterval(() => {
      fetchCrossMatchResults(crossMatchFilter);
      fetchDashboardStats();
      fetchAdminSeedStats();
    }, 60000); // Polling cada minuto para que se refresque solo si el backend hace la sincronización
    return () => clearInterval(fetchInterval);
  }, [crossMatchFilter]);

  useEffect(() => {
    let interval;
    if (isProcessing) {
      const thoughts = [
        "Iniciando análisis de imagen...",
        "Extrayendo texto manuscrito...",
        "Identificando nombres y cédulas...",
        "Cruzando datos con bases existentes...",
        "Limpiando y estructurando información...",
        "Generando preview de carga..."
      ];
      let i = 0;
      setAiThought(thoughts[0]);
      interval = setInterval(() => {
        i = (i + 1) % thoughts.length;
        setAiThought(thoughts[i]);
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [isProcessing]);

  const handleEditPaciente = (id, field, value) => {
    if (!stats || !stats.nuevosPacientes) return;
    const updated = stats.nuevosPacientes.map(p => {
      if (p._id === id) {
        return { ...p, [field]: value };
      }
      return p;
    });
    setStats({ ...stats, nuevosPacientes: updated });
  };

  const handleDeletePaciente = (id) => {
    if (!stats || !stats.nuevosPacientes) return;
    const updated = stats.nuevosPacientes.filter(p => p._id !== id);
    setStats({
      ...stats,
      nuevosPacientes: updated,
      totalNuevos: updated.length // update the count
    });
  };

  const handleAproveDuplicate = (id) => {
    if (!stats || !stats.pacientesDuplicados) return;
    const dupToApprove = stats.pacientesDuplicados.find(p => p._id === id);
    if (!dupToApprove) return;

    const updatedDuplicates = stats.pacientesDuplicados.filter(p => p._id !== id);
    const updatedNuevos = [...(stats.nuevosPacientes || []), dupToApprove.nuevo];

    setStats({
      ...stats,
      pacientesDuplicados: updatedDuplicates,
      nuevosPacientes: updatedNuevos,
      totalDuplicados: updatedDuplicates.length,
      totalNuevos: updatedNuevos.length
    });
  };

  const handleDiscardDuplicate = (id) => {
    if (!stats || !stats.pacientesDuplicados) return;
    const updatedDuplicates = stats.pacientesDuplicados.filter(p => p._id !== id);
    setStats({
      ...stats,
      pacientesDuplicados: updatedDuplicates,
      totalDuplicados: updatedDuplicates.length
    });
  };

  const handleMergeDuplicate = (id) => {
    if (!stats || !stats.pacientesDuplicados) return;
    const dupToMerge = stats.pacientesDuplicados.find(p => p._id === id);
    if (!dupToMerge) return;

    // Logic: Combine Lado A (nuevo) with Lado B (existente).
    // Take the most complete data for each field.
    const combined = {
      ...dupToMerge.nuevo,
      nombre: (dupToMerge.nuevo.nombre?.length >= (dupToMerge.existente?.nombre?.length || 0)) ? dupToMerge.nuevo.nombre : dupToMerge.existente.nombre,
      apellido: (dupToMerge.nuevo.apellido?.length >= (dupToMerge.existente?.apellido?.length || 0)) ? dupToMerge.nuevo.apellido : dupToMerge.existente.apellido,
      cedula: dupToMerge.nuevo.cedula || dupToMerge.existente?.cedula,
      centro: (dupToMerge.nuevo.centro?.length >= (dupToMerge.existente?.centro?.length || 0)) ? dupToMerge.nuevo.centro : dupToMerge.existente.centro,
      // For edad/sector we can just use nuevo, or combine.
      edad: dupToMerge.nuevo.edad || dupToMerge.existente?.edad || '',
      sector: dupToMerge.nuevo.sector || dupToMerge.existente?.sector || '',
      isMerged: true, // Flag it as merged for the backend
      mergeId: dupToMerge.existente?.id // ID of the existing record to UPDATE in SQLite
    };

    const updatedDuplicates = stats.pacientesDuplicados.filter(p => p._id !== id);
    const updatedNuevos = [...(stats.nuevosPacientes || []), combined];

    setStats({
      ...stats,
      pacientesDuplicados: updatedDuplicates,
      nuevosPacientes: updatedNuevos,
      totalDuplicados: updatedDuplicates.length,
      totalNuevos: updatedNuevos.length
    });
  };

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
        return {
          ...p,
          ...(type === 'centro' ? { centro: value } : { sector: value })
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

  const handleSwapNames = () => {
    if (!stats || !stats.nuevosPacientes) return;
    const updated = stats.nuevosPacientes.map(p => {
      return { ...p, nombre: p.apellido, apellido: p.nombre };
    });
    setStats({ ...stats, nuevosPacientes: updated });
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
    setShowDuplicates(false);
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

      if (!response.ok) {
        throw new Error(data.error || "Error al procesar archivo desde el servidor");
      }

      // Inject unique IDs for editable grid
      if (data.nuevosPacientes) {
        data.nuevosPacientes = data.nuevosPacientes.map((p, i) => ({
          ...p,
          _id: `n_${i}`
        }));
      }

      if (data.pacientesDuplicados) {
        data.pacientesDuplicados = data.pacientesDuplicados.map((p, i) => ({
          ...p,
          _id: `d_${i}`
        }));
      }

      setStats(data);
      setFiles([]); // Clear selection
    } catch (error) {
      console.error("Error al procesar", error);
      alert(`Hubo un error procesando los archivos: ${error.message}`);
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

  const localDuplicatesFiltered = stats?.pacientesDuplicados?.filter(p =>
    `${p.nuevo.nombre} ${p.nuevo.apellido} ${p.nuevo.cedula} ${p.nuevo.centro}`.toLowerCase().includes(localDuplicatesSearch.toLowerCase())
  ) || [];
  const localDuplicatesCurrent = localDuplicatesFiltered.slice((localDuplicatesPage - 1) * itemsPerPage, localDuplicatesPage * itemsPerPage);

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
  const baseRegistradas = history.reduce((acc, curr) => acc + (curr.newPatients || 0), 0);
  const baseLeidas = history.reduce((acc, curr) => acc + (curr.newPatients || 0) + (curr.duplicatesIgnored || 0), 0);
  const externalDataCount = dashboardStats.externalCount || 0;

  const totalPersonasRegistradas = baseRegistradas + externalDataCount;
  const totalPersonasLeidas = baseLeidas + externalDataCount;
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
          <div className="inline-flex items-center justify-center p-2 bg-transparent rounded-2xl mb-2">
            <img src="https://flagcdn.com/w80/ve.png" alt="Bandera de Venezuela" className="w-12 drop-shadow-md rounded-[4px]" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">Unificar listas para hospitales y personas</h1>
          <p className="text-neutral-400 max-w-2xl mx-auto">
            Sube tus imágenes, videos y PDFs de listas de pacientes. Nuestra IA extraerá automáticamente la información y la consolidará en una sola base de datos unificada sin duplicados. Con formato para ser subidos a portales como <a href="https://hospitalesenvenezuela.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors">https://hospitalesenvenezuela.com/</a>
          </p>
        </header>


        {/* Dashboard Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
          <div className="bg-neutral-900/60 backdrop-blur-md border border-neutral-800/50 rounded-2xl p-5 flex flex-col items-center text-center group hover:bg-neutral-800/60 transition-colors">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl mb-3 group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider mb-1">Personas Leídas</p>
            <p className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              <AnimatedNumber value={totalPersonasLeidas} />
            </p>
          </div>

          <div className="bg-neutral-900/60 backdrop-blur-md border border-neutral-800/50 rounded-2xl p-5 flex flex-col items-center text-center group hover:bg-neutral-800/60 transition-colors">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl mb-3 group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            </div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider mb-1">Personas Registradas</p>
            <p className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
              <AnimatedNumber value={totalPersonasRegistradas} />
            </p>
          </div>

          <div className="bg-neutral-900/60 backdrop-blur-md border border-neutral-800/50 rounded-2xl p-5 flex flex-col items-center text-center group hover:bg-neutral-800/60 transition-colors">
            <div className="p-2 bg-purple-500/10 text-purple-400 rounded-xl mb-3 group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
            </div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider mb-1">Centros Médicos</p>
            <p className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              <AnimatedNumber value={totalCentros} />
            </p>
          </div>

          <div className="bg-neutral-900/60 backdrop-blur-md border border-neutral-800/50 rounded-2xl p-5 flex flex-col items-center text-center group hover:bg-neutral-800/60 transition-colors">
            <div className="p-2 bg-orange-500/10 text-orange-400 rounded-xl mb-3 group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            </div>
            <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider mb-1">Cruces Inteligentes</p>
            <p className="text-3xl font-bold bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
              <AnimatedNumber value={dashboardStats.crossesFound || 0} />
            </p>
          </div>
        </div>

        {/* Multi-source indicator */}
        <div className="w-full flex flex-col items-center mb-6 z-20">

          <div className="flex flex-wrap justify-center gap-2 max-w-3xl mx-auto opacity-80 hover:opacity-100 transition-opacity">
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)] cursor-default">🏢 Base Local</span>
            {['NodoAyuda.com', 'HospitalesEnVenezuela.com', 'RedSolidariaVenezuela.com', 'DesaparecidosTerremotoVenezuela.com', 'RedAyudaVenezuela.com', 'DesaparecidosVenezuela.com', 'Reencuentro.help', 'SOSVenezuela2026.com', 'VenezuelaTeBusca.com', 'EncuentraVenezuela.com', 'AidVenezuela.net', 'VenAyuda.com'].map(site => {
              // Buscar si existe un conteo para este origen en adminSeedStats
              let originCount = null;
              if (adminSeedStats && adminSeedStats.por_origen) {
                const stat = adminSeedStats.por_origen.find(o => o.origen.toLowerCase() === site.toLowerCase());
                if (stat) originCount = stat.count;
              }

              return (
                <a key={site} href={`https://${site.toLowerCase()}/`} target="_blank" rel="noopener noreferrer" className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-full bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white/90 transition-colors flex items-center gap-1.5">
                  🌐 {site}
                  {originCount !== null && (
                    <span className="bg-white/20 text-white px-1.5 py-0.5 rounded-full text-[9px]">
                      {originCount.toLocaleString()}
                    </span>
                  )}
                </a>
              );
            })}
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
              {isEmergencySearching && <MultiSourceLoader />}
            </div>
          </div>

          {/* Search Results */}
          {emergencySearchResults.length > 0 && (
            <div className="flex flex-col gap-3 w-full">
              {emergencySearchResults.map((person, idx) => {
                const sourcesArray = person.sources || [{ name: person.source, url: person.sourceUrl }];
                const isDuplicated = sourcesArray.length > 1;

                const shareText = encodeURIComponent(`🚨 PERSONA LOCALIZADA\nNombre: ${person.nombre} ${person.apellido}\nCédula: ${person.cedula}\nUbicación: ${person.centro}\n${person.edad_sector ? `Sector/Nota: ${person.edad_sector}\n` : ''}${person.estado ? `Estado: ${person.estado}\n` : ''}Reportado en ${sourcesArray.length} plataforma(s).`);

                const getSearchUrlForSource = (sourceName, query) => {
                  const q = encodeURIComponent(query);
                  switch (sourceName) {
                    case 'HospitalesEnVenezuela.com': return `https://hospitalesenvenezuela.com/?q=${q}`;
                    case 'RedSolidariaVenezuela.com': return `https://www.redsolidariavenezuela.com/?q=${q}`;
                    case 'DesaparecidosTerremotoVenezuela.com': return `https://desaparecidosterremotovenezuela.com/?q=${q}`;
                    case 'RedAyudaVenezuela.com': return `https://redayudavenezuela.com/?q=${q}`;
                    case 'DesaparecidosVenezuela.com': return `https://www.desaparecidosvenezuela.com/?q=${q}`;
                    case 'Reencuentro.help': return `https://reencuentro.help/?q=${q}`;
                    case 'SOSVenezuela2026.com': return `https://sosvenezuela2026.com/buscar?q=${q}`;
                    default: return '#';
                  }
                };

                return (
                  <div key={idx} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-neutral-700 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h4 className="text-lg font-bold text-white">{person.nombre} {person.apellido}</h4>
                        {isDuplicated && (
                          <span className="text-[10px] bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded-full font-bold">
                            DUPLICADO {sourcesArray.length} VECES
                          </span>
                        )}
                      </div>
                      <p className="text-neutral-400 text-sm font-mono mt-1">CI: {person.cedula}</p>

                      {person.centro && (
                        <p className="text-blue-400 font-medium text-sm mt-1 flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                          {person.centro}
                        </p>
                      )}

                      {person.estado && person.estado.toLowerCase().trim() !== 'active' && (
                        <p className="text-orange-400 font-medium text-sm mt-1 flex items-center gap-1 uppercase tracking-wider">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                          ESTADO: {person.estado}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2 items-center">
                        <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mr-1">Encontrado en:</span>
                        {sourcesArray.map((src, i) => {
                          const searchQuery = (person.cedula && person.cedula.length > 5) ? person.cedula : `${person.nombre} ${person.apellido}`.trim();
                          const targetUrl = src.url ? getSearchUrlForSource(src.name, searchQuery) : null;
                          return targetUrl ? (
                            <a
                              key={i}
                              href={targetUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="cursor-pointer hover:bg-neutral-700 hover:scale-105 transition-all text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md bg-neutral-800/80 text-neutral-300 border border-neutral-700/50 flex items-center gap-1.5 shadow-sm"
                              title={`Buscar a ${searchQuery} en ${src.name}`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                              {src.name.replace('.com', '').replace('.help', '')}
                              <svg className="w-3 h-3 ml-0.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                            </a>
                          ) : (
                            <span key={i} className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-md bg-neutral-800/80 text-neutral-300 border border-neutral-700/50 flex items-center gap-1.5 shadow-sm">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              {src.name}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-col items-start sm:items-end gap-3 w-full sm:w-auto">
                      <div className="flex flex-wrap gap-2 justify-end">
                        {sourcesArray.map((src, sIdx) => {
                          const isExternal = !!src.url;
                          const badgeColor = src.name === 'HospitalesEnVenezuela.com' ? 'bg-blue-500/20 text-blue-400' :
                            src.name === 'RedSolidariaVenezuela.com' ? 'bg-red-500/20 text-red-400' :
                              src.name === 'DesaparecidosTerremotoVenezuela.com' ? 'bg-purple-500/20 text-purple-400' :
                                src.name === 'RedAyudaVenezuela.com' ? 'bg-amber-500/20 text-amber-400' :
                                  src.name === 'DesaparecidosVenezuela.com' ? 'bg-rose-500/20 text-rose-400' :
                                    src.name === 'Reencuentro.help' ? 'bg-teal-500/20 text-teal-400' :
                                      src.name === 'SOSVenezuela2026.com' ? 'bg-cyan-500/20 text-cyan-400' :
                                        'bg-emerald-500/20 text-emerald-400';
                          return (
                            <span key={sIdx} className={`text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded-full ${badgeColor}`}>
                              {isExternal ? '🌐 ' : '🏢 '} {src.name}
                            </span>
                          );
                        })}
                      </div>
                      <a
                        href={`https://wa.me/?text=${shareText}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-[#25D366] hover:bg-[#20bd5a] text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors w-full justify-center"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                        Compartir
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* === CROSS-MATCH ROLLER === */}
        {crossMatchResults.length > 0 && (
          <div className="w-full">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
                  <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                </div>
                <div>
                  <h3 className="text-xl font-black text-white tracking-tight uppercase">Cruce Inteligente</h3>
                  <p className="text-xs text-neutral-400 font-medium">Pacientes locales encontrados en portales de desaparecidos</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Filtrar por nombre o CI..."
                  value={crossMatchTextFilter}
                  onChange={(e) => setCrossMatchTextFilter(e.target.value)}
                  className="bg-neutral-900 border border-neutral-700/50 rounded-lg px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50"
                />
                {crossMatchTextFilter && (
                  <button onClick={() => setCrossMatchTextFilter('')} className="absolute right-2 top-1.5 text-neutral-500 hover:text-white">✕</button>
                )}
              </div>
              <span className="text-[10px] text-neutral-500 font-bold uppercase ml-2">Confianza:</span>
              {[40, 60, 80].map(s => (
                <button key={s} onClick={() => { setCrossMatchFilter(s); fetchCrossMatchResults(s); }}
                  className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider border transition-all ${crossMatchFilter === s
                      ? (s >= 80 ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/50' : s >= 60 ? 'bg-yellow-500/30 text-yellow-300 border-yellow-500/50' : 'bg-orange-500/30 text-orange-300 border-orange-500/50')
                      : 'bg-neutral-800/50 text-neutral-500 border-neutral-700/50 hover:bg-neutral-700/50'
                    }`}>
                  {s}%+
                </button>
              ))}
              <span className="text-[10px] text-neutral-500 ml-2">{(() => {
                const filtered = crossMatchResults.filter(match => {
                  if (!crossMatchTextFilter) return true;
                  const term = crossMatchTextFilter.toLowerCase();
                  return (
                    (match.nombre_local && match.nombre_local.toLowerCase().includes(term)) ||
                    (match.apellido_local && match.apellido_local.toLowerCase().includes(term)) ||
                    (match.cedula_local && match.cedula_local.toLowerCase().includes(term)) ||
                    (match.nombre_externo && match.nombre_externo.toLowerCase().includes(term)) ||
                    (match.apellido_externo && match.apellido_externo.toLowerCase().includes(term))
                  );
                });
                return filtered.length;
              })()} coincidencias | {crossMatchRecognizedCount} reconocidas</span>
            </div>
            {/* Horizontal Roller/Ticker */}
            <div className="relative overflow-hidden rounded-2xl border border-neutral-800/50 bg-neutral-950/40 backdrop-blur-md">
              <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-neutral-950 to-transparent z-10 pointer-events-none" />
              <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-neutral-950 to-transparent z-10 pointer-events-none" />

              {(() => {
                const filtered = crossMatchResults.filter(match => {
                  if (!crossMatchTextFilter) return true;
                  const term = crossMatchTextFilter.toLowerCase();
                  return (
                    (match.nombre_local && match.nombre_local.toLowerCase().includes(term)) ||
                    (match.apellido_local && match.apellido_local.toLowerCase().includes(term)) ||
                    (match.cedula_local && match.cedula_local.toLowerCase().includes(term)) ||
                    (match.nombre_externo && match.nombre_externo.toLowerCase().includes(term)) ||
                    (match.apellido_externo && match.apellido_externo.toLowerCase().includes(term))
                  );
                });

                if (filtered.length === 0) return <div className="text-center text-xs text-neutral-500 py-6 w-full z-20 relative">No hay coincidencias con este filtro.</div>;

                const duration = Math.max(30, filtered.length * 6); // 6 segundos por tarjeta para que vaya lento y fluido

                return (
                  <div className="roller-track flex gap-4 py-4 px-4" style={{ width: 'max-content', animation: `scroll ${duration}s linear infinite` }}>
                    {[...filtered, ...filtered].map((match, idx) => {
                      const scoreColor = match.match_score >= 80 ? 'from-emerald-500 to-teal-500' : match.match_score >= 60 ? 'from-yellow-500 to-amber-500' : 'from-orange-500 to-red-500';
                      const borderColor = match.match_score >= 80 ? 'border-emerald-500/30 hover:border-emerald-400/60' : match.match_score >= 60 ? 'border-yellow-500/30 hover:border-yellow-400/60' : 'border-orange-500/30 hover:border-orange-400/60';
                      const glowColor = match.match_score >= 80 ? 'shadow-[0_0_15px_rgba(16,185,129,0.15)]' : match.match_score >= 60 ? 'shadow-[0_0_15px_rgba(234,179,8,0.15)]' : 'shadow-[0_0_15px_rgba(249,115,22,0.15)]';
                      const sources = match.sources || [];
                      return (
                        <div key={`${match.id}-${idx}`} className={`flex-shrink-0 w-[320px] bg-neutral-900/80 backdrop-blur-md rounded-xl border ${borderColor} ${glowColor} p-4 cursor-default transition-all hover:scale-[1.02] group`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2">
                                <div className="relative w-10 h-10 shrink-0">
                                  <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-800" />
                                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" strokeWidth="2.5" strokeDasharray={`${match.match_score}, 100`} className={`stroke-current ${match.match_score >= 80 ? 'text-emerald-400' : match.match_score >= 60 ? 'text-yellow-400' : 'text-orange-400'}`} strokeLinecap="round" />
                                  </svg>
                                  <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-black bg-gradient-to-r ${scoreColor} bg-clip-text text-transparent`}>{match.match_score}%</span>
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-white truncate">{match.nombre_local} {match.apellido_local}</p>
                                  <p className="text-[10px] text-neutral-500 truncate">🏥 Paciente local {match.cedula_local ? `• CI: ${match.cedula_local}` : ''}</p>
                                </div>
                              </div>
                              {/* External match */}
                              <div className="bg-neutral-800/50 rounded-lg px-3 py-2 border border-neutral-700/30">
                                <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider mb-1">Coincide con:</p>
                                <p className="text-xs font-semibold text-amber-300 truncate">{match.nombre_externo} {match.apellido_externo}</p>
                                {match.centro_externo && <p className="text-[10px] text-neutral-500 truncate mt-0.5">📍 {match.centro_externo}</p>}
                                {match.estado_externo && (
                                  <div className="mt-1.5">
                                    <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${match.estado_externo.toLowerCase().includes('rescatad') || match.estado_externo.toLowerCase().includes('reencontrad') || match.estado_externo.toLowerCase().includes('encontrad')
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                        : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                                      }`}>
                                      {match.estado_externo}
                                    </span>
                                  </div>
                                )}
                              </div>
                              {/* Sources */}
                              <div className="flex flex-wrap items-center justify-between gap-1 mt-3">
                                <div className="flex flex-wrap gap-1">
                                  {sources.map((src, si) => {
                                    const sourceName = typeof src === 'string' ? src : (src.name || '');

                                    const KNOWN_URLS = {
                                      'reencuentro.help': 'https://reencuentro.help',
                                      'hospitalesenvenezuela.com': 'https://hospitalesenvenezuela.com',
                                      'redsolidariavenezuela.com': 'https://www.redsolidariavenezuela.com',
                                      'desaparecidosterremotovenezuela.com': 'https://desaparecidosterremotovenezuela.com',
                                      'sosvenezuela2026.com': 'https://sosvenezuela2026.com',
                                      'nodoayuda.com': 'https://www.nodoayuda.com'
                                    };

                                    let sourceUrl = '#';
                                    if (typeof src === 'object' && src.url) sourceUrl = src.url;
                                    else if (KNOWN_URLS[sourceName.toLowerCase()]) sourceUrl = KNOWN_URLS[sourceName.toLowerCase()];

                                    return (
                                      <a
                                        key={si}
                                        href={sourceUrl}
                                        target={sourceUrl !== '#' ? "_blank" : undefined}
                                        rel="noopener noreferrer"
                                        className="text-[8px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white border border-neutral-700/50 transition-colors cursor-pointer"
                                      >
                                        {sourceName.replace('.com', '')}
                                      </a>
                                    );
                                  })}
                                </div>
                                {match.status === 'recognized' ? (
                                  <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 px-2 py-1 rounded">
                                    ✅ Reconocido
                                  </span>
                                ) : (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setRecognizeModal(match); }}
                                    className="text-[10px] font-bold bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 border border-indigo-500/50 px-2 py-1 rounded transition-colors"
                                  >
                                    ¡Lo conozco!
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Stats Footer for Roller */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 bg-neutral-900/50 border border-neutral-800 rounded-xl p-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-400">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-pulse"></span>
                  {crossMatchResults.length} Coincidencias Totales
                </div>
                <div className="w-px h-4 bg-neutral-800"></div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                  {crossMatchResults.filter(m => m.status === 'recognized').length} Reconocidos
                </div>
              </div>
            </div>
          </div>
        )}

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
              <h3 className="font-medium text-lg mb-1">Sube tus listas de pacientes</h3>
              <p className="text-sm text-neutral-400">Arrastra aquí tus archivos con listas de pacientes o haz clic para seleccionarlos.</p>
              <p className="text-sm text-blue-400 mt-2 font-medium">Nuestra IA analizará la información para ayudarte a organizarla y procesarla de forma rápida.</p>
              <p className="text-xs text-neutral-500 mt-3">Formatos permitidos: JPG, PNG, PDF, Excel y Word · Máx. 5 archivos · 1 MB c/u</p>
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
                {isProcessing && (
                  <div className="text-center mt-2 animate-in fade-in slide-in-from-top-1 duration-500">
                    <p className="text-xs text-blue-300 font-medium tracking-wide">
                      {aiThought}
                    </p>
                  </div>
                )}
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
                className="w-full py-4 px-4 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 font-semibold rounded-xl transition-all flex items-center justify-center gap-3 backdrop-blur-md"
              >
                {isFetchingGlobal ? "Cargando..." : "Ver Listas Completas de Personas"}
              </button>

              <a
                href="/api/download"
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span className="text-center leading-tight">Descargar CSV Listas Completas de Personas</span>
              </a>

              <div className="flex flex-col gap-2 w-full mt-2 relative">
                <button
                  onClick={fetchInvalidsPreview}
                  disabled={isFetchingInvalids}
                  className="w-full py-3 px-4 bg-red-950/40 hover:bg-red-900/60 text-red-300 border-2 border-red-500/50 hover:border-red-400 font-semibold rounded-xl transition-all flex items-center justify-center gap-3 backdrop-blur-md shadow-[0_0_15px_rgba(239,68,68,0.3)] hover:shadow-[0_0_30px_rgba(239,68,68,0.6)] group relative overflow-hidden ring-2 ring-red-500/20 ring-offset-2 ring-offset-neutral-950"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-red-500/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                  {isFetchingInvalids ? (
                    <svg className="animate-spin h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                  <span className="tracking-wide relative z-10">{isFetchingInvalids ? "Cargando..." : "Ver Registros Incompletos (No Enviados)"}</span>
                </button>

                {/* Premium Hint Box */}
                <div className="relative mt-1 px-4 py-3 bg-red-950/20 backdrop-blur-sm border border-red-900/30 rounded-xl flex items-start gap-3 shadow-inner">
                  <div className="mt-0.5 p-1 bg-red-500/10 rounded-full shrink-0">
                    <svg className="w-4 h-4 text-red-400/80" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path>
                    </svg>
                  </div>
                  <p className="text-[11px] leading-relaxed text-red-200/80 font-medium">
                    Aquí se encuentran las personas que <strong className="text-red-300 font-semibold">no fueron sincronizadas</strong> al portal debido a la falta de datos críticos para el sistema: <span className="text-white bg-red-900/40 px-1.5 py-0.5 rounded border border-red-800/50">Cédula</span>, <span className="text-white bg-red-900/40 px-1.5 py-0.5 rounded border border-red-800/50">Centro</span> o <span className="text-white bg-red-900/40 px-1.5 py-0.5 rounded border border-red-800/50">Nombre</span>.
                  </p>
                </div>
              </div>

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
                  <div className="mt-3 flex flex-col gap-2 items-start">
                    <p className="text-xs opacity-75 text-green-200">
                      Protección activa: {stats.totalDuplicados} duplicados encontrados. {stats.archivosSaltados > 0 ? `${stats.archivosSaltados} archivos omitidos por performance.` : ''}
                    </p>
                    {stats.totalDuplicados > 0 && (
                      <button
                        onClick={() => {
                          setShowDuplicates(true);
                          setTimeout(() => {
                            document.getElementById('duplicates-section')?.scrollIntoView({ behavior: 'smooth' });
                          }, 100);
                        }}
                        className="bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/50 px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        Visualizar y Validar Duplicados
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Preview Subida */}
            {stats.nuevosPacientes && stats.nuevosPacientes.length > 0 && (
              <div className="mt-2 bg-neutral-950/60 rounded-2xl border border-green-500/30 overflow-hidden backdrop-blur-md flex flex-col">
                <div className="px-4 py-3 border-b border-green-500/30 bg-green-500/10 flex flex-col gap-3">
                  <div className="flex flex-wrap justify-between items-center gap-4">
                    <h5 className="text-sm font-semibold text-green-300 whitespace-nowrap">Nuevas Personas</h5>
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

                    {/* Swap Nombres/Apellidos */}
                    <button
                      onClick={handleSwapNames}
                      className="bg-blue-600/50 hover:bg-blue-500 border border-blue-500/30 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors flex items-center gap-1.5"
                      title="Intercambiar Nombres y Apellidos en todos los registros"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                      Intercambiar Nombre/Apellido
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto max-h-60 overflow-y-auto custom-scrollbar flex-1">
                  <table className="w-full text-left text-xs text-neutral-300">
                    <thead className="bg-neutral-950/90 text-neutral-400 uppercase font-semibold sticky top-0 backdrop-blur-md z-10 shadow-sm">
                      <tr>
                        <th className="px-4 py-3">Nombre</th>
                        <th className="px-4 py-3">Apellido</th>
                        <th className="px-4 py-3">Cédula</th>
                        <th className="px-4 py-3">Centro</th>
                        <th className="px-4 py-3">Edad</th>
                        <th className="px-4 py-3">Sector</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/50">
                      {localCurrent.map((p, idx) => (
                        <tr key={p._id || idx} className="hover:bg-white/5 transition-colors group">
                          <td className="px-2 py-1">
                            <input
                              className="bg-transparent border border-transparent focus:border-green-500/50 hover:border-neutral-700 rounded outline-none w-full text-white font-medium transition-colors px-2 py-1"
                              value={p.nombre || ''}
                              onChange={(e) => handleEditPaciente(p._id, 'nombre', e.target.value)}
                              placeholder="Nombre"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              className="bg-transparent border border-transparent focus:border-green-500/50 hover:border-neutral-700 rounded outline-none w-full text-white font-medium transition-colors px-2 py-1"
                              value={p.apellido || ''}
                              onChange={(e) => handleEditPaciente(p._id, 'apellido', e.target.value)}
                              placeholder="Apellido"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              className="bg-transparent border border-transparent focus:border-green-500/50 hover:border-neutral-700 rounded outline-none w-full font-mono text-green-200 transition-colors px-2 py-1"
                              value={p.cedula || ''}
                              onChange={(e) => handleEditPaciente(p._id, 'cedula', e.target.value)}
                              placeholder="Cédula"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              className="bg-transparent border border-transparent focus:border-green-500/50 hover:border-neutral-700 rounded outline-none w-full opacity-80 focus:opacity-100 transition-colors px-2 py-1"
                              value={p.centro || ''}
                              onChange={(e) => handleEditPaciente(p._id, 'centro', e.target.value)}
                              placeholder="Centro"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              className="bg-transparent border border-transparent focus:border-green-500/50 hover:border-neutral-700 rounded outline-none w-full opacity-80 focus:opacity-100 transition-colors px-2 py-1"
                              value={p.edad || ''}
                              onChange={(e) => handleEditPaciente(p._id, 'edad', e.target.value)}
                              placeholder="Edad"
                            />
                          </td>
                          <td className="px-2 py-1 relative">
                            <div className="flex items-center gap-2">
                              <input
                                className="bg-transparent border border-transparent focus:border-green-500/50 hover:border-neutral-700 rounded outline-none w-full opacity-80 focus:opacity-100 transition-colors px-2 py-1"
                                value={p.sector || ''}
                                onChange={(e) => handleEditPaciente(p._id, 'sector', e.target.value)}
                                placeholder="Sector"
                              />
                              <button
                                onClick={() => handleDeletePaciente(p._id)}
                                className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:bg-red-500/20 rounded transition-all shrink-0"
                                title="Eliminar registro"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {renderPagination(localPage, localFiltered.length, setLocalPage)}
              </div>
            )}

            {/* Revisión de Posibles Duplicados */}
            {showDuplicates && stats.pacientesDuplicados && stats.pacientesDuplicados.length > 0 && (
              <div id="duplicates-section" className="mt-4 bg-neutral-950/60 rounded-2xl border border-yellow-500/30 overflow-hidden backdrop-blur-md flex flex-col">
                <div className="px-4 py-3 border-b border-yellow-500/30 bg-yellow-500/10 flex flex-col gap-3">
                  <div className="flex flex-wrap justify-between items-center gap-4">
                    <h5 className="text-sm font-semibold text-yellow-300 whitespace-nowrap">Revisión de Posibles Duplicados ({stats.totalDuplicados})</h5>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        placeholder="Buscar duplicados..."
                        className="bg-black/40 border border-yellow-500/30 rounded-lg px-3 py-1 text-xs text-white focus:outline-none focus:border-yellow-400 placeholder-neutral-500 w-40"
                        value={localDuplicatesSearch}
                        onChange={(e) => {
                          setLocalDuplicatesSearch(e.target.value);
                          setLocalDuplicatesPage(1);
                        }}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-yellow-400/80">Compara el dato leído por la IA con el registro que ya existe en la base de datos. Si son diferentes personas, apruébalo. Si es el mismo, descártalo.</p>
                </div>
                <div className="overflow-x-auto max-h-96 overflow-y-auto custom-scrollbar flex-1">
                  <table className="w-full text-left text-xs text-neutral-300">
                    <thead className="bg-neutral-950/90 text-neutral-400 uppercase font-semibold sticky top-0 backdrop-blur-md z-10 shadow-sm">
                      <tr>
                        <th className="px-4 py-3">Lado A (Leído por IA)</th>
                        <th className="px-4 py-3">Lado B (Almacenado)</th>
                        <th className="px-4 py-3 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/50">
                      {localDuplicatesCurrent.map((p, idx) => (
                        <tr key={p._id || idx} className="hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 align-top border-r border-neutral-800">
                            <div className="flex flex-col gap-1">
                              <span className="font-bold text-white">{p.nuevo.nombre} {p.nuevo.apellido}</span>
                              <span className="text-yellow-200 font-mono text-[10px]">CI: {p.nuevo.cedula || 'S/N'}</span>
                              <span className="text-neutral-400">🏥 {p.nuevo.centro || 'S/N'}</span>
                              <span className="text-neutral-500 italic">{p.nuevo.edad} {p.nuevo.sector ? `- ${p.nuevo.sector}` : ''} {p.nuevo.edad_sector ? `(${p.nuevo.edad_sector})` : ''}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex flex-col gap-1">
                              <span className="font-bold text-neutral-300">{p.existente?.nombre} {p.existente?.apellido}</span>
                              <span className="text-neutral-400 font-mono text-[10px]">CI: {p.existente?.cedula || 'S/N'}</span>
                              <span className="text-neutral-400">🏥 {p.existente?.centro || 'S/N'}</span>
                              <span className="text-neutral-500 italic">{p.existente?.edad} {p.existente?.sector ? `- ${p.existente?.sector}` : ''} {p.existente?.edad_sector ? `(${p.existente?.edad_sector})` : ''}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-middle text-center">
                            <div className="flex flex-col gap-2 items-center justify-center">
                              <button
                                onClick={() => handleAproveDuplicate(p._id)}
                                className="w-full max-w-[120px] py-1.5 px-2 bg-emerald-600/20 hover:bg-emerald-500 border border-emerald-500/50 text-emerald-400 hover:text-white rounded text-xs font-semibold transition-colors flex items-center justify-center gap-1"
                                title="Son personas distintas. Guardar como nuevo paciente."
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                                Aprobar
                              </button>
                              <button
                                onClick={() => handleMergeDuplicate(p._id)}
                                className="w-full max-w-[120px] py-1.5 px-2 bg-blue-600/20 hover:bg-blue-500 border border-blue-500/50 text-blue-400 hover:text-white rounded text-xs font-semibold transition-colors flex items-center justify-center gap-1"
                                title="Es la misma persona. Combinar datos nuevos con el existente."
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                                Fusionar
                              </button>
                              <button
                                onClick={() => handleDiscardDuplicate(p._id)}
                                className="w-full max-w-[120px] py-1.5 px-2 bg-red-600/20 hover:bg-red-500 border border-red-500/50 text-red-400 hover:text-white rounded text-xs font-semibold transition-colors flex items-center justify-center gap-1"
                                title="Es la misma persona. Descartar definitivamente."
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                Descartar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {renderPagination(localDuplicatesPage, localDuplicatesFiltered.length, setLocalDuplicatesPage)}
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
                    <th className="px-6 py-4">Nuevas Personas</th>
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
        <div className="w-full mt-12 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
          <MapView />
        </div>

        {/* Nuestro Compromiso */}
        <section className="bg-neutral-900/40 backdrop-blur-md border border-neutral-800/50 rounded-2xl p-6 text-sm text-neutral-300 leading-relaxed text-center shadow-lg w-full max-w-4xl mx-auto mt-12 relative overflow-hidden group">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-400/5 via-transparent to-transparent opacity-50"></div>
          <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-indigo-300 mb-6 relative z-10">Nuestro Compromiso</h2>
          <div className="leading-relaxed space-y-4 relative z-10 text-[15px]">
            <p>
              Esta aplicación nació para ayudar a centralizar la información, reducir el trabajo manual y facilitar la actualización de los datos, permitiendo que los equipos dediquen <strong className="text-blue-200 font-medium">más tiempo a las personas</strong> y menos tiempo a la transcripción.
            </p>
            <p>
              Es un proyecto desarrollado de forma independiente, voluntaria y sin fines de lucro. Creemos que la tecnología puede marcar una diferencia cuando se pone al servicio de quienes la necesitan, y esperamos que esta herramienta contribuya a hacer ese trabajo un poco más fácil.
            </p>
            <p>
              La aplicación utiliza Inteligencia Artificial para extraer y organizar la información de manera automática. Sin embargo, los resultados deben ser revisados y validados por el usuario antes de utilizarlos o publicarlos en otras plataformas, como hospitalesenvenezuela.com.
            </p>
            <p className="text-blue-300 font-semibold mt-4 text-base">
              Gracias por confiar en esta herramienta. Seguiremos mejorándola para que sea cada día más útil, rápida, sencilla y confiable. 💙
            </p>
          </div>
        </section>

        {/* Footer */}
        <div className="w-full text-center mt-6 mb-8 animate-in fade-in duration-700 delay-500">
          <p className="text-sm font-medium text-neutral-500 flex items-center justify-center gap-1.5 hover:text-neutral-300 transition-colors">
            Powered by
            <svg className="w-4 h-4 text-red-500 animate-pulse drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            por la vida
          </p>
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
                          <td className="px-6 py-3 font-medium text-white">
                            <div className="flex flex-col items-start justify-center gap-1">
                              <span>{p.nombre} {p.apellido}</span>
                              {p.isExternal ? (
                                <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                  {p.origen}
                                </span>
                              ) : (
                                <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                  LOCAL
                                </span>
                              )}
                            </div>
                          </td>
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

      {/* Invalids Preview Modal */}
      {showInvalidsPreview && invalidsPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-neutral-900 border border-red-500/30 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-neutral-800 flex justify-between items-center bg-neutral-950">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center border border-red-500/30">
                  <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Registros Incompletos</h3>
                  <p className="text-sm text-red-400/80">Total: {invalidsPreview.total} pacientes sin enviar al portal</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="text"
                  placeholder="Buscar en incompletos..."
                  value={invalidsSearch}
                  onChange={(e) => { setInvalidsSearch(e.target.value); setInvalidsPage(1); }}
                  className="px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 w-64"
                />
                <button
                  onClick={() => setShowInvalidsPreview(false)}
                  className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-0 custom-scrollbar flex flex-col">
              {(() => {
                const invalidsFiltered = invalidsPreview?.pacientes?.filter(p =>
                  `${p.nombre} ${p.apellido} ${p.cedula} ${p.centro} ${p.edad_sector}`.toLowerCase().includes(invalidsSearch.toLowerCase())
                ) || [];
                const invalidsItemsPerPage = 100;
                const invalidsCurrent = invalidsFiltered.slice((invalidsPage - 1) * invalidsItemsPerPage, invalidsPage * invalidsItemsPerPage);

                return invalidsFiltered.length === 0 ? (
                  <div className="p-12 text-center text-neutral-500 flex-1">No se encontraron pacientes incompletos.</div>
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
                        {invalidsCurrent.map((p, idx) => {
                          const missingNombre = !p.nombre || p.nombre.trim() === '';
                          const missingApellido = !p.apellido || p.apellido.trim() === '';
                          const missingCedula = !p.cedula || p.cedula.trim() === '';
                          const missingCentro = !p.centro || p.centro.trim() === '' || p.centro === 'N/D';

                          return (
                            <tr key={idx} className="hover:bg-red-500/5 transition-colors">
                              <td className="px-6 py-3 font-medium text-white">
                                <span className={missingNombre ? "text-red-500 font-bold" : ""}>{p.nombre || "[FALTA]"}</span>{" "}
                                <span className={missingApellido ? "text-red-500 font-bold" : ""}>{p.apellido || "[FALTA]"}</span>
                              </td>
                              <td className={`px-6 py-3 font-mono ${missingCedula ? "text-red-500 font-bold" : "text-green-300"}`}>{p.cedula || '[FALTA]'}</td>
                              <td className={`px-6 py-3 ${missingCentro ? "text-red-500 font-bold" : "opacity-80"}`}>{p.centro || '[FALTA]'}</td>
                              <td className="px-6 py-3 opacity-80">{p.edad_sector}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

            {(() => {
              const invalidsFiltered = invalidsPreview?.pacientes?.filter(p =>
                `${p.nombre} ${p.apellido} ${p.cedula} ${p.centro} ${p.edad_sector}`.toLowerCase().includes(invalidsSearch.toLowerCase())
              ) || [];
              return renderPagination(invalidsPage, invalidsFiltered.length, setInvalidsPage);
            })()}
          </div>
        </div>
      )}

      {/* RECOGNIZE MODAL */}
      {recognizeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-neutral-900 border border-indigo-500/30 rounded-2xl p-6 w-full max-w-md shadow-2xl relative shadow-[0_0_50px_rgba(79,70,229,0.15)]">
            <button onClick={() => setRecognizeModal(null)} className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h2 className="text-xl font-bold">Validar Coincidencia</h2>
            </div>

            <p className="text-sm text-neutral-300 mb-4">
              Estás confirmando que el paciente <strong>{recognizeModal.nombre_local} {recognizeModal.apellido_local}</strong> es la misma persona reportada como desaparecida bajo el nombre de <strong>{recognizeModal.nombre_externo} {recognizeModal.apellido_externo}</strong>.
            </p>

            <form onSubmit={handleRecognizeSubmit} className="flex flex-col gap-4 mt-6">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">Tu Nombre y Apellido *</label>
                <input required type="text" value={recognizeForm.nombre} onChange={e => setRecognizeForm({ ...recognizeForm, nombre: e.target.value })} className="w-full bg-neutral-950 border border-neutral-700/50 rounded-xl px-4 py-2.5 text-white placeholder-neutral-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all" placeholder="Ej. Dra. María Pérez" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">Tu Correo Electrónico *</label>
                <input required type="email" value={recognizeForm.email} onChange={e => setRecognizeForm({ ...recognizeForm, email: e.target.value })} className="w-full bg-neutral-950 border border-neutral-700/50 rounded-xl px-4 py-2.5 text-white placeholder-neutral-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all" placeholder="tucorreo@hospital.com" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">Teléfono (Opcional)</label>
                <input type="tel" value={recognizeForm.telefono} onChange={e => setRecognizeForm({ ...recognizeForm, telefono: e.target.value })} className="w-full bg-neutral-950 border border-neutral-700/50 rounded-xl px-4 py-2.5 text-white placeholder-neutral-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all" placeholder="+58 412..." />
              </div>

              <div className="flex gap-3 mt-4 pt-4 border-t border-neutral-800/50">
                <button type="button" onClick={() => setRecognizeModal(null)} className="flex-1 py-2.5 px-4 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold rounded-xl transition-all">Cancelar</button>
                <button type="submit" disabled={isRecognizing} className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2">
                  {isRecognizing ? (
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  ) : 'Confirmar Coincidencia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
