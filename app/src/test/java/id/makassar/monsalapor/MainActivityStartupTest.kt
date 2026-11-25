package id.makassar.monsalapor

import android.content.Context
import android.net.Uri
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.core.app.ApplicationProvider
import id.makassar.monsalapor.web.MonsaWebAssets
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class MainActivityStartupTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun mainActivity_rendersAuthScreenAndAccessibilityPanelWithoutCrash() {
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("google_sign_in_button").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("accessibility_settings_fab").performScrollTo().assertIsDisplayed()

        composeTestRule.onNodeWithTag("accessibility_settings_fab").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("accessibility_settings_panel").assertIsDisplayed()
    }

    @Test
    fun webBundleAssets_loadViaWebViewAssetLoader() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val loader = MonsaWebAssets.createAssetLoader(context)

        val indexResponse = loader.shouldInterceptRequest(Uri.parse(MonsaWebAssets.APP_BASE_URL))
        assertNotNull("index.html should load from web_bundle", indexResponse)
        val html = indexResponse!!.data.bufferedReader().use { it.readText() }
        assertTrue("index.html should include native Capacitor shim", html.contains("window.Capacitor"))
        assertTrue("index.html should include Monsa env bootstrap", html.contains("window.__MONSA_ENV__"))
        assertTrue("index.html should include root mount div", html.contains("<div id=\"root\">"))

        val swResponse = loader.shouldInterceptRequest(
            Uri.parse("https://${MonsaWebAssets.APP_HOST}/sw.js"),
        )
        assertNotNull("sw.js should be intercepted with inert script", swResponse)
        assertEquals(200, swResponse!!.statusCode)
    }

    @Test
    fun monsaEnvironment_loadsConfiguredVariablesFromBuildConfig() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        assertTrue(id.makassar.monsalapor.config.MonsaEnvironment.mapsApiKey.isNotEmpty())
        assertTrue(id.makassar.monsalapor.config.MonsaEnvironment.environmentName.isNotEmpty())
        assertTrue(id.makassar.monsalapor.config.MonsaEnvironment.webUrl.startsWith("https://"))
        assertTrue(id.makassar.monsalapor.config.MonsaEnvironment.apiBaseUrl.startsWith("https://"))
        assertTrue(id.makassar.monsalapor.config.MonsaEnvironment.apkUrl.startsWith("https://"))
        assertTrue(id.makassar.monsalapor.config.MonsaEnvironment.schoolEmailFrom.contains("@"))
        assertEquals(587, id.makassar.monsalapor.config.MonsaEnvironment.smtpPort)
        assertTrue(id.makassar.monsalapor.config.MonsaEnvironment.firestoreDatabaseId(context).isNotEmpty())
    }
}
