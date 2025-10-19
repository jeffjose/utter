package com.utter.android

import android.util.Log
import com.utter.android.crypto.CryptoManager
import com.utter.android.crypto.EncryptedMessage
import okhttp3.*
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class WebSocketClient(
    private val serverUrl: String,
    private val cryptoManager: CryptoManager? = null
) {

    companion object {
        private const val TAG = "UtterWebSocket"
    }

    interface ConnectionListener {
        fun onConnected()
        fun onDisconnected()
        fun onMessage(message: String)
        fun onError(error: String)
        fun onRegistered()
        fun onDeviceList(devices: List<Device>)
    }

    data class Device(
        val deviceId: String,
        val deviceName: String,
        val deviceType: String,
        val status: String,
        val publicKey: String? = null
    )

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
        Log.d(TAG, "Listener set")
    }

    fun connect() {
        Log.d(TAG, "Attempting to connect to: $serverUrl")
        val request = Request.Builder()
            .url(serverUrl)
            .build()

        webSocket = client.newWebSocket(request, object : okhttp3.WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d(TAG, "WebSocket opened successfully")
                isConnected = true
                listener?.onConnected()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                Log.d(TAG, "Received message: $text")
                try {
                    val json = JSONObject(text)
                    val type = json.optString("type", "")

                    when (type) {
                        "connected" -> {
                            Log.d(TAG, "Received 'connected' message, sending registration")
                            // Register as android client
                            val deviceId = android.os.Build.MODEL.replace(" ", "-") + "-" +
                                          System.currentTimeMillis().toString().takeLast(6)
                            val deviceName = android.os.Build.MODEL

                            val registerMsg = JSONObject().apply {
                                put("type", "register")
                                put("clientType", "android")
                                put("deviceId", deviceId)
                                put("deviceName", deviceName)

                                // Include public key if crypto is enabled
                                cryptoManager?.let {
                                    put("publicKey", it.getPublicKey())
                                    Log.d(TAG, "Including public key in registration")
                                }
                            }
                            webSocket.send(registerMsg.toString())
                        }
                        "registered" -> {
                            Log.d(TAG, "Successfully registered with server")
                            listener?.onRegistered()
                        }
                        "devices" -> {
                            Log.d(TAG, "Received device list")
                            val devicesArray = json.getJSONArray("devices")
                            val deviceList = mutableListOf<Device>()

                            for (i in 0 until devicesArray.length()) {
                                val deviceObj = devicesArray.getJSONObject(i)
                                val device = Device(
                                    deviceId = deviceObj.getString("deviceId"),
                                    deviceName = deviceObj.getString("deviceName"),
                                    deviceType = deviceObj.getString("deviceType"),
                                    status = deviceObj.getString("status"),
                                    publicKey = deviceObj.optString("publicKey", null)
                                )
                                // Only include Linux devices
                                if (device.deviceType == "linux") {
                                    deviceList.add(device)
                                }
                            }
                            listener?.onDeviceList(deviceList)
                        }
                        "text" -> {
                            // Handle incoming text message (may be encrypted)
                            val encrypted = json.optBoolean("encrypted", false)
                            val content = json.getString("content")

                            if (encrypted && cryptoManager != null) {
                                // Decrypt the message
                                try {
                                    val encryptedMsg = EncryptedMessage(
                                        ciphertext = content,
                                        nonce = json.getString("nonce"),
                                        ephemeralPublicKey = json.getString("ephemeralPublicKey")
                                    )
                                    // TODO: Get sender's public key from device list
                                    // For now, we just decrypt (sender verification can be added later)
                                    val plaintext = cryptoManager.decryptMessage(
                                        encryptedMsg,
                                        "" // sender public key not strictly needed for decryption
                                    )
                                    Log.d(TAG, "Decrypted message: $plaintext")
                                    listener?.onMessage(plaintext)
                                } catch (e: Exception) {
                                    Log.e(TAG, "Failed to decrypt message: ${e.message}", e)
                                    listener?.onError("Failed to decrypt message")
                                }
                            } else {
                                // ENFORCE ENCRYPTION: Reject plaintext messages
                                val errorMsg = "REJECTED: Plaintext messages not allowed. E2E encryption is REQUIRED."
                                Log.e(TAG, errorMsg)
                                listener?.onError(errorMsg)
                            }
                        }
                        else -> {
                            listener?.onMessage(text)
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to parse message: ${e.message}")
                    listener?.onError("Failed to parse message: ${e.message}")
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "WebSocket closing: code=$code, reason=$reason")
                isConnected = false
                listener?.onDisconnected()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "WebSocket closed: code=$code, reason=$reason")
                isConnected = false
                listener?.onDisconnected()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WebSocket connection failed: ${t.message}", t)
                Log.e(TAG, "Response: ${response?.code} - ${response?.message}")
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

    fun sendTextToDevice(text: String, targetDeviceId: String): Boolean {
        if (!isConnected || webSocket == null) {
            return false
        }

        return try {
            val message = JSONObject().apply {
                put("type", "message")
                put("to", targetDeviceId)
                put("content", text)
                put("timestamp", System.currentTimeMillis())
            }
            Log.d(TAG, "Sending message to $targetDeviceId: $text")
            webSocket?.send(message.toString()) ?: false
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send message: ${e.message}")
            listener?.onError("Failed to send: ${e.message}")
            false
        }
    }

    /**
     * Send encrypted message to a specific device
     *
     * @param text Plaintext message to encrypt and send
     * @param targetDeviceId Target device ID
     * @param recipientPublicKey Recipient's public key (base64)
     * @return true if sent successfully
     */
    fun sendEncryptedTextToDevice(
        text: String,
        targetDeviceId: String,
        recipientPublicKey: String
    ): Boolean {
        if (!isConnected || webSocket == null) {
            Log.e(TAG, "Cannot send: not connected")
            return false
        }

        if (cryptoManager == null) {
            Log.e(TAG, "Cannot encrypt: crypto not initialized")
            return false
        }

        return try {
            // Encrypt the message
            val encrypted = cryptoManager.encryptMessage(text, recipientPublicKey)

            // Build encrypted message
            val message = JSONObject().apply {
                put("type", "message")
                put("to", targetDeviceId)
                put("encrypted", true)
                put("content", encrypted.ciphertext)
                put("nonce", encrypted.nonce)
                put("ephemeralPublicKey", encrypted.ephemeralPublicKey)
                put("timestamp", System.currentTimeMillis())
            }

            Log.d(TAG, "Sending encrypted message to $targetDeviceId (${text.length} chars)")
            webSocket?.send(message.toString()) ?: false
        } catch (e: Exception) {
            Log.e(TAG, "Failed to encrypt/send message: ${e.message}", e)
            listener?.onError("Failed to encrypt message: ${e.message}")
            false
        }
    }

    fun isConnected(): Boolean = isConnected

    fun requestDeviceList(): Boolean {
        if (!isConnected || webSocket == null) {
            return false
        }

        return try {
            val message = JSONObject().apply {
                put("type", "get_devices")
            }
            Log.d(TAG, "Requesting device list")
            webSocket?.send(message.toString()) ?: false
        } catch (e: Exception) {
            Log.e(TAG, "Failed to request device list: ${e.message}")
            listener?.onError("Failed to request device list: ${e.message}")
            false
        }
    }
}
