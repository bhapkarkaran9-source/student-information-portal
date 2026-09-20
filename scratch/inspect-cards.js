const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '../public/pages/student');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

files.forEach(f => {
  const content = fs.readFileSync(path.join(dir, f), 'utf8');
  const cardClasses = new Set();
  const regex = /class=["']([^"']*(?:card|kpi|stat|panel|box)[^"']*)["']/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
    match[1].split(/\s+/).forEach(cls => {
      if (/card|kpi|stat|panel|box/i.test(cls)) cardClasses.add(cls);
    });
  }
  const gradients = (content.match(/linear-gradient/gi) || []).length;
  console.log(`${f.padEnd(25)} -> Gradients: ${gradients} | Cards: ${Array.from(cardClasses).join(', ')}`);
});
