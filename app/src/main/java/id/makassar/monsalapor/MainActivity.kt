package id.makassar.monsalapor

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import id.makassar.monsalapor.firebase.configureAppCheck
import id.makassar.monsalapor.ui.AccessibilityViewModel
import id.makassar.monsalapor.ui.MonsaAppShell
import id.makassar.monsalapor.ui.theme.SiPakaingeMonsaTheme

class MainActivity : ComponentActivity() {
    private var launchQuery by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        configureAppCheck(this, intent)
        launchQuery = intent?.data?.query
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(NAVY_BAR_COLOR),
            navigationBarStyle = SystemBarStyle.dark(NAVY_BAR_COLOR),
        )
        setContent {
            val a11yViewModel: AccessibilityViewModel = viewModel(
                factory = AccessibilityViewModel.factory(applicationContext),
            )
            val a11yState by a11yViewModel.uiState.collectAsStateWithLifecycle()

            var appliedHighContrast by remember { mutableStateOf(false) }

            LaunchedEffect(a11yState.highContrastEnabled) {
                if (a11yState.highContrastEnabled != appliedHighContrast) {
                    appliedHighContrast = a11yState.highContrastEnabled
                    val barColor = if (a11yState.highContrastEnabled) {
                        HIGH_CONTRAST_BAR_COLOR
                    } else {
                        NAVY_BAR_COLOR
                    }
                    enableEdgeToEdge(
                        statusBarStyle = SystemBarStyle.dark(barColor),
                        navigationBarStyle = SystemBarStyle.dark(barColor),
                    )
                }
            }

            SiPakaingeMonsaTheme(highContrast = a11yState.highContrastEnabled) {
                MonsaAppShell(
                    initialQuery = launchQuery,
                    a11yState = a11yState,
                    onOpenA11yPanel = a11yViewModel::openPanel,
                    onCloseA11yPanel = a11yViewModel::closePanel,
                    onSetLargeText = a11yViewModel::setLargeText,
                    onSetHighContrast = a11yViewModel::setHighContrast,
                    onEnableAllA11y = a11yViewModel::enableAll,
                    onResetA11y = a11yViewModel::resetDefaults,
                    onSyncA11yFromWeb = a11yViewModel::syncFromWeb,
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        configureAppCheck(this, intent)
        val updatedQuery = intent.data?.query
        if (!updatedQuery.isNullOrBlank()) {
            launchQuery = updatedQuery
        }
    }

    companion object {
        private const val NAVY_BAR_COLOR = 0xFF0B2D52.toInt()
        private const val HIGH_CONTRAST_BAR_COLOR = 0xFF000000.toInt()
    }
}
