(function(root,factory){
  const api = factory(typeof module === 'object' && module.exports ? require('./core.js') : root.PenaltyCore);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PenaltyReport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(C){
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const exact = value => C.format(value,null);
  const money = value => C.format(value) + ' ₸';
  const pairTable = rows => '<table><tbody>' + rows.map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('') + '</tbody></table>';
  function model(r){
    const endName = r.raw.endType === 'asof' ? 'Дата расчёта' : 'Фактическая дата исполнения';
    const metadata = [
      ['Организация','АО «Казахтелеком»'],['Подразделение','Отдел сопровождения договоров Дирекции управления проектами'],
      ['Номер договора',r.raw.contractNumber || 'Не указан'],['Контрагент',r.raw.counterparty || 'Не указан'],['Предмет договора',r.raw.subject || 'Не указан'],
      ['Сумма договора, ₸',exact(r.contractAmount)],['Режим расчёта',r.mode === 'simple' ? 'Единая база' : 'По периодам'],
      ['Установленный срок исполнения',C.date(r.due)],[endName,C.date(r.ending)],['Включать конечную дату',r.raw.includeEnd ? 'Да' : 'Нет'],
      ['Начало начисления','Следующий день после установленного срока исполнения']
    ];
    if(r.raw.penaltyClause)metadata.push(['Пункт договора о пене',r.raw.penaltyClause]);
    if (r.mode === 'simple') metadata.push(['Выбранная база',r.basisNames[r.raw.baseType]],['База начисления, ₸',exact(r.base)],['Ставка за день, %',exact(r.rate)]);
    if (r.raw.obligationAmount && (r.raw.baseType === 'obligations' && r.mode === 'simple' || r.raw.capBaseType === 'obligations' && r.raw.capType === 'percent')) metadata.push(['Неисполненные обязательства, ₸',exact(C.decimal(r.raw.obligationAmount,2))]);
    metadata.push(['Вид ограничения',r.raw.capType === 'none' ? 'Без ограничения' : r.raw.capType === 'fixed' ? 'Фиксированная сумма' : 'Процент от выбранной базы']);
    if (r.capRate !== null) metadata.push(['Процент ограничения, %',exact(r.capRate)],['Выбранная база ограничения',r.basisNames[r.raw.capBaseType]],['База ограничения, ₸',exact(r.capBase)]);
    const summary = [
      ['Период просрочки',r.calendarDays ? C.rangesText([r.window]) : 'Отсутствует'],
      ['Календарные дни просрочки',r.calendarDays],['Исключённые дни (без повторов)',r.excludedDays],['Дни, учитываемые в расчёте',r.countedDays],
      ['Пропущенные учитываемые дни',r.missingDays],['Пеня до ограничения, ₸',exact(r.beforeCap)],
      ['Размер ограничения, ₸',r.cap === null ? 'Без ограничения' : exact(r.cap)],
      ['После ограничения, до округления, ₸',exact(r.limited)],['Итоговая пеня, ₸',C.format(r.total)]
    ];
    const periodHeaders = ['№','Начало заданного интервала','Конец заданного интервала','Фактический период начисления','Календарные дни','Исключённые дни','Учитываемые дни','База, ₸','Ставка в день, %','Пеня без округления, ₸','Учитываемые даты'];
    const periods = r.rows.map((x,i)=>[i+1,r.mode === 'simple' && !r.calendarDays ? 'Нет' : C.date(x.requestedStart),r.mode === 'simple' && !r.calendarDays ? 'Нет' : C.date(x.requestedEnd),x.calendarDays ? C.rangesText([x]) : 'Нет',x.calendarDays,x.excludedDays,x.days,exact(x.base),exact(x.rate),exact(x.penalty),C.rangesText(x.considered)]);
    const exclusionHeaders = ['№','Начало','Конец','Причина','Основание','Дни внутри просрочки*'];
    const exclusions = r.entries.map((x,i)=>[i+1,C.date(x.start),C.date(x.end),x.reason || 'Не указана',x.basis || 'Не указано',x.days]);
    const formulas = r.rows.map((x,i)=>`Интервал ${i+1}: ${exact(x.base)} × ${exact(x.rate)} / 100 × ${x.days} = ${exact(x.penalty)} ₸.`);
    if (r.mode === 'periods') formulas.push(`Сумма интервалов: ${r.rows.map(x=>exact(x.penalty)).join(' + ')} = ${exact(r.beforeCap)} ₸.`);
    if (r.capRate !== null) formulas.push(`Ограничение: ${exact(r.capBase)} × ${exact(r.capRate)} / 100 = ${exact(r.cap)} ₸.`);
    formulas.push(r.cap === null ? `Без ограничения: ${exact(r.beforeCap)} ₸.` : `После ограничения: min(${exact(r.beforeCap)}; ${exact(r.cap)}) = ${exact(r.limited)} ₸.`);
    const notes = [r.rounding,'Все интервалы и исключения включают обе указанные границы. В начислении учитывается только их пересечение с периодом просрочки.','* Дни в каждой строке исключений могут пересекаться. Общий итог исключённых дней рассчитан по объединению периодов, без повторов.',`Объединённые исключённые даты: ${C.rangesText(r.exclusions)}.`,`Все учитываемые даты: ${C.rangesText(r.considered)}.`];
    if (r.missingDays) notes.push(`Пропущенные учитываемые даты: ${C.rangesText(r.gaps)}.`);
    return {title:'Расчёт пени по договору',fictional:!!r.raw.fictional,metadata,summary,periodHeaders,periods,exclusionHeaders,exclusions,formulas,notes,warnings:r.warnings,total:money(r.total)};
  }
  function text(r){
    const m = model(r);
    return [m.title,m.fictional ? 'УЧЕБНЫЙ ПРИМЕР. Все данные вымышлены.' : '',...m.metadata.map(x=>x.join(': ')),'',...m.summary.map(x=>x.join(': ')),'','РАСЧЁТ ПО ПЕРИОДАМ',m.periodHeaders.join(' | '),...m.periods.map(x=>x.join(' | ')),'','ИСКЛЮЧЕНИЯ',m.exclusionHeaders.join(' | '),...(m.exclusions.length ? m.exclusions.map(x=>x.join(' | ')) : ['Нет исключений']),'','ФОРМУЛА',...m.formulas,'','ПОРЯДОК РАСЧЁТА',...m.notes,...m.warnings.map(x=>'ВНИМАНИЕ: '+x),'',`ИТОГОВАЯ ПЕНЯ: ${m.total}`].filter(x=>x!==undefined).join('\n');
  }
  function html(r){
    const m=model(r);
    const table=(head,rows)=>`<table><thead><tr>${head.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const compactHeaders=['№','Период начисления','Дни','Искл.','В расчёте','База, ₸','Ставка, %','Пеня, ₸'];
    const compactRows=r.rows.map((x,i)=>[i+1,x.calendarDays?C.rangesText([x]):'Нет',x.calendarDays,x.excludedDays,x.days,exact(x.base),exact(x.rate),exact(x.penalty)]);
    return `<p class="report-label">АО «Казахтелеком» · Дирекция управления проектами<br>Отдел сопровождения договоров</p><h1>${esc(m.title)}</h1>${m.fictional?'<p class="report-example">УЧЕБНЫЙ ПРИМЕР. Все договорные данные вымышлены.</p>':''}${m.warnings.map(x=>`<p class="report-warning">${esc(x)}</p>`).join('')}<h2>Исходные данные</h2>${pairTable(m.metadata)}<h2>Результат</h2>${pairTable(m.summary)}<h2>Расчёт по периодам</h2>${table(compactHeaders,compactRows)}${r.mode==='periods'?r.rows.map((x,i)=>`<p class="report-ranges">Интервал ${i+1} задан: ${C.date(x.requestedStart)} - ${C.date(x.requestedEnd)}. Учитываемые даты: ${esc(C.rangesText(x.considered))}.</p>`).join(''):''}<h2>Исключаемые периоды</h2>${m.exclusions.length?table(m.exclusionHeaders,m.exclusions):'<p>Нет исключений.</p>'}<h2>Формула</h2><div class="formula">${m.formulas.map(x=>esc(x)).join('<br>')}</div><h2>Порядок расчёта и округления</h2>${m.notes.map(x=>`<p class="rounding">${esc(x)}</p>`).join('')}<p class="report-total">Итоговая пеня: ${esc(m.total)}</p>`;
  }
  async function workbook(r,ExcelJS){
    const template=typeof module==='object'&&module.exports?require('./excel-template.js'):globalThis.PenaltyExcelTemplate;
    return template.create(r,ExcelJS,model(r));
  }
  return {model,text,html,workbook,esc,exact,money};
});
