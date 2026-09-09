import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {windowDates,filters,metric,measure,accessToken} from './fetch_gsc_ranks.mjs';
import {plan,review,recordAction} from './seo_watch.mjs';
import {appendHistory,read,write} from './store.mjs';

const config={siteUrl:'sc-domain:example.com',targetOrigin:'https://www.example.com',country:null,device:null,searchType:'web',timeZone:'Asia/Tokyo',cooldownDays:7,finalDataLagDays:3};
const scope={siteUrl:config.siteUrl,targetOrigin:config.targetOrigin,country:null,device:null,type:'web'};
const now=new Date('2026-09-10T02:00:00Z');
const w={keyword:'soap',targetPath:'/soap',priority:'normal'};
const m={...w,rank:4,impressions:80,clicks:3,ctr:3/80};
const snapshot=(days=28,other={})=>({days,source:'gsc',finalized:true,scope,measuredAt:'2026-09-10T01:00:00Z',
  startDate:'2026-08-10',endDate:'2026-09-06',observations:[m],discovery:[],...other});
const input={...w,needs:'Buy soap',gap:'Size missing',done:'Added verified size',method:'product-facts',
  sources:['https://example.org/soap'],deployedAt:now.toISOString(),deploymentEvidence:'commit abc verified live',runId:'one'};
const history=[snapshot(),snapshot(7,{startDate:'2026-08-31'})];
test('GSC uses Pacific dates and a seven-day inclusive window',()=>{
 assert.deepEqual(windowDates(7,3,new Date('2026-09-10T01:00:00Z')),{startDate:'2026-08-31',endDate:'2026-09-06'});
});
test('scope regex matches only the intended host',()=>{
 const regex=new RegExp(filters(config)[0].expression);
 assert.ok(regex.test('https://www.example.com/soap'));
 for(const url of ['https://skill.example.com/','https://wwwXexample.com/','https://evil.com/?https://www.example.com/'])assert.equal(regex.test(url),false);
});
test('zero impressions is null rank, malformed metrics are errors',()=>{
 assert.equal(metric({position:0,impressions:0,clicks:0,ctr:0},'a','/').rank,null);
 assert.throws(()=>metric({position:'4',impressions:10,clicks:1,ctr:.1},'a','/'));
});
test('selection prefers near-first tracked query, excludes observing pages and achieved keywords',()=>{
 const other={...w,keyword:'other',targetPath:'/other'};
 const s=snapshot(28,{observations:[m,{...other,rank:2,impressions:10}]});
 assert.equal(plan([w,other],[],[s],config,now).candidate.keyword,'other');
 assert.equal(plan([w,other],[{...other,status:'observing'},{...w,status:'achieved'}],[s],config,now).candidate,null);
 assert.equal(plan([w],[{...w,keyword:'different',status:'observing'}],[s],config,now).candidate,null);
});
test('empty/stale data creates no candidate; discovery is allowed',()=>{
 assert.equal(plan([],[],[],config,now).candidate,null);
 assert.equal(plan([w],[],[snapshot(28,{measuredAt:'2026-08-01T00:00:00Z'})],config,now).candidate,null);
 assert.equal(plan([],[],[snapshot(28,{observations:[],discovery:[m]})],config,now).candidate.keyword,w.keyword);
});
test('record needs baseline/evidence and enforces cooldown and run uniqueness',()=>{
 const r=recordAction([w],[],history,config,input,now);
 assert.equal(r.entry.nextReviewDate,'2026-09-17T02:00:00.000Z');
 assert.equal(r.entry.status,'observing');
 assert.throws(()=>recordAction([w],r.logs,history,config,{...input,runId:'two'},now));
 assert.throws(()=>recordAction([w],[],[snapshot()],config,input,now));
 assert.throws(()=>recordAction([w],[],history,config,{...input,deployedAt:'2099-01-01T00:00:00Z'},now));
});
test('review cannot use 28-day or overlapping post-change windows',()=>{
 const r=recordAction([w],[],history,config,input,now),later=new Date('2026-09-18T02:00:00Z');
 assert.equal(review(r.logs,[snapshot()],config,later).logs[0].status,'observing');
 assert.equal(review(r.logs,[snapshot(7,{startDate:'2026-09-08'})],config,later).logs[0].status,'observing');
 assert.equal(review(r.logs,history,config,new Date('2026-09-17T01:59:59Z')).reports.length,0);
});
test('post-change seven-day review marks measured outcomes only',()=>{
 const r=recordAction([w],[],history,config,input,now),later=new Date('2026-09-22T02:00:00Z');
 for(const [rank,status,outcome] of [[1,'achieved','achieved'],[2,'active','improved'],[5,'active','no_improvement']]){
  const s=snapshot(7,{startDate:'2026-09-11',endDate:'2026-09-17',measuredAt:later.toISOString(),observations:[{...m,rank}]});
  const got=review(r.logs,[s],config,later);assert.equal(got.logs[0].status,status);assert.equal(got.reports[0].outcome,outcome);
 }
});
test('missing credentials fail rather than generating zero-rank observations',async()=>{
 await assert.rejects(accessToken({}),/credentials missing/);
});
test('targeted reads preserve nulls; append keeps old observations untouched',async()=>{
 const repo=fs.mkdtempSync(path.join(os.tmpdir(),'seo-watch-test-'));
 try {
  fs.mkdirSync(path.join(repo,'data/seo'),{recursive:true});
  for(const [f,v] of [['config.json',config],['watchwords.json',[w]],['rank-history.json',[{old:'untouched',rank:7.2}]]])write(repo,f,v);
  const calls=[];
  const s=await measure(repo,{days:7,now},async body=>{calls.push(body);return {rows:[]};});
  assert.equal(s.observations[0].rank,null);assert.ok(calls.some(x=>x.dimensionFilterGroups[0].filters.some(f=>f.dimension==='query'&&f.expression==='soap')));
  appendHistory(repo,s);assert.deepEqual(read(repo,'rank-history.json')[0],{old:'untouched',rank:7.2});
 } finally {
  assert.ok(path.resolve(repo).startsWith(path.resolve(os.tmpdir())+path.sep));
  assert.ok(path.basename(repo).startsWith('seo-watch-test-'));
  fs.rmSync(repo,{recursive:true,force:true});
 }
});
