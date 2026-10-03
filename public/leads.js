/*!
 * Lead collector — stojanpetkovic.com
 *
 * <script src="https://stojanpetkovic.com/leads.js" data-site-key="KEY" defer></script>
 *
 * Copies every form submission on the page to the lead inbox, in parallel
 * with whatever the form already does. It never blocks or changes the form.
 * Opt a form out with data-lead-ignore; name it with data-lead-form="quote".
 * Forms sent purely from JavaScript can call window.stojanLeads.send(name, data).
 */
(function () {
  var script = document.currentScript;
  if (!script) return;
  var siteKey = script.getAttribute('data-site-key');
  if (!siteKey) return;
  var endpoint = script.getAttribute('data-endpoint') || new URL('/api/leads', script.src).href;

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

      var fields = {};
      new FormData(form).forEach(function (value, key) {
        if (typeof value !== 'string') return;
        fields[key] = key in fields ? fields[key] + ', ' + value : value;
      });
      if (!Object.keys(fields).length || isSearchForm(form, fields)) return;

      lastSent.set(form, now);
      send(formName(form), fields);
    },
    true,
  );

  window.stojanLeads = { send: send };
})();
