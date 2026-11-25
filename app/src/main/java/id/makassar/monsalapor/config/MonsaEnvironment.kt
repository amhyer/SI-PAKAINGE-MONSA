package id.makassar.monsalapor.config

import android.content.Context
import id.makassar.monsalapor.BuildConfig
import id.makassar.monsalapor.R
import org.json.JSONObject

/**
 * Centralized typed access to Android runtime environment variables injected via
 * the Secrets Gradle Plugin (`.env` / `.env.example` -> `BuildConfig`) and Firebase resources.
 *
 * Server-only secrets (`MONSA_SECRET_KEY`, `SMTP_PASS`) are intentionally excluded
 * from the client APK via `secrets.ignoreList` in `app/build.gradle.kts`.
 */
object MonsaEnvironment {
    val mapsApiKey: String
        get() = BuildConfig.MAPS_API_KEY.trim()

    val hasConfiguredMapsApiKey: Boolean
        get() = mapsApiKey.isNotEmpty() &&
            !mapsApiKey.equals("MAPS_API_KEY_DEFAULT_VALUE", ignoreCase = true) &&
            !mapsApiKey.equals("YOUR_API_KEY", ignoreCase = true)

    val environmentName: String
        get() = BuildConfig.MONSA_ENV.trim().ifEmpty { "development" }

    val isProduction: Boolean
        get() = environmentName.equals("production", ignoreCase = true)

    val isDemoDisabled: Boolean
        get() = BuildConfig.MONSA_DISABLE_DEMO.trim().let {
            it == "1" || it.equals("true", ignoreCase = true)
        }

    val webUrl: String
        get() = BuildConfig.MONSA_WEB_URL.trim()
            .ifEmpty { "https://lapor.sdnungmongisidi1.sch.id" }

    val apkUrl: String
        get() = BuildConfig.MONSA_APK_URL.trim()
            .ifEmpty { "https://lapor.sdnungmongisidi1.sch.id/downloads/si-pakainge-monsa.apk" }

    val webhookUrl: String
        get() = BuildConfig.MONSA_WEBHOOK_URL.trim()

    val apiBaseUrl: String
        get() = BuildConfig.API_BASE_URL.trim().ifEmpty { webUrl }

    val smtpHost: String
        get() = BuildConfig.SMTP_HOST.trim().ifEmpty { "smtp.gmail.com" }

    val smtpPort: Int
        get() = BuildConfig.SMTP_PORT.trim().toIntOrNull() ?: 587

    val smtpTlsEnabled: Boolean
        get() = BuildConfig.SMTP_TLS.trim().let {
            it == "1" || it.equals("true", ignoreCase = true)
        }

    val schoolEmailFrom: String
        get() = BuildConfig.SMTP_FROM.trim().ifEmpty { "sdnungmongisidi1@gmail.com" }

    val smtpUser: String
        get() = BuildConfig.SMTP_USER.trim().ifEmpty { schoolEmailFrom }

    fun firestoreDatabaseId(context: Context): String {
        return runCatching {
            context.applicationContext.getString(R.string.firestore_database_id)
        }.getOrDefault("")
    }

    /**
     * Builds a safe JSON object of non-secret runtime environment metadata for `web_bundle`.
     */
    fun buildWebEnvBootstrapJson(): String {
        return JSONObject().apply {
            put("env", environmentName)
            put("disableDemo", isDemoDisabled)
            put("webUrl", webUrl)
            put("apiBaseUrl", apiBaseUrl)
            put("apkUrl", apkUrl)
            put("schoolEmail", schoolEmailFrom)
            put("mapsNativeEnabled", hasConfiguredMapsApiKey)
        }.toString()
    }
}
