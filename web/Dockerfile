FROM node:20-slim

# Instalar ffmpeg, chromium y herramientas de compilación nativas
RUN apt-get update && apt-get install -y ffmpeg python3 make g++ chromium && rm -rf /var/lib/apt/lists/*

# Configurar directorio de trabajo
WORKDIR /app

# Copiar dependencias
COPY package*.json ./

# Omitir descarga de chromium de puppeteer (usaremos el nativo instalado arriba)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Instalar usando npm install (evita el error de npm ci de desincronización)
RUN npm install

# Copiar el resto del código
COPY . .

# Construir la aplicación Next.js
RUN npm run build

# Exponer el puerto
EXPOSE 3000

# Iniciar la aplicación
CMD ["npm", "run", "start"]
