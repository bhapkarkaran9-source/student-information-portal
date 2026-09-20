const ExcelJS = require('exceljs');

/**
 * Export Service for Academic Reports
 * Generates CSV and Excel (.xlsx) files
 */

/**
 * Format CSV field safely with escaping
 */
const escapeCsvField = (val) => {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  // If field contains comma, quote, or newline, escape quotes by doubling them
  if (/[",\r\n]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  } else {
    str = `"${str}"`;
  }
  return str;
};

/**
 * Generate CSV string with UTF-8 BOM
 * @param {Object} options
 * @param {string} options.title - Report Title
 * @param {Array<{ header: string, key: string }>} options.columns - Column Definitions
 * @param {Array<Object>} options.data - Data Rows
 * @param {Object} [options.summary] - Optional Summary Key-Value pairs
 * @returns {string}
 */
const generateCsv = ({ title, columns, data, summary = null }) => {
  const lines = [];

  // UTF-8 BOM for Microsoft Excel compatibility
  const BOM = '\uFEFF';

  // Title & Metadata
  lines.push(escapeCsvField(title));
  lines.push(escapeCsvField(`Generated on: ${new Date().toLocaleString('en-GB')}`));
  lines.push(''); // Blank line

  // Column Headers
  const headerLine = columns.map((c) => escapeCsvField(c.header)).join(',');
  lines.push(headerLine);

  // Data Rows
  if (!data || data.length === 0) {
    lines.push(escapeCsvField('No data available for the selected criteria.'));
  } else {
    for (const row of data) {
      const rowLine = columns.map((c) => escapeCsvField(row[c.key] !== undefined && row[c.key] !== null ? row[c.key] : '-')).join(',');
      lines.push(rowLine);
    }
  }

  // Summary Section
  if (summary && Object.keys(summary).length > 0) {
    lines.push('');
    lines.push(escapeCsvField('--- SUMMARY ---'));
    for (const [k, v] of Object.entries(summary)) {
      const label = k.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
      lines.push(`${escapeCsvField(label)},${escapeCsvField(v)}`);
    }
  }

  return BOM + lines.join('\r\n');
};

/**
 * Generate Excel workbook buffer using ExcelJS
 * @param {Object} options
 * @param {string} options.title - Report Title
 * @param {Array<{ header: string, key: string, width?: number }>} options.columns - Columns
 * @param {Array<Object>} options.data - Data Rows
 * @param {Object} [options.summary] - Optional Summary
 * @returns {Promise<Buffer>}
 */
const generateExcel = async ({ title, columns, data, summary = null }) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Student Information Portal';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(title.slice(0, 31) || 'Report', {
    views: [{ showGridLines: true }]
  });

  // 1. Institution Title Banner
  const bannerRow = worksheet.addRow(['Student Information Portal']);
  bannerRow.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF4338CA' } };
  worksheet.mergeCells(`A1:${String.fromCharCode(64 + Math.max(columns.length, 3))}1`);

  // 2. Report Title
  const titleRow = worksheet.addRow([title]);
  titleRow.font = { name: 'Arial', size: 12, bold: true };
  worksheet.mergeCells(`A2:${String.fromCharCode(64 + Math.max(columns.length, 3))}2`);

  // 3. Generated Date
  const dateRow = worksheet.addRow([`Generated on: ${new Date().toLocaleString('en-GB')}`]);
  dateRow.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
  worksheet.mergeCells(`A3:${String.fromCharCode(64 + Math.max(columns.length, 3))}3`);

  worksheet.addRow([]); // Blank line

  // 4. Table Headers
  const headerValues = columns.map((c) => c.header);
  const tableHeaderRow = worksheet.addRow(headerValues);
  tableHeaderRow.height = 24;

  tableHeaderRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' } // Slate 800
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF0F172A' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      right: { style: 'thin', color: { argb: 'FF0F172A' } }
    };
  });

  // 5. Data Rows
  if (!data || data.length === 0) {
    const emptyRow = worksheet.addRow(['No data available for the selected criteria.']);
    emptyRow.font = { name: 'Arial', size: 11, italic: true, color: { argb: 'FF64748B' } };
    worksheet.mergeCells(`A${emptyRow.number}:${String.fromCharCode(64 + columns.length)}${emptyRow.number}`);
  } else {
    data.forEach((item, index) => {
      const rowValues = columns.map((c) => {
        const v = item[c.key];
        return v !== undefined && v !== null ? v : '-';
      });
      const dataRow = worksheet.addRow(rowValues);
      dataRow.height = 20;

      const isEven = index % 2 === 0;
      dataRow.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 10 };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
        cell.alignment = { vertical: 'middle' };
        if (!isEven) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8FAFC' } // Alternating light gray
          };
        }
      });
    });
  }

  // 6. Summary Section
  if (summary && Object.keys(summary).length > 0) {
    worksheet.addRow([]); // Blank line
    const summaryHeader = worksheet.addRow(['Summary Metrics']);
    summaryHeader.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF334155' } };

    for (const [k, v] of Object.entries(summary)) {
      const label = k.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
      const sRow = worksheet.addRow([label, v]);
      sRow.getCell(1).font = { name: 'Arial', size: 10, bold: true };
      sRow.getCell(2).font = { name: 'Arial', size: 10 };
    }
  }

  // 7. Auto-fit column widths
  columns.forEach((col, index) => {
    let maxLen = col.header.length;
    if (data && data.length > 0) {
      data.forEach((r) => {
        const val = r[col.key];
        if (val) {
          const l = String(val).length;
          if (l > maxLen) maxLen = l;
        }
      });
    }
    worksheet.getColumn(index + 1).width = Math.max(12, Math.min(maxLen + 4, 40));
  });

  return workbook.xlsx.writeBuffer();
};

module.exports = {
  generateCsv,
  generateExcel
};
