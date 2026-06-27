FROM node:20-slim

# Instalar ffmpeg y herramientas de compilación nativas para better-sqlite3
RUN apt-get update && apt-get install -y ffmpeg python3 make g++ && rm -rf /var/lib/apt/lists/*

# Configurar directorio de trabajo
WORKDIR /app

# Copiar dependencias
COPY package*.json ./

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
