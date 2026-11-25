package id.makassar.monsalapor.ui.complaints

import id.makassar.monsalapor.data.CloudComplaint
import id.makassar.monsalapor.data.ComplaintStatusFilter
import id.makassar.monsalapor.data.MonsaFirestoreRepository
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

data class ChartBucket(
    val id: String,
    val label: String,
    val count: Int,
    val ratio: Float,
    val filter: ComplaintStatusFilter? = null,
)

data class DailyTrendPoint(
    val dayKey: String,
    val shortLabel: String,
    val count: Int,
)

data class ComplaintDashboardAnalytics(
    val totalCount: Int = 0,
    val completionRatePercent: Int = 0,
    val waitingCount: Int = 0,
    val inProgressCount: Int = 0,
    val completedCount: Int = 0,
    val priorityRentanCount: Int = 0,
    val urgentChildCount: Int = 0,
    val anonymousCount: Int = 0,
    val statusBuckets: List<ChartBucket> = emptyList(),
    val categoryBuckets: List<ChartBucket> = emptyList(),
    val urgencyBuckets: List<ChartBucket> = emptyList(),
    val dailyTrend: List<DailyTrendPoint> = emptyList(),
)

internal fun computeDashboardAnalytics(
    complaints: List<CloudComplaint>,
    nowMillis: Long = System.currentTimeMillis(),
): ComplaintDashboardAnalytics {
    val total = complaints.size
    val safeTotal = total.coerceAtLeast(1).toFloat()

    var waiting = 0
    var inProgress = 0
    var completed = 0
    var priorityRentan = 0
    var urgentChild = 0
    var anonymous = 0

    val categoryCounts = linkedMapOf<String, Int>()
    val urgencyCounts = linkedMapOf(
        "Biasa" to 0,
        "Penting" to 0,
        "Darurat Anak" to 0,
    )

    val dayKeyFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    val shortDayFormat = SimpleDateFormat("dd/MM", Locale.forLanguageTag("id-ID"))

    val dayKeys = mutableListOf<Pair<String, String>>()
    val cal = Calendar.getInstance().apply {
        timeInMillis = nowMillis
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
        add(Calendar.DAY_OF_YEAR, -6)
    }
    repeat(7) { idx ->
        val date = cal.time
        val key = dayKeyFormat.format(date)
        val label = if (idx == 6) "Hari ini" else shortDayFormat.format(date)
        dayKeys.add(key to label)
        cal.add(Calendar.DAY_OF_YEAR, 1)
    }
    val dailyCounts = dayKeys.associate { it.first to 0 }.toMutableMap()

    for (item in complaints) {
        when (item.status) {
            MonsaFirestoreRepository.STATUS_WAITING -> waiting++
            MonsaFirestoreRepository.STATUS_COMPLETED -> completed++
            else -> inProgress++
        }

        if (item.priorityRentan) priorityRentan++
        if (item.urgency == "Darurat Anak") urgentChild++
        if (item.anonymousReport) anonymous++

        val cleanCategory = item.category.trim().ifEmpty { "Lainnya" }
        categoryCounts[cleanCategory] = (categoryCounts[cleanCategory] ?: 0) + 1

        val cleanUrgency = when (item.urgency) {
            "Darurat Anak" -> "Darurat Anak"
            "Penting" -> "Penting"
            else -> "Biasa"
        }
        urgencyCounts[cleanUrgency] = (urgencyCounts[cleanUrgency] ?: 0) + 1

        val createdDate = item.createdAt?.toDate()
        if (createdDate != null) {
            val key = dayKeyFormat.format(createdDate)
            if (key in dailyCounts) {
                dailyCounts[key] = (dailyCounts[key] ?: 0) + 1
            }
        }
    }

    val statusBuckets = listOf(
        ChartBucket(
            id = "waiting",
            label = "Menunggu",
            count = waiting,
            ratio = if (total == 0) 0f else waiting / safeTotal,
            filter = ComplaintStatusFilter.WAITING,
        ),
        ChartBucket(
            id = "in_progress",
            label = "Diproses",
            count = inProgress,
            ratio = if (total == 0) 0f else inProgress / safeTotal,
            filter = ComplaintStatusFilter.IN_PROGRESS,
        ),
        ChartBucket(
            id = "completed",
            label = "Selesai",
            count = completed,
            ratio = if (total == 0) 0f else completed / safeTotal,
            filter = ComplaintStatusFilter.COMPLETED,
        ),
    )

    val categoryBuckets = categoryCounts.entries
        .sortedByDescending { it.value }
        .mapIndexed { index, entry ->
            ChartBucket(
                id = "cat_$index",
                label = entry.key,
                count = entry.value,
                ratio = if (total == 0) 0f else entry.value / safeTotal,
            )
        }

    val urgencyBuckets = urgencyCounts.entries.map { entry ->
        ChartBucket(
            id = "urg_${entry.key}",
            label = entry.key,
            count = entry.value,
            ratio = if (total == 0) 0f else entry.value / safeTotal,
        )
    }

    val dailyTrend = dayKeys.map { (key, label) ->
        DailyTrendPoint(
            dayKey = key,
            shortLabel = label,
            count = dailyCounts[key] ?: 0,
        )
    }

    val completionRate = if (total == 0) 0 else ((completed * 100f) / total).toInt()

    return ComplaintDashboardAnalytics(
        totalCount = total,
        completionRatePercent = completionRate,
        waitingCount = waiting,
        inProgressCount = inProgress,
        completedCount = completed,
        priorityRentanCount = priorityRentan,
        urgentChildCount = urgentChild,
        anonymousCount = anonymous,
        statusBuckets = statusBuckets,
        categoryBuckets = categoryBuckets,
        urgencyBuckets = urgencyBuckets,
        dailyTrend = dailyTrend,
    )
}
