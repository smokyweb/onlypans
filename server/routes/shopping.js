const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.post('/', (req, res) => {
  const { recipeIds } = req.body;

  if (!Array.isArray(recipeIds) || recipeIds.length === 0) {
    return res.status(400).json({ error: 'recipeIds array is required' });
  }

  const placeholders = recipeIds.map(() => '?').join(',');
  const ingredients = db.prepare(`
    SELECT i.name, i.amount, i.unit
    FROM ingredients i
    JOIN recipes r ON r.id = i.recipe_id
    WHERE i.recipe_id IN (${placeholders}) AND r.user_id = ?
  `).all(...recipeIds, req.user.id);

  // Group by ingredient name, sum amounts where unit matches
  const merged = {};
  for (const ing of ingredients) {
    const key = ing.name.toLowerCase();
    if (!merged[key]) {
      merged[key] = { name: ing.name, items: [] };
    }
    merged[key].items.push({ amount: ing.amount, unit: ing.unit });
  }

  const result = [];
  for (const entry of Object.values(merged)) {
    // Group items by unit and sum amounts
    const byUnit = {};
    for (const item of entry.items) {
      const unit = (item.unit || '').toLowerCase();
      if (!byUnit[unit]) {
        byUnit[unit] = { amount: 0, unit: item.unit || '' };
      }
      byUnit[unit].amount += item.amount || 0;
    }

    for (const grouped of Object.values(byUnit)) {
      result.push({
        name: entry.name,
        amount: grouped.amount || null,
        unit: grouped.unit || null
      });
    }
  }

  res.json(result);
});

module.exports = router;
