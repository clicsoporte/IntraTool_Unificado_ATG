package com.clicsoporte.clic_driver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.location.Location
import android.location.LocationManager
import android.util.Log
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class ShutdownReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        Log.w("ShutdownReceiver", "🚨 Evento de apagado recibido en sistema Android: $action")

        if (Intent.ACTION_SHUTDOWN == action || "android.intent.action.QUICKBOOT_POWEROFF" == action || Intent.ACTION_BATTERY_LOW == action) {
            thread {
                try {
                    val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
                    var lastLoc: Location? = null
                    if (lm != null) {
                        try {
                            lastLoc = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                                ?: lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
                        } catch (_: Exception) {}
                    }

                    var batteryPct: Int? = null
                    try {
                        val iFilter = android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED)
                        val bStatus = context.registerReceiver(null, iFilter)
                        val level = bStatus?.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1) ?: -1
                        val scale = bStatus?.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, -1) ?: -1
                        if (level >= 0 && scale > 0) {
                            batteryPct = (level * 100 / scale)
                        }
                    } catch (_: Exception) {}

                    val prefs = context.getSharedPreferences("FlutterSharedPreferences", Context.MODE_PRIVATE)
                    val serverUrl = prefs.getString("flutter.server_url", "http://192.168.1.14:9001") ?: "http://192.168.1.14:9001"
                    val hwid = prefs.getString("flutter.hardware_id", "") ?: ""

                    if (hwid.isNotEmpty()) {
                        val cleanUrl = if (serverUrl.startsWith("http")) serverUrl else "http://$serverUrl"
                        val url = URL("$cleanUrl/api/fleet/app-version")
                        val conn = url.openConnection() as HttpURLConnection
                        conn.requestMethod = "POST"
                        conn.setRequestProperty("Content-Type", "application/json")
                        conn.connectTimeout = 3000
                        conn.readTimeout = 3000
                        conn.doOutput = true

                        val json = JSONObject()
                        json.put("hwid", hwid)
                        json.put("is_shutdown_event", true)
                        json.put("shutdown_action", action)
                        if (batteryPct != null) {
                            json.put("battery_level", batteryPct)
                            json.put("battery", batteryPct)
                        }
                        if (lastLoc != null) {
                            json.put("lat", lastLoc.latitude)
                            json.put("lng", lastLoc.longitude)
                        }

                        val writer = OutputStreamWriter(conn.outputStream)
                        writer.write(json.toString())
                        writer.flush()
                        writer.close()

                        Log.w("ShutdownReceiver", "✅ Ping de emergencia por apagado enviado a Clic-Tools: ${conn.responseCode}")
                    }
                } catch (e: Exception) {
                    Log.e("ShutdownReceiver", "Error enviando ping de apagado: ${e.message}")
                }
            }
        }
    }
}
