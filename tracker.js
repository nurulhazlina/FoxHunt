/**
 * Radio Foxhunting LMS — Analytics Tracker v2
 * • Sends events to Google Sheets via Apps Script
 * • Tracks geolocation (IP-based), device type, completion milestones
 * • Manages completion state in localStorage
 */
(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  var SCRIPT_URL = 'YOUR_APPS_SCRIPT_URL_HERE';

  // ── Page / module detection ───────────────────────────────────────────────
  function getModule() {
    var p = window.location.pathname.split('/').pop() || 'index.html';
    if (p === 'index.html' || p === '') return 'Home';
    var m = p.match(/module-(\d+)\.html/);   if (m) return 'M' + m[1];
    var a = p.match(/module-activity-(\d+)/); if (a) return 'Activity-M' + a[1];
    var t = p.match(/teacher-(\d+)/);         if (t) return 'Teacher-M' + t[1];
    if (p === 'teacher-index.html') return 'Teacher-Hub';
    if (p === 'survey-pre.html')  return 'Survey-Pre';
    if (p === 'survey-post.html') return 'Survey-Post';
    if (p === 'register.html')    return 'Register';
    if (p === 'certificate.html') return 'Certificate';
    return p.replace('.html', '');
  }

  function getLang() {
    try { var b=document.querySelector('.lang-btn.active'); return b?b.textContent.trim():'EN'; } catch(e){return 'EN';}
  }

  // ── Session / participant ─────────────────────────────────────────────────
  function getSessionId() {
    try {
      var id = localStorage.getItem('rf_sid');
      if (!id) { id = 'rf_' + Date.now() + '_' + Math.random().toString(36).slice(2,8); localStorage.setItem('rf_sid', id); }
      return id;
    } catch(e) { return 'rf_' + Date.now(); }
  }

  function getParticipant() {
    try {
      var p = JSON.parse(localStorage.getItem('rf_participant') || '{}');
      return { participant_name: p.full_name||'', participant_id: p.matric_no||'', level: p.level||'', school_code: p.school_code||'', home_state: p.home_state||'' };
    } catch(e) { return {}; }
  }

  // ── Device info ───────────────────────────────────────────────────────────
  function getDevice() {
    var ua = navigator.userAgent;
    var device = /Mobi|Android/i.test(ua) ? 'Mobile' : /iPad|Tablet/i.test(ua) ? 'Tablet' : 'Desktop';
    var os = /Windows/i.test(ua)?'Windows':/Mac/i.test(ua)?'Mac':/Android/i.test(ua)?'Android':/iPhone|iPad/i.test(ua)?'iOS':/Linux/i.test(ua)?'Linux':'Other';
    return { device: device, os: os };
  }

  // ── Geolocation (IP-based, fetched once per session) ─────────────────────
  function getGeoCache() {
    try { return JSON.parse(localStorage.getItem('rf_geo') || 'null'); } catch(e){return null;}
  }
  function fetchGeo(cb) {
    var cached = getGeoCache();
    if (cached) { cb(cached); return; }
    try {
      fetch('https://ipapi.co/json/', {mode:'cors'})
        .then(function(r){ return r.json(); })
        .then(function(d){
          var geo = { country: d.country_name||'', region: d.region||'', city: d.city||'', isp: d.org||'' };
          try { localStorage.setItem('rf_geo', JSON.stringify(geo)); } catch(e){}
          cb(geo);
        })
        .catch(function(){ cb({}); });
    } catch(e) { cb({}); }
  }

  // ── Send event ────────────────────────────────────────────────────────────
  function send(eventName, extra, geo) {
    if (SCRIPT_URL === 'YOUR_APPS_SCRIPT_URL_HERE') return;
    var payload = Object.assign({
      survey: 'analytics',
      event: eventName,
      module: getModule(),
      lang: getLang(),
      session_id: getSessionId(),
      timestamp: new Date().toISOString(),
      referrer: document.referrer ? (document.referrer.split('/').pop()||'direct') : 'direct'
    }, getParticipant(), getDevice(), geo||{}, extra||{});
    try { fetch(SCRIPT_URL, { method:'POST', body: JSON.stringify(payload), keepalive:true }); }
    catch(e) {}
  }

  // ── Completion tracking in localStorage ──────────────────────────────────
  var mod = getModule();

  // Mark module as visited
  if (mod.match(/^M\d+$/)) {
    try {
      var visited = JSON.parse(localStorage.getItem('rf_visited_modules') || '[]');
      var mNum = parseInt(mod.replace('M',''));
      if (visited.indexOf(mNum) === -1) { visited.push(mNum); localStorage.setItem('rf_visited_modules', JSON.stringify(visited)); }
    } catch(e) {}
  }

  // Mark activity as submitted (called by activity submit buttons)
  window.rfMarkActivity = function(num) {
    try {
      var done = JSON.parse(localStorage.getItem('rf_activities_done') || '[]');
      if (done.indexOf(num) === -1) { done.push(num); localStorage.setItem('rf_activities_done', JSON.stringify(done)); }
    } catch(e) {}
  };

  // Mark post-survey done
  window.rfMarkPostDone = function() {
    try { localStorage.setItem('rf_post_done', '1'); } catch(e) {}
  };

  // Check full completion: visited M0-M4 + activities 1-4 + post-survey
  window.rfIsComplete = function() {
    try {
      var visited = JSON.parse(localStorage.getItem('rf_visited_modules') || '[]');
      var acts = JSON.parse(localStorage.getItem('rf_activities_done') || '[]');
      var post = localStorage.getItem('rf_post_done') === '1';
      var allModules = [0,1,2,3,4].every(function(n){ return visited.indexOf(n) !== -1; });
      var allActs = [1,2,3,4].every(function(n){ return acts.indexOf(n) !== -1; });
      return allModules && allActs && post;
    } catch(e) { return false; }
  };

  // ── Auto fire page_view with geo ──────────────────────────────────────────
  fetchGeo(function(geo) {
    send('page_view', {}, geo);
  });

  // ── Time on page ──────────────────────────────────────────────────────────
  var t0 = Date.now();
  window.addEventListener('beforeunload', function() {
    var s = Math.round((Date.now()-t0)/1000);
    if (s > 3) send('time_spent', {seconds:s});
  });

  // ── Forward nav click ─────────────────────────────────────────────────────
  document.addEventListener('click', function(e) {
    var el = e.target.closest('a[href],button');
    if (!el) return;
    var href = el.getAttribute('href') || '';
    if ((href.match(/module-\d+\.html/) || href === 'index.html') && mod.match(/^(M\d+|Activity-M\d+)$/)) {
      send('module_forward', {target: href});
    }
  });

  window.rfTrack = send;
})();
