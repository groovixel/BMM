import { jsx as reactJsx, jsxs as reactJsxs, Fragment } from 'react/jsx-runtime';
const translate = (value) => {
  const edits = window.BDS_WORDPRESS?.content?.text;
  return typeof value === 'string' && edits && Object.prototype.hasOwnProperty.call(edits, value) ? edits[value] : value;
};
const children = (value) => Array.isArray(value) ? value.map(children) : translate(value);
const prepare = (props) => {
  if (!props || !window.BDS_WORDPRESS?.content?.text) return props;
  const out = { ...props };
  if ('children' in out) out.children = children(out.children);
  for (const key of ['title', 'placeholder', 'alt', 'aria-label', 'href', 'src']) if (typeof out[key] === 'string') out[key] = translate(out[key]);
  return out;
};
export const jsx = (type, props, key) => reactJsx(type, prepare(props), key);
export const jsxs = (type, props, key) => reactJsxs(type, prepare(props), key);
export { Fragment };
