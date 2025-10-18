package com.utter.android

import okhttp3.*
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class WebSocketClient(private val serverUrl: String) {

    interface ConnectionListener {
        fun onConnected()
        fun onDisconnected()
        fun onMessage(message: String)
        fun onError(error: String)
    }

    private var webSocket: WebSocket? = null
    private var listener: ConnectionListener? = null
    private var isConnected = false

    private val client = OkHttpClient.Builder()
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .connectTimeout(30, TimeUnit.SECONDS)
        .build()

    fun setListener(listener: ConnectionListener) {
        this.listener = listener
    }

    fun connect() {
        val request = Request.Builder()
            .url(serverUrl)
            .build()

        webSocket = client.newWebSocket(request, object : okhttp3.WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                isConnected = true
                listener?.onConnected()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val json = JSONObject(text)
                    val type = json.optString("type", "")

                    when (type) {
                        "connected" -> {
                            // Register as android client
                            val registerMsg = JSONObject().apply {
                                put("type", "register")
                                put("clientType", "android")
                            }
                            webSocket.send(registerMsg.toString())
                        }
                        "registered" -> {
                            listener?.onMessage("Registered successfully")
                        }
                        else -> {
                            listener?.onMessage(text)
                        }
                    }
                } catch (e: Exception) {
                    listener?.onError("Failed to parse message: ${e.message}")
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                isConnected = false
                listener?.onDisconnected()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                isConnected = false
                listener?.onDisconnected()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                isConnected = false
                listener?.onError(t.message ?: "Connection failed")
                listener?.onDisconnected()
            }
        })
    }

    fun disconnect() {
        isConnected = false
        webSocket?.close(1000, "User disconnect")
        webSocket = null
    }

    fun sendText(text: String): Boolean {
        if (!isConnected || webSocket == null) {
            return false
        }

        return try {
            val message = JSONObject().apply {
                put("type", "text")
                put("content", text)
                put("timestamp", System.currentTimeMillis())
            }
            webSocket?.send(message.toString()) ?: false
        } catch (e: Exception) {
            listener?.onError("Failed to send: ${e.message}")
            false
        }
    }

    fun isConnected(): Boolean = isConnected
}
