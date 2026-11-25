package id.makassar.monsalapor.ui.notifications

import android.content.Context
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreException
import id.makassar.monsalapor.R
import id.makassar.monsalapor.data.ComplaintStatusFilter
import id.makassar.monsalapor.data.LiveStatusBanner
import id.makassar.monsalapor.data.MonsaFirestoreRepository
import id.makassar.monsalapor.data.StatusNotification
import id.makassar.monsalapor.data.UiState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class ComplaintStatusNotifierViewModel(
    private val repository: MonsaFirestoreRepository,
    private val currentUserId: String,
) : ViewModel() {

    val notificationsState: StateFlow<UiState<List<StatusNotification>>> =
        repository.observeStatusNotifications(currentUserId)
            .map<List<StatusNotification>, UiState<List<StatusNotification>>> { UiState.Success(it) }
            .catch { error ->
                val firestoreError = generateSequence(error) { it.cause }
                    .filterIsInstance<FirebaseFirestoreException>()
                    .firstOrNull()
                if (firestoreError == null && error is CancellationException) throw error
                val rootError = firestoreError ?: error
                Log.w(TAG, "Gagal memantau notifikasi Firestore", rootError)
                emit(UiState.Error(rootError.message ?: "Gagal memuat notifikasi status."))
            }
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS),
                initialValue = UiState.Loading,
            )

    val unreadCount: StateFlow<Int> = notificationsState
        .map { state ->
            (state as? UiState.Success)?.data?.count { !it.read } ?: 0
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS),
            initialValue = 0,
        )

    private val _activeBanner = MutableStateFlow<LiveStatusBanner?>(null)
    val activeBanner: StateFlow<LiveStatusBanner?> = _activeBanner.asStateFlow()

    private val knownStatuses = mutableMapOf<String, String>()
    private val recordedTransitions = mutableSetOf<String>()
    private var hasInitialSnapshot = false
    private var autoDismissJob: Job? = null

    init {
        startWatchingComplaintStatusChanges()
    }

    private fun startWatchingComplaintStatusChanges() {
        viewModelScope.launch {
            repository.observeComplaints(currentUserId, ComplaintStatusFilter.ALL)
                .catch { error ->
                    val firestoreError = generateSequence(error) { it.cause }
                        .filterIsInstance<FirebaseFirestoreException>()
                        .firstOrNull()
                    if (firestoreError == null && error is CancellationException) throw error
                    Log.w(TAG, "Watcher status pengaduan berhenti sementara", firestoreError ?: error)
                }
                .collect { complaints ->
                    if (!hasInitialSnapshot) {
                        knownStatuses.clear()
                        complaints.forEach { complaint ->
                            if (complaint.id.isNotBlank()) {
                                knownStatuses[complaint.id] = complaint.status
                            }
                        }
                        hasInitialSnapshot = true
                        return@collect
                    }

                    val activeIds = mutableSetOf<String>()
                    for (complaint in complaints) {
                        val id = complaint.id
                        if (id.isBlank()) continue
                        activeIds.add(id)

                        val previousStatus = knownStatuses[id]
                        if (previousStatus != null && previousStatus != complaint.status) {
                            val transitionKey = "$id|$previousStatus->${complaint.status}"
                            if (recordedTransitions.add(transitionKey)) {
                                val title = buildNotificationTitle(complaint.status)
                                val message =
                                    "Tiket ${complaint.ticketCode} (${complaint.category}) berubah dari $previousStatus menjadi ${complaint.status}."
                                showLiveBanner(
                                    LiveStatusBanner(
                                        complaintId = id,
                                        ticketCode = complaint.ticketCode,
                                        category = complaint.category,
                                        previousStatus = previousStatus,
                                        newStatus = complaint.status,
                                        title = title,
                                        message = message,
                                    ),
                                )
                                persistStatusNotification(
                                    complaintId = id,
                                    ticketCode = complaint.ticketCode,
                                    category = complaint.category,
                                    previousStatus = previousStatus,
                                    newStatus = complaint.status,
                                    title = title,
                                    message = message,
                                )
                            }
                        }
                        knownStatuses[id] = complaint.status
                    }
                    knownStatuses.keys.retainAll(activeIds)
                }
        }
    }

    private fun buildNotificationTitle(newStatus: String): String = when (newStatus) {
        MonsaFirestoreRepository.STATUS_COMPLETED -> "Pengaduan Telah Selesai"
        MonsaFirestoreRepository.STATUS_IN_PROGRESS -> "Pengaduan Sedang Ditangani"
        MonsaFirestoreRepository.STATUS_VERIFIED -> "Pengaduan Diverifikasi Petugas"
        else -> "Status Pengaduan Diperbarui"
    }

    private fun showLiveBanner(banner: LiveStatusBanner) {
        _activeBanner.value = banner
        autoDismissJob?.cancel()
        autoDismissJob = viewModelScope.launch {
            delay(BANNER_DURATION_MS)
            if (_activeBanner.value == banner) {
                _activeBanner.value = null
            }
        }
    }

    private fun persistStatusNotification(
        complaintId: String,
        ticketCode: String,
        category: String,
        previousStatus: String,
        newStatus: String,
        title: String,
        message: String,
    ) {
        viewModelScope.launch {
            val result = repository.createStatusNotification(
                userId = currentUserId,
                complaintId = complaintId,
                ticketCode = ticketCode,
                category = category,
                previousStatus = previousStatus,
                newStatus = newStatus,
                title = title,
                message = message,
            )
            if (result.isFailure) {
                Log.w(TAG, "Gagal menyimpan notifikasi status ke Firestore", result.exceptionOrNull())
            }
        }
    }

    fun dismissBanner() {
        autoDismissJob?.cancel()
        _activeBanner.value = null
    }

    fun markAsRead(notificationId: String) {
        viewModelScope.launch {
            repository.markNotificationRead(currentUserId, notificationId)
        }
    }

    fun markAllAsRead() {
        viewModelScope.launch {
            repository.markAllNotificationsRead(currentUserId)
        }
    }

    fun clearAll() {
        viewModelScope.launch {
            repository.clearAllNotifications(currentUserId)
        }
    }

    companion object {
        private const val TAG = "StatusNotifierVM"
        private const val STOP_TIMEOUT_MS = 5_000L
        private const val BANNER_DURATION_MS = 9_000L

        fun factory(context: Context, currentUserId: String): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    val appContext = context.applicationContext
                    val db = FirebaseFirestore.getInstance(
                        appContext.getString(R.string.firestore_database_id),
                    )
                    return ComplaintStatusNotifierViewModel(
                        repository = MonsaFirestoreRepository(db),
                        currentUserId = currentUserId,
                    ) as T
                }
            }
    }
}
