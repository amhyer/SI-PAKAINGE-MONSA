package id.makassar.monsalapor.ui.maps

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.Firebase
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.LatLng
import com.google.firebase.ai.type.RetrievalConfig
import com.google.firebase.ai.type.Tool
import com.google.firebase.ai.type.ToolConfig
import com.google.firebase.ai.type.content
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout

data class MapsPlaceSource(
    val title: String,
    val uri: String,
)

sealed interface MapsGroundingUiState {
    data object Idle : MapsGroundingUiState
    data object Loading : MapsGroundingUiState
    data class Success(
        val query: String,
        val answerText: String,
        val sources: List<MapsPlaceSource>,
    ) : MapsGroundingUiState
    data class Error(val message: String) : MapsGroundingUiState
}

class SchoolMapsViewModel : ViewModel() {

    private val mapsModel by lazy {
        Firebase.ai(backend = GenerativeBackend.googleAI()).generativeModel(
            modelName = MAPS_MODEL_NAME,
            tools = listOf(Tool.googleMaps()),
            toolConfig = ToolConfig(
                retrievalConfig = RetrievalConfig.builder()
                    .setLatLng(LatLng(SCHOOL_LAT, SCHOOL_LNG))
                    .setLanguageCode("id")
                    .build(),
            ),
            systemInstruction = content {
                text(
                    "Anda adalah asisten informasi lokasi untuk UPTD SPF SD Negeri Unggulan Mongisidi 1 " +
                        "(Jl. R.W. Monginsidi No. 13, Maricaya Baru, Kec. Makassar, Kota Makassar 90142). " +
                        "Gunakan data Google Maps Grounding untuk memberikan jawaban akurat, mutakhir, dan jelas dalam bahasa Indonesia " +
                        "terkait lokasi sekolah, rute akses, fasilitas kesehatan/darurat, instansi pendidikan, dan fasilitas umum terdekat di Kota Makassar.",
                )
            },
        )
    }

    private val _uiState = MutableStateFlow<MapsGroundingUiState>(MapsGroundingUiState.Idle)
    val uiState: StateFlow<MapsGroundingUiState> = _uiState.asStateFlow()

    fun searchNearbyWithMapsGrounding(rawQuery: String) {
        val query = rawQuery.trim()
        if (query.isEmpty()) return

        viewModelScope.launch {
            _uiState.value = MapsGroundingUiState.Loading
            try {
                val prompt = "Di sekitar UPTD SPF SDN Unggulan Mongisidi 1 Makassar " +
                    "(Jl. R.W. Monginsidi No. 13, Maricaya Baru, Makassar): $query"

                val response = withTimeout(TIMEOUT_MS) {
                    mapsModel.generateContent(prompt)
                }

                val text = response.text?.trim().orEmpty()
                val chunks = response.candidates.firstOrNull()
                    ?.groundingMetadata
                    ?.groundingChunks
                    .orEmpty()

                val sources = chunks.mapNotNull { chunk ->
                    val maps = chunk.maps
                    val web = chunk.web
                    when {
                        maps != null && !maps.uri.isNullOrBlank() -> MapsPlaceSource(
                            title = maps.title?.takeIf { it.isNotBlank() } ?: "Lokasi Google Maps",
                            uri = maps.uri!!,
                        )
                        web != null && !web.uri.isNullOrBlank() -> MapsPlaceSource(
                            title = web.title?.takeIf { it.isNotBlank() } ?: "Referensi Lokasi",
                            uri = web.uri!!,
                        )
                        else -> null
                    }
                }.distinctBy { it.uri }

                if (text.isNotEmpty()) {
                    _uiState.value = MapsGroundingUiState.Success(
                        query = query,
                        answerText = text,
                        sources = sources,
                    )
                } else {
                    _uiState.value = MapsGroundingUiState.Error(
                        "Tidak ada informasi lokasi yang ditemukan. Coba pertanyaan yang lebih spesifik.",
                    )
                }
            } catch (e: TimeoutCancellationException) {
                Log.e(TAG, "Maps grounding timed out", e)
                _uiState.value = MapsGroundingUiState.Error(
                    "Pencarian lokasi melebihi batas waktu 60 detik. Silakan coba lagi.",
                )
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.e(TAG, "Maps grounding failed", e)
                _uiState.value = MapsGroundingUiState.Error(
                    e.localizedMessage ?: "Gagal mengambil data Google Maps Grounding.",
                )
            }
        }
    }

    companion object {
        private const val TAG = "SchoolMapsVM"
        private const val MAPS_MODEL_NAME = "gemini-3.8-flash"
        private const val TIMEOUT_MS = 60_000L
        const val SCHOOL_LAT = -5.1494
        const val SCHOOL_LNG = 119.4209
    }
}
