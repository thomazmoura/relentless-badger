package com.relentlessbadger.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.relentlessbadger.app.BuildConfig

@Composable
fun SignInScreen(viewModel: AppViewModel) {
    val context = LocalContext.current
    var baseUrl by rememberSaveable { mutableStateOf(BuildConfig.API_BASE_URL) }
    // With a build-time URL the field is tucked behind "Advanced"; without one
    // the user has to enter it, so it starts visible.
    var showAdvanced by rememberSaveable { mutableStateOf(BuildConfig.API_BASE_URL.isBlank()) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Relentless Badger", style = MaterialTheme.typography.headlineMedium)
        Text(
            "The to-do list that won't shut up until you do the thing.",
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 8.dp),
        )

        Spacer(Modifier.height(32.dp))

        if (showAdvanced) {
            ServerUrlField(
                value = baseUrl,
                onValueChange = { baseUrl = it },
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(16.dp))
        }

        Button(
            onClick = { viewModel.signInWithGoogle(context, baseUrl) },
            enabled = !viewModel.busy && !viewModel.devLoginAvailable,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Continue with Google")
        }

        if (viewModel.devLoginAvailable) {
            Text(
                "Google Sign-In is not configured in this build " +
                    "(BADGER_GOOGLE_WEB_CLIENT_ID is empty).",
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 8.dp),
            )
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = { viewModel.signInAsDev(baseUrl) },
                enabled = !viewModel.busy,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Dev sign-in (server dev bypass)")
            }
        }

        if (BuildConfig.API_BASE_URL.isNotBlank()) {
            Spacer(Modifier.height(8.dp))
            TextButton(onClick = { showAdvanced = !showAdvanced }) {
                Text(if (showAdvanced) "Hide advanced" else "Advanced")
            }
        }

        if (viewModel.busy) {
            Spacer(Modifier.height(24.dp))
            CircularProgressIndicator()
        }

        viewModel.errorMessage?.let { message ->
            Spacer(Modifier.height(16.dp))
            Text(
                message,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
            )
        }
    }
}
