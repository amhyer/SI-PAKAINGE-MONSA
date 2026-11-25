import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.google.services)
    alias(libs.plugins.secrets)
}

val monsaEnvProps = Properties().apply {
    val exampleFile = rootProject.file(".env.example")
    if (exampleFile.exists()) {
        exampleFile.inputStream().use { load(it) }
    }
    val localEnvFile = rootProject.file(".env")
    if (localEnvFile.exists()) {
        localEnvFile.inputStream().use { load(it) }
    }
}

fun monsaEnvValue(key: String, fallback: String = ""): String {
    val raw = monsaEnvProps.getProperty(key)?.trim()
    val value = if (!raw.isNullOrEmpty()) raw else fallback
    return value.replace("\\", "\\\\").replace("\"", "\\\"")
}

android {
    namespace = "id.makassar.monsalapor"
    compileSdk = 36

    defaultConfig {
        applicationId = "id.makassar.monsalapor"
        minSdk = 24
        targetSdk = 36
        versionCode = 223
        versionName = "2.2.3"
        manifestPlaceholders["MAPS_API_KEY"] = monsaEnvValue("MAPS_API_KEY", "MAPS_API_KEY_DEFAULT_VALUE")

        buildConfigField("String", "MONSA_ENV", "\"${monsaEnvValue("MONSA_ENV", "development")}\"")
        buildConfigField("String", "MONSA_DISABLE_DEMO", "\"${monsaEnvValue("MONSA_DISABLE_DEMO", "0")}\"")
        buildConfigField("String", "MONSA_WEB_URL", "\"${monsaEnvValue("MONSA_WEB_URL", "https://lapor.sdnungmongisidi1.sch.id")}\"")
        buildConfigField("String", "MONSA_APK_URL", "\"${monsaEnvValue("MONSA_APK_URL", "https://lapor.sdnungmongisidi1.sch.id/downloads/si-pakainge-monsa.apk")}\"")
        buildConfigField("String", "MONSA_WEBHOOK_URL", "\"${monsaEnvValue("MONSA_WEBHOOK_URL", "https://lapor.sdnungmongisidi1.sch.id/webhook/notifikasi")}\"")
        buildConfigField("String", "API_BASE_URL", "\"${monsaEnvValue("VITE_API_BASE_URL", "https://lapor.sdnungmongisidi1.sch.id")}\"")
        buildConfigField("String", "SMTP_HOST", "\"${monsaEnvValue("SMTP_HOST", "smtp.gmail.com")}\"")
        buildConfigField("String", "SMTP_PORT", "\"${monsaEnvValue("SMTP_PORT", "587")}\"")
        buildConfigField("String", "SMTP_TLS", "\"${monsaEnvValue("SMTP_TLS", "1")}\"")
        buildConfigField("String", "SMTP_FROM", "\"${monsaEnvValue("SMTP_FROM", "sdnungmongisidi1@gmail.com")}\"")
        buildConfigField("String", "SMTP_USER", "\"${monsaEnvValue("SMTP_USER", "sdnungmongisidi1@gmail.com")}\"")
    }

    signingConfigs {
        create("debugConfig") {
            storeFile = file("${rootDir}/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("debugConfig")
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("debugConfig")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    sourceSets {
        getByName("main") {
            assets.directories.addAll(listOf("src/main/assets", "../web_bundle"))
        }
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
        }
    }
}

secrets {
    propertiesFileName = ".env"
    defaultPropertiesFileName = ".env.example"
    // Public MONSA_*/SMTP_*/VITE_* fields are wired via defaultConfig; server secrets stay excluded from client APK
    ignoreList.add("MONSA_.*")
    ignoreList.add("SMTP_.*")
    ignoreList.add("VITE_.*")
    ignoreList.add("PORT")
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)
    implementation(libs.androidx.webkit)

    // Firebase BoM + Firestore + Auth + AI Logic + App Check
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.firestore)
    implementation(libs.firebase.auth)
    implementation(libs.firebase.ai)
    implementation(libs.firebase.appcheck.recaptcha)
    implementation(libs.firebase.appcheck.debug)

    // Google Sign-In via Jetpack Credential Manager
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services)
    implementation(libs.googleid)
    implementation(libs.kotlinx.coroutines.play.services)

    // Google Maps SDK for Android + Jetpack Compose
    implementation(libs.maps.compose)
    implementation(libs.play.services.maps)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(platform(libs.androidx.compose.bom))
    testImplementation(libs.androidx.compose.ui.test.junit4)
}
