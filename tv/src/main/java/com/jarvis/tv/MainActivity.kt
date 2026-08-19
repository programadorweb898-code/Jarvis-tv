package com.jarvis.tv
import android.app.Activity
import android.os.Bundle
import android.view.KeyEvent
import org.java_websocket.client.WebSocketClient
import org.java_websocket.handshake.ServerHandshake
import java.net.URI
import org.json.JSONObject

class MainActivity : Activity() {
    private var client: WebSocketClient? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val uri = URI("ws://192.168.1.58:8080")
        client = object : WebSocketClient(uri) {
            override fun onOpen(handshakedata: ServerHandshake?) {
                send("PING")
            }
            override fun onMessage(message: String?) {
                try {
                    val json = JSONObject(message)
                    val type = json.getString("type")

                    if (type == "response") {
                         if (json.getString("result") == "PONG") {
                            println("Received PONG via JSON")
                        }
                    } else if (type == "command") {
                        handleCommand(json)
                    }
                } catch (e: Exception) {
                    println("Error parsing message: $e")
                }
            }

            private fun handleCommand(json: JSONObject) {
                val action = json.getString("action")
                if (action == "pressButton") {
                    val payload = json.getJSONObject("payload")
                    val key = payload.getString("key")
                    val keyCode = when (key) {
                        "home" -> KeyEvent.KEYCODE_HOME
                        "back" -> KeyEvent.KEYCODE_BACK
                        "up" -> KeyEvent.KEYCODE_DPAD_UP
                        "down" -> KeyEvent.KEYCODE_DPAD_DOWN
                        "left" -> KeyEvent.KEYCODE_DPAD_LEFT
                        "right" -> KeyEvent.KEYCODE_DPAD_RIGHT
                        "enter" -> KeyEvent.KEYCODE_DPAD_CENTER
                        else -> -1
                    }
                    if (keyCode != -1) {
                        runOnUiThread {
                            dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
                            dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_UP, keyCode))
                        }
                    }
                }
            }

            override fun onClose(code: Int, reason: String?, remote: Boolean) {}
            override fun onError(ex: Exception?) {}
        }
        client?.connect()
    }
}
