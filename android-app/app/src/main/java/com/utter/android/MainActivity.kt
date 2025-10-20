package com.utter.android

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.utter.android.crypto.CryptoManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "MainActivity"
    }

    private lateinit var serverUrlInput: EditText
    private lateinit var connectButton: Button
    private lateinit var statusText: TextView
    private lateinit var authManager: GoogleAuthManager

    private fun isEmulator(): Boolean {
        return (Build.FINGERPRINT.startsWith("generic")
                || Build.FINGERPRINT.startsWith("unknown")
                || Build.MODEL.contains("google_sdk")
                || Build.MODEL.contains("Emulator")
                || Build.MODEL.contains("Android SDK built for x86")
                || Build.MANUFACTURER.contains("Genymotion")
                || (Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic"))
                || "google_sdk" == Build.PRODUCT)
    }

    private fun getDefaultServerUrl(): String {
        return if (isEmulator()) {
            "ws://10.0.2.2:8080"  // Emulator - use special loopback address
        } else {
            "192.168.3.189:8080"  // Physical device - pre-filled for testing
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Initialize views
        serverUrlInput = findViewById(R.id.serverUrlInput)
        connectButton = findViewById(R.id.connectButton)
        statusText = findViewById(R.id.statusText)

        // Initialize OAuth manager
        authManager = GoogleAuthManager(this, BuildConfig.GOOGLE_CLIENT_ID)

        // Set default server URL
        serverUrlInput.setText(getDefaultServerUrl())

        // Check if already connected
        if (WebSocketManager.isConnected()) {
            navigateToDeviceList()
            return
        }

        // Connect button handler
        connectButton.setOnClickListener {
            connect()
        }
    }

    private fun connect() {
        var serverUrl = serverUrlInput.text.toString().trim()

        if (serverUrl.isEmpty()) {
            updateStatus("Please enter server URL", false)
            return
        }

        // Auto-prepend ws:// if not present
        if (!serverUrl.startsWith("ws://") && !serverUrl.startsWith("wss://")) {
            serverUrl = "ws://$serverUrl"
            serverUrlInput.setText(serverUrl)
        }

        updateStatus("Connecting...", false)
        connectButton.isEnabled = false

        // Initialize crypto manager
        if (WebSocketManager.cryptoManager == null) {
            Log.d(TAG, "Initializing crypto manager")
            WebSocketManager.cryptoManager = CryptoManager(applicationContext)
            val publicKey = WebSocketManager.cryptoManager?.initialize()
            Log.d(TAG, "Crypto initialized. Public key: ${publicKey?.take(32)}...")
        }

        // Get fresh OAuth ID token and exchange for JWT
        updateStatus("Authenticating...", false)

        // Exchange OAuth token for JWT in background
        CoroutineScope(Dispatchers.IO).launch {
            try {
                // Get fresh ID token via silent sign-in
                val idToken = authManager.getIdTokenAsync()

                if (idToken != null) {
                    Log.d(TAG, "Fresh OAuth ID token obtained, exchanging for JWT...")
                    val jwt = WebSocketClient.exchangeForJWT(serverUrl, idToken)
                    Log.d(TAG, "JWT obtained successfully")

                    // Now connect with JWT
                    connectWithJWT(serverUrl, jwt)
                } else {
                    Log.w(TAG, "No OAuth token available - connecting without JWT")
                    runOnUiThread {
                        updateStatus("Not signed in. Please sign in first.", false)
                        connectButton.isEnabled = true
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to authenticate: ${e.message}", e)
                runOnUiThread {
                    updateStatus("Authentication failed: ${e.message}", false)
                    connectButton.isEnabled = true
                }
            }
        }
    }

    private fun connectWithJWT(serverUrl: String, jwt: String?) {
        WebSocketManager.serverUrl = serverUrl
        WebSocketManager.client = WebSocketClient(serverUrl, WebSocketManager.cryptoManager, jwt)

        WebSocketManager.client?.setListener(object : WebSocketClient.ConnectionListener {
            override fun onConnected() {
                runOnUiThread {
                    updateStatus("Connected - Registering...", false)
                }
            }

            override fun onRegistered() {
                runOnUiThread {
                    updateStatus("Registered - Loading devices...", true)
                    navigateToDeviceList()
                }
            }

            override fun onDisconnected() {
                runOnUiThread {
                    updateStatus("Disconnected", false)
                    connectButton.isEnabled = true
                }
            }

            override fun onMessage(message: String) {
                // Not used in connection screen
            }

            override fun onError(error: String) {
                runOnUiThread {
                    updateStatus("Error: $error", false)
                    connectButton.isEnabled = true
                }
            }

            override fun onDeviceList(devices: List<WebSocketClient.Device>) {
                // Not used in connection screen
            }
        })

        CoroutineScope(Dispatchers.IO).launch {
            WebSocketManager.client?.connect()
        }
    }

    private fun navigateToDeviceList() {
        val intent = Intent(this, DeviceListActivity::class.java)
        startActivity(intent)
        finish()
    }

    private fun updateStatus(message: String, isConnected: Boolean) {
        statusText.text = message
        statusText.setTextColor(
            if (isConnected) {
                getColor(android.R.color.holo_green_dark)
            } else {
                getColor(android.R.color.holo_red_dark)
            }
        )
    }

    override fun onDestroy() {
        super.onDestroy()
        // Don't disconnect here - we want to keep the connection alive
    }
}
