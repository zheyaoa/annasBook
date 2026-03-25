import XLSX from 'xlsx';
import { BookInfo } from './types.js';
import { logger } from './logger.js';

const REQUIRED_COLUMNS = ['语言', '书名', 'Book title'];

export class ExcelReader {
  private workbook: XLSX.WorkBook;
  private sheet!: XLSX.WorkSheet;
  private filePath: string;
  private currentSheetName!: string;

  constructor(filePath: string, sheetName?: string) {
    this.filePath = filePath;
    this.workbook = XLSX.readFile(filePath);

    if (sheetName) {
      this.selectSheet(sheetName);
    } else {
      // Backward compatibility: default to first sheet
      this.currentSheetName = this.workbook.SheetNames[0];
      this.sheet = this.workbook.Sheets[this.currentSheetName];
      this.validateColumns();
    }
  }

  /**
   * Get all sheet names in the workbook
   */
  getAllSheetNames(): string[] {
    return this.workbook.SheetNames;
  }

  /**
   * Switch to a different sheet
   */
  selectSheet(sheetName: string): void {
    if (!this.workbook.SheetNames.includes(sheetName)) {
      throw new Error(`Sheet not found: ${sheetName}`);
    }
    this.currentSheetName = sheetName;
    this.sheet = this.workbook.Sheets[sheetName];
    this.validateColumns();
  }

  /**
   * Get current sheet name
   */
  getCurrentSheetName(): string {
    return this.currentSheetName;
  }

  /**
   * Ensure "下载状态" column exists, create if missing
   */
  ensureStatusColumn(): void {
    const range = XLSX.utils.decode_range(this.sheet['!ref'] || 'A1');
    const colMap: Record<string, string> = {};

    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = this.sheet[XLSX.utils.encode_cell({ r: 0, c: col })];
      if (cell && cell.v !== undefined) {
        colMap[String(cell.v)] = XLSX.utils.encode_col(col);
      }
    }

    if (!colMap['下载状态']) {
      const newColIndex = range.e.c + 1;
      const newCol = XLSX.utils.encode_col(newColIndex);
      this.sheet[`${newCol}1`] = { t: 's', v: '下载状态' };
      this.sheet['!ref'] = XLSX.utils.encode_range({
        s: range.s,
        e: { r: range.e.r, c: newColIndex }
      });
    }
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
    const cellRef = `${col}${row + 1}`;
    const cell = this.sheet[cellRef];
    if (!cell) return '';

    if (cell.t === 'f' && cell.v === undefined) {
      return cell.w || '';
    }

    if (cell.v === null || cell.v === undefined) {
      return '';
    }

    if (cell.t === 'd') {
      return cell.v.toISOString();
    }

    return String(cell.v);
  }

  readBooks(): BookInfo[] {
    const range = XLSX.utils.decode_range(this.sheet['!ref'] || 'A1');
    const books: BookInfo[] = [];
    const seenBooks = new Set<string>();

    const colMap: Record<string, string> = {};
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = this.sheet[XLSX.utils.encode_cell({ r: 0, c: col })];
      if (cell && cell.v !== undefined) {
        colMap[String(cell.v)] = XLSX.utils.encode_col(col);
      }
    }

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
        downloadUrl: this.getCellValue(row, colMap['下载链接'] || 'L'),
      };

      if (!book.chineseTitle && !book.englishTitle) {
        logger.warn(`Row ${row}: Skipping - both titles are empty`);
        continue;
      }

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

    const colMap: Record<string, string> = {};
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = this.sheet[XLSX.utils.encode_cell({ r: 0, c: col })];
      if (cell && cell.v !== undefined) {
        colMap[String(cell.v)] = XLSX.utils.encode_col(col);
      }
    }

    const statusCol = colMap['下载状态'] || 'J';
    this.sheet[`${statusCol}${rowIndex + 1}`] = { t: 's', v: status };

    if (bookLink) {
      const linkCol = colMap['书籍链接'] || 'K';
      this.sheet[`${linkCol}${rowIndex + 1}`] = { t: 's', v: bookLink };
    }
  }

  updateDownloadUrl(rowIndex: number, downloadUrl: string): void {
    const range = XLSX.utils.decode_range(this.sheet['!ref'] || 'A1');

    // 查找"下载链接"列
    const colMap: Record<string, string> = {};
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = this.sheet[XLSX.utils.encode_cell({ r: 0, c: col })];
      if (cell && cell.v !== undefined) {
        colMap[String(cell.v)] = XLSX.utils.encode_col(col);
      }
    }

    let urlCol = colMap['下载链接'];
    if (!urlCol) {
      // 列不存在，创建新列
      const newColIndex = range.e.c + 1;
      urlCol = XLSX.utils.encode_col(newColIndex);
      this.sheet[`${urlCol}1`] = { t: 's', v: '下载链接' };
      // 更新 sheet 范围
      this.sheet['!ref'] = XLSX.utils.encode_range({
        s: range.s,
        e: { r: range.e.r, c: newColIndex }
      });
    }

    this.sheet[`${urlCol}${rowIndex + 1}`] = { t: 's', v: downloadUrl };
  }

  save(): void {
    XLSX.writeFile(this.workbook, this.filePath);
  }
}