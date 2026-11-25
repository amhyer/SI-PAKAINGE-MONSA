package id.makassar.monsalapor.ui.complaints

import android.content.Context
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreException
import id.makassar.monsalapor.R
import id.makassar.monsalapor.data.CloudComplaint
import id.makassar.monsalapor.data.ComplaintReceipt
import id.makassar.monsalapor.data.ComplaintStatusCounts
import id.makassar.monsalapor.data.ComplaintStatusFilter
import id.makassar.monsalapor.data.ComplaintSubmission
import id.makassar.monsalapor.data.MonsaFirestoreRepository
import id.makassar.monsalapor.data.UiState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@OptIn(ExperimentalCoroutinesApi::class)
class CloudComplaintsViewModel(
    private val repository: MonsaFirestoreRepository,
    private val currentUserId: String,
) : ViewModel() {

    private val _selectedStatusFilter = MutableStateFlow(ComplaintStatusFilter.ALL)
    val selectedStatusFilter: StateFlow<ComplaintStatusFilter> = _selectedStatusFilter.asStateFlow()

    val complaintsState: StateFlow<UiState<List<CloudComplaint>>> =
        _selectedStatusFilter
            .flatMapLatest { filter ->
                repository.observeComplaints(currentUserId, filter)
                    .map<List<CloudComplaint>, UiState<List<CloudComplaint>>> { UiState.Success(it) }
                    .catch { error ->
                        val firestoreError = generateSequence(error) { it.cause }
                            .filterIsInstance<FirebaseFirestoreException>()
                            .firstOrNull()
                        if (firestoreError == null && error is CancellationException) throw error
                        val rootError = firestoreError ?: error
                        Log.w(TAG, "Gagal memantau pengaduan cloud ($filter)", rootError)
                        emit(UiState.Error(rootError.message ?: "Gagal memuat pengaduan cloud."))
                    }
            }
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS),
                initialValue = UiState.Loading,
            )

    val isSchoolAdmin: StateFlow<Boolean> = repository.observeIsSchoolAdmin(currentUserId)
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS),
            initialValue = false,
        )

    private val _dashboardSchoolWide = MutableStateFlow(true)
    val dashboardSchoolWide: StateFlow<Boolean> = _dashboardSchoolWide.asStateFlow()

    private val allComplaintsState: StateFlow<UiState<List<CloudComplaint>>> =
        repository.observeComplaints(currentUserId, ComplaintStatusFilter.ALL)
            .map<List<CloudComplaint>, UiState<List<CloudComplaint>>> { UiState.Success(it) }
            .catch { error ->
                val firestoreError = generateSequence(error) { it.cause }
                    .filterIsInstance<FirebaseFirestoreException>()
                    .firstOrNull()
                if (firestoreError == null && error is CancellationException) throw error
                val rootError = firestoreError ?: error
                Log.w(TAG, "Gagal memantau seluruh pengaduan untuk analitik", rootError)
                emit(UiState.Error(rootError.message ?: "Gagal memuat data analitik pengaduan."))
            }
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS),
                initialValue = UiState.Loading,
            )

    val dashboardAnalytics: StateFlow<UiState<ComplaintDashboardAnalytics>> =
        combine(isSchoolAdmin, _dashboardSchoolWide) { admin, schoolWide -> admin && schoolWide }
            .flatMapLatest { useSchoolWide ->
                if (useSchoolWide) {
                    repository.observeAllSchoolComplaints()
                        .map<List<CloudComplaint>, UiState<ComplaintDashboardAnalytics>> {
                            UiState.Success(computeDashboardAnalytics(it))
                        }
                        .catch { error ->
                            val firestoreError = generateSequence(error) { it.cause }
                                .filterIsInstance<FirebaseFirestoreException>()
                                .firstOrNull()
                            if (firestoreError == null && error is CancellationException) throw error
                            Log.w(TAG, "Fallback ke analitik pribadi karena akses collectionGroup dibatasi", firestoreError ?: error)
                            val fallback = (allComplaintsState.value as? UiState.Success)?.data.orEmpty()
                            emit(UiState.Success(computeDashboardAnalytics(fallback)))
                        }
                } else {
                    allComplaintsState.map { state ->
                        when (state) {
                            is UiState.Loading -> UiState.Loading
                            is UiState.Error -> UiState.Error(state.message)
                            is UiState.Success -> UiState.Success(computeDashboardAnalytics(state.data))
                        }
                    }
                }
            }
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS),
                initialValue = UiState.Loading,
            )

    fun setDashboardSchoolWide(schoolWide: Boolean) {
        _dashboardSchoolWide.value = schoolWide
    }

    val statusCounts: StateFlow<ComplaintStatusCounts> =
        allComplaintsState
            .map { state ->
                val all = (state as? UiState.Success)?.data.orEmpty()
                var waiting = 0
                var inProgress = 0
                var completed = 0
                for (item in all) {
                    when (item.status) {
                        MonsaFirestoreRepository.STATUS_WAITING -> waiting++
                        MonsaFirestoreRepository.STATUS_COMPLETED -> completed++
                        else -> inProgress++
                    }
                }
                ComplaintStatusCounts(
                    total = all.size,
                    waiting = waiting,
                    inProgress = inProgress,
                    completed = completed,
                )
            }
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS),
                initialValue = ComplaintStatusCounts(),
            )

    private val _isSubmitting = MutableStateFlow(false)
    val isSubmitting: StateFlow<Boolean> = _isSubmitting.asStateFlow()

    private val _submitError = MutableStateFlow<String?>(null)
    val submitError: StateFlow<String?> = _submitError.asStateFlow()

    private val _lastReceipt = MutableStateFlow<ComplaintReceipt?>(null)
    val lastReceipt: StateFlow<ComplaintReceipt?> = _lastReceipt.asStateFlow()

    private val _feedbackMessage = MutableStateFlow<String?>(null)
    val feedbackMessage: StateFlow<String?> = _feedbackMessage.asStateFlow()

    fun selectStatusFilter(filter: ComplaintStatusFilter) {
        _selectedStatusFilter.value = filter
    }

    fun submitComplaint(
        submission: ComplaintSubmission,
        onSuccess: (ComplaintReceipt) -> Unit = {},
    ) {
        if (_isSubmitting.value) return
        viewModelScope.launch {
            _isSubmitting.value = true
            _submitError.value = null
            val result = repository.createComplaint(
                userId = currentUserId,
                submission = submission,
            )
            _isSubmitting.value = false
            result.fold(
                onSuccess = { receipt ->
                    _lastReceipt.value = receipt
                    _feedbackMessage.value =
                        "Tiket ${receipt.ticketCode} tersimpan di Cloud Firestore (${receipt.routedTo})."
                    onSuccess(receipt)
                },
                onFailure = { error ->
                    val message = error.localizedMessage ?: "Gagal menyimpan pengaduan ke Cloud Firestore."
                    _submitError.value = message
                    _feedbackMessage.value = message
                },
            )
        }
    }

    fun dismissReceipt() {
        _lastReceipt.value = null
    }

    fun clearSubmitError() {
        _submitError.value = null
    }

    fun markInProgress(complaintId: String) {
        viewModelScope.launch {
            val result = repository.updateComplaintStatus(
                userId = currentUserId,
                complaintId = complaintId,
                newStatus = MonsaFirestoreRepository.STATUS_IN_PROGRESS,
            )
            result.fold(
                onSuccess = {
                    _feedbackMessage.value = "Status pengaduan diperbarui menjadi Diproses (TPPK/Kepsek)."
                },
                onFailure = { e ->
                    _feedbackMessage.value = e.localizedMessage ?: "Gagal memperbarui status."
                },
            )
        }
    }

    fun markDone(complaintId: String) {
        viewModelScope.launch {
            val result = repository.markComplaintDone(currentUserId, complaintId)
            result.fold(
                onSuccess = { _feedbackMessage.value = "Status pengaduan diperbarui menjadi Selesai." },
                onFailure = { e -> _feedbackMessage.value = e.localizedMessage ?: "Gagal memperbarui status." },
            )
        }
    }

    fun deleteComplaint(complaintId: String) {
        viewModelScope.launch {
            val result = repository.deleteComplaint(currentUserId, complaintId)
            result.fold(
                onSuccess = { _feedbackMessage.value = "Pengaduan dihapus dari Cloud Firestore." },
                onFailure = { e -> _feedbackMessage.value = e.localizedMessage ?: "Gagal menghapus pengaduan." },
            )
        }
    }

    fun clearFeedback() {
        _feedbackMessage.value = null
    }

    companion object {
        private const val TAG = "CloudComplaintsVM"
        private const val STOP_TIMEOUT_MS = 5000L

        fun factory(context: Context, currentUserId: String): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    val appContext = context.applicationContext
                    val db = FirebaseFirestore.getInstance(
                        appContext.getString(R.string.firestore_database_id),
                    )
                    return CloudComplaintsViewModel(
                        repository = MonsaFirestoreRepository(db),
                        currentUserId = currentUserId,
                    ) as T
                }
            }
    }
}
