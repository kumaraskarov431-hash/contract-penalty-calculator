(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('decimal.js') : root.Decimal);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PenaltyCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Decimal) {
  'use strict';
  const D = Decimal.clone({ precision: 100, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -100, toExpPos: 100 });
  const DAY = 86400000;
  const ROUNDING = 'Базы и ставки вводятся как десятичные значения. Пеня по каждому интервалу и их сумма не округляются. Ограничение применяется к точной общей сумме. Только итог округляется до двух знаков после запятой: при третьем знаке 5 и выше второй знак увеличивается на 1 (ROUND_HALF_UP).';
  class ValidationError extends Error {
    constructor(issues) { super(issues.map(x => x.message).join('\n')); this.name = 'ValidationError'; this.issues = issues; }
  }
  function parseDate(value) {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(value || '').trim());
    if (!m) throw new Error('Укажите дату в формате ДД.ММ.ГГГГ.');
    const day = +m[1], month = +m[2], year = +m[3];
    if (year < 1900 || year > 9999) throw new Error('Год должен быть от 1900 до 9999.');
    const stamp = Date.UTC(year, month - 1, day), d = new Date(stamp);
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) throw new Error('Такой календарной даты не существует.');
    return stamp / DAY;
  }
  function date(day) {
    const d = new Date(day * DAY);
    return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
  }
  function decimal(value, places = 8) {
    const s = String(value ?? '').trim().replace(/[ \u00a0\u202f]/g, '').replace(',', '.');
    if (!/^\d+(?:\.\d+)?$/.test(s)) throw new Error('Введите неотрицательное число, например 1000000,00.');
    const [whole, fraction = ''] = s.split('.');
    if (whole.length > 18 || fraction.length > places) throw new Error(`Допускается до 18 цифр до запятой и ${places} после неё.`);
    return new D(s);
  }
  function format(value, places = 2) {
    const text = places === null ? new D(value).toFixed() : new D(value).toFixed(places);
    const [whole, fraction] = text.split('.');
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + (fraction === undefined ? '' : ',' + fraction);
  }
  function merge(ranges) {
    const sorted = ranges.filter(r => r.start <= r.end).map(r => ({start:r.start,end:r.end})).sort((a,b) => a.start - b.start);
    const out = [];
    for (const r of sorted) {
      const last = out[out.length - 1];
      if (last && r.start <= last.end + 1) last.end = Math.max(last.end, r.end);
      else out.push(r);
    }
    return out;
  }
  function intersect(a,b) { return {start:Math.max(a.start,b.start),end:Math.min(a.end,b.end)}; }
  function count(ranges) { return ranges.reduce((sum,r) => sum + Math.max(0,r.end-r.start+1), 0); }
  function subtract(ranges, exclusions) {
    const out = [], excluded = merge(exclusions);
    for (const r of merge(ranges)) {
      let cursor = r.start;
      for (const x of excluded) {
        if (x.end < cursor) continue;
        if (x.start > r.end) break;
        if (x.start > cursor) out.push({start:cursor,end:Math.min(r.end,x.start-1)});
        cursor = Math.max(cursor,x.end+1);
        if (cursor > r.end) break;
      }
      if (cursor <= r.end) out.push({start:cursor,end:r.end});
    }
    return out;
  }
  function rangesText(ranges) { return ranges.length ? ranges.map(r => r.start === r.end ? date(r.start) : `${date(r.start)} - ${date(r.end)}`).join('; ') : 'Нет'; }
  function calculate(input) {
    const raw = JSON.parse(JSON.stringify(input)), issues = [], warnings = [];
    const read = (field, label, fn) => {
      try { return fn(); } catch(e) { issues.push({field,message:`${label}: ${e.message}`}); return null; }
    };
    const mode = raw.mode === 'periods' ? 'periods' : 'simple';
    const contractAmount = read('contractAmount','Сумма договора',()=>decimal(raw.contractAmount,2));
    const due = read('dueDate','Срок исполнения',()=>parseDate(raw.dueDate));
    const ending = read('endDate','Дата исполнения / расчёта',()=>parseDate(raw.endDate));
    const basisNames = {contract:'Вся сумма договора',obligations:'Стоимость неисполненных обязательств',manual:'Сумма, введённая вручную'};
    let obligations = null;
    if ((mode === 'simple' && raw.baseType === 'obligations') || (raw.capType === 'percent' && raw.capBaseType === 'obligations')) {
      obligations = read('obligationAmount','Неисполненные обязательства',()=>decimal(raw.obligationAmount,2));
    }
    const selectBase = (type,manual,field) => {
      if (type === 'contract') return contractAmount;
      if (type === 'obligations') return obligations;
      if (type === 'manual') return read(field,'База начисления',()=>decimal(manual,2));
      issues.push({field,message:'Выберите базу начисления.'}); return null;
    };
    let base = null, rate = null;
    if (mode === 'simple') {
      base = selectBase(raw.baseType,raw.manualBase,'manualBase');
      rate = read('rate','Ставка пени',()=>decimal(raw.rate));
    }
    let cap = null, capBase = null, capRate = null;
    if (raw.capType === 'fixed') cap = read('capAmount','Фиксированное ограничение',()=>decimal(raw.capAmount,2));
    else if (raw.capType === 'percent') {
      capBase = selectBase(raw.capBaseType,raw.capManualBase,'capManualBase');
      capRate = read('capPercent','Процент ограничения',()=>decimal(raw.capPercent));
      if (capBase && capRate) cap = capBase.mul(capRate).div(100);
    } else if (raw.capType !== 'none') issues.push({field:'capType',message:'Выберите вид ограничения.'});
    const exclusionEntries = (raw.exclusions || []).map((x,i) => {
      const start = read(`ex-${i}-start`,`Исключение ${i+1}, начало`,()=>parseDate(x.start));
      const end = read(`ex-${i}-end`,`Исключение ${i+1}, конец`,()=>parseDate(x.end));
      if (start !== null && end !== null && start > end) issues.push({field:`ex-${i}-end`,message:`Исключение ${i+1}: конец раньше начала.`});
      return {...x,start,end};
    });
    const intervals = mode === 'periods' ? (raw.intervals || []).map((x,i) => {
      const start = read(`period-${i}-start`,`Интервал ${i+1}, начало`,()=>parseDate(x.start));
      const end = read(`period-${i}-end`,`Интервал ${i+1}, конец`,()=>parseDate(x.end));
      const ibase = read(`period-${i}-base`,`Интервал ${i+1}, база`,()=>decimal(x.base,2));
      const irate = read(`period-${i}-rate`,`Интервал ${i+1}, ставка`,()=>decimal(x.rate));
      if (start !== null && end !== null && start > end) issues.push({field:`period-${i}-end`,message:`Интервал ${i+1}: конец раньше начала.`});
      return {start,end,base:ibase,rate:irate,index:i};
    }) : [];
    if (mode === 'periods' && !intervals.length) issues.push({field:'add-period',message:'Добавьте хотя бы один интервал расчёта.'});
    if (intervals.length > 500 || exclusionEntries.length > 500) issues.push({field:'mode',message:'Допускается до 500 интервалов и до 500 исключений.'});
    if (issues.length) throw new ValidationError(issues);
    const ordered = [...intervals].sort((a,b)=>a.start-b.start);
    for (let i=1;i<ordered.length;i++) {
      if (ordered[i].start <= ordered[i-1].end) issues.push({field:`period-${ordered[i].index}-start`,message:`Интервалы ${ordered[i-1].index+1} и ${ordered[i].index+1} пересекаются. Один день не может иметь две базы.`});
    }
    if (issues.length) throw new ValidationError(issues);
    // Dates are UTC day numbers; range operations do not depend on local timezone or DST.
    const window = {start:due+1,end:ending-(raw.includeEnd ? 0 : 1)};
    const calendarDays = count([window]);
    const exclusions = merge(exclusionEntries.map(x=>intersect(x,window)));
    const excludedDays = count(exclusions);
    const entries = exclusionEntries.map((x,i)=>({...x,index:i,days:count([intersect(x,window)])}));
    let rows;
    if (mode === 'simple') rows = [{index:0,requestedStart:window.start,requestedEnd:window.end,...window,base,rate}];
    else rows = intervals.map(x => {
      if (x.start < window.start || x.end > window.end) warnings.push(`Интервал ${x.index+1}: даты за пределами просрочки не учитываются.`);
      return {...x,requestedStart:x.start,requestedEnd:x.end,...intersect(x,window)};
    });
    rows = rows.map(x => {
      const considered = subtract([x],exclusions), days = count(considered), cal = count([x]);
      return {...x,considered,days,calendarDays:cal,excludedDays:cal-days,penalty:x.base.mul(x.rate).div(100).mul(days)};
    });
    const covered = merge(rows);
    const gaps = mode === 'periods' ? subtract(subtract([window],covered),exclusions) : [];
    const missingDays = count(gaps);
    if (missingDays) warnings.push(`Пропущено учитываемых дней: ${missingDays} (${rangesText(gaps)}). За них пеня не начислена. Расчёт неполный.`);
    const countedDays = rows.reduce((n,x)=>n+x.days,0);
    const beforeCap = rows.reduce((n,x)=>n.plus(x.penalty),new D(0));
    const limited = cap === null ? beforeCap : D.min(beforeCap,cap);
    const total = limited.toDecimalPlaces(2,D.ROUND_HALF_UP);
    if (obligations && obligations.gt(contractAmount)) warnings.push('Стоимость неисполненных обязательств больше суммы договора. Проверьте исходные данные.');
    return {raw,mode,contractAmount,base,rate,basisNames,due,ending,window,calendarDays,excludedDays,countedDays,exclusions,entries,rows,gaps,missingDays,warnings,beforeCap,cap,capBase,capRate,limited,total,capApplied:cap !== null && beforeCap.gt(cap),rounding:ROUNDING,considered:subtract(covered,exclusions)};
  }
  return {calculate,parseDate,date,decimal,format,merge,subtract,count,rangesText,ValidationError,ROUNDING,D};
});
