import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const root=process.cwd(), require=createRequire(path.join(root,'wordpress/build-tools/package.json'));
const {parse}=require('@babel/parser');
const appPath=path.join(root,'frontend/src/App.js');
let source=await fs.readFile(appPath,'utf8');
const names=['segments','livingStudio','stays','stayTiers','approach','clients','projects','catalogueItems','catalogueDetails','SEGMENT_SEO','serviceExtras','cities','principles','timeline','team'];
const ast=parse(source,{sourceType:'module',plugins:['jsx']});
const declarations=[],forms={},copy={};
function walk(node,fn){if(!node||typeof node!=='object')return; if(node.type)fn(node);for(const [key,value] of Object.entries(node)){if(['loc','start','end','extra'].includes(key))continue;if(Array.isArray(value))value.forEach(v=>walk(v,fn));else if(value&&typeof value==='object')walk(value,fn);}}
walk(ast,n=>{if(n.type==='VariableDeclarator'&&names.includes(n.id.name))declarations.push(n);});
const context=vm.createContext({wordpressContent:(_k,v)=>v,publicAsset:p=>p, img:id=>id});
for(const n of declarations){vm.runInContext(`var ${n.id.name} = ${source.slice(n.init.start,n.init.end)};`,context);}
const defaults=JSON.parse(JSON.stringify(Object.fromEntries(names.filter(k=>context[k]).map(k=>[k,context[k]]))));
// Preserve the current per-product gallery as actual editable product records.
const galleryCode=await fs.readFile(path.join(root,'frontend/src/catalogueGallery.js'),'utf8');
const gctx=vm.createContext({});vm.runInContext(galleryCode.replace('export function','function')+';this.buildMaterialGallery=buildMaterialGallery;',gctx);
for(const [slug,detail] of Object.entries(defaults.catalogueDetails)){
 const item=defaults.catalogueItems.find(i=>i.slug===slug)||Object.values(defaults.serviceExtras).flatMap(x=>x.catalogue||[]).find(i=>i.slug===slug);
 if(item)detail.products=gctx.buildMaterialGallery(item,detail,id=>id).map((p,i)=>({...p,id:`piece-${i+1}`}));
}
// Form field definitions come from the current labels and controls, preserving defaults.
const formMap={'contact-modal-form':'inquiries','consultation-modal-form':'consultations','sample-modal-form':'sample-requests','inquiry-modal-form':'product-inquiries','product-quote-form':'quote-requests'};
const attr=(n,key)=>n.openingElement.attributes.find(a=>a.type==='JSXAttribute'&&a.name.name===key);
const val=a=>a?.value?.value??(a?.value?.expression?.value);
walk(ast,n=>{if(n.type!=='JSXElement'||n.openingElement.name.name!=='form')return;const key=formMap[val(attr(n,'data-testid'))];if(!key)return;
 const fields=[];
 for(const label of n.children.filter(x=>x.type==='JSXElement'&&x.openingElement.name.name==='label')){
  let control;walk(label,x=>{if(x.type==='JSXElement'&&['input','textarea','select'].includes(x.openingElement.name.name))control=x;});if(!control)continue;
  const cn=control.openingElement.name.name;
  const state=attr(control,'value')?.value?.expression||attr(control,'checked')?.value?.expression;
  const name=state?.property?.name||(val(attr(control,'type'))==='file'?'file':null);if(!name)continue;
  const texts=[];walk(label,x=>{if(x.type==='JSXText'&&x.value.trim())texts.push(x.value.trim());});
  const options=[];walk(control,x=>{if(x.type==='JSXElement'&&x.openingElement.name.name==='option'){const text=x.children.filter(c=>c.type==='JSXText').map(c=>c.value).join('').trim();options.push({value:val(attr(x,'value'))||'',label:text});}});
  fields.push({name,label:texts[0]||name,type:cn==='input'?(val(attr(control,'type'))||'text'):cn,required:!!attr(control,'required'),placeholder:val(attr(control,'placeholder'))||'',options,enabled:true});
 }
 forms[key]={enabled:true,submit_label:key==='consultations'?'REQUEST CONSULTATION':key.includes('requests')?'REQUEST QUOTE':'SEND INQUIRY',success_message:'Thanks — your request has been received.',notification_email:'',fields};
});
const previous=JSON.parse(await fs.readFile(path.join(root,'wordpress/bds-marvel-app/includes/content-defaults.json'),'utf8').catch(()=>'{}'));
defaults.forms=Object.keys(forms).length && Object.values(forms).every(f=>f.fields.length) ? forms : previous.forms;
// Text and link overrides are applied through the JSX runtime; no HTML injection.
async function collect(dir){for(const ent of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory()){await collect(p);continue;}if(!/\.(js|jsx)$/.test(ent.name)||/wordpress/.test(ent.name))continue;
 const code=await fs.readFile(p,'utf8');let tree;try{tree=parse(code,{sourceType:'module',plugins:['jsx']});}catch{continue;}
 walk(tree,n=>{let value;if(n.type==='JSXText')value=n.value.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).join(' ');if(n.type==='StringLiteral'&&((n.value.includes(' ')&&n.value.length>4&&!/[{}]/.test(n.value))||/^(https?:|mailto:|tel:)/.test(n.value)))value=n.value;
 if(value&&value.length<1500&&!/^photo-|^sx-|^cm-|^od-|^contact-modal|^data-/.test(value))copy[value]=path.relative(path.join(root,'frontend/src'),p);
 });}}
await collect(path.join(root,'frontend/src'));defaults.siteCopy=Object.values(Object.fromEntries([...(previous.siteCopy||[]),...Object.entries(copy).map(([original,section])=>({original,replacement:original,section}))].map(x=>[x.original,x])));
if(previous.policies)defaults.policies=previous.policies;
await fs.writeFile(path.join(root,'wordpress/bds-marvel-app/includes/content-defaults.json'),JSON.stringify(defaults,null,2));
// Wrap only once; existing builds continue to extract the original defaults.
for(const n of declarations.sort((a,b)=>b.init.start-a.init.start)){
 const init=source.slice(n.init.start,n.init.end);if(init.startsWith('wordpressContent('))continue;
 source=source.slice(0,n.init.start)+`wordpressContent(${JSON.stringify(n.id.name)}, ${init})`+source.slice(n.init.end);
}
if(!source.includes('import { wordpressContent'))source='import { wordpressContent, DynamicFields, formSettings } from "./wordpress-content";\n'+source;
await fs.writeFile(appPath,source);
console.log(`Prepared ${defaults.projects.length} projects, ${defaults.catalogueItems.length} collections, ${defaults.stays.length} stays, ${Object.keys(forms).length} forms and ${defaults.siteCopy.length} copy entries.`);
