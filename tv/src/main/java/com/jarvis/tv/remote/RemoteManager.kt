package com.jarvis.tv.remote

import android.content.Context
import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean

class RemoteManager(context: Context) {

    private val certStore = CertificateStore(context)
    private val sslContext = certStore.buildSslContext()

    private var remoteClient: RemoteClient? = null
    private var remoteThread: Thread? = null
    private var pairingClient: PairingClient? = null
    private val reconnectAttempts = AtomicBoolean(false)

    var isRemoteReady: Boolean = false
        private set
    var isPairing: Boolean = false
        private set

    var onRemoteReady: (() -> Unit)? = null
    var onRemoteLost: ((String) -> Unit)? = null
    var onAuthError: (() -> Unit)? = null
    var onPairingCodeRequired: (() -> Unit)? = null
    var onPaired: (() -> Unit)? = null
    var onPairingError: ((String) -> Unit)? = null

    fun startRemote() {
        if (reconnectAttempts.getAndSet(true)) return
        remoteThread = Thread(::remoteLoop).apply {
            name = "jarvis-remote-reconnect"
            start()
        }
    }

    fun stopRemote() {
        reconnectAttempts.set(false)
        remoteClient?.stop()
        remoteClient = null
        remoteThread = null
        isRemoteReady = false
    }

    fun sendKey(keyCode: Int): Boolean = remoteClient?.sendKey(keyCode) ?: false

    fun isReady(): Boolean = isRemoteReady

    private fun remoteLoop() {
        var delayMs = 1000L
        var hostIndex = 0
        val hosts = candidateHosts()
        while (reconnectAttempts.get()) {
            val host = hosts[hostIndex % hosts.size]
            hostIndex++
            val client = RemoteClient(
                host = host,
                port = REMOTE_PORT,
                sslContext = sslContext,
                onReady = {
                    isRemoteReady = true
                    Log.i(TAG, "REMOTE LISTO en $host:$REMOTE_PORT")
                    onRemoteReady?.invoke()
                },
                onLost = { msg ->
                    isRemoteReady = false
                    Log.w(TAG, "Remote perdido: $msg")
                    onRemoteLost?.invoke(msg)
                },
                onAuthError = {
                    isRemoteReady = false
                    Log.w(TAG, "Remote sin auth (no pareado) -> se sugiere pairing")
                    onAuthError?.invoke()
                }
            )
            remoteClient = client
            Log.d(TAG, "Intentando conectar remote a $host:$REMOTE_PORT (delay=$delayMs ms)")
            client.run()
            remoteClient = null
            if (!reconnectAttempts.get()) break
            try {
                Thread.sleep(delayMs)
            } catch (e: InterruptedException) {
                break
            }
            delayMs = (delayMs * 2).coerceAtMost(30000L)
        }
    }

    fun startPairing() {
        if (isPairing) return
        isPairing = true
        val host = candidateHosts().first()
        pairingClient = PairingClient(
            host = host,
            port = PAIR_PORT,
            sslContext = sslContext,
            clientName = CLIENT_NAME,
            certificate = certStore.certificate,
            onCodeRequired = {
                isPairing = true
                onPairingCodeRequired?.invoke()
            },
            onPaired = {
                isPairing = false
                pairingClient = null
                onPaired?.invoke()
            },
            onError = { msg ->
                isPairing = false
                pairingClient = null
                onPairingError?.invoke(msg)
            }
        )
        pairingClient?.start()
    }

    fun submitPairingCode(code: String): Boolean {
        return pairingClient?.submitCode(code) ?: false
    }

    fun stopPairing() {
        pairingClient?.stop()
        pairingClient = null
        isPairing = false
    }

    fun stopAll() {
        stopRemote()
        stopPairing()
    }

    companion object {
        private const val REMOTE_PORT = 6466
        private const val PAIR_PORT = 6467
        private const val CLIENT_NAME = "jarvis-tv"
        private const val TAG = "JarvisRemoteMgr"

        fun candidateHosts(): List<String> {
            val hosts = mutableListOf("127.0.0.1")
            try {
                val enis = java.net.NetworkInterface.getNetworkInterfaces()
                while (enis.hasMoreElements()) {
                    val eni = enis.nextElement()
                    if (!eni.isUp || eni.isLoopback) continue
                    val addrs = eni.inetAddresses
                    while (addrs.hasMoreElements()) {
                        val a = addrs.nextElement()
                        if (a is java.net.Inet4Address && !a.isLoopbackAddress) {
                            hosts.add(0, a.hostAddress)
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Error detectando IP LAN: ${e.message}")
            }
            return hosts.distinct()
        }
    }
}