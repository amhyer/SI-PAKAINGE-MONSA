package id.makassar.monsalapor.ui.ai

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import id.makassar.monsalapor.R
import id.makassar.monsalapor.data.GeminiChatMessage
import java.text.SimpleDateFormat
import java.util.Locale

@Composable
internal fun ChatbotRoleSelector(
    selectedRole: ChatbotRole,
    enabled: Boolean,
    onSelectRole: (ChatbotRole) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(vertical = 2.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            items(ChatbotRole.entries, key = { it.id }) { role ->
                val isSelected = role == selectedRole
                FilterChip(
                    selected = isSelected,
                    enabled = enabled,
                    onClick = { onSelectRole(role) },
                    leadingIcon = {
                        Icon(
                            imageVector = role.icon,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                        )
                    },
                    label = {
                        Text(
                            text = role.shortLabel,
                            style = MaterialTheme.typography.labelSmall,
                            maxLines = 1,
                        )
                    },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = MaterialTheme.colorScheme.primary,
                        selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                        selectedLeadingIconColor = MaterialTheme.colorScheme.onPrimary,
                    ),
                    modifier = Modifier.testTag("chat_role_${role.id}"),
                )
            }
        }

        Surface(
            shape = RoundedCornerShape(14.dp),
            color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.5f),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.35f)),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Icon(
                    imageVector = selectedRole.icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(20.dp),
                )
                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            text = selectedRole.title,
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        Surface(
                            shape = RoundedCornerShape(999.dp),
                            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                        ) {
                            Text(
                                text = selectedRole.speedBadge,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = selectedRole.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

@Composable
internal fun ChatErrorBanner(
    message: String,
    canRetry: Boolean,
    onRetry: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.error.copy(alpha = 0.12f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.4f)),
        modifier = modifier
            .fillMaxWidth()
            .padding(bottom = 8.dp)
            .testTag("gemini_chat_error_banner"),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.weight(1f),
            )
            if (canRetry) {
                TextButton(
                    onClick = onRetry,
                    modifier = Modifier.testTag("gemini_retry_button"),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Refresh,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(stringResource(R.string.ai_retry))
                }
            }
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.ai_dismiss))
            }
        }
    }
}

@Composable
internal fun ChatBubble(
    message: GeminiChatMessage,
    isStreamingBubble: Boolean = false,
) {
    val isUser = message.sender == "user"
    val clipboard = LocalClipboardManager.current
    var copied by remember(message.id) { mutableStateOf(false) }

    val timeLabel = remember(message.createdAt) {
        message.createdAt?.toDate()?.let { date ->
            SimpleDateFormat("HH:mm", Locale("id", "ID")).format(date)
        }
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
    ) {
        Surface(
            shape = RoundedCornerShape(
                topStart = 20.dp,
                topEnd = 20.dp,
                bottomStart = if (isUser) 20.dp else 4.dp,
                bottomEnd = if (isUser) 4.dp else 20.dp,
            ),
            color = if (isUser) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.surface
            },
            contentColor = if (isUser) {
                MaterialTheme.colorScheme.onPrimary
            } else {
                MaterialTheme.colorScheme.onSurface
            },
            border = if (isUser) {
                null
            } else {
                BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.5f))
            },
            shadowElevation = if (isUser) 2.dp else 1.dp,
            modifier = Modifier.fillMaxWidth(0.88f),
        ) {
            Column(
                modifier = Modifier.padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(5.dp),
                        modifier = Modifier.weight(1f),
                    ) {
                        if (!isUser) {
                            Icon(
                                imageVector = Icons.Rounded.AutoAwesome,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.secondary,
                                modifier = Modifier.size(14.dp),
                            )
                        }
                        val senderTitle = if (isUser) {
                            stringResource(R.string.ai_sender_user)
                        } else {
                            message.groundingSource?.takeIf { it.isNotBlank() }
                                ?: stringResource(R.string.ai_title)
                        }
                        Text(
                            text = senderTitle,
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = if (isUser) {
                                MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.85f)
                            } else {
                                MaterialTheme.colorScheme.secondary
                            },
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        if (!timeLabel.isNullOrBlank()) {
                            Text(
                                text = timeLabel,
                                style = MaterialTheme.typography.labelSmall,
                                color = if (isUser) {
                                    MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.72f)
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                },
                            )
                        }
                        if (!isUser && !isStreamingBubble && message.text.isNotBlank()) {
                            IconButton(
                                onClick = {
                                    clipboard.setText(AnnotatedString(message.text))
                                    copied = true
                                },
                                modifier = Modifier.size(28.dp),
                            ) {
                                Icon(
                                    imageVector = if (copied) Icons.Rounded.Check else Icons.Rounded.ContentCopy,
                                    contentDescription = stringResource(R.string.ai_copy_reply_cd),
                                    tint = if (copied) {
                                        MaterialTheme.colorScheme.primary
                                    } else {
                                        MaterialTheme.colorScheme.onSurfaceVariant
                                    },
                                    modifier = Modifier.size(15.dp),
                                )
                            }
                        }
                    }
                }

                Text(
                    text = message.text,
                    style = MaterialTheme.typography.bodyMedium,
                )

                if (isStreamingBubble) {
                    Text(
                        text = stringResource(R.string.ai_streaming_label),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.secondary,
                    )
                }
            }
        }
    }
}

@Composable
internal fun ClearChatConfirmDialog(
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.ai_clear_dialog_title)) },
        text = { Text(stringResource(R.string.ai_clear_dialog_desc)) },
        confirmButton = {
            TextButton(
                onClick = onConfirm,
                modifier = Modifier.testTag("confirm_clear_chat_button"),
            ) {
                Text(
                    text = stringResource(R.string.ai_clear_dialog_confirm),
                    color = MaterialTheme.colorScheme.error,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.ai_clear_dialog_cancel))
            }
        },
    )
}
