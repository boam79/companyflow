import { MASTER_TABLE_SQL } from '../master/book'
import { STOCK_TABLE_SQL } from '../stock/engine'
import { ASSET_TABLE_SQL } from '../asset/book'
import { ASSET_EVENT_TABLE_SQL } from '../asset/life'
import { QR_LABEL_TABLE_SQL } from '../asset/register'
import { CONTRACT_TABLE_SQL } from '../contracts/book'
import { BADGE_TEMPLATE_TABLE_SQL } from '../people/badgeTemplate'
import { NOTIFY_TABLE_SQL } from '../people/badgeNotify'
import { HIRE_WORKFLOW_TABLE_SQL } from '../people/hireWorkflow'

export const LOCAL_MIGRATIONS = [
  `create table if not exists meta (
    key text primary key,
    value text not null
  );`,
  `create table if not exists processed_operations (
    operation_id text primary key,
    result_json text not null,
    created_at text not null
  );`,
  `create table if not exists company_config_versions (
    id text primary key,
    module_id text not null,
    version integer not null,
    base_version text,
    payload_json text not null,
    published integer not null default 0,
    created_at text not null
  );`,
  `create table if not exists audit_events (
    id text primary key,
    action text not null,
    detail_json text not null,
    created_at text not null
  );`,
  `create table if not exists setup_state (
    key text primary key,
    value text not null
  );`,
  ...MASTER_TABLE_SQL,
  ...STOCK_TABLE_SQL,
  ...ASSET_TABLE_SQL,
  ...ASSET_EVENT_TABLE_SQL,
  ...QR_LABEL_TABLE_SQL,
  ...CONTRACT_TABLE_SQL,
  ...BADGE_TEMPLATE_TABLE_SQL,
  ...NOTIFY_TABLE_SQL,
]

export const SCHEMA_PATCHES = [
  'alter table employees add column title text',
  'alter table employees add column hired_at text',
  'alter table employees add column left_at text',
  'alter table employees add column badge_name text',
  'alter table employees add column badge_department text',
  'alter table items add column stock_managed integer not null default 1',
  'alter table items add column asset_managed integer not null default 0',
  'alter table items add column min_stock integer not null default 0',
  'alter table items add column code text',
  "alter table items add column unit text not null default '개'",
  "alter table items add column purchase_kind text not null default 'supply'",
  'alter table items add column active integer not null default 1',
  'alter table items add column partner_id text',
  'alter table partners add column phone text',
  'alter table partners add column memo text',
  'alter table partners add column file_name text',
  'alter table partners add column file_mime text',
  'alter table partners add column file_base64 text',
  'alter table departments add column active integer not null default 1',
  'alter table partners add column active integer not null default 1',
  'alter table warehouses add column active integer not null default 1',
  `create table if not exists purchase_kinds (
    id text primary key,
    name text not null,
    active integer not null default 1,
    created_at text not null
  )`,
  'alter table stock_orders add column partner_id text',
  'alter table stock_orders add column due_date text',
  `create table if not exists employment_checks (
    employee_id text not null,
    item_key text not null,
    issued integer not null default 0,
    issued_at text,
    returned_at text,
    updated_at text not null,
    primary key (employee_id, item_key)
  )`,
  `create table if not exists contracts (
    id text primary key,
    title text not null,
    contract_no text,
    counterparty text not null,
    signed_at text,
    start_at text,
    end_at text,
    amount integer,
    currency text not null default 'KRW',
    owner_name text,
    file_name text,
    file_hash text,
    status text not null,
    ocr_status text not null,
    created_at text not null
  )`,
  'alter table contracts add column file_mime text',
  'alter table contracts add column file_base64 text',
  `create unique index if not exists contracts_file_hash on contracts(file_hash) where file_hash is not null`,
  ...BADGE_TEMPLATE_TABLE_SQL,
  ...NOTIFY_TABLE_SQL,
  ...QR_LABEL_TABLE_SQL,
  'alter table assets add column qr_token text',
  'alter table assets add column model text',
  'alter table assets add column serial_no text',
  'alter table assets add column location_text text',
  'alter table assets add column department_name text',
  'alter table assets add column owner_name text',
  'alter table assets add column acquired_at text',
  'alter table assets add column source_order_id text',
  `create unique index if not exists assets_qr_token on assets(qr_token) where qr_token is not null`,
  ...ASSET_EVENT_TABLE_SQL,
  ...HIRE_WORKFLOW_TABLE_SQL,
]
