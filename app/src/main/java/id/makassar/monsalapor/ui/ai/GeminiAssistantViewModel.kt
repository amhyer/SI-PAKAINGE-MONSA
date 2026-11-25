package id.makassar.monsalapor.ui.ai

import android.annotation.SuppressLint
import android.content.Context
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.google.firebase.Firebase
import com.google.firebase.ai.GenerativeModel
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.Content
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.LiveSession
import com.google.firebase.ai.type.PublicPreviewAPI
import com.google.firebase.ai.type.ResponseModality
import com.google.firebase.ai.type.content
import com.google.firebase.ai.type.liveGenerationConfig
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreException
import id.makassar.monsalapor.R
import id.makassar.monsalapor.data.GeminiChatMessage
import id.makassar.monsalapor.data.MonsaFirestoreRepository
import id.makassar.monsalapor.data.UiState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout

sealed interface VoiceSessionState {
    data object Idle : VoiceSessionState
    data object Connecting : VoiceSessionState
    data object Active : VoiceSessionState
    data class Error(val message: String) : VoiceSessionState
}

@OptIn(PublicPreviewAPI::class)
class GeminiAssistantViewModel(
    private val repository: MonsaFirestoreRepository,
    private val currentUserId: String,
) : ViewModel() {

    private val roleModels = mutableMapOf<ChatbotRole, GenerativeModel>()

    private fun getOrCreateChatModel(role: ChatbotRole): GenerativeModel {
        return roleModels.getOrPut(role) {
            Firebase.ai(backend = GenerativeBackend.googleAI()).generativeModel(
                modelName = role.modelName,
                systemInstruction = content {
                    text(role.systemInstruction)
                },
            )
        }
    }

    private val liveModel by lazy {
        Firebase.ai(backend = GenerativeBackend.googleAI()).liveModel(
            modelName = LIVE_MODEL_NAME,
            generationConfig = liveGenerationConfig {
                responseModality = ResponseModality.AUDIO
            },
            systemInstruction = content {
                text(MONSA_VOICE_INSTRUCTION)
            },
        )
    }

    val historyState: StateFlow<UiState<List<GeminiChatMessage>>> =
        repository.observeChatMessages(currentUserId)
            .map<List<GeminiChatMessage>, UiState<List<GeminiChatMessage>>> { UiState.Success(it) }
            .catch { error ->
                val firestoreError = generateSequence(error) { it.cause }
                    .filterIsInstance<FirebaseFirestoreException>()
                    .firstOrNull()
                if (firestoreError == null && error is CancellationException) throw error
                val rootError = firestoreError ?: error
                Log.w(TAG, "Gagal memantau riwayat chat Gemini", rootError)
                emit(UiState.Error(rootError.message ?: "Gagal memuat riwayat percakapan."))
            }
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS),
                initialValue = UiState.Loading,
            )

    private val _selectedRole = MutableStateFlow(ChatbotRole.LAYANAN_SOP)
    val selectedRole: StateFlow<ChatbotRole> = _selectedRole.asStateFlow()

    private val _isStreaming = MutableStateFlow(false)
    val isStreaming: StateFlow<Boolean> = _isStreaming.asStateFlow()

    private val _streamingReply = MutableStateFlow("")
    val streamingReply: StateFlow<String> = _streamingReply.asStateFlow()

    private val _pendingUserPrompt = MutableStateFlow<String?>(null)
    val pendingUserPrompt: StateFlow<String?> = _pendingUserPrompt.asStateFlow()

    private val _chatError = MutableStateFlow<String?>(null)
    val chatError: StateFlow<String?> = _chatError.asStateFlow()

    private val _lastFailedPrompt = MutableStateFlow<String?>(null)
    val lastFailedPrompt: StateFlow<String?> = _lastFailedPrompt.asStateFlow()

    private val _voiceState = MutableStateFlow<VoiceSessionState>(VoiceSessionState.Idle)
    val voiceState: StateFlow<VoiceSessionState> = _voiceState.asStateFlow()

    private var activeLiveSession: LiveSession? = null

    fun selectRole(role: ChatbotRole) {
        if (!_isStreaming.value) {
            _selectedRole.value = role
        }
    }

    fun sendChatMessage(rawPrompt: String, skipPersistUser: Boolean = false) {
        val prompt = rawPrompt.trim()
        if (prompt.isEmpty() || _isStreaming.value) return

        val activeRole = _selectedRole.value

        viewModelScope.launch {
            _chatError.value = null
            _lastFailedPrompt.value = null
            _isStreaming.value = true
            _streamingReply.value = ""

            val currentMessages = (historyState.value as? UiState.Success)?.data.orEmpty()
            val priorHistory = buildValidGeminiHistory(
                messages = if (skipPersistUser && currentMessages.lastOrNull()?.sender == "user") {
                    currentMessages.dropLast(1)
                } else {
                    currentMessages
                },
            )

            if (!skipPersistUser) {
                _pendingUserPrompt.value = prompt
                val saveUserResult = repository.saveChatMessage(
                    userId = currentUserId,
                    sender = "user",
                    text = prompt,
                    modelUsed = activeRole.modelName,
                )
                _pendingUserPrompt.value = null
                if (saveUserResult.isFailure) {
                    Log.w(TAG, "Gagal menyimpan pesan pengguna ke Firestore", saveUserResult.exceptionOrNull())
                }
            }

            val accumulated = StringBuilder()
            try {
                val model = getOrCreateChatModel(activeRole)
                val chat = model.startChat(history = priorHistory)
                withTimeout(AI_TIMEOUT_MS) {
                    chat.sendMessageStream(prompt).collect { chunk ->
                        val chunkText = chunk.text.orEmpty()
                        if (chunkText.isNotEmpty()) {
                            accumulated.append(chunkText)
                            _streamingReply.value = accumulated.toString()
                        }
                    }
                }
                val finalText = accumulated.toString().trim()
                if (finalText.isNotEmpty()) {
                    repository.saveChatMessage(
                        userId = currentUserId,
                        sender = "model",
                        text = finalText,
                        modelUsed = activeRole.modelName,
                        groundingSource = activeRole.title,
                    )
                } else {
                    _lastFailedPrompt.value = prompt
                    _chatError.value = "Gemini mengembalikan respons kosong. Silakan coba lagi."
                }
            } catch (e: TimeoutCancellationException) {
                Log.e(TAG, "Gemini chat timed out", e)
                _lastFailedPrompt.value = prompt
                _chatError.value = "Permintaan ke Gemini melebihi batas waktu 60 detik. Coba lagi."
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.e(TAG, "Firebase AI chat failed", e)
                _lastFailedPrompt.value = prompt
                _chatError.value = e.localizedMessage ?: "Gagal menghubungi Asisten Gemini."
            } finally {
                _pendingUserPrompt.value = null
                _streamingReply.value = ""
                _isStreaming.value = false
            }
        }
    }

    fun retryLastMessage() {
        val failed = _lastFailedPrompt.value ?: return
        sendChatMessage(rawPrompt = failed, skipPersistUser = true)
    }

    fun clearHistory() {
        viewModelScope.launch {
            _chatError.value = null
            _lastFailedPrompt.value = null
            val result = repository.clearChatHistory(currentUserId)
            if (result.isFailure) {
                _chatError.value = result.exceptionOrNull()?.localizedMessage
                    ?: "Gagal menghapus riwayat percakapan."
            }
        }
    }

    fun dismissChatError() {
        _chatError.value = null
        _lastFailedPrompt.value = null
    }

    private fun buildValidGeminiHistory(messages: List<GeminiChatMessage>): List<Content> {
        val recent = messages.takeLast(MAX_HISTORY_TURNS)
        val merged = mutableListOf<Pair<String, StringBuilder>>()
        for (msg in recent) {
            val cleanText = msg.text.trim()
            if (cleanText.isEmpty()) continue
            val role = if (msg.sender == "model") "model" else "user"
            if (merged.isEmpty() && role != "user") {
                continue
            }
            if (merged.isNotEmpty() && merged.last().first == role) {
                merged.last().second.append("\n\n").append(cleanText)
            } else {
                merged.add(role to StringBuilder(cleanText))
            }
        }
        // History passed to startChat before sendMessageStream(prompt) must end on a model turn
        if (merged.isNotEmpty() && merged.last().first == "user") {
            merged.removeAt(merged.lastIndex)
        }
        return merged.map { (role, textBuilder) ->
            content(role = role) {
                text(textBuilder.toString())
            }
        }
    }

    @SuppressLint("MissingPermission")
    fun startVoiceConversation() {
        if (_voiceState.value is VoiceSessionState.Connecting ||
            _voiceState.value is VoiceSessionState.Active
        ) {
            return
        }
        viewModelScope.launch {
            _voiceState.value = VoiceSessionState.Connecting
            try {
                val session = withContext(Dispatchers.IO) {
                    withTimeout(LIVE_CONNECT_TIMEOUT_MS) {
                        val connected = liveModel.connect()
                        connected.startAudioConversation()
                        connected
                    }
                }
                activeLiveSession = session
                _voiceState.value = VoiceSessionState.Active
            } catch (e: TimeoutCancellationException) {
                Log.e(TAG, "Gemini Live connection timed out", e)
                _voiceState.value = VoiceSessionState.Error(
                    "Koneksi suara real-time habis waktu. Periksa jaringan dan coba lagi.",
                )
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.e(TAG, "Gemini Live session failed", e)
                _voiceState.value = VoiceSessionState.Error(
                    e.localizedMessage ?: "Gagal memulai percakapan suara Gemini Live.",
                )
            }
        }
    }

    fun stopVoiceConversation() {
        val session = activeLiveSession
        activeLiveSession = null
        _voiceState.value = VoiceSessionState.Idle
        if (session != null) {
            viewModelScope.launch(Dispatchers.IO) {
                runCatching { session.stopAudioConversation() }
                runCatching { session.close() }
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        val session = activeLiveSession
        activeLiveSession = null
        if (session != null) {
            runCatching { session.stopAudioConversation() }
        }
    }

    companion object {
        private const val TAG = "GeminiAssistantVM"
        private const val LIVE_MODEL_NAME = "gemini-3.8-live"
        private const val AI_TIMEOUT_MS = 60_000L
        private const val LIVE_CONNECT_TIMEOUT_MS = 30_000L
        private const val STOP_TIMEOUT_MS = 5_000L
        private const val MAX_HISTORY_TURNS = 20

        private const val MONSA_VOICE_INSTRUCTION =
            "Anda adalah Asisten Suara Resmi SI-PAKAINGE MONSA UPTD SPF SDN Unggulan Mongisidi 1 Makassar. " +
                "Berbicaralah dalam bahasa Indonesia yang ramah, jelas, dan ringkas untuk membantu orang tua, lansia, dan siswa menyampaikan pertanyaan atau keluhan layanan sekolah."

        fun factory(context: Context, currentUserId: String): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    val appContext = context.applicationContext
                    val db = FirebaseFirestore.getInstance(
                        appContext.getString(R.string.firestore_database_id),
                    )
                    return GeminiAssistantViewModel(
                        repository = MonsaFirestoreRepository(db),
                        currentUserId = currentUserId,
                    ) as T
                }
            }
    }
}
