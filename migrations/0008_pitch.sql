-- 0008 — Pitch Pilot: RFP intake, extraction, knowledge, decks.
--
-- The prototype's "Extract & Open" never read the file: it waited on a timer
-- and wrote `Extracted from ${file.name}`. Extraction here is a job with a
-- versioned schema, per-field confidence, a source span you can point at in the
-- document, and a reviewer correction trail — so a value can be defended.

create table extraction_schemas (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  code        text        not null,
  name        text        not null,
  version     integer     not null default 1,
  -- Stock schemas ship with the app and are read-only; tenants add their own.
  is_stock    boolean     not null default false,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index extraction_schema_key on extraction_schemas (tenant_id, code, version);

create table extraction_schema_fields (
  id          uuid primary key default gen_random_uuid(),
  schema_id   uuid        not null references extraction_schemas (id) on delete cascade,
  key         text        not null,
  label       text        not null,
  data_type   text        not null default 'text'
                check (data_type in ('text', 'number', 'money', 'date', 'boolean', 'list')),
  required    boolean     not null default false,
  position    integer     not null default 0,
  hint        text
);
create unique index extraction_schema_field_key on extraction_schema_fields (schema_id, key);

create table rfps (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid        not null references tenants (id) on delete cascade,
  company_id     uuid        references companies (id) on delete set null,
  reference      text        not null,
  title          text        not null,
  -- The prospect as a party, so an RFP, its deal and its invoices are one account.
  prospect_party_id uuid     references parties (id) on delete set null,
  prospect_name  text,
  vertical       text,
  stage          text        not null default 'received',
  estimated_value numeric(18,4),
  currency       char(3),
  due_on         date,
  owner_user_id  uuid        references users (id) on delete set null,
  deal_id        uuid        references deals (id) on delete set null,
  outcome        text        check (outcome in ('won', 'lost', 'withdrawn')),
  archived_at    timestamptz,
  version        integer     not null default 1,
  created_by     uuid        references users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index rfp_reference_key on rfps (tenant_id, reference);
create index rfp_stage_idx on rfps (tenant_id, stage) where archived_at is null;
create index rfp_due_idx on rfps (tenant_id, due_on) where archived_at is null;

create table rfp_files (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  rfp_id      uuid        not null references rfps (id) on delete cascade,
  file_id     uuid        not null references files (id) on delete restrict,
  role        text        not null default 'source' check (role in ('source', 'attachment', 'response')),
  page_count  integer,
  created_at  timestamptz not null default now()
);
create index rfp_files_idx on rfp_files (rfp_id);

create table rfp_stage_events (
  id          bigserial primary key,
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  rfp_id      uuid        not null references rfps (id) on delete cascade,
  from_stage  text,
  to_stage    text        not null,
  actor_user_id uuid      references users (id) on delete set null,
  note        text,
  occurred_at timestamptz not null default now()
);
create index rfp_stage_events_idx on rfp_stage_events (rfp_id, occurred_at);

/*
 * One attempt at extracting a document against one schema version. It is a job
 * row's business-side twin: progress, failure and restart are all visible, so a
 * document that failed to parse says so instead of appearing to have worked.
 */
create table extraction_runs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  rfp_id        uuid        not null references rfps (id) on delete cascade,
  file_id       uuid        not null references files (id) on delete restrict,
  schema_id     uuid        references extraction_schemas (id) on delete set null,
  schema_version integer,
  job_id        uuid        references jobs (id) on delete set null,
  status        text        not null default 'queued'
                  check (status in ('queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled')),
  engine        text,
  progress      integer     not null default 0 check (progress between 0 and 100),
  page_count    integer,
  started_at    timestamptz,
  finished_at   timestamptz,
  duration_ms   integer,
  error         text,
  -- What it cost, so Loop 05's workload evidence comes from measurement.
  token_cost    integer,
  created_at    timestamptz not null default now()
);
create index extraction_runs_rfp_idx on extraction_runs (rfp_id, created_at desc);

create table extracted_values (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  run_id        uuid        not null references extraction_runs (id) on delete cascade,
  rfp_id        uuid        not null references rfps (id) on delete cascade,
  field_key     text        not null,
  value         text,
  -- 0..1. A value with no confidence is a value nobody can triage.
  confidence    numeric(5,4) check (confidence between 0 and 1),
  -- Where it came from in the document, so a reviewer can check it.
  source_page   integer,
  source_span   jsonb,
  -- Reviewer correction. The original is kept beside it, never overwritten.
  corrected_value text,
  corrected_by  uuid        references users (id) on delete set null,
  corrected_at  timestamptz,
  created_at    timestamptz not null default now()
);
create unique index extracted_value_key on extracted_values (run_id, field_key);
create index extracted_value_rfp_idx on extracted_values (rfp_id);

create table knowledge_documents (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  file_id       uuid        references files (id) on delete set null,
  category      text,
  title         text        not null,
  -- Extracted text, kept so retrieval does not re-parse the binary each time.
  body          text,
  status        text        not null default 'pending'
                  check (status in ('pending', 'indexing', 'indexed', 'failed', 'archived')),
  chunk_count   integer     not null default 0,
  indexed_at    timestamptz,
  error         text,
  created_by    uuid        references users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index knowledge_documents_idx on knowledge_documents (tenant_id, status);

/*
 * Retrieval chunks. The embedding column is intentionally absent: choosing a
 * vector dimension commits to a provider, which is decision D3. Chunks and
 * their text exist now so keyword retrieval works and a vector index can be
 * added in a later migration without restructuring.
 */
create table knowledge_chunks (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid        not null references tenants (id) on delete cascade,
  document_id  uuid        not null references knowledge_documents (id) on delete cascade,
  position     integer     not null,
  body         text        not null,
  token_count  integer,
  created_at   timestamptz not null default now()
);
create unique index knowledge_chunk_position on knowledge_chunks (document_id, position);

create table pitch_templates (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  name          text        not null,
  file_id       uuid        references files (id) on delete set null,
  is_default    boolean     not null default false,
  slide_count   integer,
  archived_at   timestamptz,
  created_at    timestamptz not null default now()
);
create unique index pitch_template_default on pitch_templates (tenant_id) where is_default and archived_at is null;

create table brand_kits (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  firm_name     text,
  logo_file_id  uuid        references files (id) on delete set null,
  palette       jsonb       not null default '[]'::jsonb,
  contact       jsonb       not null default '{}'::jsonb,
  version       integer     not null default 1,
  updated_at    timestamptz not null default now()
);
create unique index brand_kit_key on brand_kits (tenant_id);

/*
 * A deck is only real once there is a file behind it. `file_id` stays null
 * until rendering actually produced bytes, so a "published" row cannot claim a
 * deck exists — the prototype's failure mode exactly.
 */
create table proposal_decks (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references tenants (id) on delete cascade,
  rfp_id        uuid        not null references rfps (id) on delete cascade,
  template_id   uuid        references pitch_templates (id) on delete set null,
  version       integer     not null default 1,
  status        text        not null default 'draft'
                  check (status in ('draft', 'rendering', 'ready', 'failed', 'published')),
  format        text        check (format in ('pptx', 'pdf')),
  file_id       uuid        references files (id) on delete set null,
  content       jsonb       not null default '{}'::jsonb,
  -- Which knowledge chunks the draft drew on, so a claim can be traced.
  citations     jsonb       not null default '[]'::jsonb,
  job_id        uuid        references jobs (id) on delete set null,
  render_ms     integer,
  error         text,
  created_by    uuid        references users (id) on delete set null,
  created_at    timestamptz not null default now(),
  published_at  timestamptz,
  constraint deck_ready_has_file check (status not in ('ready', 'published') or file_id is not null)
);
create unique index proposal_deck_version on proposal_decks (rfp_id, version);
