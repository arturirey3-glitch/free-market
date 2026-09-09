import path from 'node:path';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {accessToken,windowDates} from './fetch_gsc_ranks.mjs';
import {args,read,write,locked} from './store.mjs';

export function rows(report) {
  return (report.rows||[]).map(row=>Object.fromEntries([
    ...(report.dimensionHeaders||[]).map((h,i)=>[h.name,row.dimensionValues[i].value]),
    ...(report.metricHeaders||[]).map((h,i)=>[h.name,Number(row.metricValues[i].value)])]));
}
export async function measureGA4(repo,options={},request) {
  const config=read(repo,'config.json'),propertyId=config.ga4?.propertyId;
  if(!/^\d+$/.test(propertyId||''))throw new Error('GA4 numeric property ID is not configured');
  const days=Number(options.days||28),dates=windowDates(days,config.finalDataLagDays,options.now||new Date());
  const host=new URL(config.targetOrigin).hostname;
  if(!request) {
    const token=await accessToken({...process.env,GSC_ACCESS_TOKEN:process.env.GA_ACCESS_TOKEN||''},'https://www.googleapis.com/auth/analytics.readonly');
    request=async body=>{
      const response=await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
      if(!response.ok) {
        const body=await response.json().catch(()=>({}));
        const reason=body.error?.details?.find(x=>x.reason)?.reason||body.error?.status||'UNKNOWN';
        throw new Error(`GA4 HTTP ${response.status} (${reason}); check API enablement and property access`);
      }
      return response.json();
    };
  }
  const base={dateRanges:[dates],dimensionFilter:{filter:{fieldName:'hostName',stringFilter:{matchType:'EXACT',value:host,caseSensitive:false}}},limit:10000};
  const totals=await request({...base,metrics:['activeUsers','sessions','screenPageViews','ecommercePurchases','purchaseRevenue'].map(name=>({name}))});
  const pages=await request({...base,dimensions:[{name:'pagePath'}],metrics:[{name:'screenPageViews'}],orderBys:[{metric:{metricName:'screenPageViews'},desc:true}]});
  const channels=await request({...base,dimensions:[{name:'sessionDefaultChannelGroup'}],metrics:[{name:'sessions'},{name:'activeUsers'}]});
  return {source:'ga4',propertyId,host,days,...dates,measuredAt:(options.now||new Date()).toISOString(),
    propertyTimeZone:totals.metadata?.timeZone||null,currencyCode:totals.metadata?.currencyCode||null,
    subjectToThresholding:!!totals.metadata?.subjectToThresholding,
    totals:rows(totals)[0]||null,
    publicPages:rows(pages).filter(x=>/^\/$|^\/products\/?$|^\/products\/[a-zA-Z0-9-]+\/?$/.test(x.pagePath)),
    channels:rows(channels),note:'Purchase counts reflect recorded GA events, not verified Stripe orders. GA dates use property time zone; GSC uses Pacific time.'};
}
export function appendAnalytics(repo,snapshot) {
  const file=path.join(repo,'data/seo/analytics-history.json');
  const previous=fs.existsSync(file)?read(repo,'analytics-history.json'):[];
  write(repo,'analytics-history.json',[...previous,snapshot]);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const a=args(process.argv.slice(2)),repo=path.resolve(a.repo||'.');
  locked(repo,async()=>{const snapshot=await measureGA4(repo,a);if(a.append)appendAnalytics(repo,snapshot);console.log(JSON.stringify(snapshot,null,2));})
    .catch(e=>{console.error(e.message);process.exitCode=1;});
}
