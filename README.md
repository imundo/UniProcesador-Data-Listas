# UniProcesador Data Listas (IA Extractor)

Una aplicación de consola en Node.js, ligera y potente, para la extracción automatizada y unificación de datos médicos (pacientes) utilizando Inteligencia Artificial (Google Gemini).

## 🚀 ¿Qué hace esta herramienta?

Esta aplicación toma archivos de diferentes formatos (imágenes, PDFs, hojas de cálculo, videos) y enlaces de redes sociales (Instagram, Google Drive), y utiliza un modelo multimodal de IA para extraer datos tabulares y unificarlos en un archivo CSV estandarizado.

Formatos y fuentes soportadas:
- **Redes Sociales:** Links públicos de Instagram (Reels y Posts) usando `yt-dlp`.
- **Directorios Locales:** Lectura masiva de carpetas enteras descargadas (ej. de Google Drive).
- **Archivos Locales:** PDFs, Imágenes (PNG, JPG), Videos (MP4) y textos (CSV).

El archivo de salida final (`plantilla_pacientes.csv`) contendrá siempre este formato estándar:
`nombre,apellido,cedula,centro,edad_sector`

## 🛠️ Tecnologías Utilizadas
- **Node.js**: Entorno de ejecución principal.
- **Google Gemini API**: Modelo de Inteligencia artificial multimodal (`gemini-1.5-pro`) capaz de leer imágenes y video para extraer texto estructurado sin usar OCR convencional.
- **yt-dlp**: Motor de descarga de contenido multimedia universal.
- **Dotenv**: Manejo seguro de variables de entorno y credenciales.

## 📋 Requisitos
- Node.js (v18+ recomendado)
- Clave de API de Google Gemini (Obtenida desde [Google AI Studio](https://aistudio.google.com/app/apikey))

## ⚙️ Instalación y Configuración

1. **Clonar repositorio** e instalar dependencias:
   ```bash
   git clone https://github.com/imundo/UniProcesador-Data-Listas.git
   cd UniProcesador-Data-Listas
   npm install
   ```

2. **Descargar yt-dlp** (Solo Windows):
   La aplicación requiere `yt-dlp.exe` en la raíz del proyecto para descargar videos de redes sociales. 
   Puedes descargarlo desde su [repositorio oficial](https://github.com/yt-dlp/yt-dlp/releases/latest) y colocar el archivo `yt-dlp.exe` junto a `index.js`.

3. **Configurar Credenciales:**
   - Duplica el archivo `.env.example` y nómbralo `.env`.
   - Coloca tu clave de API de Gemini dentro del archivo:
     ```
     GEMINI_API_KEY="AIzaSyTuClaveAqui..."
     ```

## 💻 Uso

1. Abre el archivo `links.txt`.
2. Pega línea por línea las rutas que quieres que procese la IA. Pueden ser:
   - **Rutas de carpetas locales** (ej. `C:\Users\tuUsuario\Descargas\DriveFolder`) <- *Recomendado para carpetas pesadas de Drive*.
   - **Archivos individuales** (ej. `C:\pacientes\lista1.jpg`).
   - **URLs públicas** (ej. `https://www.instagram.com/reel/...`).

3. Ejecuta el programa:
   ```bash
   node index.js
   ```

4. Observa cómo la aplicación analiza cada fuente y añade los registros extraídos directamente al archivo `plantilla_pacientes.csv`.

## 📜 Licencia
Este proyecto fue creado para centralizar y unificar flujos de información rápida y eficientemente. Puedes modificarlo libremente para ajustarlo a tus necesidades.
