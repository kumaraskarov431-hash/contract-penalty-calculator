const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const target = path.join(root,'dist','vendor');
fs.mkdirSync(target,{recursive:true});
for (const [source,name] of [
  ['decimal.js/decimal.js','decimal.js'],
  ['exceljs/dist/exceljs.min.js','exceljs.min.js'],
  ['lucide/dist/umd/lucide.js','lucide.js']
]) {
  fs.copyFileSync(path.join(root,'node_modules',source),path.join(target,name));
}
for (const [pkg,file] of [['decimal.js','LICENCE.md'],['exceljs','LICENSE'],['lucide','LICENSE']]) {
  fs.copyFileSync(path.join(root,'node_modules',pkg,file),path.join(target,pkg+'-LICENSE.txt'));
}
console.log('Local browser dependencies copied to dist/vendor.');
