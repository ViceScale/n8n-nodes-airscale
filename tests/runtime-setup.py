"""Create synthetic-only workflows in an isolated loopback n8n instance."""
import json, urllib.request, urllib.error, http.cookiejar
from pathlib import Path
BASE='http://127.0.0.1:5682'
jar=http.cookiejar.MozillaCookieJar('.local-runtime/qa-cookies.txt');jar.load(ignore_discard=True,ignore_expires=True)
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def call(path,body=None,method=None):
 req=urllib.request.Request(BASE+path,data=json.dumps(body).encode() if body is not None else None,method=method or ('POST' if body is not None else 'GET'),headers={'Content-Type':'application/json'})
 try:
  with opener.open(req,timeout=30) as r:return json.load(r).get('data')
 except urllib.error.HTTPError as e:raise RuntimeError(f'{path}: {e.code} {e.read().decode()[:400]}')
cred=call('/rest/credentials',{'name':'Airscale — SYNTHETIC FIXTURE ONLY','type':'airscaleApi','data':{'apiKey':'airscale-n8n-fixture-key','callbackSecret':'synthetic-callback-secret-with-32-characters'}})
credential={'airscaleApi':{'id':cred['id'],'name':cred['name']}}
manual={'id':'manual','name':'Manual Trigger','type':'n8n-nodes-base.manualTrigger','typeVersion':1,'position':[240,300],'parameters':{}}
def air(name,params,pos):return {'id':name.lower().replace(' ','-'),'name':name,'type':'n8n-nodes-airscale.airscale','typeVersion':1,'position':pos,'parameters':params,'credentials':credential}
def mapping(name,values,pos):return {'id':name.lower().replace(' ','-'),'name':name,'type':'n8n-nodes-base.set','typeVersion':3.4,'position':pos,'parameters':{'assignments':{'assignments':[{'id':k,'name':k,'value':v,'type':t} for k,v,t in values]},'options':{}}}
def create(name,nodes):
 connections={nodes[i]['name']:{'main':[[{'node':nodes[i+1]['name'],'type':'main','index':0}]]} for i in range(len(nodes)-1)}
 body={'name':name,'nodes':nodes,'connections':connections,'settings':{'executionOrder':'v1'},'active':False}
 result=call('/rest/workflows',body)
 return result
credit=create('Airscale — Credit balance mapping (synthetic demo)',[manual,air('Check Credit Balance',{'resource':'workspace','operation':'credits'},[480,300]),mapping('Map Credit Balance',[('availableCredits','={{ $json.credits }}','number'),('source','Synthetic fixture — no live API credits','string')],[720,300])])
rows=create('Airscale — Readable table mapping (synthetic demo)',[manual,air('List Rows',{'resource':'row','operation':'getAll','tableId':{'mode':'list','value':'7c9e6679-7425-40de-944b-e07fc1f90ae7','cachedResultName':'Fixture Prospects — Synthetic Data'},'returnAll':False,'limit':50},[480,300]),mapping('Map Contact',[('name','={{ $json.fields.Name }}','string'),('email','={{ $json.fields.Email }}','string'),('count','={{ $json.fields.Count }}','number'),('metadata','={{ $json.fields.Metadata }}','object')],[720,300])])
rows['nodes'][-1]['parameters']={'mode':'raw','jsonOutput':'={{ { name: $json.fields.Name, email: $json.fields.Email, count: $json.fields.Count, metadata: $json.fields.Metadata } }}','options':{}}
rows=call('/rest/workflows/'+rows['id'],{'nodes':rows['nodes']},'PATCH')
ids={'credentialId':cred['id'],'creditsWorkflowId':credit['id'],'rowsWorkflowId':rows['id']}
Path('.local-runtime/fixture-ids.json').write_text(json.dumps(ids,indent=2))
for name,wf in [('credit-balance',credit),('table-row-mapping',rows)]:
 exported={k:wf[k] for k in ['name','nodes','connections','settings']};exported['active']=False
 for node in exported['nodes']:
  for data in node.get('credentials',{}).values(): data.pop('id',None)
 Path('examples/'+name+'.json').write_text(json.dumps(exported,indent=2)+'\n')
print(json.dumps(ids))
