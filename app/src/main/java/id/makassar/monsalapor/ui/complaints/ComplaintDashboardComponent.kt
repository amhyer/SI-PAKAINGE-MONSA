package id.makassar.monsalapor.ui.complaints

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.AccessibilityNew
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.BarChart
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.DonutLarge
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.ShowChart
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import id.makassar.monsalapor.R
import id.makassar.monsalapor.data.ComplaintStatusFilter
import id.makassar.monsalapor.data.UiState
import kotlin.math.roundToInt

private enum class DashboardChartFilter(val labelRes: Int, val testTag: String) {
    ALL(R.string.dash_filter_all, "dash_filter_all"),
    STATUS(R.string.dash_filter_status, "dash_filter_status"),
    CATEGORY(R.string.dash_filter_category, "dash_filter_category"),
    TREND(R.string.dash_filter_trend, "dash_filter_trend"),
}

@Composable
fun ComplaintDashboardComponent(
    analyticsState: UiState<ComplaintDashboardAnalytics>,
    onFilterHistory: (ComplaintStatusFilter) -> Unit,
    onOpenForm: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var selectedChartFilter by rememberSaveable { mutableStateOf(DashboardChartFilter.ALL) }
    var highlightedStatusId by rememberSaveable { mutableStateOf<String?>(null) }
    var highlightedCategoryId by rememberSaveable { mutableStateOf<String?>(null) }

    when (analyticsState) {
        is UiState.Loading -> {
            Box(
                modifier = modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        }
        is UiState.Error -> {
            Box(
                modifier = modifier
                    .fillMaxSize()
                    .padding(20.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = analyticsState.message,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                )
            }
        }
        is UiState.Success -> {
            val analytics = analyticsState.data
            if (analytics.totalCount == 0) {
                DashboardEmptyState(
                    onOpenForm = onOpenForm,
                    modifier = modifier,
                )
                return
            }

            Column(
                modifier = modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(bottom = 24.dp)
                    .testTag("complaint_analytics_dashboard"),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                // Live sync badge
                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.55f),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.4f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(9.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.secondary),
                        )
                        Text(
                            text = stringResource(R.string.dash_realtime_banner),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSecondaryContainer,
                        )
                    }
                }

                // 2x2 Executive KPI Grid
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    DashboardKpiCard(
                        icon = Icons.Rounded.BarChart,
                        label = stringResource(R.string.dash_kpi_total),
                        value = analytics.totalCount.toString(),
                        accentColor = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.weight(1f),
                    )
                    DashboardKpiCard(
                        icon = Icons.Rounded.CheckCircle,
                        label = stringResource(R.string.dash_kpi_completion),
                        value = "${analytics.completionRatePercent}%",
                        accentColor = MaterialTheme.colorScheme.secondary,
                        modifier = Modifier.weight(1f),
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    DashboardKpiCard(
                        icon = Icons.Rounded.AccessibilityNew,
                        label = stringResource(R.string.dash_kpi_rentan),
                        value = analytics.priorityRentanCount.toString(),
                        accentColor = MaterialTheme.colorScheme.tertiary,
                        modifier = Modifier.weight(1f),
                    )
                    DashboardKpiCard(
                        icon = Icons.Rounded.WarningAmber,
                        label = stringResource(R.string.dash_kpi_urgent),
                        value = analytics.urgentChildCount.toString(),
                        accentColor = MaterialTheme.colorScheme.error,
                        modifier = Modifier.weight(1f),
                    )
                }

                // Chart View Switcher
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    DashboardChartFilter.entries.forEach { tab ->
                        FilterChip(
                            selected = selectedChartFilter == tab,
                            onClick = { selectedChartFilter = tab },
                            label = {
                                Text(
                                    text = stringResource(tab.labelRes),
                                    style = MaterialTheme.typography.labelSmall,
                                )
                            },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = MaterialTheme.colorScheme.primary,
                                selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                            ),
                            modifier = Modifier.testTag(tab.testTag),
                        )
                    }
                }

                if (selectedChartFilter == DashboardChartFilter.ALL ||
                    selectedChartFilter == DashboardChartFilter.STATUS
                ) {
                    StatusDonutChartCard(
                        analytics = analytics,
                        highlightedId = highlightedStatusId,
                        onSelectSlice = { id ->
                            highlightedStatusId = if (highlightedStatusId == id) null else id
                        },
                        onFilterHistory = onFilterHistory,
                    )
                }

                if (selectedChartFilter == DashboardChartFilter.ALL ||
                    selectedChartFilter == DashboardChartFilter.CATEGORY
                ) {
                    CategoryBarChartCard(
                        buckets = analytics.categoryBuckets,
                        highlightedId = highlightedCategoryId,
                        onSelectBar = { id ->
                            highlightedCategoryId = if (highlightedCategoryId == id) null else id
                        },
                    )
                }

                if (selectedChartFilter == DashboardChartFilter.ALL ||
                    selectedChartFilter == DashboardChartFilter.TREND
                ) {
                    DailyTrendChartCard(
                        points = analytics.dailyTrend,
                        totalCount = analytics.totalCount,
                    )
                }

                // Urgency & Privacy Summary Card
                UrgencyAndPrivacyCard(analytics = analytics)
            }
        }
    }
}

@Composable
private fun DashboardKpiCard(
    icon: ImageVector,
    label: String,
    value: String,
    accentColor: Color,
    modifier: Modifier = Modifier,
) {
    Surface(
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)),
        shadowElevation = 1.dp,
        modifier = modifier,
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = accentColor.copy(alpha = 0.14f),
            ) {
                Box(
                    modifier = Modifier.size(40.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = accentColor,
                        modifier = Modifier.size(22.dp),
                    )
                }
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = value,
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun StatusDonutChartCard(
    analytics: ComplaintDashboardAnalytics,
    highlightedId: String?,
    onSelectSlice: (String) -> Unit,
    onFilterHistory: (ComplaintStatusFilter) -> Unit,
) {
    val waitingColor = MaterialTheme.colorScheme.tertiary
    val inProgressColor = MaterialTheme.colorScheme.secondary
    val completedColor = Color(0xFF16A34A)
    val trackColor = MaterialTheme.colorScheme.surfaceVariant

    val sliceColors = mapOf(
        "waiting" to waitingColor,
        "in_progress" to inProgressColor,
        "completed" to completedColor,
    )

    val activeBucket = analytics.statusBuckets.firstOrNull { it.id == highlightedId }

    val waitingSweep by animateFloatAsState(
        targetValue = (analytics.statusBuckets.getOrNull(0)?.ratio ?: 0f) * 360f,
        animationSpec = tween(durationMillis = 600),
        label = "waiting_sweep",
    )
    val inProgressSweep by animateFloatAsState(
        targetValue = (analytics.statusBuckets.getOrNull(1)?.ratio ?: 0f) * 360f,
        animationSpec = tween(durationMillis = 600),
        label = "in_progress_sweep",
    )
    val completedSweep by animateFloatAsState(
        targetValue = (analytics.statusBuckets.getOrNull(2)?.ratio ?: 0f) * 360f,
        animationSpec = tween(durationMillis = 600),
        label = "completed_sweep",
    )

    val sweeps = listOf(
        Triple("waiting", waitingSweep, waitingColor),
        Triple("in_progress", inProgressSweep, inProgressColor),
        Triple("completed", completedSweep, completedColor),
    )

    Surface(
        shape = RoundedCornerShape(22.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.55f)),
        modifier = Modifier
            .fillMaxWidth()
            .testTag("status_donut_chart_card"),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    imageVector = Icons.Rounded.DonutLarge,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp),
                )
                Column {
                    Text(
                        text = stringResource(R.string.dash_status_chart_title),
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = stringResource(R.string.dash_status_chart_subtitle),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Box(
                    modifier = Modifier.size(148.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Canvas(modifier = Modifier.fillMaxSize()) {
                        val strokeWidth = size.minDimension * 0.19f
                        val inset = strokeWidth / 2f + 4.dp.toPx()
                        val arcSize = Size(size.width - inset * 2, size.height - inset * 2)
                        val topLeft = Offset(inset, inset)

                        drawArc(
                            color = trackColor,
                            startAngle = 0f,
                            sweepAngle = 360f,
                            useCenter = false,
                            topLeft = topLeft,
                            size = arcSize,
                            style = Stroke(width = strokeWidth),
                        )

                        var startAngle = -90f
                        sweeps.forEach { (id, sweep, color) ->
                            if (sweep > 0.5f) {
                                val isDimmed = highlightedId != null && highlightedId != id
                                val effectiveWidth = if (highlightedId == id) strokeWidth * 1.15f else strokeWidth
                                drawArc(
                                    color = if (isDimmed) color.copy(alpha = 0.28f) else color,
                                    startAngle = startAngle,
                                    sweepAngle = (sweep - 2f).coerceAtLeast(1f),
                                    useCenter = false,
                                    topLeft = topLeft,
                                    size = arcSize,
                                    style = Stroke(width = effectiveWidth, cap = StrokeCap.Butt),
                                )
                                startAngle += sweep
                            }
                        }
                    }

                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = (activeBucket?.count ?: analytics.totalCount).toString(),
                            style = MaterialTheme.typography.titleLarge,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Text(
                            text = if (activeBucket != null) {
                                "${activeBucket.label} (${(activeBucket.ratio * 100).roundToInt()}%)"
                            } else {
                                stringResource(R.string.dash_total_label)
                            },
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                        )
                    }
                }

                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    analytics.statusBuckets.forEach { bucket ->
                        val color = sliceColors[bucket.id] ?: MaterialTheme.colorScheme.primary
                        val isSelected = highlightedId == bucket.id
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = if (isSelected) {
                                color.copy(alpha = 0.14f)
                            } else {
                                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                            },
                            border = BorderStroke(
                                width = if (isSelected) 1.5.dp else 1.dp,
                                color = if (isSelected) color else MaterialTheme.colorScheme.outline.copy(alpha = 0.3f),
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .clickable { onSelectSlice(bucket.id) }
                                .testTag("status_legend_${bucket.id}"),
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(10.dp)
                                            .clip(CircleShape)
                                            .background(color),
                                    )
                                    Text(
                                        text = bucket.label,
                                        style = MaterialTheme.typography.labelLarge,
                                        color = MaterialTheme.colorScheme.onSurface,
                                    )
                                }
                                Text(
                                    text = "${bucket.count} (${(bucket.ratio * 100).roundToInt()}%)",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }

            if (activeBucket?.filter != null) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                ) {
                    TextButton(
                        onClick = { onFilterHistory(activeBucket.filter) },
                        modifier = Modifier.testTag("dash_jump_filtered_history"),
                    ) {
                        Text("Lihat ${activeBucket.label} di Riwayat")
                        Spacer(modifier = Modifier.width(4.dp))
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowForward,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CategoryBarChartCard(
    buckets: List<ChartBucket>,
    highlightedId: String?,
    onSelectBar: (String) -> Unit,
) {
    val palette = listOf(
        MaterialTheme.colorScheme.primary,
        MaterialTheme.colorScheme.secondary,
        MaterialTheme.colorScheme.tertiary,
        Color(0xFF7C3AED),
        Color(0xFF059669),
        MaterialTheme.colorScheme.error,
    )
    val maxCount = (buckets.maxOfOrNull { it.count } ?: 1).coerceAtLeast(1).toFloat()

    Surface(
        shape = RoundedCornerShape(22.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.55f)),
        modifier = Modifier
            .fillMaxWidth()
            .testTag("category_bar_chart_card"),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    imageVector = Icons.Rounded.BarChart,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.secondary,
                    modifier = Modifier.size(20.dp),
                )
                Column {
                    Text(
                        text = stringResource(R.string.dash_category_chart_title),
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = stringResource(R.string.dash_category_chart_subtitle),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            buckets.forEachIndexed { index, bucket ->
                val barColor = palette[index % palette.size]
                val isSelected = highlightedId == bucket.id
                val targetFraction = (bucket.count / maxCount).coerceIn(0.06f, 1f)
                val animatedFraction by animateFloatAsState(
                    targetValue = targetFraction,
                    animationSpec = tween(durationMillis = 550),
                    label = "bar_${bucket.id}",
                )

                Surface(
                    shape = RoundedCornerShape(14.dp),
                    color = if (isSelected) {
                        barColor.copy(alpha = 0.1f)
                    } else {
                        Color.Transparent
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .clickable { onSelectBar(bucket.id) }
                        .padding(vertical = 4.dp, horizontal = 4.dp)
                        .testTag("category_bar_${bucket.id}"),
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = bucket.label,
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onSurface,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f),
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "${bucket.count} (${(bucket.ratio * 100).roundToInt()}%)",
                                style = MaterialTheme.typography.labelSmall,
                                color = barColor,
                            )
                        }

                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(12.dp)
                                .clip(RoundedCornerShape(999.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant),
                        ) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth(animatedFraction)
                                    .height(12.dp)
                                    .clip(RoundedCornerShape(999.dp))
                                    .background(
                                        if (highlightedId != null && !isSelected) {
                                            barColor.copy(alpha = 0.35f)
                                        } else {
                                            barColor
                                        },
                                    ),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DailyTrendChartCard(
    points: List<DailyTrendPoint>,
    totalCount: Int,
) {
    val lineColor = MaterialTheme.colorScheme.secondary
    val dotColor = MaterialTheme.colorScheme.primary
    val gridColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)
    val maxVal = (points.maxOfOrNull { it.count } ?: 1).coerceAtLeast(1)

    Surface(
        shape = RoundedCornerShape(22.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.55f)),
        modifier = Modifier
            .fillMaxWidth()
            .testTag("daily_trend_chart_card"),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.ShowChart,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.secondary,
                        modifier = Modifier.size(20.dp),
                    )
                    Column {
                        Text(
                            text = stringResource(R.string.dash_trend_chart_title),
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Text(
                            text = stringResource(R.string.dash_trend_chart_subtitle),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = MaterialTheme.colorScheme.secondaryContainer,
                ) {
                    Text(
                        text = "$totalCount total",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
            }

            if (points.isNotEmpty()) {
                Canvas(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(140.dp)
                        .padding(horizontal = 6.dp, vertical = 4.dp),
                ) {
                    val leftPad = 8.dp.toPx()
                    val rightPad = 8.dp.toPx()
                    val topPad = 14.dp.toPx()
                    val bottomPad = 12.dp.toPx()

                    val chartW = (size.width - leftPad - rightPad).coerceAtLeast(1f)
                    val chartH = (size.height - topPad - bottomPad).coerceAtLeast(1f)

                    // Horizontal reference gridlines
                    for (step in 0..2) {
                        val y = topPad + chartH * (step / 2f)
                        drawLine(
                            color = gridColor,
                            start = Offset(leftPad, y),
                            end = Offset(size.width - rightPad, y),
                            strokeWidth = 1.dp.toPx(),
                        )
                    }

                    val stepX = if (points.size > 1) chartW / (points.size - 1) else 0f
                    val coords = points.mapIndexed { idx, pt ->
                        val x = leftPad + stepX * idx
                        val normalized = pt.count.toFloat() / maxVal.toFloat()
                        val y = topPad + chartH * (1f - normalized)
                        Offset(x, y)
                    }

                    // Area gradient path
                    val areaPath = Path().apply {
                        moveTo(coords.first().x, topPad + chartH)
                        coords.forEach { pt -> lineTo(pt.x, pt.y) }
                        lineTo(coords.last().x, topPad + chartH)
                        close()
                    }
                    drawPath(
                        path = areaPath,
                        brush = Brush.verticalGradient(
                            colors = listOf(
                                lineColor.copy(alpha = 0.28f),
                                lineColor.copy(alpha = 0.02f),
                            ),
                            startY = topPad,
                            endY = topPad + chartH,
                        ),
                    )

                    // Trend polyline
                    val linePath = Path().apply {
                        coords.forEachIndexed { idx, pt ->
                            if (idx == 0) moveTo(pt.x, pt.y) else lineTo(pt.x, pt.y)
                        }
                    }
                    drawPath(
                        path = linePath,
                        color = lineColor,
                        style = Stroke(
                            width = 3.dp.toPx(),
                            cap = StrokeCap.Round,
                            join = StrokeJoin.Round,
                        ),
                    )

                    // Data points
                    coords.forEachIndexed { idx, pt ->
                        val radius = if (points[idx].count > 0) 5.dp.toPx() else 3.5.dp.toPx()
                        drawCircle(
                            color = Color.White,
                            radius = radius + 2.dp.toPx(),
                            center = pt,
                        )
                        drawCircle(
                            color = if (points[idx].count > 0) dotColor else lineColor.copy(alpha = 0.5f),
                            radius = radius,
                            center = pt,
                        )
                    }
                }

                // X-axis date labels + counts
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    points.forEach { pt ->
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = pt.count.toString(),
                                style = MaterialTheme.typography.labelSmall,
                                color = if (pt.count > 0) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                                },
                            )
                            Text(
                                text = pt.shortLabel,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun UrgencyAndPrivacyCard(
    analytics: ComplaintDashboardAnalytics,
) {
    val normalColor = MaterialTheme.colorScheme.primary
    val importantColor = MaterialTheme.colorScheme.tertiary
    val urgentColor = MaterialTheme.colorScheme.error

    Surface(
        shape = RoundedCornerShape(22.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.55f)),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    imageVector = Icons.Rounded.Shield,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(18.dp),
                )
                Text(
                    text = stringResource(R.string.dash_urgency_privacy_title),
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }

            // Stacked proportional urgency bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(14.dp)
                    .clip(RoundedCornerShape(999.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant),
            ) {
                analytics.urgencyBuckets.forEach { bucket ->
                    if (bucket.count > 0) {
                        val color = when (bucket.label) {
                            "Darurat Anak" -> urgentColor
                            "Penting" -> importantColor
                            else -> normalColor
                        }
                        Box(
                            modifier = Modifier
                                .weight(bucket.count.toFloat())
                                .fillMaxSize()
                                .background(color),
                        )
                    }
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                analytics.urgencyBuckets.forEach { bucket ->
                    val color = when (bucket.label) {
                        "Darurat Anak" -> urgentColor
                        "Penting" -> importantColor
                        else -> normalColor
                    }
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(5.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(9.dp)
                                .clip(CircleShape)
                                .background(color),
                        )
                        Text(
                            text = "${bucket.label}: ${bucket.count}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            Text(
                text = "Pelapor Anonim (UU PDP): ${analytics.anonymousCount} · Prioritas Kelompok Rentan (LAKSA+): ${analytics.priorityRentanCount}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun DashboardEmptyState(
    onOpenForm: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = Icons.Rounded.DonutLarge,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.secondary,
            modifier = Modifier.size(56.dp),
        )
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = stringResource(R.string.dash_empty_title),
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = stringResource(R.string.dash_empty_desc),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(16.dp))
        Button(
            onClick = onOpenForm,
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.testTag("dash_empty_create_button"),
        ) {
            Icon(
                imageVector = Icons.Rounded.Add,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(stringResource(R.string.cloud_add_button))
        }
    }
}
