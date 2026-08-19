package com.jarvis.tv

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent

class JarvisAccessibilityService : AccessibilityService() {

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // No necesitamos observar eventos por ahora, solo ejecutar acciones
    }

    override fun onInterrupt() {
        // Limpieza si fuera necesaria
    }

    // Método para realizar acciones (ej. presionar teclas)
    fun performKeyAction(keyCode: Int): Boolean {
        // En Android 11+ (API 30+) podemos usar dispatchGesture
        // Para botones simples, dispatchKeyEvent desde la actividad funcionaba
        // pero aquí necesitamos un enfoque más robusto.
        // Por ahora, como es un esqueleto, esto es un placeholder.
        return false 
    }
}
