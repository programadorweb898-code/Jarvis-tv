package com.jarvis.tv

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import com.jarvis.tv.remote.RemoteManager
import org.java_websocket.client.WebSocketClient
import org.java_websocket.handshake.ServerHandshake
import java.net.URI
import org.json.JSONObject

class MainActivity : Activity() {
    private var client: WebSocketClient? = null
    private var reconnectAttempts = 0
    private lateinit var remoteManager: RemoteManager
    private lateinit var statusText: TextView
    private lateinit var codeInput: EditText
    private lateinit var pairButton: Button
    private lateinit var confirmButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
        Thread {
            try {
                setupRemote()
                connect()
            } catch (e: Exception) {
                Log.e("JarvisTV", "Error inicializando: $e")
            }
        }.apply {
            name = "jarvis-init"
            start()
        }
    }

    private fun buildUi() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(48, 48, 48, 48)
            setBackgroundColor(Color.BLACK)
        }

        val title = TextView(this).apply {
            text = "Jarvis TV"
            setTextColor(Color.WHITE)
            textSize = 22f
            gravity = Gravity.CENTER
        }

        statusText = TextView(this).apply {
            text = "Iniciando protocolo remote..."
            setTextColor(Color.GRAY)
            textSize = 14f
            gravity = Gravity.CENTER
            setPadding(0, 24, 0, 24)
        }

        codeInput = EditText(this).apply {
            hint = "Código de 6 caracteres (en la TV)"
            setTextColor(Color.WHITE)
            setHintTextColor(Color.GRAY)
            textSize = 16f
            visibility = View.GONE
        }

        pairButton = Button(this).apply {
            text = "Parear con la TV"
            visibility = View.GONE
            setOnClickListener {
                statusText.text = "Iniciando pairing... El TV mostrará un código."
                codeInput.setText("")
                codeInput.visibility = View.VISIBLE
                confirmButton.visibility = View.VISIBLE
                pairButton.visibility = View.GONE
                remoteManager.startPairing()
            }
        }

        confirmButton = Button(this).apply {
            text = "Confirmar código"
            visibility = View.GONE
            setOnClickListener {
                val code = codeInput.text.toString().trim()
                if (code.length != 6) {
                    statusText.text = "El código debe tener 6 caracteres"
                    return@setOnClickListener
                }
                if (!remoteManager.submitPairingCode(code)) {
                    statusText.text = "No se pudo enviar el código. Reiniciá el pairing."
                }
            }
        }

        root.addView(title)
        root.addView(statusText)
        root.addView(codeInput)
        root.addView(pairButton)
        root.addView(confirmButton)
        setContentView(root)
    }

    private fun setupRemote() {
        remoteManager = RemoteManager(this).apply {
            onRemoteReady = {
                runOnUiThread {
                    statusText.text = "Protocolo remote conectado. Enviá comandos de voz."
                    codeInput.visibility = View.GONE
                    confirmButton.visibility = View.GONE
                    pairButton.visibility = View.GONE
                }
            }
            onRemoteLost = { msg ->
                runOnUiThread { statusText.text = "Remote desconectado ($msg). Reconectando..." }
            }
            onAuthError = {
                runOnUiThread {
                    statusText.text = "No pareado. Pulsá 'Parear con la TV' para iniciar el pairing."
                    pairButton.visibility = View.VISIBLE
                }
            }
            onPairingCodeRequired = {
                runOnUiThread {
                    statusText.text = "Ingresá el código de 6 caracteres que muestra la TV."
                    codeInput.visibility = View.VISIBLE
                    confirmButton.visibility = View.VISIBLE
                    pairButton.visibility = View.GONE
                }
            }
            onPaired = {
                runOnUiThread {
                    statusText.text = "¡Pareado! Conectando protocolo remote..."
                    codeInput.visibility = View.GONE
                    confirmButton.visibility = View.GONE
                    pairButton.visibility = View.GONE
                }
            }
            onPairingError = { msg ->
                Log.e("JarvisTV", "Error de pairing: $msg")
                runOnUiThread {
                    statusText.text = "Error de pairing: $msg"
                    pairButton.visibility = View.VISIBLE
                }
            }
            startRemote()
        }
    }

    private fun connect() {
        val uri = URI("ws://192.168.1.87:8080")
        client = object : WebSocketClient(uri) {
            override fun onOpen(handshakedata: ServerHandshake?) {
                Log.i("JarvisTV", "WebSocket conectado")
                reconnectAttempts = 0
            }

            override fun onMessage(message: String?) {
                if (message == null) return
                try {
                    val json = JSONObject(message)
                    val type = json.getString("type")

                    if (type == "command") {
                        handleCommand(json)
                    }
                } catch (e: Exception) {
                    Log.e("JarvisTV", "Error parseando mensaje: $e")
                }
            }

            override fun onClose(code: Int, reason: String?, remote: Boolean) {
                Log.w("JarvisTV", "WebSocket cerrado: $reason")
                scheduleReconnect()
            }

            override fun onError(ex: Exception?) {
                Log.e("JarvisTV", "Error WebSocket: $ex")
            }
        }
        client?.connect()
    }

    private fun scheduleReconnect() {
        if (reconnectAttempts < 5) {
            reconnectAttempts++
            val delay = (reconnectAttempts * 5000).toLong()
            Log.i("JarvisTV", "Reconectando en ${delay / 1000}s (intento $reconnectAttempts)")
            android.os.Handler(mainLooper).postDelayed({ connect() }, delay)
        }
    }

    private fun handleCommand(json: JSONObject) {
        val payload = json.optJSONObject("payload")
        if (payload == null) {
            sendExecutionResult(json, "command", "failed", "payload requerido")
            return
        }
        val action = payload.optString("action")
        val params = payload.optJSONObject("params") ?: JSONObject()

        val service = JarvisAccessibilityService.instance
        if (service == null) {
            sendExecutionResult(json, action, "failed", "Servicio de accesibilidad no disponible. Activá Jarvis TV Control en Configuración > Accesibilidad.")
            promptEnableAccessibility()
            return
        }

        val result = service.execute(action, params)
        sendExecutionResult(json, action, result.status, result.message)
    }

    private fun sendExecutionResult(original: JSONObject, action: String, status: String, message: String) {
        val response = JSONObject().apply {
            put("id", original.optString("id"))
            put("type", "execution_result")
            put("payload", JSONObject().apply {
                put("action", action)
                put("status", status)
                put("message", message)
            })
            put("timestamp", java.time.Instant.now().toString())
        }
        client?.send(response.toString())
    }

    private fun promptEnableAccessibility() {
        runOnUiThread {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }
    }
}