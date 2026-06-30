# UniProcesador Data Listas - Core Platform

Una plataforma integral y automatizada construida sobre **Next.js** y **Node.js** para la consolidación, extracción inteligente, validación de identidades y cruce de datos (Cross-Matching) de pacientes médicos provenientes de múltiples fuentes (locales y externas).

---

## 🚀 Tecnologías Utilizadas

*   **Frontend & Backend:** [Next.js (App Router)](https://nextjs.org/) para interfaces interactivas y endpoints de API en un solo entorno unificado.
*   **Base de Datos:** SQLite optimizado mediante la librería `better-sqlite3`. Se utiliza el modo WAL (`journal_mode = WAL`) para garantizar altísimo rendimiento en escrituras y lecturas concurrentes sin bloqueos.
*   **Scraping & Extracción:** 
    *   `Puppeteer` (Navegador Headless) para extracción dinámica de registros externos.
    *   Consultas a motores de terceros (Sistemaspnp, Dateas) mediante peticiones HTTP.
*   **Red de Proxys (Evasión de Bloqueos):** Integración con Proxys anónimos (ej. `api.allorigins.win`) para esquivar baneos de IP o restricciones de Cloudflare al validar identidades masivamente.
*   **Planificador de Tareas (Cron):** Sistema de colas en memoria y base de datos (Background Workers) que procesan validaciones, scrapings y emparejamientos de forma asíncrona y desatendida.

---

## 🗄️ Modelo Entidad-Relación (Base de Datos)

La base de datos principal (`web/data/pacientes.db`) consta de las siguientes entidades clave:

1.  **`pacientes` (Base Local):**
    *   Almacena los registros cargados manualmente u originados internamente por la institución.
    *   *Campos:* `id`, `nombre`, `apellido`, `cedula`, `centro`, `edad_sector`, `estatus`, `fecha_ingreso`, `cne_validado`.
2.  **`registros_externos` (Fuentes Externas):**
    *   Almacena pacientes encontrados en otras clínicas, sitios web públicos o sistemas de contingencia mediante los scrapers.
    *   *Campos:* `id`, `nombre`, `apellido`, `cedula`, `centro`, `estado`, `origen`, `fuente_url`.
3.  **`cross_matches` (Emparejamientos / Match Engine):**
    *   Tabla puente que vincula un paciente de la base local con uno encontrado en los registros externos cuando la IA/Motor detecta que son la misma persona.
    *   *Campos:* `paciente_id` (FK), datos locales, datos externos, `match_score` (Nivel de coincidencia), `status`.
4.  **`historial_estados` (Auditoría):**
    *   Alimentada por *Triggers* automáticos de SQLite. Registra cada vez que un paciente cambia de estatus (ej. "En lista de espera" -> "Atendido").
5.  **`extraction_queue` (Cola de Trabajo):**
    *   Términos o nombres que los workers en segundo plano deben buscar y extraer de la red (ej. Puppeteer).
6.  **`hospital_locations`:**
    *   Geolocalización (Lat/Lon) de centros médicos para cálculos de distancias.

---

## ⚙️ Arquitectura de Conexiones y Consumo de Recursos

La aplicación está diseñada para manejar grandes volúmenes de datos con consumo de hardware y red altamente controlado:

1.  **Base de Datos Local (Zero-Latency):** Al usar SQLite de forma local, el consumo de red hacia una BD externa es nulo. Las lecturas de millones de registros ocurren en milisegundos gracias al modo WAL.
2.  **Workers Asíncronos (Colas de Procesamiento):**
    *   Las validaciones contra entes externos (CNE) y el scraping no congelan la interfaz.
    *   Se procesan en **lotes controlados** (ej. 3 a 5 registros por lote) mediante bucles iterativos `for...of`.
3.  **Prevención de Bloqueos (Rate Limiting y Fallbacks):**
    *   *Pausas (Sleep):* Las peticiones salientes tienen intervalos de 800ms a 2000ms para emular comportamiento humano.
    *   *Fallback Híbrido:* Si el servidor externo principal bloquea la IP del nodo (IP Ban / HTTP 522), el sistema de red enruta la petición automáticamente por debajo de la mesa usando Proxys anónimos (CORS proxies o AllOrigins) hacia un motor alternativo.
4.  **Consumo de Memoria RAM (Puppeteer):** Limitado por el diseño secuencial. No se abren 100 navegadores simultáneos, sino un Pool controlado que destruye las páginas tras completar la extracción del lote.

---

## 🔄 Flujos de Trabajo y Casos de Uso (Workflows)

### 1. Ingesta y Unificación de Datos (Seed)
*   **Actor:** Administrador.
*   **Acción:** Sube archivos Excel/CSV. El sistema normaliza (limpia acentos, espacios), elimina duplicados exactos usando lógica de bases de datos, e inserta la carga masiva en la tabla `pacientes`.

### 2. Extracción de Registros Externos (Scraping Worker)
*   **Disparador:** Tarea Cron (cada 2 minutos) o acción manual.
*   **Proceso:** El worker lee la tabla `extraction_queue`. Lanza un navegador invisible (Puppeteer), navega a portales médicos/públicos buscando ese término, extrae los datos HTML de las coincidencias y los guarda en `registros_externos` limpios y estructurados.

### 3. Motor de Emparejamiento (Cross-Match Scheduler)
*   **Disparador:** Planificador automático (cada 1 hora).
*   **Proceso:** El sistema compara los 22 millones de combinaciones entre `pacientes` y `registros_externos`.
*   **Algoritmo:** Aplica lógica de similitud fonética y de cadenas. Si el `match_score` supera el umbral, crea un registro en `cross_matches` avisando que un paciente local ha sido encontrado recibiendo tratamiento en otro centro médico externo.

### 4. Validación de Identidad (Búsqueda Inversa y Directa CNE)
*   **Actor:** Sistema Automatizado (o Administrador mediante botón).
*   **Búsqueda Inversa:** Para pacientes sin cédula, el sistema envía el Nombre completo a un motor externo (Dateas vía Proxy). Analiza el HTML, extrae la cédula, resuelve problemas de homónimos, y la inyecta en la base de datos local.
*   **Validación Directa:** Para pacientes con cédula, el sistema se conecta a `sistemaspnp` resolviendo el CAPTCHA matemáticamente en memoria. Verifica que la cédula pertenezca realmente a ese nombre.
    *   *Fase 1:* Petición GET para obtener sesión y Captcha.
    *   *Fase 2:* POST matemático.
    *   *Fase 3 (Fallback):* Si Sistemaspnp falla o banea la IP, redirige la consulta a Dateas mediante un Proxy para no detener la cola.

### 5. Chatbot Inteligente (IA Contextual)
*   **Actor:** Usuario Médico / Operador.
*   **Proceso:** El usuario hace preguntas en lenguaje natural (Ej. "¿Cuántos pacientes de oftalmología tenemos?"). El Chatbot interpreta la intención y (si aplica) formula búsquedas en la base de datos SQLite para retornar estadísticas y respuestas precisas en tiempo real.
