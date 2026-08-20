#!/usr/bin/env bash
# Helper ADB para Jarvis TV.
#
# Uso:
#   ./scripts/adb-tv.sh pair <IP_TV>          -> inicia pairing ADB (pedirá código de 6 dígitos de la TV)
#   ./scripts/adb-tv.sh connect <IP_TV>       -> conecta adb a la TV (después de pair)
#   ./scripts/adb-tv.sh logcat                -> logcat filtrado por tags Jarvis*
#   ./scripts/adb-tv.sh logcat <IP_TV>        -> conecta (si hace falta) y logcat filtrado
#   ./scripts/adb-tv.sh install <ruta.apk>    -> instala el APK
#   ./scripts/adb-tv.sh devices               -> lista dispositivos
#
# Requiere: ADB sobre red habilitado en la TV
# (Ajustes -> Opciones de desarrollador -> Depuración por USB/red + "Emparejar por red").

set -euo pipefail

ADB="C:/Users/gomit/Android/Sdk/platform-tools/adb.exe"
PAIR_PORT="5555"
CONNECT_PORT="5555"

usage() {
  echo "Uso: $0 {pair|connect|logcat|install|devices} [args]"
  exit 1
}

case "${1:-}" in
  pair)
    [ $# -ge 2 ] || usage
    echo "Emparejando con ${2}:${PAIR_PORT}..."
    echo "En la TV: Ajustes -> Opciones de desarrollador -> Depuración por red -> 'Emparejar dispositivo con código'."
    echo "Cuando la TV muestre IP:PUERTO y el código de 6 dígitos, ingresá el código aquí."
    "$ADB" pair "$2:$PAIR_PORT"
    ;;
  connect)
    [ $# -ge 2 ] || usage
    echo "Conectando a ${2}:${CONNECT_PORT}..."
    "$ADB" connect "$2:$CONNECT_PORT"
    ;;
  logcat)
    IP=""
    if [ $# -ge 2 ]; then
      IP="$2"
      "$ADB" connect "$IP:$CONNECT_PORT" >/dev/null || true
    fi
    "$ADB" logcat -v time | grep -Ei "Jarvis(TV|Pairing|Remote|Cert|RemoteMgr)|System.err|AndroidRuntime|RemoteService" --line-buffered
    ;;
  install)
    [ $# -ge 2 ] || usage
    "$ADB" install -r "$2"
    ;;
  devices)
    "$ADB" devices -l
    ;;
  *)
    usage
    ;;
esac