-- Drop existing tables (if they exist)
drop table if exists public.assets;
drop table if exists public.users;

-- Create enhanced users table
create table public.users (
    id uuid references auth.users on delete cascade primary key,
    email text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    display_name text,
    avatar_url text,
    phone_number text,
    address text
);

-- Create assets table
create table public.assets (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    user_id uuid references public.users(id) on delete cascade not null,
    name text not null,
    description text,
    estimated_value decimal,
    media_url text not null,
    media_type text not null check (media_type in ('image', 'video')),
    is_signed boolean default false not null,
    signature_data jsonb
);

-- Set up Row Level Security (RLS)
alter table public.users enable row level security;
alter table public.assets enable row level security;

-- Drop existing policies if they exist (now safe since tables exist)
drop policy if exists "Users can view their own profile" on public.users;
drop policy if exists "Users can update their own profile" on public.users;
drop policy if exists "Users can insert their own profile" on public.users;
drop policy if exists "Service role can create users" on public.users;
drop policy if exists "Service role can update users" on public.users;
drop policy if exists "Users can insert their own assets" on public.assets;
drop policy if exists "Users can view their own assets" on public.assets;
drop policy if exists "Users can update their own assets" on public.assets;
drop policy if exists "Users can delete their own assets" on public.assets;

-- Create policies for users table
create policy "Users can view their own profile"
    on public.users for select
    using (auth.uid() = id);

create policy "Users can update their own profile"
    on public.users for update
    using (auth.uid() = id);

create policy "Users can insert their own profile"
    on public.users for insert
    with check (auth.uid() = id);

create policy "Service role can create users"
    on public.users for insert
    with check (true);

create policy "Service role can update users"
    on public.users for update
    using (true);

-- Create policies for assets table
create policy "Users can insert their own assets"
    on public.assets for insert
    with check (auth.uid() = user_id);

create policy "Users can view their own assets"
    on public.assets for select
    using (auth.uid() = user_id);

create policy "Users can update their own assets"
    on public.assets for update
    using (auth.uid() = user_id);

create policy "Users can delete their own assets"
    on public.assets for delete
    using (auth.uid() = user_id);

-- Create updated_at trigger
create or replace function public.handle_updated_at()
returns trigger as $$
begin
    new.updated_at = timezone('utc'::text, now());
    return new;
end;
$$ language plpgsql;

create trigger handle_users_updated_at
    before update on public.users
    for each row
    execute function public.handle_updated_at(); 