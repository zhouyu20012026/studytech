create table if not exists homes (
  id text primary key,
  name text not null
);

create table if not exists members (
  id text primary key,
  home_id text not null references homes(id) on delete cascade,
  name text not null,
  role text not null check (role in ('admin', 'member'))
);

create table if not exists areas (
  id text primary key,
  home_id text not null references homes(id) on delete cascade,
  name text not null,
  sort_order integer not null
);

create table if not exists locations (
  id text primary key,
  home_id text not null references homes(id) on delete cascade,
  area_id text not null references areas(id) on delete cascade,
  name text not null,
  is_common boolean not null default false
);

create table if not exists items (
  id text primary key,
  home_id text not null references homes(id) on delete cascade,
  name text not null,
  category text,
  note text,
  image_url text,
  location_id text not null references locations(id),
  created_by text not null references members(id),
  updated_by text not null references members(id),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  status text not null check (status in ('active', 'archived', 'lost'))
);

create table if not exists movements (
  id text primary key,
  home_id text not null references homes(id) on delete cascade,
  item_id text not null references items(id) on delete cascade,
  from_location_id text not null references locations(id),
  to_location_id text not null references locations(id),
  moved_by text not null references members(id),
  moved_at timestamptz not null,
  note text
);

create table if not exists users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  home_id text not null references homes(id) on delete cascade,
  created_at timestamptz not null
);

create table if not exists sessions (
  token_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null
);
