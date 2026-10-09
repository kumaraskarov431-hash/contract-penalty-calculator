const C=require('../dist/core.js');
const r=C.calculate({contractAmount:'1000',baseType:'contract',rate:'1',dueDate:'27.02.2024',endDate:'01.03.2024',includeEnd:true,mode:'simple',capType:'none',exclusions:[]});
console.log(JSON.stringify({days:r.calendarDays,total:r.total.toFixed(2),range:C.rangesText(r.considered)}));
