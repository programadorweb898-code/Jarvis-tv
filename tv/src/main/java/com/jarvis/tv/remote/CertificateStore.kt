package com.jarvis.tv.remote

import android.content.Context
import android.util.Log
import org.bouncycastle.asn1.x500.X500Name
import org.bouncycastle.asn1.x509.BasicConstraints
import org.bouncycastle.asn1.x509.Extension
import org.bouncycastle.asn1.x509.GeneralName
import org.bouncycastle.asn1.x509.GeneralNames
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder
import java.io.File
import java.math.BigInteger
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.SecureRandom
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.util.Base64
import java.util.Date
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

class CertificateStore(context: Context, private val clientName: String = "jarvis-tv") {

    private val dir = File(context.filesDir, "remote")
    private val certFile = File(dir, "cert.pem")
    private val keyFile = File(dir, "key.pem")

    var keyPair: KeyPair = loadOrGenerate()
        private set

    var certificate: X509Certificate = loadOrGenerateCert(keyPair)
        private set

    init {
        Log.d(TAG, "Certificado cliente: ${certificate.subjectDN} SHA256=${sha256(certificate.encoded)}")
    }

    fun buildSslContext(): SSLContext {
        val password = PASSWORD.toCharArray()
        val ks = KeyStore.getInstance("PKCS12")
        ks.load(null, null)
        ks.setKeyEntry("client", keyPair.private, password, arrayOf(certificate))

        val kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm())
        kmf.init(ks, password)

        val trustAll: X509TrustManager = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
            override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
            override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
        }

        val ctx = SSLContext.getInstance("TLS")
        ctx.init(kmf.keyManagers, arrayOf<TrustManager>(trustAll), SecureRandom())
        return ctx
    }

    private fun loadOrGenerate(): KeyPair {
        if (certFile.exists() && keyFile.exists()) {
            Log.d(TAG, "Cert existente en $certFile -> cargando")
            return try {
                loadExisting()
            } catch (e: Exception) {
                Log.w(TAG, "Error cargando cert existente, regenerando", e)
                generateAndSave()
            }
        }
        Log.d(TAG, "No hay cert -> generando nuevo en $dir")
        return generateAndSave()
    }

    private fun loadExisting(): KeyPair {
        val certPem = certFile.readText()
        val keyPem = keyFile.readText()
        val cert = parseCert(certPem)
        val keyBytes = parsePem(keyPem, "PRIVATE KEY")
        val keySpec = java.security.spec.PKCS8EncodedKeySpec(keyBytes)
        val privateKey = java.security.KeyFactory.getInstance("RSA").generatePrivate(keySpec)
        return KeyPair(cert.publicKey, privateKey)
    }

    private fun loadOrGenerateCert(keyPair: KeyPair): X509Certificate {
        if (certFile.exists()) {
            try {
                return parseCert(certFile.readText())
            } catch (e: Exception) {
                // regenerate
            }
        }
        val generated = generateCert(keyPair)
        writeFiles(keyPair, generated)
        return generated
    }

    private fun generateAndSave(): KeyPair {
        val kpg = KeyPairGenerator.getInstance("RSA")
        kpg.initialize(2048)
        val kp = kpg.generateKeyPair()
        val cert = generateCert(kp)
        writeFiles(kp, cert)
        return kp
    }

    private fun generateCert(kp: KeyPair): X509Certificate {
        val name = X500Name("CN=$clientName")
        val now = Date()
        val notBefore = Date(now.time - 24 * 3600 * 1000L)
        val notAfter = Date(now.time + 10L * 365 * 24 * 3600 * 1000)
        val builder = JcaX509v3CertificateBuilder(
            name,
            BigInteger.valueOf(1000),
            notBefore,
            notAfter,
            name,
            kp.public
        )
        builder.addExtension(Extension.basicConstraints, true, BasicConstraints(true))
        builder.addExtension(
            Extension.subjectAlternativeName,
            false,
            GeneralNames(GeneralName(GeneralName.dNSName, clientName))
        )
        val signer = JcaContentSignerBuilder("SHA256withRSA").build(kp.private)
        val holder = builder.build(signer)
        return JcaX509CertificateConverter().getCertificate(holder)
    }

    private fun writeFiles(kp: KeyPair, cert: X509Certificate) {
        dir.mkdirs()
        certFile.writeText(wrapPem("CERTIFICATE", cert.encoded))
        keyFile.writeText(wrapPem("PRIVATE KEY", kp.private.encoded))
    }

    private fun parseCert(pem: String): X509Certificate {
        val der = parsePem(pem, "CERTIFICATE")
        return CertificateFactory.getInstance("X.509")
            .generateCertificate(der.inputStream()) as X509Certificate
    }

    private fun wrapPem(label: String, der: ByteArray): String {
        val b64 = Base64.getEncoder().encodeToString(der)
            .chunked(64)
            .joinToString("\n")
        return "-----BEGIN $label-----\n$b64\n-----END $label-----\n"
    }

    private fun parsePem(pem: String, label: String): ByteArray {
        val body = pem
            .replace("-----BEGIN $label-----", "")
            .replace("-----END $label-----", "")
            .filter { !it.isWhitespace() }
        return Base64.getDecoder().decode(body)
    }

    companion object {
        private const val PASSWORD = "jarvis-tv"
        private const val TAG = "JarvisCert"

        private fun sha256(bytes: ByteArray): String {
            return java.security.MessageDigest.getInstance("SHA-256")
                .digest(bytes)
                .toHex()
        }
    }
}