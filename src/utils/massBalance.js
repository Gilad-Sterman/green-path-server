import pool from '../db/client.js';

export const checkMassBalance = async (factoryId, additionalOutputKg) => {
  const result = await pool.query(
    `SELECT
      COALESCE(SUM(eligible_weight_kg), 0) AS eligible_input_kg
    FROM raw_material_intakes
    WHERE factory_id = $1`,
    [factoryId]
  );

  const creditResult = await pool.query(
    `SELECT
      COALESCE(SUM(eligible_output_kg), 0) AS eligible_output_kg
    FROM credits_ledger
    WHERE factory_id = $1`,
    [factoryId]
  );

  const eligibleInputKg = parseFloat(result.rows[0].eligible_input_kg);
  const currentOutputKg = parseFloat(creditResult.rows[0].eligible_output_kg);
  const projectedOutputKg = currentOutputKg + additionalOutputKg;

  return {
    eligibleInputKg,
    currentOutputKg,
    projectedOutputKg,
    remainingEligibleKg: eligibleInputKg - currentOutputKg,
    massBalanceOk: projectedOutputKg <= eligibleInputKg,
  };
};
