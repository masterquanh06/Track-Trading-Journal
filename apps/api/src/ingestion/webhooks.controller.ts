import { Body, Controller, Post } from '@nestjs/common';
import {
  Mt5BatchWebhookPayload,
  Mt5BatchWebhookSchema,
  Mt5SingleWebhookPayload,
  Mt5SingleWebhookSchema,
} from '@trackdailytrade/shared';
import { AccountsService } from '../accounts/accounts.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { Mt5WebhookAdapter } from './adapters/mt5-webhook.adapter';
import { TradeIngestionService } from './ingestion.service';

@Controller('webhooks/mt5')
export class WebhooksController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly mt5WebhookAdapter: Mt5WebhookAdapter,
    private readonly ingestionService: TradeIngestionService,
  ) {}

  @Post('trade')
  async receiveSingleTrade(
    @Body(new ZodValidationPipe(Mt5SingleWebhookSchema)) payload: Mt5SingleWebhookPayload,
  ) {
    const account = await this.accountsService.findOrCreateByMt5AccountNumber({
      accountNumber: payload.accountNumber,
      broker: payload.broker,
      currency: payload.currency,
      brokerTimezone: payload.brokerTimezone,
      accountBalance: payload.accountBalance,
      accountEquity: payload.accountEquity,
    });

    const brokerTimezone = payload.brokerTimezone ?? account.brokerTimezone;
    const parsed = await this.mt5WebhookAdapter.parse([payload.trade], { brokerTimezone });

    return this.ingestionService.ingestTrades(parsed.trades, {
      accountId: account.id,
      source: this.mt5WebhookAdapter.source,
      skippedRows: parsed.skippedRows,
      warnings: parsed.warnings,
      accountBalance: payload.accountBalance,
      accountEquity: payload.accountEquity,
    });
  }

  @Post('batch')
  async receiveBatchTrades(
    @Body(new ZodValidationPipe(Mt5BatchWebhookSchema)) payload: Mt5BatchWebhookPayload,
  ) {
    const account = await this.accountsService.findOrCreateByMt5AccountNumber({
      accountNumber: payload.accountNumber,
      broker: payload.broker,
      currency: payload.currency,
      brokerTimezone: payload.brokerTimezone,
      accountBalance: payload.accountBalance,
      accountEquity: payload.accountEquity,
    });

    const brokerTimezone = payload.brokerTimezone ?? account.brokerTimezone;
    const parsed = await this.mt5WebhookAdapter.parse(payload.trades, { brokerTimezone });

    return this.ingestionService.ingestTrades(parsed.trades, {
      accountId: account.id,
      source: this.mt5WebhookAdapter.source,
      skippedRows: parsed.skippedRows,
      warnings: parsed.warnings,
      accountBalance: payload.accountBalance,
      accountEquity: payload.accountEquity,
    });
  }
}
