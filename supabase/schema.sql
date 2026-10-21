-- Uruguay Nutri Rifa — ejecutar en Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.raffle_orders (
  id uuid primary key default gen_random_uuid(),
  buyer_name text not null,
  buyer_phone text not null,
  numbers integer[] not null,
  total numeric(10,2) not null,
  status text not null default 'pending' check (status in ('pending','paid','expired','cancelled')),
  mp_preference_id text,
  checkout_url text,
  mp_payment_id text unique,
  created_at timestamptz not null default now(),
  reserved_until timestamptz not null default (now() + interval '15 minutes'),
  paid_at timestamptz
);

create table if not exists public.raffle_numbers (
  number integer primary key check (number between 1 and 100),
  status text not null default 'available' check (status in ('available','reserved','sold')),
  order_id uuid references public.raffle_orders(id),
  reserved_until timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.raffle_numbers(number)
select generate_series(1,100)
on conflict (number) do nothing;

alter table public.raffle_orders enable row level security;
alter table public.raffle_numbers enable row level security;

-- Public can only read number status, never buyer details.
drop policy if exists "Public can read raffle number status" on public.raffle_numbers;
create policy "Public can read raffle number status" on public.raffle_numbers
for select to anon, authenticated using (true);

-- No public writes. All mutations happen through server-side service role + RPC.
revoke insert, update, delete on public.raffle_numbers from anon, authenticated;
revoke all on public.raffle_orders from anon, authenticated;
grant select on public.raffle_numbers to anon, authenticated;

create or replace function public.reserve_raffle_numbers(
  p_numbers integer[], p_buyer_name text, p_buyer_phone text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_order_id uuid;
  v_now timestamptz := now();
  v_count integer;
begin
  if p_numbers is null or cardinality(p_numbers) < 1 or cardinality(p_numbers) > 20 then
    raise exception 'invalid number count';
  end if;
  if exists (select 1 from unnest(p_numbers) n where n < 1 or n > 100) then
    raise exception 'invalid number';
  end if;
  if cardinality(p_numbers) <> (select count(distinct n) from unnest(p_numbers) n) then
    raise exception 'duplicate number';
  end if;

  -- Expire stale reservations before checking availability.
  update raffle_numbers rn set status='available', order_id=null, reserved_until=null, updated_at=v_now
  where rn.status='reserved' and rn.reserved_until < v_now;

  -- Lock requested rows in sorted order to prevent double booking.
  perform 1 from raffle_numbers rn
    where rn.number = any(p_numbers) order by rn.number for update;
  select count(*) into v_count from raffle_numbers rn
    where rn.number = any(p_numbers) and rn.status='available';
  if v_count <> cardinality(p_numbers) then
    raise exception 'one or more numbers unavailable';
  end if;

  insert into raffle_orders(buyer_name,buyer_phone,numbers,total,status,reserved_until)
  values (left(trim(p_buyer_name),120), left(trim(p_buyer_phone),40), p_numbers,
          cardinality(p_numbers)*20, 'pending', v_now + interval '15 minutes')
  returning id into v_order_id;

  update raffle_numbers rn set status='reserved', order_id=v_order_id,
    reserved_until=v_now + interval '15 minutes', updated_at=v_now
  where rn.number = any(p_numbers);
  return v_order_id;
end;
$$;

create or replace function public.release_raffle_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update raffle_numbers set status='available', order_id=null, reserved_until=null, updated_at=now()
  where order_id=p_order_id and status='reserved';
  update raffle_orders set status='cancelled'
  where id=p_order_id and status='pending';
end;
$$;

create or replace function public.confirm_raffle_payment(p_order_id uuid, p_payment_id text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_order raffle_orders%rowtype; v_count integer;
begin
  select * into v_order from raffle_orders where id=p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if v_order.status='paid' then
    if v_order.mp_payment_id = p_payment_id then return; end if;
    raise exception 'order already paid with another payment';
  end if;
  if v_order.status <> 'pending' then raise exception 'order is not pending'; end if;

  perform 1 from raffle_numbers rn where rn.number=any(v_order.numbers) order by rn.number for update;
  select count(*) into v_count from raffle_numbers rn
    where rn.number=any(v_order.numbers) and rn.order_id=p_order_id and rn.status='reserved';
  if v_count <> cardinality(v_order.numbers) then
    raise exception 'reserved numbers no longer belong to this order';
  end if;

  update raffle_numbers set status='sold', reserved_until=null, updated_at=now()
    where number=any(v_order.numbers) and order_id=p_order_id;
  update raffle_orders set status='paid', mp_payment_id=p_payment_id, paid_at=now()
    where id=p_order_id;
end;
$$;

revoke all on function public.reserve_raffle_numbers(integer[],text,text) from public, anon, authenticated;
revoke all on function public.release_raffle_order(uuid) from public, anon, authenticated;
revoke all on function public.confirm_raffle_payment(uuid,text) from public, anon, authenticated;
grant execute on function public.reserve_raffle_numbers(integer[],text,text) to service_role;
grant execute on function public.release_raffle_order(uuid) to service_role;
grant execute on function public.confirm_raffle_payment(uuid,text) to service_role;

-- Enable realtime updates for the public number grid.
alter publication supabase_realtime add table public.raffle_numbers;
