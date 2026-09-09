import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { args,read,write,locked,pair,localDate,targetUrl } from './store.mjs';

const scopeKey=s=>JSON.stringify([s.siteUrl,s.targetOrigin,s.country,s.device,s.type]);
function allMetrics(snapshot) {
  const m=new Map((snapshot?.discovery||[]).map(x=>[pair(x),x]));
  for(const x of snapshot?.observations||[])m.set(pair(x),x);
  return m;
}
function compatible(snapshot,config) {
  return snapshot?.source==='gsc'&&snapshot.finalized===true&&scopeKey(snapshot.scope)===scopeKey({
    siteUrl:process.env.GSC_SITE_URL||config.siteUrl,targetOrigin:config.targetOrigin,country:config.country,
    device:config.device,type:config.searchType});
}
export function plan(watch,logs,history,config,now=new Date()) {
  const measured=history.filter(s=>compatible(s,config)&&s.days===28).at(-1);
  if(!measured||now-new Date(measured.measuredAt)>36*3600000)return {candidate:null,reason:'No recent 28-day GSC measurement',candidates:[]};
  const metrics=allMetrics(measured),tracked=new Set(watch.map(pair));
  const states=new Map(logs.map(x=>[pair(x),x]));
  const blockedKeywords=new Set(logs.filter(x=>['observing','achieved'].includes(x.status)).map(x=>x.keyword));
  const blockedPages=new Set(logs.filter(x=>x.status==='observing').map(x=>x.targetPath));
  const candidates=[];
  for(const w of [...watch,...(measured.discovery||[]).filter(x=>!tracked.has(pair(x)))]) {
    if(blockedKeywords.has(w.keyword)||blockedPages.has(w.targetPath))continue;
    const state=states.get(pair(w)),m=metrics.get(pair(w));
    if(!m)continue;
    let group=null;
    if(tracked.has(pair(w))) {
      if(m.impressions>0&&m.rank>=2&&m.rank<=10)group=0;
      else if(m.impressions>0&&m.rank>10&&m.rank<=20)group=1;
      else if(state?.status==='active'&&state.reviews?.length)group=2;
      else if(m.rank===null&&w.priority==='high')group=3;
    } else if(m.impressions>0&&m.rank>=2&&m.rank<=20)group=4;
    if(group!==null)candidates.push({...w,...m,group,tracked:tracked.has(pair(w))});
  }
  candidates.sort((a,b)=>a.group-b.group||(a.group===0?a.rank-b.rank:b.impressions-a.impressions));
  return {candidate:candidates[0]||null,candidates,measuredAt:measured.measuredAt,
    reason:candidates.length?'Choose one after search-intent and gap analysis':'No eligible candidate; observe only'};
}
export function review(logs,history,config,now=new Date()) {
  const result=structuredClone(logs),reports=[];
  for(const entry of result) {
    if(entry.status!=='observing'||new Date(entry.nextReviewDate)>now)continue;
    const action=entry.actions.at(-1);
    const snapshot=history.filter(s=>compatible(s,config)&&s.days===7&&new Date(s.measuredAt)<=now).at(-1);
    const m=allMetrics(snapshot).get(pair(entry));
    const actionDate=localDate(new Date(action.deployedAt),'America/Los_Angeles');
    let outcome;
    if(!snapshot||snapshot.startDate<=actionDate||!m||!m.impressions||m.rank===null||
       !action.baseline||scopeKey(snapshot.scope)!==scopeKey(action.baseline.scope))outcome='insufficient_data';
    else if(m.rank<=1){entry.status='achieved';outcome='achieved';}
    else {entry.status='active';outcome=action.baseline.rank===null?'measured_without_comparable_baseline':
       m.rank<action.baseline.rank?'improved':'no_improvement';}
    const record={reviewedAt:now.toISOString(),outcome,window:snapshot?{startDate:snapshot.startDate,endDate:snapshot.endDate}:null,
      rank:m?.rank??null,impressions:m?.impressions??0,clicks:m?.clicks??0};
    entry.reviews??=[];
    if(!entry.reviews.some(r=>r.window?.endDate===record.window?.endDate&&r.outcome===record.outcome))entry.reviews.push(record);
    reports.push({keyword:entry.keyword,targetPath:entry.targetPath,...record,status:entry.status,nextReviewDate:entry.nextReviewDate});
  }
  return {logs:result,reports};
}
export function recordAction(watch,logs,history,config,input,now=new Date()) {
  for(const field of ['keyword','targetPath','needs','gap','done','method','deployedAt','deploymentEvidence','runId'])
    if(typeof input[field]!=='string'||!input[field].trim())throw new Error('Missing action field: '+field);
  targetUrl(config,input.targetPath);
  if(!Array.isArray(input.sources)||input.sources.length<1||input.sources.length>3||
     input.sources.some(s=>typeof s!=='string'||!s.startsWith('https://')))throw new Error('Record 1–3 source page URLs');
  const deployed=new Date(input.deployedAt);
  if(!Number.isFinite(+deployed)||deployed>now)throw new Error('Deployment timestamp must be an actual past time');
  if(logs.some(x=>x.actions?.some(a=>a.runId===input.runId)))throw new Error('Only one improvement is allowed per run');
  const selected=plan(watch,logs,history,config,now).candidates.find(x=>pair(x)===pair(input));
  if(!selected)throw new Error('Keyword/page is not eligible (cooldown, achieved, or missing measurement)');
  const existing=logs.find(x=>pair(x)===pair(input));
  if(existing?.reviews?.at(-1)?.outcome==='no_improvement'&&existing.actions.at(-1).method===input.method)
    throw new Error('Use a different improvement method after no improvement');
  const baselineSnapshot=history.filter(s=>compatible(s,config)&&s.days===7&&new Date(s.measuredAt)<=deployed&&
    deployed-new Date(s.measuredAt)<=36*3600000).at(-1);
  const baseline=allMetrics(baselineSnapshot).get(pair(input));
  if(!baseline)throw new Error('Measure a seven-day baseline before applying the change');
  const entry=existing?structuredClone(existing):{keyword:input.keyword,targetPath:input.targetPath,actions:[],reviews:[]};
  const baselineData={...baseline,scope:baselineSnapshot.scope,startDate:baselineSnapshot.startDate,endDate:baselineSnapshot.endDate};
  entry.actions.push({...input,date:localDate(deployed,config.timeZone),rankAtAction:baseline.rank,baseline:baselineData});
  entry.status='observing';entry.nextReviewDate=new Date(+deployed+config.cooldownDays*86400000).toISOString();
  return {logs:[...logs.filter(x=>pair(x)!==pair(input)),entry],watch:watch.some(x=>pair(x)===pair(input))?watch:
    [...watch,{keyword:input.keyword,targetPath:input.targetPath,priority:'normal'}],entry};
}
export async function main(argv=process.argv.slice(2)) {
  const a=args(argv),repo=path.resolve(a.repo||'.'),command=a._[0];
  await locked(repo,async()=>{
    const config=read(repo,'config.json'),watch=read(repo,'watchwords.json'),logs=read(repo,'improvement-log.json'),history=read(repo,'rank-history.json');
    if(command==='plan')console.log(JSON.stringify(plan(watch,logs,history,config),null,2));
    else if(command==='review') {
      const r=review(logs,history,config);write(repo,'improvement-log.json',r.logs);console.log(JSON.stringify(r.reports,null,2));
    } else if(command==='record'&&typeof a.input==='string') {
      const input=JSON.parse(fs.readFileSync(a.input,'utf8'));
      const r=recordAction(watch,logs,history,config,input);write(repo,'watchwords.json',r.watch);write(repo,'improvement-log.json',r.logs);
      console.log(JSON.stringify(r.entry,null,2));
    } else throw new Error('Usage: seo_watch.mjs --repo PATH plan|review|record [--input ACTION_JSON]');
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
