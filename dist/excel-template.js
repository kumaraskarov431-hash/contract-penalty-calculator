(function(root,factory){
  const C=typeof module==='object'&&module.exports?require('./core.js'):root.PenaltyCore;
  const api=factory(C);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PenaltyExcelTemplate=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  const widths=[28.5703125,13.5703125,13.42578125,9.85546875,17.85546875,16.7109375,18.5703125];
  const thin={style:'thin',color:{argb:'FF000000'}};
  const border={top:thin,bottom:thin,left:thin,right:thin};
  const numFmt='#,##0.00',exact=v=>C.format(v,null);
  function excelNumber(value){
    const d=new C.D(value),n=d.toNumber();
    // Excel retains at most 15 significant digits. Preserve longer decimals as exact text.
    return d.precision()<=15&&Number.isFinite(n)&&new C.D(String(n)).eq(d)?n:d.toFixed();
  }
  function wrappedHeight(text,width,min=18,fontSize=12){
    let lines=0;for(const line of String(text||'').split('\n'))lines+=Math.max(1,Math.ceil(line.length/Math.max(10,width)));
    return Math.max(min,lines*(fontSize+3));
  }
  function create(r,ExcelJS,report){
    const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('расчет пени');
    wb.creator='Отдел сопровождения договоров';wb.title='Расчет пени';wb.calcProperties.fullCalcOnLoad=false;
    ws.properties.defaultRowHeight=15;ws.columns=widths.map(width=>({width}));ws.views=[{showGridLines:true}];
    ws.pageSetup={paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:0.7,right:0.7,top:0.75,bottom:0.75,header:0.3,footer:0.3},printTitlesRow:'6:7'};
    function cell(address,value,{bold=false,italic=false,color='FF000000',size=10,align='left',boxed=false,format}={}){
      const c=ws.getCell(address);c.value=value;c.font={name:'Times New Roman',size,bold,italic,color:{argb:color}};
      c.alignment={horizontal:align,vertical:'middle',wrapText:true};if(boxed)c.border=border;if(format)c.numFmt=format;return c;
    }
    function merged(range,value,style={}){ws.mergeCells(range);return cell(range.split(':')[0],value,style);}
    merged('A1:G1',r.raw.fictional?'Расчет пени (учебный пример)':'Расчет пени',{bold:true,size:12,align:'center'});
    const metadata=[['Договор',r.raw.contractNumber||'Не указан'],['Подрядчик',r.raw.counterparty||'Не указан'],['Объект',r.raw.subject||'Не указан']];
    metadata.forEach(([label,v],i)=>{const row=i+2;cell(`A${row}`,label,{bold:true,size:12});merged(`B${row}:G${row}`,v,{bold:true,size:12});ws.getRow(row).height=wrappedHeight(v,92,i===2?34.5:18);});
    merged('A5:F5',r.raw.fictional?'УЧЕБНЫЙ ПРИМЕР. Все договорные данные вымышлены.':'',{italic:true,size:10});ws.getRow(5).height=r.raw.fictional?24:15;
    const headers=['Наименование обязательства по Договору',r.mode==='simple'?'Дата исполнения обязательств по Договору':'Начало интервала начисления (включительно)',r.mode==='simple'?(r.raw.endType==='asof'?'Дата, на которую производится расчет':'Фактическая дата исполнения обязательств'):'Конец интервала начисления (включительно)','Дни просрочки в расчете','База начисления пени, тенге','Ставка пени за день','Сумма пени, тенге\n(гр. 5 × гр. 4 × гр. 6)'];
    headers.forEach((v,i)=>{const letter=String.fromCharCode(65+i);cell(`${letter}6`,v,{bold:true,italic:true,align:'center',boxed:true});cell(`${letter}7`,i+1,{bold:true,italic:true,align:'center',boxed:true});});
    ws.getRow(6).height=94.5;ws.getRow(7).height=18;
    const baseType=r.mode==='simple'?r.basisNames[r.raw.baseType]:'База задана отдельно для каждого интервала',textPrecision=[];
    function value(address,decimal,style={}){const v=excelNumber(decimal);if(typeof v==='string')textPrecision.push(address);return cell(address,v,{align:'right',format:numFmt,...style});}
    r.rows.forEach((x,i)=>{
      const row=8+i,subject=r.raw.subject||'Обязательство по договору';
      const description=r.mode==='simple'?subject:`${subject}\nИнтервал ${i+1}: ${C.rangesText([{start:x.requestedStart,end:x.requestedEnd}])}`;
      cell(`A${row}`,description,{boxed:true});
      const start=r.mode==='simple'?r.due:x.requestedStart,end=r.mode==='simple'?r.ending:x.requestedEnd;
      cell(`B${row}`,new Date(start*86400000),{bold:true,color:'FFFF0000',align:'center',boxed:true,format:'dd"."mm"."yyyy'});
      cell(`C${row}`,new Date(end*86400000),{bold:true,color:'FFFF0000',align:'center',boxed:true,format:'dd"."mm"."yyyy'});
      cell(`D${row}`,x.days,{align:'center',boxed:true,format:'0'});
      value(`E${row}`,x.base,{boxed:true});value(`F${row}`,x.rate.div(100),{align:'center',boxed:true,format:'0.00######%'});
      const amount=excelNumber(x.penalty),numeric=typeof ws.getCell(`E${row}`).value==='number'&&typeof ws.getCell(`F${row}`).value==='number'&&typeof amount==='number';
      cell(`G${row}`,numeric?{formula:`E${row}*F${row}*D${row}`,result:amount}:amount,{bold:true,color:'FFFF0000',align:'right',boxed:true,format:numFmt});
      if(typeof amount==='string')textPrecision.push(`G${row}`);ws.getRow(row).height=wrappedHeight(description,29,63,10);
    });
    const last=7+r.rows.length,sumRow=last+1,baseRow=last+3,capRow=last+4,totalRow=last+6,termsRow=last+7;
    for(let row=sumRow;row<=totalRow;row++)for(let col=1;col<=7;col++)cell(`${String.fromCharCode(64+col)}${row}`,null,{boxed:true});
    const blue='FF000080';
    cell(`A${sumRow}`,'Всего:',{bold:true,color:blue,align:'center',boxed:true});
    cell(`D${sumRow}`,{formula:`SUM(D8:D${last})`,result:r.countedDays},{bold:true,align:'center',boxed:true,format:'0'});
    if(r.mode==='simple')value(`E${sumRow}`,r.base,{bold:true,color:blue,boxed:true});
    const before=excelNumber(r.beforeCap),allPenaltiesNumeric=r.rows.every(x=>typeof excelNumber(x.penalty)==='number');
    cell(`G${sumRow}`,allPenaltiesNumeric&&typeof before==='number'?{formula:`SUM(G8:G${last})`,result:before}:before,{bold:true,color:blue,align:'right',boxed:true,format:numFmt});
    if(typeof before==='string')textPrecision.push(`G${sumRow}`);
    const capBaseLabel=r.capRate!==null?`База ограничения: ${r.basisNames[r.raw.capBaseType]}`:'Сумма договора';
    merged(`A${baseRow}:D${baseRow}`,capBaseLabel,{bold:true,color:blue,align:'center',boxed:true});value(`E${baseRow}`,r.capRate!==null?r.capBase:r.contractAmount,{boxed:true});ws.getRow(baseRow).height=30;
    if(r.cap===null)merged(`E${capRow}:G${capRow}`,'Без ограничения',{bold:true,color:blue,align:'center',boxed:true});
    else{
      cell(`E${capRow}`,'не более',{bold:true,color:blue,align:'center',boxed:true});
      if(r.capRate!==null)value(`F${capRow}`,r.capRate.div(100),{bold:true,color:blue,align:'center',boxed:true,format:'0.00######%'});
      else cell(`F${capRow}`,'фиксированная сумма',{bold:true,color:blue,align:'center',boxed:true});
      const cap=excelNumber(r.cap),canFormula=r.capRate!==null&&typeof cap==='number'&&typeof ws.getCell(`E${baseRow}`).value==='number'&&typeof ws.getCell(`F${capRow}`).value==='number';
      cell(`G${capRow}`,canFormula?{formula:`E${baseRow}*F${capRow}`,result:cap}:cap,{bold:true,color:blue,align:'right',boxed:true,format:numFmt});if(typeof cap==='string')textPrecision.push(`G${capRow}`);ws.getRow(capRow).height=r.capRate!==null?18:30;
    }
    merged(`A${totalRow}:D${totalRow}`,'Итого сумма пени',{bold:true,italic:true,color:'FFFF0000',align:'center',boxed:true});
    // The official total is a Decimal.js snapshot, not an Excel floating-point recomputation.
    value(`G${totalRow}`,r.total,{bold:true,color:blue,boxed:true});ws.getRow(totalRow).height=24;
    const conditions=r.mode==='simple'?`Ставка пени: ${exact(r.rate)}% за день. База: ${baseType}.`:'Базы и ставки пени указаны отдельно для каждого интервала.';
    const capConditions=r.cap===null?'Ограничение не установлено.':r.capRate!==null?`Ограничение: ${exact(r.capRate)}% от базы «${r.basisNames[r.raw.capBaseType]}» (${exact(r.capBase)} тенге).`:`Ограничение: ${exact(r.cap)} тенге.`;
    const terms=[r.raw.penaltyClause||'',conditions,capConditions].filter(Boolean).join('\n');
    merged(`A${termsRow}:G${termsRow}`,terms,{bold:true,italic:true});ws.getRow(termsRow).height=wrappedHeight(terms,115,42,10);
    let next=termsRow+2;
    function section(title){merged(`A${next}:G${next}`,title,{bold:true,size:12});ws.getRow(next).height=24;next++;}
    function note(text,{bold=false,color='FF000000'}={}){merged(`A${next}:G${next}`,text,{bold,italic:!bold,color});ws.getRow(next).height=wrappedHeight(text,116,18,10);next++;}
    function pair(label,v){merged(`A${next}:D${next}`,label);merged(`E${next}:G${next}`,v,{align:'right'});ws.getRow(next).height=Math.max(wrappedHeight(label,67,18,10),wrappedHeight(v,43,18,10));next++;}
    section('Исходные данные и подсчет дней');
    pair('Сумма договора, тенге',excelNumber(r.contractAmount));pair('База начисления пени',baseType);pair('Установленный срок исполнения',C.date(r.due));pair(r.raw.endType==='asof'?'Дата расчета':'Фактическая дата исполнения',C.date(r.ending));pair('Конечная дата включена в расчет',r.raw.includeEnd?'Да':'Нет');pair('Период просрочки',r.calendarDays?C.rangesText([r.window]):'Отсутствует');pair('Календарные дни просрочки',r.calendarDays);pair('Исключенные дни без повторов',r.excludedDays);pair('Дни, учитываемые в расчете',r.countedDays);if(r.missingDays)pair('Пропущенные учитываемые дни',r.missingDays);
    section('Расчет по периодам');
    for(const x of r.rows){const period=x.calendarDays?C.rangesText([x]):'Нет дней внутри просрочки';note(`Интервал ${x.index+1}. Начисление: ${period}. Календарных дней: ${x.calendarDays}; исключено: ${x.excludedDays}; учитывается: ${x.days}.`);note(`Учитываемые даты: ${C.rangesText(x.considered)}.`);}
    section('Исключаемые периоды');
    if(!r.entries.length)note('Исключений нет.');
    for(const x of r.entries)note(`${x.index+1}. ${C.date(x.start)} - ${C.date(x.end)} (обе границы включены). Причина: ${x.reason||'не указана'}. Основание: ${x.basis||'не указано'}. Дней внутри просрочки до объединения: ${x.days}.`);
    note(`Объединенные исключенные даты: ${C.rangesText(r.exclusions)}. Всего без повторов: ${r.excludedDays} дней.`);if(r.entries.length>1)note('Пересекающиеся исключения объединены. Количества дней по строкам исключений не суммируются.');
    section('Формула и порядок округления');
    for(const formula of report.formulas)note(formula);
    note(`Итог: ${exact(r.limited)} тенге после ограничения. После округления: ${C.format(r.total)} тенге.`,{bold:true});note(r.rounding);
    note('Промежуточные суммы в основной таблице отображаются до двух знаков, но до применения ограничения не округляются. Точные значения приведены в формулах ниже таблицы. Итог зафиксирован по точному расчету приложения. После изменения условий новый расчет следует сформировать в приложении.');
    if(textPrecision.length)note('Значения с точностью свыше 15 значащих цифр сохранены как десятичный текст: '+textPrecision.join(', ')+'. Это сохраняет точность, которую числовые ячейки Excel не поддерживают.');
    for(const warning of r.warnings)note(warning,{bold:true,color:'FFAA0000'});
    ws.pageSetup.printArea=`A1:G${next-1}`;return wb;
  }
  return {create,excelNumber,widths};
});
