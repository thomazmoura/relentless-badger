import { Language } from '../domain/language';

/**
 * Every user-facing label, in each language the app speaks — the port of the
 * Android app's `ui/Strings.kt`, with the same keys, plus a few for things only
 * the browser has (notification permission, uploads, the clipboard).
 *
 * Kept as code rather than Angular's `$localize` because the language is an
 * in-app setting that switches at runtime, and because the formatters and the
 * notifications need it outside any template. Each entry holds both languages
 * side by side, so a label cannot be added in one and forgotten in the other.
 */
export function stringsFor(language: Language) {
  const t = (en: string, pt: string): string => (language === 'pt' ? pt : en);
  const monthsShort =
    language === 'pt'
      ? ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
      : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const notificationPrefix = t('Badger', 'Texugo');

  return {
    language,
    /** For Intl and the date picker. */
    locale: t('en-US', 'pt-BR'),

    // --- App ----------------------------------------------------------------

    appName: t('Relentless Badger', 'Texugo Insistente'),
    /** Heads each reminder: "Badger: water plants". */
    notificationPrefix,
    /** Heads a shared report. English keeps the one-word brand the exports always carried. */
    reportBrand: t('RelentlessBadger', 'Texugo Insistente'),
    tagline: t(
      "The to-do list that won't shut up until you do the thing.",
      'A lista de tarefas que não se cala até você fazer a coisa.',
    ),
    tabTasks: t('Tasks', 'Tarefas'),
    tabCalendar: t('Calendar', 'Calendário'),
    tabReports: t('Reports', 'Relatórios'),

    // --- Common -------------------------------------------------------------

    cancel: t('Cancel', 'Cancelar'),
    undo: t('Undo', 'Desfazer'),
    save: t('Save', 'Salvar'),
    setAction: t('Set', 'Definir'),
    back: t('Back', 'Voltar'),
    clear: t('Clear', 'Limpar'),
    advanced: t('Advanced', 'Avançado'),
    hideAdvanced: t('Hide advanced', 'Ocultar avançado'),
    unknown: t('unknown', 'desconhecido'),
    repeats: t('Repeats', 'Repete'),
    nothingOnThisDay: t('Nothing on this day.', 'Nada neste dia.'),

    // --- Notifications ------------------------------------------------------

    notificationTitle: (title: string) => `${notificationPrefix}: ${title}`,
    testNotificationText: t(
      'Test notification — reminders are working',
      'Notificação de teste — os lembretes estão funcionando',
    ),
    notificationDone: t('Done', 'Feito'),

    // --- Errors -------------------------------------------------------------

    enterServerUrl: t('Enter the server URL first.', 'Informe a URL do servidor primeiro.'),
    invalidServerUrl: t(
      "That doesn't look like a valid http(s) URL.",
      'Isso não parece uma URL http(s) válida.',
    ),
    pickStartForRepeating: t(
      'Pick a start time for a repeating task.',
      'Escolha um horário de início para uma tarefa repetida.',
    ),
    cannotReachServer: t(
      'Cannot reach the server. Check the URL and your network.',
      'Não foi possível acessar o servidor. Verifique a URL e sua rede.',
    ),
    sessionRejected: t(
      'Session rejected by the server. Try signing in again.',
      'Sessão recusada pelo servidor. Tente entrar novamente.',
    ),
    serverError: (code: number) => t(`Server error (${code}).`, `Erro do servidor (${code}).`),
    somethingWentWrong: t('Something went wrong.', 'Algo deu errado.'),

    // --- Sign-in ------------------------------------------------------------

    googleNotConfigured: t(
      'Google Sign-In is not configured in this build (googleWebClientId is empty).',
      'O login com o Google não está configurado nesta versão (googleWebClientId está vazio).',
    ),
    devSignIn: t(
      'Dev sign-in (server dev bypass)',
      'Login de desenvolvimento (bypass do servidor)',
    ),
    serverUrl: t('Server URL', 'URL do servidor'),
    serverUrlHint: t(
      'The machine on your network running the API',
      'A máquina na sua rede que executa a API',
    ),

    // --- Tasks --------------------------------------------------------------

    sync: t('Sync', 'Sincronizar'),
    settings: t('Settings', 'Configurações'),
    removedFromSuggestions: (title: string) =>
      t(`Removed "${title}" from suggestions`, `"${title}" removido das sugestões`),
    concludedDone: (title: string) => t(`Done "${title}"`, `Concluída: "${title}"`),
    concludedCancelled: (title: string) => t(`Cancelled "${title}"`, `Cancelada: "${title}"`),
    nothingPending: t('Nothing pending 🎉', 'Nada pendente 🎉'),
    nothingPendingHint: t(
      'Add something above and the badger starts crowing.',
      'Adicione algo acima e o texugo começa a insistir.',
    ),
    scheduledToday: t('Scheduled (Today)', 'Agendadas (Hoje)'),
    scheduledLater: t('Scheduled (Later)', 'Agendadas (Depois)'),
    quickAddPlaceholder: t('What needs doing right away?', 'O que precisa ser feito agora?'),
    setFirstReminderTime: t('Set first reminder time', 'Definir horário do primeiro lembrete'),
    setRecurrence: t('Set recurrence', 'Definir repetição'),
    addTask: t('Add task', 'Adicionar tarefa'),
    firstNag: (at: string) => t(`First nag ${at}`, `Primeiro aviso ${at}`),
    clearFirstReminderTime: t('Clear first reminder time', 'Limpar horário do primeiro lembrete'),
    clearRecurrence: t('Clear recurrence', 'Remover repetição'),
    removeSuggestion: (title: string) =>
      t(`Remove "${title}" from suggestions`, `Remover "${title}" das sugestões`),
    waitFor: (duration: string) => t(`Wait ${duration}`, `Esperar ${duration}`),
    waitForDuration: t('Wait for…', 'Esperar por…'),
    waitDurationHint: t('e.g. 27m or 15m 45s', 'ex.: 27m ou 15m 45s'),
    waitDurationInvalid: t(
      'Use hours, minutes and seconds, like 1h 20m',
      'Use horas, minutos e segundos, como 1h 20m',
    ),
    nextNagAt: (at: string) => t(`Next nag at ${at}`, `Próximo aviso em ${at}`),
    pickDateTime: t('Pick a date & time…', 'Escolher data e hora…'),
    starts: (at: string) => t(`starts ${at}`, `começa ${at}`),
    nextNag: (relative: string, intervalMinutes: number) =>
      t(
        `next nag ${relative} · every ${intervalMinutes} min`,
        `próximo aviso ${relative} · a cada ${intervalMinutes} min`,
      ),
    snooze: t('Snooze', 'Adiar'),
    startNaggingNow: t('Start nagging now', 'Começar a insistir agora'),
    markDone: t('Mark done', 'Marcar como feita'),
    donePreviously: t('Done previously', 'Feita antes'),
    cancelTask: t('Cancel task', 'Cancelar tarefa'),

    // --- Schedule dialogs ---------------------------------------------------

    repeatTitle: t('Repeat', 'Repetir'),
    repeatNone: t('None', 'Nenhuma'),
    repeatDaily: t('Daily', 'Diária'),
    repeatWeekly: t('Weekly', 'Semanal'),
    everyNDaysField: t('Every N days', 'A cada N dias'),
    everyNWeeksField: t('Every N weeks', 'A cada N semanas'),
    startsCapitalised: (at: string) => t(`Starts ${at}`, `Começa ${at}`),
    setStartTime: t('Set start time', 'Definir início'),
    clearStartTime: t('Clear start time', 'Limpar início'),
    doesNotRepeat: t('Does not repeat', 'Não se repete'),
    nagEveryNMinutes: t('Nag every N minutes', 'Insistir a cada N minutos'),
    repeatingNeedsStart: t(
      'A repeating task needs a start time.',
      'Uma tarefa repetida precisa de um horário de início.',
    ),

    // --- Formatting ---------------------------------------------------------

    /** "Sep 18" or "18 de set" — month is 1-based. */
    dayAndMonth: (day: number, month: number) =>
      t(`${monthsShort[month - 1]} ${day}`, `${day} de ${monthsShort[month - 1]}`),
    everyDay: t('every day', 'todo dia'),
    everyNDays: (n: number) => t(`every ${n} days`, `a cada ${n} dias`),
    everyWeek: t('every week', 'toda semana'),
    everyNWeeks: (n: number) => t(`every ${n} weeks`, `a cada ${n} semanas`),
    relativeNow: t('now', 'agora'),
    inMinutes: (n: number) => t(`in ${n} min`, `em ${n} min`),
    inHours: (n: number) => t(`in ${n} h`, `em ${n} h`),
    inDays: (n: number) => t(`in ${n} d`, `em ${n} d`),
    /** "45m", "4h", "1h 30m" — Portuguese spells minutes "min", as its clocks do. */
    duration: (minutes: number) => {
      const m = t('m', 'min');
      if (minutes < 60) return `${minutes}${m}`;
      if (minutes % 60 === 0) return `${Math.trunc(minutes / 60)}h`;
      return `${Math.trunc(minutes / 60)}h ${minutes % 60}${m}`;
    },

    // --- Calendar -----------------------------------------------------------

    previousMonth: t('Previous month', 'Mês anterior'),
    nextMonth: t('Next month', 'Próximo mês'),
    openDayOverview: t('Open day overview', 'Abrir resumo do dia'),
    showCancelled: t('Show cancelled', 'Mostrar canceladas'),
    entryCompleted: t('Completed', 'Concluída'),
    entryCancelled: t('Cancelled', 'Cancelada'),
    entryScheduled: t('Scheduled', 'Agendada'),
    doneAt: (at: string) => t(`done ${at}`, `feita ${at}`),
    cancelledAt: (at: string) => t(`cancelled ${at}`, `cancelada ${at}`),

    // --- Reports ------------------------------------------------------------

    reportToday: t('Today', 'Hoje'),
    reportRecurring: t('Recurring', 'Recorrentes'),
    reportSwitch: t('Report', 'Relatório'),
    showCompleted: t('Show completed', 'Mostrar concluídas'),
    sectionNow: t('Now', 'Agora'),
    sectionLater: t('Later today', 'Mais tarde hoje'),
    sectionScheduled: t('Scheduled', 'Agendadas'),
    sectionOverdue: t('Overdue', 'Atrasadas'),
    sectionDone: t('Done', 'Concluídas'),
    since: (at: string) => t(`since ${at}`, `desde ${at}`),
    wasDue: (at: string) => t(`was due ${at}`, `vencia ${at}`),
    share: (title: string) => t(`Share ${title}`, `Compartilhar ${title}`),
    copy: (title: string) => t(`Copy ${title}`, `Copiar ${title}`),
    copiedList: t('Copied the list', 'Lista copiada'),
    noRecurringTasks: t('No recurring tasks.', 'Nenhuma tarefa recorrente.'),
    nagging: t('Nagging', 'Insistindo'),
    cadenceDaily: t('Daily', 'Diárias'),
    cadenceWeekly: t('Weekly', 'Semanais'),
    cadenceEveryNDays: (n: number) => t(`Every ${n} days`, `A cada ${n} dias`),
    cadenceEveryNWeeks: (n: number) => t(`Every ${n} weeks`, `A cada ${n} semanas`),
    scheduleAt: (recurrence: string, time: string) =>
      t(`${recurrence} at ${time}`, `${recurrence} às ${time}`),
    nextAt: (at: string) => t(`next ${at}`, `próxima ${at}`),
    naggingSince: (at: string) => t(`nagging since ${at}`, `insistindo desde ${at}`),

    // --- Settings -----------------------------------------------------------

    fixHighlightedOrUndo: t(
      'Fix the highlighted values, or Undo them',
      'Corrija os valores destacados ou desfaça-os',
    ),
    applyAction: t('Apply', 'Aplicar'),
    defaultsIntro: t(
      'Defaults applied to every new task. Existing tasks keep the values they were created with.',
      'Padrões aplicados a cada nova tarefa. As tarefas existentes mantêm os valores com que foram criadas.',
    ),
    firstReminderAfter: t('First reminder after (minutes)', 'Primeiro lembrete após (minutos)'),
    thenNagEvery: t('Then nag every (minutes)', 'Depois insistir a cada (minutos)'),
    snoozeIntro: t(
      'Snooze options shown on tasks and reminders. Pick how far each pushes ' +
        "the next nag. The one marked default is the reminder's one-tap Wait button.",
      'Opções de adiamento mostradas nas tarefas e nos lembretes. Escolha quanto cada uma ' +
        'empurra o próximo aviso. A marcada como padrão é o botão Esperar do lembrete.',
    ),
    waitField: (index: number) => t(`Wait ${index} (minutes)`, `Espera ${index} (minutos)`),
    removeWait: (index: number) => t(`Remove wait ${index}`, `Remover espera ${index}`),
    addWait: t('Add wait', 'Adicionar espera'),
    languageLabel: t('Language', 'Idioma'),
    languageDeviceDefault: (name: string) =>
      t(`Device default (${name})`, `Padrão do aparelho (${name})`),
    signedInAs: (email: string) => t(`Signed in as ${email}`, `Conectado como ${email}`),
    signOut: t('Sign out', 'Sair'),
    changeServerUrl: t('Change server URL', 'Alterar URL do servidor'),
    sendTestNotification: t('Send test notification', 'Enviar notificação de teste'),
    noCrashes: t('No crashes recorded', 'Nenhuma falha registrada'),
    crashesRecorded: (count: number, latest: string) =>
      count === 1
        ? t(`1 crash recorded, latest ${latest}`, `1 falha registrada, a última em ${latest}`)
        : t(
            `${count} crashes recorded, latest ${latest}`,
            `${count} falhas registradas, a última em ${latest}`,
          ),
    shareCrashLog: t('Share crash log', 'Compartilhar registro de falhas'),
    clearCrashLog: t('Clear crash log', 'Limpar registro de falhas'),
    clearCrashLogTitle: t('Clear crash log?', 'Limpar registro de falhas?'),
    clearCrashLogBody: t(
      "Recorded crashes are deleted from this device. Share them first if they're still needed.",
      'As falhas registradas são apagadas deste aparelho. Compartilhe-as antes se ainda forem necessárias.',
    ),
    changeServerTitle: t('Change server?', 'Trocar de servidor?'),
    changeServerBody: t(
      'Your current session may be rejected by the new server, and you ' +
        'may need to sign in again. Your tasks stay on this device ' +
        'and will sync to the new server.',
      'Sua sessão atual pode ser recusada pelo novo servidor, e talvez você ' +
        'precise entrar novamente. Suas tarefas ficam neste aparelho ' +
        'e serão sincronizadas com o novo servidor.',
    ),
    changeServer: t('Change server', 'Trocar servidor'),

    // --- Notification sound -------------------------------------------------

    notificationSound: t('Notification sound', 'Som da notificação'),
    builtInSoundsCredit: t(
      'Built-in sounds: Google Material, CC-BY 4.0',
      'Sons incluídos: Google Material, CC-BY 4.0',
    ),
    soundSilent: t('Silent', 'Silencioso'),
    soundSystemDefault: t('System default', 'Padrão do sistema'),
    /** Built-in sounds by storage key; keys never change, names may. */
    builtInSoundName: (key: string): string => {
      switch (key) {
        case 'simple-01':
          return t('Simple', 'Simples');
        case 'simple-02':
          return t('Simple 2', 'Simples 2');
        case 'decorative-01':
          return t('Decorative', 'Decorativo');
        case 'decorative-02':
          return t('Decorative 2', 'Decorativo 2');
        case 'ambient':
          return t('Ambient', 'Ambiente');
        case 'high-intensity':
          return t('Urgent', 'Urgente');
        default:
          return key;
      }
    },

    // --- Web only -----------------------------------------------------------

    notificationsBlocked: t(
      'Notifications are blocked, so this badger can only nag you while the app is open.',
      'As notificações estão bloqueadas, então este texugo só consegue insistir com o app aberto.',
    ),
    allowNotificationsHint: t(
      'Allow notifications and install the app to get nagged even when this tab is in the background.',
      'Permita notificações e instale o app para receber avisos mesmo com esta aba em segundo plano.',
    ),
    allowNotifications: t('Allow notifications', 'Permitir notificações'),
    firstReminder: t('First reminder', 'Primeiro lembrete'),
    startTime: t('Start time', 'Horário de início'),
    date: t('Date', 'Data'),
    time: t('Time', 'Hora'),
    atLeastOneMinute: t('At least 1 minute.', 'Pelo menos 1 minuto.'),
    atLeastOne: t('At least 1.', 'Pelo menos 1.'),
    sharingUnavailable: t(
      'Sharing is not available here — copied instead',
      'Compartilhar não está disponível aqui — a lista foi copiada',
    ),
    couldNotShare: t('Could not share the list', 'Não foi possível compartilhar a lista'),
    couldNotCopy: t(
      'Could not copy to the clipboard',
      'Não foi possível copiar para a área de transferência',
    ),
    useWaitAsDefault: (index: number) =>
      t(`Use wait ${index} as the default`, `Usar a espera ${index} como padrão`),
    uploadSound: t('Upload your own…', 'Enviar o seu…'),
    playNotificationSound: t('Play notification sound', 'Tocar som da notificação'),
    serverUrlHintShort: t('The machine running the API', 'A máquina que executa a API'),
    couldNotPlaySound: t(
      'This browser could not play that sound',
      'Este navegador não conseguiu tocar esse som',
    ),
    soundTooBig: t(
      'That sound is too big — pick one under 500 KB',
      'Esse som é grande demais — escolha um com menos de 500 KB',
    ),
    notASound: t(
      'That file is not a sound this browser can play',
      'Esse arquivo não é um som que este navegador consiga tocar',
    ),
  };
}

export type Strings = ReturnType<typeof stringsFor>;

export const ENGLISH: Strings = stringsFor('en');
export const PORTUGUESE: Strings = stringsFor('pt');

export function stringsOf(language: Language): Strings {
  return language === 'pt' ? PORTUGUESE : ENGLISH;
}
