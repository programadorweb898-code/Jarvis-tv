package com.jarvis.tv

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Intent
import android.graphics.Path
import android.media.AudioManager
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.jarvis.tv.remote.RemoteKeyCode
import com.jarvis.tv.remote.RemoteManager
import org.json.JSONObject

data class CommandResult(val status: String, val message: String)

class JarvisAccessibilityService : AccessibilityService() {

    companion object {
        var instance: JarvisAccessibilityService? = null
            private set
    }

    private var remoteManager: RemoteManager? = null

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Thread {
            try {
                remoteManager = RemoteManager(this).apply {
                    onRemoteReady = { Log.i("JarvisTV", "Protocolo remote conectado") }
                    onRemoteLost = { msg -> Log.w("JarvisTV", "Protocolo remote perdido: $msg") }
                    onAuthError = { Log.w("JarvisTV", "Remote requiere pairing") }
                    onPaired = {
                        Log.i("JarvisTV", "Pareado. Reconectando remote...")
                        startRemote()
                    }
                    onPairingError = { msg -> Log.w("JarvisTV", "Error de pairing: $msg") }
                    startRemote()
                }
            } catch (e: Exception) {
                Log.e("JarvisTV", "Error iniciando RemoteManager", e)
            }
        }.apply {
            name = "jarvis-init"
            start()
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    }

    override fun onInterrupt() {
    }

    override fun onDestroy() {
        remoteManager?.stopAll()
        remoteManager = null
        instance = null
        super.onDestroy()
    }

    fun execute(action: String, params: JSONObject): CommandResult {
        return try {
            when (action) {
                "openApp" -> openApp(params.optString("packageName"))
                "pressButton" -> pressButton(params.optString("key"))
                "navigate" -> navigate(params.optString("direction"))
                "typeText" -> typeText(params.optString("text"))
                "swipe" -> swipe(params.optString("direction"))
                "play" -> mediaKey(RemoteKeyCode.KEYCODE_MEDIA_PLAY, "play")
                "pause" -> mediaKey(RemoteKeyCode.KEYCODE_MEDIA_PAUSE, "pause")
                "volumeUp" -> volume(true)
                "volumeDown" -> volume(false)
                // getScreenDump y clickElement se eliminaron: dependían de rootInActiveWindow,
                // que exige el AccessibilityService habilitado (bloqueado por firmware en esta TV).
                // La lectura de UI y el click se resuelven ahora vía ADB uiautomator + input tap
                // desde el backend (ver backend/src/uidump.ts).
                else -> CommandResult("failed", "Acción no soportada: $action")
            }
        } catch (e: Exception) {
            CommandResult("failed", "Error ejecutando $action: ${e.message}")
        }
    }

    private fun mediaKey(keyCode: Int, name: String): CommandResult {
        val manager = remoteManager
        if (manager != null && manager.isReady() && manager.sendKey(keyCode)) {
            return CommandResult("success", "$name enviado")
        }
        return try {
            val method = AccessibilityService::class.java.getMethod("dispatchKeyEvent", KeyEvent::class.java)
            val down = KeyEvent(KeyEvent.ACTION_DOWN, keyCode)
            val up = KeyEvent(KeyEvent.ACTION_UP, keyCode)
            val ok = (method.invoke(this, down) as? Boolean) == true &&
                (method.invoke(this, up) as? Boolean) == true
            if (ok) {
                CommandResult("success", "$name enviado")
            } else {
                CommandResult("failed", "No se pudo enviar $name (dispatchKeyEvent rechazado)")
            }
        } catch (e: Exception) {
            CommandResult("failed", "$name no disponible: ${e.message}")
        }
    }

    private fun volume(up: Boolean): CommandResult {
        return try {
            val am = getSystemService(AUDIO_SERVICE) as AudioManager
            val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
            val cur = am.getStreamVolume(AudioManager.STREAM_MUSIC)
            val target = if (up) (cur + 1).coerceAtMost(max) else (cur - 1).coerceAtLeast(0)
            am.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0)
            CommandResult("success", if (up) "volumen subido" else "volumen bajado")
        } catch (e: Exception) {
            CommandResult("failed", "Error de volumen: ${e.message}")
        }
    }

    private fun openApp(packageName: String): CommandResult {
        if (packageName.isBlank()) {
            return CommandResult("failed", "packageName requerido")
        }
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        if (launchIntent == null) {
            return CommandResult("failed", "Aplicación no instalada: $packageName")
        }
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(launchIntent)
        return CommandResult("success", "Abierta aplicación: $packageName")
    }

    private fun pressButton(key: String): CommandResult {
        val globalAction = when (key) {
            "home" -> GLOBAL_ACTION_HOME
            "back" -> GLOBAL_ACTION_BACK
            "recents" -> GLOBAL_ACTION_RECENTS
            "notifications" -> GLOBAL_ACTION_NOTIFICATIONS
            "quickSettings" -> GLOBAL_ACTION_QUICK_SETTINGS
            "up" -> GLOBAL_ACTION_DPAD_UP
            "down" -> GLOBAL_ACTION_DPAD_DOWN
            "left" -> GLOBAL_ACTION_DPAD_LEFT
            "right" -> GLOBAL_ACTION_DPAD_RIGHT
            "enter" -> GLOBAL_ACTION_DPAD_CENTER
            else -> null
        }
        return if (globalAction != null) {
            if (performGlobalAction(globalAction)) {
                CommandResult("success", "Botón presionado: $key")
            } else {
                CommandResult("failed", "No se pudo ejecutar: $key")
            }
        } else {
            CommandResult("failed", "Botón no soportado: $key")
        }
    }

    private fun navigate(direction: String): CommandResult {
        val globalAction = when (direction.lowercase()) {
            "up" -> GLOBAL_ACTION_DPAD_UP
            "down" -> GLOBAL_ACTION_DPAD_DOWN
            "left" -> GLOBAL_ACTION_DPAD_LEFT
            "right" -> GLOBAL_ACTION_DPAD_RIGHT
            "select" -> GLOBAL_ACTION_DPAD_CENTER
            else -> null
        }
        return if (globalAction != null) {
            if (performGlobalAction(globalAction)) {
                CommandResult("success", "Navegación: $direction")
            } else {
                CommandResult("failed", "No se pudo navegar: $direction")
            }
        } else {
            CommandResult("failed", "Dirección no soportada: $direction")
        }
    }

    private fun typeText(text: String): CommandResult {
        if (text.isEmpty()) {
            return CommandResult("failed", "text requerido")
        }
        val focused = findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY)
        if (focused == null) {
            return CommandResult("failed", "No hay campo de texto enfocado")
        }
        val bundle = Bundle().apply {
            putString(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        if (focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, bundle)) {
            return CommandResult("success", "Texto ingresado")
        }
        return CommandResult("failed", "No se pudo ingresar texto")
    }

    fun swipe(direction: String): CommandResult {
        val root = rootInActiveWindow ?: return CommandResult("failed", "No hay ventana activa")
        val bounds = android.graphics.Rect()
        root.getBoundsInScreen(bounds)
        if (bounds.isEmpty) {
            return CommandResult("failed", "Ventana sin dimensiones")
        }
        val path = Path()
        val startX = bounds.centerX().toFloat()
        val startY = bounds.centerY().toFloat()
        val delta = 300f
        when (direction.lowercase()) {
            "up" -> { path.moveTo(startX, startY + delta); path.lineTo(startX, startY - delta) }
            "down" -> { path.moveTo(startX, startY - delta); path.lineTo(startX, startY + delta) }
            "left" -> { path.moveTo(startX + delta, startY); path.lineTo(startX - delta, startY) }
            "right" -> { path.moveTo(startX - delta, startY); path.lineTo(startX + delta, startY) }
            else -> return CommandResult("failed", "Dirección de swipe no soportada: $direction")
        }
        val gesture = GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(path, 0, 200)).build()
        return if (dispatchGesture(gesture, null, null)) {
            CommandResult("success", "Swipe: $direction")
        } else {
            CommandResult("failed", "No se pudo ejecutar swipe")
        }
    }

    // getScreenDump() y collectNodes() se eliminaron: leían rootInActiveWindow y clickeaban por
    // nodo, pero ambos exigen el AccessibilityService habilitado. El firmware de esta TV (AI PONT,
    // Android 14 / MediaTek homwee) bloquea la habilitación de servicios de accesibilidad de
    // terceros ("disallowed by device admin policy"), así que ese camino no es utilizable aquí.
    // La lectura de UI y el click se resuelven ahora vía ADB desde el backend:
    //   - leer elementos: uiautomator dump (backend/src/uidump.ts -> getScreenElements)
    //   - tocar un elemento: input tap (backend/src/uidump.ts -> tapAt)
    // En TVs donde el AccessibilityService sí sea habilitable, esta clase sigue siendo la opción
    // para pressButton/navigate/typeText/volume/swipe. typeText y swipe dependen del service
    // habilitado (findFocus, dispatchGesture, rootInActiveWindow): limitación conocida en este
    // dispositivo.
}