import json,urllib.request,urllib.error,http.cookiejar,re,os
from pathlib import Path
BASE=os.environ.get('BDS_TEST_URL','http://127.0.0.1:9405').rstrip('/')
assert urllib.parse.urlparse(BASE).hostname in ('127.0.0.1','localhost'), 'Use a disposable local WordPress instance only'
c=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));checks=[]
def check(n,v):
 assert v,n
 checks.append(n);print('PASS',n,flush=True)
c.open(BASE+'/wp-login.php').read()
c.open(BASE+'/wp-login.php',data=urllib.parse.urlencode({'log':'owner@example.test','pwd':'bds-test-owner-pass','wp-submit':'Log In','redirect_to':BASE+'/wp-admin/','testcookie':'1'}).encode()).read()
html=c.open(BASE+'/').read().decode();config=json.JSONDecoder().raw_decode(html.split('window.BDS_WORDPRESS = ',1)[1])[0];nonce=config['nonce'];check('WordPress editor sign-in',bool(nonce))
def api(path,body=None,auth=True):
 h={'Content-Type':'application/json'}
 if auth:h['X-WP-Nonce']=nonce
 r=urllib.request.Request(BASE+'/wp-json/'+path+('?per_page=100' if body is None and path.startswith('wp/v2/bds_') and '/' not in path[6:] else ''),headers=h,data=json.dumps(body).encode() if body is not None else None)
 try:
  with (c if auth else urllib.request.build_opener()).open(r) as z:return z.status,json.load(z)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
def content():return api('bds/v1/content',auth=False)[1]
# Restore the local inquiry definition so this suite is safely repeatable.
seed=json.loads((Path(__file__).resolve().parents[1]/'bds-marvel-app/includes/content-defaults.json').read_text())
s,fs=api('wp/v2/bds_form');local_form=next(x for x in fs if x['slug']=='inquiries');api('wp/v2/bds_form/'+str(local_form['id']),{'meta':{'_bds_fields':json.dumps({**seed['forms']['inquiries'],'slug':'inquiries'})}})
s,projects=api('wp/v2/bds_project');baseline=len(projects);check('Editor lists seeded projects',s==200 and len(projects)>=10)
check('Anonymous cannot edit content',api('wp/v2/bds_project',{'title':'BLOCKED'},False)[0]==401)
s,p=api('wp/v2/bds_project',{'title':'CMS QA project','status':'publish','slug':'cms-qa-project-'+__import__('uuid').uuid4().hex[:6],'meta':{'_bds_fields':json.dumps({'category':'New category','segment':'MARBLE & STONE','image':'https://example.test/qa.png','gallery':[],'description':'Edited description','challenge':'Test','approach':'Test','outcomes':[],'credits':[],'location':'Jaipur','year':'2026'})}});check('Add project in WordPress',s==201)
check('New project in public content',any(x['title']=='CMS QA project' for x in content()['projects']))
api('wp/v2/bds_project/'+str(p['id']),{'title':'CMS QA edited'})
check('Edit project title reaches frontend',any(x['title']=='CMS QA edited' for x in content()['projects']))
api('wp/v2/bds_project/'+str(p['id']),{'status':'draft'})
check('Draft removes project from frontend',not any(x['slug']==p['slug'] for x in content()['projects']))
s,stays=api('wp/v2/bds_stay');stay=next(x for x in stays if x['slug']=='living-studio');data=json.loads(stay['meta']['_bds_fields']);old=next(x for x in seed['stays'] if x['slug']=='living-studio');data['price']='₹31000';data['guests']=3;data['gallery']=['https://example.test/real-photo.png'];api('wp/v2/bds_stay/'+str(stay['id']),{'title':'Edited Living Studio','meta':{'_bds_fields':json.dumps(data)}})
d=next(x for x in content()['stays'] if x['slug']=='living-studio');check('Stay price capacity gallery editable',d['name']=='Edited Living Studio' and d['guests']==3 and d['price']=='₹31000' and len(d['gallery'])==1)
# custom login cookie supports booking API; native nonce and CSRF header both required.
def bds(path,body):
 r=urllib.request.Request(BASE+'/wp-json/bds/v1'+path,data=json.dumps(body).encode(),headers={'X-WP-Nonce':nonce,'Content-Type':'application/json','Origin':BASE,'X-BDS-Request':'1'})
 try:
  with c.open(r) as z:return z.status,json.load(z)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
b={'stay_slug':'living-studio','mode':'request','check_in':'2041-01-10','check_out':'2041-01-12','name':'LOCAL CMS QA','email':'local@example.test','phone':'9999999999','adults':4}
check('Checkout enforces edited capacity',bds('/stays/payments/orders',b)[0] in (400,422))
s,order=bds('/stays/payments/orders',{**b,'adults':2});bk=order.get('booking',{});check('Checkout uses edited name and price without payment keys',s==201 and order.get('payment_required') is False and bk.get('total')==62000 and bk.get('stay')=='Edited Living Studio' and bk.get('payment_status')=='not_required')
bds('/admin/bookings/'+bk['id']+'/status',{'status':'cancelled'})
api('wp/v2/bds_stay/'+str(stay['id']),{'meta':{'_bds_fields':json.dumps(old)},'title':'The Living Studio'})
s,cols=api('wp/v2/bds_collection');col=cols[0];cd=json.loads(col['meta']['_bds_fields']);cd['detail']['products']=[];api('wp/v2/bds_collection/'+str(col['id']),{'title':'Edited catalogue','meta':{'_bds_fields':json.dumps(cd)}});check('Catalogue products can all be removed',next(x for x in content()['catalogueItems'] if x['slug']==col['slug'])['detail']['products']==[])
s,forms=api('wp/v2/bds_form');f=next(x for x in forms if x['slug']=='inquiries');fd=json.loads(f['meta']['_bds_fields']);fd['fields'].append({'name':'custom_note','label':'Your custom note','type':'text','required':True,'enabled':True,'options':[]});fd['submit_label']='Ask our team';api('wp/v2/bds_form/'+str(f['id']),{'meta':{'_bds_fields':json.dumps(fd)}})
check('Form labels and custom fields published',content()['forms']['inquiries']['submit_label']=='Ask our team')
check('Custom required field validated',bds('/inquiries',{'name':'LOCAL TEST','email':'test@example.test','message':'Test'})[0]==422)
s,e=bds('/inquiries',{'name':'LOCAL TEST','email':'test@example.test','message':'Test','custom_note':'This value survives'});check('Custom field saved in submission',s==201 and e['custom_note']=='This value survives')
fd['enabled']=False;api('wp/v2/bds_form/'+str(f['id']),{'meta':{'_bds_fields':json.dumps(fd)}});check('Disabled form rejects submissions',bds('/inquiries',{'name':'Test','email':'test@example.test'})[0]==410)
check('Seed runs once without duplicates',len(api('wp/v2/bds_project')[1])==baseline)
# Additional form placement and hidden-section behavior.
s,custom=api('wp/v2/bds_form',{'title':'Custom QA form','slug':'local-custom-'+__import__('uuid').uuid4().hex[:6],'status':'publish','meta':{'_bds_fields':json.dumps({'enabled':True,'submit_label':'Send custom request','success_message':'Received custom QA','fields':[{'name':'name','label':'Name','type':'text','required':True,'enabled':True},{'name':'email','label':'Email','type':'email','required':True,'enabled':True},{'name':'note','label':'Custom note','type':'textarea','required':True,'enabled':True}]})}})
s,page=api('wp/v2/pages',{'title':'Local shortcode QA','status':'publish','content':'[bds_marvel_form slug="'+custom['slug']+'"]'})
page_html=urllib.request.urlopen(page['link']).read().decode();check('New forms embed in WordPress pages','bds-public-form' in page_html and 'Custom note' in page_html)
s,e=bds('/forms/'+custom['slug'],{'name':'Local shortcode QA','email':'local@example.test','note':'Custom form value'});check('New custom form stores submitted fields',s==201 and 'Custom form value' in c.open(BASE+'/wp-admin/admin.php?page=bds-submissions').read().decode())
s,sections=api('wp/v2/bds_section');section=next(x for x in sections if x['slug']=='team');api('wp/v2/bds_section/'+str(section['id']),{'status':'draft'});check('Hidden site sections stay removed',content()['team']==[]);api('wp/v2/bds_section/'+str(section['id']),{'status':'publish'})
api('wp/v2/bds_form/'+str(f['id']),{'meta':{'_bds_fields':json.dumps({**seed['forms']['inquiries'],'slug':'inquiries'})}})
api('wp/v2/bds_form/'+str(custom['id']),{'status':'draft'});api('wp/v2/pages/'+str(page['id']),{'status':'draft'})
open(Path(__file__).with_name('editable-test-results.json'),'w').write(json.dumps(checks,indent=2));print('TOTAL',len(checks))
