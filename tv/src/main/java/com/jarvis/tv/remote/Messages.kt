package com.jarvis.tv.remote

internal object RemoteKeyCode {
    const val KEYCODE_VOLUME_UP = 24
    const val KEYCODE_VOLUME_DOWN = 25
    const val KEYCODE_MEDIA_PLAY_PAUSE = 85
    const val KEYCODE_MEDIA_PLAY = 126
    const val KEYCODE_MEDIA_PAUSE = 127
}

internal object RemoteDirection {
    const val UNKNOWN = 0
    const val START_LONG = 1
    const val END_LONG = 2
    const val SHORT = 3
}

internal object Features {
    const val PING = 1
    const val KEY = 2
    const val POWER = 32
    const val VOLUME = 64
    const val APP_LINK = 512
    const val ALL = PING or KEY or POWER or VOLUME or APP_LINK
}

internal object RemoteOutgoing {

    fun configure(code1: Int): ByteArray {
        val deviceInfo = ProtoWriter().apply {
            intField(3, 1)
            stringField(4, "1")
            stringField(5, "atvremote")
            stringField(6, "1.0.0")
        }
        val configure = ProtoWriter().apply {
            intField(1, code1.toLong())
            messageField(2, deviceInfo)
        }
        return ProtoWriter().apply { messageField(1, configure) }.toByteArray()
    }

    fun setActive(active: Int): ByteArray {
        val inner = ProtoWriter().apply { intField(1, active.toLong()) }
        return ProtoWriter().apply { messageField(2, inner) }.toByteArray()
    }

    fun pingResponse(val1: Int): ByteArray {
        val inner = ProtoWriter().apply { intField(1, val1.toLong()) }
        return ProtoWriter().apply { messageField(9, inner) }.toByteArray()
    }

    fun keyInject(keyCode: Int, direction: Int): ByteArray {
        val inner = ProtoWriter().apply {
            intField(1, keyCode.toLong())
            intField(2, direction.toLong())
        }
        return ProtoWriter().apply { messageField(10, inner) }.toByteArray()
    }
}

internal data class RemoteIncoming(
    val configure: Boolean,
    val setActive: Boolean,
    val pingRequestVal1: Int?,
    val start: Boolean,
)

internal object RemoteIncomingParser {

    fun parse(data: ByteArray): RemoteIncoming {
        val r = ProtoReader(data)
        var configure = false
        var setActive = false
        var pingVal1: Int? = null
        var start = false
        while (r.hasMore()) {
            val tag = r.readTag()
            val field = tag ushr 3
            val wire = tag and 7
            when (field) {
                1 -> {
                    configure = true
                    r.skipField(wire)
                }
                2 -> {
                    setActive = true
                    r.skipField(wire)
                }
                8 -> pingVal1 = readVal1(r.readBytes())
                40 -> {
                    start = true
                    r.skipField(wire)
                }
                else -> r.skipField(wire)
            }
        }
        return RemoteIncoming(configure, setActive, pingVal1, start)
    }

    private fun readVal1(data: ByteArray): Int {
        val r = ProtoReader(data)
        while (r.hasMore()) {
            val tag = r.readTag()
            val field = tag ushr 3
            val wire = tag and 7
            if (field == 1 && wire == 0) return r.readVarint().toInt()
            r.skipField(wire)
        }
        return 0
    }
}

internal object PoloOutgoing {

    const val STATUS_OK = 200

    fun pairingRequest(serviceName: String, clientName: String): ByteArray {
        val inner = ProtoWriter().apply {
            stringField(1, serviceName)
            stringField(2, clientName)
        }
        return outer(10, inner)
    }

    fun options(): ByteArray {
        val encoding = ProtoWriter().apply {
            intField(1, 3)
            intField(2, 6)
        }
        val options = ProtoWriter().apply {
            messageField(1, encoding)
            intField(3, 1)
        }
        return outer(20, options)
    }

    fun configuration(): ByteArray {
        val encoding = ProtoWriter().apply {
            intField(1, 3)
            intField(2, 6)
        }
        val config = ProtoWriter().apply {
            messageField(1, encoding)
            intField(2, 1)
        }
        return outer(30, config)
    }

    fun secret(secret: ByteArray): ByteArray {
        val inner = ProtoWriter().apply { bytesField(1, secret) }
        return outer(40, inner)
    }

    private fun outer(field: Int, inner: ProtoWriter): ByteArray {
        return ProtoWriter().apply {
            intField(1, 2)
            intField(2, 200)
            messageField(field, inner)
        }.toByteArray()
    }
}

internal data class PoloIncoming(
    val status: Int,
    val pairingRequestAck: Boolean,
    val options: Boolean,
    val configurationAck: Boolean,
    val secretAck: Boolean,
)

internal object PoloIncomingParser {

    fun parse(data: ByteArray): PoloIncoming {
        val r = ProtoReader(data)
        var status = 0
        var reqAck = false
        var options = false
        var configAck = false
        var secretAck = false
        while (r.hasMore()) {
            val tag = r.readTag()
            val field = tag ushr 3
            val wire = tag and 7
            when (field) {
                2 -> status = r.readVarint().toInt()
                11 -> {
                    reqAck = true
                    r.skipField(wire)
                }
                20 -> {
                    options = true
                    r.skipField(wire)
                }
                31 -> {
                    configAck = true
                    r.skipField(wire)
                }
                41 -> {
                    secretAck = true
                    r.skipField(wire)
                }
                else -> r.skipField(wire)
            }
        }
        return PoloIncoming(status, reqAck, options, configAck, secretAck)
    }
}