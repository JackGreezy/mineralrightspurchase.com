/* Invisible verification for same-origin contact forms. */
(() => {
  const script = document.currentScript;
  const sitekey = script?.dataset.sitekey;
  const states = new WeakMap();
  const protectedForm = form => form instanceof HTMLFormElement && new URL(form.action, location.href).origin === location.origin && new URL(form.action, location.href).pathname === '/api/contact';
  function status(form, text) {
    let el = form.querySelector('[data-contact-status]');
    if (!el) { el = document.createElement('p'); el.dataset.contactStatus = ''; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); form.append(el); }
    el.textContent = text;
    el.hidden = !text;
  }
  function reset(state) {
    state.token = '';
    if (state.id !== undefined && window.turnstile) window.turnstile.reset(state.id);
  }
  function mount(form) {
    if (states.has(form)) return states.get(form);
    const state = { token: '', busy: false, id: undefined, failed: false };
    states.set(form, state);
    const container = document.createElement('div');
    container.dataset.contactVerification = '';
    form.append(container);
    state.container = container;
    return state;
  }
  function render(form) {
    const state = mount(form);
    if (!window.turnstile || state.id !== undefined) return state;
    state.id = window.turnstile.render(state.container, {
      sitekey, action: 'contact',
      callback: token => { state.token = token; state.failed = false; },
      'expired-callback': () => reset(state),
      'error-callback': () => { state.token = ''; state.failed = true; status(form, 'Verification could not finish. Please retry or contact the team by phone or email.'); },
      'timeout-callback': () => { state.token = ''; state.failed = true; }
    });
    return state;
  }
  window.addEventListener('submit', async event => {
    const form = event.target;
    if (!protectedForm(form)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!form.reportValidity()) return;
    const state = render(form);
    if (state.busy) return;
    state.busy = true;
    const buttons = [...form.querySelectorAll('button[type="submit"],input[type="submit"],button:not([type])')];
    const disabled = buttons.map(button => button.disabled);
    buttons.forEach(button => button.disabled = true);
    try {
      if (state.failed) { state.failed = false; reset(state); }
      status(form, state.token ? 'Sending your message…' : 'Verifying your request…');
      const started = Date.now();
      while (!state.token && !state.failed && Date.now() - started < 25000) { render(form); await new Promise(resolve => setTimeout(resolve, 100)); }
      if (!state.token) throw new Error('Verification could not finish. Please retry or contact the team by phone or email.');
      const body = new URLSearchParams();
      new FormData(form).forEach((value, key) => { if (typeof value === 'string') body.append(key, value); });
      body.set('cf-turnstile-response', state.token);
      status(form, 'Sending your message…');
      const response = await fetch('/api/contact', {method: 'POST', headers: {'Accept': 'application/json'}, body, signal: AbortSignal.timeout(45000)});
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Your message could not be sent. Please try again.');
      location.assign('/contact?submitted=1');
    } catch (error) {
      status(form, error.message || 'Your message could not be sent. Please try again.');
      reset(state);
    } finally {
      state.busy = false;
      buttons.forEach((button, i) => button.disabled = disabled[i]);
    }
  }, true);
  // Some captured form themes cancel button clicks before a submit event exists.
  window.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('button[type="submit"],input[type="submit"],button:not([type])') : null;
    const form = button?.form;
    if (!button || button.disabled || !protectedForm(form)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    form.requestSubmit(button);
  }, true);
  function init() {
    const forms = [...document.forms].filter(protectedForm);
    if (!sitekey || !forms.length) return;
    forms.forEach(mount);
    window.rrContactTurnstileReady = () => forms.forEach(render);
    const api = document.createElement('script');
    api.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=rrContactTurnstileReady&render=explicit';
    api.async = true; api.defer = true;
    api.onerror = () => forms.forEach(form => { mount(form).failed = true; status(form, 'Verification could not load. Please reload or contact the team by phone or email.'); });
    document.head.append(api);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true}); else init();
})();
