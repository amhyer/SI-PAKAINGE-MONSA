package id.makassar.monsalapor.ui

import android.content.Context
import android.content.SharedPreferences
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

data class AccessibilityUiState(
    val largeTextEnabled: Boolean = false,
    val highContrastEnabled: Boolean = false,
    val isPanelOpen: Boolean = false,
) {
    val activeCount: Int
        get() = (if (largeTextEnabled) 1 else 0) + (if (highContrastEnabled) 1 else 0)
}

class AccessibilityPreferencesRepository(context: Context) {
    private val prefs: SharedPreferences = context.applicationContext.getSharedPreferences(
        PREFS_NAME,
        Context.MODE_PRIVATE,
    )

    fun isLargeTextEnabled(): Boolean = prefs.getBoolean(KEY_LARGE_TEXT, false)

    fun isHighContrastEnabled(): Boolean = prefs.getBoolean(KEY_HIGH_CONTRAST, false)

    fun save(largeText: Boolean, highContrast: Boolean) {
        prefs.edit()
            .putBoolean(KEY_LARGE_TEXT, largeText)
            .putBoolean(KEY_HIGH_CONTRAST, highContrast)
            .apply()
    }

    companion object {
        private const val PREFS_NAME = "monsa_a11y_prefs"
        private const val KEY_LARGE_TEXT = "monsa_a11y_large"
        private const val KEY_HIGH_CONTRAST = "monsa_high_contrast"
    }
}

class AccessibilityViewModel(
    private val repository: AccessibilityPreferencesRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        AccessibilityUiState(
            largeTextEnabled = repository.isLargeTextEnabled(),
            highContrastEnabled = repository.isHighContrastEnabled(),
            isPanelOpen = false,
        ),
    )
    val uiState: StateFlow<AccessibilityUiState> = _uiState.asStateFlow()

    fun openPanel() {
        _uiState.update { it.copy(isPanelOpen = true) }
    }

    fun closePanel() {
        _uiState.update { it.copy(isPanelOpen = false) }
    }

    fun setLargeText(enabled: Boolean) {
        _uiState.update { current ->
            val updated = current.copy(largeTextEnabled = enabled)
            repository.save(updated.largeTextEnabled, updated.highContrastEnabled)
            updated
        }
    }

    fun setHighContrast(enabled: Boolean) {
        _uiState.update { current ->
            val updated = current.copy(highContrastEnabled = enabled)
            repository.save(updated.largeTextEnabled, updated.highContrastEnabled)
            updated
        }
    }

    fun enableAll() {
        _uiState.update { current ->
            val updated = current.copy(largeTextEnabled = true, highContrastEnabled = true)
            repository.save(true, true)
            updated
        }
    }

    fun resetDefaults() {
        _uiState.update { current ->
            val updated = current.copy(largeTextEnabled = false, highContrastEnabled = false)
            repository.save(false, false)
            updated
        }
    }

    fun syncFromWeb(largeText: Boolean, highContrast: Boolean) {
        _uiState.update { current ->
            if (current.largeTextEnabled == largeText && current.highContrastEnabled == highContrast) {
                current
            } else {
                repository.save(largeText, highContrast)
                current.copy(
                    largeTextEnabled = largeText,
                    highContrastEnabled = highContrast,
                )
            }
        }
    }

    companion object {
        fun factory(context: Context): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    return AccessibilityViewModel(AccessibilityPreferencesRepository(context)) as T
                }
            }
    }
}
