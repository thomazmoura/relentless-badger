package com.relentlessbadger.app.ui

import androidx.compose.runtime.staticCompositionLocalOf
import com.relentlessbadger.app.data.Language
import java.util.Locale

/**
 * Every user-facing label, in each language the app speaks. The web client's
 * `core/i18n/strings.ts` is the same table, key for key, so the two read alike.
 *
 * Kept as code rather than `strings.xml` because the language is an in-app
 * setting that switches at runtime, and because the formatters and the
 * notifications need it outside any Android resource context. Each entry holds
 * both languages side by side, so a label cannot be added in one and forgotten
 * in the other.
 */
class Strings private constructor(val language: Language) {

    private fun t(en: String, pt: String): String = if (language == Language.Portuguese) pt else en

    /** For the pickers and weekday names the platform renders. */
    val locale: Locale = if (language == Language.Portuguese) Locale.forLanguageTag("pt-BR") else Locale.ENGLISH

    // --- App ------------------------------------------------------------------

    val appName get() = t("Relentless Badger", "Texugo Insistente")

    /** Heads each reminder: "Badger: water plants". */
    val notificationPrefix get() = t("Badger", "Texugo")

    /** Heads a shared report. English keeps the one-word brand the exports always carried. */
    val reportBrand get() = t("RelentlessBadger", "Texugo Insistente")
    val tagline get() = t(
        "The to-do list that won't shut up until you do the thing.",
        "A lista de tarefas que não se cala até você fazer a coisa.",
    )
    val tabTasks get() = t("Tasks", "Tarefas")
    val tabCalendar get() = t("Calendar", "Calendário")
    val tabReports get() = t("Reports", "Relatórios")

    // --- Common ---------------------------------------------------------------

    val cancel get() = t("Cancel", "Cancelar")
    val undo get() = t("Undo", "Desfazer")
    val save get() = t("Save", "Salvar")
    val setAction get() = t("Set", "Definir")
    val next get() = t("Next", "Próximo")
    val ok get() = t("OK", "OK")
    val back get() = t("Back", "Voltar")
    val clear get() = t("Clear", "Limpar")
    val advanced get() = t("Advanced", "Avançado")
    val hideAdvanced get() = t("Hide advanced", "Ocultar avançado")
    val unknown get() = t("unknown", "desconhecido")
    val repeats get() = t("Repeats", "Repete")
    val nothingOnThisDay get() = t("Nothing on this day.", "Nada neste dia.")

    // --- Notifications --------------------------------------------------------

    fun notificationTitle(title: String) = "$notificationPrefix: $title"
    val testNotificationText get() = t(
        "Test notification — reminders are working",
        "Notificação de teste — os lembretes estão funcionando",
    )
    val notificationDone get() = t("Done", "Feito")
    val notificationOther get() = t("Other…", "Outro…")

    // --- Errors ---------------------------------------------------------------

    val enterServerUrl get() = t("Enter the server URL first.", "Informe a URL do servidor primeiro.")
    val invalidServerUrl get() = t(
        "That doesn't look like a valid http(s) URL.",
        "Isso não parece uma URL http(s) válida.",
    )
    val pickStartForRepeating get() = t(
        "Pick a start time for a repeating task.",
        "Escolha um horário de início para uma tarefa repetida.",
    )
    val cannotReachServer get() = t(
        "Cannot reach the server. Check the URL and your network.",
        "Não foi possível acessar o servidor. Verifique a URL e sua rede.",
    )
    val sessionRejected get() = t(
        "Session rejected by the server. Try signing in again.",
        "Sessão recusada pelo servidor. Tente entrar novamente.",
    )
    fun serverError(code: Int) = t("Server error ($code).", "Erro do servidor ($code).")
    val somethingWentWrong get() = t("Something went wrong.", "Algo deu errado.")

    // --- Sign-in --------------------------------------------------------------

    val continueWithGoogle get() = t("Continue with Google", "Continuar com o Google")
    val googleNotConfigured get() = t(
        "Google Sign-In is not configured in this build (BADGER_GOOGLE_WEB_CLIENT_ID is empty).",
        "O login com o Google não está configurado nesta versão (BADGER_GOOGLE_WEB_CLIENT_ID está vazio).",
    )
    val devSignIn get() = t("Dev sign-in (server dev bypass)", "Login de desenvolvimento (bypass do servidor)")
    val serverUrl get() = t("Server URL", "URL do servidor")
    val serverUrlHint get() = t(
        "The machine on your network running the API",
        "A máquina na sua rede que executa a API",
    )

    // --- Tasks ----------------------------------------------------------------

    val sync get() = t("Sync", "Sincronizar")
    val settings get() = t("Settings", "Configurações")
    fun removedFromSuggestions(title: String) =
        t("Removed \"$title\" from suggestions", "\"$title\" removido das sugestões")
    fun concludedDone(title: String) = t("Done \"$title\"", "Concluída: \"$title\"")
    fun concludedCancelled(title: String) = t("Cancelled \"$title\"", "Cancelada: \"$title\"")
    val exactAlarmsDisabled get() = t(
        "Exact alarms are disabled, so reminders may arrive late.",
        "Os alarmes exatos estão desativados, então os lembretes podem atrasar.",
    )
    val allowExactAlarms get() = t("Allow exact alarms", "Permitir alarmes exatos")
    fun remindersPausedUntil(at: String) = t("Reminders paused until $at", "Lembretes pausados até $at")
    val resume get() = t("Resume", "Retomar")
    val nothingPending get() = t("Nothing pending 🎉", "Nada pendente 🎉")
    val nothingPendingHint get() = t(
        "Add something above and the badger starts crowing.",
        "Adicione algo acima e o texugo começa a insistir.",
    )
    val scheduledToday get() = t("Scheduled (Today)", "Agendadas (Hoje)")
    val scheduledLater get() = t("Scheduled (Later)", "Agendadas (Depois)")
    val remindersPaused get() = t("Reminders paused", "Lembretes pausados")
    val pauseReminders get() = t("Pause reminders", "Pausar lembretes")
    fun pausedUntil(at: String) = t("Paused until $at", "Pausado até $at")
    val resumeNow get() = t("Resume now", "Retomar agora")
    fun pauseFor(duration: String) = t("Pause for $duration", "Pausar por $duration")
    val pauseUntilDateTime get() = t("Pause until a date & time…", "Pausar até uma data e hora…")
    val quickAddPlaceholder get() = t("What needs doing right away?", "O que precisa ser feito agora?")
    val setFirstReminderTime get() = t("Set first reminder time", "Definir horário do primeiro lembrete")
    val setRecurrence get() = t("Set recurrence", "Definir repetição")
    val addTask get() = t("Add task", "Adicionar tarefa")
    fun firstNag(at: String) = t("First nag $at", "Primeiro aviso $at")
    val clearFirstReminderTime get() = t("Clear first reminder time", "Limpar horário do primeiro lembrete")
    val clearRecurrence get() = t("Clear recurrence", "Remover repetição")
    fun removeSuggestion(title: String) =
        t("Remove \"$title\" from suggestions", "Remover \"$title\" das sugestões")
    fun waitFor(duration: String) = t("Wait $duration", "Esperar $duration")
    val waitForDuration get() = t("Wait for…", "Esperar por…")
    val waitDurationHint get() = t("e.g. 27m or 15m 45s", "ex.: 27m ou 15m 45s")
    val waitDurationInvalid get() = t(
        "Use hours, minutes and seconds, like 1h 20m",
        "Use horas, minutos e segundos, como 1h 20m",
    )
    fun nextNagAt(at: String) = t("Next nag at $at", "Próximo aviso em $at")
    val pickDateTime get() = t("Pick a date & time…", "Escolher data e hora…")
    fun starts(at: String) = t("starts $at", "começa $at")
    fun nextNag(relative: String, intervalMinutes: Int) = t(
        "next nag $relative · every $intervalMinutes min",
        "próximo aviso $relative · a cada $intervalMinutes min",
    )
    val snooze get() = t("Snooze", "Adiar")
    val startNaggingNow get() = t("Start nagging now", "Começar a insistir agora")
    val markDone get() = t("Mark done", "Marcar como feita")
    val otherWaysToClose get() = t("Other ways to close this task", "Outras formas de encerrar esta tarefa")
    val donePreviously get() = t("Done previously", "Feita antes")
    val cancelTask get() = t("Cancel task", "Cancelar tarefa")

    // --- Schedule dialogs -----------------------------------------------------

    val repeatTitle get() = t("Repeat", "Repetir")
    val repeatNone get() = t("None", "Nenhuma")
    val repeatDaily get() = t("Daily", "Diária")
    val repeatWeekly get() = t("Weekly", "Semanal")
    val everyNDaysField get() = t("Every N days", "A cada N dias")
    val everyNWeeksField get() = t("Every N weeks", "A cada N semanas")
    fun startsCapitalised(at: String) = t("Starts $at", "Começa $at")
    val setStartTime get() = t("Set start time", "Definir início")
    val clearStartTime get() = t("Clear start time", "Limpar início")
    val doesNotRepeat get() = t("Does not repeat", "Não se repete")
    val nagEveryNMinutes get() = t("Nag every N minutes", "Insistir a cada N minutos")
    val repeatingNeedsStart get() = t(
        "A repeating task needs a start time.",
        "Uma tarefa repetida precisa de um horário de início.",
    )

    // --- Formatting -----------------------------------------------------------

    val everyDay get() = t("every day", "todo dia")
    fun everyNDays(n: Int) = t("every $n days", "a cada $n dias")
    val everyWeek get() = t("every week", "toda semana")
    fun everyNWeeks(n: Int) = t("every $n weeks", "a cada $n semanas")
    private val monthsShort get() = if (language == Language.Portuguese) {
        listOf("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez")
    } else {
        listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
    }

    /** "Sep 18" or "18 de set" — [month] is 1-based. */
    fun dayAndMonth(day: Int, month: Int): String = t(
        "${monthsShort[month - 1]} $day",
        "$day de ${monthsShort[month - 1]}",
    )

    val relativeNow get() = t("now", "agora")
    fun inMinutes(n: Long) = t("in $n min", "em $n min")
    fun inHours(n: Long) = t("in $n h", "em $n h")
    fun inDays(n: Long) = t("in $n d", "em $n d")

    /** "45m", "4h", "1h 30m" — Portuguese spells minutes "min", as its clocks do. */
    fun duration(minutes: Int): String {
        val m = t("m", "min")
        return when {
            minutes < 60 -> "$minutes$m"
            minutes % 60 == 0 -> "${minutes / 60}h"
            else -> "${minutes / 60}h ${minutes % 60}$m"
        }
    }

    // --- Calendar -------------------------------------------------------------

    /** DateTimeFormatter pattern for a month heading; the web spells the same with Intl. */
    val monthTitlePattern get() = t("MMMM yyyy", "LLLL 'de' yyyy")
    val previousMonth get() = t("Previous month", "Mês anterior")
    val nextMonth get() = t("Next month", "Próximo mês")
    val openDayOverview get() = t("Open day overview", "Abrir resumo do dia")
    val showCancelled get() = t("Show cancelled", "Mostrar canceladas")
    val entryCompleted get() = t("Completed", "Concluída")
    val entryCancelled get() = t("Cancelled", "Cancelada")
    val entryScheduled get() = t("Scheduled", "Agendada")
    fun doneAt(at: String) = t("done $at", "feita $at")
    fun cancelledAt(at: String) = t("cancelled $at", "cancelada $at")

    // --- Reports --------------------------------------------------------------

    val reportToday get() = t("Today", "Hoje")
    val reportRecurring get() = t("Recurring", "Recorrentes")
    val showCompleted get() = t("Show completed", "Mostrar concluídas")
    val sectionNow get() = t("Now", "Agora")
    val sectionLater get() = t("Later today", "Mais tarde hoje")
    val sectionScheduled get() = t("Scheduled", "Agendadas")
    val sectionOverdue get() = t("Overdue", "Atrasadas")
    val sectionDone get() = t("Done", "Concluídas")
    fun since(at: String) = t("since $at", "desde $at")
    fun wasDue(at: String) = t("was due $at", "vencia $at")
    fun share(title: String) = t("Share $title", "Compartilhar $title")
    fun copy(title: String) = t("Copy $title", "Copiar $title")
    val copiedList get() = t("Copied the list", "Lista copiada")
    val noRecurringTasks get() = t("No recurring tasks.", "Nenhuma tarefa recorrente.")
    val nagging get() = t("Nagging", "Insistindo")
    val cadenceDaily get() = t("Daily", "Diárias")
    val cadenceWeekly get() = t("Weekly", "Semanais")
    fun cadenceEveryNDays(n: Int) = t("Every $n days", "A cada $n dias")
    fun cadenceEveryNWeeks(n: Int) = t("Every $n weeks", "A cada $n semanas")
    fun scheduleAt(recurrence: String, time: String) = t("$recurrence at $time", "$recurrence às $time")
    fun nextAt(at: String) = t("next $at", "próxima $at")
    fun naggingSince(at: String) = t("nagging since $at", "insistindo desde $at")

    // --- Settings -------------------------------------------------------------

    val fixHighlightedOrUndo get() = t(
        "Fix the highlighted values, or Undo them",
        "Corrija os valores destacados ou desfaça-os",
    )
    val fixHighlightedFirst get() = t("Fix the highlighted values first", "Corrija os valores destacados primeiro")
    val applyAction get() = t("Apply", "Aplicar")
    val defaultsIntro get() = t(
        "Defaults applied to every new task. Existing tasks keep the values they were created with.",
        "Padrões aplicados a cada nova tarefa. As tarefas existentes mantêm os valores com que foram criadas.",
    )
    val firstReminderAfter get() = t("First reminder after (minutes)", "Primeiro lembrete após (minutos)")
    val thenNagEvery get() = t("Then nag every (minutes)", "Depois insistir a cada (minutos)")
    val snoozeIntro get() = t(
        "Snooze options shown on tasks and reminders. Pick how far each pushes " +
            "the next nag. The one marked default is the reminder's one-tap Wait button.",
        "Opções de adiamento mostradas nas tarefas e nos lembretes. Escolha quanto cada uma " +
            "empurra o próximo aviso. A marcada como padrão é o botão Esperar do lembrete.",
    )
    fun waitField(index: Int) = t("Wait $index (minutes)", "Espera $index (minutos)")
    fun removeWait(index: Int) = t("Remove wait $index", "Remover espera $index")
    val addWait get() = t("Add wait", "Adicionar espera")
    val gapIntro get() = t(
        "Reminders that come due together would stack up and hide each other, " +
            "so they are spread out instead. None are skipped — a reminder that " +
            "lands too soon just waits its turn. Use 0 to let them arrive together.",
        "Lembretes que vencem juntos se empilhariam e esconderiam uns aos outros, " +
            "então eles são espaçados. Nenhum é pulado — um lembrete que chega cedo " +
            "demais só espera a sua vez. Use 0 para deixá-los chegar juntos.",
    )
    val minSecondsBetween get() = t("Minimum seconds between notifications", "Mínimo de segundos entre notificações")
    val languageLabel get() = t("Language", "Idioma")
    fun languageDeviceDefault(name: String) = t("Device default ($name)", "Padrão do aparelho ($name)")
    val quietHours get() = t("Quiet hours", "Horário de silêncio")
    val quietHoursIntro get() = t(
        "Reminders that come due inside these hours arrive when they end. " +
            "Nothing is skipped, and tasks keep the times they were given.",
        "Lembretes que vencem dentro desse horário chegam quando ele termina. " +
            "Nada é pulado, e as tarefas mantêm os horários definidos.",
    )
    val rangeTo get() = t("to", "até")
    fun removeQuietHours(index: Int) = t("Remove quiet hours $index", "Remover horário de silêncio $index")
    val addQuietHours get() = t("Add quiet hours", "Adicionar horário de silêncio")
    val addRangeOrSwitchOff get() = t(
        "Add a range, or switch quiet hours off.",
        "Adicione um intervalo ou desative o horário de silêncio.",
    )
    fun signedInAs(email: String) = t("Signed in as $email", "Conectado como $email")
    val signOut get() = t("Sign out", "Sair")
    val changeServerUrl get() = t("Change server URL", "Alterar URL do servidor")
    val sendTestNotification get() = t("Send test notification", "Enviar notificação de teste")
    val noCrashes get() = t("No crashes recorded", "Nenhuma falha registrada")
    fun crashesRecorded(count: Int, latest: String) = if (count == 1) {
        t("1 crash recorded, latest $latest", "1 falha registrada, a última em $latest")
    } else {
        t("$count crashes recorded, latest $latest", "$count falhas registradas, a última em $latest")
    }
    val shareCrashLog get() = t("Share crash log", "Compartilhar registro de falhas")
    val clearCrashLog get() = t("Clear crash log", "Limpar registro de falhas")
    val clearCrashLogTitle get() = t("Clear crash log?", "Limpar registro de falhas?")
    val clearCrashLogBody get() = t(
        "Recorded crashes are deleted from this device. Share them first if they're still needed.",
        "As falhas registradas são apagadas deste aparelho. Compartilhe-as antes se ainda forem necessárias.",
    )
    val changeServerTitle get() = t("Change server?", "Trocar de servidor?")
    val changeServerBody get() = t(
        "Your current session may be rejected by the new server, and you " +
            "may need to sign in again. Your tasks stay on this device " +
            "and will sync to the new server.",
        "Sua sessão atual pode ser recusada pelo novo servidor, e talvez você " +
            "precise entrar novamente. Suas tarefas ficam neste aparelho " +
            "e serão sincronizadas com o novo servidor.",
    )
    val changeServer get() = t("Change server", "Trocar servidor")

    // --- Notification sound ---------------------------------------------------

    val notificationSound get() = t("Notification sound", "Som da notificação")
    val builtInSoundsCredit get() = t(
        "Built-in sounds: Google Material, CC-BY 4.0",
        "Sons incluídos: Google Material, CC-BY 4.0",
    )
    val playAs get() = t("Play as", "Tocar como")
    val streamNotification get() = t("Notification", "Notificação")
    val streamAlarm get() = t("Alarm", "Alarme")
    val streamMedia get() = t("Media", "Mídia")
    val streamNotificationHint get() = t(
        "Follows the notification volume, so vibrate or silent mode mutes it.",
        "Segue o volume das notificações, então o modo vibrar ou silencioso o silencia.",
    )
    val streamAlarmHint get() = t(
        "Follows the alarm volume and sounds even on vibrate or silent. " +
            "Plays on the speaker even with headphones connected.",
        "Segue o volume do alarme e toca mesmo no modo vibrar ou silencioso. " +
            "Toca no alto-falante mesmo com fones conectados.",
    )
    val streamMediaHint get() = t(
        "Follows the media volume and sounds even on vibrate or silent. " +
            "Stays in the headphones when they're connected.",
        "Segue o volume de mídia e toca mesmo no modo vibrar ou silencioso. " +
            "Fica nos fones quando eles estão conectados.",
    )
    val chooseFromDevice get() = t("Choose from device…", "Escolher do aparelho…")
    val soundSilent get() = t("Silent", "Silencioso")
    val soundSystemDefault get() = t("System default", "Padrão do sistema")
    val customSound get() = t("Custom sound", "Som personalizado")

    /** Built-in sounds by storage key; keys never change, names may. */
    fun builtInSoundName(key: String): String = when (key) {
        "simple-01" -> t("Simple", "Simples")
        "simple-02" -> t("Simple 2", "Simples 2")
        "decorative-01" -> t("Decorative", "Decorativo")
        "decorative-02" -> t("Decorative 2", "Decorativo 2")
        "ambient" -> t("Ambient", "Ambiente")
        "high-intensity" -> t("Urgent", "Urgente")
        else -> key
    }

    companion object {
        val English = Strings(Language.English)
        val Portuguese = Strings(Language.Portuguese)

        fun of(language: Language): Strings = when (language) {
            Language.English -> English
            Language.Portuguese -> Portuguese
        }
    }
}

/** The table for the language the user picked, provided at the root of the UI. */
val LocalStrings = staticCompositionLocalOf { Strings.English }
