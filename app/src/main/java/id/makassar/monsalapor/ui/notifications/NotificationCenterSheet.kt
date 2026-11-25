package id.makassar.monsalapor.ui.notifications

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.net.toUri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.DoneAll
import androidx.compose.material.icons.rounded.Email
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.NotificationsActive
import androidx.compose.material.icons.rounded.NotificationsNone
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import id.makassar.monsalapor.R
import id.makassar.monsalapor.config.MonsaEnvironment
import id.makassar.monsalapor.data.LiveStatusBanner
import id.makassar.monsalapor.data.StatusNotification
import id.makassar.monsalapor.data.UiState
import java.text.SimpleDateFormat
import java.util.Locale

fun openStatusUpdateEmail(
    context: Context,
    recipientEmail: String?,
    ticketCode: String,
    category: String,
    previousStatus: String,
    newStatus: String,
    message: String,
) {
    val targetEmail = recipientEmail?.trim().takeIf { !it.isNullOrBlank() }
        ?: MonsaEnvironment.schoolEmailFrom
    val subject = "[SI-PAKAINGE MONSA] Status Tiket $ticketCode: $newStatus"
    val body = buildString {
        appendLine("Pemberitahuan Perubahan Status Pengaduan")
        appendLine("UPTD SPF SDN Unggulan Mongisidi 1 Makassar")
        appendLine()
        appendLine("Kode Tiket       : $ticketCode")
        appendLine("Kategori         : $category")
        appendLine("Status Sebelumnya: $previousStatus")
        appendLine("Status Terbaru   : $newStatus")
        appendLine()
        appendLine("Rincian:")
        appendLine(message)
        appendLine()
        appendLine("Portal Resmi     : ${MonsaEnvironment.webUrl}")
        appendLine("Email Sekolah    : ${MonsaEnvironment.schoolEmailFrom}")
        appendLine("Dikirim melalui aplikasi SI-PAKAINGE MONSA.")
    }
    val mailtoUri = (
        "mailto:${Uri.encode(targetEmail)}" +
            "?subject=${Uri.encode(subject)}" +
            "&body=${Uri.encode(body)}"
        ).toUri()
    runCatching {
        val intent = Intent(Intent.ACTION_SENDTO, mailtoUri).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }
}

@Composable
fun StatusChangeBanner(
    banner: LiveStatusBanner,
    userEmail: String?,
    onViewHistory: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current

    Surface(
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.secondaryContainer,
        contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
        border = BorderStroke(1.5.dp, MaterialTheme.colorScheme.secondary),
        shadowElevation = 8.dp,
        modifier = modifier
            .fillMaxWidth()
            .widthIn(max = 560.dp)
            .padding(horizontal = 12.dp, vertical = 8.dp)
            .testTag("live_status_notification_banner"),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.weight(1f),
                ) {
                    Surface(
                        shape = CircleShape,
                        color = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.size(36.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Rounded.NotificationsActive,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp),
                            )
                        }
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            text = banner.title,
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            text = "${banner.ticketCode} · ${banner.previousStatus} → ${banner.newStatus}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                }
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier
                        .minimumInteractiveComponentSize()
                        .testTag("dismiss_live_banner_button"),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Close,
                        contentDescription = stringResource(R.string.a11y_close),
                    )
                }
            }

            Text(
                text = banner.message,
                style = MaterialTheme.typography.bodySmall,
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(
                    onClick = {
                        onDismiss()
                        onViewHistory()
                    },
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 44.dp)
                        .testTag("banner_view_history_button"),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.History,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(stringResource(R.string.notif_view_history), style = MaterialTheme.typography.labelMedium)
                }

                OutlinedButton(
                    onClick = {
                        openStatusUpdateEmail(
                            context = context,
                            recipientEmail = userEmail,
                            ticketCode = banner.ticketCode,
                            category = banner.category,
                            previousStatus = banner.previousStatus,
                            newStatus = banner.newStatus,
                            message = banner.message,
                        )
                    },
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 44.dp)
                        .testTag("banner_send_email_button"),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Email,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(stringResource(R.string.notif_send_email), style = MaterialTheme.typography.labelMedium)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationCenterSheet(
    notificationsState: UiState<List<StatusNotification>>,
    unreadCount: Int,
    userEmail: String?,
    onMarkRead: (String) -> Unit,
    onMarkAllRead: () -> Unit,
    onClearAll: () -> Unit,
    onOpenHistory: () -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        modifier = Modifier.testTag("notification_center_sheet"),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 600.dp)
                .align(Alignment.CenterHorizontally)
                .navigationBarsPadding()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(R.string.notif_sheet_title),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(
                        text = stringResource(R.string.notif_sheet_subtitle),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier.minimumInteractiveComponentSize(),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Close,
                        contentDescription = stringResource(R.string.a11y_close),
                    )
                }
            }

            val itemsList = (notificationsState as? UiState.Success)?.data.orEmpty()
            if (itemsList.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (unreadCount > 0) {
                        TextButton(
                            onClick = onMarkAllRead,
                            modifier = Modifier.testTag("notif_mark_all_read_button"),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.DoneAll,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(stringResource(R.string.notif_mark_all_read))
                        }
                    }
                    TextButton(
                        onClick = onClearAll,
                        modifier = Modifier.testTag("notif_clear_all_button"),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.DeleteSweep,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(stringResource(R.string.notif_clear_all))
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            when (notificationsState) {
                is UiState.Loading -> {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(160.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator()
                    }
                }
                is UiState.Error -> {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = MaterialTheme.colorScheme.error.copy(alpha = 0.12f),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            text = notificationsState.message,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(14.dp),
                        )
                    }
                }
                is UiState.Success -> {
                    if (notificationsState.data.isEmpty()) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 32.dp, horizontal = 12.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.NotificationsNone,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.secondary,
                                modifier = Modifier.size(48.dp),
                            )
                            Text(
                                text = stringResource(R.string.notif_empty_title),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                textAlign = TextAlign.Center,
                            )
                            Text(
                                text = stringResource(R.string.notif_empty_desc),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.Center,
                            )
                        }
                    } else {
                        LazyColumn(
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(max = 420.dp)
                                .testTag("notifications_list"),
                            contentPadding = PaddingValues(vertical = 4.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            items(notificationsState.data, key = { it.id }) { notification ->
                                NotificationItemCard(
                                    notification = notification,
                                    onTapRead = {
                                        if (!notification.read) {
                                            onMarkRead(notification.id)
                                        }
                                    },
                                    onOpenHistory = {
                                        if (!notification.read) {
                                            onMarkRead(notification.id)
                                        }
                                        onDismiss()
                                        onOpenHistory()
                                    },
                                    onSendEmail = {
                                        if (!notification.read) {
                                            onMarkRead(notification.id)
                                        }
                                        openStatusUpdateEmail(
                                            context = context,
                                            recipientEmail = userEmail,
                                            ticketCode = notification.ticketCode,
                                            category = notification.category,
                                            previousStatus = notification.previousStatus,
                                            newStatus = notification.newStatus,
                                            message = notification.message,
                                        )
                                    },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationItemCard(
    notification: StatusNotification,
    onTapRead: () -> Unit,
    onOpenHistory: () -> Unit,
    onSendEmail: () -> Unit,
) {
    val dateFormat = remember { SimpleDateFormat("dd MMM yyyy · HH:mm", Locale.forLanguageTag("id-ID")) }
    val timeLabel = notification.createdAt?.toDate()?.let { dateFormat.format(it) } ?: "Baru saja"

    Surface(
        shape = RoundedCornerShape(18.dp),
        color = if (notification.read) {
            MaterialTheme.colorScheme.surface
        } else {
            MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.55f)
        },
        border = BorderStroke(
            width = if (notification.read) 1.dp else 1.5.dp,
            color = if (notification.read) {
                MaterialTheme.colorScheme.outline.copy(alpha = 0.45f)
            } else {
                MaterialTheme.colorScheme.secondary
            },
        ),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .clickable(onClick = onTapRead)
            .testTag("notification_card_${notification.id}"),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (!notification.read) {
                        Box(
                            modifier = Modifier
                                .size(9.dp)
                                .background(MaterialTheme.colorScheme.primary, CircleShape),
                        )
                    }
                    Text(
                        text = notification.title,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = if (notification.read) FontWeight.SemiBold else FontWeight.Bold,
                    )
                }
                if (!notification.read) {
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary,
                    ) {
                        Text(
                            text = stringResource(R.string.notif_unread_badge),
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                        )
                    }
                }
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                ) {
                    Text(
                        text = notification.ticketCode,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                }
                Text(
                    text = notification.previousStatus,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Icon(
                    imageVector = Icons.AutoMirrored.Rounded.ArrowForward,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    text = notification.newStatus,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                )
            }

            Text(
                text = notification.message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurface,
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = timeLabel,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    TextButton(
                        onClick = onSendEmail,
                        modifier = Modifier.testTag("notif_email_${notification.id}"),
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Email,
                            contentDescription = null,
                            modifier = Modifier.size(15.dp),
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(stringResource(R.string.notif_send_email), style = MaterialTheme.typography.labelSmall)
                    }
                    TextButton(
                        onClick = onOpenHistory,
                        modifier = Modifier.testTag("notif_history_${notification.id}"),
                    ) {
                        Text(stringResource(R.string.notif_view_history), style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
}
