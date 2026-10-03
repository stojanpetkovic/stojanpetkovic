/*!
 * Lead collector — stojanpetkovic.com
 *
 * <script src="https://stojanpetkovic.com/leads.js" data-site-key="KEY" defer></script>
 *
 * Copies every form submission on the page to the lead inbox, in parallel
 * with whatever the form already does. It never blocks or changes the form.
 * Opt a form out with data-lead-ignore; name it with data-lead-form="quote".
 * Give a field a readable name in the lead with data-lead-name="phone"
 * (for builders that name inputs text_1, number_1 and so on).
 * Forms sent purely from JavaScript can call window.stojanLeads.send(name, data).
 *
 * It also counts page views for the admin's analytics: one small beacon per
 * page, no cookies. data-pageviews="off" on the tag turns that part off.
 *
 * Clicks on call, WhatsApp, SMS and email links are reported too, so phone
 * calls count as conversions next to form inquiries.
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var siteKey = script.getAttribute('data-site-key');
  if (!siteKey) return;
  var endpoint = script.getAttribute('data-endpoint') || new URL('/api/leads', script.src).href;
  var hitEndpoint = new URL('/api/hit', endpoint).href;
  var eventEndpoint = new URL('/api/event', endpoint).href;
  var countPageViews = script.getAttribute('data-pageviews') !== 'off';

  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  var STORE_KEY = 'sp_lead_attribution';
  var THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

  // First-touch attribution: remember the campaign and referrer the visitor
  // arrived with, so a form filled in on a later page still credits the ad.
  function readAttribution() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved && Date.now() - saved.t < THIRTY_DAYS) return saved;
    } catch {
      /* storage or URL unavailable: carry on without it */
    }
    return null;
  }

  function captureAttribution() {
    var params = new URLSearchParams(location.search);
    var utm = {};
    var hasUtm = false;
    UTM_KEYS.forEach(function (k) {
      var v = params.get(k);
      if (v) {
        utm[k] = v;
        hasUtm = true;
      }
    });
    if (!hasUtm && params.get('fbclid')) {
      utm.utm_source = 'facebook';
      hasUtm = true;
    }
    if (!hasUtm && params.get('gclid')) {
      utm.utm_source = 'google';
      utm.utm_medium = 'cpc';
      hasUtm = true;
    }

    var externalReferrer = '';
    try {
      if (document.referrer && new URL(document.referrer).hostname !== location.hostname)
        externalReferrer = document.referrer;
    } catch {
      /* storage or URL unavailable: carry on without it */
    }

    var saved = readAttribution();
    if (hasUtm || !saved) {
      saved = {
        t: Date.now(),
        utm: hasUtm ? utm : (saved && saved.utm) || {},
        referrer: externalReferrer || (saved && saved.referrer) || '',
      };
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(saved));
      } catch {
        /* storage or URL unavailable: carry on without it */
      }
    }
    return saved;
  }

  var attribution = captureAttribution();

  function send(formName, data) {
    var payload = {
      site_key: siteKey,
      form: formName || 'form',
      page_url: location.href.split('#')[0],
      referrer: attribution.referrer || '',
      utm: attribution.utm || {},
      data: data,
    };
    try {
      // text/plain keeps this a "simple" request: no CORS preflight, and
      // keepalive lets it finish even when the form navigates away.
      fetch(endpoint, {
        method: 'POST',
        mode: 'cors',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload),
      }).catch(function () {});
    } catch {
      /* storage or URL unavailable: carry on without it */
    }
  }

  function formName(form) {
    return (
      form.getAttribute('data-lead-form') ||
      form.id ||
      form.getAttribute('name') ||
      (form.getAttribute('action') || '').split('?')[0].split('/').filter(Boolean).pop() ||
      'form'
    );
  }

  function isSearchForm(form, fields) {
    if (form.getAttribute('role') === 'search') return true;
    var keys = Object.keys(fields);
    return keys.length === 1 && /^(q|s|search|query)$/i.test(keys[0]);
  }

  var lastSent = new WeakMap();

  document.addEventListener(
    'submit',
    function (event) {
      var form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.hasAttribute('data-lead-ignore')) return;
      if (form.querySelector('input[type="password"]')) return;

      var now = Date.now();
      if (now - (lastSent.get(form) || 0) < 3000) return;

      var renamed = {};
      Array.prototype.forEach.call(form.elements, function (el) {
        var leadName = el.getAttribute && el.getAttribute('data-lead-name');
        if (leadName && el.name) renamed[el.name] = leadName;
      });

      var fields = {};
      new FormData(form).forEach(function (value, key) {
        if (typeof value !== 'string') return;
        var name = renamed[key] || key;
        fields[name] = name in fields ? fields[name] + ', ' + value : value;
      });
      if (!Object.keys(fields).length || isSearchForm(form, fields)) return;

      lastSent.set(form, now);
      send(formName(form), fields);
    },
    true,
  );

  // ── Page views ──────────────────────────────────────────────────────────
  var VISIT_KEY = 'sp_visit';
  var lastHit = { path: '', at: 0 };

  function beacon(url, payload) {
    var body = JSON.stringify(payload);
    try {
      // A Blob of text/plain keeps the beacon a "simple" cross-site request.
      if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return;
    } catch {
      /* fall back to fetch below */
    }
    try {
      fetch(url, {
        method: 'POST',
        mode: 'cors',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: body,
      }).catch(function () {});
    } catch {
      /* nothing else to try */
    }
  }

  function trackPageView() {
    if (!countPageViews || location.protocol === 'file:') return;
    var path = location.pathname;
    var now = Date.now();
    if (path === lastHit.path && now - lastHit.at < 2000) return;
    lastHit = { path: path, at: now };

    // The first page of a visit (per tab) carries where the visit came from.
    var entry = false;
    try {
      entry = !sessionStorage.getItem(VISIT_KEY);
      sessionStorage.setItem(VISIT_KEY, '1');
    } catch {
      entry = true;
    }

    var payload = { site_key: siteKey, path: path, entry: entry };
    if (entry) {
      var params = new URLSearchParams(location.search);
      var utm = {};
      UTM_KEYS.forEach(function (k) {
        var v = params.get(k);
        if (v) utm[k] = v;
      });
      if (!utm.utm_source && params.get('fbclid')) utm.utm_source = 'facebook';
      if (!utm.utm_source && params.get('gclid')) {
        utm.utm_source = 'google';
        utm.utm_medium = 'cpc';
      }
      var ref = '';
      try {
        if (document.referrer && new URL(document.referrer).hostname !== location.hostname) ref = document.referrer;
      } catch {
        /* no usable referrer */
      }
      payload.utm = utm;
      payload.referrer = ref;
    }
    beacon(hitEndpoint, payload);
  }

  trackPageView();
  // Sites using Astro view transitions swap pages without a reload.
  document.addEventListener('astro:after-swap', trackPageView);

  // ── Contact clicks ──────────────────────────────────────────────────────
  function contactKind(href) {
    if (/^tel:/i.test(href)) return 'call';
    if (/^sms:/i.test(href)) return 'sms';
    if (/^mailto:/i.test(href)) return 'email';
    if (
      /^whatsapp:/i.test(href) ||
      /^https?:\/\/(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com|chat\.whatsapp\.com)\//i.test(href)
    ) {
      return 'whatsapp';
    }
    return null;
  }

  function contactTarget(kind, href) {
    if (kind === 'call' || kind === 'sms') return decodeURIComponent(href.replace(/^(tel|sms):/i, '').split(/[?;]/)[0]);
    if (kind === 'email') return decodeURIComponent(href.replace(/^mailto:/i, '').split('?')[0]);
    var match = href.match(/wa\.me\/(\+?\d+)/i) || href.match(/[?&]phone=(\+?\d+)/i);
    return match ? match[1] : 'whatsapp';
  }

  var lastClick = { key: '', at: 0 };

  document.addEventListener(
    'click',
    function (event) {
      var link = event.target && event.target.closest ? event.target.closest('a[href]') : null;
      if (!link || link.hasAttribute('data-lead-ignore')) return;
      var href = link.getAttribute('href') || '';
      var kind = contactKind(href);
      if (!kind) return;

      var target = contactTarget(kind, href);
      var now = Date.now();
      if (lastClick.key === kind + target && now - lastClick.at < 2000) return;
      lastClick = { key: kind + target, at: now };

      beacon(eventEndpoint, {
        site_key: siteKey,
        kind: kind,
        target: target,
        path: location.pathname,
        referrer: attribution.referrer || '',
        utm: attribution.utm || {},
      });
    },
    true,
  );

  window.stojanLeads = { send: send };
})();
