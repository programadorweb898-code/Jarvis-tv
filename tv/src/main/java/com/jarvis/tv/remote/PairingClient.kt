package com.jarvis.tv.remote

import android.util.Log
import java.math.BigInteger
import java.net.InetSocketAddress
import java.security.MessageDigest
import java.security.cert.X509Certificate
import java.security.interfaces.RSAPublicKey
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket

class PairingClient(
    private val host: String,
    private val port: Int,
    private val sslContext: SSLContext,
    private val clientName: String,
    private val certificate: X509Certificate,
    private val onCodeRequired: () -> Unit,
    private val onPaired: () -> Unit,
    private val onError: (String) -> Unit,
) {

    private var socket: SSLSocket? = null
    private var thread: Thread? = null
    private var serverCertificate: X509Certificate? = null
    private val writeLock = Any()
    @Volatile private var waitingForCode = false
    @Volatile private var active = false

    fun start() {
        if (thread?.isAlive == true) return
        active = true
        Log.i(TAG, "Iniciando pairing contra $host:$port")
        thread = Thread(::runLoop).apply {
            name = "jarvis-pairing"
            start()
        }
    }

    fun stop() {
        active = false
        socket?.close()
    }

    fun submitCode(code: String): Boolean {
        val serverCert = serverCertificate ?: return false
        if (!waitingForCode || !active) return false
        if (code.length != 6) {
            onError("El código debe tener 6 caracteres")
            return false
        }
        Log.d(TAG, "submitCode($code) waiting=$waitingForCode active=$active")
        return try {
            val secret = computeSecret(serverCert, code)
            Log.d(TAG, "Secret (${secret.size} B): ${secret.toHex()}")
            synchronized(writeLock) {
                val s = socket ?: return false
                sendFrame(s, PoloOutgoing.secret(secret))
            }
            true
        } catch (e: Exception) {
            onError("Error computando secreto: ${e.message}")
            false
        }
    }

    private fun runLoop() {
        val factory = sslContext.socketFactory
        val s = factory.createSocket() as SSLSocket
        try {
            s.connect(InetSocketAddress(host, port), 10000)
            socket = s
            s.startHandshake()
            serverCertificate = s.session.peerCertificates.firstOrNull() as? X509Certificate
            logCertificates()
            Log.d(TAG, "Handshake TLS OK, protocolo=${s.session.protocol} cipher=${s.session.cipherSuite}")

            synchronized(writeLock) {
                sendFrame(s, PoloOutgoing.pairingRequest("atvremote", clientName))
                Log.d(TAG, "Enviado pairing_request service=atvremote client=$clientName")
            }

            val ins = s.inputStream
            while (active && !s.isClosed) {
                val len = Proto.readVarint(ins).toInt()
                if (len < 0 || len > MAX_FRAME) throw Exception("Frame inválido")
                val data = ByteArray(len)
                Proto.readFully(ins, data)
                handleMessage(data, s)
            }
        } catch (e: Exception) {
            if (active) {
                Log.e(TAG, "Error en pairing", e)
                onError(e.message ?: "Error de pairing")
            }
        } finally {
            waitingForCode = false
            active = false
            socket = null
            try { s.close() } catch (_: Exception) {}
        }
    }

    private fun handleMessage(data: ByteArray, s: SSLSocket) {
        val inc = PoloIncomingParser.parse(data)
        Log.d(
            TAG,
            "Frame recibido (${data.size} B): ${data.toHex()} " +
                "| status=${inc.status} reqAck=${inc.pairingRequestAck} options=${inc.options} " +
                "configAck=${inc.configurationAck} secretAck=${inc.secretAck}"
        )
        if (inc.status != PoloOutgoing.STATUS_OK) {
            Log.w(TAG, "Status no OK: ${inc.status} -> abortando")
            onError("Status de pairing: ${inc.status}")
            stop()
            return
        }
        when {
            inc.pairingRequestAck -> synchronized(writeLock) {
                sendFrame(s, PoloOutgoing.options())
                Log.d(TAG, "Enviado options")
            }
            inc.options -> synchronized(writeLock) {
                sendFrame(s, PoloOutgoing.configuration())
                Log.d(TAG, "Enviado configuration")
            }
            inc.configurationAck -> {
                waitingForCode = true
                Log.d(TAG, "configuration_ack recibido -> esperando código")
                onCodeRequired()
            }
            inc.secretAck -> {
                waitingForCode = false
                active = false
                Log.i(TAG, "secret_ack recibido -> pareado")
                onPaired()
                stop()
            }
        }
    }

    private fun computeSecret(serverCert: X509Certificate, code: String): ByteArray {
        val clientPub = certificate.publicKey as? RSAPublicKey
            ?: throw Exception("La clave del cliente no es RSA")
        val serverPub = serverCert.publicKey as? RSAPublicKey
            ?: throw Exception("La clave del servidor no es RSA")

        val clientMod = removeLeadingNullBytes(clientPub.modulus.toByteArray())
        val clientExp = removeLeadingNullBytes(clientPub.publicExponent.toByteArray())
        val serverMod = removeLeadingNullBytes(serverPub.modulus.toByteArray())
        val serverExp = removeLeadingNullBytes(serverPub.publicExponent.toByteArray())
        val nonce = hexToBytes(code.substring(2))

        Log.d(
            TAG,
            "Hash SHA-256: clientMod=${clientMod.toHex()} clientExp=${clientExp.toHex()} " +
                "serverMod=${serverMod.toHex()} serverExp=${serverExp.toHex()} nonce=${nonce.toHex()}"
        )

        val h = MessageDigest.getInstance("SHA-256")
        h.update(clientMod)
        h.update(clientExp)
        h.update(serverMod)
        h.update(serverExp)
        h.update(nonce)

        val hash = h.digest()
        val expected = code.substring(0, 2).toInt(16)
        val actual = hash[0].toInt() and 0xff
        Log.d(TAG, "Hash result=${hash.toHex()} hash[0]=$actual expected=$expected")
        if (actual != expected) {
            Log.w(TAG, "Código inválido: hash[0] != primeros 2 chars")
            throw Exception("Código inválido")
        }
        return hash
    }

    private fun logCertificates() {
        val serverCert = serverCertificate
        if (serverCert == null) {
            Log.w(TAG, "serverCertificate es null")
            return
        }
        val clientPub = certificate.publicKey as? RSAPublicKey
        val serverPub = serverCert.publicKey as? RSAPublicKey
        Log.d(
            TAG,
            "Client cert CN=${certificate.subjectDN} " +
                "mod=${clientPub?.modulus?.toHex()} exp=${clientPub?.publicExponent?.toHex()}"
        )
        Log.d(
            TAG,
            "Server cert CN=${serverCert.subjectDN} " +
                "mod=${serverPub?.modulus?.toHex()} exp=${serverPub?.publicExponent?.toHex()}"
        )
    }

    private fun removeLeadingNullBytes(bytes: ByteArray): ByteArray {
        var i = 0
        while (i < bytes.size - 1 && bytes[i].toInt() == 0) i++
        return bytes.copyOfRange(i, bytes.size)
    }

    private fun hexToBytes(hex: String): ByteArray {
        require(hex.length % 2 == 0) { "Longitud hex impar" }
        return ByteArray(hex.length / 2) { i ->
            hex.substring(i * 2, i * 2 + 2).toInt(16).toByte()
        }
    }

    private fun sendFrame(s: SSLSocket, payload: ByteArray) {
        val out = s.outputStream
        Proto.writeVarint(out, payload.size.toLong())
        out.write(payload)
        out.flush()
    }

    companion object {
        private const val MAX_FRAME = 1 shl 20
        private const val TAG = "JarvisPairing"
    }
}