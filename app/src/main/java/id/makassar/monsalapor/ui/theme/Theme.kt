package id.makassar.monsalapor.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

val MonsaNavy = Color(0xFF0B2D52)
val MonsaCyan = Color(0xFF0E7490)
val MonsaCyanContainer = Color(0xFFCFFAFE)
val MonsaSurface = Color(0xFFF1F5F9)
val MonsaOnSurface = Color(0xFF0F172A)
val MonsaError = Color(0xFFBE123C)
val HighContrastBlack = Color(0xFF000000)
val HighContrastSurface = Color(0xFF0A0A0A)
val HighContrastYellow = Color(0xFFFACC15)
val HighContrastYellowBright = Color(0xFFFDE047)

private val MonsaColorScheme = lightColorScheme(
    primary = MonsaNavy,
    onPrimary = Color.White,
    primaryContainer = Color(0xFF0F4C75),
    onPrimaryContainer = Color.White,
    secondary = MonsaCyan,
    onSecondary = Color.White,
    secondaryContainer = MonsaCyanContainer,
    onSecondaryContainer = MonsaNavy,
    tertiary = Color(0xFFF59E0B),
    onTertiary = MonsaNavy,
    background = MonsaSurface,
    onBackground = MonsaOnSurface,
    surface = Color.White,
    onSurface = MonsaOnSurface,
    surfaceVariant = MonsaSurface,
    onSurfaceVariant = Color(0xFF475569),
    outline = Color(0xFFCBD5E1),
    error = MonsaError,
    onError = Color.White,
)

private val MonsaHighContrastColorScheme = darkColorScheme(
    primary = HighContrastYellow,
    onPrimary = HighContrastBlack,
    primaryContainer = HighContrastSurface,
    onPrimaryContainer = HighContrastYellowBright,
    secondary = HighContrastYellowBright,
    onSecondary = HighContrastBlack,
    secondaryContainer = Color(0xFF1F2937),
    onSecondaryContainer = HighContrastYellowBright,
    tertiary = HighContrastYellow,
    onTertiary = HighContrastBlack,
    background = HighContrastBlack,
    onBackground = Color.White,
    surface = HighContrastSurface,
    onSurface = Color.White,
    surfaceVariant = Color(0xFF111827),
    onSurfaceVariant = HighContrastYellowBright,
    outline = HighContrastYellow,
    error = Color(0xFFF43F5E),
    onError = Color.White,
)

private val MonsaTypography = Typography(
    titleLarge = TextStyle(
        fontWeight = FontWeight.ExtraBold,
        fontSize = 20.sp,
        lineHeight = 26.sp,
    ),
    titleMedium = TextStyle(
        fontWeight = FontWeight.Bold,
        fontSize = 16.sp,
        lineHeight = 22.sp,
    ),
    bodyMedium = TextStyle(
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    bodySmall = TextStyle(
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 18.sp,
    ),
    labelLarge = TextStyle(
        fontWeight = FontWeight.Bold,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    labelSmall = TextStyle(
        fontWeight = FontWeight.Bold,
        fontSize = 11.sp,
        lineHeight = 14.sp,
    ),
)

private val MonsaShapes = Shapes(
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(24.dp),
)

@Composable
fun SiPakaingeMonsaTheme(
    highContrast: Boolean = false,
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (highContrast) MonsaHighContrastColorScheme else MonsaColorScheme,
        typography = MonsaTypography,
        shapes = MonsaShapes,
        content = content,
    )
}
