package id.makassar.monsalapor.ui.complaints

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.AccessibilityNew
import androidx.compose.material.icons.rounded.Campaign
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Handyman
import androidx.compose.material.icons.rounded.Payments
import androidx.compose.material.icons.rounded.RestartAlt
import androidx.compose.material.icons.rounded.School
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.VerifiedUser
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import id.makassar.monsalapor.R
import id.makassar.monsalapor.data.ComplaintReceipt
import id.makassar.monsalapor.data.ComplaintSubmission

private data class ComplaintCategoryOption(
    val id: String,
    val subtitle: String,
    val icon: ImageVector,
)

private val COMPLAINT_CATEGORY_OPTIONS = listOf(
    ComplaintCategoryOption(
        id = "Perundungan / Bullying (TPPK)",
        subtitle = "Kekerasan fisik/verbal, intoleransi, atau keselamatan anak",
        icon = Icons.Rounded.Shield,
    ),
    ComplaintCategoryOption(
        id = "Pungutan / Seragam Sekolah",
        subtitle = "Transparansi biaya, seragam, atau dugaan pungutan liar",
        icon = Icons.Rounded.Payments,
    ),
    ComplaintCategoryOption(
        id = "Fasilitas Kelas / Toilet / Kantin",
        subtitle = "Sarpras, kebersihan, aksesibilitas disabilitas & K3",
        icon = Icons.Rounded.Handyman,
    ),
    ComplaintCategoryOption(
        id = "Layanan Guru / Kelas Inklusi / TU",
        subtitle = "Administrasi, pembelajaran inklusi, dan pelayanan publik",
        icon = Icons.Rounded.School,
    ),
    ComplaintCategoryOption(
        id = "Saran & Aspirasi Sekolah",
        subtitle = "Usulan perbaikan mutu layanan pendidikan MONSA",
        icon = Icons.Rounded.Campaign,
    ),
)

private val URGENCY_OPTIONS = listOf("Biasa", "Penting", "Darurat Anak")

private val VULNERABLE_GROUP_OPTIONS = listOf(
    "Penyandang Disabilitas / Siswa Inklusi",
    "Lansia (60+)",
    "Ibu Hamil / Menyusui",
    "Anak Membutuhkan Pendampingan Khusus",
    "Keluarga Prasejahtera / KIP",
)

private val DISABILITY_TYPE_OPTIONS = listOf(
    "Tunanetra / Low Vision",
    "Tunarungu / Tuli",
    "Disabilitas Fisik / Kursi Roda",
    "Disabilitas Intelektual / Inklusi",
    "Lansia / Mobilitas Terbatas",
)

private const val MAX_LOCATION_LEN = 160
private const val MAX_STUDENT_INFO_LEN = 100
private const val MAX_DESCRIPTION_LEN = 2000
private const val MAX_SPECIAL_NOTE_LEN = 300
private const val MAX_REPORTER_NAME_LEN = 100

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ComplaintFormComponent(
    isSubmitting: Boolean,
    submitError: String?,
    lastReceipt: ComplaintReceipt?,
    defaultReporterName: String,
    onSubmit: (submission: ComplaintSubmission, onResetForm: () -> Unit) -> Unit,
    onDismissReceipt: () -> Unit,
    onClearSubmitError: () -> Unit,
    onViewHistory: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var category by rememberSaveable { mutableStateOf(COMPLAINT_CATEGORY_OPTIONS.first().id) }
    var urgency by rememberSaveable { mutableStateOf("Penting") }
    var priorityRentan by rememberSaveable { mutableStateOf(false) }
    var vulnerableGroup by rememberSaveable { mutableStateOf(VULNERABLE_GROUP_OPTIONS.first()) }
    var disabilityType by rememberSaveable { mutableStateOf("") }
    var specialNeedNote by rememberSaveable { mutableStateOf("") }
    var locationDetail by rememberSaveable { mutableStateOf("") }
    var studentInfo by rememberSaveable { mutableStateOf("") }
    var description by rememberSaveable { mutableStateOf("") }
    var anonymousReport by rememberSaveable { mutableStateOf(true) }
    var reporterName by rememberSaveable { mutableStateOf(defaultReporterName) }

    var locationError by rememberSaveable { mutableStateOf<String?>(null) }
    var descriptionError by rememberSaveable { mutableStateOf<String?>(null) }

    fun resetForm() {
        category = COMPLAINT_CATEGORY_OPTIONS.first().id
        urgency = "Penting"
        priorityRentan = false
        vulnerableGroup = VULNERABLE_GROUP_OPTIONS.first()
        disabilityType = ""
        specialNeedNote = ""
        locationDetail = ""
        studentInfo = ""
        description = ""
        anonymousReport = true
        reporterName = defaultReporterName
        locationError = null
        descriptionError = null
        onClearSubmitError()
    }

    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.TopCenter,
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .widthIn(max = 640.dp)
                .verticalScroll(rememberScrollState())
                .padding(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // Header Banner
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(24.dp))
                    .background(
                        Brush.horizontalGradient(
                            colors = listOf(
                                MaterialTheme.colorScheme.primary,
                                MaterialTheme.colorScheme.secondary,
                            ),
                        ),
                    )
                    .padding(18.dp),
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.VerifiedUser,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.size(28.dp),
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = stringResource(R.string.cloud_form_title),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onPrimary,
                        )
                        Text(
                            text = stringResource(R.string.cloud_form_banner_desc),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.92f),
                        )
                    }
                }
            }

            // Receipt card shown immediately after successful Firestore write
            AnimatedVisibility(visible = lastReceipt != null) {
                lastReceipt?.let { receipt ->
                    ComplaintReceiptCard(
                        receipt = receipt,
                        onDismiss = onDismissReceipt,
                        onViewHistory = onViewHistory,
                    )
                }
            }

            // Server/Firestore error banner
            AnimatedVisibility(visible = submitError != null) {
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = MaterialTheme.colorScheme.error.copy(alpha = 0.12f),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.5f)),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("complaint_form_error_banner"),
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.ErrorOutline,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                        )
                        Text(
                            text = submitError.orEmpty(),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }

            // Step 1: Category Selection
            FormSectionCard(title = stringResource(R.string.cloud_category_label)) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    COMPLAINT_CATEGORY_OPTIONS.forEach { option ->
                        val selected = category == option.id
                        Surface(
                            shape = RoundedCornerShape(16.dp),
                            color = if (selected) {
                                MaterialTheme.colorScheme.secondaryContainer
                            } else {
                                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
                            },
                            border = BorderStroke(
                                width = if (selected) 2.dp else 1.dp,
                                color = if (selected) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
                                },
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = 56.dp)
                                .clip(RoundedCornerShape(16.dp))
                                .clickable {
                                    category = option.id
                                    if (option.id.contains("TPPK", ignoreCase = true)) {
                                        urgency = "Darurat Anak"
                                    }
                                }
                                .testTag("category_option_${option.id.take(10)}"),
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(
                                    imageVector = option.icon,
                                    contentDescription = null,
                                    tint = if (selected) {
                                        MaterialTheme.colorScheme.primary
                                    } else {
                                        MaterialTheme.colorScheme.onSurfaceVariant
                                    },
                                    modifier = Modifier.size(22.dp),
                                )
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = option.id,
                                        style = MaterialTheme.typography.labelLarge,
                                        fontWeight = if (selected) FontWeight.Bold else FontWeight.SemiBold,
                                        color = MaterialTheme.colorScheme.onSurface,
                                    )
                                    Text(
                                        text = option.subtitle,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                if (selected) {
                                    Icon(
                                        imageVector = Icons.Rounded.CheckCircle,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.primary,
                                        modifier = Modifier.size(20.dp),
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // Step 2: Urgency Selection
            FormSectionCard(title = stringResource(R.string.cloud_urgency_label)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    URGENCY_OPTIONS.forEach { level ->
                        val selected = urgency == level
                        val isEmergency = level == "Darurat Anak"
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            color = when {
                                selected && isEmergency -> MaterialTheme.colorScheme.error
                                selected -> MaterialTheme.colorScheme.primary
                                else -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                            },
                            contentColor = when {
                                selected && isEmergency -> MaterialTheme.colorScheme.onError
                                selected -> MaterialTheme.colorScheme.onPrimary
                                else -> MaterialTheme.colorScheme.onSurface
                            },
                            border = BorderStroke(
                                width = 1.dp,
                                color = if (selected) {
                                    if (isEmergency) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.outline.copy(alpha = 0.6f)
                                },
                            ),
                            modifier = Modifier
                                .weight(1f)
                                .heightIn(min = 48.dp)
                                .clip(RoundedCornerShape(14.dp))
                                .clickable { urgency = level }
                                .testTag("urgency_option_$level"),
                        ) {
                            Box(
                                contentAlignment = Alignment.Center,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 10.dp),
                            ) {
                                Text(
                                    text = level,
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                                )
                            }
                        }
                    }
                }
            }

            // Step 3: LAKSA+ Vulnerable Group & Inclusion Priority
            FormSectionCard(
                title = stringResource(R.string.cloud_rentan_section_title),
                subtitle = stringResource(R.string.cloud_rentan_section_desc),
                icon = Icons.Rounded.AccessibilityNew,
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.cloud_rentan_label),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.weight(1f),
                    )
                    Switch(
                        checked = priorityRentan,
                        onCheckedChange = { priorityRentan = it },
                        modifier = Modifier.testTag("form_priority_rentan_switch"),
                    )
                }

                AnimatedVisibility(visible = priorityRentan) {
                    Column(
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier.padding(top = 6.dp),
                    ) {
                        Text(
                            text = stringResource(R.string.cloud_vulnerable_group_label),
                            style = MaterialTheme.typography.labelLarge,
                        )
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            VULNERABLE_GROUP_OPTIONS.forEach { group ->
                                FilterChip(
                                    selected = vulnerableGroup == group,
                                    onClick = { vulnerableGroup = group },
                                    label = { Text(group, style = MaterialTheme.typography.labelSmall) },
                                )
                            }
                        }

                        Text(
                            text = stringResource(R.string.cloud_disability_label),
                            style = MaterialTheme.typography.labelLarge,
                        )
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            DISABILITY_TYPE_OPTIONS.forEach { type ->
                                val active = disabilityType == type
                                FilterChip(
                                    selected = active,
                                    onClick = { disabilityType = if (active) "" else type },
                                    label = { Text(type, style = MaterialTheme.typography.labelSmall) },
                                )
                            }
                        }

                        OutlinedTextField(
                            value = specialNeedNote,
                            onValueChange = { if (it.length <= MAX_SPECIAL_NOTE_LEN) specialNeedNote = it },
                            label = { Text(stringResource(R.string.cloud_special_note_label)) },
                            placeholder = { Text(stringResource(R.string.cloud_special_note_placeholder)) },
                            supportingText = { Text("${specialNeedNote.length} / $MAX_SPECIAL_NOTE_LEN") },
                            minLines = 2,
                            maxLines = 3,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag("form_special_note_input"),
                        )
                    }
                }
            }

            // Step 4: Location & Student Info
            FormSectionCard(title = stringResource(R.string.cloud_location_section_title)) {
                OutlinedTextField(
                    value = locationDetail,
                    onValueChange = {
                        if (it.length <= MAX_LOCATION_LEN) {
                            locationDetail = it
                            locationError = null
                            onClearSubmitError()
                        }
                    },
                    label = { Text(stringResource(R.string.cloud_location_label)) },
                    placeholder = { Text(stringResource(R.string.cloud_location_placeholder)) },
                    isError = locationError != null,
                    supportingText = {
                        Text(locationError ?: "${locationDetail.length} / $MAX_LOCATION_LEN")
                    },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("cloud_location_input"),
                )

                OutlinedTextField(
                    value = studentInfo,
                    onValueChange = { if (it.length <= MAX_STUDENT_INFO_LEN) studentInfo = it },
                    label = { Text(stringResource(R.string.cloud_student_info_label)) },
                    placeholder = { Text(stringResource(R.string.cloud_student_info_placeholder)) },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("cloud_student_info_input"),
                )
            }

            // Step 5: Incident Description
            FormSectionCard(title = stringResource(R.string.cloud_description_section_title)) {
                OutlinedTextField(
                    value = description,
                    onValueChange = {
                        if (it.length <= MAX_DESCRIPTION_LEN) {
                            description = it
                            descriptionError = null
                            onClearSubmitError()
                        }
                    },
                    label = { Text(stringResource(R.string.cloud_description_label)) },
                    isError = descriptionError != null,
                    supportingText = {
                        Text(descriptionError ?: "${description.length} / $MAX_DESCRIPTION_LEN")
                    },
                    minLines = 4,
                    maxLines = 7,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("cloud_description_input"),
                )
            }

            // Step 6: UU PDP Privacy / Anonymity
            FormSectionCard(
                title = stringResource(R.string.cloud_privacy_section_title),
                icon = Icons.Rounded.Shield,
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.cloud_anonymous_label),
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f),
                    )
                    Switch(
                        checked = anonymousReport,
                        onCheckedChange = { anonymousReport = it },
                        modifier = Modifier.testTag("form_anonymous_switch"),
                    )
                }

                AnimatedVisibility(visible = !anonymousReport) {
                    OutlinedTextField(
                        value = reporterName,
                        onValueChange = { if (it.length <= MAX_REPORTER_NAME_LEN) reporterName = it },
                        label = { Text(stringResource(R.string.cloud_reporter_name_label)) },
                        placeholder = { Text(stringResource(R.string.cloud_reporter_name_placeholder)) },
                        singleLine = true,
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 6.dp)
                            .testTag("form_reporter_name_input"),
                    )
                }
            }

            // Submit & Reset Actions
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedButton(
                    onClick = ::resetForm,
                    enabled = !isSubmitting,
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier
                        .height(52.dp)
                        .testTag("reset_cloud_complaint_button"),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.RestartAlt,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(stringResource(R.string.cloud_reset_form))
                }

                Button(
                    onClick = {
                        val trimmedLoc = locationDetail.trim()
                        val trimmedDesc = description.trim()
                        var valid = true
                        if (trimmedLoc.isEmpty()) {
                            locationError = "Lokasi kejadian wajib diisi."
                            valid = false
                        }
                        if (trimmedDesc.length < 5) {
                            descriptionError = "Uraian kejadian minimal 5 karakter."
                            valid = false
                        }
                        if (valid) {
                            val submission = ComplaintSubmission(
                                category = category,
                                urgency = urgency,
                                locationDetail = trimmedLoc,
                                studentInfo = studentInfo.trim().takeIf { it.isNotEmpty() },
                                description = trimmedDesc,
                                anonymousReport = anonymousReport,
                                reporterName = if (anonymousReport) {
                                    null
                                } else {
                                    reporterName.trim().takeIf { it.isNotEmpty() }
                                },
                                priorityRentan = priorityRentan,
                                vulnerableGroup = if (priorityRentan) vulnerableGroup else null,
                                disabilityType = if (priorityRentan) {
                                    disabilityType.takeIf { it.isNotBlank() }
                                } else {
                                    null
                                },
                                specialNeedNote = if (priorityRentan) {
                                    specialNeedNote.trim().takeIf { it.isNotEmpty() }
                                } else {
                                    null
                                },
                            )
                            onSubmit(submission, ::resetForm)
                        }
                    },
                    enabled = !isSubmitting,
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary,
                    ),
                    modifier = Modifier
                        .weight(1f)
                        .height(52.dp)
                        .testTag("submit_cloud_complaint_button"),
                ) {
                    if (isSubmitting) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = MaterialTheme.colorScheme.onPrimary,
                            strokeWidth = 2.dp,
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(stringResource(R.string.cloud_submitting))
                    } else {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.Send,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = stringResource(R.string.cloud_submit),
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun FormSectionCard(
    title: String,
    subtitle: String? = null,
    icon: ImageVector? = null,
    content: @Composable () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)),
        tonalElevation = 1.dp,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (icon != null) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.secondary,
                        modifier = Modifier.size(20.dp),
                    )
                }
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            if (subtitle != null) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            content()
        }
    }
}

@Composable
private fun ComplaintReceiptCard(
    receipt: ComplaintReceipt,
    onDismiss: () -> Unit,
    onViewHistory: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.secondaryContainer,
        border = BorderStroke(1.5.dp, MaterialTheme.colorScheme.secondary),
        modifier = Modifier
            .fillMaxWidth()
            .testTag("complaint_receipt_card"),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
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
                    Icon(
                        imageVector = Icons.Rounded.CheckCircle,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    Text(
                        text = stringResource(R.string.cloud_receipt_title),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSecondaryContainer,
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

            Text(
                text = "Kode Tiket: ${receipt.ticketCode}",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.ExtraBold,
                color = MaterialTheme.colorScheme.primary,
            )
            Text(
                text = "Diteruskan ke: ${receipt.routedTo} · Urgensi: ${receipt.urgency}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSecondaryContainer,
            )

            OutlinedButton(
                onClick = onViewHistory,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .testTag("receipt_view_history_button"),
            ) {
                Text(stringResource(R.string.cloud_receipt_view_history))
            }
        }
    }
}
