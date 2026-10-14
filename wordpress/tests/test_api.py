import urllib.request, urllib.error, http.cookiejar, json, datetime, uuid, os
from pathlib import Path
BASE=os.environ.get('BDS_TEST_URL', 'http://127.0.0.1:9401')
assert urllib.parse.urlparse(BASE).hostname in ('127.0.0.1','localhost'), 'Run only against a disposable local test site.'
checks=[]
def client(): return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
anon,guest,other,owner=client(),client(),client(),client()
def call(c,path,body=None,headers=None):
    h={'X-BDS-Request':'1','Origin':BASE}
    if body is not None: h['Content-Type']='application/json'
    if headers is not None:h=headers
    r=urllib.request.Request(BASE+'/wp-json/bds/v1'+path,data=json.dumps(body).encode() if body is not None else None,headers=h)
    try:
        with c.open(r,timeout=30) as response: return response.status,json.load(response)
    except urllib.error.HTTPError as e:
        return e.code,json.load(e)
def check(name,condition):
    assert condition,name
    checks.append(name); print('PASS',name,flush=True)
check('Anonymous session status',call(anon,'/auth/status')==(200,{'user':None}))
check('Owner API is private',call(anon,'/admin/bookings')[0]==403)
check('Booking requires sign-in',call(anon,'/stays/payments/orders',{})[0]==401)
check('Cross-origin write blocked',call(anon,'/auth/login',{}, {'Origin':'https://attacker.test','X-BDS-Request':'1','Content-Type':'application/json'})[0]==403)
check('CSRF custom header required',call(anon,'/auth/login',{}, {'Origin':BASE,'Content-Type':'application/json'})[0]==403)
suffix=uuid.uuid4().hex[:8]
user={'name':'Test Guest','email':f'guest-{suffix}@example.test','password':'bds-test-guest-pass'}
s,g=call(guest,'/auth/register',user);check('WordPress guest registration',s==200 and g['role']=='guest')
check('Session cookie persists',call(guest,'/auth/status')[1]['user']['user_id']==g['user_id'])
check('Guest cannot access owner API',call(guest,'/admin/enquiries')[0]==403)
check('Invalid password rejected',call(other,'/auth/login',{'email':user['email'],'password':'wrong'})[0]==401)
s,o=call(owner,'/auth/login',{'email':'owner@example.test','password':'bds-test-owner-pass'});check('WordPress administrator sign-in',s==200 and o['role']=='admin')
baseline=call(owner,'/admin/overview')[1]
ci=datetime.date.today()+datetime.timedelta(days=400+int(suffix,16)%100000)
co=ci+datetime.timedelta(days=3)
b={'stay':'The Living Studio','stay_slug':'living-studio','mode':'instant','check_in':str(ci),'check_out':str(co),'adults':2,'children':0,'infants':0,'pets':0,'capacity':99,'nightly':1,'name':'Test Guest','email':user['email'],'phone':'9999999999','message':'LOCAL TEST'}
check('Invalid dates rejected',call(guest,'/stays/payments/orders',{**b,'check_in':'2030-02-30'})[0] in (400,422))
check('Past dates rejected',call(guest,'/stays/payments/orders',{**b,'check_in':'2020-01-01'})[0] in (400,422))
check('Server capacity enforced',call(guest,'/stays/payments/orders',{**b,'adults':7})[0] in (400,422))
s,order=call(guest,'/stays/payments/orders',b);bk=order.get('booking',{})
check('Unconfigured checkout creates unpaid request',s==201 and order.get('payment_required') is False and bk.get('status')=='requested' and bk.get('payment_status')=='not_required')
check('Server price overrides tampering',bk.get('nightly')==28000 and bk.get('total')==84000)
check('Owner approval confirms unpaid request',call(owner,'/admin/bookings/'+bk['id']+'/status',{'status':'confirmed'})[1]['status']=='confirmed')
check('Confirmed overlap blocked',call(guest,'/stays/payments/orders',b)[0]==409)
check('Trip history returns own booking',call(guest,'/stays/bookings/mine')[1][0]['id']==bk['id'])
check('Trip detail returns own booking',call(guest,'/stays/bookings/'+bk['id'])[1]['id']==bk['id'])
s,g2=call(other,'/auth/register',{**user,'email':f'other-{suffix}@example.test'})
check('Other guest cannot read trip',s==200 and call(other,'/stays/bookings/'+bk['id'])[0]==404)
s,a=call(anon,'/stays/availability?stay=The%20Living%20Studio');check('Availability contains no guest data',s==200 and any(x['check_in']==str(ci) for x in a['booked']) and not any(k in json.dumps(a) for k in ['email','phone','user_id']))
req={**b,'check_in':str(ci+datetime.timedelta(days=10)),'check_out':str(co+datetime.timedelta(days=10)),'mode':'request'}
s,o1=call(guest,'/stays/payments/orders',req);s2,o2=call(other,'/stays/payments/orders',req);r1=o1.get('booking',{});r2=o2.get('booking',{});check('Pending requests do not block dates',s==201 and s2==201 and o1.get('payment_required') is False and o2.get('payment_required') is False and r1.get('status')=='requested')
check('Owner can approve request',call(owner,'/admin/bookings/'+r1['id']+'/status',{'status':'confirmed'})[1]['status']=='confirmed')
check('Owner cannot approve overlapping request',call(owner,'/admin/bookings/'+r2['id']+'/status',{'status':'confirmed'})[0]==409)
check('Owner can cancel booking',call(owner,'/admin/bookings/'+r1['id']+'/status',{'status':'cancelled'})[1]['status']=='cancelled')
check('Owner can cancel confirmed fallback request',call(owner,'/admin/bookings/'+bk['id']+'/status',{'status':'cancelled'})[1]['status']=='cancelled')
for endpoint in ['inquiries','consultations','sample-requests','product-inquiries','quote-requests']:
    s,d=call(anon,'/'+endpoint,{'name':'Test Enquiry','email':'local-test@example.test','message':'LOCAL TEST','requirements':'Sample request','phone':'0000000000','service':'Marble & Stone Consulting','product':'Test product','want_sample':True})
    check(endpoint+' saves in WordPress',s==201 and 'id' in d)
check('Invalid enquiry email rejected',call(anon,'/inquiries',{'name':'Test','email':'broken'})[0]==422)
s,overview=call(owner,'/admin/overview');check('Owner overview counts records',s==200 and overview['total_bookings']==baseline['total_bookings']+3 and overview['total_enquiries']==baseline['total_enquiries']+5)
check('Owner enquiry list combines all types',len(call(owner,'/admin/enquiries')[1])==baseline['total_enquiries']+5)
check('Private attachments require owner',call(guest,'/files/'+str(uuid.uuid4()))[0]==403)
check('Plain permalink REST endpoint works',json.load(anon.open(BASE+'/?rest_route=/bds/v1/auth/status'))=={'user':None})
for path in ['/','/about','/projects','/catalogue','/catalogue/marble','/stays','/stays/home/living-studio','/stays/book/living-studio','/owner']:
    with anon.open(BASE+path) as r: check('Clean route '+path,r.status==200 and 'id="bdsm-marvel-root"' in r.read().decode())
# Private multipart attachment round-trip; no public upload URL is created.
png=__import__('base64').b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZgAAAABJRU5ErkJggg==')
boundary='bds-test-boundary'
def upload(filename, mime, content):
    raw=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n'.encode()+content+f'\r\n--{boundary}--\r\n'.encode())
    request=urllib.request.Request(BASE+'/wp-json/bds/v1/consultations/upload',data=raw,headers={'X-BDS-Request':'1','Origin':BASE,'Content-Type':'multipart/form-data; boundary='+boundary})
    try:
        with anon.open(request) as response:return response.status,json.load(response)
    except urllib.error.HTTPError as e:return e.code,json.load(e)
s,f=upload('test.png','image/png',png)
check('Private image upload succeeds',s==200 and 'id' in f)
check('Guest cannot download uploaded image',call(guest,'/files/'+f['id'])[0]==403)
with owner.open(BASE+'/wp-json/bds/v1/files/'+f['id']) as response:
    check('Owner download matches original bytes',response.status==200 and response.read()==png and response.headers['Content-Type']=='application/octet-stream')
check('Executable upload rejected',upload('test.php','application/x-httpd-php',b'<?php echo 1;')[0]==422)
check('Logout revokes session',call(guest,'/auth/logout',{})[0]==200 and call(guest,'/auth/status')[1]['user'] is None)
Path(__file__).with_name('api-test-results.json').write_text(json.dumps({'passed':len(checks),'checks':checks},indent=2))
print('TOTAL',len(checks))
