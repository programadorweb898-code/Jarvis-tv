package com.jarvis.tv.remote

import java.io.ByteArrayOutputStream
import java.io.EOFException
import java.io.InputStream
import java.io.OutputStream
import java.math.BigInteger

internal fun ByteArray.toHex(): String = buildString {
    for (b in this@toHex) append("%02x".format(b.toInt() and 0xff))
}

internal fun BigInteger.toHex(): String = toString(16)

internal object Proto {

    fun writeVarint(out: OutputStream, value: Long) {
        var v = value
        while (v and -0x80L != 0L) {
            out.write(((v and 0x7f).toInt()) or 0x80)
            v = v ushr 7
        }
        out.write(v.toInt())
    }

    fun readVarint(ins: InputStream): Long {
        var result = 0L
        var shift = 0
        while (true) {
            val b = ins.read()
            if (b == -1) throw EOFException()
            result = result or ((b.toLong() and 0x7f) shl shift)
            if (b and 0x80 == 0) break
            shift += 7
            if (shift > 63) throw EOFException()
        }
        return result
    }

    fun readFully(ins: InputStream, data: ByteArray) {
        var off = 0
        while (off < data.size) {
            val n = ins.read(data, off, data.size - off)
            if (n == -1) throw EOFException()
            off += n
        }
    }
}

internal class ProtoWriter {
    private val out = ByteArrayOutputStream()

    fun varint(value: Long) {
        Proto.writeVarint(out, value)
    }

    fun tag(field: Int, wire: Int) {
        Proto.writeVarint(out, ((field shl 3) or wire).toLong())
    }

    fun intField(field: Int, value: Long) {
        tag(field, 0)
        varint(value)
    }

    fun boolField(field: Int, value: Boolean) {
        intField(field, if (value) 1L else 0L)
    }

    fun stringField(field: Int, value: String) {
        bytesField(field, value.toByteArray(Charsets.UTF_8))
    }

    fun bytesField(field: Int, data: ByteArray) {
        tag(field, 2)
        varint(data.size.toLong())
        out.write(data)
    }

    fun messageField(field: Int, msg: ProtoWriter) {
        bytesField(field, msg.toByteArray())
    }

    fun toByteArray(): ByteArray = out.toByteArray()
}

internal class ProtoReader(private val data: ByteArray) {
    private var pos = 0

    fun hasMore(): Boolean = pos < data.size

    fun readVarint(): Long {
        var result = 0L
        var shift = 0
        while (true) {
            if (pos >= data.size) throw EOFException()
            val b = data[pos++].toInt()
            result = result or ((b.toLong() and 0x7f) shl shift)
            if (b and 0x80 == 0) break
            shift += 7
        }
        return result
    }

    fun readTag(): Int = readVarint().toInt()

    fun readInt(): Long = readVarint()

    fun readBool(): Boolean = readVarint() != 0L

    fun readBytes(): ByteArray {
        val len = readVarint().toInt()
        if (len < 0 || pos + len > data.size) throw EOFException()
        val out = data.copyOfRange(pos, pos + len)
        pos += len
        return out
    }

    fun readString(): String = String(readBytes(), Charsets.UTF_8)

    fun skipField(wire: Int) {
        when (wire) {
            0 -> readVarint()
            1 -> pos += 8
            2 -> readBytes()
            5 -> pos += 4
            else -> throw IllegalStateException("Wire type no soportado: $wire")
        }
    }
}