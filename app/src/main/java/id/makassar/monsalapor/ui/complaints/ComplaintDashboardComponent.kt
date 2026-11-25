package id.makassar.monsalapor.ui.complaints

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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccessibilityNew
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AdminPanelSettings
import androidx.compose.material.icons.rounded.BarChart
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.DonutLarge
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import id.makassar.monsalapor.R
import id.makassar.monsalapor.data.ComplaintStatusFilter
import id.makassar.monsalapor.data.UiState

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
    isSchoolAdmin: Boolean = false,
    isSchoolWideScope: Boolean = false,
    onToggleScope: (Boolean) -> Unit = {},
) {
    var selectedChartFilter by rememberSaveable { mutableStateOf(DashboardChartFilter.ALL) }
    var highlightedStatusId by rememberSaveable { mutableStateOf<String?>(null) }
    var highlightedCategoryId by rememberSaveable { mutableStateOf<String?>(null) }

    Column(
        modifier = modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (isSchoolAdmin) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                FilterChip(
                    selected = isSchoolWideScope,
                    onClick = { onToggleScope(true) },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Rounded.AdminPanelSettings,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                        )
                    },
                    label = {
                        Text(
                            text = stringResource(R.string.dash_scope_school),
                            style = MaterialTheme.typography.labelSmall,
                        )
                    },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = MaterialTheme.colorScheme.secondary,
                        selectedLabelColor = MaterialTheme.colorScheme.onSecondary,
                        selectedLeadingIconColor = MaterialTheme.colorScheme.onSecondary,
                    ),
                    modifier = Modifier.testTag("dash_scope_school_chip"),
                )
                FilterChip(
                    selected = !isSchoolWideScope,
                    onClick = { onToggleScope(false) },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Rounded.Person,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                        )
                    },
                    label = {
                        Text(
                            text = stringResource(R.string.dash_scope_mine),
                            style = MaterialTheme.typography.labelSmall,
                        )
                    },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = MaterialTheme.colorScheme.primary,
                        selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                        selectedLeadingIconColor = MaterialTheme.colorScheme.onPrimary,
                    ),
                    modifier = Modifier.testTag("dash_scope_mine_chip"),
                )
            }
        }

        when (analyticsState) {
            is UiState.Loading -> {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth(),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator()
                }
            }
            is UiState.Error -> {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
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
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth(),
                    )
                } else {
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth()
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
                                    text = stringResource(
                                        if (isSchoolAdmin && isSchoolWideScope) {
                                            R.string.dash_admin_banner
                                        } else {
                                            R.string.dash_realtime_banner
                                        },
                                    ),
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

                        UrgencyAndPrivacyCard(analytics = analytics)
                    }
                }
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
