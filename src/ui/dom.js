/**
 * The smallest DOM helper that makes the rest of the UI readable.
 *
 * No framework, for the same reason there is no bundle to fetch: every byte in
 * the file is a byte that has to sync over a VPN, and the UI here is a handful of
 * screens that swap wholesale. `el` covers all of it.
 *
 * Text is always set through `textContent`. Nothing in this game ever assigns
 * `innerHTML` — mission briefs and card text are authored content, but they pass
 * through a save file that can be edited by hand, and a save file that can inject
 * markup into the page is a save file that can do anything.
 */

/**
 * Build an element.
 *
 *   el('button', { class: 'primary', onClick: run }, 'Start shift')
 *   el('div', { class: 'row' }, el('span', {}, 'a'), el('span', {}, 'b'))
 *
 * Attribute names starting with `on` are bound as listeners. `class`, `id`,
 * `disabled`, `value` and the `data-*` family behave as written. Children may be
 * elements, strings, numbers, or null/false, which are skipped — so
 * `condition && el(...)` works inline.
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;

    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      node.className = value;
    } else if (key === 'text') {
      node.textContent = String(value);
    } else if (key === 'disabled' || key === 'checked') {
      if (value) node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }

  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false || child === '') continue;
    if (Array.isArray(child)) {
      append(node, child);
    } else if (typeof child === 'object' && child.nodeType) {
      node.appendChild(child);
    } else {
      node.appendChild(document.createTextNode(String(child)));
    }
  }
}

/** Empty a node without leaving detached listeners behind. */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Replace a node's contents in one go. */
export function render(node, ...children) {
  clear(node);
  append(node, children);
  return node;
}

/** A labelled section, used by every screen. */
export function panel(title, ...children) {
  return el('section', { class: 'panel' }, title && el('h2', { class: 'panel-title' }, title), ...children);
}

export function button(label, onClick, attrs = {}) {
  return el('button', { type: 'button', ...attrs, onClick }, label);
}
