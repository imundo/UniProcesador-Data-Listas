'use client';

import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';

export default function AdminDashboard() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState('');

    const [stats, setStats] = useState({ pending: 0, processing: 0, completed: 0, error: 0, total: 0 });
    const [namesInput, setNamesInput] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadMsg, setUploadMsg] = useState('');

    // CrossMatch stats
    const [cmStats, setCmStats] = useState({ status: 'idle', progress: 0, total: 0, matchesFound: 0, percentage: 0 });
    const [syncMsg, setSyncMsg] = useState('');
    
    // RedAyuda Sync Stats
    const [redAyudaSyncing, setRedAyudaSyncing] = useState(false);
    const [redAyudaMsg, setRedAyudaMsg] = useState('');
    
    // CNE Stats
    const [cneStats, setCneStats] = useState({ validados: 0, rechazados: 0, procesados: 0 });
    const [cneModalOpen, setCneModalOpen] = useState(false);
    const [cneDetails, setCneDetails] = useState({ validados: [], rechazados: [], pagination: { page: 1, totalValidados: 0, totalRechazados: 0 } });
    const [cnePage, setCnePage] = useState(1);
    const [cneValidating, setCneValidating] = useState(false);
    const [cneMsg, setCneMsg] = useState('');
    const cneLoopRef = useRef(false);
    
    // Reverse CNE Stats
    const [revCneStats, setRevCneStats] = useState({ total_procesados: 0, total_resueltos: 0, total_homonimos: 0 });
    const [revCneValidating, setRevCneValidating] = useState(false);
    const [revCneMsg, setRevCneMsg] = useState('');
    const revCneLoopRef = useRef(false);
    const [homonimosModalOpen, setHomonimosModalOpen] = useState(false);
    const [homonimosData, setHomonimosData] = useState([]);

    // Reencuentro Stats
    const [reencuentroSyncing, setReencuentroSyncing] = useState(false);
    const [reencuentroMsg, setReencuentroMsg] = useState('');
    const [reencuentroStats, setReencuentroStats] = useState({ totalProcesados: 0, totalActualizados: 0, totalErrores: 0, ultimoProcesado: null });
    const [reencuentroUpdates, setReencuentroUpdates] = useState([]);

    // Función de Login simulada + Set de estado
    const handleLogin = (e) => {
        e.preventDefault();
        if (username === 'admin' && password === 'Amazonas=90') {
            setIsAuthenticated(true);
            setLoginError('');
            // Guardar token simple en session
            sessionStorage.setItem('adminToken', password);
        } else {
            setLoginError('Credenciales incorrectas');
        }
    };

    // Auto-login si ya existe la sesión
    useEffect(() => {
        const token = sessionStorage.getItem('adminToken');
        if (token === 'Amazonas=90') {
            setIsAuthenticated(true);
        }
    }, []);

    // Polling de estadísticas
    useEffect(() => {
        if (!isAuthenticated) return;

        const fetchStats = async () => {
            try {
                const token = sessionStorage.getItem('adminToken');
                const res = await fetch('/api/admin/extractor', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setStats(data);
                } else if (res.status === 401) {
                    setIsAuthenticated(false);
                }

                const resCm = await fetch('/api/crossmatch?mode=progress', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (resCm.ok) {
                    const dataCm = await resCm.json();
                    setCmStats(dataCm);
                }

                const resCne = await fetch('/api/admin/validate-cne?run=false', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (resCne.ok) {
                    const dataCne = await resCne.json();
                    setCneStats({ validados: dataCne.total_validados || 0, rechazados: dataCne.total_rechazados || 0, procesados: dataCne.total_procesados || 0 });
                }
                const resRevCne = await fetch('/api/admin/reverse-cne?run=false', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (resRevCne.ok) {
                    const dataRevCne = await resRevCne.json();
                    setRevCneStats({ 
                        total_procesados: dataRevCne.total_procesados || 0, 
                        total_resueltos: dataRevCne.total_resueltos || 0, 
                        total_homonimos: dataRevCne.total_homonimos || 0 
                    });
                }

                // Poll Reencuentro Sync status
                const resReencuentro = await fetch('/api/admin/sync-reencuentro', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (resReencuentro.ok) {
                    const dataReen = await resReencuentro.json();
                    setReencuentroSyncing(dataReen.isSyncing);
                    setReencuentroStats(dataReen.stats || { totalProcesados: 0, totalActualizados: 0, totalErrores: 0, ultimoProcesado: null });
                }

                // Poll Reencuentro recent updates
                const resUpdates = await fetch('/api/admin/reencuentro-updates', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (resUpdates.ok) {
                    const dataUpdates = await resUpdates.json();
                    setReencuentroUpdates(dataUpdates.updates || []);
                }
            } catch (err) {
                console.error("Error fetching stats", err);
            }
        };

        fetchStats(); // inicial
        const interval = setInterval(fetchStats, 5000); // Refrescar cada 5 segundos
        return () => clearInterval(interval);
    }, [isAuthenticated]);

    const handleForceSync = async () => {
        try {
            setSyncMsg('Iniciando...');
            const token = sessionStorage.getItem('adminToken');
            const res = await fetch('/api/crossmatch?force_sync=true', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success || data.error === 'Ya hay un cruce en ejecución') {
                setSyncMsg(data.message || data.error);
            } else {
                setSyncMsg('Error al iniciar');
            }
        } catch(e) {
            setSyncMsg('Error de conexión');
        }
    };

    const handleToggleReencuentroSync = async () => {
        try {
            setReencuentroMsg('Contactando...');
            const token = sessionStorage.getItem('adminToken');
            const url = reencuentroSyncing ? '/api/admin/sync-reencuentro?stop=true' : '/api/admin/sync-reencuentro?start=true';
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setReencuentroMsg(`✅ ${data.message}`);
                setReencuentroSyncing(data.isSyncing || !reencuentroSyncing);
            } else {
                setReencuentroMsg('❌ Error: ' + (data.error || 'Desconocido'));
            }
        } catch(e) {
            setReencuentroMsg('❌ Error de conexión');
        }
    };

    const [isDeduplicating, setIsDeduplicating] = useState(false);
    const [deduplicateMsg, setDeduplicateMsg] = useState('');

    const handleDeduplicate = async () => {
        if (!confirm('¿Seguro que deseas eliminar los duplicados exactos (Nombre, Apellido, Cédula)? Esta acción es irreversible.')) return;
        try {
            setIsDeduplicating(true);
            setDeduplicateMsg('Limpiando base de datos...');
            const token = sessionStorage.getItem('adminToken');
            const res = await fetch('/api/admin/deduplicate', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setDeduplicateMsg(`✅ ${data.message}`);
            } else {
                setDeduplicateMsg('❌ Error: ' + (data.error || 'Desconocido'));
            }
        } catch(e) {
            setDeduplicateMsg('❌ Error de conexión');
        } finally {
            setIsDeduplicating(false);
        }
    };

    const handleExport = () => {
        const token = sessionStorage.getItem('adminToken');
        window.open(`/api/admin/export?token=${token}`, '_blank');
    };

    const handleRedAyudaSync = async () => {
        try {
            setRedAyudaSyncing(true);
            setRedAyudaMsg('Extrayendo datos (Puppeteer Stealth)...');
            const token = sessionStorage.getItem('adminToken');
            const res = await fetch('/api/admin/sync-redayuda', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success) {
                setRedAyudaMsg(`✅ Éxito! Insertados: ${data.sync?.inserted}, Actualizados: ${data.sync?.updated}`);
            } else {
                setRedAyudaMsg('❌ Error: ' + (data.error || 'Desconocido'));
            }
        } catch(e) {
            setRedAyudaMsg('❌ Error de conexión');
        } finally {
            setRedAyudaSyncing(false);
        }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!namesInput.trim()) return;

        setIsUploading(true);
        setUploadMsg('');

        try {
            // Tratar de parsear como JSON si viene de un archivo, o saltos de linea
            let namesArray = [];
            try {
                const jsonParse = JSON.parse(namesInput);
                if (Array.isArray(jsonParse)) {
                    namesArray = jsonParse.map(n => typeof n === 'object' ? n.nombre || n.apellido_paterno : n);
                } else if (jsonParse.personas) {
                    namesArray = jsonParse.personas.map(n => n.nombre || n.apellido_paterno);
                }
            } catch {
                // Es texto plano (una por linea o comas)
                namesArray = namesInput.split(/[\n,]+/).map(n => n.trim()).filter(n => n.length > 2);
            }

            const token = sessionStorage.getItem('adminToken');
            const res = await fetch('/api/admin/extractor', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ names: namesArray })
            });

            if (res.ok) {
                const data = await res.json();
                setUploadMsg(data.message || 'Cargados con éxito');
                setNamesInput(''); // limpiar
            } else {
                setUploadMsg('Error cargando nombres. Código: ' + res.status);
            }
        } catch (err) {
            setUploadMsg('Error de red o procesamiento');
            console.error(err);
        } finally {
            setIsUploading(false);
        }
    };

    const handleRunCneValidation = async () => {
        if (cneValidating) {
            cneLoopRef.current = false;
            setCneValidating(false);
            setCneMsg('Validación detenida.');
            return;
        }

        cneLoopRef.current = true;
        setCneValidating(true);
        setCneMsg('Ejecutando proceso por lotes...');
        const token = sessionStorage.getItem('adminToken');

        const processNextBatch = async () => {
            if (!cneLoopRef.current) return;
            try {
                const res = await fetch('/api/admin/validate-cne?run=true', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                
                if (data.status === 'rate_limit') {
                    setCneMsg('Límite de peticiones Dateas (429), pausando 60s...');
                    setTimeout(processNextBatch, 60000);
                    return;
                }
                
                if (data.finished) {
                    cneLoopRef.current = false;
                    setCneValidating(false);
                    setCneMsg('¡No hay más registros pendientes!');
                    return;
                }
                
                setCneMsg(data.message || 'Procesando lote...');
                
                // Refrescar stats
                const resCne = await fetch('/api/admin/validate-cne?run=false', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (resCne.ok) {
                    const dataCne = await resCne.json();
                    setCneStats({ validados: dataCne.total_validados || 0, rechazados: dataCne.total_rechazados || 0, procesados: dataCne.total_procesados || 0 });
                }
                
                // Seguir con el siguiente lote
                setTimeout(processNextBatch, 1000);
            } catch(e) {
                console.error("Error en validación", e);
                setCneMsg('Error de red, reintentando en 5s...');
                if (cneLoopRef.current) setTimeout(processNextBatch, 5000);
            }
        };

        processNextBatch();
    };

    const loadCnePage = async (pageToLoad) => {
        try {
            const token = sessionStorage.getItem('adminToken');
            const res = await fetch(`/api/admin/cne-details?page=${pageToLoad}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setCneDetails(data);
                setCnePage(pageToLoad);
            }
        } catch(e) {
            console.error(e);
        }
    };

    const handleRunRevCneValidation = async () => {
        if (revCneValidating) {
            revCneLoopRef.current = false;
            setRevCneValidating(false);
            setRevCneMsg('Validación inversa detenida.');
            return;
        }

        revCneLoopRef.current = true;
        setRevCneValidating(true);
        setRevCneMsg('Ejecutando proceso inverso por lotes...');
        const token = sessionStorage.getItem('adminToken');

        const processNextBatch = async () => {
            if (!revCneLoopRef.current) return;
            try {
                const res = await fetch('/api/admin/reverse-cne?run=true', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                
                if (data.status === 'rate_limit') {
                    setRevCneMsg('Límite de peticiones Dateas (429), pausando 60s...');
                    setTimeout(processNextBatch, 60000);
                    return;
                }
                
                if (data.finished) {
                    revCneLoopRef.current = false;
                    setRevCneValidating(false);
                    setRevCneMsg('¡No hay más registros pendientes!');
                    return;
                }
                
                setRevCneMsg(data.message || 'Procesando lote...');
                
                const resCne = await fetch('/api/admin/reverse-cne?run=false', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (resCne.ok) {
                    const dataCne = await resCne.json();
                    setRevCneStats({ 
                        total_procesados: dataCne.total_procesados || 0, 
                        total_resueltos: dataCne.total_resueltos || 0, 
                        total_homonimos: dataCne.total_homonimos || 0 
                    });
                }

                if (revCneLoopRef.current) {
                    setTimeout(processNextBatch, 1000);
                }
            } catch (err) {
                setRevCneMsg('Error: ' + err.message);
                revCneLoopRef.current = false;
                setRevCneValidating(false);
            }
        };

        processNextBatch();
    };

    const handleResetOmitted = async () => {
        if (!confirm('¿Deseas restaurar todas las cédulas omitidas (Cédulas > 22M u otras) para que se vuelvan a intentar validar?')) return;
        
        const token = sessionStorage.getItem('adminToken');
        try {
            const res = await fetch('/api/admin/reset-omitted', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                alert(data.message);
            } else {
                alert('Error al restaurar cédulas omitidas.');
            }
        } catch (e) {
            console.error(e);
            alert('Error de conexión.');
        }
    };

    const handleOpenHomonimos = async () => {
        setHomonimosModalOpen(true);
        const token = sessionStorage.getItem('adminToken');
        try {
            const res = await fetch('/api/admin/homonyms', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setHomonimosData(data.homonimos || []);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleResolveHomonimo = async (id, table, cedula) => {
        const token = sessionStorage.getItem('adminToken');
        try {
            const res = await fetch('/api/admin/homonyms', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ id, table, cedula })
            });
            if (res.ok) {
                setHomonimosData(prev => prev.filter(h => h.id !== id || h.table !== table));
            } else {
                alert('Error al resolver homónimo');
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleOpenCneModal = async () => {
        setCneModalOpen(true);
        await loadCnePage(1);
    };

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6 text-neutral-200">
                <Head><title>Admin Login - Extractor</title></Head>
                <form onSubmit={handleLogin} className="bg-neutral-900/60 backdrop-blur-xl border border-neutral-800 p-8 rounded-3xl w-full max-w-sm shadow-2xl">
                    <h1 className="text-3xl font-bold text-center mb-8 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">Extractor Admin</h1>
                    
                    <div className="mb-4">
                        <label className="block text-sm font-medium mb-2 text-neutral-400">Usuario</label>
                        <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" required />
                    </div>
                    
                    <div className="mb-6">
                        <label className="block text-sm font-medium mb-2 text-neutral-400">Contraseña</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500" required />
                    </div>
                    
                    {loginError && <p className="text-red-400 text-sm mb-4 text-center">{loginError}</p>}
                    
                    <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors">
                        Ingresar
                    </button>
                </form>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-200 p-6 md:p-12 relative overflow-hidden">
            <Head><title>Dashboard del Extractor</title></Head>
            {/* Background Glows */}
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-900/10 blur-[120px] rounded-full pointer-events-none" />
            
            <div className="max-w-5xl mx-auto relative z-10">
                <div className="flex justify-between items-center mb-10">
                    <h1 className="text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
                        Monitoreo del Extractor en Segundo Plano
                    </h1>
                    <button onClick={() => { sessionStorage.removeItem('adminToken'); setIsAuthenticated(false); }} className="text-neutral-500 hover:text-white px-4 py-2 border border-neutral-800 rounded-lg">
                        Salir
                    </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
                    <div className="bg-neutral-900/50 backdrop-blur-md border border-neutral-800 p-6 rounded-3xl flex flex-col items-center">
                        <span className="text-neutral-500 uppercase tracking-widest text-xs font-bold mb-2">Total</span>
                        <span className="text-4xl font-black text-white">{stats.total}</span>
                    </div>
                    <div className="bg-blue-950/20 backdrop-blur-md border border-blue-900/50 p-6 rounded-3xl flex flex-col items-center">
                        <span className="text-blue-500 uppercase tracking-widest text-xs font-bold mb-2 flex items-center gap-2">
                            {stats.pending > 0 && <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span></span>}
                            Pendientes
                        </span>
                        <span className="text-4xl font-black text-blue-100">{stats.pending}</span>
                    </div>
                    <div className="bg-emerald-950/20 backdrop-blur-md border border-emerald-900/50 p-6 rounded-3xl flex flex-col items-center">
                        <span className="text-emerald-500 uppercase tracking-widest text-xs font-bold mb-2">Completados</span>
                        <span className="text-4xl font-black text-emerald-100">{stats.completed}</span>
                    </div>
                    <div className="bg-red-950/20 backdrop-blur-md border border-red-900/50 p-6 rounded-3xl flex flex-col items-center">
                        <span className="text-red-500 uppercase tracking-widest text-xs font-bold mb-2">Errores</span>
                        <span className="text-4xl font-black text-red-100">{stats.error}</span>
                    </div>
                </div>

                <div className="bg-neutral-900/40 backdrop-blur-xl border border-neutral-800 rounded-3xl p-6 md:p-8 mb-12">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-white">Validación CNE (Dateas)</h2>
                        <div className="flex items-center gap-4">
                            <span className="text-emerald-400 font-medium text-sm">{cneMsg}</span>
                            <button 
                                onClick={handleResetOmitted}
                                className="text-white font-bold py-2 px-4 rounded-xl transition-colors flex items-center bg-neutral-600 hover:bg-neutral-500 text-sm"
                            >
                                Reintentar Omitidos
                            </button>
                            <button 
                                onClick={handleRunCneValidation}
                                className={`text-white font-bold py-2 px-6 rounded-xl transition-colors flex items-center ${cneValidating ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}`}
                            >
                                {cneValidating ? 'Detener Validación' : 'Ejecutar Validación Continua'}
                            </button>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" onClick={handleOpenCneModal} style={{cursor: 'pointer'}}>
                        <div className="bg-blue-950/20 hover:bg-blue-950/40 transition-colors backdrop-blur-md border border-blue-900/50 p-6 rounded-2xl flex flex-col items-center relative group">
                            <span className="text-blue-500 uppercase tracking-widest text-xs font-bold mb-2">Total Procesados</span>
                            <span className="text-4xl font-black text-blue-100">{cneStats.procesados || 0}</span>
                            <span className="text-blue-500/50 text-xs mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Incluye los ignorados</span>
                        </div>
                        <div className="bg-green-950/20 hover:bg-green-950/40 transition-colors backdrop-blur-md border border-green-900/50 p-6 rounded-2xl flex flex-col items-center relative group">
                            <span className="text-green-500 uppercase tracking-widest text-xs font-bold mb-2">Validados por CNE</span>
                            <span className="text-4xl font-black text-green-100">{cneStats.validados}</span>
                            <span className="text-green-500/50 text-xs mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Click para ver detalles</span>
                        </div>
                        <div className="bg-orange-950/20 hover:bg-orange-950/40 transition-colors backdrop-blur-md border border-orange-900/50 p-6 rounded-2xl flex flex-col items-center relative group">
                            <span className="text-orange-500 uppercase tracking-widest text-xs font-bold mb-2">Rechazados por CNE</span>
                            <span className="text-4xl font-black text-orange-100">{cneStats.rechazados}</span>
                            <span className="text-orange-500/50 text-xs mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Click para ver detalles</span>
                        </div>
                    </div>
                </div>

                <div className="bg-neutral-900/40 backdrop-blur-xl border border-neutral-800 rounded-3xl p-6 md:p-8 mb-12">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-white">Búsqueda Inversa CNE (Nombre → Cédula)</h2>
                        <div className="flex items-center gap-4">
                            <span className="text-emerald-400 font-medium text-sm">{revCneMsg}</span>
                            <button 
                                onClick={handleRunRevCneValidation}
                                className={`text-white font-bold py-2 px-6 rounded-xl transition-colors flex items-center ${revCneValidating ? 'bg-red-600 hover:bg-red-500' : 'bg-purple-600 hover:bg-purple-500'}`}
                            >
                                {revCneValidating ? 'Detener Búsqueda' : 'Ejecutar Búsqueda Inversa'}
                            </button>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-purple-950/20 backdrop-blur-md border border-purple-900/50 p-6 rounded-2xl flex flex-col items-center">
                            <span className="text-purple-500 uppercase tracking-widest text-xs font-bold mb-2">Total Procesados</span>
                            <span className="text-4xl font-black text-purple-100">{revCneStats.total_procesados || 0}</span>
                        </div>
                        <div className="bg-emerald-950/20 backdrop-blur-md border border-emerald-900/50 p-6 rounded-2xl flex flex-col items-center">
                            <span className="text-emerald-500 uppercase tracking-widest text-xs font-bold mb-2">Resueltos Exactos</span>
                            <span className="text-4xl font-black text-emerald-100">{revCneStats.total_resueltos || 0}</span>
                        </div>
                        <div 
                            className="bg-yellow-950/20 hover:bg-yellow-950/40 transition-colors backdrop-blur-md border border-yellow-900/50 p-6 rounded-2xl flex flex-col items-center relative group cursor-pointer"
                            onClick={handleOpenHomonimos}
                        >
                            <span className="text-yellow-500 uppercase tracking-widest text-xs font-bold mb-2">Homónimos Pendientes</span>
                            <span className="text-4xl font-black text-yellow-100">{revCneStats.total_homonimos || 0}</span>
                            <span className="text-yellow-500/50 text-xs mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Click para resolver manualmente</span>
                        </div>
                    </div>
                </div>

                <div className="bg-neutral-900/40 backdrop-blur-xl border border-neutral-800 rounded-3xl p-6 md:p-8 mb-12">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">🔄 Sincronizador Reencuentro.help</h2>
                        <div className="flex items-center gap-4">
                            <span className="text-emerald-400 font-medium text-sm">{reencuentroMsg}</span>
                            <button 
                                onClick={handleToggleReencuentroSync}
                                className={`text-white font-bold py-2 px-6 rounded-xl transition-colors flex items-center ${reencuentroSyncing ? 'bg-red-600 hover:bg-red-500' : 'bg-cyan-600 hover:bg-cyan-500'}`}
                            >
                                {reencuentroSyncing ? 'Detener Sincronización' : 'Iniciar Sincronización Masiva'}
                            </button>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <div className="bg-cyan-950/20 backdrop-blur-md border border-cyan-900/50 p-6 rounded-2xl flex flex-col items-center">
                            <span className="text-cyan-500 uppercase tracking-widest text-xs font-bold mb-2">Total Procesados</span>
                            <span className="text-4xl font-black text-cyan-100">{reencuentroStats.totalProcesados || 0}</span>
                        </div>
                        <div className="bg-emerald-950/20 backdrop-blur-md border border-emerald-900/50 p-6 rounded-2xl flex flex-col items-center">
                            <span className="text-emerald-500 uppercase tracking-widest text-xs font-bold mb-2">Estados Actualizados</span>
                            <span className="text-4xl font-black text-emerald-100">{reencuentroStats.totalActualizados || 0}</span>
                        </div>
                        <div className="bg-red-950/20 backdrop-blur-md border border-red-900/50 p-6 rounded-2xl flex flex-col items-center">
                            <span className="text-red-500 uppercase tracking-widest text-xs font-bold mb-2">Errores / Rate Limits</span>
                            <span className="text-4xl font-black text-red-100">{reencuentroStats.totalErrores || 0}</span>
                        </div>
                        <div className="bg-neutral-950/40 backdrop-blur-md border border-neutral-800 p-6 rounded-2xl flex flex-col justify-center items-center">
                            <span className="text-neutral-500 uppercase tracking-widest text-xs font-bold mb-2">Último Consultado</span>
                            <span className="text-sm font-medium text-neutral-300 text-center truncate w-full">{reencuentroStats.ultimoProcesado || 'Ninguno'}</span>
                        </div>
                    </div>

                    {reencuentroUpdates.length > 0 && (
                        <div className="mt-8">
                            <h3 className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-4">Actualizados Recientemente</h3>
                            <div className="bg-neutral-950/50 rounded-xl border border-neutral-800 overflow-hidden">
                                {reencuentroUpdates.map((u, i) => (
                                    <div key={i} className="flex justify-between items-center p-4 border-b border-neutral-800/50 hover:bg-neutral-900/50 transition-colors last:border-0">
                                        <div>
                                            <div className="text-white font-bold">{u.nombre} {u.apellido}</div>
                                            <div className="text-xs text-neutral-500">C.I: {u.cedula || 'N/A'} • {new Date(u.fecha_cambio).toLocaleString()}</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-mono bg-neutral-800 text-neutral-400 px-2 py-1 rounded">{u.estado_anterior}</span>
                                            <span className="text-neutral-600">→</span>
                                            <span className="text-xs font-bold font-mono bg-emerald-900/40 text-emerald-400 px-2 py-1 rounded border border-emerald-800/50">{u.nuevo_estado}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-neutral-900/40 backdrop-blur-xl border border-neutral-800 rounded-3xl p-6 md:p-8 mb-12">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-white">Optimización de Base de Datos</h2>
                        <div className="flex items-center gap-4">
                            <span className="text-emerald-400 font-medium text-sm">{deduplicateMsg}</span>
                            <button 
                                onClick={handleDeduplicate}
                                disabled={isDeduplicating}
                                className={`text-white font-bold py-2 px-6 rounded-xl transition-colors flex items-center ${isDeduplicating ? 'bg-neutral-600 cursor-not-allowed' : 'bg-red-600 hover:bg-red-500'}`}
                            >
                                {isDeduplicating ? 'Desduplicando...' : 'Desduplicar Exactos (Cédulas)'}
                            </button>
                            <button 
                                onClick={handleExport}
                                className="text-white font-bold py-2 px-6 rounded-xl transition-colors flex items-center bg-blue-600 hover:bg-blue-500"
                            >
                                Empaquetar y Descargar JSON
                            </button>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-neutral-950/20 backdrop-blur-md border border-neutral-800 p-6 rounded-2xl">
                            <h3 className="text-white font-bold mb-2 flex items-center gap-2">🧹 Desduplicación SQL</h3>
                            <p className="text-neutral-400 text-sm">Ejecuta una limpieza a nivel de motor de Base de Datos que unifica y elimina registros repetidos que compartan exactamente la misma Cédula.</p>
                        </div>
                        <div className="bg-neutral-950/20 backdrop-blur-md border border-neutral-800 p-6 rounded-2xl">
                            <h3 className="text-white font-bold mb-2 flex items-center gap-2">📦 Empaquetado de Datos</h3>
                            <p className="text-neutral-400 text-sm">Descarga toda la base de datos local limpia y validada en un archivo JSON estructurado para su uso en otras herramientas.</p>
                        </div>
                    </div>
                </div>

                <div className="bg-neutral-900/40 backdrop-blur-xl border border-neutral-800 rounded-3xl p-6 md:p-8">
                    <h2 className="text-2xl font-bold mb-4 text-white">Inyectar Términos a la Cola</h2>
                    <p className="text-neutral-400 mb-6">Pega aquí una lista de nombres (separados por saltos de línea o comas), o directamente el contenido de tu archivo JSON de nombres.</p>
                    
                    <form onSubmit={handleUpload}>
                        <textarea 
                            className="w-full h-48 bg-neutral-950 border border-neutral-800 rounded-xl p-4 text-neutral-300 focus:outline-none focus:border-blue-500 font-mono text-sm"
                            placeholder='Ejemplo:&#10;Juan Perez&#10;Maria Gimenez&#10;&#10;O pega el JSON {"personas": [{"nombre": "..."}]}'
                            value={namesInput}
                            onChange={(e) => setNamesInput(e.target.value)}
                        />
                        
                        <div className="mt-4 flex items-center justify-between">
                            <span className="text-emerald-400 font-medium">{uploadMsg}</span>
                            <button 
                                type="submit" 
                                disabled={isUploading || namesInput.trim().length === 0}
                                className="bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-bold py-3 px-8 rounded-xl transition-colors flex items-center"
                            >
                                {isUploading ? 'Procesando...' : 'Encolar Nombres'}
                            </button>
                        </div>
                    </form>
                </div>
                
                <div className="bg-neutral-900/40 backdrop-blur-xl border border-neutral-800 rounded-3xl p-6 md:p-8 mt-8">
                    <h2 className="text-2xl font-bold mb-4 text-white">Deduplicación y Cruce Inteligente</h2>
                    <p className="text-neutral-400 mb-6">El sistema limpia los duplicados y busca coincidencias automáticamente cada hora. Si necesitas forzar una actualización inmediata, puedes hacerlo aquí.</p>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-neutral-950 border border-neutral-800 p-4 rounded-2xl flex flex-col items-center">
                            <span className="text-neutral-500 uppercase text-[10px] font-bold mb-1">Estado</span>
                            <span className="text-xl font-bold text-white capitalize">{cmStats.status}</span>
                        </div>
                        <div className="bg-neutral-950 border border-neutral-800 p-4 rounded-2xl flex flex-col items-center">
                            <span className="text-neutral-500 uppercase text-[10px] font-bold mb-1">Avance</span>
                            <span className="text-xl font-bold text-blue-400">{cmStats.progress} / {cmStats.total}</span>
                        </div>
                        <div className="bg-neutral-950 border border-neutral-800 p-4 rounded-2xl flex flex-col items-center">
                            <span className="text-neutral-500 uppercase text-[10px] font-bold mb-1">Progreso</span>
                            <span className="text-xl font-bold text-white">
                                {cmStats.status === 'running' && <span className="relative flex h-3 w-3 inline-block mr-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span></span>}
                                {cmStats.percentage}%
                            </span>
                        </div>
                        <div className="bg-neutral-950 border border-neutral-800 p-4 rounded-2xl flex flex-col items-center">
                            <span className="text-neutral-500 uppercase text-[10px] font-bold mb-1">Encontrados</span>
                            <span className="text-xl font-bold text-emerald-400">{cmStats.matchesFound}</span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-emerald-400 font-medium">{syncMsg}</span>
                        <button 
                            onClick={handleForceSync}
                            disabled={cmStats.status === 'running'}
                            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-bold py-3 px-8 rounded-xl transition-colors"
                        >
                            {cmStats.status === 'running' ? 'Procesando...' : 'Forzar Limpieza y Cruce'}
                        </button>
                    </div>
                </div>

                <div className="bg-neutral-900/40 backdrop-blur-xl border border-neutral-800 rounded-3xl p-6 md:p-8 mt-8">
                    <h2 className="text-2xl font-bold mb-4 text-white">Sincronización de Orígenes Externos</h2>
                    <p className="text-neutral-400 mb-6">Extrae los datos más recientes de plataformas aliadas mediante web scraping indetectable.</p>
                    
                    <div className="flex flex-col md:flex-row items-center justify-between bg-neutral-950 p-4 border border-neutral-800 rounded-2xl">
                        <div className="mb-4 md:mb-0">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></span>
                                RedAyudaVenezuela.com
                            </h3>
                            <p className="text-neutral-500 text-sm mt-1">Descarga toda la base de datos pública y la unifica localmente.</p>
                        </div>
                        <div className="flex items-center gap-4 flex-col md:flex-row w-full md:w-auto">
                            <span className={`font-medium text-sm text-center ${redAyudaMsg.includes('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
                                {redAyudaMsg}
                            </span>
                            <button 
                                onClick={handleRedAyudaSync}
                                disabled={redAyudaSyncing}
                                className="bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-900/50 hover:border-red-500/50 hover:text-white disabled:opacity-50 font-bold py-3 px-8 rounded-xl transition-colors w-full md:w-auto"
                            >
                                {redAyudaSyncing ? 'Extrayendo...' : 'Sincronizar Ahora'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="mt-8 text-center text-neutral-600 text-sm">
                    El worker se ejecuta automáticamente cada 2 minutos y procesa 3 términos a la vez para prevenir baneos.
                </div>
            </div>

            {/* CNE Modal */}
            {cneModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-neutral-900 border border-neutral-700 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
                        <div className="p-6 border-b border-neutral-800 flex justify-between items-center bg-neutral-950">
                            <h3 className="text-xl font-bold text-white">Detalles de Validación CNE (Página {cnePage})</h3>
                            <button onClick={() => setCneModalOpen(false)} className="text-neutral-400 hover:text-white">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 gap-6 custom-scrollbar">
                            <div>
                                <h4 className="text-lg font-bold text-green-400 mb-4 sticky top-0 bg-neutral-900 py-2 z-10 border-b border-neutral-800">✅ Validados ({cneDetails.pagination?.totalValidados || 0})</h4>
                                <div className="flex flex-col gap-3">
                                    {cneDetails.validados.map((p, idx) => (
                                        <div key={idx} className="bg-neutral-950 p-4 border border-green-900/30 rounded-xl">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className="font-bold text-white text-sm">{p.nombre} {p.apellido}</div>
                                                    <div className="font-mono text-green-300 text-xs mt-1">{p.cedula}</div>
                                                    <div className="text-neutral-500 text-[10px] mt-1 capitalize">{p.source.replace('_', ' ')}</div>
                                                </div>
                                                <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-neutral-800 ${p.cne_validado === 1 ? 'text-green-400' : 'text-yellow-400'}`}>
                                                    {p.cne_validado === 1 ? 'Exacto' : 'Parcial'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                    {cneDetails.validados.length === 0 && <div className="text-neutral-500 text-center py-8">No hay registros</div>}
                                </div>
                            </div>
                            <div>
                                <h4 className="text-lg font-bold text-orange-400 mb-4 sticky top-0 bg-neutral-900 py-2 z-10 border-b border-neutral-800">❌ Rechazados ({cneDetails.pagination?.totalRechazados || 0})</h4>
                                <div className="flex flex-col gap-3">
                                    {cneDetails.rechazados.map((p, idx) => (
                                        <div key={idx} className="bg-neutral-950 p-4 border border-orange-900/30 rounded-xl opacity-70">
                                            <div className="font-bold text-white text-sm">{p.nombre} {p.apellido}</div>
                                            <div className="font-mono text-orange-300 text-xs mt-1">{p.cedula}</div>
                                            <div className="text-neutral-500 text-[10px] mt-1 capitalize">{p.source.replace('_', ' ')}</div>
                                        </div>
                                    ))}
                                    {cneDetails.rechazados.length === 0 && <div className="text-neutral-500 text-center py-8">No hay registros</div>}
                                </div>
                            </div>
                        </div>

                        {/* Pagination Controls */}
                        <div className="p-4 border-t border-neutral-800 bg-neutral-950 flex justify-between items-center">
                            <button 
                                onClick={() => loadCnePage(cnePage - 1)}
                                disabled={cnePage <= 1}
                                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white rounded-lg transition-colors text-sm font-bold"
                            >
                                ← Anterior
                            </button>
                            <span className="text-neutral-400 text-sm">Página {cnePage}</span>
                            <button 
                                onClick={() => loadCnePage(cnePage + 1)}
                                disabled={cneDetails.validados.length < 50 && cneDetails.rechazados.length < 50}
                                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white rounded-lg transition-colors text-sm font-bold"
                            >
                                Siguiente →
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal de Homónimos */}
            {homonimosModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 md:p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto relative shadow-2xl">
                        <button 
                            onClick={() => setHomonimosModalOpen(false)}
                            className="absolute top-6 right-6 text-neutral-400 hover:text-white transition-colors"
                        >
                            ✕ Cerrar
                        </button>
                        
                        <h3 className="text-2xl font-bold mb-6 text-white flex items-center gap-3">
                            <span className="bg-yellow-500/20 text-yellow-500 p-2 rounded-lg">⚠️</span>
                            Resolución de Homónimos
                        </h3>

                        {homonimosData.length === 0 ? (
                            <div className="text-center py-12 text-neutral-400">
                                No hay homónimos pendientes por resolver.
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {homonimosData.map(h => (
                                    <div key={`${h.table}-${h.id}`} className="bg-neutral-950 border border-neutral-800 rounded-xl p-4">
                                        <div className="mb-3 flex justify-between items-start">
                                            <div>
                                                <h4 className="text-lg font-bold text-white">{h.nombre} {h.apellido}</h4>
                                                <div className="text-sm text-neutral-400 mt-1">Centro: {h.centro || 'N/A'} <span className="mx-2">|</span> Origen: {h.table === 'pacientes' ? 'Local' : 'Externo'}</div>
                                            </div>
                                            <span className="bg-yellow-900/30 text-yellow-500 text-xs px-2 py-1 rounded-full border border-yellow-900/50">
                                                {h.opciones.length} opciones
                                            </span>
                                        </div>
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                                            {h.opciones.map((op, idx) => (
                                                <div 
                                                    key={idx} 
                                                    className="bg-neutral-900 border border-neutral-800 hover:border-blue-500/50 hover:bg-blue-950/20 transition-all rounded-lg p-3 cursor-pointer group flex items-center justify-between"
                                                    onClick={() => handleResolveHomonimo(h.id, h.table, op.cedula)}
                                                >
                                                    <div>
                                                        <div className="text-white font-medium">{op.nombre}</div>
                                                        <div className="text-blue-400 font-mono text-sm mt-1">{op.cedula}</div>
                                                    </div>
                                                    <div className="text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        Asignar →
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-4 flex justify-end">
                                             <button 
                                                onClick={() => handleResolveHomonimo(h.id, h.table, '')} // Asignar vacío si ninguna cuadra, para pasarlo a fallido/not found? Mejor lo dejamos así por ahora, que elija uno o lo ignore.
                                                className="text-neutral-500 hover:text-red-400 text-xs transition-colors"
                                             >
                                                Ninguno coincide (Ignorar)
                                             </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
