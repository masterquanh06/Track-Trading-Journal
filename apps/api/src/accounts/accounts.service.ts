import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Platform, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { CreateAccountInput, UpdateAccountInput } from '@trackdailytrade/shared';
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
      const initialBalance = new Decimal(acc.initialBalance.toString());
      const netPnl = pnlByAccount.get(acc.id) ?? new Decimal(0);
      const fallbackComputedBalance = initialBalance.plus(netPnl);

      // Prefer live broker balance/equity synced from MT5 EA; fallback to initialBalance + sum(netPnl)
      const currentBalance =
        acc.currentBalance !== null
          ? new Decimal(acc.currentBalance.toString())
          : fallbackComputedBalance;
      const currentEquity =
        acc.currentEquity !== null
          ? new Decimal(acc.currentEquity.toString())
          : currentBalance;

      return {
        id: acc.id,
        name: acc.name,
        broker: acc.broker,
        platform: acc.platform,
        accountNumber: acc.accountNumber,
        currency: acc.currency,
        initialBalance: formatMoney(initialBalance),
        currentBalance: formatMoney(currentBalance),
        currentEquity: formatMoney(currentEquity),
        brokerTimezone: acc.brokerTimezone,
        displayTimezone: acc.displayTimezone,
        tradeCount: acc._count.trades,
        netPnl: formatMoney(netPnl),
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

    const initialBalance = new Decimal(account.initialBalance.toString());
    const netPnl = new Decimal(pnlAgg._sum.netPnl?.toString() ?? '0');
    const fallbackBalance = initialBalance.plus(netPnl);
    const currentBalance =
      account.currentBalance !== null
        ? new Decimal(account.currentBalance.toString())
        : fallbackBalance;
    const currentEquity =
      account.currentEquity !== null
        ? new Decimal(account.currentEquity.toString())
        : currentBalance;

    return {
      ...account,
      initialBalance: formatMoney(initialBalance),
      currentBalance: formatMoney(currentBalance),
      currentEquity: formatMoney(currentEquity),
      netPnl: formatMoney(netPnl),
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
   * and persist live `accountBalance` / `accountEquity` directly from MT5 terminal.
   */
  async findOrCreateByMt5AccountNumber(params: {
    accountNumber: string;
    broker?: string;
    currency?: string;
    brokerTimezone?: string;
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

    const hasLiveBalance = params.accountBalance !== undefined && params.accountBalance !== null;
    const hasLiveEquity = params.accountEquity !== undefined && params.accountEquity !== null;

    if (existing) {
      if (hasLiveBalance || hasLiveEquity || params.currency || params.broker) {
        return this.prisma.tradingAccount.update({
          where: { id: existing.id },
          data: {
            ...(hasLiveBalance
              ? { currentBalance: new Prisma.Decimal(params.accountBalance!) }
              : {}),
            ...(hasLiveEquity
              ? { currentEquity: new Prisma.Decimal(params.accountEquity!) }
              : hasLiveBalance
                ? { currentEquity: new Prisma.Decimal(params.accountBalance!) }
                : {}),
            ...(params.currency ? { currency: params.currency.toUpperCase() } : {}),
            ...(!existing.broker && params.broker ? { broker: params.broker } : {}),
          },
        });
      }
      return existing;
    }

    const initDecimal = hasLiveBalance
      ? new Prisma.Decimal(params.accountBalance!)
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
        initialBalance: initDecimal,
        currentBalance: hasLiveBalance ? new Prisma.Decimal(params.accountBalance!) : null,
        currentEquity: hasLiveEquity
          ? new Prisma.Decimal(params.accountEquity!)
          : hasLiveBalance
            ? new Prisma.Decimal(params.accountBalance!)
            : null,
        brokerTimezone: params.brokerTimezone ?? 'Europe/Athens',
        displayTimezone: user.displayTimezone,
      },
    });
  }
}
