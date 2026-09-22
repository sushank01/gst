/*
 * 0012 — the integrations a tenant records, and per-user screen state.
 *
 * Two things that both lived in one browser-wide localStorage blob, where
 * every account signed in on that machine shared them.
 *
 * On connections, read the absence of a column carefully. There is nowhere
 * here to put a credential, and that is the design rather than an omission.
 * No connector adapter runs on this deployment and no OAuth client is
 * registered, so a secret taken on these screens would be a secret held for
 * no reason — the worst possible trade. The prototype took an API key and
 * kept its last four characters under a label reading "Never persisted", two
 * sentences that contradicted each other over a connection that could never
 * connect. A row here records which connector somebody intends to use and
 * what it points at. It authorises nothing and dials nothing.
 */

create table connections (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid        not null references tenants (id) on delete cascade,
  -- The catalogue entry, e.g. 'slack'. Not a foreign key: the connector
  -- catalogue is application data, not a table, and a connector withdrawn
  -- from the catalogue must not delete the note somebody made about it.
  connector_id text        not null,
  name         text        not null,
  -- The host, workspace or account it points at. Free text, because what
  -- identifies an account differs per connector and inventing a shape per
  -- connector would be inventing the integration.
  target       text        not null default '',
  created_by   uuid        references users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create unique index connection_name_key on connections (tenant_id, connector_id, lower(name));
create index connection_tenant_idx on connections (tenant_id, created_at desc);

/*
 * A REST API the tenant described itself. `source` says how it was described:
 * typed in by hand, or read out of an OpenAPI document that was pasted in.
 */
create table custom_connectors (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid        not null references tenants (id) on delete cascade,
  name        text        not null,
  base_url    text        not null default '',
  auth        text        not null default 'none'
                check (auth in ('none', 'api_key', 'basic', 'oauth2', 'from_spec')),
  source      text        not null check (source in ('manual', 'openapi')),
  created_by  uuid        references users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index custom_connector_name_key on custom_connectors (tenant_id, lower(name));

/*
 * The operations of a custom connector, one row each.
 *
 * There is deliberately no `operations integer` on the parent. The prototype
 * had one and the browser supplied it, so the figure on the card was whatever
 * had been passed in rather than anything that had been read. Counting these
 * rows cannot disagree with what was imported, and a hand-described connector
 * honestly has none — which the screen can say, instead of printing "0
 * operations" as though it had looked.
 */
create table custom_connector_operations (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid        not null references tenants (id) on delete cascade,
  connector_id uuid        not null references custom_connectors (id) on delete cascade,
  method       text        not null,
  path         text        not null,
  summary      text
);
create unique index custom_connector_operation_key
  on custom_connector_operations (connector_id, method, path);

/*
 * Per-user, per-workspace screen state: a dismissed banner, a remembered tab.
 *
 * Scoped to the member, not the tenant, because dismissing the getting-started
 * checklist is a statement about one person having read it. In the prototype
 * it was a field in a workspace blob keyed to the browser, so one person
 * dismissing it dismissed it for everybody who ever signed in on that machine.
 *
 * Nothing in this table is allowed to decide anything. It holds what a screen
 * should look like on return, and never what a user may do or what is true.
 */
create table user_preferences (
  tenant_id  uuid        not null references tenants (id) on delete cascade,
  user_id    uuid        not null references users (id) on delete cascade,
  key        text        not null,
  value      jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id, key)
);
