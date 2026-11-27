'use client';

import {
  type CompanyDetail,
  type CompanyItem,
  CompanyItemSchema,
  type ContactDetail,
  type ContactItem,
  ContactItemSchema,
  type IcpOverview,
  type LeadItem,
  LeadItemSchema,
  type LeadListDetail,
} from '@lga/contracts';
import { Badge } from '@lga/ui/components/badge';
import { Button } from '@lga/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@lga/ui/components/card';
import { Building2, FileUp, ListChecks, Plus, Search, Sparkles, Target, Users } from 'lucide-react';
import { useState } from 'react';
import {
  type Column,
  DataTable,
  DetailList,
  FilterPills,
  LoadMore,
  PageHeader,
  ScoreBadge,
  SearchInput,
  StatusBadge,
} from '@/components/data';
import { ComingSoon, EmptyState, ErrorPanel, PhaseNote, TableSkeleton } from '@/components/states';
import { formatDate, formatDateTime, formatRelative, humanize } from '@/lib/format';
import { PHASE } from '@/lib/navigation';
import { useWorkspaceList } from '@/lib/use-list';
import { useWorkspace } from '@/lib/workspace-context';

type Initial<T> = { data: T[]; nextCursor: string | null };

/** What a list body needs from `useWorkspaceList`. */
export interface ListQueryState<T> {
  rows: T[];
  isPending: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  refetch: () => unknown;
  fetchNextPage: () => unknown;
}

function ListBody<T extends { id: string }>({
  query,
  columns,
  caption,
  href,
  empty,
  filtered,
  onClear,
}: {
  query: ListQueryState<T>;
  columns: Column<T>[];
  caption: string;
  href?: (row: T) => string;
  empty: React.ReactNode;
  filtered: boolean;
  onClear: () => void;
}) {
  if (query.isPending) return <TableSkeleton columns={Math.min(columns.length, 6)} />;
  if (query.isError) return <ErrorPanel onRetry={() => void query.refetch()} />;
  if (query.rows.length === 0) {
    return filtered ? (
      <EmptyState
        icon={Search}
        title="No results match your filters"
        description="Try a different search or clear the filters."
        action={
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        }
      />
    ) : (
      empty
    );
  }
  return (
    <DataTable
      columns={columns}
      rows={query.rows}
      caption={caption}
      {...(href ? { href } : {})}
      footer={
        <LoadMore
          hasMore={Boolean(query.hasNextPage)}
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        />
      }
    />
  );
}

// ------------------------------------------------------------------ leads (Find Leads)

const leadColumns: Column<LeadItem>[] = [
  {
    key: 'name',
    header: 'Lead',
    mobile: 'title',
    cell: (l) => l.contact.fullName ?? l.contact.email ?? 'Unnamed contact',
  },
  {
    key: 'title',
    header: 'Title',
    mobile: 'subtitle',
    priority: 2,
    cell: (l) => <span className="text-muted-foreground">{l.contact.title ?? '—'}</span>,
  },
  { key: 'company', header: 'Company', mobile: 'meta', cell: (l) => l.company?.name ?? '—' },
  {
    key: 'score',
    header: 'Score',
    mobile: 'meta',
    cell: (l) => <ScoreBadge tier={l.tier} score={l.score} />,
  },
  {
    key: 'stage',
    header: 'Stage',
    priority: 2,
    mobile: 'meta',
    cell: (l) => <StatusBadge status={l.stage} />,
  },
  {
    key: 'email',
    header: 'Email status',
    priority: 3,
    cell: (l) => <StatusBadge status={l.contact.emailStatus} />,
  },
  {
    key: 'icp',
    header: 'ICP',
    priority: 3,
    cell: (l) => <span className="text-muted-foreground">{l.icp.name}</span>,
  },
  {
    key: 'added',
    header: 'Added',
    priority: 3,
    align: 'right',
    cell: (l) => <span className="text-muted-foreground">{formatRelative(l.createdAt)}</span>,
  },
];

export function FindLeadsView({ initial }: { initial: Initial<LeadItem> }) {
  const { href } = useWorkspace();
  const [tier, setTier] = useState<'' | 'A' | 'B' | 'C' | 'D'>('');
  const [q, setQ] = useState('');
  const params = { tier: tier || undefined, q: q || undefined };
  const query = useWorkspaceList('leads', LeadItemSchema, params, {
    ...initial,
    params: { tier: undefined, q: undefined },
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Find Leads"
        description="Scored prospects that match your ideal customer profiles."
        actions={
          <>
            <ComingSoon
              phase={PHASE.import}
              label="Import CSV"
              icon={FileUp}
              reason="CSV import with lawful-basis attestation."
            />
            <ComingSoon
              phase={PHASE.discovery}
              label="Run discovery"
              icon={Sparkles}
              variant="default"
              reason="Search approved data providers with your ICP filters."
            />
          </>
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={q} onChange={setQ} placeholder="Search name, email or company" />
        <FilterPills
          label="Tier"
          value={tier}
          onChange={setTier}
          options={[
            { value: '', label: 'All tiers' },
            { value: 'A', label: 'Tier A' },
            { value: 'B', label: 'Tier B' },
            { value: 'C', label: 'Tier C' },
            { value: 'D', label: 'Tier D' },
          ]}
        />
      </div>
      <ListBody
        query={query}
        columns={leadColumns}
        caption="Leads"
        href={(l: LeadItem) => href(`contacts/${l.contact.id}`)}
        filtered={Boolean(tier || q)}
        onClear={() => {
          setTier('');
          setQ('');
        }}
        empty={
          <EmptyState
            icon={Search}
            title="Leads you discover will appear here"
            description="Add leads by searching approved providers with your ICP or by importing a CSV."
            action={<ComingSoon phase={PHASE.discovery} label="Run discovery" variant="default" />}
            secondary={<ComingSoon phase={PHASE.import} label="Import CSV" />}
          />
        }
      />
    </div>
  );
}

// ------------------------------------------------------------------ companies

const companyColumns: Column<CompanyItem>[] = [
  { key: 'name', header: 'Company', mobile: 'title', cell: (c) => c.name },
  {
    key: 'domain',
    header: 'Domain',
    mobile: 'subtitle',
    cell: (c) => <span className="text-muted-foreground">{c.domain}</span>,
  },
  {
    key: 'industry',
    header: 'Industry',
    priority: 2,
    mobile: 'meta',
    cell: (c) => c.industry ?? '—',
  },
  { key: 'size', header: 'Employees', priority: 2, cell: (c) => c.employeeRange ?? '—' },
  { key: 'country', header: 'Country', priority: 3, cell: (c) => c.hqCountry ?? '—' },
  {
    key: 'contacts',
    header: 'Contacts',
    align: 'right',
    mobile: 'meta',
    cell: (c) => `${c.contactsCount}`,
  },
];

export function CompaniesView({ initial }: { initial: Initial<CompanyItem> }) {
  const { href } = useWorkspace();
  const [q, setQ] = useState('');
  const query = useWorkspaceList(
    'companies',
    CompanyItemSchema,
    { q: q || undefined },
    { ...initial, params: { q: undefined } },
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Companies"
        description="Accounts in this workspace, with where each detail came from."
        actions={<ComingSoon phase={PHASE.import} label="Add company" icon={Plus} />}
      />
      <SearchInput value={q} onChange={setQ} placeholder="Search company or domain" />
      <ListBody
        query={query}
        columns={companyColumns}
        caption="Companies"
        href={(c: CompanyItem) => href(`companies/${c.id}`)}
        filtered={Boolean(q)}
        onClear={() => setQ('')}
        empty={
          <EmptyState
            icon={Building2}
            title="Companies you add will appear here"
            description="Companies are created when you discover or import leads."
            action={<ComingSoon phase={PHASE.discovery} label="Run discovery" variant="default" />}
          />
        }
      />
    </div>
  );
}

function ProvenanceTable({ rows }: { rows: CompanyDetail['provenance'] }) {
  if (rows.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No source has been recorded for these fields yet.
      </p>
    );
  return (
    <ul className="divide-y text-sm">
      {rows.map((p) => (
        <li
          key={`${p.field}-${p.observedAt}`}
          className="flex flex-wrap items-center justify-between gap-2 py-2"
        >
          <span className="font-medium">{humanize(p.field)}</span>
          <span className="text-muted-foreground">
            {p.provider} · {humanize(p.lawfulBasis)} · {formatDate(p.retrievedAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CompanyDetailView({ company }: { company: CompanyDetail }) {
  const { href } = useWorkspace();
  return (
    <div className="space-y-6">
      <PageHeader
        title={company.name}
        description={company.domain}
        back={{ href: href('companies'), label: 'Companies' }}
        actions={<StatusBadge status={company.status} />}
      />
      <div className="grid-cols-1 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Company</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {company.description && (
              <p className="text-sm text-muted-foreground">{company.description}</p>
            )}
            <DetailList
              items={[
                { label: 'Industry', value: company.industry },
                { label: 'Employees', value: company.employeeCount ?? company.employeeRange },
                { label: 'Headquarters', value: company.hqCountry },
                {
                  label: 'Funding stage',
                  value: company.fundingStage ? humanize(company.fundingStage) : null,
                },
                {
                  label: 'Website',
                  value: company.websiteUrl ? (
                    <a
                      href={company.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {company.websiteUrl}
                    </a>
                  ) : null,
                },
                {
                  label: 'Technologies',
                  value: company.technologies.length ? (
                    <span className="flex flex-wrap gap-1">
                      {company.technologies.map((t) => (
                        <Badge key={t} variant="secondary">
                          {t}
                        </Badge>
                      ))}
                    </span>
                  ) : null,
                },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Data sources</CardTitle>
            <CardDescription>Where each field came from (GDPR Art. 14)</CardDescription>
          </CardHeader>
          <CardContent>
            <ProvenanceTable rows={company.provenance} />
          </CardContent>
        </Card>
      </div>
      <section className="space-y-3" aria-labelledby="company-contacts">
        <h2 id="company-contacts" className="text-base font-semibold">
          Contacts ({company.contacts.length})
        </h2>
        {company.contacts.length ? (
          <DataTable
            columns={contactColumns}
            rows={company.contacts}
            caption="Contacts at this company"
            href={(c) => href(`contacts/${c.id}`)}
          />
        ) : (
          <EmptyState
            icon={Users}
            title="No contacts yet"
            description="Contacts at this company appear here once found."
          />
        )}
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ contacts

const contactColumns: Column<ContactItem>[] = [
  {
    key: 'name',
    header: 'Name',
    mobile: 'title',
    cell: (c) => c.fullName ?? c.email ?? 'Unnamed contact',
  },
  {
    key: 'title',
    header: 'Title',
    mobile: 'subtitle',
    priority: 2,
    cell: (c) => <span className="text-muted-foreground">{c.title ?? '—'}</span>,
  },
  { key: 'company', header: 'Company', mobile: 'meta', cell: (c) => c.company?.name ?? '—' },
  {
    key: 'email',
    header: 'Email',
    priority: 3,
    cell: (c) => <span className="text-muted-foreground">{c.email ?? '—'}</span>,
  },
  {
    key: 'status',
    header: 'Email status',
    mobile: 'meta',
    cell: (c) => <StatusBadge status={c.emailStatus} />,
  },
  { key: 'country', header: 'Country', priority: 3, cell: (c) => c.country ?? '—' },
];

export function ContactsView({ initial }: { initial: Initial<ContactItem> }) {
  const { href } = useWorkspace();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | 'VALID' | 'CATCH_ALL' | 'UNVERIFIED' | 'INVALID'>('');
  const params = { q: q || undefined, emailStatus: status || undefined };
  const query = useWorkspaceList('contacts', ContactItemSchema, params, {
    ...initial,
    params: { q: undefined, emailStatus: undefined },
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Contacts"
        description="Business contacts, their email status and data sources."
        actions={
          <ComingSoon
            phase={PHASE.export}
            label="Export CSV"
            reason="Exports are audited and Owner/Admin only."
          />
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={q} onChange={setQ} placeholder="Search name, email or title" />
        <FilterPills
          label="Email status"
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: 'All' },
            { value: 'VALID', label: 'Valid' },
            { value: 'CATCH_ALL', label: 'Catch-all' },
            { value: 'UNVERIFIED', label: 'Unverified' },
            { value: 'INVALID', label: 'Invalid' },
          ]}
        />
      </div>
      <ListBody
        query={query}
        columns={contactColumns}
        caption="Contacts"
        href={(c: ContactItem) => href(`contacts/${c.id}`)}
        filtered={Boolean(q || status)}
        onClear={() => {
          setQ('');
          setStatus('');
        }}
        empty={
          <EmptyState
            icon={Users}
            title="Contacts you add will appear here"
            description="Discover or import leads to build your contact list."
            action={<ComingSoon phase={PHASE.discovery} label="Run discovery" variant="default" />}
          />
        }
      />
    </div>
  );
}

export function ContactDetailView({ contact }: { contact: ContactDetail }) {
  const { href } = useWorkspace();
  return (
    <div className="space-y-6">
      <PageHeader
        title={contact.fullName ?? contact.email ?? 'Contact'}
        description={
          [contact.title, contact.company?.name].filter(Boolean).join(' · ') || undefined
        }
        back={{ href: href('contacts'), label: 'Contacts' }}
        actions={
          <>
            <ComingSoon phase={PHASE.listEdit} label="Add to list" icon={ListChecks} />
            <ComingSoon phase={PHASE.campaigns} label="Enroll in campaign" variant="default" />
          </>
        }
      />
      <div className="grid-cols-1 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Contact</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailList
              items={[
                {
                  label: 'Email',
                  value: contact.email ? <span className="break-all">{contact.email}</span> : null,
                },
                { label: 'Email status', value: <StatusBadge status={contact.emailStatus} /> },
                { label: 'Seniority', value: humanize(contact.seniority) },
                { label: 'Country', value: contact.country },
                { label: 'Time zone', value: contact.timezone },
                { label: 'Lawful basis', value: humanize(contact.lawfulBasis) },
                { label: 'Source', value: humanize(contact.source) },
                {
                  label: 'Company',
                  value: contact.company ? (
                    <a
                      className="inline-flex min-h-11 items-center underline sm:min-h-0"
                      href={href(`companies/${contact.company.id}`)}
                    >
                      {contact.company.name}
                    </a>
                  ) : null,
                },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lead score</CardTitle>
            <CardDescription>Why this contact fits</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {contact.leads.length === 0 && (
              <p className="text-sm text-muted-foreground">Not scored against an ICP yet.</p>
            )}
            {contact.leads.map((l) => (
              <div key={l.id} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{l.icpName}</span>
                  <ScoreBadge tier={l.tier} score={l.score} />
                </div>
                {l.reasons.length > 0 && (
                  <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                    {l.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <div className="grid-cols-1 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {contact.activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ol className="space-y-3 border-l pl-4">
                {contact.activity.map((a) => (
                  <li key={a.id} className="relative text-sm">
                    <span
                      className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-brand"
                      aria-hidden
                    />
                    <span className="font-medium">{humanize(a.type)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDateTime(a.occurredAt)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Data sources</CardTitle>
            <CardDescription>Where each field came from</CardDescription>
          </CardHeader>
          <CardContent>
            <ProvenanceTable rows={contact.provenance} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ lead lists

export function LeadListsView({
  lists,
}: {
  lists: {
    id: string;
    name: string;
    description: string | null;
    membersCount: number;
    createdAt: string;
  }[];
}) {
  const { href } = useWorkspace();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Lead Lists"
        description="Group leads to enroll them in campaigns together."
        actions={
          <ComingSoon phase={PHASE.listEdit} label="New list" icon={Plus} variant="default" />
        }
      />
      {lists.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="Lists you create will appear here"
          description="Save leads into lists to reuse them across campaigns."
          action={<ComingSoon phase={PHASE.listEdit} label="New list" variant="default" />}
        />
      ) : (
        <DataTable
          caption="Lead lists"
          rows={lists}
          href={(l) => href(`lead-lists/${l.id}`)}
          columns={[
            { key: 'name', header: 'List', mobile: 'title', cell: (l) => l.name },
            {
              key: 'desc',
              header: 'Description',
              mobile: 'subtitle',
              priority: 2,
              cell: (l) => <span className="text-muted-foreground">{l.description ?? '—'}</span>,
            },
            {
              key: 'members',
              header: 'Leads',
              align: 'right',
              mobile: 'meta',
              cell: (l) => `${l.membersCount} leads`,
            },
            {
              key: 'created',
              header: 'Created',
              align: 'right',
              priority: 3,
              cell: (l) => formatDate(l.createdAt),
            },
          ]}
        />
      )}
    </div>
  );
}

export function LeadListDetailView({ list }: { list: LeadListDetail }) {
  const { href } = useWorkspace();
  return (
    <div className="space-y-6">
      <PageHeader
        title={list.name}
        description={list.description ?? `${list.membersCount} leads`}
        back={{ href: href('lead-lists'), label: 'Lead Lists' }}
        actions={
          <ComingSoon phase={PHASE.campaigns} label="Enroll list in campaign" variant="default" />
        }
      />
      {list.leads.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="This list is empty"
          description="Add leads from Find Leads or a contact's page."
        />
      ) : (
        <DataTable
          columns={leadColumns}
          rows={list.leads}
          caption={`Leads in ${list.name}`}
          href={(l) => href(`contacts/${l.contact.id}`)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ ICP builder

function chips(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export function IcpView({ data }: { data: IcpOverview }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Project docs"
        description="What the agent knows about your business: your website analysis, offer and ideal customer profiles (ICPs)."
        actions={
          <ComingSoon
            phase={PHASE.icpEdit}
            label="Generate ICP"
            icon={Sparkles}
            variant="default"
            reason="AI generation from your analyzed website."
          />
        }
      />
      <PhaseNote phase={PHASE.icpEdit}>
        Website analysis, AI generation and editing arrive with the ICP module. Profiles below are
        read-only.
      </PhaseNote>
      {data.profiles.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Your business profiles will appear here"
          description="Add your website so we can understand what you sell and who buys it."
          action={
            <ComingSoon phase={PHASE.icpEdit} label="Add business profile" variant="default" />
          }
        />
      ) : (
        data.profiles.map((p) => (
          <section key={p.id} className="space-y-3" aria-labelledby={`bp-${p.id}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id={`bp-${p.id}`} className="text-base font-semibold">
                {p.name}
              </h2>
              <span className="text-sm text-muted-foreground">{p.domain}</span>
              <StatusBadge status={p.status} />
            </div>
            {p.summary && <p className="max-w-3xl text-sm text-muted-foreground">{p.summary}</p>}
            {p.icps.length === 0 ? (
              <EmptyState
                icon={Target}
                title="No ICP for this profile yet"
                description="Generate one after the website analysis finishes."
              />
            ) : (
              <div className="grid-cols-1 grid gap-4 md:grid-cols-2">
                {p.icps.map((icp) => {
                  const f = icp.firmographics;
                  return (
                    <Card key={icp.id} className="gap-4">
                      <CardHeader className="flex flex-row items-start justify-between gap-2">
                        <div className="space-y-1">
                          <CardTitle className="text-base">{icp.name}</CardTitle>
                          <CardDescription>
                            Version {icp.version} · {icp.leadsCount} leads
                          </CardDescription>
                        </div>
                        <StatusBadge status={icp.status} />
                      </CardHeader>
                      <CardContent className="space-y-4 text-sm">
                        {icp.rationale && <p className="text-muted-foreground">{icp.rationale}</p>}
                        <DetailList
                          items={[
                            { label: 'Industries', value: chips(f.industries).join(', ') || null },
                            {
                              label: 'Company size',
                              value: chips(f.employeeRanges).join(', ') || null,
                            },
                            { label: 'Countries', value: chips(f.countries).join(', ') || null },
                            { label: 'Pain points', value: icp.painPoints.join(', ') || null },
                          ]}
                        />
                        {icp.segments.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">Target segments</p>
                            <ul className="space-y-2">
                              {icp.segments.map((s) => (
                                <li key={s.id} className="rounded-md border p-3">
                                  <p className="font-medium">{s.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {[...s.seniorities.map(humanize), ...s.titleKeywords].join(
                                      ' · ',
                                    )}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <ComingSoon phase={PHASE.icpEdit} label="Edit" size="sm" />
                          <ComingSoon
                            phase={PHASE.icpEdit}
                            label={icp.status === 'ACTIVE' ? 'Archive' : 'Activate'}
                            size="sm"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}
