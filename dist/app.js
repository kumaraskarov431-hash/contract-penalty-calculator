(function(){
  'use strict';
  const C=window.PenaltyCore,R=window.PenaltyReport,$=id=>document.getElementById(id);
  let mode='simple',fictional=false,current=null,stale=false,toastTimer;
  const fields=['contractNumber','counterparty','subject','penaltyClause','contractAmount','baseType','obligationAmount','manualBase','rate','dueDate','endDate','endType','capType','capAmount','capPercent','capBaseType','capManualBase'];
  const empty=()=>({contractNumber:'',counterparty:'',subject:'',contractAmount:'',baseType:'contract',obligationAmount:'',manualBase:'',rate:'',dueDate:'',endDate:'',endType:'actual',capType:'none',capAmount:'',capPercent:'',capBaseType:'contract',capManualBase:''});
  const icon=name=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
  function icons(){if(window.lucide)window.lucide.createIcons({attrs:{'aria-hidden':'true'}});}
  function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4000);}
  function exportState(){for(const id of ['copy','print','excel'])$(id).disabled=!current||stale;}
  function dirty(){
    if(current){stale=true;$('stale').hidden=false;$('result-status').textContent='Требует обновления';$('result-status').className='status dirty';$('print-report').innerHTML='<h1>Расчёт не обновлён</h1><p>Договорные данные изменены. Выполните расчёт перед печатью.</p>';}
    $('validation').hidden=true;document.querySelectorAll('[aria-invalid="true"]').forEach(el=>el.removeAttribute('aria-invalid'));exportState();
  }
  function sync(){
    $('simple-fields').hidden=mode!=='simple';$('period-fields').hidden=mode!=='periods';
    for(const name of ['simple','periods']){$('mode-'+name).classList.toggle('selected',mode===name);$('mode-'+name).setAttribute('aria-pressed',String(mode===name));}
    $('manual-base-field').hidden=$('baseType').value!=='manual';
    $('obligations-field').hidden=!((mode==='simple'&&$('baseType').value==='obligations')||($('capType').value==='percent'&&$('capBaseType').value==='obligations'));
    $('cap-fixed-field').hidden=$('capType').value!=='fixed';$('cap-percent-fields').hidden=$('capType').value!=='percent';$('cap-manual-field').hidden=$('capBaseType').value!=='manual';
    $('end-label').textContent=$('endType').value==='asof'?'Дата расчёта':'Фактическая дата исполнения';
    dateHint();
  }
  function dateHint(){
    try{const due=C.parseDate($('dueDate').value),end=C.parseDate($('endDate').value),last=end-($('includeEnd').checked?0:1);$('date-hint').textContent=last>due?`Период начисления: ${C.date(due+1)} - ${C.date(last)}. Обе границы включены.`:'Дни просрочки отсутствуют. Пеня равна нулю.';}catch{$('date-hint').textContent='Начало просрочки: следующий день после срока исполнения.';}
  }
  function rowLabel(title,id,value,extra=''){return `<label>${title}<input id="${id}" value="${R.esc(value||'')}" ${extra}></label>`;}
  function addPeriod(values={}){
    const i=$('period-list').children.length;
    const el=document.createElement('div');el.className='repeated-item';
    el.innerHTML=`<div class="item-title"><span>Интервал ${i+1}</span><button type="button" class="icon-button remove" title="Удалить интервал" aria-label="Удалить интервал ${i+1}">${icon('trash-2')}</button></div><div class="grid two">${rowLabel('Начало включительно',`period-${i}-start`,values.start,'class="date-input" inputmode="numeric" maxlength="10" placeholder="ДД.ММ.ГГГГ" data-key="start"')}${rowLabel('Конец включительно',`period-${i}-end`,values.end,'class="date-input" inputmode="numeric" maxlength="10" placeholder="ДД.ММ.ГГГГ" data-key="end"')}</div><div class="grid two">${rowLabel('База начисления, ₸',`period-${i}-base`,values.base,'inputmode="decimal" placeholder="0,00" data-key="base"')}${rowLabel('Ставка за день, %',`period-${i}-rate`,values.rate,'inputmode="decimal" placeholder="По договору" data-key="rate"')}</div>`;
    $('period-list').append(el);icons();
  }
  function addExclusion(values={}){
    const i=$('exclusion-list').children.length;
    const el=document.createElement('div');el.className='repeated-item';
    el.innerHTML=`<div class="item-title"><span>Исключение ${i+1}</span><button type="button" class="icon-button remove" title="Удалить исключение" aria-label="Удалить исключение ${i+1}">${icon('trash-2')}</button></div><div class="grid two">${rowLabel('Начало включительно',`ex-${i}-start`,values.start,'class="date-input" inputmode="numeric" maxlength="10" placeholder="ДД.ММ.ГГГГ" data-key="start"')}${rowLabel('Конец включительно',`ex-${i}-end`,values.end,'class="date-input" inputmode="numeric" maxlength="10" placeholder="ДД.ММ.ГГГГ" data-key="end"')}</div><div class="grid two">${rowLabel('Причина исключения',`ex-${i}-reason`,values.reason,'maxlength="1000" placeholder="Например, приостановка работ" data-key="reason"')}${rowLabel('Основание',`ex-${i}-basis`,values.basis,'maxlength="1000" placeholder="Письмо, акт, пункт договора" data-key="basis"')}</div>`;
    $('exclusion-list').append(el);icons();
  }
  function rows(id){return [...$(id).children].map(el=>Object.fromEntries([...el.querySelectorAll('[data-key]')].map(x=>[x.dataset.key,x.value])));}
  function input(){const raw={mode,fictional,includeEnd:$('includeEnd').checked,intervals:rows('period-list'),exclusions:rows('exclusion-list')};for(const id of fields)raw[id]=$(id).value;return raw;}
  function setValues(values){for(const id of fields)$(id).value=values[id]??'';$('includeEnd').checked=values.includeEnd??true;mode=values.mode||'simple';fictional=!!values.fictional;$('example-banner').hidden=!fictional;sync();}
  function display(r){
    const safe=R.esc,exact=R.exact;
    $('total').innerHTML=safe(C.format(r.total))+' <span>₸</span>';
    $('total-caption').textContent=r.missingDays?'Неполный расчёт: есть пропущенные дни':r.capApplied?'Применён максимальный размер пени':r.calendarDays?'По введённым условиям договора':'Учитываемые дни просрочки отсутствуют';
    $('result-status').textContent=r.missingDays?'Неполный расчёт':'Рассчитано';$('result-status').className=r.missingDays?'status dirty':'status done';
    const lines=items=>`<dl class="result-lines">${items.map(([k,v])=>`<div><dt>${safe(k)}</dt><dd>${safe(v)}</dd></div>`).join('')}</dl>`;
    const basis=r.mode==='simple'?[[r.basisNames[r.raw.baseType],R.money(r.base)],['Ставка за день',exact(r.rate)+' %']]:[['Режим','По периодам'],['Интервалов',r.rows.length]];
    const formulas=R.model(r).formulas;
    const detailTable=r.mode==='periods'?`<div class="table-wrap"><table><thead><tr><th>Период</th><th>База, ₸</th><th>% / день</th><th>Дни</th><th>Пеня, ₸</th></tr></thead><tbody>${r.rows.map(x=>`<tr><td>${x.calendarDays?safe(C.rangesText([x])):'Нет дней'}</td><td>${safe(exact(x.base))}</td><td>${safe(exact(x.rate))}</td><td>${x.days}</td><td>${safe(exact(x.penalty))}</td></tr>`).join('')}</tbody></table></div>`:'';
    const warnings=r.warnings.length?`<div class="result-warnings">${r.warnings.map(x=>`<div class="notice warning">${icon('triangle-alert')}<span>${safe(x)}</span></div>`).join('')}</div>`:'';
    const capLabel=r.cap===null?'Без ограничения':exact(r.cap)+' ₸';
    $('result-content').innerHTML=`${warnings}<div class="result-summary"><h3>ПЕРИОД ПРОСРОЧКИ</h3><div class="period-value">${r.calendarDays?safe(C.rangesText([r.window])):'Просрочка отсутствует'}</div><p class="period-note">Срок исполнения: ${C.date(r.due)}<br>${r.raw.endType==='asof'?'Дата расчёта':'Дата исполнения'} ${C.date(r.ending)} ${r.raw.includeEnd?'включена':'не включена'}. Начало — следующий день после срока.</p><div class="day-stats"><div class="day-stat"><b>${r.calendarDays}</b><span>Календарные<br>дни просрочки</span></div><div class="day-stat"><b>${r.excludedDays}</b><span>Исключённые<br>дни без повторов</span></div><div class="day-stat"><b>${r.countedDays}</b><span>Дни<br>в расчёте</span></div></div><details><summary>Учитываемые и исключённые даты</summary><div class="range-detail"><strong>В расчёте:</strong> ${safe(C.rangesText(r.considered))}<br><strong>Исключены:</strong> ${safe(C.rangesText(r.exclusions))}${r.missingDays?'<br><strong>Пропущены:</strong> '+safe(C.rangesText(r.gaps)):''}</div></details></div><div class="result-detail">${lines(basis)}${detailTable}</div><div class="result-detail">${lines([['Пеня до ограничения',exact(r.beforeCap)+' ₸'],['Максимальный размер пени',capLabel],...(r.capRate===null?[]:[['База ограничения',exact(r.capBase)+' ₸'],['Процент ограничения',exact(r.capRate)+' %']]),['После ограничения, до округления',exact(r.limited)+' ₸']])}</div><div class="result-detail"><h3>ФОРМУЛА РАСЧЁТА</h3><div class="formula">${formulas.map(x=>safe(x)).join('<br>')}</div><details><summary>Порядок округления</summary><p class="rounding">${safe(r.rounding)}</p></details></div>`;
    $('print-report').innerHTML=R.html(r);icons();
    fitTotal();
  }
  function fitTotal(){
    // Keep large sums within the fixed result panel without changing other result state.
    const total=$('total');total.style.fontSize='';let font=parseFloat(getComputedStyle(total).fontSize);while(total.scrollWidth>total.clientWidth&&font>18){font-=1;total.style.fontSize=font+'px';}
  }
  function calculate(event){
    if(event)event.preventDefault();
    try{const result=C.calculate(input());current=result;stale=false;$('stale').hidden=true;$('validation').hidden=true;document.querySelectorAll('[aria-invalid="true"]').forEach(el=>el.removeAttribute('aria-invalid'));display(result);exportState();return result;}
    catch(e){
      if(e instanceof C.ValidationError){$('validation').innerHTML='<p><strong>Проверьте исходные данные</strong></p><ul>'+e.issues.map(x=>'<li>'+R.esc(x.message)+'</li>').join('')+'</ul>';$('validation').hidden=false;for(const x of e.issues)$(x.field)?.setAttribute('aria-invalid','true');const first=$(e.issues[0].field);if(first&&!first.closest('[hidden]'))first.focus();}
      else {toast('Не удалось выполнить расчёт. Проверьте введённые значения.');console.error(e);}
      return null;
    }
  }
  function clear(){
    $('period-list').replaceChildren();$('exclusion-list').replaceChildren();setValues(empty());current=null;stale=false;$('stale').hidden=true;$('validation').hidden=true;$('total').innerHTML='0,00 <span>₸</span>';$('total').style.fontSize='';$('total-caption').textContent='Ожидает расчёта';$('result-status').textContent='Не рассчитано';$('result-status').className='status';$('result-content').innerHTML=`<div class="empty-result">${icon('file-spreadsheet')}<strong>Расчёт ещё не выполнен</strong><span>Исходные данные не заполнены</span></div>`;$('print-report').innerHTML='<h1>Расчёт ещё не выполнен</h1>';document.querySelectorAll('[aria-invalid="true"]').forEach(el=>el.removeAttribute('aria-invalid'));exportState();icons();
  }
  function example(){
    clear();setValues({...empty(),contractNumber:'УЧЕБНЫЙ-2024/015',counterparty:'ТОО «Пример Подрядчик» (вымышленное)',subject:'Монтаж оборудования на учебном объекте. Вымышленный договор.',contractAmount:'12 000 000,00',baseType:'obligations',obligationAmount:'3 600 000,00',rate:'0,1',dueDate:'31.01.2024',endDate:'12.02.2024',includeEnd:true,capType:'percent',capPercent:'5',capBaseType:'contract',fictional:true});
    addExclusion({start:'05.02.2024',end:'07.02.2024',reason:'Учебная приостановка работ',basis:'Вымышленное письмо № 1 от 05.02.2024'});addExclusion({start:'06.02.2024',end:'08.02.2024',reason:'Учебное согласование доступа',basis:'Вымышленный акт № 2 от 06.02.2024'});calculate();toast('Заполнен вымышленный учебный пример');
  }
  $('calculator').addEventListener('submit',calculate);
  $('calculator').addEventListener('input',event=>{
    if(event.target.matches('.date-input')&&event.inputType==='insertText'){
      const el=event.target,digits=el.value.replace(/\D/g,'').slice(0,8);const value=digits.slice(0,2)+(digits.length>2?'.'+digits.slice(2,4):'')+(digits.length>4?'.'+digits.slice(4):'');
      if(el.selectionStart===el.value.length)el.value=value;
    }
    dirty();dateHint();
  });
  $('calculator').addEventListener('change',()=>{dirty();sync();});
  $('calculator').addEventListener('click',event=>{
    const remove=event.target.closest('.remove');if(!remove)return;const item=remove.closest('.repeated-item'),list=item.parentElement;item.remove();const type=list.id==='period-list'?'period':'ex';[...list.children].forEach((row,i)=>{row.querySelector('.item-title span').textContent=(type==='period'?'Интервал ':'Исключение ')+(i+1);row.querySelector('.remove').setAttribute('aria-label',(type==='period'?'Удалить интервал ':'Удалить исключение ')+(i+1));row.querySelectorAll('[data-key]').forEach(el=>el.id=`${type}-${i}-${el.dataset.key}`);});dirty();
  });
  for(const name of ['simple','periods'])$('mode-'+name).addEventListener('click',()=>{
    if(mode===name)return;mode=name;if(mode==='periods'&&!$('period-list').children.length){let start='',end='';try{start=C.date(C.parseDate($('dueDate').value)+1);end=C.date(C.parseDate($('endDate').value)-($('includeEnd').checked?0:1));}catch{}let base='';try{base=$('baseType').value==='contract'?$('contractAmount').value:$('baseType').value==='obligations'?$('obligationAmount').value:$('manualBase').value;}catch{}addPeriod({start,end,base,rate:$('rate').value});}dirty();sync();
  });
  $('add-period').addEventListener('click',()=>{addPeriod();dirty();});$('add-exclusion').addEventListener('click',()=>{addExclusion();dirty();});$('clear').addEventListener('click',clear);$('example').addEventListener('click',example);
  $('copy').addEventListener('click',async()=>{
    if(!current||stale)return;const content=R.text(current);
    try{if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(content);else throw new Error('Fallback');toast('Расчёт скопирован');}
    catch{const textarea=document.createElement('textarea');textarea.value=content;textarea.style.position='fixed';textarea.style.opacity='0';document.body.append(textarea);textarea.select();const ok=document.execCommand('copy');textarea.remove();toast(ok?'Расчёт скопирован':'Браузер не разрешил копирование. Используйте печать или Excel.');}
  });
  $('print').addEventListener('click',()=>{if(current&&!stale){$('print-report').innerHTML=R.html(current);window.print();}});
  $('excel').addEventListener('click',async()=>{
    if(!current||stale)return;const snapshot=current;const btn=$('excel');btn.disabled=true;
    try{const wb=await R.workbook(snapshot,window.ExcelJS),buffer=await wb.xlsx.writeBuffer(),blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Расчёт пени ${snapshot.raw.contractNumber||'по договору'}`.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')+'.xlsx';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('Расчёт выгружен в Excel');}catch(e){toast('Не удалось выгрузить Excel. Повторите попытку.');console.error(e);}finally{exportState();}
  });
  window.addEventListener('resize',fitTotal);clear();
})();
