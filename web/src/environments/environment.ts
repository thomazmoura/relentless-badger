// Mirrors the Android BuildConfig fields (BADGER_API_BASE_URL / BADGER_GOOGLE_WEB_CLIENT_ID).
// An empty apiBaseUrl makes the sign-in screen show the server URL field; an empty
// googleWebClientId enables the dev sign-in button, exactly like the Android app does.
export const environment = {
  apiBaseUrl: 'https://localhost:5001',
  googleWebClientId: '',
};
