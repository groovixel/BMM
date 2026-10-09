import { useRef } from 'react';
import defaultForms from './form-defaults.json';
export function wordpressContent(key, fallback) {
  const content = window.BDS_WORDPRESS?.content;
  return content && Object.prototype.hasOwnProperty.call(content, key) ? content[key] : fallback;
}
export const formSettings = (slug) => window.BDS_WORDPRESS ? window.BDS_WORDPRESS.content?.forms?.[slug] : defaultForms[slug];
export function DynamicFields({ slug, form, setForm, firstFieldRef, options = {}, file, setFile }) {
  const config = formSettings(slug);
  const id = useRef(`bds-${slug}-${Math.random().toString(36).slice(2)}`);
  if (!config || config.enabled === false) return <p>This form is currently unavailable. Please contact the team directly.</p>;
  const fields = config.fields.filter(f => f.enabled !== false);
  return <>{fields.map((field, i) => {
    const type = ['text','email','tel','number','textarea','select','checkbox','file'].includes(field.type) ? field.type : 'text';
    const required = field.required || ['name','email'].includes(field.name);
    const update = e => setForm(f => ({ ...f, [field.name]: type === 'checkbox' ? e.target.checked : e.target.value }));
    const attrs = { id: `${id.current}-${i}`, required, placeholder: field.placeholder || '', ref: i === 0 ? firstFieldRef : undefined, 'data-testid': `form-${slug}-${field.name}` };
    let control;
    if (type === 'file') { if (!setFile) return null; control = <><input {...attrs} type="file" accept="image/png,image/jpeg,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} />{file && <em>{file.name}</em>}</>; }
    else if (type === 'textarea') control = <textarea {...attrs} rows={4} value={form[field.name] ?? ''} onChange={update} />;
    else if (type === 'select') { const supplied = options[field.name]; const choices = field.options?.length > 1 ? field.options : (supplied || field.options || []); control = <select {...attrs} value={form[field.name] ?? ''} onChange={update}>{choices.map((v,j) => <option key={j} value={typeof v === 'string' ? v : v.value}>{typeof v === 'string' ? v : v.label}</option>)}</select>; }
    else if (type === 'checkbox') control = <input {...attrs} type="checkbox" checked={Boolean(form[field.name])} onChange={update} />;
    else control = <input {...attrs} type={type} value={form[field.name] ?? ''} onChange={update} />;
    return <label key={field.name} className={`cm-field ${type === 'textarea' || type === 'file' ? 'cm-field--full' : ''}`} htmlFor={attrs.id}><span>{field.label}</span>{control}</label>;
  })}</>;
}
