'use client';

import { useState, useEffect } from 'react';
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

                <div className="mt-8 text-center text-neutral-600 text-sm">
                    El worker se ejecuta automáticamente cada 2 minutos y procesa 3 términos a la vez para prevenir baneos.
                </div>
            </div>
        </div>
    );
}
