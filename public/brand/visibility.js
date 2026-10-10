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
  const surfaces = new WeakMap();
  function backdrop(img) {
    const anchor = img.closest('a') || img.parentElement;
    if (surfaces.has(anchor)) {
      const original = surfaces.get(anchor);
      anchor.style.removeProperty('background-color');
      if (original.value) anchor.style.setProperty('background-color', original.value, original.priority);
      surfaces.delete(anchor);
    }
    const surface = () => {
      surfaces.set(anchor, {value:anchor.style.getPropertyValue('background-color'), priority:anchor.style.getPropertyPriority('background-color')});
      anchor.style.setProperty('background-color', '#111111', 'important');
      return luminance([17, 17, 17]);
    };
    for (let p = img.parentElement; p; p = p.parentElement) {
      if (p === document.body || p === document.documentElement) break;
      const style = getComputedStyle(p), rgb = colors(style.backgroundColor);
      if (rgb.length >= 3 && (rgb[3] === undefined || rgb[3] > .85)) return luminance(rgb);
      if (style.backgroundImage !== 'none') {
        return surface();
      }
    }
    const rect = img.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    const photoBehind = [...document.images].some(photo => {
      if (photo === img || photo.closest('footer') || /brand|logo/.test(photo.className + ' ' + photo.src)) return false;
      const r = photo.getBoundingClientRect();
      return r.width > 200 && r.height > 100 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }) || getComputedStyle(document.body).backgroundImage !== 'none' || document.elementsFromPoint(x, y).some(el => !img.contains(el) && !el.contains(img) && getComputedStyle(el).backgroundImage !== 'none');
    if (photoBehind) return surface();
    const body = colors(getComputedStyle(document.body).backgroundColor);
    return body.length >= 3 && (body[3] === undefined || body[3] > .85) ? luminance(body) : 1;
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
      for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 220 && (i / 4) % canvas.width > canvas.width * .28) values.push(luminance([data[i], data[i + 1], data[i + 2]]));
      samples.set(img, values); return values;
    } catch { return []; }
  }
  function refresh() {
    document.querySelectorAll('img.rr-approved-logo,img.rr-brand-logo,img[src$="/brand/logo.png"]').forEach(img => {
      if (img.closest('footer') || img.dataset.rrLogoOverlay) return;
      const bg = backdrop(img), values = ink(img);
      const ratio = light => (Math.max(light, bg) + .05) / (Math.min(light, bg) + .05);
      const originalReadable = values?.length && values.filter(v => ratio(v) >= 3).length / values.length >= .95;
      let filter = originalReadable ? 'none' : (ratio(1) > ratio(0) ? 'brightness(0) invert(1)' : 'brightness(0)');
      let compositeRatio = null;
      // Louisiana's colored river emblem must remain intact when its text changes tone.
      if (script?.dataset.logoVariant === 'louisiana-split') {
        const anchor = img.closest('a') || img.parentElement;
        let overlay = anchor.querySelector('.rr-logo-text-overlay');
        if (!overlay) {
          overlay = img.cloneNode(); overlay.className = 'rr-logo-text-overlay'; overlay.alt = '';
          overlay.setAttribute('aria-hidden', 'true'); overlay.dataset.rrLogoOverlay = 'true'; anchor.append(overlay);
        }
        if (getComputedStyle(anchor).position === 'static') anchor.style.position = 'relative';
        const r = img.getBoundingClientRect(), p = anchor.getBoundingClientRect(), white = ratio(1) > ratio(0);
        const styles = {position:'absolute',left:(r.x-p.x)+'px',top:(r.y-p.y)+'px',width:r.width+'px',height:r.height+'px','max-width':'none','max-height':'none',display:'block',visibility:'visible',opacity:'1','pointer-events':'none','object-fit':getComputedStyle(img).objectFit,'object-position':getComputedStyle(img).objectPosition,'clip-path':white?'inset(0 0 33% 22%)':'inset(67% 0 0 22%)',filter:white?'brightness(0) invert(1)':'brightness(0)'};
        for (const [key,value] of Object.entries(styles)) overlay.style.setProperty(key,value,'important');
        filter = 'none';
        const contrasts = (values || []).map(v => ratio(white && v < .15 ? 1 : white ? v : 0)).sort((a,b)=>a-b);
        compositeRatio = contrasts.length ? contrasts[Math.floor(contrasts.length*.05)] : Math.max(ratio(0),ratio(1));
      }
      img.style.setProperty('filter', filter, 'important');
      const ratios = originalReadable ? values.map(ratio).sort((a, b) => a - b) : [];
      img.dataset.contrastRatio = String(compositeRatio || (originalReadable ? ratios[Math.floor(ratios.length * .05)] : Math.max(ratio(0), ratio(1))));
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
      const roots = [...document.querySelectorAll('form button[type="submit"]'), ...document.querySelectorAll('main a[href*="contact"],[role="main"] a[href*="contact"]'), ...document.querySelectorAll('a[href*="contact"]')];
      const candidates = roots.flatMap(el => [el, ...el.querySelectorAll('span,div')]).filter(el => !el.closest('footer') && el.getBoundingClientRect().width > 0);
      const source = candidates.find(el => { const style = getComputedStyle(el), rgb = colors(style.backgroundColor); return /gradient\(/.test(style.backgroundImage) || rgb.length >= 3 && (rgb[3] === undefined || rgb[3] > .8) && luminance(rgb) < .8; });
      if (source) {
        const style = getComputedStyle(source), gradient = /gradient\(/.test(style.backgroundImage), rgb = gradient ? colors(style.backgroundImage.match(/rgba?\([^)]+\)/)?.[0] || style.backgroundColor) : colors(style.backgroundColor), bg = luminance(rgb);
        call.style.setProperty('--call-bg', gradient ? style.backgroundImage : style.backgroundColor);
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
    addEventListener('load', schedule, {once:true});
    document.addEventListener('load', schedule, true);
    document.addEventListener('transitionend', schedule, true);
    document.addEventListener('animationend', schedule, true);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', schedule);
    new MutationObserver(schedule).observe(document.body, {attributes: true, attributeFilter: ['class','data-transparent','data-theme'], subtree: true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true}); else init();
})();
