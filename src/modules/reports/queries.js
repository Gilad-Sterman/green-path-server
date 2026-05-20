import pool from '../../db/client.js';

// ── Date-clause helper ────────────────────────────────────────────────────────
const applyDateRange = (alias, col, from, to, conditions, params, idx) => {
  if (from) { conditions.push(`${alias}.${col} >= $${idx++}`); params.push(from); }
  if (to)   { conditions.push(`${alias}.${col} <= $${idx++}`); params.push(to); }
  return idx;
};

// ── 1. Overall summary (credits + intakes + shipments) ────────────────────────
export const getReportSummary = async ({ factory_id, from, to }) => {
  const cConds = []; const cParams = []; let cIdx = 1;
  if (factory_id) { cConds.push(`cl.factory_id = $${cIdx++}`); cParams.push(factory_id); }
  cIdx = applyDateRange('cl', 'created_at', from, to, cConds, cParams, cIdx);
  const cWhere = cConds.length ? `WHERE ${cConds.join(' AND ')}` : '';

  const { rows: [credits] } = await pool.query(
    `SELECT
       COALESCE(SUM(eligible_output_kg), 0)                                        AS total_credits_kg,
       COALESCE(SUM(eligible_output_kg) FILTER (WHERE kind = 'operational'),  0)   AS operational_kg,
       COALESCE(SUM(eligible_output_kg) FILTER (WHERE kind = 'retroactive'),  0)   AS retroactive_kg,
       COUNT(*)::int                                                                AS credits_count
     FROM credits_ledger cl ${cWhere}`,
    cParams
  );

  const iConds = []; const iParams = []; let iIdx = 1;
  if (factory_id) { iConds.push(`rmi.factory_id = $${iIdx++}`); iParams.push(factory_id); }
  iIdx = applyDateRange('rmi', 'intake_date', from, to, iConds, iParams, iIdx);
  const iWhere = iConds.length ? `WHERE ${iConds.join(' AND ')}` : '';

  const { rows: [intakes] } = await pool.query(
    `SELECT
       COUNT(*)::int                              AS intakes_count,
       COALESCE(SUM(net_weight_kg), 0)            AS total_intake_kg,
       COALESCE(SUM(eligible_weight_kg), 0)       AS total_eligible_input_kg
     FROM raw_material_intakes rmi ${iWhere}`,
    iParams
  );

  const sConds = []; const sParams = []; let sIdx = 1;
  if (factory_id) { sConds.push(`s.factory_id = $${sIdx++}`); sParams.push(factory_id); }
  sIdx = applyDateRange('s', 'shipment_date', from, to, sConds, sParams, sIdx);
  const sWhere = sConds.length ? `WHERE ${sConds.join(' AND ')}` : '';

  const { rows: [shipments] } = await pool.query(
    `SELECT COUNT(*)::int AS shipments_count FROM shipments s ${sWhere}`,
    sParams
  );

  return {
    ...credits,
    ...intakes,
    ...shipments,
    remaining_balance_kg: parseFloat(intakes.total_eligible_input_kg) - parseFloat(credits.total_credits_kg),
  };
};

// ── 2. Monthly credits trend ──────────────────────────────────────────────────
export const getReportMonthly = async ({ factory_id, from, to }) => {
  const conditions = []; const params = []; let idx = 1;
  if (factory_id) { conditions.push(`cl.factory_id = $${idx++}`); params.push(factory_id); }
  // Use shipment_date when the credit comes from a shipment, else fall back to cl.created_at
  if (from) { conditions.push(`COALESCE(s.shipment_date, cl.created_at::date) >= $${idx++}`); params.push(from); }
  if (to)   { conditions.push(`COALESCE(s.shipment_date, cl.created_at::date) <= $${idx++}`); params.push(to); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT
       TO_CHAR(DATE_TRUNC('month', COALESCE(s.shipment_date, cl.created_at::date)), 'YYYY-MM') AS month,
       COALESCE(SUM(cl.eligible_output_kg), 0)                                                 AS total_kg,
       COALESCE(SUM(cl.eligible_output_kg) FILTER (WHERE cl.kind = 'operational'),  0)         AS operational_kg,
       COALESCE(SUM(cl.eligible_output_kg) FILTER (WHERE cl.kind = 'retroactive'),  0)         AS retroactive_kg,
       COUNT(*)::int                                                                            AS count
     FROM credits_ledger cl
     LEFT JOIN shipments s ON s.id = cl.source_id AND cl.source_type = 'shipment'
     ${where}
     GROUP BY DATE_TRUNC('month', COALESCE(s.shipment_date, cl.created_at::date))
     ORDER BY DATE_TRUNC('month', COALESCE(s.shipment_date, cl.created_at::date)) DESC
     LIMIT 24`,
    params
  );
  return rows;
};

// ── 3. Intakes by material type ───────────────────────────────────────────────
export const getReportIntakesByType = async ({ factory_id, from, to }) => {
  const conditions = []; const params = []; let idx = 1;
  if (factory_id) { conditions.push(`factory_id = $${idx++}`); params.push(factory_id); }
  if (from) { conditions.push(`intake_date >= $${idx++}`); params.push(from); }
  if (to)   { conditions.push(`intake_date <= $${idx++}`); params.push(to); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT
       material_type,
       COUNT(*)::int                         AS count,
       COALESCE(SUM(net_weight_kg), 0)       AS total_kg,
       COALESCE(SUM(eligible_weight_kg), 0)  AS eligible_kg
     FROM raw_material_intakes
     ${where}
     GROUP BY material_type
     ORDER BY total_kg DESC`,
    params
  );
  return rows;
};

// ── 4. Credits detail for CSV export ─────────────────────────────────────────
export const getReportCreditsForExport = async ({ factory_id, from, to }) => {
  const conditions = []; const params = []; let idx = 1;
  if (factory_id) { conditions.push(`cl.factory_id = $${idx++}`); params.push(factory_id); }
  if (from) { conditions.push(`cl.created_at >= $${idx++}`); params.push(from); }
  if (to)   { conditions.push(`cl.created_at <= $${idx++}`); params.push(to); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT
       cl.id, f.name AS factory_name,
       cl.kind, cl.source_type, cl.source_id,
       cl.eligible_output_kg, cl.retro,
       cl.created_at
     FROM credits_ledger cl
     JOIN factories f ON f.id = cl.factory_id
     ${where}
     ORDER BY cl.created_at DESC`,
    params
  );
  return rows;
};

// ── 5. Admin: per-factory summary ─────────────────────────────────────────────
export const getReportFactorySummaries = async ({ from, to }) => {
  const conditions = []; const params = []; let idx = 1;
  if (from) { conditions.push(`cl.created_at >= $${idx++}`); params.push(from); }
  if (to)   { conditions.push(`cl.created_at <= $${idx++}`); params.push(to); }
  const joinWhere = conditions.length ? `AND ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT
       f.id AS factory_id,
       f.name AS factory_name,
       f.address,
       COALESCE(SUM(cl.eligible_output_kg), 0)                                          AS total_credits_kg,
       COALESCE(SUM(cl.eligible_output_kg) FILTER (WHERE cl.kind = 'operational'),  0)  AS operational_kg,
       COUNT(cl.id)::int                                                                 AS credits_count,
       (SELECT COUNT(*)::int FROM raw_material_intakes rmi WHERE rmi.factory_id = f.id) AS intakes_count,
       (SELECT COALESCE(SUM(rmi.eligible_weight_kg), 0)
        FROM raw_material_intakes rmi WHERE rmi.factory_id = f.id)                      AS total_eligible_input_kg
     FROM factories f
     LEFT JOIN credits_ledger cl ON cl.factory_id = f.id ${joinWhere}
     WHERE f.status = 'active'
     GROUP BY f.id, f.name, f.address
     ORDER BY total_credits_kg DESC`,
    params
  );
  return rows.map((r) => ({
    ...r,
    remaining_balance_kg: parseFloat(r.total_eligible_input_kg) - parseFloat(r.total_credits_kg),
  }));
};
