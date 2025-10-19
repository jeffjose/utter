package com.utter.android

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class VoiceInputActivity : AppCompatActivity() {

    private lateinit var deviceNameText: TextView
    private lateinit var statusText: TextView
    private lateinit var textInput: EditText

    private var deviceId: String = ""
    private var deviceName: String = ""
    private var devicePublicKey: String? = null

    private val mainHandler = Handler(Looper.getMainLooper())
    private var autoSendRunnable: Runnable? = null

    // Auto-send delay in milliseconds (2 seconds)
    private val AUTO_SEND_DELAY = 2000L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_voice_input)

        // Get device info from intent
        deviceId = intent.getStringExtra("deviceId") ?: ""
        deviceName = intent.getStringExtra("deviceName") ?: ""
        devicePublicKey = intent.getStringExtra("publicKey")

        if (deviceId.isEmpty()) {
            Toast.makeText(this, "No device selected", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        // Initialize views
        deviceNameText = findViewById(R.id.deviceNameText)
        statusText = findViewById(R.id.statusText)
        textInput = findViewById(R.id.textInput)

        // Display device name
        deviceNameText.text = "Sending to: $deviceName"
        statusText.text = "Speak or type a message..."

        // Check connection
        if (!WebSocketManager.isConnected()) {
            Toast.makeText(this, "Not connected", Toast.LENGTH_SHORT).show()
            navigateToMain()
            return
        }

        // Setup listener
        WebSocketManager.client?.setListener(object : WebSocketClient.ConnectionListener {
            override fun onConnected() {}

            override fun onRegistered() {}

            override fun onDisconnected() {
                runOnUiThread {
                    Toast.makeText(this@VoiceInputActivity, "Disconnected", Toast.LENGTH_SHORT).show()
                    navigateToMain()
                }
            }

            override fun onMessage(message: String) {}

            override fun onError(error: String) {
                runOnUiThread {
                    statusText.text = "Error: $error"
                    statusText.setTextColor(getColor(android.R.color.holo_red_dark))
                }
            }

            override fun onDeviceList(devices: List<WebSocketClient.Device>) {}
        })

        // Text input watcher for auto-send
        textInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}

            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                // Cancel previous auto-send
                autoSendRunnable?.let { mainHandler.removeCallbacks(it) }

                // Schedule new auto-send if text is not empty
                if (!s.isNullOrEmpty()) {
                    statusText.text = "Will send in 2s..."
                    statusText.setTextColor(getColor(android.R.color.holo_orange_dark))

                    autoSendRunnable = Runnable {
                        sendText()
                    }.also {
                        mainHandler.postDelayed(it, AUTO_SEND_DELAY)
                    }
                } else {
                    statusText.text = "Speak or type a message..."
                    statusText.setTextColor(getColor(android.R.color.darker_gray))
                }
            }

            override fun afterTextChanged(s: Editable?) {}
        })

        // Focus on input
        textInput.requestFocus()
    }

    private fun sendText() {
        val text = textInput.text.toString().trim()

        if (text.isEmpty()) {
            return
        }

        if (!WebSocketManager.isConnected()) {
            statusText.text = "Not connected"
            statusText.setTextColor(getColor(android.R.color.holo_red_dark))
            return
        }

        // Cancel pending auto-send
        autoSendRunnable?.let { mainHandler.removeCallbacks(it) }

        // Send text to device (encrypted if public key available)
        CoroutineScope(Dispatchers.IO).launch {
            val sent = if (devicePublicKey != null && WebSocketManager.cryptoManager != null) {
                // Send encrypted
                WebSocketManager.client?.sendEncryptedTextToDevice(text, deviceId, devicePublicKey!!) ?: false
            } else {
                // Send plaintext (fallback or no crypto)
                WebSocketManager.client?.sendTextToDevice(text, deviceId) ?: false
            }

            if (sent) {
                runOnUiThread {
                    // Show feedback
                    val preview = if (text.length > 30) text.take(30) + "..." else text
                    val encryptedLabel = if (devicePublicKey != null) "🔒" else ""
                    statusText.text = "✓ $encryptedLabel Sent: $preview"
                    statusText.setTextColor(getColor(android.R.color.holo_green_dark))

                    // Clear input
                    textInput.setText("")

                    // Reset status after 2 seconds
                    mainHandler.postDelayed({
                        statusText.text = "Speak or type a message..."
                        statusText.setTextColor(getColor(android.R.color.darker_gray))
                    }, 2000)
                }
            }
        }
    }

    private fun navigateToMain() {
        val intent = Intent(this, MainActivity::class.java)
        startActivity(intent)
        finish()
    }

    override fun onBackPressed() {
        // Go back to device list
        super.onBackPressed()
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        autoSendRunnable?.let { mainHandler.removeCallbacks(it) }
    }
}
