package id.makassar.monsalapor.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AccessibilityNew
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Contrast
import androidx.compose.material.icons.rounded.FormatSize
import androidx.compose.material.icons.rounded.RestartAlt
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import id.makassar.monsalapor.R

@Composable
fun AccessibilityTriggerButton(
    activeCount: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val contentDesc = stringResource(R.string.a11y_fab_cd)
    val isActive = activeCount > 0
    val containerColor = if (isActive) {
        MaterialTheme.colorScheme.tertiary
    } else {
        MaterialTheme.colorScheme.primary
    }
    val contentColor = if (isActive) {
        MaterialTheme.colorScheme.onTertiary
    } else {
        MaterialTheme.colorScheme.onPrimary
    }

    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(28.dp),
        color = containerColor,
        contentColor = contentColor,
        shadowElevation = 6.dp,
        border = BorderStroke(
            width = if (isActive) 1.5.dp else 1.dp,
            color = MaterialTheme.colorScheme.outline.copy(alpha = 0.65f),
        ),
        modifier = modifier
            .minimumInteractiveComponentSize()
            .semantics { contentDescription = contentDesc }
            .testTag("accessibility_settings_fab"),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                imageVector = Icons.Rounded.AccessibilityNew,
                contentDescription = null,
                modifier = Modifier.size(20.dp),
            )
            Text(
                text = stringResource(R.string.a11y_fab_label),
                style = MaterialTheme.typography.labelLarge,
                fontSize = 12.sp,
            )
            AnimatedVisibility(
                visible = isActive,
                enter = fadeIn(),
                exit = fadeOut(),
            ) {
                Box(
                    modifier = Modifier
                        .size(20.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primary),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = activeCount.toString(),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccessibilitySettingsSheet(
    state: AccessibilityUiState,
    onToggleLargeText: (Boolean) -> Unit,
    onToggleHighContrast: (Boolean) -> Unit,
    onEnableAll: () -> Unit,
    onResetDefaults: () -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        contentColor = MaterialTheme.colorScheme.onSurface,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        modifier = Modifier.testTag("accessibility_settings_panel"),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 560.dp)
                .align(Alignment.CenterHorizontally)
                .verticalScroll(rememberScrollState())
                .navigationBarsPadding()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = MaterialTheme.colorScheme.secondaryContainer,
                        contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                    ) {
                        Box(
                            modifier = Modifier.size(44.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.AccessibilityNew,
                                contentDescription = null,
                                modifier = Modifier.size(24.dp),
                            )
                        }
                    }
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(
                                text = stringResource(R.string.a11y_panel_title),
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                            if (state.activeCount > 0) {
                                Surface(
                                    shape = RoundedCornerShape(999.dp),
                                    color = MaterialTheme.colorScheme.primary,
                                    contentColor = MaterialTheme.colorScheme.onPrimary,
                                ) {
                                    Text(
                                        text = stringResource(
                                            R.string.a11y_active_count_format,
                                            state.activeCount,
                                        ),
                                        style = MaterialTheme.typography.labelSmall,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                    )
                                }
                            }
                        }
                        Text(
                            text = stringResource(R.string.a11y_panel_subtitle),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                IconButton(
                    onClick = onDismiss,
                    modifier = Modifier
                        .minimumInteractiveComponentSize()
                        .testTag("dismiss_accessibility_panel_icon"),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Close,
                        contentDescription = stringResource(R.string.a11y_close),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // Live Preview Card
            Surface(
                shape = RoundedCornerShape(20.dp),
                color = MaterialTheme.colorScheme.surfaceVariant,
                border = BorderStroke(
                    width = if (state.highContrastEnabled) 2.dp else 1.dp,
                    color = MaterialTheme.colorScheme.outline,
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("accessibility_live_preview"),
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        text = stringResource(R.string.a11y_preview_label).uppercase(),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.secondary,
                    )
                    Text(
                        text = stringResource(R.string.a11y_preview_sample_title),
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontSize = if (state.largeTextEnabled) 19.sp else 15.sp,
                            lineHeight = if (state.largeTextEnabled) 26.sp else 21.sp,
                        ),
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = stringResource(R.string.a11y_preview_sample_body),
                        style = MaterialTheme.typography.bodyMedium.copy(
                            fontSize = if (state.largeTextEnabled) 16.sp else 13.sp,
                            lineHeight = if (state.largeTextEnabled) 23.sp else 19.sp,
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.padding(top = 4.dp),
                    ) {
                        ClassStatusChip(
                            className = "monsa-a11y-large",
                            active = state.largeTextEnabled,
                        )
                        ClassStatusChip(
                            className = "monsa-high-contrast",
                            active = state.highContrastEnabled,
                        )
                    }
                }
            }

            // Toggle 1: monsa-a11y-large
            AccessibilityToggleCard(
                icon = Icons.Rounded.FormatSize,
                title = stringResource(R.string.a11y_large_title),
                description = stringResource(R.string.a11y_large_desc),
                cssClassName = "monsa-a11y-large",
                checked = state.largeTextEnabled,
                onCheckedChange = onToggleLargeText,
                testTag = "toggle_a11y_large",
            )

            // Toggle 2: monsa-high-contrast
            AccessibilityToggleCard(
                icon = Icons.Rounded.Contrast,
                title = stringResource(R.string.a11y_contrast_title),
                description = stringResource(R.string.a11y_contrast_desc),
                cssClassName = "monsa-high-contrast",
                checked = state.highContrastEnabled,
                onCheckedChange = onToggleHighContrast,
                testTag = "toggle_high_contrast",
            )

            // Action Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedButton(
                    onClick = if (state.activeCount > 0) onResetDefaults else onEnableAll,
                    shape = RoundedCornerShape(16.dp),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                        .testTag("accessibility_quick_action_button"),
                ) {
                    Icon(
                        imageVector = if (state.activeCount > 0) {
                            Icons.Rounded.RestartAlt
                        } else {
                            Icons.Rounded.CheckCircle
                        },
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = if (state.activeCount > 0) {
                            stringResource(R.string.a11y_reset_default)
                        } else {
                            stringResource(R.string.a11y_enable_all)
                        },
                        style = MaterialTheme.typography.labelLarge,
                    )
                }

                Button(
                    onClick = onDismiss,
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary,
                    ),
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                        .testTag("close_accessibility_panel_button"),
                ) {
                    Text(
                        text = stringResource(R.string.a11y_close),
                        style = MaterialTheme.typography.labelLarge,
                    )
                }
            }
        }
    }
}

@Composable
private fun ClassStatusChip(
    className: String,
    active: Boolean,
) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = if (active) {
            MaterialTheme.colorScheme.primary
        } else {
            MaterialTheme.colorScheme.surface
        },
        contentColor = if (active) {
            MaterialTheme.colorScheme.onPrimary
        } else {
            MaterialTheme.colorScheme.onSurfaceVariant
        },
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Text(
            text = if (active) "✓ .$className" else ".$className",
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
        )
    }
}

@Composable
private fun AccessibilityToggleCard(
    icon: ImageVector,
    title: String,
    description: String,
    cssClassName: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    testTag: String,
) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = if (checked) {
            MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.55f)
        } else {
            MaterialTheme.colorScheme.surface
        },
        border = BorderStroke(
            width = if (checked) 1.5.dp else 1.dp,
            color = if (checked) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.outline
            },
        ),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .clickable(role = Role.Switch) { onCheckedChange(!checked) },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = if (checked) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.surfaceVariant
                },
                contentColor = if (checked) {
                    MaterialTheme.colorScheme.onPrimary
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
            ) {
                Box(
                    modifier = Modifier.size(44.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        modifier = Modifier.size(22.dp),
                    )
                }
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = "$cssClassName · " + if (checked) {
                        stringResource(R.string.a11y_status_active)
                    } else {
                        stringResource(R.string.a11y_status_inactive)
                    },
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                    color = if (checked) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }

            Switch(
                checked = checked,
                onCheckedChange = onCheckedChange,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = MaterialTheme.colorScheme.onPrimary,
                    checkedTrackColor = MaterialTheme.colorScheme.primary,
                ),
                modifier = Modifier
                    .minimumInteractiveComponentSize()
                    .testTag(testTag),
            )
        }
    }
}
