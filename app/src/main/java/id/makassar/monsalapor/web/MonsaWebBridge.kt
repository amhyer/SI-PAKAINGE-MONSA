package id.makassar.monsalapor.web

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.print.PrintAttributes
import android.print.PrintManager
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import id.makassar.monsalapor.R
import id.makassar.monsalapor.config.MonsaEnvironment
import java.io.ByteArrayInputStream
import java.io.File
import java.nio.charset.StandardCharsets

object MonsaWebAssets {
    const val APP_HOST = "appassets.androidplatform.net"
    const val APP_BASE_URL = "https://$APP_HOST/index.html"

    private fun buildNativeShimScript(): String {
        val envJson = MonsaEnvironment.buildWebEnvBootstrapJson()
        return """
        <script>
        (function() {
          window.__MONSA_ENV__ = $envJson;
          window.Capacitor = {
            isNativePlatform: function() { return true; },
            getPlatform: function() { return 'android'; }
          };

          // Prevent PWA Service Worker from intercepting WebViewAssetLoader requests
          if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
            try {
              navigator.serviceWorker.getRegistrations().then(function(regs) {
                regs.forEach(function(r) { r.unregister().catch(function() {}); });
              }).catch(function() {});
              navigator.serviceWorker.register = function() {
                return Promise.resolve({
                  scope: '/',
                  unregister: function() { return Promise.resolve(true); },
                  update: function() { return Promise.resolve(); }
                });
              };
            } catch (e) {}
          }

          var syncingFromNative = false;

          function applyBodyA11yClasses(large, highContrast) {
            if (document.body) {
              document.body.classList.toggle('monsa-a11y-large', !!large);
              document.body.classList.toggle('monsa-high-contrast', !!highContrast);
            }
            var rootChild = document.querySelector('#root > div');
            if (rootChild) {
              rootChild.classList.toggle('monsa-a11y-large', !!large);
              rootChild.classList.toggle('monsa-high-contrast', !!highContrast);
            }
          }

          window.__monsaSetAccessibility = function(large, highContrast) {
            syncingFromNative = true;
            try {
              try {
                window.localStorage.setItem('monsa_a11y_large', large ? '1' : '0');
                window.localStorage.setItem('monsa_high_contrast', highContrast ? '1' : '0');
              } catch (e) {}
              applyBodyA11yClasses(large, highContrast);
              var largeBtn = document.querySelector('button[aria-label="Mode huruf besar"]');
              if (largeBtn) {
                var btnLargeActive = largeBtn.className.indexOf('bg-amber-400') >= 0;
                if (btnLargeActive !== !!large) {
                  largeBtn.click();
                }
              }
              var contrastBtn = document.querySelector('button[aria-label="Mode kontras tinggi"]');
              if (contrastBtn) {
                var btnContrastActive = contrastBtn.className.indexOf('bg-yellow-400') >= 0;
                if (btnContrastActive !== !!highContrast) {
                  contrastBtn.click();
                }
              }
              applyBodyA11yClasses(large, highContrast);
            } finally {
              setTimeout(function() { syncingFromNative = false; }, 120);
            }
          };

          function attachA11yObserver() {
            var initialLarge = false;
            var initialContrast = false;
            try {
              initialLarge = window.localStorage.getItem('monsa_a11y_large') === '1';
              initialContrast = window.localStorage.getItem('monsa_high_contrast') === '1';
            } catch (e) {}
            applyBodyA11yClasses(initialLarge, initialContrast);

            var rootEl = document.getElementById('root');
            if (!rootEl || typeof MutationObserver === 'undefined') return;
            var observer = new MutationObserver(function() {
              if (syncingFromNative) return;
              var appRoot = rootEl.firstElementChild;
              if (!appRoot) return;
              var hasLarge = appRoot.classList.contains('monsa-a11y-large');
              var hasContrast = appRoot.classList.contains('monsa-high-contrast');
              if (document.body) {
                document.body.classList.toggle('monsa-a11y-large', hasLarge);
                document.body.classList.toggle('monsa-high-contrast', hasContrast);
              }
              if (window.MonsaAndroid && typeof window.MonsaAndroid.onAccessibilityStateChanged === 'function') {
                window.MonsaAndroid.onAccessibilityStateChanged(hasLarge, hasContrast);
              }
            });
            observer.observe(rootEl, { attributes: true, attributeFilter: ['class'], subtree: true, childList: true });
          }

          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', attachA11yObserver);
          } else {
            attachA11yObserver();
          }

          var origPrint = window.print ? window.print.bind(window) : null;
          window.print = function() {
            if (window.MonsaAndroid && typeof window.MonsaAndroid.printPage === 'function') {
              window.MonsaAndroid.printPage();
            } else if (origPrint) {
              origPrint();
            }
          };
          document.addEventListener('click', function(ev) {
            var target = ev.target;
            while (target && target.tagName !== 'A') {
              target = target.parentElement;
            }
            if (!target) return;
            var href = target.getAttribute('href') || '';
            var hasDownload = target.hasAttribute('download');
            if (!hasDownload) return;
            if (href.indexOf('blob:') !== 0 && href.indexOf('data:') !== 0) return;
            if (!window.MonsaAndroid || typeof window.MonsaAndroid.saveBase64File !== 'function') return;
            ev.preventDefault();
            var filename = target.getAttribute('download') || 'monsa_dokumen';
            if (href.indexOf('data:') === 0) {
              var parts = href.split(',');
              var mimeMatch = /^data:([^;]+)/.exec(parts[0] || '');
              var mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
              window.MonsaAndroid.saveBase64File(filename, mime, parts[1] || '');
              return;
            }
            fetch(href)
              .then(function(r) { return r.blob(); })
              .then(function(blob) {
                var reader = new FileReader();
                reader.onloadend = function() {
                  var res = String(reader.result || '');
                  var idx = res.indexOf(',');
                  var b64 = idx >= 0 ? res.slice(idx + 1) : res;
                  window.MonsaAndroid.saveBase64File(filename, blob.type || 'application/octet-stream', b64);
                };
                reader.readAsDataURL(blob);
              })
              .catch(function() {});
          }, true);
        })();
        </script>
    """.trimIndent()
    }

    private const val NOOP_SW_SCRIPT =
        "self.addEventListener('install', function(){ self.skipWaiting(); });" +
            "self.addEventListener('activate', function(e){ e.waitUntil(self.registration.unregister()); });"

    private fun buildInjectedIndexResponse(context: Context): WebResourceResponse? {
        return runCatching {
            val rawHtml = context.assets.open("index.html")
                .bufferedReader(StandardCharsets.UTF_8)
                .use { it.readText() }
            val shimScript = buildNativeShimScript()
            val injected = if (rawHtml.contains("<head>")) {
                rawHtml.replaceFirst("<head>", "<head>\n$shimScript")
            } else {
                "$shimScript\n$rawHtml"
            }
            WebResourceResponse(
                "text/html",
                "UTF-8",
                200,
                "OK",
                mapOf("Cache-Control" to "no-store, no-cache, must-revalidate"),
                ByteArrayInputStream(injected.toByteArray(StandardCharsets.UTF_8)),
            )
        }.getOrNull()
    }

    fun createAssetLoader(context: Context): WebViewAssetLoader {
        val assetsHandler = WebViewAssetLoader.AssetsPathHandler(context)
        val indexHandler = WebViewAssetLoader.PathHandler { path ->
            val normalized = path.trimStart('/').substringBefore('?').substringBefore('#')
            when {
                normalized.isEmpty() || normalized == "index.html" -> {
                    buildInjectedIndexResponse(context) ?: assetsHandler.handle("index.html")
                }
                normalized == "sw.js" -> {
                    WebResourceResponse(
                        "application/javascript",
                        "UTF-8",
                        200,
                        "OK",
                        mapOf("Cache-Control" to "no-store"),
                        ByteArrayInputStream(NOOP_SW_SCRIPT.toByteArray(StandardCharsets.UTF_8)),
                    )
                }
                else -> {
                    val assetResp = assetsHandler.handle(normalized)
                    if (assetResp != null) {
                        assetResp
                    } else if (!normalized.substringAfterLast('/').contains('.')) {
                        // SPA route fallback to bundled index.html
                        buildInjectedIndexResponse(context)
                    } else {
                        null
                    }
                }
            }
        }
        return WebViewAssetLoader.Builder()
            .setDomain(APP_HOST)
            .addPathHandler("/", indexHandler)
            .build()
    }

    fun buildEntryUrl(query: String?): String {
        val trimmed = query?.trim().orEmpty()
        return if (trimmed.isNotEmpty()) "$APP_BASE_URL?$trimmed" else APP_BASE_URL
    }

    fun buildApplyAccessibilityJs(largeText: Boolean, highContrast: Boolean): String {
        return """
            (function() {
              if (typeof window.__monsaSetAccessibility === 'function') {
                window.__monsaSetAccessibility($largeText, $highContrast);
              } else if (document.body) {
                document.body.classList.toggle('monsa-a11y-large', $largeText);
                document.body.classList.toggle('monsa-high-contrast', $highContrast);
              }
            })();
        """.trimIndent()
    }
}

class MonsaJsBridge(
    private val activity: Activity,
    private val webViewProvider: () -> WebView?,
    private val onWebAccessibilityChanged: (largeText: Boolean, highContrast: Boolean) -> Unit,
) {
    @JavascriptInterface
    fun onAccessibilityStateChanged(largeText: Boolean, highContrast: Boolean) {
        activity.runOnUiThread {
            onWebAccessibilityChanged(largeText, highContrast)
        }
    }

    @JavascriptInterface
    fun printPage() {
        activity.runOnUiThread {
            val webView = webViewProvider() ?: return@runOnUiThread
            val printManager = activity.getSystemService(Context.PRINT_SERVICE) as? PrintManager
                ?: return@runOnUiThread
            val jobName = activity.getString(R.string.print_job_name)
            val adapter = webView.createPrintDocumentAdapter(jobName)
            printManager.print(jobName, adapter, PrintAttributes.Builder().build())
        }
    }

    @JavascriptInterface
    fun saveBase64File(rawFileName: String, rawMimeType: String, base64Data: String) {
        runCatching {
            val safeName = rawFileName
                .substringAfterLast('/')
                .substringAfterLast('\\')
                .replace(Regex("[^A-Za-z0-9._-]"), "_")
                .ifBlank { "monsa_dokumen.pdf" }
            val mimeType = rawMimeType.ifBlank { "application/octet-stream" }
            val cleanBase64 = base64Data.substringAfter("base64,", base64Data)
            val bytes = Base64.decode(cleanBase64, Base64.DEFAULT)

            val exportsDir = File(activity.cacheDir, "exports").apply { mkdirs() }
            val outFile = File(exportsDir, safeName)
            outFile.writeBytes(bytes)

            val uri = FileProvider.getUriForFile(
                activity,
                "${activity.packageName}.fileprovider",
                outFile,
            )

            activity.runOnUiThread {
                val shareIntent = Intent(Intent.ACTION_SEND).apply {
                    type = mimeType
                    putExtra(Intent.EXTRA_STREAM, uri)
                    putExtra(Intent.EXTRA_SUBJECT, safeName)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                val chooser = Intent.createChooser(
                    shareIntent,
                    activity.getString(R.string.share_file_chooser),
                )
                activity.startActivity(chooser)
            }
        }
    }
}
