import fs from 'node:fs';
import path from 'node:path';
import { createSign } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { args, read, locked, appendHistory, localDate, dateOffset, targetUrl } from './store.mjs';

async function googleJSON(url,options) {
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw new Error(`Google API HTTP ${response.status}; check API enablement, token scope and property permission. No observation saved.`);
  return response.json();
}
export async function accessToken(env=process.env) {
  if(env.GSC_ACCESS_TOKEN)return env.GSC_ACCESS_TOKEN;
  const file=env.GSC_CREDENTIALS_FILE||env.GOOGLE_APPLICATION_CREDENTIALS;
  if(!file)throw new Error('GSC credentials missing. Set GSC_CREDENTIALS_FILE to an external Google credential JSON. Search Console website registration alone is not API authorization.');
  let c;
  try { c=JSON.parse(fs.readFileSync(file,'utf8')); } catch { throw new Error('Cannot read GSC credential JSON; no secret contents logged.'); }
  const form=new URLSearchParams();
  if(c.type==='service_account'&&c.client_email&&c.private_key) {
    const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
    const now=Math.floor(Date.now()/1000);
    const unsigned=b64({alg:'RS256',typ:'JWT'})+'.'+b64({iss:c.client_email,
      scope:'https://www.googleapis.com/auth/webmasters.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
    const sign=createSign('RSA-SHA256');sign.update(unsigned);sign.end();
    let signature;
    try { signature=sign.sign(c.private_key,'base64url'); } catch { throw new Error('Invalid service account private key'); }
    form.set('grant_type','urn:ietf:params:oauth:grant-type:jwt-bearer');form.set('assertion',unsigned+'.'+signature);
  } else if(c.type==='authorized_user'&&c.client_id&&c.client_secret&&c.refresh_token) {
    for(const [k,v] of Object.entries({grant_type:'refresh_token',client_id:c.client_id,client_secret:c.client_secret,refresh_token:c.refresh_token}))form.set(k,v);
  } else throw new Error('Unsupported Google credentials: service_account or authorized_user JSON required.');
  const result=await googleJSON('https://oauth2.googleapis.com/token',{method:'POST',body:form});
  if(!result.access_token)throw new Error('Google returned no access token');
  return result.access_token;
}
export function windowDates(days,lag=3,now=new Date()) {
  if(!Number.isInteger(days)||days<1||days>90)throw new Error('days must be 1..90');
  const end=dateOffset(localDate(now,'America/Los_Angeles'),-lag);
  return {startDate:dateOffset(end,1-days),endDate:end};
}
export function filters(config) {
  const escaped=config.targetOrigin.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const result=[{dimension:'page',operator:'includingRegex',expression:'^'+escaped+'/'}];
  if(config.country)result.push({dimension:'country',operator:'equals',expression:config.country});
  if(config.device)result.push({dimension:'device',operator:'equals',expression:config.device});
  return result;
}
export function metric(row,keyword,targetPath) {
  if(!row)return {keyword,targetPath,rank:null,impressions:0,clicks:0,ctr:0};
  if(![row.position,row.impressions,row.clicks,row.ctr].every(Number.isFinite)||(row.impressions>0&&row.position<1)||row.impressions<0||row.clicks<0)throw new Error('Unexpected GSC metrics');
  return {keyword,targetPath,rank:row.impressions?row.position:null,impressions:row.impressions,clicks:row.clicks,ctr:row.ctr};
}
export async function measure(repo,options={},request) {
  const config=read(repo,'config.json'),watch=read(repo,'watchwords.json');
  if(!Array.isArray(watch))throw new Error('Watchwords must be an array');
  const days=Number(options.days||28),dates=windowDates(days,config.finalDataLagDays,options.now||new Date());
  const siteUrl=process.env.GSC_SITE_URL||config.siteUrl;
  const scope={siteUrl,targetOrigin:config.targetOrigin,country:config.country,device:config.device,type:config.searchType};
  const base={...dates,type:config.searchType,dataState:'final',aggregationType:'auto',dimensionFilterGroups:[{groupType:'and',filters:filters(config)}]};
  if(!request) {
    const token=await accessToken();
    request=body=>googleJSON(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  }
  const discovery=[];let capped=false;
  for(let startRow=0;startRow<250000;startRow+=25000) {
    const response=await request({...base,dimensions:['query','page'],rowLimit:25000,startRow});
    const rows=response.rows||[];
    for(const row of rows) {
      if(!Array.isArray(row.keys)||row.keys.length!==2)throw new Error('Unexpected query/page dimensions');
      const u=new URL(row.keys[1]);
      if(u.origin!==config.targetOrigin)throw new Error('GSC returned a different host');
      discovery.push(metric(row,row.keys[0],u.pathname+u.search));
    }
    if(rows.length<25000)break;
    if(startRow===225000)capped=true;
  }
  const observations=[];
  for(const w of watch) {
    const extra=[{dimension:'query',operator:'equals',expression:w.keyword},
                 {dimension:'page',operator:'equals',expression:targetUrl(config,w.targetPath)}];
    const response=await request({...base,dimensions:[],dimensionFilterGroups:[{groupType:'and',filters:[...filters(config),...extra]}],rowLimit:1});
    observations.push(metric(response.rows?.[0],w.keyword,w.targetPath));
  }
  const daily=await request({...base,dimensions:['date'],rowLimit:25000});
  const availableDates=(daily.rows||[]).filter(r=>r.impressions>0).map(r=>r.keys[0]).sort();
  const total=await request({...base,dimensions:[],rowLimit:1});
  return {measuredAt:(options.now||new Date()).toISOString(),source:'gsc',days,...dates,scope,
    finalized:true,availableDates,totals:metric(total.rows?.[0],null,null),discoveryCapped:capped,discoveryIsExhaustive:false,observations,discovery};
}
export async function main(argv=process.argv.slice(2)) {
  const a=args(argv),repo=path.resolve(a.repo||'.');
  const result=await locked(repo,async()=>{const snapshot=await measure(repo,a);if(a.append)appendHistory(repo,snapshot);return snapshot;});
  console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
