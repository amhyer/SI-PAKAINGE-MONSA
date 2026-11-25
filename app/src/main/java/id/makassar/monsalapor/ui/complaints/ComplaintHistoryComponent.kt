package id.makassar.monsalapor.ui.complaints

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccessibilityNew
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Autorenew
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.CloudDone
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.FilterList
import androidx.compose.material.icons.rounded.HourglassTop
import androidx.compose.material.icons.rounded.LocationOn
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.School
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.SupportAgent
import androidx.compose.material.icons.rounded.TaskAlt
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import id.makassar.monsalapor.R
import id.makassar.monsalapor.data.CloudComplaint
import id.makassar.monsalapor.data.ComplaintStatusCounts
import id.makassar.monsalapor.data.ComplaintStatusFilter
import id.makassar.monsalapor.data.MonsaFirestoreRepository
import id.makassar.monsalapor.data.UiState
import java.text.SimpleDateFormat
import java.util.Locale

@Composable
fun ComplaintHistoryComponent(
    state: UiState<List<CloudComplaint>>,
    selectedFilter: ComplaintStatusFilter,
    statusCounts: ComplaintStatusCounts,
    onSelectFilter: (ComplaintStatusFilter) -> Unit,
    onOpenForm: () -> Unit,
    onMarkInProgress: (String) -> Unit,
    onMarkDone: (String) -> Unit,
    onDelete: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.TopCenter,
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .widthIn(max = 640.dp),
        ) {
            // Compact Status Summary Cards (tappable to filter directly)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                StatusSummaryTile(
                    label = stringResource(R.string.cloud_filter_waiting),
                    count = statusCounts.waiting,
                    icon = Icons.Rounded.HourglassTop,
                    selected = selectedFilter == ComplaintStatusFilter.WAITING,
                    onClick = {
                        onSelectFilter(
                            if (selectedFilter == ComplaintStatusFilter.WAITING) {
                                ComplaintStatusFilter.ALL
                            } else {
                                ComplaintStatusFilter.WAITING
                            },
                        )
                    },
                    modifier = Modifier
                        .weight(1f)
                        .testTag("history_summary_waiting"),
                )
                StatusSummaryTile(
                    label = stringResource(R.string.cloud_filter_in_progress),
                    count = statusCounts.inProgress,
                    icon = Icons.Rounded.Autorenew,
                    selected = selectedFilter == ComplaintStatusFilter.IN_PROGRESS,
                    onClick = {
                        onSelectFilter(
                            if (selectedFilter == ComplaintStatusFilter.IN_PROGRESS) {
                                ComplaintStatusFilter.ALL
                            } else {
                                ComplaintStatusFilter.IN_PROGRESS
                            },
                        )
                    },
                    modifier = Modifier
                        .weight(1f)
                        .testTag("history_summary_in_progress"),
                )
                StatusSummaryTile(
                    label = stringResource(R.string.cloud_filter_completed),
                    count = statusCounts.completed,
                    icon = Icons.Rounded.TaskAlt,
                    selected = selectedFilter == ComplaintStatusFilter.COMPLETED,
                    onClick = {
                        onSelectFilter(
                            if (selectedFilter == ComplaintStatusFilter.COMPLETED) {
                                ComplaintStatusFilter.ALL
                            } else {
                                ComplaintStatusFilter.COMPLETED
                            },
                        )
                    },
                    modifier = Modifier
                        .weight(1f)
                        .testTag("history_summary_completed"),
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Horizontal Status Filter Chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                StatusFilterChip(
                    label = "${stringResource(R.string.cloud_filter_all)} (${statusCounts.total})",
                    icon = Icons.Rounded.FilterList,
                    selected = selectedFilter == ComplaintStatusFilter.ALL,
                    onClick = { onSelectFilter(ComplaintStatusFilter.ALL) },
                    testTag = "history_filter_all",
                )
                StatusFilterChip(
                    label = "${stringResource(R.string.cloud_filter_waiting)} (${statusCounts.waiting})",
                    icon = Icons.Rounded.HourglassTop,
                    selected = selectedFilter == ComplaintStatusFilter.WAITING,
                    onClick = { onSelectFilter(ComplaintStatusFilter.WAITING) },
                    testTag = "history_filter_waiting",
                )
                StatusFilterChip(
                    label = "${stringResource(R.string.cloud_filter_in_progress)} (${statusCounts.inProgress})",
                    icon = Icons.Rounded.Autorenew,
                    selected = selectedFilter == ComplaintStatusFilter.IN_PROGRESS,
                    onClick = { onSelectFilter(ComplaintStatusFilter.IN_PROGRESS) },
                    testTag = "history_filter_in_progress",
                )
                StatusFilterChip(
                    label = "${stringResource(R.string.cloud_filter_completed)} (${statusCounts.completed})",
                    icon = Icons.Rounded.TaskAlt,
                    selected = selectedFilter == ComplaintStatusFilter.COMPLETED,
                    onClick = { onSelectFilter(ComplaintStatusFilter.COMPLETED) },
                    testTag = "history_filter_completed",
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Complaint History List Area
            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                when (state) {
                    is UiState.Loading -> {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator()
                        }
                    }
                    is UiState.Error -> {
                        Surface(
                            shape = RoundedCornerShape(20.dp),
                            color = MaterialTheme.colorScheme.error.copy(alpha = 0.1f),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.4f)),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                text = state.message,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.padding(16.dp),
                            )
                        }
                    }
                    is UiState.Success -> {
                        if (state.data.isEmpty()) {
                            EmptyHistoryState(
                                selectedFilter = selectedFilter,
                                hasAnyComplaints = statusCounts.total > 0,
                                onShowAll = { onSelectFilter(ComplaintStatusFilter.ALL) },
                                onOpenForm = onOpenForm,
                            )
                        } else {
                            LazyColumn(
                                contentPadding = PaddingValues(bottom = 28.dp),
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                                modifier = Modifier
                                    .fillMaxSize()
                                    .testTag("complaint_history_list"),
                            ) {
                                items(state.data, key = { it.id }) { complaint ->
                                    ComplaintHistoryCard(
                                        complaint = complaint,
                                        onMarkInProgress = { onMarkInProgress(complaint.id) },
                                        onMarkDone = { onMarkDone(complaint.id) },
                                        onDelete = { onDelete(complaint.id) },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusSummaryTile(
    label: String,
    count: Int,
    icon: ImageVector,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = if (selected) {
            MaterialTheme.colorScheme.primary
        } else {
            MaterialTheme.colorScheme.surface
        },
        contentColor = if (selected) {
            MaterialTheme.colorScheme.onPrimary
        } else {
            MaterialTheme.colorScheme.onSurface
        },
        border = BorderStroke(
            width = if (selected) 1.5.dp else 1.dp,
            color = if (selected) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
            },
        ),
        tonalElevation = if (selected) 3.dp else 1.dp,
        modifier = modifier
            .heightIn(min = 64.dp)
            .clip(RoundedCornerShape(16.dp))
            .clickable(onClick = onClick),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
            horizontalAlignment = Alignment.Start,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = if (selected) {
                        MaterialTheme.colorScheme.onPrimary
                    } else {
                        MaterialTheme.colorScheme.secondary
                    },
                    modifier = Modifier.size(16.dp),
                )
                Text(
                    text = count.toString(),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.ExtraBold,
                )
            }
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = if (selected) {
                    MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.9f)
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            )
        }
    }
}

@Composable
private fun StatusFilterChip(
    label: String,
    icon: ImageVector,
    selected: Boolean,
    onClick: () -> Unit,
    testTag: String,
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        leadingIcon = {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
            )
        },
        label = { Text(label, style = MaterialTheme.typography.labelMedium) },
        modifier = Modifier
            .heightIn(min = 48.dp)
            .testTag(testTag),
    )
}

@Composable
private fun EmptyHistoryState(
    selectedFilter: ComplaintStatusFilter,
    hasAnyComplaints: Boolean,
    onShowAll: () -> Unit,
    onOpenForm: () -> Unit,
) {
    val filterName = when (selectedFilter) {
        ComplaintStatusFilter.ALL -> stringResource(R.string.cloud_filter_all)
        ComplaintStatusFilter.WAITING -> stringResource(R.string.cloud_filter_waiting)
        ComplaintStatusFilter.IN_PROGRESS -> stringResource(R.string.cloud_filter_in_progress)
        ComplaintStatusFilter.COMPLETED -> stringResource(R.string.cloud_filter_completed)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = if (hasAnyComplaints) Icons.Rounded.FilterList else Icons.Rounded.CloudDone,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.secondary,
            modifier = Modifier.size(56.dp),
        )
        Spacer(modifier = Modifier.height(10.dp))
        Text(
            text = if (hasAnyComplaints && selectedFilter != ComplaintStatusFilter.ALL) {
                stringResource(R.string.cloud_empty_filter_title, filterName)
            } else {
                stringResource(R.string.cloud_empty_title)
            },
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = if (hasAnyComplaints && selectedFilter != ComplaintStatusFilter.ALL) {
                stringResource(R.string.cloud_empty_filter_desc)
            } else {
                stringResource(R.string.cloud_empty_desc)
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(16.dp))
        if (hasAnyComplaints && selectedFilter != ComplaintStatusFilter.ALL) {
            OutlinedButton(
                onClick = onShowAll,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .heightIn(min = 48.dp)
                    .testTag("empty_show_all_filter_button"),
            ) {
                Text(stringResource(R.string.cloud_show_all_filter))
            }
        } else {
            Button(
                onClick = onOpenForm,
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier
                    .heightIn(min = 48.dp)
                    .testTag("empty_open_form_button"),
            ) {
                Icon(Icons.Rounded.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(stringResource(R.string.cloud_add_button))
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ComplaintHistoryCard(
    complaint: CloudComplaint,
    onMarkInProgress: () -> Unit,
    onMarkDone: () -> Unit,
    onDelete: () -> Unit,
) {
    val dateFormat = remember { SimpleDateFormat("dd MMM yyyy · HH:mm", Locale.forLanguageTag("id-ID")) }
    val dateLabel = complaint.createdAt?.toDate()?.let { dateFormat.format(it) } ?: "Baru saja"

    val isWaiting = complaint.status == MonsaFirestoreRepository.STATUS_WAITING
    val isCompleted = complaint.status == MonsaFirestoreRepository.STATUS_COMPLETED
    val statusBadgeText = when {
        isWaiting -> "Menunggu · ${complaint.status}"
        isCompleted -> "Selesai"
        else -> "Diproses · ${complaint.status}"
    }

    val statusContainerColor = when {
        isCompleted -> MaterialTheme.colorScheme.primary
        isWaiting -> MaterialTheme.colorScheme.surfaceVariant
        else -> MaterialTheme.colorScheme.secondaryContainer
    }
    val statusContentColor = when {
        isCompleted -> MaterialTheme.colorScheme.onPrimary
        isWaiting -> MaterialTheme.colorScheme.onSurfaceVariant
        else -> MaterialTheme.colorScheme.onSecondaryContainer
    }

    Surface(
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.6f)),
        shadowElevation = 2.dp,
        modifier = Modifier
            .fillMaxWidth()
            .testTag("cloud_complaint_card_${complaint.id}"),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = MaterialTheme.colorScheme.secondaryContainer,
                    contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                ) {
                    Text(
                        text = complaint.ticketCode,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    )
                }

                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = statusContainerColor,
                    contentColor = statusContentColor,
                ) {
                    Text(
                        text = statusBadgeText,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    )
                }
            }

            Text(
                text = complaint.category,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )

            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.Rounded.LocationOn,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.secondary,
                    modifier = Modifier.size(16.dp),
                )
                Text(
                    text = "${complaint.locationDetail} · ${complaint.urgency}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (!complaint.routedTo.isNullOrBlank()) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.SupportAgent,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = "Unit Tujuan: ${complaint.routedTo}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }

            Text(
                text = complaint.description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )

            if (!complaint.specialNeedNote.isNullOrBlank()) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = "Catatan Pendampingan: ${complaint.specialNeedNote}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                    )
                }
            }

            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (complaint.anonymousReport) {
                    HistoryBadgeTag(icon = Icons.Rounded.Shield, label = "Anonim UU PDP")
                } else if (!complaint.reporterName.isNullOrBlank()) {
                    HistoryBadgeTag(icon = Icons.Rounded.Person, label = complaint.reporterName)
                }
                if (!complaint.studentInfo.isNullOrBlank()) {
                    HistoryBadgeTag(icon = Icons.Rounded.School, label = complaint.studentInfo)
                }
                if (complaint.priorityRentan) {
                    HistoryBadgeTag(
                        icon = Icons.Rounded.AccessibilityNew,
                        label = complaint.vulnerableGroup ?: "Prioritas Rentan",
                    )
                }
                if (!complaint.disabilityType.isNullOrBlank()) {
                    HistoryBadgeTag(icon = Icons.Rounded.AccessibilityNew, label = complaint.disabilityType)
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = dateLabel,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (isWaiting) {
                        OutlinedButton(
                            onClick = onMarkInProgress,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.testTag("mark_in_progress_${complaint.id}"),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.PlayArrow,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(stringResource(R.string.cloud_mark_in_progress))
                        }
                    }
                    if (!isCompleted) {
                        OutlinedButton(
                            onClick = onMarkDone,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.testTag("mark_done_${complaint.id}"),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.CheckCircle,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(stringResource(R.string.cloud_mark_done))
                        }
                    }
                    IconButton(
                        onClick = onDelete,
                        modifier = Modifier
                            .minimumInteractiveComponentSize()
                            .testTag("delete_complaint_${complaint.id}"),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.DeleteOutline,
                            contentDescription = stringResource(R.string.cloud_delete),
                            tint = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun HistoryBadgeTag(
    icon: ImageVector,
    label: String,
) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.secondary,
                modifier = Modifier.size(13.dp),
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
