package com.utter.android

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.widget.ArrayAdapter
import android.widget.ListView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class DeviceListActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "DeviceListActivity"
    }

    private lateinit var statusText: TextView
    private lateinit var deviceListView: ListView
    private val devices = mutableListOf<WebSocketClient.Device>()
    private lateinit var adapter: ArrayAdapter<String>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_device_list)

        // Initialize views
        statusText = findViewById(R.id.statusText)
        deviceListView = findViewById(R.id.deviceListView)

        // Setup adapter
        adapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, mutableListOf())
        deviceListView.adapter = adapter

        // Device click handler
        deviceListView.setOnItemClickListener { _, _, position, _ ->
            val selectedDevice = devices[position]
            navigateToVoiceInput(selectedDevice)
        }

        // Check connection
        if (!WebSocketManager.isConnected()) {
            Toast.makeText(this, "Not connected. Returning to login.", Toast.LENGTH_SHORT).show()
            navigateToMain()
            return
        }

        // Setup listener for device list response
        WebSocketManager.client?.setListener(object : WebSocketClient.ConnectionListener {
            override fun onConnected() {}

            override fun onRegistered() {}

            override fun onDisconnected() {
                runOnUiThread {
                    Toast.makeText(this@DeviceListActivity, "Disconnected", Toast.LENGTH_SHORT).show()
                    navigateToMain()
                }
            }

            override fun onMessage(message: String) {}

            override fun onError(error: String) {
                runOnUiThread {
                    Toast.makeText(this@DeviceListActivity, "Error: $error", Toast.LENGTH_SHORT).show()
                }
            }

            override fun onDeviceList(deviceList: List<WebSocketClient.Device>) {
                runOnUiThread {
                    updateDeviceList(deviceList)
                }
            }
        })

        // Request device list
        fetchDevices()
    }

    private fun fetchDevices() {
        statusText.text = "Loading devices..."
        Log.d(TAG, "fetchDevices() called")
        Log.d(TAG, "WebSocket client null? ${WebSocketManager.client == null}")
        Log.d(TAG, "WebSocket connected? ${WebSocketManager.client?.isConnected()}")

        CoroutineScope(Dispatchers.IO).launch {
            val success = WebSocketManager.client?.requestDeviceList()
            Log.d(TAG, "requestDeviceList() returned: $success")
        }
    }

    private fun updateDeviceList(deviceList: List<WebSocketClient.Device>) {
        devices.clear()
        devices.addAll(deviceList)

        val displayList = deviceList.map { device ->
            val statusIcon = if (device.status == "online") "●" else "○"
            "$statusIcon ${device.deviceName}"
        }

        adapter.clear()
        adapter.addAll(displayList)
        adapter.notifyDataSetChanged()

        statusText.text = "Select a device (${devices.size} available)"
    }

    private fun navigateToVoiceInput(device: WebSocketClient.Device) {
        val intent = Intent(this, VoiceInputActivity::class.java).apply {
            putExtra("deviceId", device.deviceId)
            putExtra("deviceName", device.deviceName)
            putExtra("publicKey", device.publicKey)
        }
        startActivity(intent)
    }

    private fun navigateToMain() {
        val intent = Intent(this, MainActivity::class.java)
        startActivity(intent)
        finish()
    }

    override fun onBackPressed() {
        // Disconnect and go back to main
        WebSocketManager.disconnect()
        super.onBackPressed()
        navigateToMain()
    }
}
