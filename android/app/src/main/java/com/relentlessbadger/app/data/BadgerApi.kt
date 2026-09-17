package com.relentlessbadger.app.data

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

interface BadgerApi {
    @POST("auth/google")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    @GET("me/settings")
    suspend fun getSettings(): SettingsDto

    @PUT("me/settings")
    suspend fun updateSettings(@Body settings: SettingsDto): SettingsDto

    @GET("tasks")
    suspend fun getTasks(@Query("status") status: String = "open"): List<TaskDto>

    @POST("tasks")
    suspend fun createTask(@Body request: CreateTaskRequest): TaskDto

    @PUT("tasks/{id}/schedule")
    suspend fun updateTaskSchedule(
        @Path("id") id: String,
        @Body request: UpdateTaskScheduleRequest,
    ): TaskDto

    @POST("tasks/{id}/complete")
    suspend fun completeTask(
        @Path("id") id: String,
        @Body request: CompleteTaskRequest,
    ): TaskDto

    /** Undo: the server drops the completion and lists the task as open again. */
    @POST("tasks/{id}/reopen")
    suspend fun reopenTask(@Path("id") id: String): TaskDto

    @DELETE("tasks/{id}")
    suspend fun deleteTask(@Path("id") id: String): Response<Unit>

    @GET("tasks/titles")
    suspend fun getTitles(): List<String>
}
