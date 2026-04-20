// Freelance project board — backs /career-tools/ventures/freelance.
//
// v1 model: "payment off-platform, ratings on-platform". The post / bid /
// award / deliver / review loop happens here. Money changes hands off-
// platform (MoMo, bank, etc.) — escrow + Paystack/MoMo integration is
// deferred to v2 behind a feature flag.
//
// Surface (mounted at /api/freelance):
//   GET    /gigs                          public — filter + paginate gig list
//   GET    /gigs/:id                      optionalAuth — single gig (poster
//                                          sees all bids; non-posters see only
//                                          their own + a count)
//   POST   /gigs                          auth — create
//   PATCH  /gigs/:id                      auth + ownership — edit while OPEN
//   DELETE /gigs/:id                      auth + ownership — only OPEN w/o
//                                          bids, or already CANCELLED
//   POST   /gigs/:id/cancel               auth + ownership — set CANCELLED
//   POST   /gigs/:id/bids                 auth — place a bid (no self-bid)
//   PATCH  /bids/:id                      auth + ownership — edit own bid
//                                          while gig is OPEN
//   POST   /gigs/:id/award/:bidId         auth + gig-owner — award & notify
//   POST   /bids/:id/shortlist            auth + gig-owner — toggle shortlist
//   POST   /gigs/:id/start                auth + (owner|awarded) — AWARDED→
//                                          IN_PROGRESS
//   POST   /gigs/:id/complete             auth + (owner|awarded) — IN_PROGRESS
//                                          →COMPLETED. v1: either party can
//                                          mark complete; both still review
//   POST   /gigs/:id/review               auth + involved — leave a review
//   GET    /me/posted                     auth — caller's posted gigs
//   GET    /me/bids                       auth — caller's bids
//   GET    /users/:userId/reviews         public — reviews + computed avg

import { Router } from 'express';
import { z } from 'zod';
import { GigCategory, GigStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = Router();

// ---- shared zod ----------------------------------------------------------

const categoryEnum = z.nativeEnum(GigCategory);
const statusEnum = z.nativeEnum(GigStatus);

const gigCreateSchema = z
  .object({
    title: z.string().min(3).max(100),
    description: z.string().min(10).max(4000),
    category: categoryEnum,
    budgetMin: z.number().int().positive(),
    budgetMax: z.number().int().positive(),
    currency: z.enum(['GHS', 'USD']).default('GHS'),
    deadlineAt: z.string().datetime().nullable().optional(),
    skills: z.array(z.string().min(1).max(40)).max(20).default([])
  })
  .refine((v) => v.budgetMax >= v.budgetMin, {
    message: 'budgetMax must be >= budgetMin',
    path: ['budgetMax']
  });

const gigUpdateSchema = z
  .object({
    title: z.string().min(3).max(100).optional(),
    description: z.string().min(10).max(4000).optional(),
    category: categoryEnum.optional(),
    budgetMin: z.number().int().positive().optional(),
    budgetMax: z.number().int().positive().optional(),
    currency: z.enum(['GHS', 'USD']).optional(),
    deadlineAt: z.string().datetime().nullable().optional(),
    skills: z.array(z.string().min(1).max(40)).max(20).optional()
  })
  .refine(
    (v) => v.budgetMin === undefined || v.budgetMax === undefined || v.budgetMax >= v.budgetMin,
    { message: 'budgetMax must be >= budgetMin', path: ['budgetMax'] }
  );

const bidCreateSchema = z.object({
  coverNote: z.string().min(10).max(2000),
  priceAmount: z.number().int().positive(),
  currency: z.enum(['GHS', 'USD']).default('GHS'),
  deliveryDays: z.number().int().positive().max(365)
});

const bidUpdateSchema = bidCreateSchema.partial();

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).nullable().optional()
});

// ---- helpers -------------------------------------------------------------

const POSTER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatar: true,
  programme: true,
  graduationYear: true
} as const;

function notFound(res: any, message = 'Not found') {
  return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message } });
}

function forbid(res: any, message = 'Forbidden') {
  return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message } });
}

function badRequest(res: any, message: string, code = 'BAD_REQUEST') {
  return res.status(400).json({ success: false, error: { code, message } });
}

// ---- /gigs (browse) ------------------------------------------------------

router.get('/gigs', async (req, res, next) => {
  try {
    const {
      category, minBudget, maxBudget, skill, status, sort, page, limit
    } = req.query as Record<string, string | undefined>;

    const where: Record<string, unknown> = {};
    if (category && (Object.values(GigCategory) as string[]).includes(category)) {
      where.category = category;
    }
    if (status && (Object.values(GigStatus) as string[]).includes(status)) {
      where.status = status;
    } else {
      // Default: hide cancelled gigs from the public board
      where.status = { not: 'CANCELLED' as GigStatus };
    }
    if (skill) where.skills = { has: skill.toLowerCase() };

    // Budget overlap: a gig matches if its [budgetMin..budgetMax] intersects
    // the requested [minBudget..maxBudget] window.
    const min = minBudget ? Number(minBudget) : undefined;
    const max = maxBudget ? Number(maxBudget) : undefined;
    if (Number.isFinite(min)) where.budgetMax = { gte: min };
    if (Number.isFinite(max)) where.budgetMin = { lte: max };

    const orderBy =
      sort === 'deadline'
        ? [{ deadlineAt: 'asc' as const }, { createdAt: 'desc' as const }]
        : [{ createdAt: 'desc' as const }];

    const pageNum = Math.max(1, Number(page) || 1);
    const lim = Math.min(50, Math.max(1, Number(limit) || 20));

    const [items, total] = await Promise.all([
      prisma.freelanceGig.findMany({
        where,
        orderBy,
        skip: (pageNum - 1) * lim,
        take: lim,
        include: {
          poster: { select: POSTER_SELECT },
          _count: { select: { bids: true } }
        }
      }),
      prisma.freelanceGig.count({ where })
    ]);

    res.json({
      success: true,
      data: { items, total, page: pageNum, limit: lim }
    });
  } catch (e) { next(e); }
});

// ---- /me/* (must be defined before /gigs/:id) ---------------------------

router.get('/me/posted', requireAuth, async (req, res, next) => {
  try {
    const items = await prisma.freelanceGig.findMany({
      where: { posterId: req.auth!.sub },
      orderBy: { createdAt: 'desc' },
      include: {
        poster: { select: POSTER_SELECT },
        _count: { select: { bids: true } }
      }
    });
    res.json({ success: true, data: items });
  } catch (e) { next(e); }
});

router.get('/me/bids', requireAuth, async (req, res, next) => {
  try {
    const bids = await prisma.freelanceBid.findMany({
      where: { bidderId: req.auth!.sub },
      orderBy: { createdAt: 'desc' },
      include: {
        gig: {
          include: {
            poster: { select: POSTER_SELECT },
            _count: { select: { bids: true } }
          }
        }
      }
    });
    res.json({ success: true, data: bids });
  } catch (e) { next(e); }
});

// ---- /gigs/:id -----------------------------------------------------------

router.get('/gigs/:id', optionalAuth, async (req, res, next) => {
  try {
    const callerId = req.auth?.sub ?? null;

    const gig = await prisma.freelanceGig.findUnique({
      where: { id: req.params.id },
      include: {
        poster: { select: POSTER_SELECT },
        _count: { select: { bids: true } }
      }
    });
    if (!gig) return notFound(res, 'Gig not found');

    const isPoster = !!callerId && callerId === gig.posterId;

    let bids: any[] = [];
    let myBid: any = null;
    if (isPoster) {
      bids = await prisma.freelanceBid.findMany({
        where: { gigId: gig.id },
        orderBy: [{ isShortlisted: 'desc' }, { createdAt: 'asc' }],
        include: { bidder: { select: POSTER_SELECT } }
      });
    } else if (callerId) {
      myBid = await prisma.freelanceBid.findUnique({
        where: { gigId_bidderId: { gigId: gig.id, bidderId: callerId } }
      });
    }

    res.json({
      success: true,
      data: {
        ...gig,
        bidCount: gig._count.bids,
        bids: isPoster ? bids : undefined,
        myBid: !isPoster ? myBid : undefined
      }
    });
  } catch (e) { next(e); }
});

router.post('/gigs', requireAuth, async (req, res, next) => {
  try {
    const parsed = gigCreateSchema.parse(req.body);
    const gig = await prisma.freelanceGig.create({
      data: {
        posterId: req.auth!.sub,
        title: parsed.title.trim(),
        description: parsed.description.trim(),
        category: parsed.category,
        budgetMin: parsed.budgetMin,
        budgetMax: parsed.budgetMax,
        currency: parsed.currency,
        deadlineAt: parsed.deadlineAt ? new Date(parsed.deadlineAt) : null,
        skills: parsed.skills.map((s) => s.trim().toLowerCase()).filter(Boolean)
      },
      include: { poster: { select: POSTER_SELECT } }
    });
    res.status(201).json({ success: true, data: gig });
  } catch (e) { next(e); }
});

router.patch('/gigs/:id', requireAuth, async (req, res, next) => {
  try {
    const parsed = gigUpdateSchema.parse(req.body);
    const gig = await prisma.freelanceGig.findUnique({ where: { id: req.params.id } });
    if (!gig) return notFound(res, 'Gig not found');
    if (gig.posterId !== req.auth!.sub) return forbid(res, 'Only the poster can edit this gig');
    if (gig.status !== 'OPEN') return badRequest(res, 'Only OPEN gigs can be edited', 'INVALID_STATE');

    const updated = await prisma.freelanceGig.update({
      where: { id: gig.id },
      data: {
        ...(parsed.title !== undefined ? { title: parsed.title.trim() } : {}),
        ...(parsed.description !== undefined ? { description: parsed.description.trim() } : {}),
        ...(parsed.category !== undefined ? { category: parsed.category } : {}),
        ...(parsed.budgetMin !== undefined ? { budgetMin: parsed.budgetMin } : {}),
        ...(parsed.budgetMax !== undefined ? { budgetMax: parsed.budgetMax } : {}),
        ...(parsed.currency !== undefined ? { currency: parsed.currency } : {}),
        ...(parsed.deadlineAt !== undefined
          ? { deadlineAt: parsed.deadlineAt ? new Date(parsed.deadlineAt) : null }
          : {}),
        ...(parsed.skills !== undefined
          ? { skills: parsed.skills.map((s) => s.trim().toLowerCase()).filter(Boolean) }
          : {})
      }
    });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

router.delete('/gigs/:id', requireAuth, async (req, res, next) => {
  try {
    const gig = await prisma.freelanceGig.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { bids: true } } }
    });
    if (!gig) return notFound(res, 'Gig not found');
    if (gig.posterId !== req.auth!.sub) return forbid(res, 'Only the poster can delete this gig');
    const deletable =
      gig.status === 'CANCELLED' || (gig.status === 'OPEN' && gig._count.bids === 0);
    if (!deletable) {
      return badRequest(
        res,
        'Only OPEN gigs without bids, or cancelled gigs, can be deleted',
        'INVALID_STATE'
      );
    }

    await prisma.freelanceGig.delete({ where: { id: gig.id } });
    res.json({ success: true, data: { id: gig.id } });
  } catch (e) { next(e); }
});

router.post('/gigs/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const gig = await prisma.freelanceGig.findUnique({ where: { id: req.params.id } });
    if (!gig) return notFound(res, 'Gig not found');
    if (gig.posterId !== req.auth!.sub) return forbid(res, 'Only the poster can cancel');
    if (gig.status === 'COMPLETED') return badRequest(res, 'Completed gigs cannot be cancelled', 'INVALID_STATE');

    const updated = await prisma.freelanceGig.update({
      where: { id: gig.id },
      data: { status: 'CANCELLED' }
    });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// ---- /gigs/:id/bids ------------------------------------------------------

router.post('/gigs/:id/bids', requireAuth, async (req, res, next) => {
  try {
    const parsed = bidCreateSchema.parse(req.body);
    const gig = await prisma.freelanceGig.findUnique({ where: { id: req.params.id } });
    if (!gig) return notFound(res, 'Gig not found');
    if (gig.status !== 'OPEN') return badRequest(res, 'This gig is not open for bids', 'INVALID_STATE');
    if (gig.posterId === req.auth!.sub) return forbid(res, 'You cannot bid on your own gig');

    const bid = await prisma.freelanceBid.create({
      data: {
        gigId: gig.id,
        bidderId: req.auth!.sub,
        coverNote: parsed.coverNote.trim(),
        priceAmount: parsed.priceAmount,
        currency: parsed.currency,
        deliveryDays: parsed.deliveryDays
      },
      include: { bidder: { select: POSTER_SELECT } }
    });

    // Notify the poster a bid landed.
    await prisma.notification.create({
      data: {
        userId: gig.posterId,
        type: 'OPPORTUNITY_MATCH',
        title: 'New bid on your gig',
        message: `Someone bid ${bid.currency} ${bid.priceAmount} on "${gig.title}"`,
        link: `/career-tools/ventures/freelance?gig=${gig.id}`
      }
    });

    res.status(201).json({ success: true, data: bid });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: { code: 'ALREADY_BID', message: 'You already bid on this gig — edit it instead' }
      });
    }
    next(e);
  }
});

router.patch('/bids/:id', requireAuth, async (req, res, next) => {
  try {
    const parsed = bidUpdateSchema.parse(req.body);
    const bid = await prisma.freelanceBid.findUnique({
      where: { id: req.params.id },
      include: { gig: { select: { status: true } } }
    });
    if (!bid) return notFound(res, 'Bid not found');
    if (bid.bidderId !== req.auth!.sub) return forbid(res, 'You can only edit your own bid');
    if (bid.gig.status !== 'OPEN') {
      return badRequest(res, 'Bids can only be edited while the gig is open', 'INVALID_STATE');
    }

    const updated = await prisma.freelanceBid.update({
      where: { id: bid.id },
      data: {
        ...(parsed.coverNote !== undefined ? { coverNote: parsed.coverNote.trim() } : {}),
        ...(parsed.priceAmount !== undefined ? { priceAmount: parsed.priceAmount } : {}),
        ...(parsed.currency !== undefined ? { currency: parsed.currency } : {}),
        ...(parsed.deliveryDays !== undefined ? { deliveryDays: parsed.deliveryDays } : {})
      }
    });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

router.post('/bids/:id/shortlist', requireAuth, async (req, res, next) => {
  try {
    const bid = await prisma.freelanceBid.findUnique({
      where: { id: req.params.id },
      include: { gig: { select: { posterId: true, status: true } } }
    });
    if (!bid) return notFound(res, 'Bid not found');
    if (bid.gig.posterId !== req.auth!.sub) return forbid(res, 'Only the poster can shortlist');
    if (bid.gig.status !== 'OPEN') return badRequest(res, 'Gig is no longer open', 'INVALID_STATE');

    const updated = await prisma.freelanceBid.update({
      where: { id: bid.id },
      data: { isShortlisted: !bid.isShortlisted }
    });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

router.post('/gigs/:id/award/:bidId', requireAuth, async (req, res, next) => {
  try {
    const gig = await prisma.freelanceGig.findUnique({ where: { id: req.params.id } });
    if (!gig) return notFound(res, 'Gig not found');
    if (gig.posterId !== req.auth!.sub) return forbid(res, 'Only the poster can award');
    if (gig.status !== 'OPEN') return badRequest(res, 'Only OPEN gigs can be awarded', 'INVALID_STATE');

    const bid = await prisma.freelanceBid.findUnique({ where: { id: req.params.bidId } });
    if (!bid || bid.gigId !== gig.id) return notFound(res, 'Bid not found for this gig');

    const [, updatedGig] = await prisma.$transaction([
      prisma.freelanceBid.update({
        where: { id: bid.id },
        data: { isAwarded: true, isShortlisted: true }
      }),
      prisma.freelanceGig.update({
        where: { id: gig.id },
        data: { status: 'AWARDED', awardedBidId: bid.id }
      })
    ]);

    await prisma.notification.create({
      data: {
        userId: bid.bidderId,
        type: 'OPPORTUNITY_MATCH',
        title: 'Your bid was awarded',
        message: `Your bid on "${gig.title}" was selected. Reach out to the poster to begin.`,
        link: `/career-tools/ventures/freelance?gig=${gig.id}`
      }
    });

    res.json({ success: true, data: updatedGig });
  } catch (e) { next(e); }
});

// Status transitions: AWARDED → IN_PROGRESS → COMPLETED.

router.post('/gigs/:id/start', requireAuth, async (req, res, next) => {
  try {
    const gig = await prisma.freelanceGig.findUnique({
      where: { id: req.params.id },
      include: { bids: { where: { isAwarded: true }, select: { bidderId: true } } }
    });
    if (!gig) return notFound(res, 'Gig not found');
    const awardedBidderId = gig.bids[0]?.bidderId ?? null;
    const isInvolved = gig.posterId === req.auth!.sub || awardedBidderId === req.auth!.sub;
    if (!isInvolved) return forbid(res, 'Only the poster or awarded freelancer can start');
    if (gig.status !== 'AWARDED') return badRequest(res, 'Gig is not in AWARDED state', 'INVALID_STATE');

    const updated = await prisma.freelanceGig.update({
      where: { id: gig.id },
      data: { status: 'IN_PROGRESS' }
    });
    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

router.post('/gigs/:id/complete', requireAuth, async (req, res, next) => {
  try {
    const gig = await prisma.freelanceGig.findUnique({
      where: { id: req.params.id },
      include: { bids: { where: { isAwarded: true }, select: { bidderId: true } } }
    });
    if (!gig) return notFound(res, 'Gig not found');
    const awardedBidderId = gig.bids[0]?.bidderId ?? null;
    const isPoster = gig.posterId === req.auth!.sub;
    const isAwarded = awardedBidderId === req.auth!.sub;
    if (!isPoster && !isAwarded) return forbid(res, 'Only the poster or awarded freelancer can mark complete');
    if (gig.status !== 'IN_PROGRESS' && gig.status !== 'AWARDED') {
      return badRequest(res, 'Gig must be AWARDED or IN_PROGRESS to complete', 'INVALID_STATE');
    }

    const updated = await prisma.freelanceGig.update({
      where: { id: gig.id },
      data: { status: 'COMPLETED' }
    });

    // Notify the *other* party so they know to leave a review.
    const otherUserId = isPoster ? awardedBidderId : gig.posterId;
    if (otherUserId) {
      await prisma.notification.create({
        data: {
          userId: otherUserId,
          type: 'APPLICATION_UPDATE',
          title: 'Gig marked complete',
          message: `"${gig.title}" was marked complete. Leave a review to close the loop.`,
          link: `/career-tools/ventures/freelance?gig=${gig.id}`
        }
      });
    }

    res.json({ success: true, data: updated });
  } catch (e) { next(e); }
});

// ---- /gigs/:id/review ----------------------------------------------------

router.post('/gigs/:id/review', requireAuth, async (req, res, next) => {
  try {
    const parsed = reviewSchema.parse(req.body);
    const callerId = req.auth!.sub;

    const gig = await prisma.freelanceGig.findUnique({
      where: { id: req.params.id },
      include: { bids: { where: { isAwarded: true }, select: { bidderId: true } } }
    });
    if (!gig) return notFound(res, 'Gig not found');
    if (gig.status !== 'COMPLETED') {
      return badRequest(res, 'Reviews can only be left after the gig is COMPLETED', 'INVALID_STATE');
    }
    const awardedBidderId = gig.bids[0]?.bidderId ?? null;
    const isPoster = callerId === gig.posterId;
    const isFreelancer = callerId === awardedBidderId;
    if (!isPoster && !isFreelancer) return forbid(res, 'Only the poster or awarded freelancer can review');
    if (!awardedBidderId) return badRequest(res, 'No awarded freelancer on this gig', 'INVALID_STATE');

    const revieweeId = isPoster ? awardedBidderId : gig.posterId;
    const role = isPoster ? 'POSTER' : 'FREELANCER';

    const review = await prisma.freelanceReview.create({
      data: {
        gigId: gig.id,
        reviewerId: callerId,
        revieweeId,
        role,
        rating: parsed.rating,
        comment: parsed.comment ?? null
      }
    });

    await prisma.notification.create({
      data: {
        userId: revieweeId,
        type: 'APPLICATION_UPDATE',
        title: 'You received a review',
        message: `${parsed.rating}/5 on "${gig.title}"`,
        link: `/career-tools/ventures/freelance?gig=${gig.id}`
      }
    });

    res.status(201).json({ success: true, data: review });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return res.status(409).json({
        success: false,
        error: { code: 'ALREADY_REVIEWED', message: 'You already reviewed this gig' }
      });
    }
    next(e);
  }
});

// ---- public reviews ------------------------------------------------------

router.get('/users/:userId/reviews', async (req, res, next) => {
  try {
    const reviews = await prisma.freelanceReview.findMany({
      where: { revieweeId: req.params.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        reviewer: { select: POSTER_SELECT }
      }
    });
    const total = reviews.length;
    const avg = total
      ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / total) * 10) / 10
      : 0;
    res.json({
      success: true,
      data: { items: reviews, total, averageRating: avg }
    });
  } catch (e) { next(e); }
});

export default router;
