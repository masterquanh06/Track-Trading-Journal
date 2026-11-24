import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TradeDirection } from '@prisma/client';
import Decimal from 'decimal.js';
import { TradeQueryInput, UpdateTradeJournalInput } from '@trackdailytrade/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DefaultUserService } from '../common/default-user.service';
import {
  calculateRiskAndRMultiple,
  formatMoney,
  formatPrice,
  formatR,
  toDecimal,
} from '../common/decimal.util';
import { parseFilterDateToUtc } from '../common/timezone.util';

type TradeWithRelations = Prisma.TradeGetPayload<{
  include: {
    account: { select: { id: true; name: true; currency: true; platform: true } };
    tags: { include: { tag: true } };
  };
}>;

@Injectable()
export class TradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly defaultUser: DefaultUserService,
  ) {}

  private serializeTrade(trade: TradeWithRelations) {
    return {
      id: trade.id,
      accountId: trade.accountId,
      accountName: trade.account.name,
      accountCurrency: trade.account.currency,
      platform: trade.account.platform,
      externalId: trade.externalId,
      symbol: trade.symbol,
      direction: trade.direction,
      volume: formatPrice(new Decimal(trade.volume.toString())),
      openTime: trade.openTime.toISOString(),
      closeTime: trade.closeTime.toISOString(),
      holdingSeconds: trade.holdingSeconds,
      openPrice: formatPrice(new Decimal(trade.openPrice.toString())),
      closePrice: formatPrice(new Decimal(trade.closePrice.toString())),
      stopLoss: trade.stopLoss ? formatPrice(new Decimal(trade.stopLoss.toString())) : null,
      takeProfit: trade.takeProfit ? formatPrice(new Decimal(trade.takeProfit.toString())) : null,
      initialStopLoss: trade.initialStopLoss
        ? formatPrice(new Decimal(trade.initialStopLoss.toString()))
        : null,
      initialRiskAmount: trade.initialRiskAmount
        ? formatMoney(new Decimal(trade.initialRiskAmount.toString()))
        : null,
      rMultiple: trade.rMultiple ? formatR(new Decimal(trade.rMultiple.toString())) : null,
      isManualRisk: trade.isManualRisk,
      grossPnl: formatMoney(new Decimal(trade.grossPnl.toString())),
      commission: formatMoney(new Decimal(trade.commission.toString())),
      swap: formatMoney(new Decimal(trade.swap.toString())),
      netPnl: formatMoney(new Decimal(trade.netPnl.toString())),
      note: trade.note,
      preTradePlan: trade.preTradePlan,
      postTradeReview: trade.postTradeReview,
      screenshotUrl: trade.screenshotUrl,
      source: trade.source,
      tags: trade.tags.map((tt) => ({
        id: tt.tag.id,
        name: tt.tag.name,
        color: tt.tag.color,
      })),
      createdAt: trade.createdAt.toISOString(),
      updatedAt: trade.updatedAt.toISOString(),
    };
  }

  async findAll(query: TradeQueryInput) {
    const user = await this.defaultUser.getDefaultUser();
    const displayTz = user.displayTimezone || 'Asia/Ho_Chi_Minh';

    const where: Prisma.TradeWhereInput = {
      account: { userId: user.id },
    };

    if (query.accountId) {
      where.accountId = query.accountId;
    }

    if (query.symbol) {
      where.symbol = { equals: query.symbol, mode: 'insensitive' };
    }

    if (query.direction) {
      where.direction = query.direction as TradeDirection;
    }

    if (query.from || query.to) {
      where.closeTime = {
        ...(query.from ? { gte: parseFilterDateToUtc(query.from, displayTz, 'start') } : {}),
        ...(query.to ? { lte: parseFilterDateToUtc(query.to, displayTz, 'end') } : {}),
      };
    }

    if (query.tagIds && query.tagIds.length > 0) {
      where.tags = {
        some: {
          tagId: { in: query.tagIds },
        },
      };
    }

    if (query.search && query.search.trim().length > 0) {
      const term = query.search.trim();
      where.OR = [
        { symbol: { contains: term, mode: 'insensitive' } },
        { externalId: { contains: term, mode: 'insensitive' } },
        { note: { contains: term, mode: 'insensitive' } },
        { preTradePlan: { contains: term, mode: 'insensitive' } },
        { postTradeReview: { contains: term, mode: 'insensitive' } },
      ];
    }

    const skip = (query.page - 1) * query.limit;

    const [total, items] = await Promise.all([
      this.prisma.trade.count({ where }),
      this.prisma.trade.findMany({
        where,
        orderBy: [{ closeTime: 'desc' }, { id: 'desc' }],
        skip,
        take: query.limit,
        include: {
          account: { select: { id: true, name: true, currency: true, platform: true } },
          tags: { include: { tag: true } },
        },
      }),
    ]);

    return {
      items: items.map((t) => this.serializeTrade(t)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getDistinctSymbols(accountId?: string) {
    const user = await this.defaultUser.getDefaultUser();
    const rows = await this.prisma.trade.findMany({
      where: {
        account: { userId: user.id },
        ...(accountId ? { accountId } : {}),
      },
      distinct: ['symbol'],
      select: { symbol: true },
      orderBy: { symbol: 'asc' },
    });
    return rows.map((r) => r.symbol);
  }

  async findOne(id: string) {
    const trade = await this.prisma.trade.findUnique({
      where: { id },
      include: {
        account: { select: { id: true, name: true, currency: true, platform: true } },
        tags: { include: { tag: true } },
      },
    });
    if (!trade) {
      throw new NotFoundException(`Trade ${id} not found`);
    }
    return this.serializeTrade(trade);
  }

  async updateJournal(id: string, input: UpdateTradeJournalInput) {
    const existing = await this.prisma.trade.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Trade ${id} not found`);
    }

    const updateData: Prisma.TradeUpdateInput = {};

    if (input.note !== undefined) {
      updateData.note = input.note;
    }
    if (input.preTradePlan !== undefined) {
      updateData.preTradePlan = input.preTradePlan;
    }
    if (input.postTradeReview !== undefined) {
      updateData.postTradeReview = input.postTradeReview;
    }
    if (input.screenshotUrl !== undefined) {
      updateData.screenshotUrl = input.screenshotUrl;
    }

    const riskEdited =
      input.initialStopLoss !== undefined || input.initialRiskAmount !== undefined;

    if (riskEdited) {
      const nextInitialSl =
        input.initialStopLoss !== undefined
          ? toDecimal(input.initialStopLoss)
          : toDecimal(existing.initialStopLoss?.toString());

      const nextInitialRisk =
        input.initialRiskAmount !== undefined
          ? toDecimal(input.initialRiskAmount)
          : input.initialStopLoss !== undefined
            ? null
            : toDecimal(existing.initialRiskAmount?.toString());

      if (!nextInitialSl && !nextInitialRisk) {
        updateData.initialStopLoss = null;
        updateData.initialRiskAmount = null;
        updateData.rMultiple = null;
        updateData.isManualRisk = false;
      } else {
        const riskResult = calculateRiskAndRMultiple({
          direction: existing.direction,
          openPrice: new Decimal(existing.openPrice.toString()),
          closePrice: new Decimal(existing.closePrice.toString()),
          grossPnl: new Decimal(existing.grossPnl.toString()),
          netPnl: new Decimal(existing.netPnl.toString()),
          initialStopLoss: nextInitialSl,
          initialRiskAmount: nextInitialRisk,
        });

        updateData.initialStopLoss = riskResult.initialStopLoss
          ? new Prisma.Decimal(riskResult.initialStopLoss.toFixed(8))
          : null;
        updateData.initialRiskAmount = riskResult.initialRiskAmount
          ? new Prisma.Decimal(riskResult.initialRiskAmount.toFixed(2))
          : null;
        updateData.rMultiple = riskResult.rMultiple
          ? new Prisma.Decimal(riskResult.rMultiple.toFixed(4))
          : null;
        updateData.isManualRisk = true;
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.tagIds !== undefined) {
        const uniqueTagIds = Array.from(new Set(input.tagIds));
        await tx.tradeTag.deleteMany({ where: { tradeId: id } });
        if (uniqueTagIds.length > 0) {
          await tx.tradeTag.createMany({
            data: uniqueTagIds.map((tagId) => ({ tradeId: id, tagId })),
            skipDuplicates: true,
          });
        }
      }

      return tx.trade.update({
        where: { id },
        data: updateData,
        include: {
          account: { select: { id: true, name: true, currency: true, platform: true } },
          tags: { include: { tag: true } },
        },
      });
    });

    return this.serializeTrade(updated);
  }

  async remove(id: string) {
    const existing = await this.prisma.trade.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Trade ${id} not found`);
    }
    await this.prisma.trade.delete({ where: { id } });
    return { deleted: true, id };
  }
}
