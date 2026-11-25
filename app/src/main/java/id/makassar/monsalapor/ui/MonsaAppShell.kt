package id.makassar.monsalapor.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.rounded.AccessibilityNew
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.CloudDone
import androidx.compose.material.icons.rounded.Map
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.Public
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.credentials.CredentialManager
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.firebase.Firebase
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.auth
import id.makassar.monsalapor.R
import id.makassar.monsalapor.data.MonsaFirestoreRepository
import id.makassar.monsalapor.firebase.authStateFlow
import id.makassar.monsalapor.firebase.signOutWithCleanup
import id.makassar.monsalapor.ui.ai.GeminiAssistantViewModel
import id.makassar.monsalapor.ui.ai.GeminiHubScreen
import id.makassar.monsalapor.ui.auth.AuthScreen
import id.makassar.monsalapor.ui.complaints.CloudComplaintsScreen
import id.makassar.monsalapor.ui.complaints.CloudComplaintsViewModel
import id.makassar.monsalapor.ui.maps.SchoolMapsScreen
import id.makassar.monsalapor.ui.maps.SchoolMapsViewModel
import id.makassar.monsalapor.ui.notifications.ComplaintStatusNotifierViewModel
import id.makassar.monsalapor.ui.notifications.NotificationCenterSheet
import id.makassar.monsalapor.ui.notifications.StatusChangeBanner

private enum class MonsaTab(
    val labelRes: Int,
    val icon: ImageVector,
    val testTag: String,
) {
    PORTAL(R.string.nav_portal, Icons.Rounded.Public, "nav_tab_portal"),
    CLOUD_COMPLAINTS(R.string.nav_cloud_complaints, Icons.Rounded.CloudDone, "nav_tab_cloud"),
    GEMINI_AI(R.string.nav_gemini_ai, Icons.Rounded.AutoAwesome, "nav_tab_ai"),
    MAPS(R.string.nav_maps, Icons.Rounded.Map, "nav_tab_maps"),
}

@Composable
fun MonsaAppShell(
    initialQuery: String?,
    a11yState: AccessibilityUiState,
    onOpenA11yPanel: () -> Unit,
    onCloseA11yPanel: () -> Unit,
    onSetLargeText: (Boolean) -> Unit,
    onSetHighContrast: (Boolean) -> Unit,
    onEnableAllA11y: () -> Unit,
    onResetA11y: () -> Unit,
    onSyncA11yFromWeb: (Boolean, Boolean) -> Unit,
) {
    val context = LocalContext.current
    val authFlow = remember(context) {
        if (com.google.firebase.FirebaseApp.getApps(context).isEmpty()) {
            com.google.firebase.FirebaseApp.initializeApp(context)
        }
        runCatching { Firebase.auth.authStateFlow() }
            .getOrElse { kotlinx.coroutines.flow.flowOf(null) }
    }
    val initialUser = remember(context) {
        runCatching { Firebase.auth.currentUser }.getOrNull()
    }
    val authUser by authFlow.collectAsStateWithLifecycle(initialValue = initialUser)

    val user = authUser
    if (user == null) {
        AuthScreen(
            a11yState = a11yState,
            onOpenA11yPanel = onOpenA11yPanel,
            onAuthSuccess = { /* authStateFlow reacts automatically */ },
        )
    } else {
        key(user.uid) {
            AuthenticatedMonsaShell(
                user = user,
                initialQuery = initialQuery,
                a11yState = a11yState,
                onOpenA11yPanel = onOpenA11yPanel,
                onCloseA11yPanel = onCloseA11yPanel,
                onSetLargeText = onSetLargeText,
                onSetHighContrast = onSetHighContrast,
                onEnableAllA11y = onEnableAllA11y,
                onResetA11y = onResetA11y,
                onSyncA11yFromWeb = onSyncA11yFromWeb,
            )
        }
    }

    if (a11yState.isPanelOpen) {
        AccessibilitySettingsSheet(
            state = a11yState,
            onToggleLargeText = onSetLargeText,
            onToggleHighContrast = onSetHighContrast,
            onEnableAll = onEnableAllA11y,
            onResetDefaults = onResetA11y,
            onDismiss = onCloseA11yPanel,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AuthenticatedMonsaShell(
    user: FirebaseUser,
    initialQuery: String?,
    a11yState: AccessibilityUiState,
    onOpenA11yPanel: () -> Unit,
    onCloseA11yPanel: () -> Unit,
    onSetLargeText: (Boolean) -> Unit,
    onSetHighContrast: (Boolean) -> Unit,
    onEnableAllA11y: () -> Unit,
    onResetA11y: () -> Unit,
    onSyncA11yFromWeb: (Boolean, Boolean) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val credentialManager = remember(context) { CredentialManager.create(context) }

    var selectedTab by rememberSaveable { mutableStateOf(MonsaTab.PORTAL) }
    var showNotificationsSheet by rememberSaveable { mutableStateOf(false) }
    var jumpToHistoryToken by rememberSaveable { mutableIntStateOf(0) }

    LaunchedEffect(user.uid) {
        val repository = MonsaFirestoreRepository(context)
        repository.ensureUserProfile(user)
    }

    val complaintsViewModel: CloudComplaintsViewModel = viewModel(
        key = "complaints_${user.uid}",
        factory = CloudComplaintsViewModel.factory(context, user.uid),
    )
    val notifierViewModel: ComplaintStatusNotifierViewModel = viewModel(
        key = "notifier_${user.uid}",
        factory = ComplaintStatusNotifierViewModel.factory(context, user.uid),
    )
    val geminiViewModel: GeminiAssistantViewModel = viewModel(
        key = "gemini_${user.uid}",
        factory = GeminiAssistantViewModel.factory(context, user.uid),
    )
    val mapsViewModel: SchoolMapsViewModel = viewModel(
        key = "maps_${user.uid}",
    )

    val notificationsState by notifierViewModel.notificationsState.collectAsStateWithLifecycle()
    val unreadCount by notifierViewModel.unreadCount.collectAsStateWithLifecycle()
    val activeBanner by notifierViewModel.activeBanner.collectAsStateWithLifecycle()

    fun navigateToComplaintHistory() {
        selectedTab = MonsaTab.CLOUD_COMPLAINTS
        jumpToHistoryToken += 1
    }

    BackHandler(enabled = selectedTab != MonsaTab.PORTAL && !a11yState.isPanelOpen && !showNotificationsSheet) {
        selectedTab = MonsaTab.PORTAL
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    actionIconContentColor = MaterialTheme.colorScheme.onPrimary,
                ),
                title = {
                    Column {
                        Text(
                            text = stringResource(R.string.app_name),
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        val accountLabel = user.displayName?.takeIf { it.isNotBlank() }
                            ?: user.email?.takeIf { it.isNotBlank() }
                            ?: stringResource(R.string.school_subtitle)
                        Text(
                            text = accountLabel,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.82f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                },
                actions = {
                    IconButton(
                        onClick = { showNotificationsSheet = true },
                        modifier = Modifier
                            .minimumInteractiveComponentSize()
                            .testTag("notifications_bell_button"),
                    ) {
                        BadgedBox(
                            badge = {
                                if (unreadCount > 0) {
                                    Badge(
                                        containerColor = MaterialTheme.colorScheme.error,
                                        contentColor = MaterialTheme.colorScheme.onError,
                                    ) {
                                        Text(
                                            text = if (unreadCount > 9) "9+" else unreadCount.toString(),
                                        )
                                    }
                                }
                            },
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Notifications,
                                contentDescription = stringResource(R.string.notif_bell_cd),
                            )
                        }
                    }
                    IconButton(
                        onClick = onOpenA11yPanel,
                        modifier = Modifier
                            .minimumInteractiveComponentSize()
                            .testTag("accessibility_settings_fab"),
                    ) {
                        BadgedBox(
                            badge = {
                                if (a11yState.activeCount > 0) {
                                    Badge(
                                        containerColor = MaterialTheme.colorScheme.secondary,
                                        contentColor = MaterialTheme.colorScheme.onSecondary,
                                    ) {
                                        Text(text = a11yState.activeCount.toString())
                                    }
                                }
                            },
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.AccessibilityNew,
                                contentDescription = stringResource(R.string.a11y_fab_cd),
                            )
                        }
                    }
                    IconButton(
                        onClick = {
                            geminiViewModel.stopVoiceConversation()
                            signOutWithCleanup(
                                credentialManager = credentialManager,
                                scope = scope,
                            )
                        },
                        modifier = Modifier
                            .minimumInteractiveComponentSize()
                            .testTag("sign_out_button"),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.Logout,
                            contentDescription = stringResource(R.string.auth_sign_out_cd),
                        )
                    }
                },
            )
        },
        bottomBar = {
            NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface,
            ) {
                MonsaTab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = selectedTab == tab,
                        onClick = { selectedTab = tab },
                        icon = {
                            Icon(
                                imageVector = tab.icon,
                                contentDescription = stringResource(tab.labelRes),
                            )
                        },
                        label = {
                            Text(
                                text = stringResource(tab.labelRes),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        },
                        modifier = Modifier.testTag(tab.testTag),
                    )
                }
            }
        },
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            when (selectedTab) {
                MonsaTab.PORTAL -> MonsaWebScreen(
                    initialQuery = initialQuery,
                    a11yState = a11yState,
                    onOpenA11yPanel = onOpenA11yPanel,
                    onCloseA11yPanel = onCloseA11yPanel,
                    onSetLargeText = onSetLargeText,
                    onSetHighContrast = onSetHighContrast,
                    onEnableAllA11y = onEnableAllA11y,
                    onResetA11y = onResetA11y,
                    onSyncA11yFromWeb = onSyncA11yFromWeb,
                    embeddedInShell = true,
                )
                MonsaTab.CLOUD_COMPLAINTS -> CloudComplaintsScreen(
                    viewModel = complaintsViewModel,
                    jumpToHistoryToken = jumpToHistoryToken,
                )
                MonsaTab.GEMINI_AI -> GeminiHubScreen(
                    viewModel = geminiViewModel,
                )
                MonsaTab.MAPS -> SchoolMapsScreen(
                    viewModel = mapsViewModel,
                )
            }

            // Floating real-time in-app notification banner whenever Firestore status changes
            AnimatedVisibility(
                visible = activeBanner != null,
                enter = slideInVertically(initialOffsetY = { -it }) + fadeIn(),
                exit = slideOutVertically(targetOffsetY = { -it }) + fadeOut(),
                modifier = Modifier.align(Alignment.TopCenter),
            ) {
                activeBanner?.let { banner ->
                    StatusChangeBanner(
                        banner = banner,
                        userEmail = user.email,
                        onViewHistory = ::navigateToComplaintHistory,
                        onDismiss = notifierViewModel::dismissBanner,
                    )
                }
            }
        }
    }

    if (showNotificationsSheet) {
        NotificationCenterSheet(
            notificationsState = notificationsState,
            unreadCount = unreadCount,
            userEmail = user.email,
            onMarkRead = notifierViewModel::markAsRead,
            onMarkAllRead = notifierViewModel::markAllAsRead,
            onClearAll = notifierViewModel::clearAll,
            onOpenHistory = ::navigateToComplaintHistory,
            onDismiss = { showNotificationsSheet = false },
        )
    }
}
