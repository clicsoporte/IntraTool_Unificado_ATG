package com.clicsoporte.clic_driver

import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.UserManager
import android.provider.Settings
import android.os.Environment
import android.os.StatFs
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.telephony.TelephonyManager
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterFragmentActivity() {
    private val CHANNEL = "com.clicsoporte.clic_driver/kiosk"

    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        super.onCreate(savedInstanceState)
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager

            // Canal para el servicio en primer plano de sincronización continua
            val syncChannel = android.app.NotificationChannel(
                "clic_driver_background_sync",
                "Sincronización en Segundo Plano",
                android.app.NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Servicio de sincronización continua de Clic Driver"
                setShowBadge(false)
            }
            notificationManager.createNotificationChannel(syncChannel)

            // Canal para alertas y asignaciones de entregas
            val alertChannel = android.app.NotificationChannel(
                "clic_driver_assignments",
                "Asignaciones de Entregas y Recolectas",
                android.app.NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notificaciones de nuevas entregas o rutas asignadas"
                enableVibration(true)
            }
            notificationManager.createNotificationChannel(alertChannel)
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // Native SMS MethodChannel using driver SIM card via SmsManager
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "com.clicsoporte.clic_driver/sms").setMethodCallHandler { call, result ->
            if (call.method == "sendSms") {
                val phone = call.argument<String>("phone")
                val message = call.argument<String>("message")
                if (phone.isNullOrBlank() || message.isNullOrBlank()) {
                    result.error("INVALID_ARGS", "Teléfono o mensaje nulo", null)
                    return@setMethodCallHandler
                }
                try {
                    val smsManager: android.telephony.SmsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        this.getSystemService(android.telephony.SmsManager::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        android.telephony.SmsManager.getDefault()
                    }
                    val parts = smsManager.divideMessage(message)
                    if (parts.size > 1) {
                        smsManager.sendMultipartTextMessage(phone, null, parts, null, null)
                    } else {
                        smsManager.sendTextMessage(phone, null, message, null, null)
                    }
                    result.success(true)
                } catch (e: Exception) {
                    result.error("SMS_FAILED", e.message ?: "Error desconocido enviando SMS", null)
                }
            } else {
                result.notImplemented()
            }
        }

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(this, AdminReceiver::class.java)

            when (call.method) {
                "getBatteryInfo" -> {
                    try {
                        var batteryPct = -1
                        var isCharging = false
                        var tempC: Double? = null
                        var voltageV: Double? = null
                        var healthStr: String = "good"
                        var technologyStr: String = "Li-ion"

                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                            val bm = getSystemService(Context.BATTERY_SERVICE) as? android.os.BatteryManager
                            if (bm != null) {
                                batteryPct = bm.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY)
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                    isCharging = bm.isCharging
                                }
                            }
                        }
                        val intent = registerReceiver(null, android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED))
                        if (batteryPct <= 0 || batteryPct > 100) {
                            val level = intent?.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1) ?: -1
                            val scale = intent?.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, -1) ?: -1
                            val status = intent?.getIntExtra(android.os.BatteryManager.EXTRA_STATUS, -1) ?: -1
                            isCharging = status == android.os.BatteryManager.BATTERY_STATUS_CHARGING || status == android.os.BatteryManager.BATTERY_STATUS_FULL
                            batteryPct = if (level != -1 && scale > 0) (level * 100 / scale.toFloat()).toInt() else -1
                        }
                        val tempRaw = intent?.getIntExtra(android.os.BatteryManager.EXTRA_TEMPERATURE, -1) ?: -1
                        if (tempRaw > 0) {
                            tempC = tempRaw / 10.0
                        }

                        val voltageRaw = intent?.getIntExtra(android.os.BatteryManager.EXTRA_VOLTAGE, -1) ?: -1
                        if (voltageRaw > 0) {
                            voltageV = voltageRaw / 1000.0
                        }

                        val healthCode = intent?.getIntExtra(android.os.BatteryManager.EXTRA_HEALTH, -1) ?: -1
                        healthStr = when (healthCode) {
                            android.os.BatteryManager.BATTERY_HEALTH_GOOD -> "Buena (Óptima)"
                            android.os.BatteryManager.BATTERY_HEALTH_OVERHEAT -> "Sobrecalentada"
                            android.os.BatteryManager.BATTERY_HEALTH_DEAD -> "Degradada / Muerta"
                            android.os.BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "Sobrevoltaje"
                            android.os.BatteryManager.BATTERY_HEALTH_COLD -> "Fría"
                            else -> "Normal"
                        }

                        val tech = intent?.getStringExtra(android.os.BatteryManager.EXTRA_TECHNOLOGY)
                        if (!tech.isNullOrBlank()) {
                            technologyStr = tech
                        }

                        result.success(mapOf(
                            "level" to batteryPct,
                            "isCharging" to isCharging,
                            "temperature" to tempC,
                            "voltage" to voltageV,
                            "health" to healthStr,
                            "technology" to technologyStr
                        ))
                    } catch (e: Exception) {
                        result.success(mapOf("level" to 100, "isCharging" to false, "temperature" to null))
                    }
                }
                "getExtendedHardwareTelemetry" -> {
                    try {
                        val payload = mutableMapOf<String, Any?>()

                        // 1. RAM Info
                        try {
                            val actManager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
                            val memInfo = ActivityManager.MemoryInfo()
                            actManager.getMemoryInfo(memInfo)
                            val totalRamMb = (memInfo.totalMem / (1024 * 1024)).toInt()
                            val freeRamMb = (memInfo.availMem / (1024 * 1024)).toInt()
                            payload["ram_total_mb"] = totalRamMb
                            payload["ram_free_mb"] = freeRamMb
                        } catch (_: Exception) {}

                        // 2. Storage Info (Internal Flash)
                        try {
                            val stat = StatFs(Environment.getDataDirectory().path)
                            val blockSize = stat.blockSizeLong
                            val totalBlocks = stat.blockCountLong
                            val availableBlocks = stat.availableBlocksLong
                            val totalStorageMb = ((totalBlocks * blockSize) / (1024 * 1024)).toInt()
                            val freeStorageMb = ((availableBlocks * blockSize) / (1024 * 1024)).toInt()
                            payload["storage_total_mb"] = totalStorageMb
                            payload["storage_free_mb"] = freeStorageMb
                        } catch (_: Exception) {}

                        // 3. SIM Carrier & Line Info
                        try {
                            val tm = getSystemService(Context.TELEPHONY_SERVICE) as? android.telephony.TelephonyManager
                            if (tm != null) {
                                val simOp = tm.simOperatorName?.takeIf { it.isNotBlank() }
                                val netOp = tm.networkOperatorName?.takeIf { it.isNotBlank() }
                                payload["sim_carrier"] = simOp ?: netOp ?: "N/D"

                                try {
                                    val line1 = tm.line1Number?.takeIf { it.isNotBlank() }
                                    if (line1 != null) {
                                        payload["phone_number"] = line1
                                    }
                                } catch (_: Exception) {}
                            }
                        } catch (_: Exception) {}

                        // 4. Network Connection Type
                        try {
                            val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                            if (cm != null) {
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                                    val activeNet = cm.activeNetwork
                                    val caps = cm.getNetworkCapabilities(activeNet)
                                    if (caps != null) {
                                        when {
                                            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> payload["network_type"] = "WiFi"
                                            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> payload["network_type"] = "Móvil (Celular)"
                                            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> payload["network_type"] = "Ethernet"
                                            else -> payload["network_type"] = "Otro"
                                        }
                                    } else {
                                        payload["network_type"] = "Desconectado"
                                    }
                                } else {
                                    val info = cm.activeNetworkInfo
                                    payload["network_type"] = info?.typeName ?: "Desconectado"
                                }
                            }
                        } catch (_: Exception) {}

                        result.success(payload)
                    } catch (e: Exception) {
                        result.success(emptyMap<String, Any?>())
                    }
                }
                "getAndroidId" -> {
                    try {
                        val androidId = Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID)
                        result.success(androidId)
                    } catch (e: Exception) {
                        result.success(null)
                    }
                }
                "startLockTask" -> {
                    try {
                        val packagesArg = call.argument<List<String>>("packages")
                        if (dpm.isDeviceOwnerApp(packageName)) {
                            val packageList = mutableListOf(packageName)
                            if (packagesArg != null) {
                                packageList.addAll(packagesArg)
                            }
                            dpm.setLockTaskPackages(adminComponent, packageList.toTypedArray())
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                                dpm.setLockTaskFeatures(adminComponent, DevicePolicyManager.LOCK_TASK_FEATURE_NONE)
                            }
                        }
                        startLockTask()
                        result.success(true)
                    } catch (e: Exception) {
                        result.success(false)
                    }
                }
                "stopLockTask" -> {
                    try {
                        stopLockTask()
                        result.success(true)
                    } catch (e: Exception) {
                        result.success(false)
                    }
                }
                "isDeviceOwner" -> {
                    try {
                        result.success(dpm.isDeviceOwnerApp(packageName))
                    } catch (e: Exception) {
                        result.success(false)
                    }
                }
                "launchPackage" -> {
                    try {
                        val pkg = call.argument<String>("package")
                        if (pkg != null) {
                            val launchIntent = packageManager.getLaunchIntentForPackage(pkg)
                            if (launchIntent != null) {
                                launchIntent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                                startActivity(launchIntent)
                                result.success(true)
                            } else {
                                result.success(false)
                            }
                        } else {
                            result.success(false)
                        }
                    } catch (e: Exception) {
                        result.success(false)
                    }
                }
                "isKioskActive" -> {
                    try {
                        val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            val lockTaskMode = activityManager.lockTaskModeState
                            result.success(lockTaskMode != ActivityManager.LOCK_TASK_MODE_NONE)
                        } else {
                            result.success(false)
                        }
                    } catch (e: Exception) {
                        result.success(false)
                    }
                }
                "installApk" -> {
                    try {
                        val apkPath = call.argument<String>("apkPath")
                        if (apkPath != null) {
                            val file = java.io.File(apkPath)
                            if (file.exists()) {
                                if (dpm.isDeviceOwnerApp(packageName)) {
                                    try { dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_INSTALL_APPS) } catch (_: Exception) {}
                                    try { dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES) } catch (_: Exception) {}
                                }
                                val packageInstaller = packageManager.packageInstaller
                                val params = android.content.pm.PackageInstaller.SessionParams(
                                    android.content.pm.PackageInstaller.SessionParams.MODE_FULL_INSTALL
                                )
                                params.setAppPackageName(packageName)
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                    params.setRequireUserAction(android.content.pm.PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
                                }
                                val sessionId = packageInstaller.createSession(params)
                                val session = packageInstaller.openSession(sessionId)
                                
                                val out = session.openWrite("package", 0, file.length())
                                val input = java.io.FileInputStream(file)
                                val buffer = ByteArray(65536)
                                var c: Int
                                while (input.read(buffer).also { c = it } != -1) {
                                    out.write(buffer, 0, c)
                                }
                                session.fsync(out)
                                input.close()
                                out.close()

                                val intent = android.content.Intent(this, MainActivity::class.java)
                                val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                    android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_MUTABLE
                                } else {
                                    android.app.PendingIntent.FLAG_UPDATE_CURRENT
                                }
                                val pendingIntent = android.app.PendingIntent.getActivity(this, 0, intent, flags)
                                session.commit(pendingIntent.intentSender)
                                result.success(true)
                            } else {
                                result.error("FILE_NOT_FOUND", "El archivo APK no existe en $apkPath", null)
                            }
                        } else {
                            result.error("INVALID_ARGUMENT", "Path de APK nulo", null)
                        }
                    } catch (e: Exception) {
                        result.error("INSTALL_FAILED", e.message, null)
                    }
                }
                "uninstallUserPackage" -> {
                    try {
                        val pkgToUninstall = call.argument<String>("packageName")
                        if (pkgToUninstall.isNullOrBlank()) {
                            result.error("INVALID_ARGUMENT", "Nombre de paquete vacío", null)
                            return@setMethodCallHandler
                        }

                        val protectedSystemPkgs = setOf(
                            packageName,
                            "com.android.systemui",
                            "com.android.settings",
                            "com.google.android.gms",
                            "com.google.android.gsf",
                            "com.google.android.inputmethod.latin",
                            "com.samsung.android.honeyboard",
                            "com.sec.android.app.launcher",
                            "com.miui.home",
                            "com.mi.android.globallauncher",
                            "com.google.android.apps.nexuslauncher",
                            "com.android.launcher3",
                            "com.huawei.android.launcher",
                            "com.oppo.launcher",
                            "com.coloros.home",
                            "com.android.packageinstaller",
                            "com.google.android.packageinstaller",
                            "com.miui.packageinstaller",
                            "com.samsung.android.packageinstaller",
                            "com.miui.securitycenter",
                            "com.google.android.dialer",
                            "com.android.dialer",
                            "com.android.phone",
                            "com.android.server.telecom"
                        )

                        if (protectedSystemPkgs.contains(pkgToUninstall) || pkgToUninstall.startsWith("com.android.internal") || pkgToUninstall.contains("launcher")) {
                            result.error("PROTECTED_PACKAGE", "Este paquete es un componente vital del sistema y no puede ser desinstalado.", null)
                            return@setMethodCallHandler
                        }

                        if (dpm.isDeviceOwnerApp(packageName)) {
                            val packageInstaller = packageManager.packageInstaller
                            val intent = android.content.Intent(this, MainActivity::class.java)
                            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_MUTABLE
                            } else {
                                android.app.PendingIntent.FLAG_UPDATE_CURRENT
                            }
                            val pendingIntent = android.app.PendingIntent.getActivity(this, 0, intent, flags)
                            packageInstaller.uninstall(pkgToUninstall, pendingIntent.intentSender)
                            result.success(true)
                        } else {
                            result.error("NOT_DEVICE_OWNER", "Se requieren privilegios de Device Owner", null)
                        }
                    } catch (e: Exception) {
                        result.error("UNINSTALL_FAILED", e.message, null)
                    }
                }
                "rebootDevice" -> {
                    try {
                        if (dpm.isDeviceOwnerApp(packageName)) {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                                dpm.reboot(adminComponent)
                                result.success(true)
                            } else {
                                result.error("UNSUPPORTED_VERSION", "Reinicio remoto requiere Android 7.0+", null)
                            }
                        } else {
                            result.error("NOT_DEVICE_OWNER", "Se requieren privilegios de Device Owner", null)
                        }
                    } catch (e: Exception) {
                        result.error("REBOOT_FAILED", e.message, null)
                    }
                }
                "getInstalledApps" -> {
                    try {
                        val pm = packageManager
                        val packages = pm.getInstalledPackages(0)
                        val appsList = mutableListOf<Map<String, Any>>()
                        for (pkg in packages) {
                            val appInfo = pkg.applicationInfo
                            if (appInfo != null && pm.getLaunchIntentForPackage(pkg.packageName) != null) {
                                val appName = pm.getApplicationLabel(appInfo).toString()
                                val isSystem = (appInfo.flags and android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0 ||
                                               (appInfo.flags and android.content.pm.ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0
                                val map = mapOf(
                                    "name" to appName,
                                    "packageName" to pkg.packageName,
                                    "version" to (pkg.versionName ?: "1.0"),
                                    "isSystem" to isSystem
                                )
                                appsList.add(map)
                            }
                        }
                        result.success(appsList)
                    } catch (e: Exception) {
                        result.error("APPS_ERROR", e.message, null)
                    }
                }
                "showNativeNotification" -> {
                    try {
                        val title = call.argument<String>("title") ?: "Nueva Asignación"
                        val message = call.argument<String>("message") ?: "Se han asignado nuevas entregas a su ruta."
                        
                        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
                        val channelId = "clic_driver_assignments"

                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            val channel = android.app.NotificationChannel(
                                channelId,
                                "Asignaciones de Entregas y Recolectas",
                                android.app.NotificationManager.IMPORTANCE_HIGH
                            )
                            channel.description = "Notificaciones de nuevas órdenes, entregas y recolectas en ruta"
                            channel.enableVibration(true)
                            channel.vibrationPattern = longArrayOf(0, 400, 200, 400)
                            channel.enableLights(true)
                            notificationManager.createNotificationChannel(channel)
                        }

                        val intent = android.content.Intent(this, MainActivity::class.java).apply {
                            flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP
                        }
                        val pendingFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
                        } else {
                            android.app.PendingIntent.FLAG_UPDATE_CURRENT
                        }
                        val pendingIntent = android.app.PendingIntent.getActivity(this, 0, intent, pendingFlags)

                        val defaultSoundUri = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_NOTIFICATION)

                        val notification = androidx.core.app.NotificationCompat.Builder(this, channelId)
                            .setSmallIcon(android.R.drawable.ic_dialog_info)
                            .setContentTitle(title)
                            .setContentText(message)
                            .setStyle(androidx.core.app.NotificationCompat.BigTextStyle().bigText(message))
                            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
                            .setDefaults(androidx.core.app.NotificationCompat.DEFAULT_ALL)
                            .setSound(defaultSoundUri)
                            .setVibrate(longArrayOf(0, 400, 200, 400))
                            .setAutoCancel(true)
                            .setContentIntent(pendingIntent)
                            .build()

                        notificationManager.notify((System.currentTimeMillis() % 10000).toInt(), notification)
                        result.success(true)
                    } catch (e: Exception) {
                        result.error("NOTIF_ERROR", e.message, null)
                    }
                }
                "getSerialNumber" -> {
                    try {
                        var serial: String? = null
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            try {
                                if (dpm.isDeviceOwnerApp(packageName)) {
                                    serial = Build.getSerial()
                                }
                            } catch (_: Exception) {}
                            if (serial.isNullOrBlank() || serial == "unknown") {
                                try { serial = Build.SERIAL } catch (_: Exception) {}
                            }
                        } else {
                            serial = Build.SERIAL
                        }
                        result.success(if (serial != null && serial != "unknown" && serial.isNotBlank()) serial.trim() else null)
                    } catch (e: Exception) {
                        result.success(null)
                    }
                }
                "getImei" -> {
                    try {
                        val tm = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
                        var imeiResult: String? = null
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            try {
                                imeiResult = tm.getImei(0)
                            } catch (_: Exception) {}
                            if (imeiResult.isNullOrBlank()) {
                                try { imeiResult = tm.imei } catch (_: Exception) {}
                            }
                            if (imeiResult.isNullOrBlank()) {
                                try { imeiResult = tm.meid } catch (_: Exception) {}
                            }
                        } else {
                            @Suppress("DEPRECATION")
                            imeiResult = tm.deviceId
                        }
                        result.success(if (!imeiResult.isNullOrBlank() && imeiResult != "unknown") imeiResult.trim() else null)
                    } catch (e: Exception) {
                        result.success(null)
                    }
                }

                "stopLockTask" -> {
                    try {
                        stopLockTask()
                        result.success(true)
                    } catch (e: Exception) {
                        result.error("STOP_LOCK_TASK_ERROR", e.message, null)
                    }
                }
                "applyMdmRestrictions" -> {
                    try {
                        if (dpm.isDeviceOwnerApp(packageName)) {
                            val forceGps = call.argument<Boolean>("forceGps") ?: true
                            val disallowAirplaneMode = call.argument<Boolean>("disallowAirplaneMode") ?: false
                            val disallowMobileDataOff = call.argument<Boolean>("disallowMobileDataOff") ?: false
                            val blockUninstall = call.argument<Boolean>("blockUninstall") ?: true
                            val disallowSettings = call.argument<Boolean>("disallowSettings") ?: false
                            val disallowTethering = call.argument<Boolean>("disallowTethering") ?: false
                            val disallowInstallApps = call.argument<Boolean>("disallowInstallApps") ?: false
                            val disallowPlayStoreInstall = call.argument<Boolean>("disallowPlayStoreInstall") ?: false
                            val whitelistedPackages = call.argument<List<String>>("whitelistedPackages")

                            // 1. Force Location Always ON & Lockout (Garantiza lectura satelital al 100% y bloquea que el chofer la apague)
                            if (forceGps) {
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                                    try {
                                        dpm.setLocationEnabled(adminComponent, true)
                                    } catch (_: Exception) {}
                                }
                                dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_SHARE_LOCATION)
                                dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_LOCATION)
                            } else {
                                dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_SHARE_LOCATION)
                                dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_LOCATION)
                            }

                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                                if (disallowAirplaneMode) {
                                    dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_AIRPLANE_MODE)
                                } else {
                                    dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_AIRPLANE_MODE)
                                }
                            }

                            if (disallowMobileDataOff) {
                                dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_MOBILE_NETWORKS)
                                dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_DATA_ROAMING)
                            } else {
                                dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_MOBILE_NETWORKS)
                                dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_DATA_ROAMING)
                            }

                            // Forzar encendido nativo de Datos Móviles y Wi-Fi (Always ON)
                            try { dpm.setGlobalSetting(adminComponent, "mobile_data", "1") } catch (_: Exception) {}
                            try { dpm.setGlobalSetting(adminComponent, "wifi_on", "1") } catch (_: Exception) {}

                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                                dpm.setUninstallBlocked(adminComponent, packageName, blockUninstall)
                            }

                            if (disallowSettings) {
                                dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_DATE_TIME)
                                dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_CREDENTIALS)
                                dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_MODIFY_ACCOUNTS)
                                dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_FACTORY_RESET)
                            } else {
                                dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_DATE_TIME)
                                dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_CREDENTIALS)
                                dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_MODIFY_ACCOUNTS)
                                dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_FACTORY_RESET)
                            }

                            if (disallowTethering) {
                                dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_TETHERING)
                            } else {
                                dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_TETHERING)
                            }

                            // 7. Bloqueo de Instalaciones APK Locales (Orígenes Desconocidos)
                            if (disallowInstallApps) {
                                dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES)
                            } else {
                                dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES)
                            }

                            // 8. Bloqueo de Nuevas Apps en Play Store (Permite actualizar apps ya instaladas)
                            if (disallowPlayStoreInstall) {
                                dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_INSTALL_APPS)
                            } else {
                                dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_INSTALL_APPS)
                            }

                            // 9. Forzar WireGuard como Always-On VPN (Persistencia y Auto-Reconexión en Android/HyperOS)
                            val alwaysOnVpn = call.argument<Boolean>("alwaysOnVpn") ?: false
                            val vpnPackage = call.argument<String>("vpnPackage") ?: "com.wireguard.android"
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                                try {
                                    if (alwaysOnVpn) {
                                        // Servicio Always-On persistente con lockdown = false (mantiene WireGuard vivo sin aislar la red base)
                                        dpm.setAlwaysOnVpnPackage(adminComponent, vpnPackage, false)
                                        dpm.addUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_VPN)
                                        
                                        // Exención de optimización de batería nativa para WireGuard si es Device Owner
                                        try {
                                            val powerManager = getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
                                            if (powerManager != null && !powerManager.isIgnoringBatteryOptimizations(vpnPackage)) {
                                                // Trigger background ping intent to keep alive
                                                val wgIntent = android.content.Intent("com.wireguard.android.action.SET_TUNNEL_UP").apply {
                                                    setPackage(vpnPackage)
                                                }
                                                sendBroadcast(wgIntent)
                                            }
                                        } catch (_: Exception) {}
                                    } else {
                                        // Desactiva la restricción Always-On si se desmarca
                                        val currentAlwaysOn = dpm.getAlwaysOnVpnPackage(adminComponent)
                                        if (currentAlwaysOn == vpnPackage) {
                                            dpm.setAlwaysOnVpnPackage(adminComponent, null, false)
                                        }
                                        dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_CONFIG_VPN)
                                    }
                                } catch (vpnEx: Exception) {
                                    // WireGuard no instalado aún o restricción de fabricante
                                }
                            }

                            // 10. Whitelist / Suspend Non-whitelisted Packages & Settings App Suspension
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                                try {
                                    val pm = packageManager
                                    val installed = pm.getInstalledPackages(0)
                                    val toSuspend = mutableListOf<String>()
                                    val toUnsuspend = mutableListOf<String>()

                                    val criticalSystemPkgs = setOf(
                                        packageName,
                                        "com.android.systemui",
                                        "com.android.vending",                   // Google Play Store (Activa para actualizar apps existentes)
                                        "com.google.android.gms",
                                        "com.google.android.gsf",
                                        "com.google.android.inputmethod.latin",
                                        "com.samsung.android.honeyboard",
                                        "com.sec.android.app.launcher",
                                        "com.miui.home",
                                        "com.mi.android.globallauncher",
                                        "com.google.android.apps.nexuslauncher",
                                        "com.android.launcher3",
                                        "com.huawei.android.launcher",
                                        "com.oppo.launcher",
                                        "com.coloros.home",
                                        "com.android.packageinstaller",
                                        "com.google.android.packageinstaller",
                                        "com.miui.packageinstaller",
                                        "com.samsung.android.packageinstaller",
                                        "com.miui.securitycenter",
                                        "com.google.android.dialer",
                                        "com.android.dialer",
                                        "com.android.phone",
                                        "com.android.server.telecom",
                                        "com.samsung.android.incallui",
                                        "com.wireguard.android"                  // WireGuard VPN (Protegido siempre de suspensión)
                                    )

                                    val hasActiveWhitelist = whitelistedPackages != null && whitelistedPackages.isNotEmpty()

                                    for (pkg in installed) {
                                        val pName = pkg.packageName

                                        if (pName == "com.android.settings") {
                                            if (disallowSettings) {
                                                toSuspend.add(pName)
                                            } else {
                                                toUnsuspend.add(pName)
                                            }
                                            continue
                                        }

                                        if (criticalSystemPkgs.contains(pName) || pName.startsWith("com.android.internal") || pName.contains("launcher") || pName.contains("home")) {
                                            toUnsuspend.add(pName)
                                            continue
                                        }

                                        if (hasActiveWhitelist) {
                                            if (whitelistedPackages!!.contains(pName)) {
                                                toUnsuspend.add(pName)
                                            } else {
                                                if (pm.getLaunchIntentForPackage(pName) != null) {
                                                    toSuspend.add(pName)
                                                }
                                            }
                                        } else {
                                            toUnsuspend.add(pName)
                                        }
                                    }

                                    if (toUnsuspend.isNotEmpty()) {
                                        try { dpm.setPackagesSuspended(adminComponent, toUnsuspend.toTypedArray(), false) } catch (_: Exception) {}
                                    }
                                    if (toSuspend.isNotEmpty()) {
                                        try { dpm.setPackagesSuspended(adminComponent, toSuspend.toTypedArray(), true) } catch (_: Exception) {}
                                    }
                                } catch (_: Exception) {}
                            }

                            result.success(true)
                        } else {
                            result.success(false)
                        }
                    } catch (e: Exception) {
                        result.error("MDM_RESTRICTION_ERROR", e.message, null)
                    }
                }
                "clearAllMdmRestrictions" -> {
                    try {
                        if (dpm.isDeviceOwnerApp(packageName)) {
                            // 1. Detener modo Kiosco
                            try { stopLockTask() } catch (_: Exception) {}

                            // 2. Despejar todas las restricciones de usuario de Android
                            val restrictionsToClear = listOf(
                                UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES,
                                UserManager.DISALLOW_INSTALL_APPS,
                                UserManager.DISALLOW_UNINSTALL_APPS,
                                UserManager.DISALLOW_CONFIG_MOBILE_NETWORKS,
                                UserManager.DISALLOW_DATA_ROAMING,
                                UserManager.DISALLOW_CONFIG_DATE_TIME,
                                UserManager.DISALLOW_CONFIG_CREDENTIALS,
                                UserManager.DISALLOW_MODIFY_ACCOUNTS,
                                UserManager.DISALLOW_FACTORY_RESET,
                                UserManager.DISALLOW_CONFIG_TETHERING,
                                UserManager.DISALLOW_CONFIG_VPN,
                                UserManager.DISALLOW_SHARE_LOCATION,
                                UserManager.DISALLOW_CONFIG_LOCATION
                            )
                            for (resKey in restrictionsToClear) {
                                try { dpm.clearUserRestriction(adminComponent, resKey) } catch (_: Exception) {}
                            }
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                                try { dpm.clearUserRestriction(adminComponent, UserManager.DISALLOW_AIRPLANE_MODE) } catch (_: Exception) {}
                            }

                            // 3. Permitir desinstalación de Clic Driver
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                                try { dpm.setUninstallBlocked(adminComponent, packageName, false) } catch (_: Exception) {}
                            }

                            // 4. Descongelar/Desuspender todas las aplicaciones instaladas
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                                try {
                                    val pm = packageManager
                                    val installed = pm.getInstalledPackages(0).map { it.packageName }
                                    dpm.setPackagesSuspended(adminComponent, installed.toTypedArray(), false)
                                } catch (_: Exception) {}
                            }

                            // 5. Liberar Always-On VPN temporalmente
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                                try { dpm.setAlwaysOnVpnPackage(adminComponent, null, false) } catch (_: Exception) {}
                            }

                            result.success(true)
                        } else {
                            try { stopLockTask() } catch (_: Exception) {}
                            result.success(true)
                        }
                    } catch (e: Exception) {
                        result.error("CLEAR_MDM_ERROR", e.message, null)
                    }
                }
                "restartWireGuardVpnTunnel" -> {
                    try {
                        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
                        val adminComponent = ComponentName(this, AdminReceiver::class.java)
                        val isOwner = dpm.isDeviceOwnerApp(packageName)
                        val vpnPackage = call.argument<String>("vpnPackage") ?: "com.wireguard.android"
                        val tunnelName = call.argument<String>("tunnelName")

                        // 1. Refrescar estado nativo Always-On si es Device Owner
                        if (isOwner && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                            try {
                                dpm.setAlwaysOnVpnPackage(adminComponent, null, false)
                                Thread.sleep(200)
                                dpm.setAlwaysOnVpnPackage(adminComponent, vpnPackage, false)
                            } catch (_: Exception) {}
                        }

                        // 2. Disparar Broadcast Intents oficiales de WireGuard
                        try {
                            val refreshIntent = android.content.Intent("com.wireguard.android.action.REFRESH_TUNNEL_STATES").apply {
                                setPackage(vpnPackage)
                            }
                            sendBroadcast(refreshIntent)

                            if (!tunnelName.isNullOrBlank()) {
                                val downIntent = android.content.Intent("com.wireguard.android.action.SET_TUNNEL_DOWN").apply {
                                    setPackage(vpnPackage)
                                    putExtra("tunnel", tunnelName)
                                }
                                sendBroadcast(downIntent)

                                Thread.sleep(300)

                                val upIntent = android.content.Intent("com.wireguard.android.action.SET_TUNNEL_UP").apply {
                                    setPackage(vpnPackage)
                                    putExtra("tunnel", tunnelName)
                                }
                                sendBroadcast(upIntent)
                            } else {
                                val upIntent = android.content.Intent("com.wireguard.android.action.SET_TUNNEL_UP").apply {
                                    setPackage(vpnPackage)
                                }
                                sendBroadcast(upIntent)
                            }
                        } catch (_: Exception) {}

                        result.success(true)
                    } catch (e: Exception) {
                        result.success(false)
                    }
                }
                "ensureConnectivityAlwaysOn" -> {
                    try {
                        if (dpm.isDeviceOwnerApp(packageName)) {
                            try { dpm.setGlobalSetting(adminComponent, "mobile_data", "1") } catch (_: Exception) {}
                            try { dpm.setGlobalSetting(adminComponent, "wifi_on", "1") } catch (_: Exception) {}
                        }
                        try {
                            val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as? android.net.wifi.WifiManager
                            if (wifiManager != null && !wifiManager.isWifiEnabled) {
                                @Suppress("DEPRECATION")
                                wifiManager.isWifiEnabled = true
                            }
                        } catch (_: Exception) {}
                        result.success(true)
                    } catch (e: Exception) {
                        result.success(false)
                    }
                }
                else -> result.notImplemented()
            }
        }
    }
}
