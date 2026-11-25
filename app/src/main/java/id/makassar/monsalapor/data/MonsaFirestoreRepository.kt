package id.makassar.monsalapor.data

import android.content.Context
import com.google.firebase.Firebase
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.auth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.snapshots
import id.makassar.monsalapor.R
import id.makassar.monsalapor.firebase.OperationType
import id.makassar.monsalapor.firebase.handleFirestoreError
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import java.util.Locale

class MonsaFirestoreRepository(
    private val db: FirebaseFirestore,
    private val auth: FirebaseAuth = Firebase.auth,
) {
    constructor(context: Context) : this(
        FirebaseFirestore.getInstance(
            context.applicationContext.getString(R.string.firestore_database_id),
        ),
    )

    private fun requireSignedInUid(expectedUserId: String): String {
        val uid = auth.currentUser?.uid
            ?: throw IllegalStateException("Pengguna harus masuk dengan Google terlebih dahulu.")
        check(uid == expectedUserId) { "Sesi pengguna berubah; menolak penulisan lintas akun." }
        return uid
    }

    suspend fun ensureUserProfile(user: FirebaseUser): Result<Unit> {
        val uid = user.uid
        val path = "users/$uid"
        return try {
            requireSignedInUid(uid)
            val docRef = db.collection("users").document(uid)
            val snapshot = docRef.get().await()
            val safeName = (user.displayName?.trim().takeIf { !it.isNullOrBlank() } ?: "Pengguna MONSA")
                .take(100)
            val safeEmail = user.email?.trim()?.take(150)?.takeIf { it.isNotBlank() }

            if (!snapshot.exists()) {
                val payload = mapOf<String, Any?>(
                    "userId" to uid,
                    "displayName" to safeName,
                    "email" to safeEmail,
                    "roleLabel" to "Orang Tua / Wali",
                    "createdAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp(),
                ).filterValues { it != null }
                docRef.set(payload).await()
            } else {
                val updatePayload = mapOf<String, Any?>(
                    "displayName" to safeName,
                    "email" to safeEmail,
                    "updatedAt" to FieldValue.serverTimestamp(),
                ).filterValues { it != null }
                docRef.update(updatePayload).await()
            }
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.WRITE, path)
            Result.failure(e)
        }
    }

    fun observeComplaints(
        userId: String,
        statusFilter: ComplaintStatusFilter = ComplaintStatusFilter.ALL,
    ): Flow<List<CloudComplaint>> {
        val path = "users/$userId/complaints"
        val baseRef = db.collection("users").document(userId).collection("complaints")
        val query = when (statusFilter) {
            ComplaintStatusFilter.ALL -> baseRef
            ComplaintStatusFilter.WAITING -> baseRef.whereEqualTo("status", STATUS_WAITING)
            ComplaintStatusFilter.IN_PROGRESS -> baseRef.whereIn("status", IN_PROGRESS_STATUSES)
            ComplaintStatusFilter.COMPLETED -> baseRef.whereEqualTo("status", STATUS_COMPLETED)
        }
        return query
            .snapshots()
            .map { snapshot ->
                snapshot.toObjects(
                    CloudComplaint::class.java,
                    DocumentSnapshot.ServerTimestampBehavior.ESTIMATE,
                ).sortedByDescending { it.createdAt ?: Timestamp(0, 0) }
            }
            .catch { error ->
                val firestoreError = generateSequence(error) { it.cause }
                    .filterIsInstance<FirebaseFirestoreException>()
                    .firstOrNull()
                if (firestoreError == null && error is CancellationException) throw error
                val exceptionToLog = firestoreError ?: (error as? Exception)
                if (exceptionToLog != null && auth.currentUser?.uid == userId) {
                    handleFirestoreError(exceptionToLog, OperationType.LIST, path)
                }
                throw error
            }
    }

    suspend fun createComplaint(
        userId: String,
        submission: ComplaintSubmission,
    ): Result<ComplaintReceipt> {
        var docPath = "users/$userId/complaints"
        return try {
            val uid = requireSignedInUid(userId)
            val cleanCategory = submission.category.trim().take(100)
            val cleanUrgency = if (submission.urgency in ALLOWED_URGENCIES) submission.urgency else "Biasa"
            val cleanLocation = submission.locationDetail.trim().take(160)
            val cleanStudentInfo = submission.studentInfo?.trim()?.take(100)?.takeIf { it.isNotBlank() }
            val cleanDescription = submission.description.trim().take(2000)

            val cleanVulnerable = if (submission.priorityRentan) {
                submission.vulnerableGroup?.trim()?.take(120)?.takeIf { it.isNotBlank() }
            } else {
                null
            }
            val cleanDisability = if (submission.priorityRentan) {
                submission.disabilityType?.trim()?.take(80)?.takeIf { it.isNotBlank() }
            } else {
                null
            }
            val cleanSpecialNote = if (submission.priorityRentan) {
                submission.specialNeedNote?.trim()?.take(300)?.takeIf { it.isNotBlank() }
            } else {
                null
            }
            val cleanReporterName = if (submission.anonymousReport) {
                null
            } else {
                submission.reporterName?.trim()?.take(100)?.takeIf { it.isNotBlank() }
            }

            require(cleanCategory.isNotEmpty()) { "Kategori pengaduan wajib dipilih." }
            require(cleanLocation.isNotEmpty()) { "Lokasi kejadian wajib diisi." }
            require(cleanDescription.length >= 5) { "Uraian pengaduan minimal 5 karakter." }

            val routedTo = resolveHandlingUnit(
                category = cleanCategory,
                urgency = cleanUrgency,
                priorityRentan = submission.priorityRentan,
            )

            val docRef = db.collection("users").document(uid).collection("complaints").document()
            docPath = docRef.path
            val suffix = docRef.id.take(5).uppercase(Locale.US)
            val ticketCode = "ADU-MONSA-$suffix"

            val payload = mapOf<String, Any?>(
                "userId" to uid,
                "ticketCode" to ticketCode,
                "category" to cleanCategory,
                "urgency" to cleanUrgency,
                "locationDetail" to cleanLocation,
                "studentInfo" to cleanStudentInfo,
                "description" to cleanDescription,
                "status" to "Diterima",
                "anonymousReport" to submission.anonymousReport,
                "reporterName" to cleanReporterName,
                "priorityRentan" to submission.priorityRentan,
                "vulnerableGroup" to cleanVulnerable,
                "disabilityType" to cleanDisability,
                "specialNeedNote" to cleanSpecialNote,
                "routedTo" to routedTo,
                "createdAt" to FieldValue.serverTimestamp(),
                "updatedAt" to FieldValue.serverTimestamp(),
            ).filterValues { it != null }

            docRef.set(payload).await()
            Result.success(
                ComplaintReceipt(
                    documentId = docRef.id,
                    ticketCode = ticketCode,
                    category = cleanCategory,
                    urgency = cleanUrgency,
                    routedTo = routedTo,
                    anonymousReport = submission.anonymousReport,
                    priorityRentan = submission.priorityRentan,
                ),
            )
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.CREATE, docPath)
            Result.failure(e)
        }
    }

    private fun resolveHandlingUnit(
        category: String,
        urgency: String,
        priorityRentan: Boolean,
    ): String {
        val lower = category.lowercase(Locale.US)
        return when {
            urgency == "Darurat Anak" || lower.contains("perundungan") || lower.contains("tppk") ->
                "Tim TPPK & Kepala Sekolah"
            priorityRentan || lower.contains("inklusi") ->
                "Tim Inklusi LAKSA+ & Guru Piket"
            lower.contains("pungutan") || lower.contains("seragam") ->
                "Kepala Sekolah & Komite Sekolah"
            lower.contains("fasilitas") || lower.contains("toilet") || lower.contains("kantin") ->
                "Tim Sarpras & K3 Sekolah"
            else ->
                "Tim Pengaduan & Tata Usaha"
        }
    }

    suspend fun updateComplaintStatus(
        userId: String,
        complaintId: String,
        newStatus: String,
    ): Result<Unit> {
        val docPath = "users/$userId/complaints/$complaintId"
        return try {
            val uid = requireSignedInUid(userId)
            require(complaintId.isNotBlank()) { "ID pengaduan tidak valid." }
            require(newStatus in ALLOWED_STATUSES) { "Status pengaduan tidak valid." }
            db.collection("users").document(uid)
                .collection("complaints").document(complaintId)
                .update(
                    mapOf(
                        "status" to newStatus,
                        "updatedAt" to FieldValue.serverTimestamp(),
                    ),
                )
                .await()
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.UPDATE, docPath)
            Result.failure(e)
        }
    }

    suspend fun markComplaintDone(userId: String, complaintId: String): Result<Unit> =
        updateComplaintStatus(userId, complaintId, STATUS_COMPLETED)

    suspend fun deleteComplaint(userId: String, complaintId: String): Result<Unit> {
        val docPath = "users/$userId/complaints/$complaintId"
        return try {
            val uid = requireSignedInUid(userId)
            require(complaintId.isNotBlank()) { "ID pengaduan tidak valid." }
            db.collection("users").document(uid)
                .collection("complaints").document(complaintId)
                .delete()
                .await()
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.DELETE, docPath)
            Result.failure(e)
        }
    }

    fun observeChatMessages(userId: String): Flow<List<GeminiChatMessage>> {
        val path = "users/$userId/chatMessages"
        return db.collection("users").document(userId).collection("chatMessages")
            .snapshots()
            .map { snapshot ->
                snapshot.toObjects(
                    GeminiChatMessage::class.java,
                    DocumentSnapshot.ServerTimestampBehavior.ESTIMATE,
                ).sortedBy { it.createdAt ?: Timestamp(0, 0) }
            }
            .catch { error ->
                val firestoreError = generateSequence(error) { it.cause }
                    .filterIsInstance<FirebaseFirestoreException>()
                    .firstOrNull()
                if (firestoreError == null && error is CancellationException) throw error
                val exceptionToLog = firestoreError ?: (error as? Exception)
                if (exceptionToLog != null && auth.currentUser?.uid == userId) {
                    handleFirestoreError(exceptionToLog, OperationType.LIST, path)
                }
                throw error
            }
    }

    suspend fun saveChatMessage(
        userId: String,
        sender: String,
        text: String,
        modelUsed: String,
        groundingSource: String? = null,
    ): Result<Unit> {
        var docPath = "users/$userId/chatMessages"
        return try {
            val uid = requireSignedInUid(userId)
            val safeSender = if (sender == "model") "model" else "user"
            val safeText = text.trim().take(8000)
            require(safeText.isNotEmpty()) { "Pesan tidak boleh kosong." }
            val safeModel = modelUsed.trim().take(80).ifEmpty { "gemini-3.8-flash" }
            val safeSource = groundingSource?.trim()?.take(500)?.takeIf { it.isNotBlank() }

            val docRef = db.collection("users").document(uid).collection("chatMessages").document()
            docPath = docRef.path
            val payload = mapOf<String, Any?>(
                "userId" to uid,
                "sender" to safeSender,
                "text" to safeText,
                "modelUsed" to safeModel,
                "groundingSource" to safeSource,
                "createdAt" to FieldValue.serverTimestamp(),
            ).filterValues { it != null }

            docRef.set(payload).await()
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.CREATE, docPath)
            Result.failure(e)
        }
    }

    suspend fun clearChatHistory(userId: String): Result<Unit> {
        val path = "users/$userId/chatMessages"
        return try {
            val uid = requireSignedInUid(userId)
            val docs = db.collection("users").document(uid).collection("chatMessages").get().await()
            if (docs.isEmpty) return Result.success(Unit)
            val batch = db.batch()
            for (doc in docs.documents) {
                batch.delete(doc.reference)
            }
            batch.commit().await()
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.DELETE, path)
            Result.failure(e)
        }
    }

    fun observeStatusNotifications(userId: String): Flow<List<StatusNotification>> {
        val path = "users/$userId/notifications"
        return db.collection("users").document(userId).collection("notifications")
            .snapshots()
            .map { snapshot ->
                snapshot.toObjects(
                    StatusNotification::class.java,
                    DocumentSnapshot.ServerTimestampBehavior.ESTIMATE,
                ).sortedByDescending { it.createdAt ?: Timestamp(0, 0) }
            }
            .catch { error ->
                val firestoreError = generateSequence(error) { it.cause }
                    .filterIsInstance<FirebaseFirestoreException>()
                    .firstOrNull()
                if (firestoreError == null && error is CancellationException) throw error
                val exceptionToLog = firestoreError ?: (error as? Exception)
                if (exceptionToLog != null && auth.currentUser?.uid == userId) {
                    handleFirestoreError(exceptionToLog, OperationType.LIST, path)
                }
                throw error
            }
    }

    suspend fun createStatusNotification(
        userId: String,
        complaintId: String,
        ticketCode: String,
        category: String,
        previousStatus: String,
        newStatus: String,
        title: String,
        message: String,
    ): Result<Unit> {
        var docPath = "users/$userId/notifications"
        return try {
            val uid = requireSignedInUid(userId)
            val safeComplaintId = complaintId.trim().take(128)
            val safeTicket = ticketCode.trim().take(40).ifEmpty { "ADU-MONSA" }
            val safeCategory = category.trim().take(100).ifEmpty { "Pengaduan Sekolah" }
            val safePrev = previousStatus.trim().take(60).ifEmpty { STATUS_WAITING }
            val safeNew = if (newStatus in ALLOWED_STATUSES) newStatus else STATUS_IN_PROGRESS
            val safeTitle = title.trim().take(120).ifEmpty { "Status Pengaduan Diperbarui" }
            val safeMsg = message.trim().take(400).ifEmpty {
                "Tiket $safeTicket berubah dari $safePrev menjadi $safeNew."
            }

            require(safeComplaintId.isNotEmpty()) { "ID pengaduan tidak valid." }

            val docRef = db.collection("users").document(uid).collection("notifications").document()
            docPath = docRef.path
            val payload = mapOf<String, Any>(
                "userId" to uid,
                "complaintId" to safeComplaintId,
                "ticketCode" to safeTicket,
                "category" to safeCategory,
                "previousStatus" to safePrev,
                "newStatus" to safeNew,
                "title" to safeTitle,
                "message" to safeMsg,
                "read" to false,
                "createdAt" to FieldValue.serverTimestamp(),
            )
            docRef.set(payload).await()
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.CREATE, docPath)
            Result.failure(e)
        }
    }

    suspend fun markNotificationRead(userId: String, notificationId: String): Result<Unit> {
        val docPath = "users/$userId/notifications/$notificationId"
        return try {
            val uid = requireSignedInUid(userId)
            require(notificationId.isNotBlank()) { "ID notifikasi tidak valid." }
            db.collection("users").document(uid)
                .collection("notifications").document(notificationId)
                .update(
                    mapOf(
                        "read" to true,
                        "readAt" to FieldValue.serverTimestamp(),
                    ),
                )
                .await()
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.UPDATE, docPath)
            Result.failure(e)
        }
    }

    suspend fun markAllNotificationsRead(userId: String): Result<Unit> {
        val path = "users/$userId/notifications"
        return try {
            val uid = requireSignedInUid(userId)
            val unreadDocs = db.collection("users").document(uid)
                .collection("notifications")
                .whereEqualTo("read", false)
                .get()
                .await()
            if (unreadDocs.isEmpty) return Result.success(Unit)
            val batch = db.batch()
            for (doc in unreadDocs.documents) {
                batch.update(
                    doc.reference,
                    mapOf(
                        "read" to true,
                        "readAt" to FieldValue.serverTimestamp(),
                    ),
                )
            }
            batch.commit().await()
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.UPDATE, path)
            Result.failure(e)
        }
    }

    suspend fun clearAllNotifications(userId: String): Result<Unit> {
        val path = "users/$userId/notifications"
        return try {
            val uid = requireSignedInUid(userId)
            val docs = db.collection("users").document(uid)
                .collection("notifications")
                .get()
                .await()
            if (docs.isEmpty) return Result.success(Unit)
            val batch = db.batch()
            for (doc in docs.documents) {
                batch.delete(doc.reference)
            }
            batch.commit().await()
            Result.success(Unit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            handleFirestoreError(e, OperationType.DELETE, path)
            Result.failure(e)
        }
    }

    companion object {
        const val STATUS_WAITING = "Diterima"
        const val STATUS_VERIFIED = "Diverifikasi Piket/TPPK"
        const val STATUS_IN_PROGRESS = "Ditangani TPPK/Kepsek"
        const val STATUS_COMPLETED = "Selesai"

        val IN_PROGRESS_STATUSES = listOf(STATUS_VERIFIED, STATUS_IN_PROGRESS)
        val ALLOWED_STATUSES = setOf(
            STATUS_WAITING,
            STATUS_VERIFIED,
            STATUS_IN_PROGRESS,
            STATUS_COMPLETED,
        )
        val ALLOWED_URGENCIES = setOf("Biasa", "Penting", "Darurat Anak")
    }
}
