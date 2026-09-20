const fs = require('fs');
const path = require('path');

const adminDir = path.join(__dirname, '..', 'public', 'pages', 'admin');
const files = fs.readdirSync(adminDir).filter(f => f.endsWith('.html') && f !== 'audit-logs.html');

const auditLinkBlock = `
      <!-- SYSTEM & SECURITY -->
      <div class="nav-group-title">System & Security</div>
      <ul class="nav-list">
        <li>
          <a href="/pages/admin/audit-logs.html" class="nav-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span>Audit Logs</span>
          </a>
        </li>
      </ul>`;

files.forEach(file => {
  const filePath = path.join(adminDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // If it already has #audit-logs or #audit, replace href
  if (content.includes('href="#audit-logs"')) {
    content = content.replace('href="#audit-logs"', 'href="/pages/admin/audit-logs.html"');
    console.log(`Updated existing #audit-logs in ${file}`);
  } else if (content.includes('href="#audit"')) {
    content = content.replace('href="#audit"', 'href="/pages/admin/audit-logs.html"');
    console.log(`Updated existing #audit in ${file}`);
  } else if (!content.includes('/pages/admin/audit-logs.html')) {
    // Need to insert auditLinkBlock before </nav>
    if (content.includes('</nav>')) {
      content = content.replace('</nav>', `${auditLinkBlock}\n    </nav>`);
      console.log(`Inserted Audit Logs section before </nav> in ${file}`);
    } else {
      console.warn(`No </nav> found in ${file}`);
    }
  } else {
    console.log(`Already has audit-logs link: ${file}`);
  }

  fs.writeFileSync(filePath, content, 'utf8');
});

console.log('All admin pages nav update complete.');
