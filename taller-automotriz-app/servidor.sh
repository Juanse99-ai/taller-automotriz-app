#!/bin/bash

echo "🚀 Iniciando Servidor HTTP para Taller Automotriz"
echo "=============================================="

cd /workspace/taller-automotriz-app

# Verificar si Python está disponible
if command -v python3 &> /dev/null; then
    echo "✅ Python3 encontrado"
    echo "📡 Servidor HTTP iniciado en: http://localhost:8000"
    echo "📁 Sirviendo archivos desde: $(pwd)"
    echo ""
    echo "🌐 INSTRUCCIONES:"
    echo "1. Abre tu navegador"
    echo "2. Ve a: http://localhost:8000"
    echo "3. Verás una lista de archivos - haz click en 'index.html'"
    echo ""
    echo "⏹️  Para detener: Ctrl+C"
    echo ""
    echo "📋 Archivos disponibles:"
    echo "  - index.html (aplicación principal)"
    echo "  - simple.html (versión simple)"
    echo "  - diagnostico.html (diagnóstico)"
    echo "  - demo.html (demo)"
    echo "  - EMERGENCIA.html (test de emergencia)"
    echo ""
    
    python3 -m http.server 8000
elif command -v python &> /dev/null; then
    echo "✅ Python encontrado (versión 2)"
    echo "📡 Servidor HTTP iniciado en: http://localhost:8000"
    python -m SimpleHTTPServer 8000
else
    echo "❌ Python no encontrado"
    echo "Por favor instala Python o usa un navegador diferente"
fi