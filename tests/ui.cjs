const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ExcelJS=require('exceljs');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'qa');
fs.mkdirSync(qa,{recursive:true});
(async()=>{
  let browser;
  for(const options of [{},{channel:'msedge'},{channel:'chrome'}]){
    try{browser=await chromium.launch({headless:true,...options});break;}catch(e){console.log('Browser unavailable:',options.channel || 'bundled Chromium',e.message.split('\n')[0]);}
  }
  if(!browser)throw new Error('No installed Chromium browser available.');
  const errors=[],external=[];
  const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',req=>{if(/^https?:/.test(req.url()))external.push(req.url());});
  try{
    const siteUrl=process.env.CALCULATOR_URL;
    await page.goto(siteUrl || pathToFileURL(path.join(root,'dist','index.html')).href);
    await page.waitForFunction(()=>!!window.PenaltyCore&&!!window.ExcelJS&&!!document.querySelector('svg'));
    await page.screenshot({path:path.join(qa,'desktop-empty.png'),fullPage:true});
    assert.equal(await page.locator('#copy').isDisabled(),true);
    await page.getByRole('button',{name:'Рассчитать',exact:true}).click();
    assert.equal(await page.locator('#validation').isVisible(),true);
    await page.getByRole('button',{name:'Заполнить учебный пример',exact:true}).click();
    assert.match(await page.locator('#total').innerText(),/28\s800,00/);
    assert.equal(await page.locator('.day-stat b').allTextContents().then(x=>x.join(',')),'12,4,8');
    assert.equal(await page.locator('#example-banner').isVisible(),true);
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(qa,'desktop-example.png'),fullPage:true});
    const downloadPromise=page.waitForEvent('download');await page.locator('#excel').click();const download=await downloadPromise;
    const xlsx=path.join(qa,'example.xlsx');await download.saveAs(xlsx);
    const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(xlsx);assert.equal(wb.worksheets.length,1);assert.equal(wb.getWorksheet('расчет пени').getCell('G14').value,28800);assert.equal(wb.getWorksheet('расчет пени').getCell('G8').value.result,28800);
    // Capture clipboard payload without relying on OS clipboard permissions during QA.
    await page.evaluate(()=>{window.qaCopy='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.qaCopy=text;}}});});
    await page.locator('#copy').click();
    const copied=await page.evaluate(()=>window.qaCopy);assert.match(copied,/Вымышленный акт № 2/);assert.match(copied,/ИТОГОВАЯ ПЕНЯ: 28\s800,00/);
    await page.evaluate(()=>{window.qaPrintCalls=0;window.print=()=>window.qaPrintCalls++;});await page.locator('#print').click();assert.equal(await page.evaluate(()=>window.qaPrintCalls),1);
    await page.emulateMedia({media:'print'});assert.equal(await page.locator('#print-report').isVisible(),true);assert.equal(await page.locator('#application').isVisible(),false);
    await page.screenshot({path:path.join(qa,'print-form.png'),fullPage:true});
    await page.pdf({path:path.join(qa,'example.pdf'),preferCSSPageSize:true,printBackground:true});
    await page.emulateMedia({media:'screen'});
    await page.locator('#rate').fill('0,2');assert.equal(await page.locator('#copy').isDisabled(),true);assert.equal(await page.locator('#stale').isVisible(),true);
    await page.setViewportSize({width:1280,height:900});assert.equal(await page.locator('#result-status').innerText(),'Требует обновления');assert.match(await page.locator('#print-report').innerHTML(),/не обновлён/);
    await page.getByRole('button',{name:'Рассчитать',exact:true}).click();assert.match(await page.locator('#total').innerText(),/57\s600,00/);
    await page.getByRole('button',{name:'По периодам',exact:true}).click();
    await page.locator('#period-0-end').fill('04.02.2024');await page.getByRole('button',{name:'Добавить интервал',exact:true}).click();
    await page.locator('#period-1-start').fill('05.02.2024');await page.locator('#period-1-end').fill('12.02.2024');await page.locator('#period-1-base').fill('1800000');await page.locator('#period-1-rate').fill('0,1');
    await page.getByRole('button',{name:'Рассчитать',exact:true}).click();assert.match(await page.locator('#total').innerText(),/36\s000,00/);
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(qa,'desktop-periods.png'),fullPage:true});
    await page.locator('#period-1-start').fill('04.02.2024');await page.getByRole('button',{name:'Рассчитать',exact:true}).click();assert.match(await page.locator('#validation').innerText(),/пересекаются/);
    await page.locator('#period-1-start').fill('10.02.2024');await page.getByRole('button',{name:'Рассчитать',exact:true}).click();assert.equal(await page.locator('#result-status').innerText(),'Неполный расчёт');assert.match(await page.locator('#result-content').innerText(),/Пропущено учитываемых дней: 1/);
    await page.getByRole('button',{name:'Очистить',exact:true}).click();assert.equal(await page.locator('#contractAmount').inputValue(),'');assert.equal(await page.locator('#example-banner').isVisible(),false);assert.equal(await page.locator('#excel').isDisabled(),true);assert.equal(await page.locator('#period-list').locator(':scope > div').count(),0);
    await page.getByRole('button',{name:'Заполнить учебный пример',exact:true}).click();await page.locator('#includeEnd').uncheck();await page.getByRole('button',{name:'Рассчитать',exact:true}).click();assert.match(await page.locator('#total').innerText(),/25\s200,00/);
    await page.getByRole('button',{name:'Заполнить учебный пример',exact:true}).click();
    for(const width of [1440,1024,768,390,360,320]){
      await page.setViewportSize({width,height:900});
      const layout=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,form:document.querySelector('form').getBoundingClientRect().toJSON(),result:document.querySelector('.results').getBoundingClientRect().toJSON(),overflows:[...document.querySelectorAll('button,.total-value')].filter(el=>el.getBoundingClientRect().width>0&&el.scrollWidth>el.clientWidth+2).map(el=>el.id || el.className),outOfBounds:[...document.querySelectorAll('input,select,textarea,button')].filter(el=>{const b=el.getBoundingClientRect();return b.width>0&&(b.left<0||b.right>innerWidth+1);}).map(el=>el.id || el.className)}));
      assert.ok(layout.width<=width+1,`Horizontal page overflow at ${width}: ${layout.width}`);
      assert.deepEqual(layout.overflows,[],`Control overflow at ${width}`);
      assert.deepEqual(layout.outOfBounds,[],`Control bounds at ${width}`);
      if(width<=760)assert.ok(layout.result.y>layout.form.y+layout.form.height-1,`Mobile result not below form at ${width}`);
      else assert.ok(layout.result.x>layout.form.x+layout.form.width-1,`Desktop result not beside form at ${width}`);
      if([1440,390,320].includes(width)){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(qa,`example-${width}.png`),fullPage:true});}
    }
    await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Очистить',exact:true}).click();
    await page.locator('#contractAmount').fill('999999999999999999,99');await page.locator('#rate').fill('999999999999999999');await page.locator('#dueDate').fill('01.01.2024');await page.locator('#endDate').fill('01.01.2025');await page.getByRole('button',{name:'Рассчитать',exact:true}).click();
    assert.equal(await page.locator('#validation').isVisible(),false);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.getByRole('button',{name:'Заполнить учебный пример',exact:true}).click();await page.locator('#counterparty').fill('<img src="https://example.com/leak">');await page.getByRole('button',{name:'Рассчитать',exact:true}).click();assert.equal(await page.locator('#print-report img').count(),0);
    assert.deepEqual(errors,[]);
    const unexpectedRequests=siteUrl?external.filter(url=>new URL(url).origin!==new URL(siteUrl).origin):external;
    assert.deepEqual(unexpectedRequests,[]);
    console.log('PASS: example, validation, partial execution, gaps, overlap rejection, stale result, resize, copy, XLSX, print/PDF, clear, endpoint switch, six responsive widths, large totals, escaping, no external network requests.');
  }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
