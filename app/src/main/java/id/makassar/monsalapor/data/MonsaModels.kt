package id.makassar.monsalapor.data

import androidx.annotation.Keep
import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.IgnoreExtraProperties
import com.google.firebase.firestore.ServerTimestamp

sealed interface UiState<out T> {
    data object Loading : UiState<Nothing>
    data class Success<T>(val data: T) : UiState<T>
    data class Error(val message: String) : UiState<Nothing>
}

enum class ComplaintStatusFilter {
    ALL,
    WAITING,
    IN_PROGRESS,
    COMPLETED,
}

data class ComplaintStatusCounts(
    val total: Int = 0,
    val waiting: Int = 0,
    val inProgress: Int = 0,
    val completed: Int = 0,
)

@Keep
@IgnoreExtraProperties
data class UserProfile(
    @DocumentId val id: String = "",
    val userId: String = "",
    val displayName: String = "",
    val email: String? = null,
    val roleLabel: String = "Orang Tua / Wali",
    @ServerTimestamp val createdAt: Timestamp? = null,
    @ServerTimestamp val updatedAt: Timestamp? = null,
)

@Keep
@IgnoreExtraProperties
data class CloudComplaint(
    @DocumentId val id: String = "",
    val userId: String = "",
    val ticketCode: String = "",
    val category: String = "",
    val urgency: String = "Biasa",
    val locationDetail: String = "",
    val studentInfo: String? = null,
    val description: String = "",
    val status: String = "Diterima",
    val anonymousReport: Boolean = false,
    val reporterName: String? = null,
    val priorityRentan: Boolean = false,
    val vulnerableGroup: String? = null,
    val disabilityType: String? = null,
    val specialNeedNote: String? = null,
    val routedTo: String? = null,
    @ServerTimestamp val createdAt: Timestamp? = null,
    @ServerTimestamp val updatedAt: Timestamp? = null,
)

data class ComplaintSubmission(
    val category: String,
    val urgency: String,
    val locationDetail: String,
    val studentInfo: String? = null,
    val description: String,
    val anonymousReport: Boolean = true,
    val reporterName: String? = null,
    val priorityRentan: Boolean = false,
    val vulnerableGroup: String? = null,
    val disabilityType: String? = null,
    val specialNeedNote: String? = null,
)

data class ComplaintReceipt(
    val documentId: String,
    val ticketCode: String,
    val category: String,
    val urgency: String,
    val routedTo: String,
    val anonymousReport: Boolean,
    val priorityRentan: Boolean,
)

@Keep
@IgnoreExtraProperties
data class GeminiChatMessage(
    @DocumentId val id: String = "",
    val userId: String = "",
    val sender: String = "user",
    val text: String = "",
    val modelUsed: String = "gemini-3.8-flash",
    val groundingSource: String? = null,
    @ServerTimestamp val createdAt: Timestamp? = null,
)

@Keep
@IgnoreExtraProperties
data class StatusNotification(
    @DocumentId val id: String = "",
    val userId: String = "",
    val complaintId: String = "",
    val ticketCode: String = "",
    val category: String = "",
    val previousStatus: String = "",
    val newStatus: String = "",
    val title: String = "",
    val message: String = "",
    val read: Boolean = false,
    @ServerTimestamp val createdAt: Timestamp? = null,
    @ServerTimestamp val readAt: Timestamp? = null,
)

data class LiveStatusBanner(
    val complaintId: String,
    val ticketCode: String,
    val category: String,
    val previousStatus: String,
    val newStatus: String,
    val title: String,
    val message: String,
)
