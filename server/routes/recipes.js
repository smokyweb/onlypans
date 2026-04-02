const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype.split('/')[1]);
    cb(null, ext && mime);
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf');
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

function parseIngredientLine(line) {
  // Normalize unicode fractions
  const normalized = line
    .replace(/½/g, '1/2').replace(/¼/g, '1/4').replace(/¾/g, '3/4')
    .replace(/⅓/g, '1/3').replace(/⅔/g, '2/3').replace(/⅛/g, '1/8');

  // Match: optional number/fraction, optional unit, rest is name
  const match = normalized.match(
    /^((?:\d+\s+)?\d+\/\d+|\d+\.?\d*|\d+[-–]\d+)?\s*(cups?|tbsps?|tsps?|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|liters?|litres?|cloves?|cans?|pieces?|slices?|pinch(?:es)?|dash(?:es)?|stalks?|sprigs?|heads?|bunches?|handfuls?|quarts?)?\s*(.+)/i
  );
  if (match && match[3]) {
    return { name: match[3].trim(), amount: (match[1] || '').trim(), unit: (match[2] || '').trim() };
  }
  return { name: line, amount: '', unit: '' };
}

function looksLikeIngredient(line) {
  // A line looks like an ingredient if it starts with a quantity or bullet
  return /^[-•*–]\s/.test(line) ||
    /^((?:\d+\s+)?\d+\/\d+|\d+\.?\d*)[\s]/.test(line) ||
    /^(a\s+few|a\s+pinch|some|handful)\b/i.test(line);
}

function looksLikeInstructionStart(line) {
  return /^(instructions?|directions?|steps?|method|preparation|how to (make|cook|prepare)|to (make|cook|prepare))[:\s]?$/i.test(line);
}

function looksLikeIngredientHeader(line) {
  return /^(ingredients?(\s*\(.*\))?|what you.?ll need|you.?ll need|shopping list)[:\s]?$/i.test(line);
}

function looksLikeSubsectionHeader(line) {
  // Section headers within ingredients like "Filling", "Gravy", "For the sauce:", etc.
  return /^(for\s+the\s+|for\s+)?.{2,30}:$/i.test(line) &&
    !/^\d/.test(line) &&
    line.split(' ').length <= 5;
}

function parseRecipeText(text) {
  // Normalize line endings and clean up PDF artifacts
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

  if (lines.length === 0) return { title: '', description: '', ingredients: [], instructions: '' };

  const title = lines[0];
  const ingredients = [];
  const instructionLines = [];
  let description = '';

  // Detect sections by scanning for headers
  // Strategy: find where ingredient section starts and instruction section starts
  let ingredientStart = -1;
  let instructionStart = -1;

  for (let i = 1; i < lines.length; i++) {
    if (looksLikeIngredientHeader(lines[i])) { ingredientStart = i; break; }
  }
  for (let i = 1; i < lines.length; i++) {
    if (looksLikeInstructionStart(lines[i])) { instructionStart = i; break; }
  }

  // If no explicit ingredient header, try to find ingredients by looking for quantity lines
  if (ingredientStart === -1) {
    // Find the first line that looks like an ingredient
    for (let i = 1; i < lines.length; i++) {
      if (looksLikeIngredient(lines[i])) { ingredientStart = i; break; }
    }
  }

  // If no explicit instruction header found, try to find numbered step lines
  if (instructionStart === -1) {
    for (let i = 1; i < lines.length; i++) {
      if (/^\d+[.)]\s+[A-Z]/.test(lines[i]) && i > (ingredientStart || 1)) {
        instructionStart = i;
        break;
      }
    }
  }

  // Collect description: lines before ingredient section
  const descEnd = ingredientStart > 1 ? ingredientStart : 1;
  for (let i = 1; i < descEnd; i++) {
    if (!looksLikeIngredientHeader(lines[i])) {
      description += (description ? ' ' : '') + lines[i];
    }
  }

  // Collect ingredients: from ingredientStart to instructionStart (or end)
  const ingEnd = instructionStart > 0 ? instructionStart : lines.length;
  for (let i = (ingredientStart > 0 ? ingredientStart + 1 : 1); i < ingEnd; i++) {
    const line = lines[i];
    if (looksLikeIngredientHeader(line) || looksLikeInstructionStart(line)) continue;
    if (looksLikeSubsectionHeader(line)) continue; // skip "Filling:", "Gravy:" sub-headers
    // Strip bullet chars
    const cleaned = line.replace(/^[-•*–]\s*/, '');
    if (cleaned.length < 2) continue;
    // Accept any non-blank line in this section as an ingredient
    ingredients.push(parseIngredientLine(cleaned));
  }

  // Collect instructions: from instructionStart to end
  if (instructionStart > 0) {
    for (let i = instructionStart + 1; i < lines.length; i++) {
      const line = lines[i];
      // Strip leading step numbers
      const cleaned = line.replace(/^\d+[.)]\s*/, '');
      if (cleaned.length > 1) instructionLines.push(cleaned);
    }
  }

  // Fallback: if we found no ingredients at all, scan whole text for ingredient-looking lines
  if (ingredients.length === 0) {
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (looksLikeIngredient(line) && !looksLikeInstructionStart(line)) {
        const cleaned = line.replace(/^[-•*–]\s*/, '');
        ingredients.push(parseIngredientLine(cleaned));
      }
    }
  }

  return {
    title,
    description,
    ingredients,
    instructions: instructionLines.join('\n')
  };
}

router.use(authenticate);

// Extract recipe from PDF
router.post('/extract-from-pdf', pdfUpload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'PDF file is required' });
    }
    const { text } = await pdfParse(req.file.buffer);
    const parsed = parseRecipeText(text);
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse PDF' });
  }
});

// Create recipe
router.post('/', upload.single('photo'), (req, res) => {
  const { title, description, instructions, tags } = req.body;
  let ingredients = req.body.ingredients;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  if (typeof ingredients === 'string') {
    try { ingredients = JSON.parse(ingredients); } catch { ingredients = []; }
  }

  const photo = req.file ? req.file.filename : null;

  const result = db.prepare(
    'INSERT INTO recipes (user_id, title, description, photo, instructions, tags) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, title, description || null, photo, instructions || null, tags || null);

  const recipeId = result.lastInsertRowid;

  if (Array.isArray(ingredients) && ingredients.length > 0) {
    const insert = db.prepare('INSERT INTO ingredients (recipe_id, name, amount, unit) VALUES (?, ?, ?, ?)');
    for (const ing of ingredients) {
      insert.run(recipeId, ing.name, ing.amount || null, ing.unit || null);
    }
  }

  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId);
  const ings = db.prepare('SELECT * FROM ingredients WHERE recipe_id = ?').all(recipeId);

  res.status(201).json({ ...recipe, ingredients: ings });
});

// List recipes for logged-in user
router.get('/', (req, res) => {
  const recipes = db.prepare('SELECT * FROM recipes WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(recipes);
});

// Get single recipe
router.get('/:id', (req, res) => {
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!recipe) {
    return res.status(404).json({ error: 'Recipe not found' });
  }

  const ingredients = db.prepare('SELECT * FROM ingredients WHERE recipe_id = ?').all(recipe.id);
  res.json({ ...recipe, ingredients });
});

// Update recipe
router.put('/:id', upload.single('photo'), (req, res) => {
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

  const { title, description, instructions, tags } = req.body;
  let ingredients = req.body.ingredients;

  if (!title) return res.status(400).json({ error: 'Title is required' });

  if (typeof ingredients === 'string') {
    try { ingredients = JSON.parse(ingredients); } catch { ingredients = []; }
  }

  // If new photo uploaded, delete old one
  let photo = recipe.photo;
  if (req.file) {
    if (recipe.photo) {
      const old = path.join(__dirname, '..', 'uploads', recipe.photo);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    photo = req.file.filename;
  }

  db.prepare(
    'UPDATE recipes SET title=?, description=?, photo=?, instructions=?, tags=? WHERE id=?'
  ).run(title, description || null, photo, instructions || null, tags || null, recipe.id);

  // Replace ingredients
  db.prepare('DELETE FROM ingredients WHERE recipe_id = ?').run(recipe.id);
  if (Array.isArray(ingredients) && ingredients.length > 0) {
    const insert = db.prepare('INSERT INTO ingredients (recipe_id, name, amount, unit) VALUES (?, ?, ?, ?)');
    for (const ing of ingredients) {
      if (ing.name) insert.run(recipe.id, ing.name, ing.amount || null, ing.unit || null);
    }
  }

  const updated = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipe.id);
  const ings = db.prepare('SELECT * FROM ingredients WHERE recipe_id = ?').all(recipe.id);
  res.json({ ...updated, ingredients: ings });
});

// Delete recipe
router.delete('/:id', (req, res) => {
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!recipe) {
    return res.status(404).json({ error: 'Recipe not found' });
  }

  if (recipe.photo) {
    const photoPath = path.join(__dirname, '..', 'uploads', recipe.photo);
    if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);
  }

  db.prepare('DELETE FROM recipes WHERE id = ?').run(recipe.id);
  res.json({ message: 'Recipe deleted' });
});

// All unique ingredients for logged-in user
router.get('/ingredients', authenticate, (req, res) => {
  const rows = db.prepare(`
    SELECT i.name, COUNT(DISTINCT r.id) as recipeCount
    FROM ingredients i
    JOIN recipes r ON r.id = i.recipe_id
    WHERE r.user_id = ?
    GROUP BY LOWER(i.name)
    ORDER BY recipeCount DESC
  `).all(req.user.id);
  res.json(rows);
});

// Recipes matching any of the given ingredient terms
router.get('/by-ingredients', authenticate, (req, res) => {
  const q = (req.query.q || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (q.length === 0) return res.json([]);
  const recipes = db.prepare('SELECT * FROM recipes WHERE user_id = ?').all(req.user.id);
  const result = recipes.map(recipe => {
    const ings = db.prepare('SELECT name FROM ingredients WHERE recipe_id = ?').all(recipe.id);
    const matchCount = q.filter(term => ings.some(i => i.name.toLowerCase().includes(term))).length;
    return { ...recipe, matchCount };
  }).filter(r => r.matchCount > 0).sort((a, b) => b.matchCount - a.matchCount);
  res.json(result);
});

// Recommendations — recipes sharing the most ingredients
router.get('/:id/recommendations', (req, res) => {
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!recipe) {
    return res.status(404).json({ error: 'Recipe not found' });
  }

  const myIngredients = db.prepare('SELECT LOWER(name) as name FROM ingredients WHERE recipe_id = ?').all(recipe.id);
  const names = myIngredients.map(i => i.name);

  if (names.length === 0) {
    return res.json([]);
  }

  const placeholders = names.map(() => '?').join(',');
  const recommendations = db.prepare(`
    SELECT r.*, COUNT(i.id) as shared_count
    FROM recipes r
    JOIN ingredients i ON i.recipe_id = r.id
    WHERE r.user_id = ? AND r.id != ? AND LOWER(i.name) IN (${placeholders})
    GROUP BY r.id
    ORDER BY shared_count DESC
    LIMIT 5
  `).all(req.user.id, recipe.id, ...names);

  res.json(recommendations);
});

module.exports = router;
