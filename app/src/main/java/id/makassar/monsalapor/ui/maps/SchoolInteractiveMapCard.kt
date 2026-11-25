package id.makassar.monsalapor.ui.maps

import android.annotation.SuppressLint
import android.view.MotionEvent
import android.view.ViewGroup
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.CloseFullscreen
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Layers
import androidx.compose.material.icons.rounded.MyLocation
import androidx.compose.material.icons.rounded.OpenInFull
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material.icons.rounded.School
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.Circle
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapType
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.rememberCameraPositionState
import id.makassar.monsalapor.R
import id.makassar.monsalapor.config.MonsaEnvironment
import id.makassar.monsalapor.ui.theme.LocalMonsaExtendedColors
import kotlinx.coroutines.launch

private enum class SchoolMapLayer(
    val labelRes: Int,
    val sdkType: MapType,
    val embedParam: String,
    val testTag: String,
) {
    NORMAL(R.string.maps_layer_normal, MapType.NORMAL, "m", "map_layer_normal"),
    SATELLITE(R.string.maps_layer_satellite, MapType.SATELLITE, "k", "map_layer_satellite"),
    HYBRID(R.string.maps_layer_hybrid, MapType.HYBRID, "h", "map_layer_hybrid"),
}

private data class SchoolPointOfInterest(
    val id: String,
    val label: String,
    val snippet: String,
    val lat: Double,
    val lng: Double,
)

private val SCHOOL_POIS = listOf(
    SchoolPointOfInterest(
        id = "main_campus",
        label = "Kampus Utama SDN Unggulan Mongisidi 1",
        snippet = "Jl. R.W. Monginsidi No. 13, Maricaya Baru · NPSN 40313912",
        lat = SchoolMapsViewModel.SCHOOL_LAT,
        lng = SchoolMapsViewModel.SCHOOL_LNG,
    ),
    SchoolPointOfInterest(
        id = "accessible_gate",
        label = "Akses Gerbang & Drop-Off Inklusif",
        snippet = "Area antar-jemput & pendampingan prioritas kelompok rentan (LAKSA+)",
        lat = -5.14925,
        lng = 119.42072,
    ),
    SchoolPointOfInterest(
        id = "monginsidi_corridor",
        label = "Koridor Jl. R.W. Monginsidi",
        snippet = "Jalur utama angkutan kota & zona selamat sekolah (ZoSS)",
        lat = -5.14965,
        lng = 119.42125,
    ),
)

@Composable
fun SchoolInteractiveMapCard(
    modifier: Modifier = Modifier,
) {
    val useNativeSdk = remember { MonsaEnvironment.hasConfiguredMapsApiKey }
    var selectedLayer by rememberSaveable { mutableStateOf(SchoolMapLayer.NORMAL) }
    var selectedPoiIndex by rememberSaveable { mutableIntStateOf(0) }
    var isExpanded by rememberSaveable { mutableStateOf(false) }
    var embedZoom by rememberSaveable { mutableIntStateOf(17) }
    var recenterTrigger by remember { mutableIntStateOf(0) }

    val activePoi = SCHOOL_POIS[selectedPoiIndex.coerceIn(SCHOOL_POIS.indices)]
    val mapHeight = if (isExpanded) 430.dp else 290.dp

    Surface(
        shape = RoundedCornerShape(24.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.6f)),
        shadowElevation = 3.dp,
        modifier = modifier
            .fillMaxWidth()
            .animateContentSize()
            .testTag("school_interactive_map_card"),
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            // Top controls: Map layer switcher & expand toggle
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier
                        .weight(1f)
                        .horizontalScroll(rememberScrollState()),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Layers,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.secondary,
                        modifier = Modifier.size(18.dp),
                    )
                    SchoolMapLayer.entries.forEach { layer ->
                        FilterChip(
                            selected = selectedLayer == layer,
                            onClick = { selectedLayer = layer },
                            label = {
                                Text(
                                    text = stringResource(layer.labelRes),
                                    style = MaterialTheme.typography.labelSmall,
                                )
                            },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = MaterialTheme.colorScheme.primary,
                                selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                            ),
                            modifier = Modifier.testTag(layer.testTag),
                        )
                    }
                }

                IconButton(
                    onClick = { isExpanded = !isExpanded },
                    modifier = Modifier
                        .minimumInteractiveComponentSize()
                        .testTag("map_expand_toggle"),
                ) {
                    Icon(
                        imageVector = if (isExpanded) {
                            Icons.Rounded.CloseFullscreen
                        } else {
                            Icons.Rounded.OpenInFull
                        },
                        contentDescription = stringResource(R.string.maps_expand_cd),
                        tint = MaterialTheme.colorScheme.primary,
                    )
                }
            }

            // Interactive Google Map viewport
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(mapHeight)
                    .padding(horizontal = 12.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
            ) {
                if (useNativeSdk) {
                    NativeGoogleMapViewport(
                        activePoi = activePoi,
                        layer = selectedLayer,
                        recenterTrigger = recenterTrigger,
                        onSelectPoi = { idx -> selectedPoiIndex = idx },
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    EmbeddedGoogleMapViewport(
                        activePoi = activePoi,
                        layer = selectedLayer,
                        zoom = embedZoom,
                        recenterTrigger = recenterTrigger,
                        modifier = Modifier.fillMaxSize(),
                    )

                    // Floating zoom & recenter controls for embedded map
                    Column(
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(12.dp),
                    ) {
                        MapControlFab(
                            icon = Icons.Rounded.Add,
                            contentDescription = stringResource(R.string.maps_zoom_in_cd),
                            onClick = { embedZoom = (embedZoom + 1).coerceAtMost(20) },
                            testTag = "map_zoom_in_button",
                        )
                        MapControlFab(
                            icon = Icons.Rounded.Remove,
                            contentDescription = stringResource(R.string.maps_zoom_out_cd),
                            onClick = { embedZoom = (embedZoom - 1).coerceAtLeast(13) },
                            testTag = "map_zoom_out_button",
                        )
                        MapControlFab(
                            icon = Icons.Rounded.MyLocation,
                            contentDescription = stringResource(R.string.maps_recenter_cd),
                            onClick = {
                                selectedPoiIndex = 0
                                embedZoom = 17
                                recenterTrigger += 1
                            },
                            testTag = "map_recenter_button",
                        )
                    }
                }

                // Active pin pill overlay at top-start
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f),
                    shadowElevation = 3.dp,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(10.dp),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.School,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            text = activePoi.label,
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }

            // Quick point-of-interest selector chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                SCHOOL_POIS.forEachIndexed { index, poi ->
                    FilterChip(
                        selected = selectedPoiIndex == index,
                        onClick = {
                            selectedPoiIndex = index
                            recenterTrigger += 1
                        },
                        label = {
                            Text(
                                text = poi.label,
                                style = MaterialTheme.typography.labelSmall,
                            )
                        },
                        modifier = Modifier.testTag("map_poi_${poi.id}"),
                    )
                }
            }

            if (!useNativeSdk) {
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.55f),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(start = 14.dp, end = 14.dp, bottom = 14.dp),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Info,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            text = stringResource(R.string.maps_sdk_key_hint),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSecondaryContainer,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun NativeGoogleMapViewport(
    activePoi: SchoolPointOfInterest,
    layer: SchoolMapLayer,
    recenterTrigger: Int,
    onSelectPoi: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    val schoolLatLng = remember {
        LatLng(SchoolMapsViewModel.SCHOOL_LAT, SchoolMapsViewModel.SCHOOL_LNG)
    }
    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(schoolLatLng, 17f)
    }

    LaunchedEffect(activePoi.id, recenterTrigger) {
        val target = LatLng(activePoi.lat, activePoi.lng)
        cameraPositionState.animate(
            update = CameraUpdateFactory.newLatLngZoom(target, 17.5f),
            durationMs = 550,
        )
    }

    Box(modifier = modifier.testTag("native_google_map")) {
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState,
            properties = MapProperties(
                mapType = layer.sdkType,
                isBuildingEnabled = true,
            ),
            uiSettings = MapUiSettings(
                zoomControlsEnabled = false,
                compassEnabled = true,
                mapToolbarEnabled = true,
                scrollGesturesEnabled = true,
                zoomGesturesEnabled = true,
                tiltGesturesEnabled = true,
                rotationGesturesEnabled = true,
            ),
        ) {
            SCHOOL_POIS.forEachIndexed { index, poi ->
                val markerState = remember(poi.id) {
                    MarkerState(position = LatLng(poi.lat, poi.lng))
                }
                Marker(
                    state = markerState,
                    title = poi.label,
                    snippet = poi.snippet,
                    onClick = {
                        onSelectPoi(index)
                        false
                    },
                )
            }

            // Zona Selamat Sekolah (ZoSS) 45m radius highlight (theme-aware)
            val extendedColors = LocalMonsaExtendedColors.current
            Circle(
                center = schoolLatLng,
                radius = 45.0,
                fillColor = extendedColors.mapZoneFill,
                strokeColor = extendedColors.mapZoneStroke,
                strokeWidth = 3f,
            )
        }

        Column(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(12.dp),
        ) {
            MapControlFab(
                icon = Icons.Rounded.Add,
                contentDescription = stringResource(R.string.maps_zoom_in_cd),
                onClick = {
                    scope.launch {
                        cameraPositionState.animate(CameraUpdateFactory.zoomIn(), 250)
                    }
                },
                testTag = "map_zoom_in_button",
            )
            MapControlFab(
                icon = Icons.Rounded.Remove,
                contentDescription = stringResource(R.string.maps_zoom_out_cd),
                onClick = {
                    scope.launch {
                        cameraPositionState.animate(CameraUpdateFactory.zoomOut(), 250)
                    }
                },
                testTag = "map_zoom_out_button",
            )
            MapControlFab(
                icon = Icons.Rounded.MyLocation,
                contentDescription = stringResource(R.string.maps_recenter_cd),
                onClick = {
                    onSelectPoi(0)
                    scope.launch {
                        cameraPositionState.animate(
                            CameraUpdateFactory.newLatLngZoom(schoolLatLng, 17f),
                            450,
                        )
                    }
                },
                testTag = "map_recenter_button",
            )
        }
    }
}

@SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility")
@Composable
private fun EmbeddedGoogleMapViewport(
    activePoi: SchoolPointOfInterest,
    layer: SchoolMapLayer,
    zoom: Int,
    recenterTrigger: Int,
    modifier: Modifier = Modifier,
) {
    var isLoading by remember { mutableStateOf(true) }
    var hasError by remember { mutableStateOf(false) }
    var webViewRef by remember { mutableStateOf<WebView?>(null) }

    val embedUrl = remember(activePoi.id, layer.embedParam, zoom, recenterTrigger) {
        "https://maps.google.com/maps?q=${activePoi.lat},${activePoi.lng}" +
            "&ll=${activePoi.lat},${activePoi.lng}&z=$zoom&t=${layer.embedParam}&hl=id&output=embed"
    }

    LaunchedEffect(embedUrl, webViewRef) {
        val view = webViewRef ?: return@LaunchedEffect
        hasError = false
        isLoading = true
        view.loadUrl(embedUrl)
    }

    Box(modifier = modifier.testTag("embedded_google_map")) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                WebView(ctx).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.setSupportZoom(true)
                    settings.builtInZoomControls = false

                    // Allow panning the map smoothly inside the parent ScrollView
                    setOnTouchListener { v, event ->
                        when (event.actionMasked) {
                            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE ->
                                v.parent?.requestDisallowInterceptTouchEvent(true)
                            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL ->
                                v.parent?.requestDisallowInterceptTouchEvent(false)
                        }
                        false
                    }

                    webViewClient = object : WebViewClient() {
                        override fun onPageCommitVisible(view: WebView, url: String?) {
                            isLoading = false
                        }

                        override fun onPageFinished(view: WebView, url: String?) {
                            isLoading = false
                        }

                        override fun onReceivedError(
                            view: WebView,
                            request: WebResourceRequest,
                            error: WebResourceError,
                        ) {
                            if (request.isForMainFrame) {
                                isLoading = false
                                hasError = true
                            }
                        }
                    }

                    webViewRef = this
                    loadUrl(embedUrl)
                }
            },
        )

        if (isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.72f)),
                contentAlignment = Alignment.Center,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    Text(
                        text = stringResource(R.string.maps_loading_map),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        if (hasError) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(16.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = stringResource(R.string.maps_offline_fallback),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun MapControlFab(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    testTag: String,
) {
    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f),
        contentColor = MaterialTheme.colorScheme.primary,
        shadowElevation = 4.dp,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)),
        modifier = Modifier
            .size(44.dp)
            .minimumInteractiveComponentSize()
            .testTag(testTag),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}
