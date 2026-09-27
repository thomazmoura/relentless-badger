package com.relentlessbadger.app.ui

import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/** Server URL input shared by the sign-in and settings advanced sections. */
@Composable
fun ServerUrlField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val s = LocalStrings.current
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(s.serverUrl) },
        supportingText = { Text(s.serverUrlHint) },
        singleLine = true,
        modifier = modifier,
    )
}
