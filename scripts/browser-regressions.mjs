import fs from 'node:fs'
import assert from 'node:assert/strict'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser=await chromium.launch({headless:true})
const context=await browser.newContext({storageState:process.env.AUDIT_STORAGE_STATE || '/tmp/gst-audit-state.json'})
const page=await context.newPage()
const checks=[]
try {
await page.goto('http://localhost:3100/app/crm?tab=leads',{waitUntil:'networkidle'})
// Explicit isolated demo fixtures test pagination without pretending to call a backend.
await page.evaluate(()=>{
 const workspace=JSON.parse(localStorage.getItem('apragya.workspace'))
 workspace.appRecords['crm.leads']=Array.from({length:27},(_,i)=>({id:`fixture-${i}`,title:`Page Test ${i}`,createdAt:new Date().toISOString(),fields:{Status:i===26?'Qualified':'New',Source:i===26?'Referral':'Website',Score:i===26?'90':'10'}}))
 localStorage.setItem('apragya.workspace',JSON.stringify(workspace))
})
await page.reload({waitUntil:'networkidle'})
assert.equal(await page.getByRole('button',{name:/Delete Page Test/}).count(),25)
await page.getByRole('button',{name:'Next',exact:true}).click()
assert.equal(await page.getByRole('button',{name:/Delete Page Test/}).count(),2)
checks.push('27-record lead fixture: first page 25, second page 2')
await page.getByRole('combobox',{name:'All sources',exact:true}).selectOption('Referral')
assert.equal(await page.getByRole('button',{name:/Delete Page Test/}).count(),1)
await page.getByRole('combobox',{name:'All scores',exact:true}).selectOption('Hot (80+)')
assert.equal(await page.getByRole('button',{name:'Delete Page Test 26',exact:true}).count(),1)
await page.getByRole('button',{name:'Board',exact:true}).click()
await page.getByRole('heading',{name:'Qualified',exact:true}).waitFor()
checks.push('Combined source/score filters and board mode')
await page.getByRole('button',{name:'+ New lead',exact:true}).first().click()
await page.getByRole('dialog').waitFor()
for(let i=0;i<16;i++){
 await page.keyboard.press('Tab')
 assert.equal(await page.evaluate(()=>Boolean(document.activeElement?.closest('dialog'))),true)
}
await page.keyboard.press('Escape')
assert.equal(await page.locator('dialog[open]').count(),0)
checks.push('Record modal traps Tab focus and closes with Escape')
const response=await page.goto('http://localhost:3100/a-route-that-does-not-exist',{waitUntil:'networkidle'})
assert.equal(response.status(),404)
await page.getByRole('heading',{name:'Page not found'}).waitFor()
assert.ok(page.url().endsWith('/a-route-that-does-not-exist'))
checks.push('Unknown route returns 404, renders recovery link and does not redirect')
await page.goto('http://localhost:3100/legal/privacy',{waitUntil:'networkidle'})
await page.getByRole('heading',{name:'Privacy Policy',exact:true}).waitFor()
await page.screenshot({path:'docs/audit/legal-page.png'})
checks.push('Nested legal route renders expected page')
fs.writeFileSync('docs/audit/browser-regressions.json',JSON.stringify({checks,passed:true,fixture:'isolated browser localStorage demo data; not backend verification'},null,2)+'\n')
console.log(JSON.stringify({passed:checks.length}))
} finally { await browser.close() }
