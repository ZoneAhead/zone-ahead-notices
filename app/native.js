// Where the iPhone and Android apps fetch the latest road safety notices, so a new notice doesn't need an app update.
// The live list on GitHub Pages (Zoneahead/zone-ahead-notices). If it can't be reached, the app uses the copy built into it.
window.ZA_NOTICES_URL = 'https://zoneahead.github.io/zone-ahead-notices/notices.json';

// Inside the iPhone app, use the native location plugin instead of the web view's own location
// (no repeated "localhost would like to use your location" prompt, better accuracy and speed).
(function () {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  var G = C.Plugins && C.Plugins.Geolocation;
  if (!G) return;
  var code = function (e) { return /denied|permission|disabled|not enabled/i.test(String(e && e.message || e)) ? 1 : 2; };
  var wrap = function (p) { return { coords: p.coords, timestamp: p.timestamp }; };
  var ids = {}, n = 0;
  var shim = {
    getCurrentPosition: function (ok, err, opt) {
      G.getCurrentPosition(opt || {}).then(function (p) { ok(wrap(p)); })
        .catch(function (e) { if (err) err({ code: code(e), message: String(e && e.message || e) }); });
    },
    watchPosition: function (ok, err, opt) {
      var k = ++n;
      G.watchPosition(opt || {}, function (p, e) {
        if (e) { if (err) err({ code: code(e), message: String(e.message || e) }); return; }
        if (p) ok(wrap(p));
      }).then(function (id) { if (ids[k] === null) G.clearWatch({ id: id }); else ids[k] = id; });
      return k;
    },
    clearWatch: function (k) { if (ids[k]) G.clearWatch({ id: ids[k] }); ids[k] = null; }
  };
  try { Object.defineProperty(navigator, 'geolocation', { value: shim, configurable: true }); } catch (e) { }
})();

// Status bar text: follows the theme (white on dark, dark on light). In Car mode on a phone held upright the map shows
// behind it (the card floats below the Dynamic Island); in landscape Car mode the card's colour is behind it.
(function () {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  var SB = C.Plugins && C.Plugins.StatusBar;
  if (!SB) return;
  var last = '';
  function lightText() {
    if (document.body && document.body.classList.contains('carmode') && !document.body.classList.contains('zadrive')) return true;
    var m = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g);
    if (!m) return false;
    return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) < 128;
  }
  function sync() {
    var s = lightText() ? 'DARK' : 'LIGHT';   // the plugin's DARK style = light text, for dark backgrounds
    if (s !== last) { last = s; SB.setStyle({ style: s }).catch(function () { }); }
  }
  function start() {
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-style'] });
    sync();
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();

// CarPlay: send what the Car mode card shows to the car screen, and carry out its report buttons.
(function () {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  var CP = C.Plugins && C.Plugins.ZoneAheadCarPlay;
  if (!CP) return;
  var txt = function (sel) { var e = document.querySelector(sel); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; };
  var LEVEL = { '#b81a2c': 'zone', '#a85400': 'ahead', '#17663b': 'clear' };
  var last = '';
  function state() {
    var driving = !!(document.body && document.body.classList.contains('carmode'));
    var car = document.getElementById('car'), bg = car ? car.style.getPropertyValue('--carbg').trim().toLowerCase() : '';
    return {
      driving: driving,
      title: driving ? (txt('#car .cbig') || 'Driving') : 'Zone Ahead',
      detail: driving ? [txt('#car .csm b') || txt('#car .csm'), txt('#car .csm small')].filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' · ') : '',
      distance: driving ? (txt('#car .cnear .cdist2') || txt('#car .cdist')).replace(/^✓$/, '') : '',
      level: LEVEL[bg] || (/^#(b|c|d)/.test(bg) ? 'zone' : 'clear'),
      ahead: driving ? txt('#aheadChip .ahn') : ''
    };
  }
  setInterval(function () {
    var s = state(), k = JSON.stringify(s);
    if (k !== last) { last = k; CP.update(s).catch(function () { }); }
  }, 1000);
  // a report button on the car screen: the same as tapping Report, then that kind (camera car, police, a road hazard)
  CP.addListener('report', function (d) {
    var KINDS = ['camera', 'police', 'hazard', 'pothole', 'crash', 'roadworks'];
    var kind = d && KINDS.indexOf(d.kind) >= 0 ? d.kind : 'camera';
    var tap = function (sel) { var e = document.querySelector(sel); if (e) e.click(); return !!e; };
    if (document.body.classList.contains('carmode')) {
      if (tap('#car [data-act="report"]')) setTimeout(function () { tap('#car [data-act="send"][data-kind="' + kind + '"]'); }, 60);
    } else if (tap('#reportFab')) setTimeout(function () { tap('#sheet [data-kind="' + kind + '"]'); }, 60);
  });
})();

// iPhone: the app's voice goes through the drive engine (DriveEngine.swift) instead of the web view's own voice, which
// didn't play through the car's speakers in CarPlay (feedback 8 Nov). The engine says it as a voice prompt, the way a
// navigation app does, so CarPlay plays it even with the radio on. Same speechSynthesis the page already uses.
(function () {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform() || !C.getPlatform || C.getPlatform() !== 'ios') return;
  var D = C.Plugins && C.Plugins.ZoneAheadDrive;
  if (!D || !D.speak) return;
  if (typeof window.SpeechSynthesisUtterance !== 'function') {
    window.SpeechSynthesisUtterance = function (text) { this.text = text || ''; this.lang = 'en-AU'; this.rate = 1; this.pitch = 1; this.volume = 1; };
  }
  var talking = 0, gen = 0;
  var synth = {
    get speaking() { return talking > 0; },
    get pending() { return false; },
    get paused() { return false; },
    onvoiceschanged: null,
    addEventListener: function () { },
    removeEventListener: function () { },
    getVoices: function () { return []; },
    speak: function (u) {
      if (!u || !u.text) return;
      talking++; var g = gen;
      D.speak({ text: String(u.text) }).catch(function () { }).then(function () {
        if (g === gen) talking = Math.max(0, talking - 1);
        if (typeof u.onend === 'function') u.onend();
      });
    },
    cancel: function () { talking = 0; gen++; D.stopSpeaking().catch(function () { }); },
    pause: function () { }, resume: function () { }
  };
  try { Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true }); } catch (e) { }
})();

// Android: its web view has no built-in voice, so the app's voice warnings use the phone's text-to-speech engine.
(function () {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform() || !C.getPlatform || C.getPlatform() !== 'android') return;
  var T = C.Plugins && C.Plugins.TextToSpeech;
  if (!T) return;
  if (typeof window.SpeechSynthesisUtterance !== 'function') {
    window.SpeechSynthesisUtterance = function (text) { this.text = text || ''; this.lang = 'en-AU'; this.rate = 1; this.pitch = 1; this.volume = 1; };
  }
  var talking = 0, voices = [];
  var synth = {
    get speaking() { return talking > 0; },
    get pending() { return false; },
    get paused() { return false; },
    onvoiceschanged: null,
    addEventListener: function () { },
    removeEventListener: function () { },
    getVoices: function () { return voices; },
    speak: function (u) {
      if (!u || !u.text) return;
      talking++;
      T.speak({ text: String(u.text), lang: /^en/i.test(u.lang || '') ? 'en-AU' : (u.lang || 'en-AU'), rate: u.rate || 1, pitch: u.pitch || 1, volume: u.volume == null ? 1 : u.volume, queueStrategy: 0 })
        .catch(function () { }).then(function () { talking = Math.max(0, talking - 1); if (typeof u.onend === 'function') u.onend(); });
    },
    cancel: function () { talking = 0; T.stop().catch(function () { }); },
    pause: function () { }, resume: function () { }
  };
  try { Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true }); } catch (e) { }
})();

// Road safety push alerts (Firebase Cloud Messaging). Each phone gets the alerts for the state it's in:
// topics za-vic, za-nsw, za-qld, za-sa and za-act, sent by the notices repository on GitHub when a notice goes live.
// Off until the app's Firebase files are added (GoogleService-Info.plist for iPhone, google-services.json for Android).
window.ZA_PUSH = false;
(function () {
  var C = window.Capacitor;
  if (!window.ZA_PUSH || !C || !C.isNativePlatform || !C.isNativePlatform()) return;
  var M = C.Plugins && C.Plugins.FirebaseMessaging;
  if (!M) return;
  var noop = function () { };
  var get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var put = function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { } };
  var X = function () { return window.ZA_CUST || {}; };
  var $ = function (id) { return document.getElementById(id); };
  var busy = false;

  // keep this phone on its current state's topic (moves with you when you drive interstate)
  function sync() {
    if (busy) return;
    var s = X().noticeState && X().noticeState();
    if (!s) return;
    var t = 'za-' + String(s).toLowerCase(), old = get('za-push-topic');
    if (old === t) return;
    busy = true;
    M.getToken().then(function () { return M.subscribeToTopic({ topic: t }); }).then(function () {
      put('za-push-topic', t);
      if (old) return M.unsubscribeFromTopic({ topic: old }).catch(noop);
    }).catch(noop).then(function () { busy = false; });
  }
  function on() {
    if (C.getPlatform && C.getPlatform() === 'android') M.createChannel({ id: 'za-notices', name: 'Road safety alerts',
      description: 'Police road safety operations and double demerits in your state', importance: 4, visibility: 1 }).catch(noop);
    [0, 3, 8, 15, 30, 60].forEach(function (t) { setTimeout(sync, t * 1000); });   // as soon as your location is known
    setInterval(sync, 5 * 60e3);
  }

  // a push alert came in with the app open, or was tapped: show (or, while driving, say) the notice
  var now = function () { setTimeout(function () { if (X().noticeNow) X().noticeNow(); }, 600); };
  M.addListener('notificationReceived', now).catch(noop);
  M.addListener('notificationActionPerformed', now).catch(noop);
  M.addListener('tokenReceived', function () { put('za-push-topic', null); sync(); }).catch(noop);

  // asking: once, after the first-run intro, when nothing else is on screen and you're not driving; "Not now" asks again in 30 days
  var BELL = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/></svg>';
  function clear() {
    var intro = $('intro'), nb = $('noticeBox');
    return (!intro || intro.hidden) && (!nb || nb.hidden) && !(X().noticeBusy && X().noticeBusy()) && !document.body.classList.contains('carmode') && !document.querySelector('#sheet:not([hidden]), #menu:not([hidden])');
  }
  function ask() {
    var box = document.createElement('div');
    box.id = 'pushAsk';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'paTitle');
    box.innerHTML = '<div class="ntcard in">' +
      '<div class="nthead"><span class="ntico">' + BELL + '</span><span class="nttag">Road safety alerts</span></div>' +
      '<h2 id="paTitle">Get alerts for your state?</h2>' +
      '<p class="nttext">We\'ll let you know when police announce a road safety operation or double demerits where you are. Only road safety notices, never ads.</p>' +
      '<div class="ntbtns"><button type="button" class="btn ntok" id="paYes">Turn on alerts</button><button type="button" class="btn ntno" id="paNo">Not now</button></div></div>';
    document.body.appendChild(box);
    setTimeout(function () { var b = $('paYes'); if (b) b.focus(); }, 50);
    var close = function () { box.remove(); };
    $('paYes').onclick = function () {
      close(); put('za-push-ask', 'yes');
      M.requestPermissions().then(function (r) { if (r && r.receive === 'granted') on(); }).catch(noop);
    };
    $('paNo').onclick = function () { close(); put('za-push-ask', String(Date.now())); };
    box.addEventListener('click', function (e) { if (e.target === box) $('paNo').click(); });   // a tap outside the card: Not now
  }
  function later(tries) {
    if (tries > 240) return;   // gave up for this session (about 20 minutes)
    setTimeout(function () { if (clear()) ask(); else later(tries + 1); }, tries ? 5000 : 8000);
  }
  M.checkPermissions().then(function (r) {
    if (r && r.receive === 'granted') return on();
    if (!r || r.receive === 'denied') return;   // turned off in the phone's settings: don't nag
    var a = get('za-push-ask');
    if (a === 'yes' || (a && Date.now() - Number(a) < 30 * 864e5)) return;
    later(0);
  }).catch(noop);
})();

// Native drive engine (iPhone, DriveEngine.swift): keeps warning with the screen off or another app open.
// It runs alongside each real drive (not the simulator) and speaks only while Zone Ahead is in the background;
// on screen, the web app shows and says everything as before. It follows the sound button (voice / beeps / off).
(function () {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform() || !C.getPlatform || C.getPlatform() !== 'ios') return;
  var D = C.Plugins && C.Plugins.ZoneAheadDrive;
  if (!D) return;
  var on = false;
  function opts() {
    var s = document.getElementById('sndBtn'), r = 0, a = 'all';
    try { r = +localStorage.getItem('za-zoneR') || 0; a = (JSON.parse(localStorage.getItem('za-qol') || '{}').alerts) || 'all'; } catch (e) { }
    return { sound: (s && s.dataset.s) || 'on', zoneR: r || 700, alerts: a };   // alerts: the Settings "Alerts" choice (all / important / beeps)
  }
  function sync() {
    var live = document.body.classList.contains('livedrive');
    if (live && !on) { on = true; D.start(opts()).catch(function () { on = false; }); }
    else if (!live && on) { on = false; D.stop().catch(function () { }); }
  }
  function conf() { D.configure(opts()).catch(function () { }); }   // also kept by the engine for drives it starts itself
  // the engine is in a drive the page doesn't know about: one it started by itself while the app was closed, or one the
  // page started before the iPhone reloaded it in the background (a long drive). Carry it on here, in Car mode.
  function pickUp() {
    if (on || document.body.classList.contains('livedrive')) return;
    D.status().then(function (st) { if (st && st.running && !on && !document.body.classList.contains('livedrive') && window.ZA_AUTODRIVE) window.ZA_AUTODRIVE(); }).catch(function () { });
  }
  function init() {
    new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    var s = document.getElementById('sndBtn');
    if (s) new MutationObserver(conf).observe(s, { attributes: true, attributeFilter: ['data-s'] });
    // the Alerts setting (Everything / Important only / Beeps only) is saved when tapped
    document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-lvl]')) setTimeout(conf, 50); });
    // back on screen: the engine stops itself after a while parked in the background, so start it again if this drive is
    // still on; or it started a drive by itself, which the app now shows
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (!on) return pickUp();
      D.status().then(function (st) { if (st && st.running === false && on && document.body.classList.contains('livedrive')) D.start(opts()).catch(function () { }); }).catch(function () { });
    });
    sync(); conf(); setTimeout(pickUp, 2500);
    autoSetting();
  }

  // Settings › "Start by itself when you drive": replaces the web version's Shortcuts instructions with a real switch.
  function autoSetting() {
    var cfg = document.getElementById('setCfg'); if (!cfg || !D.autoStatus || !D.setAuto) return;
    var st = document.createElement('style');
    st.textContent = '#zaAutoGrp .zasw{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:56px;margin-top:8px;padding:8px 14px;border:0;border-radius:14px;background:var(--surface-2);color:var(--fg);font:700 1rem/1.25 var(--font-body);text-align:left;cursor:pointer}' +
      '#zaAutoGrp .sw{width:50px;height:30px;border-radius:15px;background:#c3cad2;position:relative;flex:none;transition:background .15s}' +
      '#zaAutoGrp .sw::after{content:"";position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgb(0 0 0 / .25);transition:left .15s}' +
      '#zaAutoGrp [aria-pressed="true"] .sw{background:#0f7a55}#zaAutoGrp [aria-pressed="true"] .sw::after{left:23px}' +
      '#zaAutoGrp .zanote{margin:10px 0 0;font-size:.9375rem;line-height:1.4;color:var(--muted)}#zaAutoGrp .zanote.warn{color:#b3261e;font-weight:700}' +
      '#zaAutoGrp .zaset{margin-top:10px;min-height:48px;width:100%}';
    document.head.appendChild(st);
    var S = { on: false, auth: 'notDetermined', ready: false, asked: false };
    function html() {
      var note, warn = false, btn = '';
      if (!S.on) note = 'Drive mode turns on by itself when you start driving, even with the app closed: camera warnings by voice and on the lock screen. It needs location set to <b>Always</b>. Uses little battery: the phone only checks properly after you\'ve moved about 500 m.';
      else if (S.ready) note = 'On. When you start driving, Zone Ahead switches itself on and you\'ll get a notification. It ends by itself 5 minutes after you park.';
      else if (S.auth === 'denied' || S.asked) { warn = true; note = 'Needs location set to Always: Settings › Zone Ahead › Location › Always.'; btn = '<button class="btn zaset" type="button" id="zaAutoSet">Open Settings</button>'; }
      else note = 'Waiting for location permission: choose <b>Change to Always Allow</b> when your iPhone asks.';
      return '<b>Start by itself when you drive</b><button class="zasw" type="button" id="zaAuto" aria-pressed="' + S.on + '"><span>Turn on Drive mode when I start driving</span><i class="sw" aria-hidden="true"></i></button><p class="zanote' + (warn ? ' warn' : '') + '">' + note + '</p>' + btn;
    }
    function draw() {
      var old = cfg.querySelector('#autoUrl'), g = document.getElementById('zaAutoGrp');
      if (old) { g = old.closest('.setgrp'); g.id = 'zaAutoGrp'; }
      if (!g) return;
      var h = html(); if (g.dataset.h === h) return;
      g.innerHTML = h; g.dataset.h = h;
      g.querySelector('#zaAuto').onclick = function () {
        var want = !S.on; S.asked = false;
        D.setAuto({ on: want }).then(function (r) { set(r); if (want && r.auth !== 'always') setTimeout(function () { S.asked = true; draw(); }, 8000); }).catch(function () { });
      };
      var b = g.querySelector('#zaAutoSet'); if (b) b.onclick = function () { D.openSettings().catch(function () { }); };
    }
    function set(r) { if (!r) return; S.on = !!r.on; S.auth = r.auth; S.ready = !!r.ready; if (S.ready) S.asked = false; draw(); }
    new MutationObserver(draw).observe(cfg, { childList: true });
    if (D.addListener) D.addListener('auto', set);
    D.autoStatus().then(set).catch(function () { });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') D.autoStatus().then(set).catch(function () { }); });
    draw();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

// Web code updates (WebUpdater.swift): tell the app this version started fine, so it keeps it (a version that never says so
// is dropped next time the app opens). The app then looks for a newer one in the background.
(function () {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  var W = C.Plugins && C.Plugins.ZoneAheadWeb;
  if (!W) return;
  var go = function () { setTimeout(function () { if (document.getElementById('map')) W.ready().catch(function () { }); }, 3000); };
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
})();
