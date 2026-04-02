import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import api from '../api'

export default function RecipeEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [tags, setTags] = useState('')
  const [photo, setPhoto] = useState(null)
  const [existingPhoto, setExistingPhoto] = useState(null)
  const [ingredients, setIngredients] = useState([{ name: '', amount: '', unit: '' }])

  useEffect(() => {
    api.get(`/recipes/${id}`).then(({ data }) => {
      setTitle(data.title || '')
      setDescription(data.description || '')
      setInstructions(data.instructions || '')
      setTags(data.tags || '')
      setExistingPhoto(data.photo || null)
      setIngredients(
        data.ingredients && data.ingredients.length > 0
          ? data.ingredients.map(i => ({ name: i.name, amount: i.amount || '', unit: i.unit || '' }))
          : [{ name: '', amount: '', unit: '' }]
      )
      setLoading(false)
    }).catch(() => {
      setError('Failed to load recipe')
      setLoading(false)
    })
  }, [id])

  const addIngredient = () => setIngredients([...ingredients, { name: '', amount: '', unit: '' }])
  const removeIngredient = (i) => setIngredients(ingredients.filter((_, idx) => idx !== i))
  const updateIngredient = (i, field, value) => {
    const updated = [...ingredients]
    updated[i] = { ...updated[i], [field]: value }
    setIngredients(updated)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }

    setSaving(true)
    setError('')

    try {
      const fd = new FormData()
      fd.append('title', title)
      fd.append('description', description)
      fd.append('instructions', instructions)
      fd.append('tags', tags)
      fd.append('ingredients', JSON.stringify(ingredients.filter(i => i.name.trim())))
      if (photo) fd.append('photo', photo)

      await api.put(`/recipes/${id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      navigate(`/recipes/${id}`)
    } catch {
      setError('Failed to save recipe. Please try again.')
      setSaving(false)
    }
  }

  if (loading) return <div className="empty-state"><p>Loading...</p></div>

  return (
    <div className="recipe-form-page">
      <Link to={`/recipes/${id}`} className="btn-back">&larr; Back to recipe</Link>
      <h1>Edit Recipe</h1>

      {error && <div className="error-msg">{error}</div>}

      <form onSubmit={handleSubmit} className="recipe-form">
        <div className="form-group">
          <label>Title *</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Recipe title"
            required
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="A brief description"
            rows={3}
          />
        </div>

        <div className="form-group">
          <label>Photo</label>
          {existingPhoto && !photo && (
            <div style={{ marginBottom: 8 }}>
              <img
                src={`/uploads/${existingPhoto}`}
                alt="Current"
                style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 6 }}
              />
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Current photo — upload new to replace</p>
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={e => setPhoto(e.target.files[0] || null)}
          />
        </div>

        <div className="form-group">
          <label>Ingredients</label>
          {ingredients.map((ing, i) => (
            <div key={i} className="ingredient-row">
              <input
                type="text"
                placeholder="Amount (e.g. 1/2)"
                value={ing.amount}
                onChange={e => updateIngredient(i, 'amount', e.target.value)}
                className="ing-amount"
              />
              <input
                type="text"
                placeholder="Unit (e.g. cup)"
                value={ing.unit}
                onChange={e => updateIngredient(i, 'unit', e.target.value)}
                className="ing-unit"
              />
              <input
                type="text"
                placeholder="Ingredient name"
                value={ing.name}
                onChange={e => updateIngredient(i, 'name', e.target.value)}
                className="ing-name"
              />
              {ingredients.length > 1 && (
                <button type="button" className="btn-remove-ing" onClick={() => removeIngredient(i)}>✕</button>
              )}
            </div>
          ))}
          <button type="button" className="btn-add-ing" onClick={addIngredient}>+ Add Ingredient</button>
        </div>

        <div className="form-group">
          <label>Instructions</label>
          <textarea
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            placeholder="Step-by-step instructions..."
            rows={8}
          />
        </div>

        <div className="form-group">
          <label>Tags (comma-separated)</label>
          <input
            type="text"
            value={tags}
            onChange={e => setTags(e.target.value)}
            placeholder="dinner, quick, vegetarian"
          />
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <Link to={`/recipes/${id}`} className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  )
}
