# UniProcesador Data Listas (IA Extractor)

Una aplicación de consola en Node.js, optimizada y potente, para la extracción automatizada y unificación de datos médicos (pacientes) utilizando Inteligencia Artificial (OpenAI gpt-4o-mini).

## 🚀 ¿Qué hace?

El programa automatiza el trabajo de transcribir listas de pacientes contenidas en:
1. **Imágenes** (.jpg, .png) locales o alojadas en Google Drive/Web.
2. **Videos** (.mp4) locales o extraídos de Instagram Reels/TikTok.
3. **Documentos** (.pdf) como informes o consolidados de pacientes.

Lee estos archivos, extrae la información clave usando IA y la guarda ordenadamente en un archivo de Excel/CSV (`plantilla_pacientes.csv`) unificado.

## ✨ Características Principales

*   **Motor OpenAI**: Utiliza el modelo `gpt-4o-mini` (API de Visión y Texto) garantizando extracción perfecta de datos a costos mínimos.
*   **Procesamiento de Video (FFmpeg)**: Extrae automáticamente fotogramas clave de videos para que la IA los analice sin necesidad de subir archivos pesados.
*   **Lectura de PDFs**: Integra `pdf-parse` para destripar documentos estructurados y pasarlos directamente a la IA.
*   **Descarga Automática**: Usa `yt-dlp` para bajar contenido web (ej. Instagram) al vuelo.
*   **🛡️ Escudo Anti-Duplicados Doble**:
    *   **En Memoria**: Evita escribir al CSV a un paciente que ya haya sido guardado antes.
    *   **Por Hash (Ahorro de Tokens)**: Calcula el MD5 de cada archivo procesado. Si detecta que un archivo ya fue analizado antes, lo omite por completo ahorrando el 100% del consumo de API.

## 📋 Requisitos Previos

1.  **Node.js**: Debes tener instalado Node.js (v16 o superior).
2.  **yt-dlp**: Archivo `yt-dlp.exe` en la raíz del proyecto para descargar enlaces.
3.  **FFmpeg**: Archivo `ffmpeg.exe` en la raíz del proyecto para el procesamiento de videos.

## ⚙️ Instalación y Configuración

1.  Clona o descarga este repositorio.
2.  Abre la terminal en la carpeta del proyecto y ejecuta:
    ```bash
    npm install
    ```
3.  Crea un archivo llamado `.env` en la raíz del proyecto y agrega tu clave de OpenAI:
    ```env
    OPENAI_API_KEY="sk-tu-clave-secreta-aqui"
    ```

## 🚀 Cómo Usarlo

1.  Abre el archivo **`links.txt`**.
2.  Pega allí las URLs (una por línea) de los posts de Instagram, o **las rutas de tus carpetas locales** que contengan las imágenes y PDFs (ej. `C:\Users\imund\Downloads\procesar`).
3.  Ejecuta el script desde tu terminal:
    ```bash
    node index.js
    ```
4.  El programa comenzará a descargar (si es web), leer, procesar con IA y unificar los datos.

## 📁 Archivos Generados

*   `plantilla_pacientes.csv`: Tu base de datos unificada lista para abrir en Excel. ¡Cuidala!
*   `procesados.json`: Memoria caché del sistema (Hashes MD5) para evitar reprocesar archivos antiguos.
*   `temp_processing/`: Carpeta temporal donde se alojan descargas y fotogramas.

---
**Nota de Privacidad:** El archivo `plantilla_pacientes.csv` y los archivos locales han sido agregados al `.gitignore` para proteger la información médica de los pacientes y evitar subidas accidentales a repositorios públicos.
