import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api'

export default function RecipeNew() {
  const navigate = useNavigate()
  const [inputMethod, setInputMethod] = useState('type')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [tags, setTags] = useState('')
  const [photo, setPhoto] = useState(null)
  const [ingredients, setIngredients] = useState([{ name: '', amount: '', unit: '' }])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Paste tab state
  const [pasteText, setPasteText] = useState('')
  const [parsed, setParsed] = useState(false)

  const addIngredient = () => {
    setIngredients([...ingredients, { name: '', amount: '', unit: '' }])
  }

  const removeIngredient = (index) => {
    setIngredients(ingredients.filter((_, i) => i !== index))
  }

  const updateIngredient = (index, field, value) => {
    const updated = [...ingredients]
    updated[index] = { ...updated[index], [field]: value }
    setIngredients(updated)
  }

  const parsePastedText = () => {
    if (!pasteText.trim()) return

    const lines = pasteText.split('\n').map(l => l.trim()).filter(Boolean)

    // First non-empty line is the title
    const parsedTitle = lines[0] || ''

    // Try to find ingredient and instruction sections
    let parsedIngredients = []
    let parsedInstructions = []
    let parsedDescription = ''
    let section = 'unknown'

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      const lower = line.toLowerCase()

      if (lower.match(/^(ingredients?|what you.?ll need):?$/i)) {
        section = 'ingredients'
        continue
      }
      if (lower.match(/^(instructions?|directions?|steps?|method|preparation|how to make):?$/i)) {
        section = 'instructions'
        continue
      }
      if (lower.match(/^(description|about|summary|intro):?$/i)) {
        section = 'description'
        continue
      }

      if (section === 'ingredients') {
        // Strip list markers
        const cleaned = line.replace(/^[-•*]\s*/, '').replace(/^\d+[.)]\s*/, '')
        // Try to parse amount from start
        const match = cleaned.match(/^([\d./½¼¾⅓⅔⅛]+)\s*(cups?|tbsp|tsp|oz|lb|g|kg|ml|l|tablespoons?|teaspoons?|ounces?|pounds?|cloves?|cans?|pieces?|slices?|pinch|dash)?\s+(.+)/i)
        if (match) {
          parsedIngredients.push({ name: match[3], amount: match[1], unit: match[2] || '' })
        } else {
          parsedIngredients.push({ name: cleaned, amount: '', unit: '' })
        }
      } else if (section === 'instructions') {
        const cleaned = line.replace(/^\d+[.)]\s*/, '')
        parsedInstructions.push(cleaned)
      } else if (section === 'description') {
        parsedDescription += (parsedDescription ? ' ' : '') + line
      } else {
        // Before any section header, treat as description
        parsedDescription += (parsedDescription ? ' ' : '') + line
      }
    }

    setTitle(parsedTitle)
    setDescription(parsedDescription)
    if (parsedIngredients.length > 0) setIngredients(parsedIngredients)
    if (parsedInstructions.length > 0) setInstructions(parsedInstructions.join('\n'))
    setParsed(true)
    setInputMethod('type')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('title', title)
      formData.append('description', description)
      formData.append('instructions', instructions)
      formData.append('tags', tags)
      if (photo) formData.append('photo', photo)

      const validIngredients = ingredients.filter(i => i.name.trim())
      formData.append('ingredients', JSON.stringify(validIngredients))

      const { data } = await api.post('/recipes', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      navigate(`/recipes/${data.id}`)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create recipe')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="recipe-form">
      <Link to="/recipes" className="btn-back">&larr; Back to recipes</Link>
      <h1>New Recipe</h1>

      <div className="input-tabs">
        <button
          type="button"
          className={`input-tab${inputMethod === 'type' ? ' active' : ''}`}
          onClick={() => setInputMethod('type')}
        >
          Type
        </button>
        <button
          type="button"
          className={`input-tab${inputMethod === 'paste' ? ' active' : ''}`}
          onClick={() => setInputMethod('paste')}
        >
          Paste
        </button>
      </div>

      {error && <p className="error-msg">{error}</p>}

      {inputMethod === 'paste' && (
        <div className="paste-area">
          <p style={{ color: 'var(--text-secondary)', marginBottom: 12, fontSize: '0.9rem' }}>
            Paste a full recipe below. Use headings like "Ingredients" and "Instructions" for best results.
          </p>
          <textarea
            rows="14"
            value={pasteText}
            onChange={e => { setPasteText(e.target.value); setParsed(false) }}
            placeholder={"Grandma's Chocolate Cake\n\nDescription\nA rich, moist chocolate cake.\n\nIngredients\n2 cups flour\n1 cup sugar\n3 tbsp cocoa powder\n\nInstructions\n1. Preheat oven to 350°F\n2. Mix dry ingredients\n3. Bake for 30 minutes"}
          />
          <button
            type="button"
            className="btn-primary"
            style={{ marginTop: 12 }}
            onClick={parsePastedText}
            disabled={!pasteText.trim()}
          >
            Parse &amp; Fill Form
          </button>
          {parsed && (
            <div className="parse-result">
              <p>Parsed successfully! Switched to Type tab to review and submit.</p>
            </div>
          )}
        </div>
      )}

      {inputMethod === 'type' && (
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Title *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea rows="3" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Photo</label>
            <input type="file" accept="image/*" onChange={e => setPhoto(e.target.files[0])} />
          </div>

          <h3 className="section-title">Ingredients</h3>
          {ingredients.map((ing, i) => (
            <div key={i} className="ingredient-row">
              <div className="form-group" style={{ flex: 2, marginBottom: 0 }}>
                <input placeholder="Name" value={ing.name} onChange={e => updateIngredient(i, 'name', e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <input placeholder="Amount" type="number" step="any" value={ing.amount} onChange={e => updateIngredient(i, 'amount', e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <input placeholder="Unit" value={ing.unit} onChange={e => updateIngredient(i, 'unit', e.target.value)} />
              </div>
              {ingredients.length > 1 && (
                <button type="button" className="btn-remove" onClick={() => removeIngredient(i)}>Remove</button>
              )}
            </div>
          ))}
          <button type="button" className="btn-secondary" onClick={addIngredient}>+ Add Ingredient</button>

          <div className="form-group">
            <label>Instructions</label>
            <textarea rows="6" value={instructions} onChange={e => setInstructions(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Tags (comma-separated)</label>
            <input type="text" value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g. dinner, pasta, quick" />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creating...' : 'Create Recipe'}
          </button>
        </form>
      )}
    </div>
  )
}
