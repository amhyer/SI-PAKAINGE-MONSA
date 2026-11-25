package id.makassar.monsalapor.ui.complaints

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import id.makassar.monsalapor.R

@Composable
fun CloudComplaintsScreen(
    viewModel: CloudComplaintsViewModel,
    jumpToHistoryToken: Int = 0,
    modifier: Modifier = Modifier,
) {
    val state by viewModel.complaintsState.collectAsStateWithLifecycle()
    val dashboardAnalytics by viewModel.dashboardAnalytics.collectAsStateWithLifecycle()
    val selectedFilter by viewModel.selectedStatusFilter.collectAsStateWithLifecycle()
    val statusCounts by viewModel.statusCounts.collectAsStateWithLifecycle()
    val isSubmitting by viewModel.isSubmitting.collectAsStateWithLifecycle()
    val submitError by viewModel.submitError.collectAsStateWithLifecycle()
    val lastReceipt by viewModel.lastReceipt.collectAsStateWithLifecycle()
    val feedback by viewModel.feedbackMessage.collectAsStateWithLifecycle()

    val snackbarHostState = remember { SnackbarHostState() }
    var selectedSection by rememberSaveable { mutableIntStateOf(0) } // 0 = Formulir, 1 = Riwayat, 2 = Dashboard

    LaunchedEffect(jumpToHistoryToken) {
        if (jumpToHistoryToken > 0) {
            selectedSection = 1
        }
    }

    val defaultReporterName = remember {
        Firebase.auth.currentUser?.displayName.orEmpty()
    }

    LaunchedEffect(feedback) {
        val msg = feedback
        if (msg != null) {
            snackbarHostState.showSnackbar(msg)
            viewModel.clearFeedback()
        }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 16.dp),
        ) {
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = stringResource(R.string.cloud_title),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onBackground,
            )
            Text(
                text = stringResource(R.string.cloud_subtitle),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(10.dp))

            SingleChoiceSegmentedButtonRow(
                modifier = Modifier.fillMaxWidth(),
            ) {
                SegmentedButton(
                    selected = selectedSection == 0,
                    onClick = { selectedSection = 0 },
                    shape = SegmentedButtonDefaults.itemShape(index = 0, count = 3),
                    modifier = Modifier.testTag("cloud_mode_form_tab"),
                ) {
                    Text(stringResource(R.string.cloud_mode_form), maxLines = 1)
                }
                SegmentedButton(
                    selected = selectedSection == 1,
                    onClick = { selectedSection = 1 },
                    shape = SegmentedButtonDefaults.itemShape(index = 1, count = 3),
                    modifier = Modifier.testTag("cloud_mode_history_tab"),
                ) {
                    val label = if (statusCounts.total > 0) {
                        "${stringResource(R.string.cloud_mode_history)} (${statusCounts.total})"
                    } else {
                        stringResource(R.string.cloud_mode_history)
                    }
                    Text(label, maxLines = 1)
                }
                SegmentedButton(
                    selected = selectedSection == 2,
                    onClick = { selectedSection = 2 },
                    shape = SegmentedButtonDefaults.itemShape(index = 2, count = 3),
                    modifier = Modifier.testTag("cloud_mode_dashboard_tab"),
                ) {
                    Text(stringResource(R.string.cloud_mode_dashboard), maxLines = 1)
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            when (selectedSection) {
                0 -> ComplaintFormComponent(
                    isSubmitting = isSubmitting,
                    submitError = submitError,
                    lastReceipt = lastReceipt,
                    defaultReporterName = defaultReporterName,
                    onSubmit = { submission, onResetForm ->
                        viewModel.submitComplaint(
                            submission = submission,
                            onSuccess = { onResetForm() },
                        )
                    },
                    onDismissReceipt = viewModel::dismissReceipt,
                    onClearSubmitError = viewModel::clearSubmitError,
                    onViewHistory = { selectedSection = 1 },
                    modifier = Modifier.weight(1f),
                )
                1 -> ComplaintHistoryComponent(
                    state = state,
                    selectedFilter = selectedFilter,
                    statusCounts = statusCounts,
                    onSelectFilter = viewModel::selectStatusFilter,
                    onOpenForm = { selectedSection = 0 },
                    onMarkInProgress = viewModel::markInProgress,
                    onMarkDone = viewModel::markDone,
                    onDelete = viewModel::deleteComplaint,
                    modifier = Modifier.weight(1f),
                )
                else -> ComplaintDashboardComponent(
                    analyticsState = dashboardAnalytics,
                    onFilterHistory = { filter ->
                        viewModel.selectStatusFilter(filter)
                        selectedSection = 1
                    },
                    onOpenForm = { selectedSection = 0 },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}
