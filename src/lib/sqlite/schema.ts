import { MASTER_TABLE_SQL } from '../master/book'
import { STOCK_TABLE_SQL } from '../stock/engine'
import { ASSET_TABLE_SQL } from '../asset/book'

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
]

export const SCHEMA_PATCHES = [
  'alter table employees add column title text',
  'alter table employees add column hired_at text',
  'alter table employees add column left_at text',
  'alter table employees add column badge_name text',
  'alter table items add column stock_managed integer not null default 1',
  'alter table items add column asset_managed integer not null default 0',
  `create table if not exists employment_checks (
    employee_id text not null,
    item_key text not null,
    issued integer not null default 0,
    issued_at text,
    returned_at text,
    updated_at text not null,
    primary key (employee_id, item_key)
  )`,
]
