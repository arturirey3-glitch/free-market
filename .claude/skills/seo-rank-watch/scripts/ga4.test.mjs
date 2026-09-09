import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {measureGA4,appendAnalytics} from './fetch_ga4_metrics.mjs';
test('GA uses exact host, retains public paths only, and appends without changing history',async()=>{
 const repo=fs.mkdtempSync(path.join(os.tmpdir(),'ga4-test-'));
 try {
  fs.mkdirSync(path.join(repo,'data/seo'),{recursive:true});
  fs.writeFileSync(path.join(repo,'data/seo/config.json'),JSON.stringify({ga4:{propertyId:'123'},targetOrigin:'https://www.example.com',finalDataLagDays:3}));
  const snapshot=await measureGA4(repo,{},async body=>{
   assert.equal(body.dimensionFilter.filter.stringFilter.value,'www.example.com');
   assert.equal(body.dimensionFilter.filter.stringFilter.matchType,'EXACT');
   if(body.dimensions?.[0].name==='pagePath')return {dimensionHeaders:[{name:'pagePath'}],metricHeaders:[{name:'screenPageViews'}],rows:['/','/products/abc-123','/account','/products/abc?email=private'].map(value=>({dimensionValues:[{value}],metricValues:[{value:'2'}]}))};
   return {};
  });
  assert.equal(snapshot.totals,null);
  assert.deepEqual(snapshot.publicPages,[{pagePath:'/',screenPageViews:2},{pagePath:'/products/abc-123',screenPageViews:2}]);
  appendAnalytics(repo,snapshot);appendAnalytics(repo,{...snapshot,days:7});
  const history=JSON.parse(fs.readFileSync(path.join(repo,'data/seo/analytics-history.json')));
  assert.deepEqual(history[0],snapshot);assert.equal(history.length,2);
  await assert.rejects(measureGA4(repo,{},async()=>{throw new Error('API unavailable');}),/API unavailable/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(repo,'data/seo/analytics-history.json'))).length,2);
 } finally {fs.rmSync(repo,{recursive:true,force:true});}
});
