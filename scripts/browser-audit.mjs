// Run against a local production server, using a disposable test storage state.
// PLAYWRIGHT_MODULE points to playwright-core if not installed in this repository.
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.AUDIT_BASE_URL || 'http://localhost:3100'
if (!/^http:\/\/(localhost|127\.0\.0\.1):/.test(base)) throw new Error('This audit only operates on local servers.')
const browser = await chromium.launch({headless:true})
const context = await browser.newContext({storageState:process.env.AUDIT_STORAGE_STATE || '/tmp/gst-audit-state.json', viewport:{width:1440,height:1000}})
const page=await context.newPage()
const errors=[]
page.on('pageerror',error=>errors.push({url:page.url(),message:error.message}))
page.on('console',message=>{if(message.type()==='error')errors.push({url:page.url(),message:message.text()})})
function data(file) {
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const exports={};new Function('exports','require',js)(exports,(specifier)=>data(path.resolve(path.dirname(file),specifier)+'.ts'));return exports
}
const routes=JSON.parse(fs.readFileSync('docs/audit/route-inventory.json')).map(r=>r.route).filter(r=>!r.includes('[')&&!['/onboarding','/register','/login'].includes(r))
for(const [file,name,route] of [['hr','hrGroups','hr'],['crm','crmTabs','crm'],['travelExpense','teTabs','travel-expense'],['asset','assetTabs','asset-management'],['support','supportNav','support-ticketing'],['pos','posNav','sales-pos']]) {
 const registry=data(`src/lib/${file}Data.ts`)[name]
 for(const item of registry.flatMap(item=>item.items||[item])) routes.push(`/app/${route}?tab=${item.id}`)
}
for(const section of ['inbox','new','kb','templates','schema','brand','analytics']) routes.push(`/app/pitch-pilot/${section}`)
const business=data('src/lib/businessData.ts')
for(const slug of Object.keys(business.toolBySlug))routes.push(`/app/business/tool/${slug}`)
for(const spec of data('src/lib/pages/index.ts').allPages)routes.push('/'+spec.slug)
const results=[]
for(const route of [...new Set(routes)]) {
 try{
 const response=await page.goto(base+route,{waitUntil:'networkidle',timeout:15000})
 const body=await page.locator('body').innerText()
 results.push({route,status:response.status(),finalUrl:page.url().replace(base,''),textLength:body.length,headings:await page.locator('h1,h2').allTextContents(),pass:response.ok()&&body.length>50&&!body.includes('Application error:')})
 }catch(error){results.push({route,pass:false,error:error.message})}
 if(results.length % 25 === 0) console.log(`Checked ${results.length} routes; latest ${route}`)
}
await page.goto(base+'/app/crm?tab=leads')
await page.getByRole('button',{name:'+ New lead',exact:true}).first().click()
await page.getByRole('dialog').getByLabel('Name').fill('Audit Alpha')
await page.getByRole('dialog').getByLabel('Status').selectOption('Qualified')
await page.getByRole('button',{name:'Create lead',exact:true}).click()
await page.getByRole('button',{name:'+ New lead',exact:true}).first().click()
await page.getByRole('dialog').getByLabel('Name').fill('Audit Beta')
await page.getByRole('button',{name:'Create lead',exact:true}).click()
await page.getByRole('button',{name:'Qualified',exact:true}).click()
if(await page.getByRole('button',{name:'Delete Audit Beta',exact:true}).count())throw new Error('Status filter displays excluded record')
await page.getByRole('button',{name:'All',exact:true}).click()
await page.getByRole('textbox',{name:'Search leads...'}).fill('Alpha')
await page.getByRole('button',{name:'Delete Audit Alpha',exact:true}).waitFor()
if(await page.getByRole('button',{name:'Delete Audit Beta',exact:true}).count())throw new Error('Search displays excluded record')
await page.screenshot({path:'docs/audit/crm-filter.png',fullPage:false})
await page.goto(base+'/app/integrations')
const connect=page.getByRole('button',{name:/Add connection/i})
if(await connect.count()) {
 await connect.first().click();await page.locator('dialog[open]').waitFor();
 await page.screenshot({path:'docs/audit/shared-dialog.png'});await page.keyboard.press('Escape');
 if(await page.locator('dialog[open]').count())throw new Error('Escape failed to close shared modal')
}
await page.setViewportSize({width:390,height:844})
await page.goto(base+'/app/crm?tab=leads',{waitUntil:'networkidle'})
await page.getByRole('heading',{name:'CRM',exact:true}).waitFor()
await page.screenshot({path:'docs/audit/crm-mobile.png'})
await page.getByRole('button',{name:'Open workspace navigation'}).click()
await page.getByRole('dialog').getByRole('link',{name:'Inbox',exact:true}).click()
await page.waitForURL('**/app/inbox')
if(await page.locator('dialog[open]').count())throw new Error('Mobile navigation did not close')
await page.screenshot({path:'docs/audit/mobile-inbox.png'})
fs.writeFileSync('docs/audit/browser-results.json',JSON.stringify({base,results,errors,interactionChecks:['CRM create two different statuses','CRM status-filter exclusion','CRM search exclusion','shared dialog opens and Escape closes','mobile CRM screenshot','mobile menu navigates to Inbox and closes'],notes:'Route smoke coverage is not all interactions. Demo auth/storage; no server or external integration verified.'},null,2)+'\n')
await browser.close()
console.log(JSON.stringify({routes:results.length,failed:results.filter(r=>!r.pass).length,errors:errors.length}))
