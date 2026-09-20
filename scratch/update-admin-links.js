const fs = require('fs');
const path = require('path');

const adminDir = path.join(__dirname, '..', 'public', 'pages', 'admin');
const files = fs.readdirSync(adminDir).filter((f) => f.endsWith('.html') && f !== 'queries.html');
let count = 0;

for (const file of files) {
  const p = path.join(adminDir, file);
  let content = fs.readFileSync(p, 'utf8');
  if (content.includes('href="#queries"')) {
    content = content.replace(/href="#queries"/g, 'href="/pages/admin/queries.html"');
    fs.writeFileSync(p, content, 'utf8');
    count++;
  }
}

console.log(`Updated ${count} admin HTML files.`);
