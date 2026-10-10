(() => {
  'use strict';
  const script = document.currentScript;
  const phone = script?.dataset.phone;
  const business = script?.dataset.business || document.title;
  const colors = value => (value.match(/[\d.]+/g) || []).map(Number);
  const luminance = rgb => rgb.slice(0, 3).reduce((sum, v, i) => {
    v /= 255;
    return sum + (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i];
  }, 0);
  const samples = new WeakMap();
  function backdrop(img) {
    for (let p = img.parentElement; p; p = p.parentElement) {
      const style = getComputedStyle(p), rgb = colors(style.backgroundColor);
      if (rgb.length >= 3 && (rgb[3] === undefined || rgb[3] > .85)) return luminance(rgb);
      if (style.backgroundImage !== 'none') {
        return luminance(colors(getComputedStyle(img.parentElement).color)) > .5 ? 0 : 1;
      }
    }
    return 1;
  }
  function ink(img) {
    if (samples.has(img)) return samples.get(img);
    if (!img.complete || !img.naturalWidth) return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 160; canvas.height = Math.max(1, Math.round(160 * img.naturalHeight / img.naturalWidth));
      const context = canvas.getContext('2d', {willReadFrequently: true});
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data, values = [];
      for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 220) values.push(luminance([data[i], data[i + 1], data[i + 2]]));
      samples.set(img, values); return values;
    } catch { return []; }
  }
  function refresh() {
    document.querySelectorAll('img.rr-approved-logo,img.rr-brand-logo,img[src$="/brand/logo.png"]').forEach(img => {
      if (img.closest('footer')) return;
      const bg = backdrop(img), values = ink(img);
      const ratio = light => (Math.max(light, bg) + .05) / (Math.min(light, bg) + .05);
      const originalReadable = values?.length && values.filter(v => ratio(v) >= 3).length / values.length >= .95;
      const filter = originalReadable ? 'none' : (ratio(1) > ratio(0) ? 'brightness(0) invert(1)' : 'brightness(0)');
      img.style.setProperty('filter', filter, 'important');
      const ratios = originalReadable ? values.map(ratio).sort((a, b) => a - b) : [];
      img.dataset.contrastRatio = String(originalReadable ? ratios[Math.floor(ratios.length * .05)] : Math.max(ratio(0), ratio(1)));
      img.dataset.contrastBackground = String(bg);
    });
  }
  function init() {
    if (phone && !document.querySelector('.rr-mobile-call')) {
      const call = document.createElement('a');
      const digits = phone.replace(/\D/g, '');
      call.className = 'rr-mobile-call'; call.href = 'tel:+' + (digits.length === 10 ? '1' : '') + digits;
      call.setAttribute('aria-label', 'Call ' + business + ' at ' + phone);
      call.title = 'Call ' + phone;
      const icon = document.createElement('span'); icon.className = 'rr-mobile-call-icon'; icon.setAttribute('aria-hidden', 'true'); call.append(icon);
      document.body.append(call);
      const candidates = [...document.querySelectorAll('form button[type="submit"],a[href*="contact"],button')].filter(el => !el.closest('footer') && el.getBoundingClientRect().width > 0);
      const source = candidates.find(el => { const rgb = colors(getComputedStyle(el).backgroundColor); return rgb.length >= 3 && (rgb[3] === undefined || rgb[3] > .8) && luminance(rgb) < .8; });
      if (source) {
        const style = getComputedStyle(source), bg = luminance(colors(style.backgroundColor));
        call.style.setProperty('--call-bg', style.backgroundColor);
        call.style.setProperty('--call-fg', (1.05 / (bg + .05)) > ((bg + .05) / .05) ? '#fff' : '#111');
        call.style.setProperty('--call-radius', style.borderRadius);
        call.style.setProperty('--call-font', style.fontFamily);
      }
    }
    refresh();
    document.querySelectorAll('img[src$="/brand/logo.png"]').forEach(img => img.addEventListener('load', refresh));
    let scheduled = false;
    const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(() => { scheduled = false; refresh(); }); } };
    addEventListener('scroll', schedule, {passive: true}); addEventListener('resize', schedule);
    new MutationObserver(schedule).observe(document.body, {attributes: true, attributeFilter: ['class'], subtree: true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true}); else init();
})();
