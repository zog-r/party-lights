(() => {
  if (window.__mkOn) return window.__mkOn();
  const KEY = '__mk:' + location.origin;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  let marks = load(), on = true, picked = null, hover = null;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(marks)); } catch {} };

  const sel = el => {
    const p = [];
    for (; el && el.nodeType === 1 && el !== document.body; el = el.parentNode) {
      if (el.id) { p.unshift('#' + CSS.escape(el.id)); break; }
      let s = el.tagName.toLowerCase();
      const same = [...el.parentNode.children].filter(c => c.tagName === el.tagName);
      if (same.length > 1) s += `:nth-of-type(${same.indexOf(el) + 1})`;
      p.unshift(s);
    }
    return p.join('>');
  };

  const root = document.createElement('div');
  root.id = '__mk';
  root.style.cssText = 'position:fixed;right:12px;bottom:12px;width:300px;max-height:70vh;overflow:auto;z-index:2147483647;font:13px system-ui;background:#fff;color:#111;border:1px solid #888;border-radius:8px;box-shadow:0 4px 20px #0005;padding:10px';
  root.innerHTML = `<b id=mk-drag style="cursor:move;user-select:none;touch-action:none">⠿ Markup (drag)</b> <label style="float:right"><input type=checkbox id=mk-on checked> pick</label>
    <div id=mk-sel style="margin:6px 0;color:#555;word-break:break-all">Click an element on the page</div>
    <select id=mk-cat><option>copy</option><option>design</option><option>ux</option></select>
    <textarea id=mk-txt rows=3 style="width:100%;box-sizing:border-box;margin:6px 0" placeholder="What should change?"></textarea>
    <button id=mk-add>Add</button> <button id=mk-clear>Clear all</button><ol id=mk-list style="padding-left:18px"></ol>`;
  const css = document.createElement('style');
  css.textContent = '#__mk select,#__mk textarea,#__mk button{color:#000!important;background:#fff!important;font:13px system-ui!important;opacity:1!important;border:1px solid #888!important;border-radius:4px!important}#__mk textarea::placeholder{color:#666!important}#__mk a,#__mk li{color:#222!important;text-decoration:none!important}';
  root.appendChild(css);
  document.body.appendChild(root);
  const $ = id => root.querySelector('#' + id);
  const h = $('mk-drag');
  h.onpointerdown = e => {
    const r = root.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    h.setPointerCapture(e.pointerId);
    h.onpointermove = m => {
      root.style.left = Math.max(0, Math.min(innerWidth - root.offsetWidth, m.clientX - dx)) + 'px';
      root.style.top = Math.max(0, Math.min(innerHeight - 40, m.clientY - dy)) + 'px';
      root.style.right = root.style.bottom = 'auto';
    };
    h.onpointerup = () => { h.onpointermove = h.onpointerup = null; };
  };
  const mine = t => root.contains(t) || t.closest?.('.__mkpin');

  const outline = (el, v) => { if (el && el.style) el.style.outline = v; };
  const pins = [];
  const render = () => {
    pins.splice(0).forEach(p => p.remove());
    const list = $('mk-list'); list.textContent = '';
    marks.forEach((m, i) => {
      const li = document.createElement('li');
      li.textContent = `[${m.cat}] ${m.comment} `;
      const x = document.createElement('a'); x.textContent = '×'; x.style.cursor = 'pointer';
      x.onclick = () => { marks.splice(i, 1); save(); render(); };
      li.appendChild(x); list.appendChild(li);
      const el = document.querySelector(m.selector);
      if (el) {
        const r = el.getBoundingClientRect(), b = document.createElement('div');
        b.className = '__mkpin'; b.textContent = i + 1;
        b.style.cssText = `position:absolute;left:${r.left + scrollX}px;top:${r.top + scrollY}px;background:#e11;color:#fff;border-radius:50%;width:18px;height:18px;text-align:center;font:11px/18px system-ui;z-index:2147483646;pointer-events:none`;
        document.body.appendChild(b); pins.push(b);
      }
    });
  };

  document.addEventListener('mouseover', e => {
    if (!on || mine(e.target)) return;
    if (hover !== picked) outline(hover, '');
    hover = e.target; if (hover !== picked) outline(hover, '2px dashed #e11');
  }, true);
  document.addEventListener('click', e => {
    if (!on || mine(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    outline(picked, ''); picked = e.target; outline(picked, '2px solid #e11');
    $('mk-sel').textContent = sel(picked);
  }, true);
  $('mk-on').onchange = e => { on = e.target.checked; };
  $('mk-add').onclick = () => {
    const comment = $('mk-txt').value.trim();
    if (!picked || !comment) return;
    const cs = getComputedStyle(picked);
    marks.push({
      cat: $('mk-cat').value, comment, path: location.pathname, selector: sel(picked),
      tag: picked.tagName.toLowerCase(), classes: picked.className?.toString?.() || '',
      text: (picked.innerText || '').slice(0, 200), html: picked.outerHTML.slice(0, 400),
      style: { color: cs.color, bg: cs.backgroundColor, font: cs.font, padding: cs.padding, margin: cs.margin },
    });
    save(); $('mk-txt').value = ''; outline(picked, ''); picked = null; $('mk-sel').textContent = 'Click an element on the page'; render();
  };
  $('mk-clear').onclick = () => { marks = []; save(); render(); };

  window.__markups = () => marks;
  window.__mkOn = () => { root.style.display = ''; return marks.length; };
  render();
  return 'markup ready';
})()
