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

function parseRecipeText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const title = lines[0] || '';
  let ingredients = [];
  let instructions = [];
  let description = '';
  let section = 'unknown';

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    if (lower.match(/^(ingredients?|what you.?ll need):?$/i)) { section = 'ingredients'; continue; }
    if (lower.match(/^(instructions?|directions?|steps?|method|preparation|how to make):?$/i)) { section = 'instructions'; continue; }
    if (lower.match(/^(description|about|summary|intro):?$/i)) { section = 'description'; continue; }

    if (section === 'ingredients') {
      const cleaned = line.replace(/^[-•*]\s*/, '').replace(/^\d+[.)]\s*/, '');
      const match = cleaned.match(/^([\d./½¼¾⅓⅔⅛]+)\s*(cups?|tbsp|tsp|oz|lb|g|kg|ml|l|tablespoons?|teaspoons?|ounces?|pounds?|cloves?|cans?|pieces?|slices?|pinch|dash)?\s+(.+)/i);
      if (match) {
        ingredients.push({ name: match[3], amount: match[1], unit: match[2] || '' });
      } else {
        ingredients.push({ name: cleaned, amount: '', unit: '' });
      }
    } else if (section === 'instructions') {
      instructions.push(line.replace(/^\d+[.)]\s*/, ''));
    } else if (section === 'description') {
      description += (description ? ' ' : '') + line;
    } else {
      description += (description ? ' ' : '') + line;
    }
  }

  return { title, description, ingredients, instructions: instructions.join('\n') };
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
