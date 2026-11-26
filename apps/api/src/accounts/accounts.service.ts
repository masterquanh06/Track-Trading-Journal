import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Platform, Prisma } from '@prisma/client';
import {
  CreateAccountInput,
  reconcileAccountCapital,
  resolveSyncAccountCapitalUpdate,
  UpdateAccountInput,
} from '@trackdailytrade/shared';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { DefaultUserService } from '../common/default-user.service';
import { formatMoney } from '../common/decimal.util';

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly defaultUser: DefaultUserService,
  ) {}

  async findAll() {
    const user = await this.defaultUser.getDefaultUser();
    const accounts = await this.prisma.tradingAccount.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      include: {
        _count: {
          select: { trades: true },
        },
      },
    });

    const pnlAggs = await this.prisma.trade.groupBy({
      by: ['accountId'],
      where: { accountId: { in: accounts.map((a) => a.id) } },
      _sum: { netPnl: true },
    });

    const pnlByAccount = new Map(
      pnlAggs.map((row) => [
        row.accountId,
        new Decimal(row._sum.netPnl?.toString() ?? '0'),
      ]),
    );

    return accounts.map((acc) => {
      const netPnl = pnlByAccount.get(acc.id) ?? new Decimal(0);
      const reconciled = reconcileAccountCapital({
        initialBalance: acc.initialBalance.toString(),
        storedLiveBalance: acc.currentBalance?.toString() ?? null,
        storedLiveEquity: acc.currentEquity?.toString() ?? null,
        allTimeClosedNetPnl: netPnl.toString(),
      });

      return {
        id: acc.id,
        name: acc.name,
        broker: acc.broker,
        platform: acc.platform,
        accountNumber: acc.accountNumber,
        currency: acc.currency,
        initialBalance: reconciled.initialBalance,
        currentBalance: reconciled.currentBalance,
        currentEquity: reconciled.currentEquity,
        brokerTimezone: acc.brokerTimezone,
        displayTimezone: acc.displayTimezone,
        tradeCount: acc._count.trades,
        netPnl: reconciled.netPnl,
        createdAt: acc.createdAt.toISOString(),
        updatedAt: acc.updatedAt.toISOString(),
      };
    });
  }

  async findOne(id: string) {
    const account = await this.prisma.tradingAccount.findUnique({
      where: { id },
      include: { _count: { select: { trades: true } } },
    });
    if (!account) {
      throw new NotFoundException(`TradingAccount ${id} not found`);
    }

    const pnlAgg = await this.prisma.trade.aggregate({
      where: { accountId: id },
      _sum: { netPnl: true },
    });

    const reconciled = reconcileAccountCapital({
      initialBalance: account.initialBalance.toString(),
      storedLiveBalance: account.currentBalance?.toString() ?? null,
      storedLiveEquity: account.currentEquity?.toString() ?? null,
      allTimeClosedNetPnl: pnlAgg._sum.netPnl?.toString() ?? '0',
    });

    return {
      ...account,
      initialBalance: reconciled.initialBalance,
      currentBalance: reconciled.currentBalance,
      currentEquity: reconciled.currentEquity,
      netPnl: reconciled.netPnl,
      tradeCount: account._count.trades,
    };
  }

  async create(input: CreateAccountInput) {
    const user = await this.defaultUser.getDefaultUser();

    try {
      const created = await this.prisma.tradingAccount.create({
        data: {
          userId: user.id,
          name: input.name,
          broker: input.broker ?? null,
          platform: input.platform as Platform,
          accountNumber: input.accountNumber,
          currency: input.currency.toUpperCase(),
          initialBalance: new Prisma.Decimal(input.initialBalance),
          brokerTimezone: input.brokerTimezone,
          displayTimezone: input.displayTimezone,
        },
      });
      const initBal = formatMoney(new Decimal(created.initialBalance.toString()));
      return {
        ...created,
        initialBalance: initBal,
        currentBalance: initBal,
        currentEquity: initBal,
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          `Account ${input.platform} #${input.accountNumber} already exists`,
        );
      }
      throw err;
    }
  }

  async update(id: string, input: UpdateAccountInput) {
    await this.findOne(id);

    try {
      await this.prisma.tradingAccount.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.broker !== undefined ? { broker: input.broker } : {}),
          ...(input.platform !== undefined ? { platform: input.platform as Platform } : {}),
          ...(input.accountNumber !== undefined ? { accountNumber: input.accountNumber } : {}),
          ...(input.currency !== undefined ? { currency: input.currency.toUpperCase() } : {}),
          ...(input.initialBalance !== undefined
            ? { initialBalance: new Prisma.Decimal(input.initialBalance) }
            : {}),
          ...(input.brokerTimezone !== undefined ? { brokerTimezone: input.brokerTimezone } : {}),
          ...(input.displayTimezone !== undefined
            ? { displayTimezone: input.displayTimezone }
            : {}),
        },
      });

      return this.findOne(id);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Another account with this platform & accountNumber exists');
      }
      throw err;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.tradingAccount.delete({ where: { id } });
    return { deleted: true, id };
  }

  /**
   * Used by MT5 Webhook Adapter to resolve or auto-register an account by `accountNumber`,
   * and persist live `initialCapital` / `accountBalance` / `accountEquity` per account cleanly.
   */
  async findOrCreateByMt5AccountNumber(params: {
    accountNumber: string;
    broker?: string;
    currency?: string;
    brokerTimezone?: string;
    initialCapital?: string | null;
    accountBalance?: string | null;
    accountEquity?: string | null;
  }) {
    const user = await this.defaultUser.getDefaultUser();
    const existing = await this.prisma.tradingAccount.findUnique({
      where: {
        userId_platform_accountNumber: {
          userId: user.id,
          platform: Platform.MT5,
          accountNumber: params.accountNumber,
        },
      },
    });

    if (existing) {
      const patch = resolveSyncAccountCapitalUpdate({
        existingInitialBalance: existing.initialBalance.toString(),
        incomingInitialCapital: params.initialCapital ?? null,
        incomingBalance: params.accountBalance ?? null,
        incomingEquity: params.accountEquity ?? null,
      });

      const updateData: Prisma.TradingAccountUpdateInput = {
        ...(patch.initialBalance !== undefined
          ? { initialBalance: new Prisma.Decimal(patch.initialBalance) }
          : {}),
        ...(patch.currentBalance !== undefined
          ? { currentBalance: new Prisma.Decimal(patch.currentBalance) }
          : {}),
        ...(patch.currentEquity !== undefined
          ? { currentEquity: new Prisma.Decimal(patch.currentEquity) }
          : {}),
        ...(params.currency ? { currency: params.currency.toUpperCase() } : {}),
        ...(!existing.broker && params.broker ? { broker: params.broker } : {}),
      };

      if (Object.keys(updateData).length > 0) {
        return this.prisma.tradingAccount.update({
          where: { id: existing.id },
          data: updateData,
        });
      }
      return existing;
    }

    // For a brand-new auto-registered account:
    // If MT5 provided `initialCapital` (DEAL_TYPE_BALANCE deposits), use it directly.
    // Otherwise start with `0` so TradeIngestionService derives `liveBalance - allTimeClosedNetPnl`
    // atomically after persisting the incoming trades (preventing post-trade balance from becoming initialBalance!).
    const createPatch = resolveSyncAccountCapitalUpdate({
      existingInitialBalance: null,
      isNewAccount: false,
      incomingInitialCapital: params.initialCapital ?? null,
      incomingBalance: params.accountBalance ?? null,
      incomingEquity: params.accountEquity ?? null,
    });

    const initialBalanceDecimal = params.initialCapital
      ? new Prisma.Decimal(createPatch.initialBalance ?? params.initialCapital)
      : new Prisma.Decimal('0');

    return this.prisma.tradingAccount.create({
      data: {
        userId: user.id,
        name: params.broker
          ? `${params.broker} #${params.accountNumber}`
          : `MT5 #${params.accountNumber}`,
        broker: params.broker ?? null,
        platform: Platform.MT5,
        accountNumber: params.accountNumber,
        currency: (params.currency ?? 'USD').toUpperCase(),
        initialBalance: initialBalanceDecimal,
        currentBalance:
          createPatch.currentBalance !== undefined
            ? new Prisma.Decimal(createPatch.currentBalance)
            : null,
        currentEquity:
          createPatch.currentEquity !== undefined
            ? new Prisma.Decimal(createPatch.currentEquity)
            : null,
        brokerTimezone: params.brokerTimezone ?? 'Europe/Athens',
        displayTimezone: user.displayTimezone,
      },
    });
  }
}
