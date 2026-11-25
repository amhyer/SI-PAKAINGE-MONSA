package id.makassar.monsalapor.ui

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.view.ViewGroup
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import id.makassar.monsalapor.BuildConfig
import id.makassar.monsalapor.R
import id.makassar.monsalapor.firebase.findActivity
import id.makassar.monsalapor.web.MonsaJsBridge
import id.makassar.monsalapor.web.MonsaWebAssets
import kotlinx.coroutines.delay

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun MonsaWebScreen(
    initialQuery: String?,
    a11yState: AccessibilityUiState,
    onOpenA11yPanel: () -> Unit,
    onCloseA11yPanel: () -> Unit,
    onSetLargeText: (Boolean) -> Unit,
    onSetHighContrast: (Boolean) -> Unit,
    onEnableAllA11y: () -> Unit,
    onResetA11y: () -> Unit,
    onSyncA11yFromWeb: (Boolean, Boolean) -> Unit,
    modifier: Modifier = Modifier,
    embeddedInShell: Boolean = false,
) {
    val context = LocalContext.current
    val activity = remember(context) { context.findActivity() }
    val lifecycleOwner = LocalLifecycleOwner.current
    val assetLoader = remember(context) { MonsaWebAssets.createAssetLoader(context) }
    val entryUrl = remember(initialQuery) { MonsaWebAssets.buildEntryUrl(initialQuery) }

    var webViewRef by remember { mutableStateOf<WebView?>(null) }
    var lastLoadedUrl by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var isPageReady by remember { mutableStateOf(false) }
    var loadErrorMessage by remember { mutableStateOf<String?>(null) }
    var canGoBack by remember { mutableStateOf(false) }

    var pendingFileCallback by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }
    var pendingWebPermission by remember { mutableStateOf<PermissionRequest?>(null) }

    // Safety timeout so loading overlay never stays stuck on slow emulator renders
    LaunchedEffect(isLoading) {
        if (isLoading) {
            delay(5_000L)
            isLoading = false
        }
    }

    // Reload WebView if singleTask MainActivity receives a new deep-link query
    LaunchedEffect(entryUrl, webViewRef) {
        val view = webViewRef
        if (view != null && lastLoadedUrl != null && lastLoadedUrl != entryUrl) {
            lastLoadedUrl = entryUrl
            isLoading = true
            view.loadUrl(entryUrl)
        }
    }

    LaunchedEffect(
        a11yState.largeTextEnabled,
        a11yState.highContrastEnabled,
        isPageReady,
        webViewRef,
    ) {
        val view = webViewRef
        if (view != null && isPageReady) {
            view.evaluateJavascript(
                MonsaWebAssets.buildApplyAccessibilityJs(
                    largeText = a11yState.largeTextEnabled,
                    highContrast = a11yState.highContrastEnabled,
                ),
                null,
            )
        }
    }

    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        val callback = pendingFileCallback
        pendingFileCallback = null
        callback?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
    }

    val documentPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument(),
    ) { uri ->
        val callback = pendingFileCallback
        pendingFileCallback = null
        callback?.onReceiveValue(if (uri != null) arrayOf(uri) else null)
    }

    val mediaPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) { grants ->
        val request = pendingWebPermission
        pendingWebPermission = null
        if (request != null) {
            val allowedResources = request.resources.filter { res ->
                when (res) {
                    PermissionRequest.RESOURCE_AUDIO_CAPTURE ->
                        grants[Manifest.permission.RECORD_AUDIO] == true
                    PermissionRequest.RESOURCE_VIDEO_CAPTURE ->
                        grants[Manifest.permission.CAMERA] == true
                    else -> false
                }
            }.toTypedArray()
            if (allowedResources.isNotEmpty()) {
                request.grant(allowedResources)
            } else {
                request.deny()
            }
        }
    }

    BackHandler(enabled = (!embeddedInShell && a11yState.isPanelOpen) || canGoBack) {
        if (!embeddedInShell && a11yState.isPanelOpen) {
            onCloseA11yPanel()
        } else {
            webViewRef?.goBack()
        }
    }

    DisposableEffect(lifecycleOwner, webViewRef) {
        val observer = LifecycleEventObserver { _, event ->
            val view = webViewRef ?: return@LifecycleEventObserver
            when (event) {
                Lifecycle.Event.ON_RESUME -> view.onResume()
                Lifecycle.Event.ON_PAUSE -> view.onPause()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            pendingFileCallback?.onReceiveValue(null)
            pendingFileCallback = null
            pendingWebPermission?.deny()
            pendingWebPermission = null
            webViewRef?.destroy()
            webViewRef = null
        }
    }

    val shellBackground = if (a11yState.highContrastEnabled) {
        MaterialTheme.colorScheme.background
    } else {
        MaterialTheme.colorScheme.primary
    }

    val containerModifier = if (embeddedInShell) {
        modifier
            .fillMaxSize()
            .background(shellBackground)
            .imePadding()
            .testTag("monsa_webview_container")
    } else {
        modifier
            .fillMaxSize()
            .background(shellBackground)
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding()
            .testTag("monsa_webview_container")
    }

    Box(modifier = containerModifier) {
        AndroidView(
            modifier = Modifier
                .fillMaxSize()
                .testTag("monsa_webview"),
            factory = { ctx ->
                if (BuildConfig.DEBUG) {
                    WebView.setWebContentsDebuggingEnabled(true)
                }
                WebView(ctx).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
                    settings.apply {
                        javaScriptEnabled = true
                        domStorageEnabled = true
                        databaseEnabled = true
                        mediaPlaybackRequiresUserGesture = false
                        allowFileAccess = false
                        allowContentAccess = true
                        mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                        setSupportZoom(true)
                        builtInZoomControls = true
                        displayZoomControls = false
                        useWideViewPort = true
                        loadWithOverviewMode = true
                    }

                    if (activity != null) {
                        addJavascriptInterface(
                            MonsaJsBridge(
                                activity = activity,
                                webViewProvider = { webViewRef },
                                onWebAccessibilityChanged = onSyncA11yFromWeb,
                            ),
                            "MonsaAndroid",
                        )
                    }

                    webViewClient = object : WebViewClient() {
                        override fun shouldInterceptRequest(
                            view: WebView,
                            request: WebResourceRequest,
                        ): WebResourceResponse? {
                            if (request.url.host == MonsaWebAssets.APP_HOST) {
                                return assetLoader.shouldInterceptRequest(request.url)
                            }
                            return super.shouldInterceptRequest(view, request)
                        }

                        override fun shouldOverrideUrlLoading(
                            view: WebView,
                            request: WebResourceRequest,
                        ): Boolean {
                            val uri = request.url
                            if (uri.host == MonsaWebAssets.APP_HOST) {
                                return false
                            }
                            runCatching {
                                val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                }
                                ctx.startActivity(intent)
                            }
                            return true
                        }

                        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                            loadErrorMessage = null
                            isPageReady = false
                            canGoBack = view.canGoBack()
                        }

                        override fun onPageCommitVisible(view: WebView, url: String?) {
                            isLoading = false
                            isPageReady = true
                            canGoBack = view.canGoBack()
                        }

                        override fun onPageFinished(view: WebView, url: String?) {
                            isLoading = false
                            isPageReady = true
                            canGoBack = view.canGoBack()
                        }

                        override fun onReceivedError(
                            view: WebView,
                            request: WebResourceRequest,
                            error: WebResourceError,
                        ) {
                            if (request.isForMainFrame) {
                                isLoading = false
                                loadErrorMessage = error.description?.toString()
                                    ?: ctx.getString(R.string.error_load_title)
                            }
                        }
                    }

                    webChromeClient = object : WebChromeClient() {
                        override fun onShowFileChooser(
                            webView: WebView,
                            filePathCallback: ValueCallback<Array<Uri>>,
                            fileChooserParams: FileChooserParams,
                        ): Boolean {
                            pendingFileCallback?.onReceiveValue(null)
                            pendingFileCallback = filePathCallback

                            val acceptTypes = fileChooserParams.acceptTypes
                                ?.filter { it.isNotBlank() }
                                .orEmpty()
                            val wantsImagesOnly = acceptTypes.isNotEmpty() &&
                                acceptTypes.all { it.startsWith("image/") }

                            return runCatching {
                                if (wantsImagesOnly) {
                                    photoPickerLauncher.launch(
                                        PickVisualMediaRequest(
                                            ActivityResultContracts.PickVisualMedia.ImageOnly,
                                        ),
                                    )
                                } else {
                                    val mimeTypes = if (acceptTypes.isNotEmpty()) {
                                        acceptTypes.toTypedArray()
                                    } else {
                                        arrayOf("*/*")
                                    }
                                    documentPickerLauncher.launch(mimeTypes)
                                }
                                true
                            }.getOrElse {
                                pendingFileCallback?.onReceiveValue(null)
                                pendingFileCallback = null
                                false
                            }
                        }

                        override fun onPermissionRequest(request: PermissionRequest) {
                            val neededPermissions = mutableListOf<String>()
                            val alreadyGrantedResources = mutableListOf<String>()

                            for (resource in request.resources) {
                                when (resource) {
                                    PermissionRequest.RESOURCE_AUDIO_CAPTURE -> {
                                        if (ContextCompat.checkSelfPermission(
                                                ctx,
                                                Manifest.permission.RECORD_AUDIO,
                                            ) == PackageManager.PERMISSION_GRANTED
                                        ) {
                                            alreadyGrantedResources.add(resource)
                                        } else {
                                            neededPermissions.add(Manifest.permission.RECORD_AUDIO)
                                        }
                                    }
                                    PermissionRequest.RESOURCE_VIDEO_CAPTURE -> {
                                        if (ContextCompat.checkSelfPermission(
                                                ctx,
                                                Manifest.permission.CAMERA,
                                            ) == PackageManager.PERMISSION_GRANTED
                                        ) {
                                            alreadyGrantedResources.add(resource)
                                        } else {
                                            neededPermissions.add(Manifest.permission.CAMERA)
                                        }
                                    }
                                }
                            }

                            if (neededPermissions.isEmpty()) {
                                if (alreadyGrantedResources.isNotEmpty()) {
                                    request.grant(alreadyGrantedResources.toTypedArray())
                                } else {
                                    request.deny()
                                }
                            } else {
                                pendingWebPermission?.deny()
                                pendingWebPermission = request
                                mediaPermissionLauncher.launch(neededPermissions.toTypedArray())
                            }
                        }
                    }

                    webViewRef = this
                    lastLoadedUrl = entryUrl
                    loadUrl(entryUrl)
                }
            },
        )

        if (!embeddedInShell && !isLoading && loadErrorMessage == null) {
            AccessibilityTriggerButton(
                activeCount = a11yState.activeCount,
                onClick = onOpenA11yPanel,
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(start = 16.dp, bottom = 76.dp),
            )
        }

        if (isLoading && loadErrorMessage == null) {
            Surface(
                modifier = Modifier
                    .fillMaxSize()
                    .testTag("loading_overlay"),
                color = shellBackground,
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    CircularProgressIndicator(
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = stringResource(R.string.app_name),
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onPrimary,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = stringResource(R.string.loading_app),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.85f),
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }

        if (loadErrorMessage != null) {
            Surface(
                modifier = Modifier
                    .fillMaxSize()
                    .testTag("error_overlay"),
                color = MaterialTheme.colorScheme.background,
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = stringResource(R.string.error_load_title),
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onBackground,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = loadErrorMessage.orEmpty(),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(
                        onClick = {
                            loadErrorMessage = null
                            isLoading = true
                            webViewRef?.loadUrl(entryUrl)
                        },
                        modifier = Modifier.testTag("retry_load_button"),
                    ) {
                        Text(text = stringResource(R.string.error_load_retry))
                    }
                }
            }
        }

        if (!embeddedInShell && a11yState.isPanelOpen) {
            AccessibilitySettingsSheet(
                state = a11yState,
                onToggleLargeText = onSetLargeText,
                onToggleHighContrast = onSetHighContrast,
                onEnableAll = onEnableAllA11y,
                onResetDefaults = onResetA11y,
                onDismiss = onCloseA11yPanel,
            )
        }
    }
}
