import XLSX from 'xlsx';
import { BookInfo } from './types.js';
import { logger } from './logger.js';

const REQUIRED_COLUMNS = ['语言', '书名', 'Book title'];

export class ExcelReader {
  private workbook: XLSX.WorkBook;
  private sheet: XLSX.WorkSheet;
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.workbook = XLSX.readFile(filePath);
    const sheetName = this.workbook.SheetNames[0];
    this.sheet = this.workbook.Sheets[sheetName];
    this.validateColumns();
  }

  private validateColumns(): void {
    const range = XLSX.utils.decode_range(this.sheet['!ref'] || 'A1');
    const headers: string[] = [];

    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = this.sheet[XLSX.utils.encode_cell({ r: 0, c: col })];
      if (cell && cell.v !== undefined) {
        headers.push(String(cell.v));
      }
    }

    for (const required of REQUIRED_COLUMNS) {
      if (!headers.includes(required)) {
        throw new Error(`Missing required column: ${required}`);
      }
    }
  }

  private getCellValue(row: number, col: string): string {
    // XLSX cell references use 1-indexed rows (A1, B2, etc.)
    // Our row parameter is 0-indexed, so we need to add 1
    const cellRef = `${col}${row + 1}`;
    const cell = this.sheet[cellRef];
    if (!cell) return '';

    // Handle formula cells
    if (cell.t === 'f' && cell.v === undefined) {
      return cell.w || '';
    }

    // Convert to string
    if (cell.v === null || cell.v === undefined) {
      return '';
    }

    // Handle dates
    if (cell.t === 'd') {
      return cell.v.toISOString();
    }

    return String(cell.v);
  }

  readBooks(): BookInfo[] {
    const range = XLSX.utils.decode_range(this.sheet['!ref'] || 'A1');
    const books: BookInfo[] = [];
    const seenBooks = new Set<string>();

    // Find column indices
    const colMap: Record<string, string> = {};
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = this.sheet[XLSX.utils.encode_cell({ r: 0, c: col })];
      if (cell && cell.v !== undefined) {
        colMap[String(cell.v)] = XLSX.utils.encode_col(col);
      }
    }

    // Read rows (skip header)
    for (let row = range.s.r + 1; row <= range.e.r; row++) {
      const book: BookInfo = {
        rowIndex: row,
        language: this.getCellValue(row, colMap['语言'] || 'A'),
        chineseTitle: this.getCellValue(row, colMap['书名'] || 'B'),
        englishTitle: this.getCellValue(row, colMap['Book title'] || 'C'),
        chineseAuthor: this.getCellValue(row, colMap['作者'] || 'D'),
        englishAuthor: this.getCellValue(row, colMap['Author'] || 'E'),
        confidence: this.getCellValue(row, colMap['置信度'] || 'I'),
        downloadStatus: this.getCellValue(row, colMap['下载状态'] || 'J'),
        bookLink: this.getCellValue(row, colMap['书籍链接'] || 'K'),
      };

      // Skip rows with missing required fields
      if (!book.chineseTitle && !book.englishTitle) {
        logger.warn(`Row ${row}: Skipping - both titles are empty`);
        continue;
      }

      // Check for duplicates
      const key = `${book.chineseTitle}|${book.englishTitle}`;
      if (seenBooks.has(key)) {
        logger.info(`Row ${row}: Skipping duplicate entry - ${book.chineseTitle || book.englishTitle}`);
        continue;
      }
      seenBooks.add(key);

      books.push(book);
    }

    logger.info(`Read ${books.length} books from Excel`);
    return books;
  }

  updateStatus(rowIndex: number, status: string, bookLink?: string): void {
    const range = XLSX.utils.decode_range(this.sheet['!ref'] || 'A1');

    // Find column indices
    const colMap: Record<string, string> = {};
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = this.sheet[XLSX.utils.encode_cell({ r: 0, c: col })];
      if (cell && cell.v !== undefined) {
        colMap[String(cell.v)] = XLSX.utils.encode_col(col);
      }
    }

    // Update download status (rowIndex is 0-indexed, Excel uses 1-indexed)
    const statusCol = colMap['下载状态'] || 'J';
    this.sheet[`${statusCol}${rowIndex + 1}`] = { t: 's', v: status };

    // Update book link if provided
    if (bookLink) {
      const linkCol = colMap['书籍链接'] || 'K';
      this.sheet[`${linkCol}${rowIndex + 1}`] = { t: 's', v: bookLink };
    }
  }

  save(): void {
    XLSX.writeFile(this.workbook, this.filePath);
    logger.info(`Excel file saved: ${this.filePath}`);
  }
}