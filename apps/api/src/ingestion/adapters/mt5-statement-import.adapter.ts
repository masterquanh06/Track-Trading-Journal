import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, TradeDirection, TradeSource } from '@prisma/client';
import * as cheerio from 'cheerio';
import { parse as parseCsv } from 'csv-parse/sync';
import Decimal from 'decimal.js';
import { parseBrokerTimeToUtc } from '../../common/timezone.util';
import {
  AdapterContext,
  AdapterParseResult,
  ITradeIngestionAdapter,
  NormalizedTradeInput,
} from '../interfaces/trade-ingestion-adapter.interface';

export interface Mt5StatementFileInput {
  buffer: Buffer;
  fileName: string;
}

const SECTION_STOP_TITLES = [
  'orders',
  'deals',
  'open positions',
  'working orders',
  'results',
  'summary',
  'balance:',
];

const NON_TRADE_SYMBOLS = new Set([
  'BALANCE',
  'DEPOSIT',
  'WITHDRAWAL',
  'CREDIT',
  'BONUS',
  'CHARGE',
  'CORRECTION',
  'COMMISSION',
  'INTEREST',
]);

@Injectable()
export class Mt5StatementImportAdapter implements ITradeIngestionAdapter<Mt5StatementFileInput> {
  readonly source = TradeSource.MT5_IMPORT;

  async parse(
    input: Mt5StatementFileInput,
    context: AdapterContext,
  ): Promise<AdapterParseResult> {
    if (!input.buffer || input.buffer.length === 0) {
      throw new BadRequestException('Uploaded file is empty');
    }

    const decoded = this.decodeBuffer(input.buffer);
    const lowerName = input.fileName.toLowerCase();
    const looksLikeHtml =
      lowerName.endsWith('.html') ||
      lowerName.endsWith('.htm') ||
      /<html|<table|<tr/i.test(decoded.slice(0, 2000));

    if (looksLikeHtml) {
      return this.parseMt5HtmlPositions(decoded, context);
    }

    return this.parseMt5Csv(decoded, context);
  }

  decodeBuffer(buffer: Buffer): string {
    if (buffer.length >= 2) {
      if (buffer[0] === 0xff && buffer[1] === 0xfe) {
        return new TextDecoder('utf-16le').decode(buffer.subarray(2));
      }
      if (buffer[0] === 0xfe && buffer[1] === 0xff) {
        const swapped = Buffer.from(buffer.subarray(2));
        swapped.swap16();
        return new TextDecoder('utf-16le').decode(swapped);
      }
    }

    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      return buffer.subarray(3).toString('utf-8');
    }

    const sampleLen = Math.min(buffer.length, 512);
    let oddNulls = 0;
    let evenNulls = 0;
    for (let i = 0; i < sampleLen; i++) {
      if (buffer[i] === 0x00) {
        if (i % 2 === 1) oddNulls++;
        else evenNulls++;
      }
    }

    const halfSample = Math.max(1, Math.floor(sampleLen / 2));
    if (oddNulls / halfSample > 0.25) {
      return new TextDecoder('utf-16le').decode(buffer);
    }
    if (evenNulls / halfSample > 0.25) {
      const swapped = Buffer.from(buffer);
      if (swapped.length % 2 === 1) {
        return new TextDecoder('utf-16le').decode(swapped.subarray(0, swapped.length - 1).swap16());
      }
      swapped.swap16();
      return new TextDecoder('utf-16le').decode(swapped);
    }

    return buffer.toString('utf-8');
  }

  private parseDecimalCell(raw: string | undefined): Decimal | null {
    if (!raw) return null;
    let cleaned = raw
      .replace(/\u00a0/g, ' ')
      .replace(/,/g, '')
      .trim();

    if (!cleaned) return null;

    if (cleaned.includes('/')) {
      cleaned = cleaned.split('/')[0].trim();
    }

    cleaned = cleaned.replace(/\s+/g, '');

    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
      return null;
    }
    return new Decimal(cleaned);
  }

  private parseMt5HtmlPositions(html: string, context: AdapterContext): AdapterParseResult {
    const $ = cheerio.load(html);
    const rows = $('tr').toArray();

    let inPositionsSection = false;
    let colMap: Record<string, number> | null = null;
    const trades: NormalizedTradeInput[] = [];
    const warnings: string[] = [];
    let skippedRows = 0;

    for (const row of rows) {
      const cells = $(row)
        .children('th, td')
        .toArray()
        .filter((el) => {
          const cls = ($(el).attr('class') ?? '').toLowerCase();
          return !cls.split(/\s+/).includes('hidden');
        })
        .map((el) => $(el).text().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim());

      if (cells.length === 0) continue;

      const joinedLower = cells.join(' ').trim().toLowerCase();
      const firstCellLower = cells[0].toLowerCase();

      if (!inPositionsSection) {
        if (cells.length <= 2 && firstCellLower === 'positions') {
          inPositionsSection = true;
          colMap = null;
          continue;
        }
        continue;
      }

      if (
        cells.length <= 2 &&
        SECTION_STOP_TITLES.some(
          (stopTitle) => firstCellLower === stopTitle || firstCellLower.startsWith(stopTitle),
        )
      ) {
        break;
      }

      if (!colMap) {
        const normalizedHeaders = cells.map((c) => c.toLowerCase().replace(/\s+/g, ''));
        if (
          normalizedHeaders.includes('position') &&
          normalizedHeaders.includes('symbol') &&
          normalizedHeaders.includes('profit')
        ) {
          colMap = this.buildHtmlColumnMap(normalizedHeaders);
        }
        continue;
      }

      if (joinedLower.startsWith('total') || firstCellLower.startsWith('balance:')) {
        break;
      }

      // Strictly ignore Balance / Deposit / Withdrawal / Credit / Bonus rows
      const typeVal = (cells[colMap.type] ?? '').toLowerCase();
      if (typeVal !== 'buy' && typeVal !== 'sell') {
        skippedRows += 1;
        continue;
      }

      const positionId = (cells[colMap.position] ?? '').trim();
      const symbol = (cells[colMap.symbol] ?? '').trim().toUpperCase();
      const openTimeStr = (cells[colMap.openTime] ?? '').trim();
      const closeTimeStr = (cells[colMap.closeTime] ?? '').trim();

      if (!positionId || !symbol || NON_TRADE_SYMBOLS.has(symbol) || !openTimeStr || !closeTimeStr) {
        skippedRows += 1;
        continue;
      }

      try {
        const openTime = parseBrokerTimeToUtc(openTimeStr, context.brokerTimezone);
        const closeTime = parseBrokerTimeToUtc(closeTimeStr, context.brokerTimezone);
        const holdingSeconds = Math.max(
          0,
          Math.floor((closeTime.getTime() - openTime.getTime()) / 1000),
        );

        const volume = this.parseDecimalCell(cells[colMap.volume]);
        const openPrice = this.parseDecimalCell(cells[colMap.openPrice]);
        const closePrice = this.parseDecimalCell(cells[colMap.closePrice]);
        const grossPnl = this.parseDecimalCell(cells[colMap.profit]);

        if (
          !volume ||
          volume.lessThanOrEqualTo(0) ||
          !openPrice ||
          openPrice.lessThanOrEqualTo(0) ||
          !closePrice ||
          closePrice.lessThanOrEqualTo(0) ||
          !grossPnl
        ) {
          skippedRows += 1;
          warnings.push(`Skipped position ${positionId}: invalid numeric values`);
          continue;
        }

        const sl = colMap.sl >= 0 ? this.parseDecimalCell(cells[colMap.sl]) : null;
        const tp = colMap.tp >= 0 ? this.parseDecimalCell(cells[colMap.tp]) : null;
        const commission =
          (colMap.commission >= 0 ? this.parseDecimalCell(cells[colMap.commission]) : null) ??
          new Decimal(0);
        const swap =
          (colMap.swap >= 0 ? this.parseDecimalCell(cells[colMap.swap]) : null) ?? new Decimal(0);
        const netPnl = grossPnl.plus(commission).plus(swap);

        const cleanSl = sl && !sl.isZero() ? sl : null;
        const cleanTp = tp && !tp.isZero() ? tp : null;

        trades.push({
          externalId: positionId,
          symbol,
          direction: typeVal === 'buy' ? TradeDirection.BUY : TradeDirection.SELL,
          volume,
          openTime,
          closeTime,
          holdingSeconds,
          openPrice,
          closePrice,
          stopLoss: cleanSl,
          takeProfit: cleanTp,
          initialStopLoss: cleanSl,
          initialRiskAmount: null,
          grossPnl,
          commission,
          swap,
          netPnl,
          rawPayload: {
            sourceFormat: 'MT5_HTML_POSITIONS',
            cells,
          } as unknown as Prisma.InputJsonValue,
        });
      } catch (err) {
        skippedRows += 1;
        warnings.push(
          `Skipped position ${positionId}: ${err instanceof Error ? err.message : 'parse error'}`,
        );
      }
    }

    if (!inPositionsSection) {
      throw new BadRequestException(
        'Could not find "Positions" table in MT5 HTML report. Please export Trade History Report from MT5.',
      );
    }

    return { trades, skippedRows, warnings };
  }

  private buildHtmlColumnMap(headers: string[]): Record<string, number> {
    const timeIndices: number[] = [];
    const priceIndices: number[] = [];

    headers.forEach((h, idx) => {
      if (h === 'time') timeIndices.push(idx);
      if (h === 'price') priceIndices.push(idx);
    });

    const findIdx = (candidates: string[]) => headers.findIndex((h) => candidates.includes(h));

    return {
      openTime: timeIndices[0] ?? findIdx(['opentime']),
      position: findIdx(['position', 'ticket', 'order', 'id']),
      symbol: findIdx(['symbol', 'item']),
      type: findIdx(['type', 'direction', 'side']),
      volume: findIdx(['volume', 'size', 'lots']),
      openPrice: priceIndices[0] ?? findIdx(['openprice']),
      sl: findIdx(['s/l', 'sl', 'stoploss']),
      tp: findIdx(['t/p', 'tp', 'takeprofit']),
      closeTime: timeIndices[1] ?? findIdx(['closetime']),
      closePrice: priceIndices[1] ?? findIdx(['closeprice']),
      commission: findIdx(['commission', 'commissions']),
      swap: findIdx(['swap', 'swaps']),
      profit: findIdx(['profit', 'pnl', 'grosspnl']),
    };
  }

  private parseMt5Csv(text: string, context: AdapterContext): AdapterParseResult {
    const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
    const delimiter = firstLine.includes('\t')
      ? '\t'
      : firstLine.includes(';')
        ? ';'
        : ',';

    let records: Record<string, string>[];
    try {
      records = parseCsv(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter,
        relax_column_count: true,
      }) as Record<string, string>[];
    } catch (err) {
      throw new BadRequestException(
        `Invalid CSV format: ${err instanceof Error ? err.message : 'parse error'}`,
      );
    }

    const trades: NormalizedTradeInput[] = [];
    const warnings: string[] = [];
    let skippedRows = 0;

    for (let i = 0; i < records.length; i++) {
      const rawRow = records[i];
      const normalizedRow: Record<string, string> = {};
      for (const [key, val] of Object.entries(rawRow)) {
        normalizedRow[key.toLowerCase().replace(/[^a-z0-9]/g, '')] = (val ?? '').trim();
      }

      const pick = (...keys: string[]) => {
        for (const k of keys) {
          if (normalizedRow[k] !== undefined && normalizedRow[k] !== '') {
            return normalizedRow[k];
          }
        }
        return undefined;
      };

      const typeVal = (pick('type', 'direction', 'side') ?? '').toLowerCase();
      if (typeVal !== 'buy' && typeVal !== 'sell') {
        skippedRows += 1;
        continue;
      }

      const positionId = pick('position', 'positionid', 'ticket', 'externalid', 'id');
      const symbol = pick('symbol', 'item')?.toUpperCase();
      const openTimeStr = pick('opentime', 'opentimeserver', 'time');
      const closeTimeStr = pick('closetime', 'closetimeserver');

      if (!positionId || !symbol || NON_TRADE_SYMBOLS.has(symbol) || !openTimeStr || !closeTimeStr) {
        skippedRows += 1;
        continue;
      }

      try {
        const openTime = parseBrokerTimeToUtc(openTimeStr, context.brokerTimezone);
        const closeTime = parseBrokerTimeToUtc(closeTimeStr, context.brokerTimezone);
        const holdingSeconds = Math.max(
          0,
          Math.floor((closeTime.getTime() - openTime.getTime()) / 1000),
        );

        const volume = this.parseDecimalCell(pick('volume', 'lots', 'size'));
        const openPrice = this.parseDecimalCell(pick('openprice', 'entryprice', 'price'));
        const closePrice = this.parseDecimalCell(pick('closeprice', 'exitprice'));
        const grossPnl = this.parseDecimalCell(pick('profit', 'grosspnl', 'pnl'));

        if (
          !volume ||
          volume.lessThanOrEqualTo(0) ||
          !openPrice ||
          openPrice.lessThanOrEqualTo(0) ||
          !closePrice ||
          closePrice.lessThanOrEqualTo(0) ||
          !grossPnl
        ) {
          skippedRows += 1;
          warnings.push(`Skipped CSV row ${i + 2} (position ${positionId}): invalid numbers`);
          continue;
        }

        const sl = this.parseDecimalCell(pick('sl', 'stoploss'));
        const tp = this.parseDecimalCell(pick('tp', 'takeprofit'));
        const initialSl = this.parseDecimalCell(pick('initialsl', 'initialstoploss')) ?? sl;
        const commission = this.parseDecimalCell(pick('commission', 'commissions')) ?? new Decimal(0);
        const swap = this.parseDecimalCell(pick('swap', 'swaps')) ?? new Decimal(0);
        const netPnl =
          this.parseDecimalCell(pick('netpnl')) ?? grossPnl.plus(commission).plus(swap);

        trades.push({
          externalId: positionId,
          symbol,
          direction: typeVal === 'buy' ? TradeDirection.BUY : TradeDirection.SELL,
          volume,
          openTime,
          closeTime,
          holdingSeconds,
          openPrice,
          closePrice,
          stopLoss: sl && !sl.isZero() ? sl : null,
          takeProfit: tp && !tp.isZero() ? tp : null,
          initialStopLoss: initialSl && !initialSl.isZero() ? initialSl : null,
          initialRiskAmount: null,
          grossPnl,
          commission,
          swap,
          netPnl,
          rawPayload: rawRow as unknown as Prisma.InputJsonValue,
        });
      } catch (err) {
        skippedRows += 1;
        warnings.push(
          `Skipped CSV row ${i + 2}: ${err instanceof Error ? err.message : 'parse error'}`,
        );
      }
    }

    return { trades, skippedRows, warnings };
  }
}
