package com.jarvis.tv.remote

import android.util.Log
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.SocketException
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLException
import javax.net.ssl.SSLSocket

class RemoteClient(
    private val host: String,
    private val port: Int,
    private val sslContext: SSLContext,
    private val onReady: () -> Unit,
    private val onLost: (String) -> Unit,
    private val onAuthError: () -> Unit,
) {

    private var socket: SSLSocket? = null
    private val writeLock = Any()
    @Volatile private var ready = false
    @Volatile private var running = true

    val isReady: Boolean get() = ready

    fun stop() {
        running = false
        socket?.close()
    }

    fun run() {
        val factory = sslContext.socketFactory
        val s = factory.createSocket() as SSLSocket
        try {
            val dest = InetAddress.getByName(host)
            if (!dest.isLoopbackAddress) {
                localIpv4()?.let { ip ->
                    try {
                        s.bind(InetSocketAddress(ip, 0))
                        Log.d(TAG, "Socket bindeado a $ip")
                    } catch (e: Exception) {
                        Log.d(TAG, "Bind a $ip falló: ${e.message}")
                    }
                }
            }
            s.connect(InetSocketAddress(host, port), CONNECT_TIMEOUT)
            socket = s
            s.startHandshake()
            Log.d(TAG, "Conectado a $host:$port, protocolo=${s.session.protocol} cipher=${s.session.cipherSuite}")
            val ins = s.inputStream
            while (running && !s.isClosed) {
                val len = Proto.readVarint(ins).toInt()
                if (len < 0 || len > MAX_FRAME) throw SocketException("Frame inválido")
                val data = ByteArray(len)
                Proto.readFully(ins, data)
                handleMessage(data, s)
            }
        } catch (e: SSLException) {
            if (s.isConnected) {
                Log.w(TAG, "Error SSL (no pareado?): ${e.message}")
                onAuthError()
            } else {
                Log.d(TAG, "Error SSL de conexión: ${e.message}")
                onLost(e.message ?: "Error SSL")
            }
        } catch (e: Exception) {
            Log.d(TAG, "Conexión perdida: ${e.message}")
            onLost(e.message ?: "Conexión perdida")
        } finally {
            ready = false
            socket = null
            try { s.close() } catch (_: Exception) {}
        }
    }

    fun sendKey(keyCode: Int): Boolean {
        if (!ready) return false
        val s = socket ?: return false
        return try {
            synchronized(writeLock) {
                sendFrame(s, RemoteOutgoing.keyInject(keyCode, RemoteDirection.SHORT))
            }
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun handleMessage(data: ByteArray, s: SSLSocket) {
        val inc = RemoteIncomingParser.parse(data)
        Log.d(TAG, "Frame remote (${data.size} B): ${data.toHex()} | configure=${inc.configure} setActive=${inc.setActive} ping=$inc.pingRequestVal1 start=${inc.start}")
        synchronized(writeLock) {
            if (inc.configure) {
                sendFrame(s, RemoteOutgoing.configure(Features.ALL))
                Log.d(TAG, "Respondido remote_configure")
            }
            if (inc.setActive) {
                sendFrame(s, RemoteOutgoing.setActive(Features.ALL))
                Log.d(TAG, "Respondido remote_set_active")
            }
            inc.pingRequestVal1?.let {
                sendFrame(s, RemoteOutgoing.pingResponse(it))
                Log.d(TAG, "Respondido ping=$it")
            }
        }
        if (inc.start) {
            ready = true
            Log.i(TAG, "remote_start recibido -> REMOTO LISTO")
            onReady()
        }
    }

    private fun sendFrame(s: SSLSocket, payload: ByteArray) {
        val out = s.outputStream
        Proto.writeVarint(out, payload.size.toLong())
        out.write(payload)
        out.flush()
    }

    companion object {
        private const val CONNECT_TIMEOUT = 10000
        private const val MAX_FRAME = 1 shl 20
        private const val TAG = "JarvisRemote"

        private fun localIpv4(): String? {
            return try {
                val enis = NetworkInterface.getNetworkInterfaces()
                while (enis.hasMoreElements()) {
                    val eni = enis.nextElement()
                    if (!eni.isUp || eni.isLoopback) continue
                    val addrs = eni.inetAddresses
                    while (addrs.hasMoreElements()) {
                        val a = addrs.nextElement()
                        if (a is Inet4Address && !a.isLoopbackAddress) return a.hostAddress
                    }
                }
                null
            } catch (e: Exception) {
                null
            }
        }
    }
}