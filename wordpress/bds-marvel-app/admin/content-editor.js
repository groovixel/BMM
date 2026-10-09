(function(){
 const hidden=document.getElementById('bds-content-data'),root=document.getElementById('bds-content-editor');if(!hidden||!root)return;
 let data;try{data=JSON.parse(hidden.value);}catch{data={};}
 const clone=x=>JSON.parse(JSON.stringify(x));
 const label=k=>({hero:'Main photo',src:'Product photo',desc:'Description',minNights:'Minimum nights',lat:'Latitude',lng:'Longitude',seo:'Search description',extra:'Consulting details',service:'Service URL slug',price:'Price per night (INR)',notification_email:'Notification email (blank uses site default)',enabled:'Enabled',name:'Field name',original:'Original text',replacement:'Replacement text'}[k]||k.replace(/([A-Z])/g,' $1').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase()));
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const defaults={products:{id:'',src:'',title:'New product',material:'',finish:'',use:''},fields:{name:'custom_field',label:'New field',type:'text',required:false,placeholder:'',options:[],enabled:true},options:{value:'',label:''},reviews:{name:'',text:'',rating:5,date:''},specs:['Specification','Value']};
 const blank=x=>Array.isArray(x)?x.map(blank):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,blank(v)])):typeof x==='boolean'?false:typeof x==='number'?0:'';
 function render(value,key,parent,set){
  const box=el('div','bds-field');
  if(Array.isArray(value)){
   const heading=el('div','bds-array-heading',label(key));box.append(heading);const list=el('div','bds-array');box.append(list);
   value.forEach((item,i)=>{const row=el('div','bds-array-item');row.append(render(item,String(i+1),key,v=>{value[i]=v;sync();}));const controls=el('div','bds-controls');
    for(const [text,fn] of [['↑',()=>{if(i>0)[value[i-1],value[i]]=[value[i],value[i-1]];}],['↓',()=>{if(i<value.length-1)[value[i+1],value[i]]=[value[i],value[i+1]];}],['Remove',()=>value.splice(i,1)]]){const b=el('button','button',text);b.type='button';b.addEventListener('click',()=>{fn();sync();redraw();});controls.append(b);}row.append(controls);list.append(row);});
   const add=el('button','button','Add item');add.type='button';add.addEventListener('click',()=>{let item=defaults[key]?clone(defaults[key]):value.length?blank(value[0]):'';if(key==='products')item.id='product-'+Date.now().toString(36);value.push(item);sync();redraw();});box.append(add);return box;
  }
  if(value&&typeof value==='object'){
   const group=el('details','bds-group');group.open=parent===undefined||['detail','content'].includes(key);group.append(el('summary','',label(key||'Content')));
   for(const [k,v] of Object.entries(value)){group.append(render(v,k,key,n=>{value[k]=n;sync();}));}box.append(group);return box;
  }
  const wrap=el('label','bds-label');wrap.append(el('span','',label(key)));let input;
  if(typeof value==='boolean'){input=el('input');input.type='checkbox';input.checked=value;input.addEventListener('change',()=>set(input.checked));}
  else if(key==='type'&&parent&&/^\d+$/.test(parent)){input=el('select');['text','email','tel','number','textarea','select','checkbox','file'].forEach(t=>{const o=el('option','',t);o.value=t;input.append(o);});input.value=value;input.addEventListener('change',()=>set(input.value));}
  else {input=el(typeof value==='string'&&(value.length>100||/description|body|blurb|text|message|cancellation|consultLine/.test(key))?'textarea':'input');if(input.tagName==='INPUT')input.type=typeof value==='number'?'number':'text';if(typeof value==='number')input.step='any';input.value=value??'';input.addEventListener('input',()=>set(typeof value==='number'?Number(input.value):input.value));}
  input.setAttribute('aria-label',label(key));wrap.append(input);box.append(wrap);
  if(typeof value==='string'&&/^(hero|image|src|logo)$/.test(key)||parent==='gallery'){
   const media=el('button','button','Choose image');media.type='button';media.addEventListener('click',()=>{const picker=wp.media({title:'Choose website image',multiple:false,library:{type:'image'}});picker.on('select',()=>{const v=picker.state().get('selection').first().toJSON().url;input.value=v;set(v);});picker.open();});box.append(media);
  }
  return box;
 }
 function sync(){hidden.value=JSON.stringify(data);}
 function redraw(){root.replaceChildren();for(const [k,v] of Object.entries(data))root.append(render(v,k,undefined,n=>{data[k]=n;sync();}));}
 redraw();document.getElementById('post')?.addEventListener('submit',sync);
})();
