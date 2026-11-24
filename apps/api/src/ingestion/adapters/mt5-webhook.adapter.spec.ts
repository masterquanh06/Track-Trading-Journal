import { Mt5WebhookTrade } from '@trackdailytrade/shared';
import { Mt5WebhookAdapter } from './mt5-webhook.adapter';

describe('Mt5WebhookAdapter', () => {
  const adapter = new Mt5WebhookAdapter();

  it('excludes DEAL_TYPE_BALANCE / DEPOSIT / WITHDRAWAL / zero-volume deals so Net PnL is never polluted', async () => {
    const incoming: Mt5WebhookTrade[] = [
      {
        positionId: '20001',
        symbol: 'XAUUSD',
        direction: 'BUY',
        volume: '1.00',
        openTimeServer: '2026.11.24 10:00:00',
        closeTimeServer: '2026.11.24 11:00:00',
        openPrice: '2650.00',
        closePrice: '2660.00',
        grossPnl: '1000.00',
        commission: '-7.00',
        swap: '0.00',
      },
      {
        // Simulated accidental balance deposit entry
        positionId: '20002',
        symbol: 'BALANCE',
        direction: 'BUY',
        volume: '0',
        openTimeServer: '2026.11.24 12:00:00',
        closeTimeServer: '2026.11.24 12:00:00',
        openPrice: '0',
        closePrice: '0',
        grossPnl: '50000.00',
        commission: '0',
        swap: '0',
      },
      {
        // Simulated withdrawal entry
        positionId: '20003',
        symbol: 'WITHDRAWAL',
        direction: 'SELL',
        volume: '1.00',
        openTimeServer: '2026.11.24 13:00:00',
        closeTimeServer: '2026.11.24 13:00:00',
        openPrice: '1',
        closePrice: '1',
        grossPnl: '-15000.00',
        commission: '0',
        swap: '0',
      },
    ];

    const parsed = await adapter.parse(incoming, { brokerTimezone: 'Europe/Athens' });

    expect(parsed.trades).toHaveLength(1);
    expect(parsed.skippedRows).toBe(2);
    expect(parsed.trades[0].externalId).toBe('20001');
    expect(parsed.trades[0].netPnl.toFixed(2)).toBe('993.00');
  });
});
