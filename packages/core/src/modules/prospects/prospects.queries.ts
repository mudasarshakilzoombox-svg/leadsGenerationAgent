// Read models for leads, companies, contacts, lead lists and ICPs (Phase 1-2 records, read-only).
import { Inject, Injectable } from '@nestjs/common';
import type {
  CompanyDetail,
  CompanyItem,
  ContactDetail,
  ContactItem,
  IcpOverview,
  LeadItem,
  LeadListDetail,
  ListQuery,
} from '@lga/contracts';
import { APP_CONFIG } from '../../config/config.module.js';
import type { ApiEnv } from '../../config/env.js';
import { DomainError } from '../../errors/domain-error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { afterDesc, decodeCursor, pageOf } from '../../platform/pagination/cursor.js';
import type { WorkspaceAccess } from '../../tenancy/workspace-access.service.js';

export interface PageResult<T> {
  data: T[];
  nextCursor: string | null;
}

const insensitive = (q: string) => ({ contains: q, mode: 'insensitive' as const });

const leadSelect = {
  id: true,
  stage: true,
  tier: true,
  score: true,
  scoredAt: true,
  createdAt: true,
  icp: { select: { id: true, name: true } },
  contact: {
    select: {
      id: true,
      fullName: true,
      email: true,
      title: true,
      emailStatus: true,
      company: { select: { id: true, name: true, domain: true } },
    },
  },
} satisfies Prisma.LeadSelect;

type LeadRow = Prisma.LeadGetPayload<{ select: typeof leadSelect }>;

function toLead(l: LeadRow): LeadItem {
  return {
    id: l.id,
    stage: l.stage,
    tier: l.tier,
    score: l.score,
    scoredAt: l.scoredAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    icp: l.icp,
    contact: {
      id: l.contact.id,
      fullName: l.contact.fullName,
      email: l.contact.email,
      title: l.contact.title,
      emailStatus: l.contact.emailStatus,
    },
    company: l.contact.company,
  };
}

const contactSelect = {
  id: true,
  fullName: true,
  title: true,
  seniority: true,
  email: true,
  emailStatus: true,
  country: true,
  status: true,
  createdAt: true,
  company: { select: { id: true, name: true } },
} satisfies Prisma.ContactSelect;

type ContactRow = Prisma.ContactGetPayload<{ select: typeof contactSelect }>;

function toContact(c: ContactRow): ContactItem {
  return { ...c, createdAt: c.createdAt.toISOString() };
}

const provenanceSelect = {
  field: true,
  observedAt: true,
  dataSource: { select: { provider: true, type: true, lawfulBasis: true, retrievedAt: true } },
} satisfies Prisma.FieldProvenanceSelect;

function toProvenance(p: Prisma.FieldProvenanceGetPayload<{ select: typeof provenanceSelect }>) {
  return {
    field: p.field,
    provider: p.dataSource.provider,
    sourceType: p.dataSource.type,
    lawfulBasis: p.dataSource.lawfulBasis,
    retrievedAt: p.dataSource.retrievedAt.toISOString(),
    observedAt: p.observedAt.toISOString(),
  };
}

const notFound = (what: string) => new DomainError('NOT_FOUND', `${what} not found.`);

@Injectable()
export class ProspectsQueries {
  constructor(@Inject(APP_CONFIG) private readonly env: ApiEnv) {}

  private get secret(): string {
    return this.env.SESSION_PEPPER;
  }

  async leads(
    access: WorkspaceAccess,
    query: ListQuery & {
      tier?: string | undefined;
      stage?: string | undefined;
      icpId?: string | undefined;
    },
  ): Promise<PageResult<LeadItem>> {
    const position = decodeCursor(query.cursor, this.secret);
    const where: Prisma.LeadWhereInput = {
      AND: [
        afterDesc('createdAt', position),
        query.tier ? { tier: query.tier as LeadRow['tier'] & string } : {},
        query.stage ? { stage: query.stage as LeadRow['stage'] } : {},
        query.icpId ? { icpId: query.icpId } : {},
        { contact: { deletedAt: null } },
        query.q
          ? {
              OR: [
                { contact: { fullName: insensitive(query.q) } },
                { contact: { email: insensitive(query.q) } },
                { contact: { company: { name: insensitive(query.q) } } },
              ],
            }
          : {},
      ],
    };
    const rows = await access.db.lead.findMany({
      where,
      select: leadSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = pageOf(rows, query.limit, (r) => r.createdAt, this.secret);
    return { data: page.rows.map(toLead), nextCursor: page.nextCursor };
  }

  async companies(access: WorkspaceAccess, query: ListQuery): Promise<PageResult<CompanyItem>> {
    const position = decodeCursor(query.cursor, this.secret);
    const rows = await access.db.company.findMany({
      where: {
        AND: [
          { deletedAt: null },
          afterDesc('createdAt', position),
          query.q ? { OR: [{ name: insensitive(query.q) }, { domain: insensitive(query.q) }] } : {},
        ],
      },
      select: {
        id: true,
        name: true,
        domain: true,
        industry: true,
        employeeRange: true,
        hqCountry: true,
        status: true,
        createdAt: true,
        _count: { select: { contacts: { where: { deletedAt: null } } } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = pageOf(rows, query.limit, (r) => r.createdAt, this.secret);
    return {
      data: page.rows.map(({ _count, ...c }) => ({
        ...c,
        contactsCount: _count.contacts,
        createdAt: c.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }

  async company(access: WorkspaceAccess, companyId: string): Promise<CompanyDetail> {
    const c = await access.db.company.findFirst({
      where: { id: companyId, deletedAt: null },
      include: {
        contacts: {
          where: { deletedAt: null },
          select: contactSelect,
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
        fieldProvenance: { select: provenanceSelect, orderBy: { observedAt: 'desc' } },
      },
    });
    if (!c) throw notFound('Company');
    return {
      id: c.id,
      name: c.name,
      domain: c.domain,
      industry: c.industry,
      employeeRange: c.employeeRange,
      employeeCount: c.employeeCount,
      hqCountry: c.hqCountry,
      status: c.status,
      websiteUrl: c.websiteUrl,
      description: c.description,
      technologies: c.technologies,
      fundingStage: c.fundingStage,
      contactsCount: c.contacts.length,
      createdAt: c.createdAt.toISOString(),
      contacts: c.contacts.map(toContact),
      provenance: c.fieldProvenance.map(toProvenance),
    };
  }

  async contacts(
    access: WorkspaceAccess,
    query: ListQuery & { emailStatus?: string | undefined },
  ): Promise<PageResult<ContactItem>> {
    const position = decodeCursor(query.cursor, this.secret);
    const rows = await access.db.contact.findMany({
      where: {
        AND: [
          { deletedAt: null },
          afterDesc('createdAt', position),
          query.emailStatus ? { emailStatus: query.emailStatus as ContactRow['emailStatus'] } : {},
          query.q
            ? {
                OR: [
                  { fullName: insensitive(query.q) },
                  { email: insensitive(query.q) },
                  { title: insensitive(query.q) },
                ],
              }
            : {},
        ],
      },
      select: contactSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = pageOf(rows, query.limit, (r) => r.createdAt, this.secret);
    return { data: page.rows.map(toContact), nextCursor: page.nextCursor };
  }

  async contact(access: WorkspaceAccess, contactId: string): Promise<ContactDetail> {
    const c = await access.db.contact.findFirst({
      where: { id: contactId, deletedAt: null },
      select: {
        ...contactSelect,
        linkedinUrl: true,
        timezone: true,
        lawfulBasis: true,
        source: true,
        fieldProvenance: { select: provenanceSelect, orderBy: { observedAt: 'desc' } },
        leads: {
          select: {
            id: true,
            stage: true,
            tier: true,
            score: true,
            icp: { select: { name: true } },
            scores: { select: { breakdown: true }, orderBy: { computedAt: 'desc' }, take: 1 },
            activities: {
              select: { id: true, type: true, occurredAt: true },
              orderBy: { occurredAt: 'desc' },
              take: 50,
            },
          },
        },
      },
    });
    if (!c) throw notFound('Contact');
    const { fieldProvenance, leads, linkedinUrl, timezone, lawfulBasis, source, ...item } = c;
    return {
      ...toContact(item),
      linkedinUrl,
      timezone,
      lawfulBasis,
      source,
      provenance: fieldProvenance.map(toProvenance),
      leads: leads.map((l) => {
        const breakdown = l.scores[0]?.breakdown as { reasons?: unknown } | undefined;
        const reasons = Array.isArray(breakdown?.reasons)
          ? breakdown.reasons.filter((r): r is string => typeof r === 'string')
          : [];
        return {
          id: l.id,
          icpName: l.icp.name,
          stage: l.stage,
          tier: l.tier,
          score: l.score,
          reasons,
        };
      }),
      activity: leads
        .flatMap((l) => l.activities)
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
        .map((a) => ({ id: a.id, type: a.type, occurredAt: a.occurredAt.toISOString() })),
    };
  }

  async leadLists(access: WorkspaceAccess) {
    const rows = await access.db.leadList.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      data: rows.map(({ _count, ...l }) => ({
        ...l,
        membersCount: _count.members,
        createdAt: l.createdAt.toISOString(),
      })),
      nextCursor: null,
    };
  }

  async leadList(access: WorkspaceAccess, listId: string): Promise<LeadListDetail> {
    const list = await access.db.leadList.findFirst({
      where: { id: listId, deletedAt: null },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        members: {
          select: { lead: { select: leadSelect } },
          orderBy: { addedAt: 'desc' },
          take: 200,
        },
      },
    });
    if (!list) throw notFound('Lead list');
    return {
      id: list.id,
      name: list.name,
      description: list.description,
      createdAt: list.createdAt.toISOString(),
      membersCount: list.members.length,
      leads: list.members.map((m) => toLead(m.lead)),
    };
  }

  async icps(access: WorkspaceAccess): Promise<IcpOverview> {
    const profiles = await access.db.businessProfile.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        domain: true,
        status: true,
        summary: true,
        icps: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            name: true,
            status: true,
            version: true,
            firmographics: true,
            painPoints: true,
            rationale: true,
            _count: { select: { leads: true } },
            targetSegments: {
              select: { id: true, name: true, titleKeywords: true, seniorities: true },
              orderBy: { priority: 'asc' },
            },
          },
        },
      },
    });
    return {
      profiles: profiles.map((p) => ({
        ...p,
        icps: p.icps.map(({ _count, targetSegments, firmographics, painPoints, ...icp }) => ({
          ...icp,
          firmographics: (firmographics ?? {}) as Record<string, unknown>,
          painPoints: Array.isArray(painPoints)
            ? painPoints.filter((x): x is string => typeof x === 'string')
            : [],
          leadsCount: _count.leads,
          segments: targetSegments,
        })),
      })),
    };
  }
}
