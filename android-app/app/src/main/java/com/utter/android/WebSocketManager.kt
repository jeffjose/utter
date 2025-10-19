package com.utter.android

import com.utter.android.crypto.CryptoManager

object WebSocketManager {
    var client: WebSocketClient? = null
    var serverUrl: String = ""
    var cryptoManager: CryptoManager? = null

    fun isConnected(): Boolean {
        return client?.isConnected() == true
    }

    fun disconnect() {
        client?.disconnect()
        client = null
    }
}
