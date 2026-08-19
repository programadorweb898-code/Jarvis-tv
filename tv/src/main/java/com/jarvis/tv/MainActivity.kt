package com.jarvis.tv
import android.app.Activity
import android.os.Bundle
import org.java_websocket.client.WebSocketClient
import org.java_websocket.handshake.ServerHandshake
import java.net.URI

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
                if (message == "PONG") {
                    println("Received PONG")
                }
            }
            override fun onClose(code: Int, reason: String?, remote: Boolean) {}
            override fun onError(ex: Exception?) {}
        }
        client?.connect()
    }
}
