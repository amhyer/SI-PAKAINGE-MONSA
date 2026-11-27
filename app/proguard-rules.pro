# Keep JavaScript bridge methods exposed to the bundled portal WebView
-keepclassmembers class id.makassar.monsalapor.web.MonsaJsBridge {
    @android.webkit.JavascriptInterface <methods>;
}

# Preserve Firestore data models and @Keep annotated classes for release builds
-keep @androidx.annotation.Keep class * { *; }
-keepclassmembers class id.makassar.monsalapor.data.** { *; }
