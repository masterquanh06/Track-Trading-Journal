import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AccountsService } from '../accounts/accounts.service';
import { Mt5StatementImportAdapter } from './adapters/mt5-statement-import.adapter';
import { TradeIngestionService } from './ingestion.service';

@Controller('imports')
export class ImportsController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly mt5ImportAdapter: Mt5StatementImportAdapter,
    private readonly ingestionService: TradeIngestionService,
  ) {}

  @Post('mt5')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max report size
    }),
  )
  async importMt5Statement(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('accountId') accountId: string | undefined,
    @Body('brokerTimezone') brokerTimezoneOverride?: string,
    @Body('dryRun') dryRunRaw?: string | boolean,
  ) {
    if (!file) {
      throw new BadRequestException('Missing file upload (form field name: "file")');
    }
    if (!accountId) {
      throw new BadRequestException('Missing required field "accountId"');
    }

    const account = await this.accountsService.findOne(accountId);
    const brokerTimezone = brokerTimezoneOverride?.trim() || account.brokerTimezone;
    const dryRun = dryRunRaw === true || dryRunRaw === 'true' || dryRunRaw === '1';

    const parsed = await this.mt5ImportAdapter.parse(
      { buffer: file.buffer, fileName: file.originalname },
      { brokerTimezone, fileName: file.originalname },
    );

    return this.ingestionService.ingestTrades(parsed.trades, {
      accountId: account.id,
      source: this.mt5ImportAdapter.source,
      fileName: file.originalname,
      skippedRows: parsed.skippedRows,
      warnings: parsed.warnings,
      dryRun,
      initialCapital: parsed.accountSnapshot?.initialCapital ?? null,
      accountBalance: parsed.accountSnapshot?.balance ?? null,
      accountEquity: parsed.accountSnapshot?.equity ?? null,
      currency: parsed.accountSnapshot?.currency ?? null,
    });
  }

  @Get('logs')
  getSyncLogs(@Query('accountId') accountId?: string, @Query('limit') limit?: string) {
    const parsedLimit = limit ? Number(limit) : 30;
    return this.ingestionService.getSyncLogs(
      accountId || undefined,
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 30,
    );
  }
}
