package com.relentlessbadger.app.data

import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit

/** Hands out the API implementation; fakeable in scenario tests. */
fun interface ApiProvider {
    suspend fun api(): BadgerApi
}

class ApiClient(private val session: SessionStore) : ApiProvider {

    private val json = Json {
        ignoreUnknownKeys = true
        // Always serialize every field. Without this, kotlinx omits values equal to
        // their declared default (e.g. waitMinutes=[60, 240], defaultWaitIndex=0),
        // so the server sees them as empty and rejects the settings PUT with a 400.
        encodeDefaults = true
    }

    private val okHttp = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            val token = session.cachedToken
            val request = if (token != null) {
                chain.request().newBuilder().header("Authorization", "Bearer $token").build()
            } else {
                chain.request()
            }
            chain.proceed(request)
        }
        .build()

    @Volatile private var cached: Pair<String, BadgerApi>? = null

    override suspend fun api(): BadgerApi {
        val baseUrl = session.current().baseUrl.trimEnd('/') + "/"
        cached?.let { (url, api) -> if (url == baseUrl) return api }
        val api = Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(okHttp)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(BadgerApi::class.java)
        cached = baseUrl to api
        return api
    }
}
