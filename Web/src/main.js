import { OrbitCloud } from './cloud-sync.js';
import { ORBIT_CLOUD_CONFIG } from './cloud-config.js';
import { invoke, isTauri, isPermissionGranted, requestPermission, sendNotification, open, openUrl, enableAutostart, disableAutostart, autostartIsEnabled } from './native-bridge.js';

const $ = (id) => document.getElementById(id);
const KEYS = {
  tasks: 'orbit2_tasks_v1', presets: 'orbit2_presets_v1',
  settings: 'orbit21_settings_v1', profile: 'orbit21_local_profile',
  remembered: 'orbit21_remembered', timers: 'orbit28_timers_v1', newsCache: 'orbit28_news_cache_v1'
};
let voiceLastError = '';
let neuralSpeaking = false;
let neuralAudio = null;
let azureConfigured = false;
let azureRegionSaved = '';
const defaults = { language: 'en', voiceURI: '', rate: 0.92, pitch: 0.95, voiceVolume: 0.35, speakReminders: true, voiceEngine: 'system', city: null, closeToTray: false, accentColor: 'blue', surfaceStyle: 'glass', compactMode: false, showQuickWeb: true };
function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } }
let tasks = read(KEYS.tasks, []);
let presets = read(KEYS.presets, []);
let settings = { ...defaults, ...read(KEYS.settings, {}) };
const accents = new Set(['blue', 'purple', 'teal', 'amber', 'rose']);
const surfaces = new Set(['classic', 'glass', 'flat']);
let profile = read(KEYS.profile, null);
let selectedDays = [1, 2, 3, 4, 5];
let editTaskId = null;
let editPresetIndex = null;
let selectedPaths = [];
let installedApps = [];
let weatherData = null;
let activePage = 'dashboard';
let toastTimeout;
const dayIds = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEB_LINKS = Object.freeze([
  { id: 'gmail', title: 'Gmail', url: 'https://mail.google.com/' },
  { id: 'yahoo', title: 'Yahoo', url: 'https://www.yahoo.com/' },
  { id: 'youtube', title: 'YouTube', url: 'https://www.youtube.com/' },
  { id: 'whatsapp', title: 'WhatsApp', url: 'https://web.whatsapp.com/' },
  { id: 'chatgpt', title: 'ChatGPT', url: 'https://chatgpt.com/' },
]);

const i18n = {
  en: {
    welcome: 'Welcome to Orbit.', localProfileIntro: 'Create your local profile to personalize this PC.', username: 'Username', password: 'Password', confirmPassword: 'Confirm password', rememberMe: 'Remember me on this computer', createProfile: 'Create profile', signIn: 'Sign in', authNotice: 'Local convenience lock only. No cloud account or encryption of reminders. Do not use a sensitive password.',
    workspace: 'WORKSPACE', dashboard: 'Dashboard', reminders: 'Reminders', presets: 'Presets', weather: 'Weather', settings: 'Settings', desktopReady: 'Desktop online', yourDay: 'Your space, your day.', systemReady: 'SYSTEM READY',
    addReminder: 'Add reminder', hearOrbit: 'Hear Orbit', upNext: 'Up next', viewAll: 'View all →', details: 'Details →', liveWeather: 'Live weather', manage: 'Manage →', quickLaunch: 'Quick launch',
    localOnly: 'On this PC', taskName: 'Reminder', taskPlaceholder: 'What do you need to do?', dateAndTime: 'Date and time', repeat: 'Repeat', once: 'Does not repeat', daily: 'Every day', weekdays: 'Weekdays', customDays: 'Select days', cancel: 'Cancel', quickActions: 'Quick actions', tasksLocal: 'Your reminders stay on this PC. Export a backup whenever you like.', enableNotifications: 'Enable notifications', notificationsEnabled: 'Notifications enabled', clearCompleted: 'Clear completed', exportBackup: 'Export backup', reminderNotice: 'Orbit checks reminders while the app is running. Notifications are not guaranteed when Windows is shut down or the app is suspended.', yourReminders: 'Your reminders',
    createPreset: 'Create a preset', presetName: 'Preset name', selectedApps: 'Selected applications', browseApps: 'Browse files…', findInstalled: 'Find installed apps', searchApps: 'Search Start Menu shortcuts', searchAppsPlaceholder: 'Steam, Discord, Minecraft…', savePreset: 'Save preset', yourPresets: 'Your presets', presetHint: 'Pick installed shortcuts or browse for .exe/.lnk files. No manual paths needed.',
    chooseCity: 'Choose a city', cityPlaceholder: 'Search any city worldwide', search: 'Search', cityHint: 'Select a city from the results to save it as your default.', currentWeather: 'Current conditions', refresh: 'Refresh', weatherInternet: 'Requires internet.',
    preferences: 'Preferences', language: 'Language', voice: 'Orbit voice', speakingSpeed: 'Speaking speed', voicePitch: 'Voice pitch', speakReminders: 'Read reminders aloud', testVoice: 'Test voice', reloadVoices: 'Refresh voice list', voiceNote: 'Windows voices work offline. Optional online neural speech requires your own Azure Speech configuration.', profileAndApp: 'Profile & app', deviceProfile: 'Local profile on this Windows device', startWindows: 'Launch Orbit when Windows starts', startupNote: 'Optional. Best tested with the installed release, not development mode.', closeToTray: 'Close window to system tray', trayNote: 'When enabled, use the tray menu to quit Orbit. Reminders still depend on the app running.', signOut: 'Sign out', forgetSignIn: 'Forget automatic sign-in', profileNotice: 'This is a local profile, not cloud authentication. Passwords are hashed, but locally stored reminders are not encrypted.', footerTag: 'Built to keep things simple.',
    greeting: 'Welcome back', noTasks: 'Nothing scheduled right now.', upcomingNone: 'No upcoming reminders.', noReminders: 'No reminders yet.', noPresets: 'No presets yet. Create one to launch your apps together.', noApps: 'No applications selected.', noQuickPresets: 'Your saved application profiles will appear here.', noWeather: 'Search for a city to begin.', chooseWeather: 'Search for a location to see current conditions.', nextReminder: 'Next reminder', overdue: 'Overdue', everyDay: 'Every day', workdays: 'Weekdays', every: 'Every', onceLabel: 'Once', edit: 'Edit', delete: 'Delete', launch: 'Launch', saveChanges: 'Save changes', editReminder: 'Edit reminder', editPreset: 'Edit preset', complete: 'Mark completed', appAdded: 'Application added.', alreadyAdded: 'Already in this preset.', browseUnsupported: 'File picker works in the Windows desktop application.', noInstalled: 'No matching Start Menu shortcuts found. Use Browse files instead.', loadingApps: 'Looking for installed shortcuts…', chooseApps: 'Choose one or more apps from the list below.', removed: 'Removed.', saved: 'Saved.', deleted: 'Deleted.', emptyCity: 'Type a city name to search.', lookingCity: 'Searching locations…', noCity: 'No matching cities. Try a more specific name.', loadingWeather: 'Loading live weather…', weatherFailed: 'Could not load weather. Check your internet connection and try again.', refreshed: 'Updated', feelsLike: 'Feels like', wind: 'Wind', humidity: 'Humidity',
    clearConfirm: 'Remove all completed reminders?', deleteConfirm: 'Delete this item?', setDay: 'Select at least one repeat day.', pastDate: 'Choose a time in the future.', taskSaved: 'Reminder saved.', resetHint: 'Changes are stored locally.', permissionNeeded: 'Notification permission is not granted.', notificationActive: 'Notifications are enabled.', testPhrase: 'Orbit is online. Systems ready.', reminderPrefix: 'Reminder.', cannotSpeak: 'Windows speech is unavailable here.', noVoices: 'System default', voiceUpdated: 'Voice settings updated.',
    authFailed: 'Incorrect password.', authNeedsUser: 'Enter a username (at least two characters).', authShortPassword: 'Use a password of at least eight characters.', authMismatch: 'Passwords do not match.', authError: 'Could not create or open profile.', enterPassword: 'Enter your password.', citySelected: 'Location saved.', presetRequired: 'Add at least one application first.', launching: 'Launching applications…', launched: 'Launched', apps: 'apps', startupUnavailable: 'Windows startup is available only in the installed desktop app.', startupFailed: 'Could not change startup setting.', trayUnavailable: 'Tray setting is available only in the desktop app.', signedOut: 'Signed out.', weatherClear: 'Clear', weatherMainlyClear: 'Mainly clear', weatherCloudy: 'Cloudy', weatherFog: 'Fog', weatherDrizzle: 'Drizzle', weatherRain: 'Rain', weatherSnow: 'Snow', weatherShowers: 'Showers', weatherStorm: 'Thunderstorm', weatherUnknown: 'Variable conditions',
    today: 'Today', tomorrow: 'Tomorrow', nextWeek: 'Next week', time: 'Time', sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat',
  },
  ro: {
    welcome: 'Bun venit în Orbit.', localProfileIntro: 'Creează un profil local pentru acest PC.', username: 'Nume de utilizator', password: 'Parolă', confirmPassword: 'Confirmă parola', rememberMe: 'Ține-mă minte pe acest computer', createProfile: 'Creează profilul', signIn: 'Autentificare', authNotice: 'Blocare locală pentru confort, nu cont cloud. Mementourile nu sunt criptate. Nu folosi o parolă sensibilă.',
    workspace: 'SPAȚIU DE LUCRU', dashboard: 'Panou principal', reminders: 'Mementouri', presets: 'Profiluri rapide', weather: 'Vreme', settings: 'Setări', desktopReady: 'Aplicație activă', yourDay: 'Spațiul tău, ziua ta.', systemReady: 'SISTEM PREGĂTIT',
    addReminder: 'Adaugă memento', hearOrbit: 'Ascultă Orbit', upNext: 'În continuare', viewAll: 'Vezi tot →', details: 'Detalii →', liveWeather: 'Vreme în timp real', manage: 'Gestionează →', quickLaunch: 'Pornire rapidă',
    localOnly: 'Pe acest PC', taskName: 'Memento', taskPlaceholder: 'Ce ai de făcut?', dateAndTime: 'Data și ora', repeat: 'Repetare', once: 'Nu se repetă', daily: 'Zilnic', weekdays: 'În zilele lucrătoare', customDays: 'Alege zilele', cancel: 'Anulează', quickActions: 'Acțiuni rapide', tasksLocal: 'Mementourile rămân pe acest PC. Poți exporta o copie de rezervă.', enableNotifications: 'Activează notificările', notificationsEnabled: 'Notificări activate', clearCompleted: 'Șterge cele finalizate', exportBackup: 'Exportă copia', reminderNotice: 'Orbit verifică mementourile cât timp rulează. Notificările nu sunt garantate când Windows este oprit sau aplicația e suspendată.', yourReminders: 'Mementourile tale',
    createPreset: 'Creează un profil rapid', presetName: 'Numele profilului', selectedApps: 'Aplicații selectate', browseApps: 'Alege fișiere…', findInstalled: 'Caută aplicații instalate', searchApps: 'Caută scurtături în Start', searchAppsPlaceholder: 'Steam, Discord, Minecraft…', savePreset: 'Salvează profilul', yourPresets: 'Profilurile tale', presetHint: 'Alege scurtături din Start sau fișiere .exe/.lnk. Nu trebuie să scrii căile.',
    chooseCity: 'Alege un oraș', cityPlaceholder: 'Caută orice oraș din lume', search: 'Caută', cityHint: 'Alege un oraș din rezultate pentru a-l salva ca locație implicită.', currentWeather: 'Condiții actuale', refresh: 'Actualizează', weatherInternet: 'Necesită internet.',
    preferences: 'Preferințe', language: 'Limbă', voice: 'Vocea Orbit', speakingSpeed: 'Viteza vorbirii', voicePitch: 'Tonalitatea vocii', speakReminders: 'Citește mementourile cu voce tare', testVoice: 'Testează vocea', reloadVoices: 'Actualizează vocile', voiceNote: 'Vocile Windows funcționează offline. Vocea neurală online este opțională și necesită configurarea Azure Speech.', profileAndApp: 'Profil și aplicație', deviceProfile: 'Profil local pe acest dispozitiv Windows', startWindows: 'Pornește Orbit odată cu Windows', startupNote: 'Opțional. Se testează cel mai bine în versiunea instalată, nu în modul dezvoltare.', closeToTray: 'Ascunde în zona de notificare la închidere', trayNote: 'Când este activ, folosește meniul din tray pentru a închide Orbit complet. Mementourile depind de aplicația pornită.', signOut: 'Deconectare', forgetSignIn: 'Uită autentificarea automată', profileNotice: 'Profil local, nu autentificare cloud. Parolele sunt stocate sub formă de hash, însă mementourile locale nu sunt criptate.', footerTag: 'Simplu, fără complicații.',
    greeting: 'Bine ai revenit', noTasks: 'Nu ai nimic programat acum.', upcomingNone: 'Nu există mementouri viitoare.', noReminders: 'Nu ai mementouri încă.', noPresets: 'Nu ai profiluri rapide. Creează unul pentru aplicațiile tale.', noApps: 'Nicio aplicație selectată.', noQuickPresets: 'Profilurile salvate vor apărea aici.', noWeather: 'Caută un oraș pentru a începe.', chooseWeather: 'Caută o locație pentru vremea actuală.', nextReminder: 'Următorul memento', overdue: 'Întârziat', everyDay: 'Zilnic', workdays: 'Zile lucrătoare', every: 'În fiecare', onceLabel: 'O singură dată', edit: 'Editează', delete: 'Șterge', launch: 'Pornește', saveChanges: 'Salvează modificările', editReminder: 'Editează mementoul', editPreset: 'Editează profilul', complete: 'Marchează finalizat', appAdded: 'Aplicație adăugată.', alreadyAdded: 'Deja există în profil.', browseUnsupported: 'Selectorul de fișiere funcționează în aplicația desktop Windows.', noInstalled: 'Nu s-au găsit scurtături potrivite. Folosește Alege fișiere.', loadingApps: 'Se caută scurtături…', chooseApps: 'Selectează una sau mai multe aplicații de mai jos.', removed: 'Eliminat.', saved: 'Salvat.', deleted: 'Șters.', emptyCity: 'Scrie numele unui oraș.', lookingCity: 'Se caută locații…', noCity: 'Nu s-au găsit orașe. Încearcă un nume mai precis.', loadingWeather: 'Se încarcă vremea…', weatherFailed: 'Nu s-a putut încărca vremea. Verifică internetul și încearcă din nou.', refreshed: 'Actualizat', feelsLike: 'Resimțite', wind: 'Vânt', humidity: 'Umiditate',
    clearConfirm: 'Ștergi toate mementourile finalizate?', deleteConfirm: 'Ștergi acest element?', setDay: 'Alege cel puțin o zi.', pastDate: 'Alege o oră din viitor.', taskSaved: 'Memento salvat.', resetHint: 'Modificările sunt salvate local.', permissionNeeded: 'Notificările nu au permisiune.', notificationActive: 'Notificările sunt activate.', testPhrase: 'Orbit este online. Sistemele sunt pregătite.', reminderPrefix: 'Memento.', cannotSpeak: 'Vorbirea nu este disponibilă aici.', noVoices: 'Voce implicită', voiceUpdated: 'Setările vocii au fost actualizate.',
    authFailed: 'Parolă incorectă.', authNeedsUser: 'Introdu un nume de utilizator de cel puțin două caractere.', authShortPassword: 'Parola trebuie să aibă cel puțin opt caractere.', authMismatch: 'Parolele nu corespund.', authError: 'Profilul nu a putut fi creat sau deschis.', enterPassword: 'Introdu parola.', citySelected: 'Locație salvată.', presetRequired: 'Adaugă cel puțin o aplicație.', launching: 'Se pornesc aplicațiile…', launched: 'Pornite', apps: 'aplicații', startupUnavailable: 'Pornirea cu Windows este disponibilă doar în aplicația desktop instalată.', startupFailed: 'Nu s-a putut modifica setarea de pornire.', trayUnavailable: 'Setarea tray este disponibilă doar în aplicația desktop.', signedOut: 'Deconectat.', weatherClear: 'Senin', weatherMainlyClear: 'Mai mult senin', weatherCloudy: 'Noros', weatherFog: 'Ceață', weatherDrizzle: 'Burniță', weatherRain: 'Ploaie', weatherSnow: 'Ninsoare', weatherShowers: 'Averse', weatherStorm: 'Furtună', weatherUnknown: 'Vreme schimbătoare',
    sun: 'Du', mon: 'Lu', tue: 'Ma', wed: 'Mi', thu: 'Jo', fri: 'Vi', sat: 'Sâ',
  }
};
i18n.en.neuralEngine = 'ORBIT Neural · English + Romanian'; i18n.ro.neuralEngine = 'ORBIT Neural · engleză + română';
i18n.en.neuralReady = 'Voice pack ready: British English (Alan) + Romanian (Mihai).';
i18n.ro.neuralReady = 'Vocile sunt pregătite: engleză britanică (Alan) + română (Mihai).';
i18n.en.neuralNotInstalled = 'Neural voice unavailable. Use START_ORBIT.bat to prepare the built-in voice pack.';
i18n.ro.neuralNotInstalled = 'Vocea neurală nu este disponibilă. Rulează START_ORBIT.bat pentru pregătirea pachetului vocal.';
i18n.en.neuralFallback = 'Neural voice unavailable; using Windows voice.';
i18n.ro.neuralFallback = 'Vocea neurală nu este disponibilă; folosesc vocea Windows.';
i18n.en.in15Minutes = '+15 min'; i18n.ro.in15Minutes = '+15 min';
i18n.en.in1Hour = '+1 hour'; i18n.ro.in1Hour = '+1 oră';
i18n.en.morning = 'Morning · 09:00'; i18n.ro.morning = 'Dimineața · 09:00';
i18n.en.evening = 'Evening · 18:00'; i18n.ro.evening = 'Seara · 18:00';
i18n.en.customTimeHint = 'Or set an exact time'; i18n.ro.customTimeHint = 'Sau alege ora exactă';
i18n.en.quickTimePast = 'That time has passed today. Moved to tomorrow.';
i18n.ro.quickTimePast = 'Ora a trecut astăzi. Am mutat pe mâine.';
i18n.en.voiceNote = 'ORBIT uses installed Windows voices offline, or your own Azure Speech resource for optional online neural voices.';
i18n.ro.voiceNote = 'ORBIT folosește vocile Windows instalate offline sau resursa ta Azure Speech pentru voci neurale online opționale.';
i18n.en.voiceEngine = 'Speech engine'; i18n.ro.voiceEngine = 'Motor vocal';
i18n.en.systemEngine = 'Windows voice (built in)'; i18n.ro.systemEngine = 'Vocea Windows (integrată)';
i18n.ro.today = 'Astăzi'; i18n.ro.tomorrow = 'Mâine'; i18n.ro.nextWeek = 'Peste o săptămână'; i18n.ro.time = 'Ora';
i18n.en.neuralError = 'Neural voice error: '; i18n.ro.neuralError = 'Eroare voce neurală: ';
Object.assign(i18n.en, {
  quickWeb:'Quick web', defaultBrowserNote:'Opens in your Windows default browser.', googleSearch:'Search Google', googleSearchHint:'Search Google…', emptySearch:'Enter something to search.', browserFailed:'Could not open your browser.',
  voiceVolume:'Voice volume', voiceVolumeNote:'Controls Orbit speech only, not your Windows volume.',
  appearance:'Appearance', appearanceHint:'Customize Orbit. Changes apply immediately and are saved on this PC.', resetAppearance:'Reset look', accentColor:'Accent color', accentNote:'The dark ORBIT layout stays readable with every accent.', surfaceStyle:'Panel style', styleClassic:'Classic navy', styleGlass:'Soft glass', styleFlat:'Minimal flat', compactMode:'Compact layout', showQuickWeb:'Show quick web shortcuts on dashboard',
});
Object.assign(i18n.ro, {
  quickWeb:'Acces rapid pe web', defaultBrowserNote:'Se deschide în browserul implicit din Windows.', googleSearch:'Caută pe Google', googleSearchHint:'Caută pe Google…', emptySearch:'Scrie ceva pentru căutare.', browserFailed:'Nu s-a putut deschide browserul.',
  voiceVolume:'Volumul vocii', voiceVolumeNote:'Controlează doar vocea Orbit, nu volumul Windows.',
  appearance:'Aspect', appearanceHint:'Personalizează Orbit. Modificările se aplică imediat și se salvează pe acest PC.', resetAppearance:'Resetează aspectul', accentColor:'Culoare de accent', accentNote:'Interfața întunecată ORBIT rămâne lizibilă indiferent de culoare.', surfaceStyle:'Stilul panourilor', styleClassic:'Bleumarin clasic', styleGlass:'Sticlă discretă', styleFlat:'Minimal plat', compactMode:'Interfață compactă', showQuickWeb:'Arată scurtăturile web pe panoul principal',
});

Object.assign(i18n.en, {
  agenda:'Agenda', timers:'Timers', system:'System', systemMonitor:'System monitor', fullscreen:'Fullscreen (F11)',
  calendar:'Calendar', agendaPreview:"Today's reminders", viewAgenda:'Open reminders →', openTimers:'Open timers →', timerPreview:'Active timer',
  timerIdle:'No timer running', noAgendaItems:'No reminders for this date.', comingUp:'Coming up', upcomingOnDate:'Selected day',
  countdown:'Countdown', stopwatch:'Stopwatch', minutes:'Minutes', seconds:'Seconds', start:'Start', resume:'Resume', pause:'Pause', reset:'Reset', lap:'Lap',
  timerFinished:'Countdown finished.', countdownPaused:'Countdown paused.', timerRunning:'Timer running',
  timersDescription:'Countdown and stopwatch in one section.', runsInTray:'Available while ORBIT runs',
  systemDescription:'Windows performance snapshot · approximate Task Manager values', systemDesktopOnly:'Live performance metrics require ORBIT on Windows.',
  systemFailed:'Could not read system usage.', gpuNote:'GPU uses Windows GPU Engine counters if supported; values can differ from Task Manager.',
  latestNews:'Google News · Headlines', newsInlineInfo:'Read headlines here without leaving ORBIT.', newsLoading:'Loading headlines…', newsEmpty:'No headlines returned.', newsError:'Could not load news. Check your connection or refresh.', newsDesktop:'Live news appears in the installed Windows app.',
});
Object.assign(i18n.ro, {
  agenda:'Agendă', timers:'Cronometre', system:'Sistem', systemMonitor:'Monitor sistem', fullscreen:'Ecran complet (F11)',
  calendar:'Calendar', agendaPreview:'Mementourile de azi', viewAgenda:'Deschide mementourile →', openTimers:'Deschide cronometrele →', timerPreview:'Cronometru activ',
  timerIdle:'Niciun cronometru activ', noAgendaItems:'Nu ai mementouri pentru această dată.', comingUp:'În curând', upcomingOnDate:'Ziua selectată',
  countdown:'Numărătoare inversă', stopwatch:'Cronometru', minutes:'Minute', seconds:'Secunde', start:'Pornește', resume:'Continuă', pause:'Pauză', reset:'Resetează', lap:'Tur',
  timerFinished:'Timpul a expirat.', countdownPaused:'Numărătoare în pauză.', timerRunning:'Cronometru activ',
  timersDescription:'Numărătoare inversă și cronometru în aceeași secțiune.', runsInTray:'Disponibil cât timp ORBIT rulează',
  systemDescription:'Date Windows aproximative, comparabile cu Task Manager', systemDesktopOnly:'Datele live necesită aplicația ORBIT pentru Windows.',
  systemFailed:'Nu s-a putut citi utilizarea sistemului.', gpuNote:'GPU folosește contoarele Windows, dacă sunt disponibile. Valorile pot diferi de Task Manager.',
  latestNews:'Google News · Știri', newsInlineInfo:'Citește titlurile aici, fără să părăsești ORBIT.', newsLoading:'Se încarcă știrile…', newsEmpty:'Nu există știri disponibile.', newsError:'Știrile nu pot fi încărcate. Verifică internetul.', newsDesktop:'Știrile live apar în aplicația Windows.',
});
// Version 3.0 voice and migration labels (English/Romanian).
Object.assign(i18n.en,{azureEngine:'Microsoft Neural · online',systemEngine:'Windows voice · offline',azurePrivate:'Key encrypted for your Windows account.',azureRegion:'Azure Speech region',azureKey:'Azure Speech resource key',azureSave:'Save voice settings',azureClear:'Remove saved key',azureVoice:'Neural voice',azureNotice:'Requires your own Azure Speech resource. Usage may have costs.',voiceNote30:'Offline Romanian needs an installed Windows Romanian voice. Online neural speech needs your Azure key.',azureNotConfigured:'Add an Azure Speech region and resource key to enable neural speech.',azureReady:'Online neural speech is configured.',azureSaved:'Voice settings saved securely.',azureCleared:'Azure key removed.',azureRegionRequired:'Enter the Azure region.',voiceListLoading:'Loading installed Windows voices…',offlineReady:'Installed Windows voice is available.',windowsLanguageMissing:'No matching Windows voice for this language. Install a Windows language voice or configure online neural speech.',romanianVoiceMissing:'No Romanian speech voice installed. Add Romanian speech in Windows or use the neural engine.',importBackup:'Import old backup',importConfirm:'Replace current local reminders and presets with this backup? Export your current data first.',importDone:'Backup imported successfully.'});
Object.assign(i18n.ro,{azureEngine:'Microsoft Neural · online',systemEngine:'Voce Windows · offline',azurePrivate:'Cheia este criptată local pentru contul tău Windows.',azureRegion:'Regiune Azure Speech',azureKey:'Cheia resursei Azure Speech',azureSave:'Salvează configurarea vocală',azureClear:'Șterge cheia salvată',azureVoice:'Voce neurală',azureNotice:'Necesită propria resursă Azure Speech; utilizarea poate costa.',voiceNote30:'Româna offline necesită o voce română instalată în Windows. Vocea neurală online necesită cheia Azure.',azureNotConfigured:'Adaugă regiunea și cheia Azure Speech pentru voce neurală.',azureReady:'Vocea neurală online este configurată.',azureSaved:'Setările vocale au fost salvate.',azureCleared:'Cheia Azure a fost ștearsă.',azureRegionRequired:'Introdu regiunea Azure.',voiceListLoading:'Se încarcă vocile Windows…',offlineReady:'Vocea Windows instalată este disponibilă.',windowsLanguageMissing:'Nu există voce Windows instalată pentru limba selectată. Instalează vocea sau activează serviciul neural.',romanianVoiceMissing:'Nu există voce română instalată. Instalează vocea în Windows sau folosește Azure Neural.',importBackup:'Importă backup vechi',importConfirm:'Înlocuiești mementourile și profilurile locale actuale? Exportă-le înainte.',importDone:'Backup importat cu succes.'});
const t = (key) => (i18n[settings.language] || i18n.en)[key] ?? i18n.en[key] ?? key;
const saveTasks = () => { localStorage.setItem(KEYS.tasks, JSON.stringify(tasks)); cloud.observe(tasks); cloud.scheduleSync(); };
const savePresets = () => localStorage.setItem(KEYS.presets, JSON.stringify(presets));
const saveSettings = () => { localStorage.setItem(KEYS.settings, JSON.stringify(settings)); cloud.observePrefs({accentColor:settings.accentColor,language:settings.language}); cloud.scheduleSync(); };
// Cloud is separate from the existing local profile. Only reminders are synchronized.
const cloudConnection = read('orbit3_cloud_connection_v1', {});
const cloud = new OrbitCloud({
  config: { url: cloudConnection.url || ORBIT_CLOUD_CONFIG.url, anonKey: cloudConnection.anonKey || ORBIT_CLOUD_CONFIG.anonKey }, prefix: 'orbit_desktop_cloud_v1', getItems: () => tasks,
  onRemote: items => { tasks = items; localStorage.setItem(KEYS.tasks, JSON.stringify(tasks)); renderAll(); renderAgendaDashboard(); },
  getPrefs: () => ({accentColor:settings.accentColor,language:settings.language}),
  onPrefs: incoming => { settings.accentColor=incoming.accentColor; settings.language=incoming.language; localStorage.setItem(KEYS.settings,JSON.stringify(settings)); applyLanguage(); applyAppearance(); renderAll(); },
  onStatus: message => { const status = $('cloudStatus'); if (status) status.textContent = message; }
});
const pad = (n) => String(n).padStart(2, '0');
const localValue = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
// Date picker keeps the existing taskDate value format for all reminder logic.
let calendarMonth = new Date();
function selectedReminderDate() {
  const value = $('taskDate').value;
  const date = value ? new Date(value) : new Date(Date.now() + 30 * 60000);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
function chooseReminderDate(date) {
  const current = selectedReminderDate();
  current.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  const hourMinute = $('taskTime').value;
  if (hourMinute && /^\d{2}:\d{2}$/.test(hourMinute)) {
    const [h, m] = hourMinute.split(':').map(Number);
    current.setHours(h, m, 0, 0);
  }
  $('taskDate').value = localValue(current);
  calendarMonth = new Date(current.getFullYear(), current.getMonth(), 1);
  renderReminderCalendar();
}
function setReminderDateTime(value) {
  $('taskDate').value = value;
  const date = selectedReminderDate();
  $('taskTime').value = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  renderReminderCalendar();
}
function renderReminderCalendar() {
  const area = $('calendarDays');
  if (!area) return;
  const locale = settings.language === 'ro' ? 'ro-RO' : 'en-GB';
  $('calendarTitle').textContent = calendarMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const weekdayHeader = $('calendarWeekdays'); weekdayHeader.replaceChildren();
  const monday = new Date(2024, 0, 1);
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const label = document.createElement('span');
    label.textContent = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d);
    weekdayHeader.append(label);
  }
  area.replaceChildren();
  const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const startOffset = (first.getDay() + 6) % 7;
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  for (let i = 0; i < startOffset; i++) {
    const filler = document.createElement('span'); filler.className = 'calendar-empty'; area.append(filler);
  }
  const selected = selectedReminderDate();
  const today = new Date();
  for (let n = 1; n <= count; n++) {
    const date = new Date(first.getFullYear(), first.getMonth(), n);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'calendar-day';
    button.textContent = String(n);
    button.setAttribute('aria-label', date.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }));
    if (date.getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) { button.disabled = true; button.classList.add('past'); }
    if (date.toDateString() === selected.toDateString()) { button.classList.add('selected'); button.setAttribute('aria-pressed', 'true'); }
    if (date.toDateString() === today.toDateString()) button.classList.add('today');
    button.onclick = () => chooseReminderDate(date);
    area.append(button);
  }
  $('calendarPrev').disabled = calendarMonth.getFullYear() === today.getFullYear() && calendarMonth.getMonth() <= today.getMonth();
  $('dateSummary').textContent = selected.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  document.querySelectorAll('[data-quick-time]').forEach(btn => btn.classList.toggle('selected', btn.dataset.quickTime === $('taskTime').value));
  document.querySelectorAll('[data-quick-date]').forEach(btn => {
    const d = new Date(); d.setDate(d.getDate() + Number(btn.dataset.quickDate));
    btn.classList.toggle('selected', d.toDateString() === selected.toDateString());
  });
}
const fmt = (time) => new Date(time).toLocaleString(settings.language === 'ro' ? 'ro-RO' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const createId = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`;
function toast(message) { $('toast').textContent = message; $('toast').classList.remove('hidden'); clearTimeout(toastTimeout); toastTimeout = setTimeout(() => $('toast').classList.add('hidden'), 4500); }
function applyAppearance() {
  const accent = accents.has(settings.accentColor) ? settings.accentColor : 'blue';
  const surface = surfaces.has(settings.surfaceStyle) ? settings.surfaceStyle : 'classic';
  document.documentElement.dataset.accent = accent;
  document.documentElement.dataset.surface = surface;
  document.documentElement.dataset.density = settings.compactMode ? 'compact' : 'comfortable';
  document.querySelectorAll('[data-accent-choice], [data-header-accent]').forEach(button => {
    const on = (button.dataset.accentChoice || button.dataset.headerAccent) === accent;
    button.classList.toggle('selected', on);
    button.setAttribute('aria-pressed', String(on));
  });
  $('surfaceStyle').value = surface;
  $('compactMode').checked = !!settings.compactMode;
  $('showQuickWeb').checked = !!settings.showQuickWeb;
  $('quickWebPanel').classList.toggle('hidden', !settings.showQuickWeb);
}
async function openWebsite(url) {
  // Fixed HTTPS destinations. Never execute a URL as a local program.
  if (!url.startsWith('https://')) return;
  try {
    if (isTauri()) await openUrl(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  } catch (error) {
    console.error('Cannot open website:', error);
    toast(`${t('browserFailed')} ${String(error)}`);
  }
}
function renderQuickWeb() {
  const area = $('quickWebLinks');
  area.replaceChildren();
  for (const item of WEB_LINKS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `web-link web-${item.id}`;
    const icon = document.createElement('span');
    icon.className = 'web-link-icon';
    icon.textContent = item.title[0];
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = item.title;
    button.append(icon, label);
    button.onclick = () => openWebsite(item.url);
    area.append(button);
  }
}
function applyLanguage() {
  document.documentElement.lang = settings.language;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-placeholder]')) el.placeholder = t(el.dataset.placeholder);
  $('languageSelect').value = settings.language;
  applyAppearance();
  $('topLanguage').textContent = settings.language === 'en' ? 'RO' : 'EN';
  $('authLanguage').textContent = settings.language === 'en' ? 'Română' : 'English';
  document.title = 'ORBIT 3.0';
  renderReminderCalendar();
  renderVoiceEngine();
  renderQuickWeb();
  renderDays(); renderAll(); renderTimerUI(); renderMetrics(); showPage(activePage);
  if ($('authView').classList.contains('hidden') === false) showAuth();
}
function setLanguage(lang) { settings.language = lang === 'ro' ? 'ro' : 'en'; saveSettings(); applyLanguage(); populateVoices(); }
function showPage(page) {
  activePage = page;
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('hidden', el.id !== `page-${page}`));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  const name = t(page);
  $('breadcrumbPage').textContent = name;
  $('pageTitle').textContent = name;
  $('pageSubtitle').textContent = page === 'dashboard' ? t('yourDay') : '';
  if (page === 'timers') scheduleStopwatchFrame();
  if (page === 'system') pollMetrics();
  if (page === 'dashboard') { renderAgendaDashboard();refreshNews(); }
}
function nextOccurrence(when, repeat, days = [], reference = Date.now()) {
  if (repeat === 'once') return when;
  const original = new Date(when);
  const current = new Date(reference);
  for (let offset = 0; offset <= 8; offset++) {
    const candidate = new Date(current);
    candidate.setDate(current.getDate() + offset);
    candidate.setHours(original.getHours(), original.getMinutes(), 0, 0);
    const weekday = candidate.getDay();
    const matches = repeat === 'daily' || (repeat === 'weekdays' && weekday >= 1 && weekday <= 5) || (repeat === 'custom' && days.includes(weekday));
    if (matches && candidate.getTime() > reference) return candidate.getTime();
  }
  return reference + 86400000;
}
function repeatLabel(item) {
  if (item.repeat === 'daily') return t('everyDay');
  if (item.repeat === 'weekdays') return t('workdays');
  if (item.repeat === 'custom') return `${t('every')} ${(item.days || []).map(day => t(dayIds[day])).join(', ')}`;
  return t('onceLabel');
}
function renderDays() {
  $('days').replaceChildren();
  dayIds.forEach((day, idx) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = t(day); button.className = 'day' + (selectedDays.includes(idx) ? ' selected' : '');
    button.setAttribute('aria-pressed', selectedDays.includes(idx) ? 'true' : 'false');
    button.onclick = () => { selectedDays = selectedDays.includes(idx) ? selectedDays.filter(x => x !== idx) : [...selectedDays, idx]; renderDays(); };
    $('days').append(button);
  });
}
function renderTasks() {
  const list = $('taskList'); list.replaceChildren();
  $('taskCount').textContent = String(tasks.length);
  if (!tasks.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = t('noReminders'); list.append(empty); return; }
  [...tasks].sort((a,b) => Number(!!a.done) - Number(!!b.done) || a.when - b.when).forEach(item => {
    const row = document.createElement('div'); row.className = 'row' + (item.done ? ' done' : '');
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = !!item.done; checkbox.setAttribute('aria-label', t('complete'));
    checkbox.onchange = () => { if (item.repeat !== 'once' && checkbox.checked) { item.when = nextOccurrence(item.when, item.repeat, item.days, Math.max(Date.now(), item.when) + 1000); item.done = false; toast(t('saved')); } else { item.done = checkbox.checked; } saveTasks(); renderAll(); };
    const main = document.createElement('div'); main.className = 'rowmain';
    const title = document.createElement('div'); title.className = 'rowtitle'; title.textContent = item.title;
    const meta = document.createElement('div'); meta.className = 'rowmeta'; meta.textContent = `${fmt(item.when)} · ${repeatLabel(item)}${!item.done && item.when < Date.now() ? ' · ' + t('overdue') : ''}`;
    main.append(title, meta);
    const actions = document.createElement('div'); actions.className = 'row-actions';
    const edit = document.createElement('button'); edit.textContent = t('edit'); edit.onclick = () => { editTaskId = item.id; $('taskText').value = item.title; setReminderDateTime(localValue(new Date(item.when))); $('repeat').value = item.repeat; selectedDays = [...(item.days || [1,2,3,4,5])]; $('days').classList.toggle('hidden', item.repeat !== 'custom'); $('taskFormHeading').textContent = t('editReminder'); $('saveTaskBtn').textContent = t('saveChanges'); $('cancelTaskEdit').classList.remove('hidden'); renderDays(); showPage('reminders'); $('taskText').focus(); };
    const del = document.createElement('button'); del.className = 'danger'; del.textContent = t('delete'); del.onclick = () => { if (!confirm(t('deleteConfirm'))) return; tasks = tasks.filter(x => x.id !== item.id); saveTasks(); if (editTaskId === item.id) resetTaskForm(); renderAll(); };
    actions.append(edit, del); row.append(checkbox, main, actions); list.append(row);
  });
}
function resetTaskForm() {
  editTaskId = null; $('taskForm').reset(); setReminderDateTime(localValue(new Date(Date.now() + 30 * 60000)));
  $('taskFormHeading').textContent = t('addReminder'); $('saveTaskBtn').textContent = t('addReminder'); $('cancelTaskEdit').classList.add('hidden'); selectedDays = [1,2,3,4,5]; $('days').classList.add('hidden'); renderDays();
}
function renderPresetSelections() {
  const list = $('selectedApps'); list.replaceChildren();
  if (!selectedPaths.length) { list.textContent = t('noApps'); return; }
  selectedPaths.forEach((path, idx) => {
    const row = document.createElement('div'); row.className = 'selected-app';
    const label = document.createElement('span'); label.textContent = path.split(/[\\/]/).at(-1).replace(/\.(exe|lnk)$/i, ''); label.title = path;
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', t('delete')); remove.onclick = () => { selectedPaths.splice(idx, 1); renderPresetSelections(); };
    row.append(label, remove); list.append(row);
  });
}
function addPath(path) {
  if (typeof path !== 'string' || !/\.(exe|lnk)$/i.test(path)) return;
  if (selectedPaths.some(x => x.toLowerCase() === path.toLowerCase())) { toast(t('alreadyAdded')); return; }
  selectedPaths.push(path); renderPresetSelections();
}
function renderInstalled() {
  const list = $('installedList'); list.replaceChildren();
  if (!isTauri()) { list.textContent = t('browseUnsupported'); return; }
  if (!installedApps.length) { list.textContent = t('noInstalled'); return; }
  const query = $('appSearch').value.trim().toLowerCase();
  const apps = installedApps.filter(app => app.name.toLowerCase().includes(query)).slice(0, 55);
  if (!apps.length) { list.textContent = t('noInstalled'); return; }
  apps.forEach(app => { const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'installed-row'; const label = document.createElement('span'); label.textContent = app.name; btn.title = app.path; const plus = document.createElement('small'); plus.textContent = '+ ' + (settings.language === 'ro' ? 'Adaugă' : 'Add'); btn.append(label, plus); btn.onclick = () => { addPath(app.path); }; list.append(btn); });
}
function renderPresets() {
  const list = $('presetList'); list.replaceChildren(); $('presetCount').textContent = String(presets.length);
  if (!presets.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = t('noPresets'); list.append(empty); return; }
  presets.forEach((item, idx) => {
    const preset = document.createElement('div'); preset.className = 'preset'; const head = document.createElement('div'); head.className = 'preset-head';
    const name = document.createElement('strong'); name.textContent = item.name; const actions = document.createElement('div'); actions.className = 'actions';
    const launch = document.createElement('button'); launch.className = 'primary'; launch.textContent = t('launch'); launch.onclick = async () => launchPreset(item);
    const edit = document.createElement('button'); edit.textContent = t('edit'); edit.onclick = () => { editPresetIndex = idx; selectedPaths = [...(item.paths || [])]; $('presetName').value = item.name; $('presetFormHeading').textContent = t('editPreset'); $('savePresetBtn').textContent = t('saveChanges'); $('cancelPresetEdit').classList.remove('hidden'); renderPresetSelections(); showPage('presets'); $('presetName').focus(); };
    const del = document.createElement('button'); del.className = 'danger'; del.textContent = t('delete'); del.onclick = () => { if (!confirm(t('deleteConfirm'))) return; presets.splice(idx,1); savePresets(); resetPresetForm(); renderAll(); };
    actions.append(launch,edit,del); head.append(name,actions);
    const info = document.createElement('div'); info.className = 'preset-apps'; info.textContent = (item.paths || []).map(p => p.split(/[\\/]/).at(-1)).join(' · ') || t('noApps');
    preset.append(head,info);list.append(preset);
  });
}
function resetPresetForm() { editPresetIndex = null; selectedPaths = []; $('presetForm').reset(); $('presetFormHeading').textContent = t('createPreset'); $('savePresetBtn').textContent = t('savePreset'); $('cancelPresetEdit').classList.add('hidden'); renderPresetSelections(); }
async function launchPreset(item) {
  if (!isTauri()) { toast(t('browseUnsupported')); return; }
  const paths = [...new Set(item.paths || [])];
  toast(t('launching'));
  let launched = 0; const errors = [];
  for (const path of paths) { try { await invoke('launch_app', { path }); launched++; } catch (error) { errors.push(`${path.split(/[\\/]/).at(-1)}: ${String(error)}`); } }
  toast(`${t('launched')} ${launched}/${paths.length} ${t('apps')}.${errors.length ? ' ' + errors.join('; ').slice(0, 280) : ''}`);
}
function renderDashboard() {
  $('greeting').textContent = `${t('greeting')}${profile ? ', ' + profile.username : ''}.`;
  const next = tasks.filter(x => !x.done).sort((a,b) => a.when - b.when)[0];
  $('nextHint').textContent = next ? `${t('nextReminder')}: ${fmt(next.when)}` : t('noTasks');
  const target = $('dashboardNext'); target.replaceChildren();
  if (next) { const heading = document.createElement('div'); heading.className = 'rowtitle'; heading.textContent = next.title; const sub = document.createElement('div'); sub.className = 'rowmeta'; sub.textContent = `${fmt(next.when)} · ${repeatLabel(next)}`; target.append(heading,sub); } else target.textContent = t('upcomingNone');
  const quick = $('dashboardPresets'); quick.replaceChildren();
  if (!presets.length) { quick.textContent = t('noQuickPresets'); } else presets.slice(0,5).forEach(p => { const b = document.createElement('button'); b.textContent = `▷ ${p.name}`; b.onclick = () => launchPreset(p); quick.append(b); });
  renderWeatherMini();
  renderAgendaDashboard();
}
function weatherLabel(code) {
  if (code === 0) return t('weatherClear');
  if ([1,2].includes(code)) return t('weatherMainlyClear');
  if (code === 3) return t('weatherCloudy');
  if ([45,48].includes(code)) return t('weatherFog');
  if ([51,53,55,56,57].includes(code)) return t('weatherDrizzle');
  if ([61,63,65,66,67].includes(code)) return t('weatherRain');
  if ([71,73,75,77].includes(code)) return t('weatherSnow');
  if ([80,81,82,85,86].includes(code)) return t('weatherShowers');
  if ([95,96,99].includes(code)) return t('weatherStorm');
  return t('weatherUnknown');
}
function weatherSymbol(code) {
  if (code === 0) return '☀'; if ([1,2].includes(code)) return '⛅'; if (code === 3) return '☁';
  if ([45,48].includes(code)) return '≋'; if ([71,73,75,77,85,86].includes(code)) return '❄';
  if ([95,96,99].includes(code)) return 'ϟ'; return '☂';
}
function renderWeatherMini() {
  const el = $('dashboardWeather'); el.replaceChildren();
  if (!weatherData || !settings.city) { el.textContent = settings.city ? t('loadingWeather') : t('noWeather'); return; }
  const symbol = document.createElement('span'); symbol.className = 'weather-symbol'; symbol.textContent = weatherSymbol(weatherData.current.weather_code);
  const temp = document.createElement('span'); temp.className = 'temp'; temp.textContent = `${Math.round(weatherData.current.temperature_2m)}°`;
  const info = document.createElement('div'); const name = document.createElement('div'); name.className = 'weather-place'; name.textContent = settings.city.name; const desc = document.createElement('div'); desc.className = 'weather-extra'; desc.textContent = weatherLabel(weatherData.current.weather_code); info.append(name,desc);el.append(symbol,temp,info);
}
function renderWeather() {
  const details = $('weatherDetails'); const forecast = $('weatherForecast'); details.replaceChildren(); forecast.replaceChildren();
  if (!settings.city || !weatherData) { details.textContent = settings.city ? t('loadingWeather') : t('chooseWeather'); return; }
  const current = weatherData.current;
  const main = document.createElement('div'); main.className = 'weather-main';
  const glyph = document.createElement('span'); glyph.className = 'weather-symbol'; glyph.textContent = weatherSymbol(current.weather_code);
  const degree = document.createElement('div'); degree.className = 'temp'; degree.textContent = `${Math.round(current.temperature_2m)}°C`;
  const location = document.createElement('div'); const heading = document.createElement('div'); heading.className = 'weather-place'; heading.textContent = `${settings.city.name}, ${settings.city.country || ''}`;
  const summary = document.createElement('div'); summary.className = 'weather-extra'; summary.textContent = weatherLabel(current.weather_code);
  location.append(heading,summary);main.append(glyph,degree,location);details.append(main);
  const extra = document.createElement('div');extra.className = 'weather-extra';extra.textContent = `${t('feelsLike')}: ${Math.round(current.apparent_temperature)}°C   ·   ${t('humidity')}: ${current.relative_humidity_2m}%   ·   ${t('wind')}: ${Math.round(current.wind_speed_10m)} km/h`;details.append(extra);
  const days = weatherData.daily;
  if (days && Array.isArray(days.time)) days.time.slice(0,3).forEach((date, i) => { const card = document.createElement('div');card.className='forecast-day';const day = new Date(`${date}T12:00:00`); const label = document.createElement('div'); label.textContent = day.toLocaleDateString(settings.language === 'ro' ? 'ro-RO' : 'en-GB',{ weekday:'short',day:'numeric' });const numbers = document.createElement('strong');numbers.textContent = `${Math.round(days.temperature_2m_max[i])}° / ${Math.round(days.temperature_2m_min[i])}°`;const description = document.createElement('div'); description.textContent = weatherLabel(days.weather_code[i]); card.append(label,numbers,description); forecast.append(card); });
}
async function fetchJSON(url) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12000);
  try { const res = await fetch(url, { signal: controller.signal }); if (!res.ok) throw new Error(`HTTP ${res.status}`); return await res.json(); } finally { clearTimeout(timeout); }
}
async function searchCities(query) {
  const target = $('cityResults'); target.replaceChildren(); target.textContent = t('lookingCity');
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=${settings.language}&format=json`;
    const result = await fetchJSON(url);
    target.replaceChildren();
    if (!result.results?.length) { target.textContent = t('noCity'); return; }
    result.results.forEach(city => {
      const button = document.createElement('button');button.type='button';button.className='city-option';button.textContent = `${city.name}, ${[city.admin1,city.country].filter(Boolean).join(', ')}`;
      button.onclick = () => { settings.city = { name: city.name, country: city.country, latitude: city.latitude, longitude: city.longitude }; weatherData=null; saveSettings(); target.replaceChildren(); $('cityInput').value=city.name; toast(t('citySelected')); renderWeather();renderWeatherMini();refreshWeather(); };
      target.append(button);
    });
  } catch (e) { console.error('City search:',e); target.textContent = t('weatherFailed'); }
}
let weatherRequestedAt = 0;
let weatherLoading = false;
async function refreshWeather() {
  if (!settings.city) { showPage('weather'); $('cityInput').focus(); return; }
  if (weatherLoading) return;
  weatherLoading = true;
  const city = settings.city;
  $('weatherDetails').textContent = t('loadingWeather');
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(city.latitude)}&longitude=${encodeURIComponent(city.longitude)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3`;
  try {
    const result = await fetchJSON(url);
    // Ignore a result if the user switched to another location before it returned.
    if (!settings.city || settings.city.latitude !== city.latitude || settings.city.longitude !== city.longitude) return;
    if (!result.current) throw new Error('Weather data unavailable');
    weatherData = result; weatherRequestedAt = Date.now(); renderWeather();renderWeatherMini();
  } catch(e) { console.error('Weather:',e); weatherRequestedAt = Date.now() - 13 * 60 * 1000; $('weatherDetails').textContent = t('weatherFailed'); renderWeatherMini(); }
  finally { weatherLoading = false; }
}
function renderAll() { renderTasks();renderPresets();renderDashboard();renderWeather();renderPresetSelections(); }
async function ensureNotifyPermission() {
  try {
    if (isTauri()) { const ok = await isPermissionGranted(); return ok || (await requestPermission()) === 'granted'; }
    if ('Notification' in window) return Notification.permission === 'granted' || (await Notification.requestPermission()) === 'granted';
  } catch(e) { console.warn('Notification permission error',e); }
  return false;
}
async function notify(title, body) {
  try {
    if (isTauri()) { if (await isPermissionGranted()) await sendNotification({ title, body }); }
    else if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body });
  } catch(e) { console.warn('Notification error',e); }
}
let availableVoices=[];
function populateVoices() {
  if (!('speechSynthesis' in window)) return;
  const select=$('voiceSelect'),previous=select.value || settings.voiceURI;
  availableVoices=speechSynthesis.getVoices();select.replaceChildren();
  const defaultOption=document.createElement('option'); defaultOption.value='';defaultOption.textContent=t('noVoices');select.append(defaultOption);
  availableVoices.slice().sort((a,b)=>a.lang.localeCompare(b.lang)||a.name.localeCompare(b.name)).forEach(v=>{
    const opt=document.createElement('option');opt.value=v.voiceURI;opt.textContent=`${v.name} (${v.lang})`;select.append(opt);
  });
  select.value=availableVoices.some(v=>v.voiceURI===previous)?previous:'';
  renderVoiceEngine();
}
function normalizedVolume(){const v=Number(settings.voiceVolume);return Number.isFinite(v)?Math.max(0,Math.min(1,v)):0.35;}
function stopAudio(){if(neuralAudio){neuralAudio.pause();neuralAudio.src='';neuralAudio=null;}if('speechSynthesis' in window)speechSynthesis.cancel();}
function speakSystem(text) {
  if (!('speechSynthesis' in window)) { toast(t('cannotSpeak'));return; }
  stopAudio();
  const utterance=new SpeechSynthesisUtterance(text);
  utterance.rate=Number(settings.rate);utterance.pitch=Number(settings.pitch);utterance.volume=normalizedVolume();
  const chosen=availableVoices.find(v=>v.voiceURI===settings.voiceURI);
  const lang=settings.language==='ro'?'ro':'en';
  const matching=chosen&&chosen.lang.toLowerCase().startsWith(lang)?chosen:availableVoices.find(v=>v.lang.toLowerCase().startsWith(lang));
  if(settings.language==='ro'&&!matching){toast(t('romanianVoiceMissing'));return;}
  if(matching){utterance.voice=matching;utterance.lang=matching.lang;}
  else utterance.lang='en-US';
  speechSynthesis.speak(utterance);
}
async function speak(text) {
  if (neuralSpeaking || normalizedVolume()===0) return;
  if(settings.voiceEngine!=='azure'){speakSystem(text);return;}
  if(!azureConfigured){toast(t('azureNotConfigured'));return;}
  neuralSpeaking=true;document.body.classList.add('orbit-speaking');voiceLastError='';stopAudio();
  try{
    const language=settings.language==='ro'?'ro':'en';
    const requested=settings.azureVoice||'auto';
    const voice=requested==='auto'||!requested.startsWith(language+'-')?(language==='ro'?'ro-RO-EmilNeural':'en-US-AndrewNeural'):requested;
    const wav=await invoke('azure_speak',{text,voice,rate:Number(settings.rate)});
    const audio=new Audio('data:audio/wav;base64,'+wav);neuralAudio=audio;audio.volume=normalizedVolume();
    await new Promise((resolve,reject)=>{audio.onended=resolve;audio.onerror=()=>reject(Error('Audio playback failed'));audio.play().catch(reject);});
  }catch(err){console.warn('Azure speech:',err);voiceLastError=String(err);toast(t('neuralError')+voiceLastError);}
  finally{stopAudio();neuralSpeaking=false;document.body.classList.remove('orbit-speaking');renderVoiceEngine();}
}
function renderVoiceEngine(){
  const engine=settings.voiceEngine==='azure'?'azure':'system';settings.voiceEngine=engine;
  $('voiceEngine').value=engine;
  $('azureControls').classList.toggle('hidden',engine!=='azure');
  $('systemVoiceControls').classList.toggle('hidden',engine!=='system');
  $('voicePitchControls').classList.toggle('hidden',engine!=='system');
  $('azureVoice').value=settings.azureVoice||'auto';
  const lang=settings.language==='ro'?'ro':'en';
  const nativeVoices=availableVoices.some(v=>v.lang.toLowerCase().startsWith(lang));
  const message=engine==='azure'
    ? (voiceLastError|| (azureConfigured?t('azureReady'):t('azureNotConfigured')))
    : (availableVoices.length===0?t('voiceListLoading'):(nativeVoices?t('offlineReady'):t('windowsLanguageMissing')));
  $('neuralStatus').textContent=message;
  $('neuralStatus').classList.toggle('ready',engine==='azure'?azureConfigured:nativeVoices);
}
async function refreshAzureStatus(){
  if(!isTauri())return;
  try{const status=await invoke('azure_status');azureConfigured=!!status.enabled;azureRegionSaved=status.region||'';$('azureRegion').value=azureRegionSaved;renderVoiceEngine();}
  catch(err){console.warn('Azure voice status:',err);}
}
function dueCheck() {
  let changed=false;const now=Date.now();
  for (const item of tasks) {
    if (item.done) { if (item.repeat !== 'once' && item.when<=now) { item.when=nextOccurrence(item.when,item.repeat,item.days||[],now);item.done=false;changed=true; }continue; }
    if (item.when<=now) {
      notify('Orbit',item.title);
      if (settings.speakReminders) speak(`${t('reminderPrefix')} ${item.title}`);
      if (item.repeat==='once') item.done=true;
      else item.when=nextOccurrence(item.when,item.repeat,item.days||[],now);
      changed=true;
    }
  }
  if(changed){saveTasks();renderAll();}
}
// A single-device convenience profile. The password hash is not data encryption or cloud authentication.
const base64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (str) => Uint8Array.from(atob(str),ch=>ch.charCodeAt(0));
async function derivePassword(password, salt) {
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},key,256);
  return new Uint8Array(bits);
}
function sameHash(a,b) { if (a.length!==b.length) return false; let diff=0;for(let i=0;i<a.length;i++) diff|=a[i]^b[i];return diff===0; }
function showAuth() {
  $('appView').classList.add('hidden');$('authView').classList.remove('hidden');
  $('authMessage').textContent = '';
  $('authTitle').textContent = profile ? t('welcome') : t('welcome');
  $('authIntro').textContent = profile ? `${t('enterPassword')} ${profile.username}.` : t('localProfileIntro');
  $('confirmWrap').classList.toggle('hidden',!!profile);
  $('authUsername').value = profile?.username ?? '';
  $('authUsername').readOnly = !!profile;
  $('authPassword').value='';$('authConfirm').value='';
  $('authPassword').autocomplete = profile ? 'current-password' : 'new-password';
  $('authSubmit').textContent = profile ? t('signIn') : t('createProfile');
  $('authPassword').focus();
}
function setLoggedIn(remember) {
  localStorage.removeItem(KEYS.remembered); sessionStorage.removeItem(KEYS.remembered);
  (remember ? localStorage : sessionStorage).setItem(KEYS.remembered,'yes');
  $('authView').classList.add('hidden');$('appView').classList.remove('hidden');
  $('userAvatar').textContent = (profile?.username?.[0] || 'U').toUpperCase();
  $('settingsAvatar').textContent = $('userAvatar').textContent;
  $('settingsUsername').textContent = profile?.username || 'User';
  applyLanguage();showPage('dashboard');renderAll();
  cloud.start();
  dueCheck(); if(settings.city && !weatherData) refreshWeather();
  if(isTauri()) invoke('set_close_to_tray',{enabled:!!settings.closeToTray}).catch(console.warn);
}
function signOut() { cloud.stop(); localStorage.removeItem(KEYS.remembered);sessionStorage.removeItem(KEYS.remembered);stopAudio();showAuth(); }

// Lovable-inspired click ripples. Event delegation also covers dynamically created preset/web buttons.
document.addEventListener('pointerdown', (event) => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (event.button !== 0) return;
  const button = event.target instanceof Element ? event.target.closest('button') : null;
  if (!button || button.disabled || button.classList.contains('color-choice') || button.classList.contains('header-accent')) return;
  const bounds = button.getBoundingClientRect();
  const ripple = document.createElement('span');
  ripple.className = 'orbit27-ripple';
  ripple.style.left = `${event.clientX - bounds.left}px`;
  ripple.style.top = `${event.clientY - bounds.top}px`;
  button.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  setTimeout(() => ripple.remove(), 800);
});

$('authForm').onsubmit = async (e) => {
  e.preventDefault();const user=$('authUsername').value.trim();const password=$('authPassword').value;
  $('authSubmit').disabled=true;$('authMessage').textContent='';
  try {
    if (!profile) {
      if (user.length<2) throw Error(t('authNeedsUser'));
      if(password.length<8) throw Error(t('authShortPassword'));
      if(password!==$('authConfirm').value) throw Error(t('authMismatch'));
      const salt=crypto.getRandomValues(new Uint8Array(16));const hash=await derivePassword(password,salt);
      profile={username:user,salt:base64(salt),hash:base64(hash)};
      localStorage.setItem(KEYS.profile,JSON.stringify(profile));
    } else {
      if(!password) throw Error(t('enterPassword'));
      const actual=await derivePassword(password,fromBase64(profile.salt));
      if(!sameHash(actual,fromBase64(profile.hash))) throw Error(t('authFailed'));
    }
    setLoggedIn($('rememberMe').checked);
  } catch(err) { $('authMessage').textContent=String(err.message||t('authError')); } finally { $('authSubmit').disabled=false; }
};
$('authLanguage').onclick = () => setLanguage(settings.language==='en'?'ro':'en');
$('topLanguage').onclick = () => setLanguage(settings.language==='en'?'ro':'en');
document.querySelectorAll('.nav-btn').forEach(btn => btn.onclick=()=>showPage(btn.dataset.page));
document.querySelectorAll('[data-go]').forEach(btn=>btn.onclick=()=>showPage(btn.dataset.go));
$('dashAdd').onclick=()=>{showPage('reminders');$('taskText').focus();};
$('repeat').onchange=()=>$('days').classList.toggle('hidden',$('repeat').value!=='custom');
$('calendarPrev').onclick = () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); renderReminderCalendar(); };
$('calendarNext').onclick = () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); renderReminderCalendar(); };
document.querySelectorAll('[data-quick-date]').forEach(button => button.onclick = () => {
  const day = new Date(); day.setDate(day.getDate() + Number(button.dataset.quickDate)); chooseReminderDate(day);
});
function updateReminderTime(value) {
  const selected = selectedReminderDate();
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return;
  selected.setHours(hours, minutes, 0, 0);
  const now = new Date();
  if (selected.getTime() <= now.getTime() && selected.toDateString() === now.toDateString()) {
    selected.setDate(selected.getDate() + 1);
    toast(t('quickTimePast'));
  }
  setReminderDateTime(localValue(selected));
}
document.querySelectorAll('[data-quick-time]').forEach(button => button.onclick = () => updateReminderTime(button.dataset.quickTime));
document.querySelectorAll('[data-time-offset]').forEach(button => button.onclick = () => {
  const selected = new Date(Date.now() + Number(button.dataset.timeOffset) * 60000);
  selected.setSeconds(0, 0);
  setReminderDateTime(localValue(selected));
});
const shiftTime = (minutes) => {
  const date = selectedReminderDate();
  date.setMinutes(date.getMinutes() + minutes);
  setReminderDateTime(localValue(date));
};
$('timeMinus').onclick = () => shiftTime(-15);
$('timePlus').onclick = () => shiftTime(15);
$('taskTime').onchange = () => {
  const d = selectedReminderDate();
  const [hours, minutes] = $('taskTime').value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;
  d.setHours(hours, minutes, 0, 0);
  $('taskDate').value = localValue(d);
  renderReminderCalendar();
};
$('taskForm').onsubmit=e=>{
  e.preventDefault();const title=$('taskText').value.trim();const when=new Date($('taskDate').value).getTime();const repeat=$('repeat').value;
  if(!title||!Number.isFinite(when))return;
  if(when<=Date.now()&&!editTaskId){toast(t('pastDate'));return;}
  if(repeat==='custom'&&!selectedDays.length){toast(t('setDay'));return;}
  if(editTaskId){const item=tasks.find(x=>x.id===editTaskId);if(item){Object.assign(item,{title,when,repeat,days:repeat==='custom'?[...selectedDays]:[],done:false});}}
  else tasks.push({id:createId(),title,when,repeat,days:repeat==='custom'?[...selectedDays]:[],done:false});
  saveTasks();resetTaskForm();renderAll();toast(t('taskSaved'));
};
$('cancelTaskEdit').onclick=resetTaskForm;
$('clearDone').onclick=()=>{if(!tasks.some(t=>t.done))return;if(!confirm(t('clearConfirm')))return;tasks=tasks.filter(t=>!t.done);saveTasks();renderAll();};
$('exportBtn').onclick=()=>{const blob=new Blob([JSON.stringify({version:'3.0',tasks,presets,settings:{language:settings.language,city:settings.city}},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`orbit-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);};
$('importBtn').onclick=()=>{const picker=document.createElement('input');picker.type='file';picker.accept='.json,application/json';picker.onchange=async()=>{
 const file=picker.files?.[0];if(!file)return;
 try{if(file.size>2_000_000)throw Error('Backup is too large.');const raw=JSON.parse(await file.text());
 if(!raw||!Array.isArray(raw.tasks)||!Array.isArray(raw.presets))throw Error('Not an ORBIT backup.');
 const cleanTasks=raw.tasks.slice(0,5000).filter(item=>item&&typeof item.title==='string'&&Number.isFinite(Number(item.when))).map(item=>({id:String(item.id||createId()),title:item.title.slice(0,300),when:Number(item.when),repeat:['once','daily','weekdays','custom'].includes(item.repeat)?item.repeat:'once',days:Array.isArray(item.days)?item.days.filter(d=>Number.isInteger(d)&&d>=0&&d<=6):[],done:!!item.done}));
 const cleanPresets=raw.presets.slice(0,150).filter(p=>p&&typeof p.name==='string'&&Array.isArray(p.paths)).map(p=>({name:p.name.slice(0,100),paths:p.paths.filter(v=>typeof v==='string'&&/\.(exe|lnk)$/i.test(v)).slice(0,20)}));
 if(!confirm(t('importConfirm')))return;
 tasks=cleanTasks;presets=cleanPresets;saveTasks();savePresets();renderAll();toast(t('importDone'));
 }catch(err){toast(String(err));}};picker.click();};
$('notifyBtn').onclick=async()=>{const ok=await ensureNotifyPermission();$('notifyBtn').textContent=ok?t('notificationsEnabled'):t('enableNotifications');toast(ok?t('notificationActive'):t('permissionNeeded'));};
$('presetForm').onsubmit=e=>{e.preventDefault();const name=$('presetName').value.trim();if(!name)return;if(!selectedPaths.length){toast(t('presetRequired'));return;}const item={name,paths:[...selectedPaths]};if(editPresetIndex===null)presets.push(item);else presets[editPresetIndex]=item;savePresets();resetPresetForm();renderAll();toast(t('saved'));};
$('cancelPresetEdit').onclick=resetPresetForm;
$('browseAppBtn').onclick=async()=>{if(!isTauri()){toast(t('browseUnsupported'));return;}try{const result=await open({multiple:true,directory:false,title:t('browseApps'),filters:[{name:'Windows applications and shortcuts',extensions:['exe','lnk']}]});if(!result)return;for(const path of Array.isArray(result)?result:[result])addPath(path);}catch(e){toast(String(e));}};
$('refreshInstalledBtn').onclick=async()=>{if(!isTauri()){toast(t('browseUnsupported'));return;}$('installedList').textContent=t('loadingApps');try{installedApps=await invoke('list_installed_apps');renderInstalled();}catch(e){console.error(e);$('installedList').textContent=String(e);}};
$('appSearch').oninput=renderInstalled;
$('googleSearchForm').onsubmit = e => {
  e.preventDefault();
  const query = $('googleSearchInput').value.trim();
  if (!query) { toast(t('emptySearch')); return; }
  openWebsite(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
};
$('cityForm').onsubmit=e=>{e.preventDefault();const name=$('cityInput').value.trim();if(name.length<2){toast(t('emptyCity'));return;}searchCities(name);};
$('refreshWeather').onclick=()=>refreshWeather();
$('languageSelect').onchange=e=>setLanguage(e.target.value);
$('voiceEngine').onchange=e=>{settings.voiceEngine=e.target.value;voiceLastError='';saveSettings();renderVoiceEngine();};
$('azureVoice').onchange=e=>{settings.azureVoice=e.target.value;saveSettings();};
$('azureSave').onclick=async()=>{try{
 const region=$('azureRegion').value.trim();const key=$('azureKey').value.trim();
 if(!region){toast(t('azureRegionRequired'));return;}
 await invoke('set_azure_config',{region,key});$('azureKey').value='';await refreshAzureStatus();toast(t('azureSaved'));
 }catch(err){toast(String(err));}};
$('azureClear').onclick=async()=>{try{await invoke('clear_azure_config');$('azureKey').value='';await refreshAzureStatus();toast(t('azureCleared'));}catch(err){toast(String(err));}};
$('voiceSelect').onchange=e=>{settings.voiceURI=e.target.value;saveSettings();};
function updateSliderTrack(input){
 const min=Number(input.min)||0, max=Number(input.max)||100;
 const pct=Math.max(0,Math.min(100,((Number(input.value)-min)/(max-min||1))*100));
 input.parentElement?.style.setProperty('--range-pct',pct+'%');
}
function updateAllSliderTracks(){['voiceSpeed','voicePitch','voiceVolume'].forEach(id=>updateSliderTrack($(id)));}
$('voiceVolume').oninput=e=>{ updateSliderTrack(e.target); settings.voiceVolume = Number(e.target.value) / 100; $('voiceVolumeValue').textContent = `${Math.round(normalizedVolume()*100)}%`; saveSettings(); };
document.querySelectorAll('[data-accent-choice], [data-header-accent]').forEach(button => button.onclick = () => { settings.accentColor = button.dataset.accentChoice || button.dataset.headerAccent; saveSettings(); applyAppearance(); });
$('surfaceStyle').onchange = e => { settings.surfaceStyle = e.target.value; saveSettings(); applyAppearance(); };
$('compactMode').onchange = e => { settings.compactMode = e.target.checked; saveSettings(); applyAppearance(); };
$('showQuickWeb').onchange = e => { settings.showQuickWeb = e.target.checked; saveSettings(); applyAppearance(); };
$('resetAppearance').onclick = () => { Object.assign(settings, {accentColor:defaults.accentColor, surfaceStyle:defaults.surfaceStyle, compactMode:false}); saveSettings(); applyAppearance(); };
$('cloudProjectUrl').value=cloud.url || '';
$('cloudPublishableKey').placeholder=cloud.ready?'Key saved · paste a new key to replace':'sb_publishable_… (public key)';
$('cloudSaveConfig').onclick=()=>{
 const url=$('cloudProjectUrl').value.trim().replace(/\/$/,'');
 const key=$('cloudPublishableKey').value.trim();
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)){toast('Enter a valid Supabase Project URL.');return;}
 if(!key || !((key.startsWith('sb_publishable_')||key.startsWith('eyJ')) && key.length>30)){
  toast('Enter your Supabase publishable or legacy anon key (never a secret key).');return;
 }
 cloud.url=url;cloud.key=key;cloud.ready=true;
 localStorage.setItem('orbit3_cloud_connection_v1',JSON.stringify({url,anonKey:key}));
 $('cloudPublishableKey').value='';cloud.status('Connection saved. Sign in to sync reminders.');
 toast('Supabase connection saved.');
};
$('cloudForm').onsubmit = async e => { e.preventDefault(); try { await cloud.signIn($('cloudEmail').value.trim(), $('cloudPassword').value); $('cloudPassword').value = ''; toast('Cloud connected. Reminders are syncing.'); } catch(err) { toast(String(err.message || err)); } };
$('cloudSignUp').onclick = async () => { try { const active = await cloud.signUp($('cloudEmail').value.trim(), $('cloudPassword').value); $('cloudPassword').value = ''; toast(active ? 'Cloud account created.' : 'Check your email, confirm your account, then sign in.'); } catch(err) { toast(String(err.message || err)); } };
$('cloudSyncNow').onclick = async () => { try { if (!cloud.isSignedIn()) throw new Error('Sign in to ORBIT Cloud first.'); await cloud.sync(); toast('Cloud sync complete.'); } catch(err) { toast(String(err.message || err)); } };
$('cloudSignOut').onclick = () => { cloud.signOut(); toast('Cloud disconnected. Reminders remain on this PC.'); };
 
$('voiceSpeed').oninput=e=>{updateSliderTrack(e.target);settings.rate=Number(e.target.value);$('rateValue').textContent=settings.rate.toFixed(2)+'×';saveSettings();};
$('voicePitch').oninput=e=>{updateSliderTrack(e.target);settings.pitch=Number(e.target.value);$('pitchValue').textContent=settings.pitch.toFixed(2);saveSettings();};
$('speakReminders').onchange=e=>{settings.speakReminders=e.target.checked;saveSettings();};
$('speakBtn').onclick=$('testVoice').onclick=()=>speak(t('testPhrase'));
$('reloadVoices').onclick=populateVoices;
$('lockBtn').onclick=signOut;
$('logoutAllBtn').onclick=()=>{signOut();toast(t('signedOut'));};
$('startupToggle').onchange=async(e)=>{const checked=e.target.checked;if(!isTauri()){e.target.checked=false;toast(t('startupUnavailable'));return;}try{if(checked)await enableAutostart();else await disableAutostart();e.target.checked=await autostartIsEnabled();}catch(err){e.target.checked=!checked;toast(`${t('startupFailed')} ${String(err)}`);}};
$('minimizeTrayToggle').onchange=async(e)=>{const checked=e.target.checked;if(!isTauri()){e.target.checked=false;toast(t('trayUnavailable'));return;}try{await invoke('set_close_to_tray',{enabled:checked});settings.closeToTray=checked;saveSettings();}catch(err){e.target.checked=!checked;toast(String(err));}};

// ORBIT 2.8.1 — use the existing Reminders date picker; dashboard shows a read-only today list.
const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
const sameDate = (a,b) => dateKey(a) === dateKey(b);
function agendaRow(item) {
  const node = document.createElement('div'); node.className='agenda-entry';
  const pip=document.createElement('span');pip.className='agenda-pip';
  const content=document.createElement('div');const title=document.createElement('strong');title.textContent=item.title;
  const time=document.createElement('small');time.textContent=fmt(item.when);
  content.append(title,time); node.append(pip,content); return node;
}
function renderAgendaDashboard() {
  const area=$('agendaDashboard');if(!area)return;area.replaceChildren();
  const now=new Date();const today=tasks.filter(x=>!x.done&&sameDate(new Date(x.when),now)).sort((a,b)=>a.when-b.when);
  if(!today.length){area.textContent=t('noAgendaItems');area.classList.add('muted');return;}
  area.classList.remove('muted');today.slice(0,3).forEach(x=>area.append(agendaRow(x)));
  if(today.length>3){const more=document.createElement('div');more.className='small muted';more.textContent=`+${today.length-3}`;area.append(more);}
}
// Timers persist timestamps so they remain accurate when the window is minimized.
const timerDefaults={countdown:{duration:300000,remaining:300000,endAt:null,running:false,completed:false},stopwatch:{elapsed:0,startAt:null,running:false,laps:[]},tab:'countdown'};
function readTimerState(){const raw=read(KEYS.timers,null);if(!raw||typeof raw!=='object')return structuredClone(timerDefaults);
 const c=raw.countdown||{},s=raw.stopwatch||{};
 return {tab:raw.tab==='stopwatch'?'stopwatch':'countdown',countdown:{duration:Math.max(0,Math.min(3599999000,Number(c.duration)||300000)),remaining:Math.max(0,Math.min(3599999000,Number(c.remaining)||0)),endAt:Number.isFinite(c.endAt)?c.endAt:null,running:!!c.running,completed:!!c.completed},stopwatch:{elapsed:Math.max(0,Number(s.elapsed)||0),startAt:Number.isFinite(s.startAt)?s.startAt:null,running:!!s.running,laps:Array.isArray(s.laps)?s.laps.slice(-30).filter(n=>Number.isFinite(n)&&n>=0):[]}};}
let timerState=readTimerState();let timerSaveAt=0;
const saveTimers=()=>localStorage.setItem(KEYS.timers,JSON.stringify(timerState));
const countdownRemaining=()=>timerState.countdown.running&&timerState.countdown.endAt!==null?Math.max(0,timerState.countdown.endAt-Date.now()):timerState.countdown.remaining;
// Wall clock time persists across app restarts; the monotonic clock prevents
// stutter when the Windows clock is synchronized during an active session.
let stopwatchMonoStart=null, stopwatchFrame=null;
const elapsedStopwatch=()=>timerState.stopwatch.elapsed+(timerState.stopwatch.running&&timerState.stopwatch.startAt!==null?Math.max(0,stopwatchMonoStart===null?Date.now()-timerState.stopwatch.startAt:performance.now()-stopwatchMonoStart):0);
const timerFormat=(millis,decimals=false)=>{const n=Math.max(0,Math.floor(millis));const h=Math.floor(n/3600000),m=Math.floor(n/60000)%60,s=Math.floor(n/1000)%60;return `${h?pad(h)+':':''}${pad(m)}:${pad(s)}${decimals?'.'+pad(Math.floor(n%1000/10)):''}`;};
const setText=(id,value)=>{const el=$(id);if(el && el.textContent!==value)el.textContent=value;};
let countdownAlerted=false;
function timerCheckCompletion(){const c=timerState.countdown;if(c.running&&countdownRemaining()<=0){c.running=false;c.endAt=null;c.remaining=0;c.completed=true;saveTimers();if(!countdownAlerted){countdownAlerted=true;toast(t('timerFinished'));notify('ORBIT',t('timerFinished'));}renderTimerUI();}}
function paintTimerDisplays(){
 if($('appView').classList.contains('hidden'))return;
 timerCheckCompletion();const c=timerState.countdown,s=timerState.stopwatch;
 if(activePage==='timers'){
   if(timerState.tab==='countdown')setText('countdownDisplay',timerFormat(countdownRemaining()));
   if(timerState.tab==='stopwatch')setText('stopwatchDisplay',timerFormat(elapsedStopwatch(),true));
 }
 if(activePage==='dashboard'){
   const active=c.running||s.running;
   const display=c.running?timerFormat(countdownRemaining()):s.running?timerFormat(elapsedStopwatch(),true):'—';
   setText('dashboardTimerDisplay',display);
   setText('dashboardTimerState',active?(c.running?t('countdown'):t('stopwatch')):t('timerIdle'));
 }
}
function scheduleStopwatchFrame(){
 if(stopwatchFrame!==null || !timerState.stopwatch.running || activePage!=='timers' || timerState.tab!=='stopwatch'|| document.hidden)return;
 const frame=()=>{stopwatchFrame=null;
   if(!timerState.stopwatch.running || activePage!=='timers'||timerState.tab!=='stopwatch'|| document.hidden)return;
   setText('stopwatchDisplay',timerFormat(elapsedStopwatch(),true));
   stopwatchFrame=requestAnimationFrame(frame);
 };
 stopwatchFrame=requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden){paintTimerDisplays();scheduleStopwatchFrame();}});
function renderTimerUI(){
 const c=timerState.countdown,s=timerState.stopwatch;
 $('countdownTab').classList.toggle('active',timerState.tab==='countdown');$('stopwatchTab').classList.toggle('active',timerState.tab==='stopwatch');
 $('countdownTab').setAttribute('aria-selected',String(timerState.tab==='countdown'));$('stopwatchTab').setAttribute('aria-selected',String(timerState.tab==='stopwatch'));
 $('countdownPane').classList.toggle('hidden',timerState.tab!=='countdown');$('stopwatchPane').classList.toggle('hidden',timerState.tab!=='stopwatch');
 setText('countdownDisplay',timerFormat(countdownRemaining()));setText('stopwatchDisplay',timerFormat(elapsedStopwatch(),true));
 setText('countdownStart',c.running?t('timerRunning'):(c.remaining<c.duration&&c.remaining>0?t('resume'):t('start')));
 $('countdownStart').disabled=c.running;$('countdownPause').disabled=!c.running;
 $('countdownMinutes').disabled=c.running;$('countdownSeconds').disabled=c.running;
 setText('stopwatchStart',s.running?t('timerRunning'):(s.elapsed>0?t('resume'):t('start')));
 $('stopwatchStart').disabled=s.running;$('stopwatchPause').disabled=!s.running;$('stopwatchLap').disabled=!s.running;
 setText('countdownStatus',c.completed?t('timerFinished'):(c.running?t('timerRunning'):''));
 const active=c.running||s.running;setText('dashboardTimerDisplay',active?(c.running?timerFormat(countdownRemaining()):timerFormat(elapsedStopwatch(),true)):'—');
 setText('dashboardTimerState',active?(c.running?t('countdown'):t('stopwatch')):t('timerIdle'));
 const list=$('stopwatchLaps');if(list.childElementCount!==s.laps.length){list.replaceChildren();s.laps.forEach((value,index)=>{let li=document.createElement('li');li.textContent=`${t('lap')} ${index+1} — ${timerFormat(value,true)}`;list.append(li);});}
 scheduleStopwatchFrame();
}
function setTimerTab(tab){timerState.tab=tab;saveTimers();renderTimerUI();}
$('countdownTab').onclick=()=>setTimerTab('countdown');$('stopwatchTab').onclick=()=>setTimerTab('stopwatch');
function setCountdownInput(){let minutes=Number($('countdownMinutes').value), seconds=Number($('countdownSeconds').value);if(!Number.isFinite(minutes)||!Number.isFinite(seconds)||minutes<0||seconds<0)return;
 minutes=Math.min(999,Math.floor(minutes));seconds=Math.min(59,Math.floor(seconds));timerState.countdown.duration=(minutes*60+seconds)*1000;timerState.countdown.remaining=timerState.countdown.duration;timerState.countdown.completed=false;countdownAlerted=false;saveTimers();renderTimerUI();}
$('countdownMinutes').onchange=setCountdownInput;$('countdownSeconds').onchange=setCountdownInput;
document.querySelectorAll('[data-minutes]').forEach(b=>b.onclick=()=>{if(timerState.countdown.running)return;$('countdownMinutes').value=b.dataset.minutes;$('countdownSeconds').value='0';setCountdownInput();});
$('countdownStart').onclick=()=>{const c=timerState.countdown;if(c.running)return;if(c.remaining<=0){setCountdownInput();}if(c.remaining<=0){toast(t('minutes')+'?');return;}c.endAt=Date.now()+c.remaining;c.running=true;c.completed=false;countdownAlerted=false;saveTimers();renderTimerUI();};
$('countdownPause').onclick=()=>{const c=timerState.countdown;c.remaining=countdownRemaining();c.running=false;c.endAt=null;saveTimers();renderTimerUI();};
$('countdownReset').onclick=()=>{let c=timerState.countdown;c.running=false;c.endAt=null;c.completed=false;countdownAlerted=false;setCountdownInput();renderTimerUI();};
$('stopwatchStart').onclick=()=>{const s=timerState.stopwatch;if(s.running)return;s.startAt=Date.now();stopwatchMonoStart=performance.now();s.running=true;saveTimers();renderTimerUI();};
$('stopwatchPause').onclick=()=>{const s=timerState.stopwatch;if(!s.running)return;s.elapsed=elapsedStopwatch();s.running=false;s.startAt=null;stopwatchMonoStart=null;saveTimers();renderTimerUI();};
$('stopwatchLap').onclick=()=>{const s=timerState.stopwatch;if(!s.running)return;s.laps.push(elapsedStopwatch());s.laps=s.laps.slice(-30);saveTimers();renderTimerUI();};
$('stopwatchReset').onclick=()=>{timerState.stopwatch={elapsed:0,startAt:null,running:false,laps:[]};stopwatchMonoStart=null;saveTimers();renderTimerUI();};
// Windows-native measurements; browser preview never displays fabricated percentages.
let metrics=null,metricsBusy=false,metricsAt=0;
function metricText(v){return typeof v==='number'&&Number.isFinite(v)?`${Math.max(0,Math.min(100,Math.round(v)))}%`:'—';}
function renderMetrics(){
 [['cpu','cpu'],['gpu','gpu'],['ram','ram']].forEach(([key,id])=>{let v=metrics?.[key];$(id+'Value').textContent=metricText(v);$(id+'Mini').textContent=metricText(v);$(id+'Bar').style.width=Number.isFinite(v)?Math.max(0,Math.min(100,v))+'%':'0%';});
 $('ramDetails').textContent=metrics?.memoryTotalGb?`${metrics.memoryUsedGb.toFixed(1)} / ${metrics.memoryTotalGb.toFixed(1)} GB`:'';
 $('systemStatus').textContent=metrics? (settings.language==='ro'?'Date Windows actualizate.':'Windows data updated.') : t('systemDesktopOnly');
}
async function pollMetrics(force=false){
 if(!isTauri()||metricsBusy||$('appView').classList.contains('hidden'))return;
 if(!force&&Date.now()-metricsAt<8500)return;
 metricsBusy=true;metricsAt=Date.now();try{const out=await invoke('system_snapshot');const obj=JSON.parse(out);if(obj&&typeof obj==='object'){metrics=obj;renderMetrics();}}catch(err){console.warn('System monitor:',err);$('systemStatus').textContent=t('systemFailed')+' '+String(err).slice(0,140);}finally{metricsBusy=false;}
}
$('systemRefresh').onclick=()=>pollMetrics(true);
// Google News RSS is fetched by the trusted desktop backend, avoiding browser CORS and proxy services.
let newsAt=0,newsBusy=false,newsItems=[],newsLang='';
function renderNews(){const area=$('newsFeed');area.replaceChildren();
 if(!newsItems.length)return;
 newsItems.slice(0,16).forEach(item=>{const card=document.createElement('article');card.className='news-entry';
 const meta=document.createElement('div');meta.className='news-meta';meta.textContent=[item.source,item.published].filter(Boolean).join(' · ');
 const title=document.createElement('button');title.type='button';title.className='news-title';title.textContent=item.title;
 title.title=item.link;title.onclick=()=>{if(/^https:\/\/news\.google\.com\//i.test(item.link))openWebsite(item.link);};
 card.append(meta,title);area.append(card);});
}
function parseGoogleNews(xml){const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.querySelector('parsererror'))throw Error('Invalid RSS response');
 return Array.from(doc.querySelectorAll('item')).slice(0,24).map(it=>{
 const tag=name=>it.getElementsByTagName(name)[0]?.textContent?.trim()||'';
 const link=tag('link');if(!/^https:\/\/news\.google\.com\//i.test(link))return null;
 const rawDate=tag('pubDate'),d=new Date(rawDate);
 return {title:tag('title').slice(0,240),source:tag('source').slice(0,70),published:Number.isFinite(d.getTime())?d.toLocaleDateString(settings.language==='ro'?'ro-RO':'en-GB',{day:'numeric',month:'short'}):'',link};
 }).filter(x=>x&&x.title);
}
async function refreshNews(force=false){
 if(newsBusy||$('appView').classList.contains('hidden'))return;
 const lang=settings.language;
 if(!force&&newsLang===lang&&newsItems.length&&Date.now()-newsAt<15*60*1000)return;
 if(!isTauri()){$('newsStatus').textContent=t('newsDesktop');return;}
 newsBusy=true;$('newsStatus').textContent=t('newsLoading');
 try{const xml=await invoke('google_news_rss',{language:lang});const result=parseGoogleNews(xml);if(!result.length)throw Error(t('newsEmpty'));
 newsItems=result;newsLang=lang;newsAt=Date.now();localStorage.setItem(KEYS.newsCache,JSON.stringify({items:result,at:newsAt,lang}));renderNews();$('newsStatus').textContent='';
 }catch(e){console.warn('Google News:',e);$('newsStatus').textContent=t('newsError');}finally{newsBusy=false;}
}
$('newsRefresh').onclick=()=>refreshNews(true);
try{const cache=read(KEYS.newsCache,{});if(Array.isArray(cache.items)&&Date.now()-cache.at<60*60*1000){newsItems=cache.items;newsAt=Number(cache.at)||0;newsLang=cache.lang;}}catch{}
renderNews();
// F11 controls the native Tauri window, not only the inner WebView document.
let fullScreenBusy=false;
async function toggleFullScreen(){if(fullScreenBusy)return;fullScreenBusy=true;try{if(isTauri()){const active=await invoke('toggle_fullscreen');$('fullscreenBtn').setAttribute('aria-pressed',String(active));}else if(document.fullscreenElement){await document.exitFullscreen();}else{await document.documentElement.requestFullscreen();}}catch(err){toast(String(err));}finally{fullScreenBusy=false;}}
$('fullscreenBtn').onclick=toggleFullScreen;
window.addEventListener('keydown',evt=>{if(evt.key==='F11'&&!evt.repeat){evt.preventDefault();toggleFullScreen();}});
document.addEventListener('fullscreenchange',()=>{$('fullscreenBtn').setAttribute('aria-pressed',String(!!document.fullscreenElement));});

function updateClock(){
  setText('clock',new Date().toLocaleTimeString(settings.language==='ro'?'ro-RO':'en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}));
}
function tickBackground(){
  if(!$('appView').classList.contains('hidden')) dueCheck();
  pollMetrics();
  if(activePage==='dashboard')refreshNews();
  if(settings.city && weatherRequestedAt && Date.now()-weatherRequestedAt>15*60*1000 && !weatherLoading && !$('appView').classList.contains('hidden')) refreshWeather();
}
async function init() {
  applyLanguage();
  // ORBIT 3.0 uses Windows voices or official online Azure voices. No Piper startup requirement.
  if(settings.voiceEngine!=='system'&&settings.voiceEngine!=='azure'){settings.voiceEngine='system';saveSettings();}
  await refreshAzureStatus();
  renderVoiceEngine();
  $('voiceSpeed').value=String(settings.rate);$('voicePitch').value=String(settings.pitch);
  $('voiceVolume').value = String(Math.round(normalizedVolume()*100)); $('voiceVolumeValue').textContent = `${Math.round(normalizedVolume()*100)}%`;
  updateAllSliderTracks();
  applyAppearance();
  $('rateValue').textContent=Number(settings.rate).toFixed(2)+'×';$('pitchValue').textContent=Number(settings.pitch).toFixed(2);
  $('speakReminders').checked=!!settings.speakReminders;$('minimizeTrayToggle').checked=!!settings.closeToTray;
  setReminderDateTime(localValue(new Date(Date.now()+30*60000)));
  if('speechSynthesis' in window){speechSynthesis.onvoiceschanged=populateVoices;populateVoices();setTimeout(populateVoices,900);}
  if(isTauri()){try{$('startupToggle').checked=await autostartIsEnabled();}catch(err){console.warn(err);}}
  if(profile && (localStorage.getItem(KEYS.remembered)==='yes'||sessionStorage.getItem(KEYS.remembered)==='yes'))setLoggedIn(localStorage.getItem(KEYS.remembered)==='yes');
  else showAuth();
  const durationSeconds=Math.floor(timerState.countdown.duration/1000);
  $('countdownMinutes').value=String(Math.floor(durationSeconds/60));$('countdownSeconds').value=String(durationSeconds%60);
  renderTimerUI();updateClock();tickBackground();
  setInterval(updateClock,1000);
  setInterval(tickBackground,5000);
  setInterval(()=>{if(timerState.countdown.running||timerState.stopwatch.running){paintTimerDisplays();}},100);
}
init();
