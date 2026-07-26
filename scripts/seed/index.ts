// Idempotent seed: `pnpm seed`. Safe to run any number of times — reference
// rows upsert on fixed UUIDs or natural keys, airports upsert on IATA code.
import { parse } from "csv-parse/sync";
import postgres from "postgres";

import {
  BONUS_EDGE,
  STAGING_BONUS_EDGE,
  awardRoutes,
  cards,
  currencies,
  earningRates,
  stagingChanges,
  transferBonuses,
  transferPartners,
  welcomeOffers,
} from "./data";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// github.io mirror of the same dataset is blocked in some sandboxes;
// raw.githubusercontent.com serves the identical daily-updated file.
const OURAIRPORTS_URL =
  process.env.OURAIRPORTS_URL ??
  "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv";

type AirportRow = {
  iata: string;
  name: string;
  city: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
  source: string;
};

async function fetchAirports(): Promise<AirportRow[]> {
  console.log(`fetching ${OURAIRPORTS_URL} ...`);
  const res = await fetch(OURAIRPORTS_URL);
  if (!res.ok) {
    throw new Error(
      `OurAirports fetch failed: ${res.status} ${res.statusText}`
    );
  }
  const csv = await res.text();
  const records: Record<string, string>[] = parse(csv, {
    columns: true,
    skip_empty_lines: true,
  });

  const seen = new Set<string>();
  const rows: AirportRow[] = [];
  for (const r of records) {
    const iata = (r.iata_code ?? "").trim().toUpperCase();
    if (
      r.scheduled_service !== "yes" ||
      !/^[A-Z]{3}$/.test(iata) ||
      seen.has(iata)
    ) {
      continue;
    }
    seen.add(iata);
    rows.push({
      iata,
      name: r.name ?? iata,
      city: r.municipality || null,
      region: r.iso_region || null,
      lat: r.latitude_deg ? Number(r.latitude_deg) : null,
      lng: r.longitude_deg ? Number(r.longitude_deg) : null,
      source: "ourairports",
    });
  }
  return rows;
}

async function main() {
  const sql = postgres(DATABASE_URL, { onnotice: () => {} });
  try {
    // --- airports (bulk, chunked) ------------------------------------------
    const airports = await fetchAirports();
    for (let i = 0; i < airports.length; i += 1000) {
      const chunk = airports.slice(i, i + 1000);
      await sql`
        insert into airports ${sql(chunk)}
        on conflict (iata) do update set
          name = excluded.name,
          city = excluded.city,
          region = excluded.region,
          lat = excluded.lat,
          lng = excluded.lng,
          source = excluded.source
      `;
    }
    console.log(`airports: ${airports.length} upserted`);

    // --- reference graph ----------------------------------------------------
    for (const row of currencies) {
      await sql`
        insert into currencies ${sql(row)}
        on conflict (id) do update set
          name = excluded.name, kind = excluded.kind,
          alliance = excluded.alliance, cashback_cpp = excluded.cashback_cpp,
          transfer_cpp = excluded.transfer_cpp,
          requires_unlock = excluded.requires_unlock,
          is_active = excluded.is_active, notes = excluded.notes,
          brand_color = excluded.brand_color
      `;
    }
    console.log(`currencies: ${currencies.length} upserted`);

    for (const row of cards) {
      await sql`
        insert into card_catalog ${sql(row)}
        on conflict (id) do update set
          name = excluded.name, issuer = excluded.issuer,
          currency_id = excluded.currency_id, annual_fee = excluded.annual_fee,
          unlocks_transfers = excluded.unlocks_transfers,
          is_active = excluded.is_active, notes = excluded.notes,
          brand_color = excluded.brand_color
      `;
    }
    console.log(`cards: ${cards.length} upserted`);

    for (const row of earningRates) {
      await sql`
        insert into earning_rates ${sql(row)}
        on conflict (card_id, category) do update set
          rate = excluded.rate, cap_monthly_usd = excluded.cap_monthly_usd,
          notes = excluded.notes
      `;
    }
    console.log(`earning_rates: ${earningRates.length} upserted`);

    for (const row of welcomeOffers) {
      await sql`
        insert into welcome_offers ${sql(row)}
        on conflict (id) do update set
          points = excluded.points, min_spend_usd = excluded.min_spend_usd,
          window_months = excluded.window_months, ends_at = excluded.ends_at,
          source_url = excluded.source_url, is_active = excluded.is_active
      `;
    }
    console.log(`welcome_offers: ${welcomeOffers.length} upserted`);

    for (const row of transferPartners) {
      await sql`
        insert into transfer_partners ${sql(row)}
        on conflict (from_currency_id, to_currency_id) do update set
          ratio_num = excluded.ratio_num, ratio_den = excluded.ratio_den,
          transfer_hours_est = excluded.transfer_hours_est,
          min_transfer = excluded.min_transfer, increment = excluded.increment,
          is_active = excluded.is_active, notes = excluded.notes
      `;
    }
    console.log(`transfer_partners: ${transferPartners.length} upserted`);

    const [edge] = await sql<{ id: string }[]>`
      select id from transfer_partners
      where from_currency_id = ${BONUS_EDGE.from_currency_id}
        and to_currency_id = ${BONUS_EDGE.to_currency_id}
    `;
    if (!edge) throw new Error("bonus edge not found after partner upsert");
    for (const bonus of transferBonuses) {
      const row = { ...bonus, transfer_partner_id: edge.id };
      await sql`
        insert into transfer_bonuses ${sql(row)}
        on conflict (id) do update set
          transfer_partner_id = excluded.transfer_partner_id,
          bonus_pct = excluded.bonus_pct, starts_at = excluded.starts_at,
          ends_at = excluded.ends_at, source_url = excluded.source_url,
          status = excluded.status
      `;
    }
    console.log(`transfer_bonuses: ${transferBonuses.length} upserted`);

    for (const row of awardRoutes) {
      await sql`
        insert into award_routes ${sql(row)}
        on conflict (name) do update set
          program_currency_id = excluded.program_currency_id,
          origin_region = excluded.origin_region,
          origin_airports = excluded.origin_airports,
          destination_region = excluded.destination_region,
          destination_airports = excluded.destination_airports,
          cabin = excluded.cabin, points_oneway = excluded.points_oneway,
          taxes_fees_usd_est = excluded.taxes_fees_usd_est,
          booking_url = excluded.booking_url, notes = excluded.notes,
          is_active = excluded.is_active,
          booking_unit = excluded.booking_unit,
          pricing_mode = excluded.pricing_mode
      `;
    }
    console.log(`award_routes: ${awardRoutes.length} upserted`);

    // --- example review-queue items ----------------------------------------
    const [mrAna] = await sql<{ id: string }[]>`
      select id from transfer_partners
      where from_currency_id = ${STAGING_BONUS_EDGE.from_currency_id}
        and to_currency_id = ${STAGING_BONUS_EDGE.to_currency_id}
    `;
    if (!mrAna) throw new Error("MR->ANA edge not found for staging seed");
    const changes = stagingChanges(mrAna.id);
    for (const change of changes) {
      const row = {
        ...change,
        proposed: JSON.stringify(change.proposed),
        diff: change.diff === null ? null : JSON.stringify(change.diff),
      };
      await sql`
        insert into staging_changes ${sql(row)}
        on conflict (id) do update set
          target_table = excluded.target_table,
          target_id = excluded.target_id, proposed = excluded.proposed,
          diff = excluded.diff, source = excluded.source,
          confidence = excluded.confidence, source_urls = excluded.source_urls,
          status = excluded.status
      `;
    }
    console.log(`staging_changes: ${changes.length} upserted`);

    console.log("seed complete");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
