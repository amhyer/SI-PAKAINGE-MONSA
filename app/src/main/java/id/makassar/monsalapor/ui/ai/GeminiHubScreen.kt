package id.makassar.monsalapor.ui.ai

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.DeleteSweep
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.makassar.monsalapor.R
import id.makassar.monsalapor.data.GeminiChatMessage
import id.makassar.monsalapor.data.UiState

@Composable
fun GeminiHubScreen(
    viewModel: GeminiAssistantViewModel,
    modifier: Modifier = Modifier,
) {
    var selectedMode by rememberSaveable { mutableIntStateOf(0) } // 0 = Chat, 1 = Suara Live
    var showClearDialog by rememberSaveable { mutableStateOf(false) }

    val historyState by viewModel.historyState.collectAsStateWithLifecycle()
    val hasMessages = (historyState as? UiState.Success)?.data?.isNotEmpty() == true

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = 16.dp),
    ) {
        Spacer(modifier = Modifier.height(12.dp))
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
                    imageVector = Icons.Rounded.AutoAwesome,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.secondary,
                )
                Text(
                    text = stringResource(R.string.ai_title),
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onBackground,
                )
            }
            if (selectedMode == 0 && hasMessages) {
                IconButton(
                    onClick = { showClearDialog = true },
                    modifier = Modifier
                        .minimumInteractiveComponentSize()
                        .testTag("clear_chat_history_button"),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.DeleteSweep,
                        contentDescription = stringResource(R.string.ai_clear_chat_cd),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        SingleChoiceSegmentedButtonRow(
            modifier = Modifier.fillMaxWidth(),
        ) {
            SegmentedButton(
                selected = selectedMode == 0,
                onClick = { selectedMode = 0 },
                shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2),
                modifier = Modifier.testTag("ai_mode_chat_tab"),
            ) {
                Text(stringResource(R.string.ai_mode_chat))
            }
            SegmentedButton(
                selected = selectedMode == 1,
                onClick = { selectedMode = 1 },
                shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2),
                modifier = Modifier.testTag("ai_mode_voice_tab"),
            ) {
                Text(stringResource(R.string.ai_mode_voice))
            }
        }

        Spacer(modifier = Modifier.height(10.dp))

        if (selectedMode == 0) {
            GeminiChatPanel(
                viewModel = viewModel,
                modifier = Modifier.weight(1f),
            )
        } else {
            GeminiVoiceLivePanel(
                viewModel = viewModel,
                modifier = Modifier.weight(1f),
            )
        }
    }

    if (showClearDialog) {
        ClearChatConfirmDialog(
            onConfirm = {
                showClearDialog = false
                viewModel.clearHistory()
            },
            onDismiss = { showClearDialog = false },
        )
    }
}

@Composable
private fun GeminiChatPanel(
    viewModel: GeminiAssistantViewModel,
    modifier: Modifier = Modifier,
) {
    val historyState by viewModel.historyState.collectAsStateWithLifecycle()
    val selectedRole by viewModel.selectedRole.collectAsStateWithLifecycle()
    val isStreaming by viewModel.isStreaming.collectAsStateWithLifecycle()
    val streamingReply by viewModel.streamingReply.collectAsStateWithLifecycle()
    val pendingUserPrompt by viewModel.pendingUserPrompt.collectAsStateWithLifecycle()
    val chatError by viewModel.chatError.collectAsStateWithLifecycle()
    val lastFailedPrompt by viewModel.lastFailedPrompt.collectAsStateWithLifecycle()

    var inputText by rememberSaveable { mutableStateOf("") }
    val listState = rememberLazyListState()

    val messages = (historyState as? UiState.Success)?.data.orEmpty()
    val showPendingUser = !pendingUserPrompt.isNullOrBlank() &&
        messages.lastOrNull()?.let { it.sender == "user" && it.text == pendingUserPrompt } != true

    val totalItems = messages.size +
        (if (showPendingUser) 1 else 0) +
        (if (streamingReply.isNotEmpty() || isStreaming) 1 else 0)

    LaunchedEffect(totalItems, streamingReply.length) {
        if (totalItems > 0) {
            listState.animateScrollToItem(totalItems - 1)
        }
    }

    fun submitCurrentInput() {
        val toSend = inputText.trim()
        if (toSend.isNotEmpty() && !isStreaming) {
            inputText = ""
            viewModel.sendChatMessage(toSend)
        }
    }

    Column(modifier = modifier.fillMaxSize()) {
        ChatbotRoleSelector(
            selectedRole = selectedRole,
            enabled = !isStreaming,
            onSelectRole = viewModel::selectRole,
        )

        Spacer(modifier = Modifier.height(8.dp))

        if (chatError != null) {
            ChatErrorBanner(
                message = chatError.orEmpty(),
                canRetry = lastFailedPrompt != null && !isStreaming,
                onRetry = viewModel::retryLastMessage,
                onDismiss = viewModel::dismissChatError,
            )
        }

        Box(modifier = Modifier.weight(1f)) {
            when (val current = historyState) {
                is UiState.Loading -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                is UiState.Error -> {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(20.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = current.message,
                            color = MaterialTheme.colorScheme.error,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
                is UiState.Success -> {
                    if (current.data.isEmpty() && !showPendingUser && streamingReply.isEmpty() && !isStreaming) {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(horizontal = 16.dp),
                            verticalArrangement = Arrangement.Center,
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Icon(
                                imageVector = selectedRole.icon,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.secondary,
                                modifier = Modifier.size(48.dp),
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                            Text(
                                text = stringResource(R.string.ai_empty_title),
                                style = MaterialTheme.typography.titleMedium,
                                textAlign = TextAlign.Center,
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = stringResource(R.string.ai_empty_desc),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = TextAlign.Center,
                            )
                        }
                    } else {
                        LazyColumn(
                            state = listState,
                            contentPadding = PaddingValues(vertical = 8.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier
                                .fillMaxSize()
                                .testTag("gemini_chat_thread"),
                        ) {
                            items(current.data, key = { it.id }) { msg ->
                                ChatBubble(message = msg)
                            }
                            if (showPendingUser) {
                                item(key = "pending_user_bubble") {
                                    ChatBubble(
                                        message = GeminiChatMessage(
                                            id = "pending_user",
                                            sender = "user",
                                            text = pendingUserPrompt.orEmpty(),
                                            modelUsed = selectedRole.modelName,
                                        ),
                                    )
                                }
                            }
                            if (streamingReply.isNotEmpty() || isStreaming) {
                                item(key = "streaming_bubble") {
                                    ChatBubble(
                                        message = GeminiChatMessage(
                                            id = "streaming",
                                            sender = "model",
                                            text = streamingReply.ifEmpty { "Sedang menyusun jawaban…" },
                                            modelUsed = selectedRole.modelName,
                                            groundingSource = selectedRole.title,
                                        ),
                                        isStreamingBubble = true,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            selectedRole.quickPrompts.forEachIndexed { idx, prompt ->
                AssistChip(
                    onClick = { viewModel.sendChatMessage(prompt) },
                    enabled = !isStreaming,
                    label = { Text(prompt, style = MaterialTheme.typography.labelSmall) },
                    modifier = Modifier.testTag("quick_prompt_$idx"),
                )
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OutlinedTextField(
                value = inputText,
                onValueChange = { inputText = it },
                placeholder = { Text(stringResource(R.string.ai_input_placeholder)) },
                maxLines = 4,
                shape = RoundedCornerShape(20.dp),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { submitCurrentInput() }),
                modifier = Modifier
                    .weight(1f)
                    .testTag("gemini_chat_input"),
            )
            Surface(
                onClick = ::submitCurrentInput,
                enabled = inputText.isNotBlank() && !isStreaming,
                shape = CircleShape,
                color = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier
                    .size(50.dp)
                    .testTag("gemini_send_button"),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    if (isStreaming) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = MaterialTheme.colorScheme.onPrimary,
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.Send,
                            contentDescription = stringResource(R.string.ai_send_cd),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun GeminiVoiceLivePanel(
    viewModel: GeminiAssistantViewModel,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val voiceState by viewModel.voiceState.collectAsStateWithLifecycle()
    var permissionDeniedMsg by remember { mutableStateOf<String?>(null) }

    val micDeniedLabel = stringResource(R.string.voice_mic_denied)

    val audioPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            permissionDeniedMsg = null
            viewModel.startVoiceConversation()
        } else {
            permissionDeniedMsg = micDeniedLabel
        }
    }

    val isActive = voiceState is VoiceSessionState.Active
    val isConnecting = voiceState is VoiceSessionState.Connecting

    val infiniteTransition = rememberInfiniteTransition(label = "voice_pulse")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = if (isActive) 1.18f else 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 800),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "orb_scale",
    )

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = stringResource(R.string.voice_title),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = stringResource(R.string.voice_subtitle),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )

        Spacer(modifier = Modifier.height(32.dp))

        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.size(160.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(144.dp)
                    .scale(pulseScale)
                    .background(
                        color = if (isActive) {
                            MaterialTheme.colorScheme.secondary.copy(alpha = 0.22f)
                        } else {
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)
                        },
                        shape = CircleShape,
                    ),
            )
            Surface(
                shape = CircleShape,
                color = if (isActive) {
                    MaterialTheme.colorScheme.secondary
                } else {
                    MaterialTheme.colorScheme.primary
                },
                contentColor = MaterialTheme.colorScheme.onPrimary,
                shadowElevation = 8.dp,
                modifier = Modifier.size(104.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    if (isConnecting) {
                        CircularProgressIndicator(
                            color = MaterialTheme.colorScheme.onPrimary,
                            strokeWidth = 3.dp,
                        )
                    } else {
                        Icon(
                            imageVector = if (isActive) Icons.Rounded.GraphicEq else Icons.Rounded.Mic,
                            contentDescription = null,
                            modifier = Modifier.size(44.dp),
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        val statusText = when (val s = voiceState) {
            is VoiceSessionState.Idle -> stringResource(R.string.voice_status_idle)
            is VoiceSessionState.Connecting -> stringResource(R.string.voice_status_connecting)
            is VoiceSessionState.Active -> stringResource(R.string.voice_status_active)
            is VoiceSessionState.Error -> s.message
        }

        Text(
            text = permissionDeniedMsg ?: statusText,
            style = MaterialTheme.typography.bodyMedium,
            color = if (voiceState is VoiceSessionState.Error || permissionDeniedMsg != null) {
                MaterialTheme.colorScheme.error
            } else {
                MaterialTheme.colorScheme.onBackground
            },
            textAlign = TextAlign.Center,
        )

        Spacer(modifier = Modifier.height(24.dp))

        Button(
            onClick = {
                if (isActive || isConnecting) {
                    viewModel.stopVoiceConversation()
                } else {
                    val granted = ContextCompat.checkSelfPermission(
                        context,
                        Manifest.permission.RECORD_AUDIO,
                    ) == PackageManager.PERMISSION_GRANTED
                    if (granted) {
                        permissionDeniedMsg = null
                        viewModel.startVoiceConversation()
                    } else {
                        audioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                    }
                }
            },
            shape = RoundedCornerShape(20.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (isActive) {
                    MaterialTheme.colorScheme.error
                } else {
                    MaterialTheme.colorScheme.primary
                },
            ),
            modifier = Modifier
                .fillMaxWidth(0.75f)
                .height(52.dp)
                .testTag("voice_live_toggle_button"),
        ) {
            Icon(
                imageVector = if (isActive || isConnecting) Icons.Rounded.Stop else Icons.Rounded.Mic,
                contentDescription = null,
                modifier = Modifier.size(20.dp),
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = if (isActive || isConnecting) {
                    stringResource(R.string.voice_stop)
                } else {
                    stringResource(R.string.voice_start)
                },
                style = MaterialTheme.typography.labelLarge,
            )
        }
    }
}
