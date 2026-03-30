const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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

router.use(authenticate);

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
