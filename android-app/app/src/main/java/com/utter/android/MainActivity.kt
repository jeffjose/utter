package com.utter.android

import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.Spinner
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

data class Device(
    val deviceId: String,
    val deviceName: String,
    val deviceType: String,
    val status: String
) {
    override fun toString(): String {
        return "$deviceName (${if (status == "online") "●" else "○"})"
    }
}

class MainActivity : AppCompatActivity() {

    private lateinit var serverUrlInput: EditText
    private lateinit var connectButton: Button
    private lateinit var statusText: TextView
    private lateinit var targetDeviceSpinner: Spinner
    private lateinit var textInput: EditText
    private lateinit var sendButton: Button

    private var webSocketClient: WebSocketClient? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var autoSendRunnable: Runnable? = null
    private val deviceList = mutableListOf<Device>()
    private lateinit var deviceAdapter: ArrayAdapter<Device>

    // Auto-send delay in milliseconds (2 seconds)
    private val AUTO_SEND_DELAY = 2000L

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
        targetDeviceSpinner = findViewById(R.id.targetDeviceSpinner)
        textInput = findViewById(R.id.textInput)
        sendButton = findViewById(R.id.sendButton)

        // Initialize device spinner
        deviceAdapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, deviceList)
        targetDeviceSpinner.adapter = deviceAdapter

        // Set default server URL based on whether running on emulator or physical device
        serverUrlInput.setText(getDefaultServerUrl())

        // Connect button handler
        connectButton.setOnClickListener {
            toggleConnection()
        }

        // Send button handler
        sendButton.setOnClickListener {
            sendText()
        }

        // Text input watcher for auto-send
        textInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}

            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                // Cancel previous auto-send
                autoSendRunnable?.let { mainHandler.removeCallbacks(it) }

                // Schedule new auto-send if text is not empty
                if (!s.isNullOrEmpty()) {
                    autoSendRunnable = Runnable {
                        sendText()
                    }.also {
                        mainHandler.postDelayed(it, AUTO_SEND_DELAY)
                    }
                }
            }

            override fun afterTextChanged(s: Editable?) {}
        })

        updateUI(false)
    }

    private fun toggleConnection() {
        if (webSocketClient?.isConnected() == true) {
            disconnect()
        } else {
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
            serverUrlInput.setText(serverUrl)  // Update the UI to show the full URL
        }

        updateStatus("Connecting...", false)

        webSocketClient = WebSocketClient(serverUrl)
        webSocketClient?.setListener(object : WebSocketClient.ConnectionListener {
            override fun onConnected() {
                runOnUiThread {
                    updateStatus("Connected - Fetching devices...", true)
                }
                // Fetch available devices after connecting
                fetchDeviceList()
                runOnUiThread {
                    updateStatus("Connected - ${deviceList.size} devices found", true)
                    updateUI(true)
                }
            }

            override fun onDisconnected() {
                runOnUiThread {
                    updateStatus("Disconnected", false)
                    updateUI(false)
                }
            }

            override fun onMessage(message: String) {
                runOnUiThread {
                    // Handle incoming messages if needed
                    println("Received: $message")
                }
            }

            override fun onError(error: String) {
                runOnUiThread {
                    updateStatus("Error: $error", false)
                    updateUI(false)
                }
            }
        })

        CoroutineScope(Dispatchers.IO).launch {
            webSocketClient?.connect()
        }
    }

    private fun disconnect() {
        webSocketClient?.disconnect()
        webSocketClient = null
        updateStatus("Disconnected", false)
        updateUI(false)
    }

    private fun sendText() {
        val text = textInput.text.toString().trim()

        if (text.isEmpty()) {
            return
        }

        if (webSocketClient?.isConnected() != true) {
            updateStatus("Not connected", false)
            return
        }

        // Get selected target device
        val selectedDevice = targetDeviceSpinner.selectedItem as? Device
        if (selectedDevice == null) {
            updateStatus("No target device selected", false)
            return
        }

        // Cancel pending auto-send
        autoSendRunnable?.let { mainHandler.removeCallbacks(it) }

        // Send text to selected device
        CoroutineScope(Dispatchers.IO).launch {
            webSocketClient?.sendTextToDevice(text, selectedDevice.deviceId)
        }

        // Clear input
        textInput.setText("")

        // Show feedback
        updateStatus("Sent to ${selectedDevice.deviceName}: ${text.take(20)}${if (text.length > 20) "..." else ""}", true)
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

    private fun updateUI(isConnected: Boolean) {
        serverUrlInput.isEnabled = !isConnected
        connectButton.text = if (isConnected) "Disconnect" else "Connect"
        targetDeviceSpinner.isEnabled = isConnected && deviceList.isNotEmpty()
        textInput.isEnabled = isConnected && deviceList.isNotEmpty()
        sendButton.isEnabled = isConnected && deviceList.isNotEmpty()
    }

    private fun fetchDeviceList() {
        // For now, add mock devices - will be replaced with actual API call
        deviceList.clear()
        deviceList.add(Device("linux-1", "Work Laptop", "linux", "online"))
        deviceList.add(Device("linux-2", "Home Desktop", "linux", "offline"))
        deviceAdapter.notifyDataSetChanged()

        runOnUiThread {
            updateUI(true)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        autoSendRunnable?.let { mainHandler.removeCallbacks(it) }
        disconnect()
    }
}
