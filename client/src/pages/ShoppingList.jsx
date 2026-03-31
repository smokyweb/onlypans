import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import api from '../api'

export default function ShoppingList() {
  const [recipes, setRecipes] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [shoppingList, setShoppingList] = useState(null)
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(true)
  const location = useLocation()

  useEffect(() => {
    // Pre-select recipes from ?recipes=1,2,3 query param
    const params = new URLSearchParams(location.search)
    const preselect = params.get('recipes')
    const preselectIds = preselect ? preselect.split(',').map(Number).filter(Boolean) : []

    api.get('/recipes').then(({ data }) => {
      setRecipes(data)
      if (preselectIds.length > 0) {
        setSelected(new Set(preselectIds))
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Fetch recommendations when selection changes
  useEffect(() => {
    if (selected.size === 0) { setRecommendations([]); return }
    const selectedArr = [...selected]
    Promise.all(selectedArr.map(id => api.get(`/recipes/${id}/recommendations`).then(r => r.data).catch(() => [])))
      .then(results => {
        const merged = {}
        results.flat().forEach(r => {
          if (!selected.has(r.id)) {
            if (!merged[r.id] || r.shared_count > merged[r.id].shared_count) {
              merged[r.id] = r
            }
          }
        })
        setRecommendations(Object.values(merged).sort((a, b) => b.shared_count - a.shared_count).slice(0, 5))
      })
  }, [selected])

  const toggleRecipe = (id) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const addRecommended = (id) => {
    const next = new Set(selected)
    next.add(id)
    setSelected(next)
  }

  const generateList = async () => {
    if (selected.size === 0) return
    try {
      const { data } = await api.post('/shopping-list', { recipeIds: [...selected] })
      setShoppingList(data)
    } catch {
      // error handled silently
    }
  }

  const exportAsText = () => {
    if (!shoppingList) return
    const text = shoppingList.map(item => {
      const amount = item.amount ? `${item.amount} ${item.unit || ''}`.trim() : ''
      return amount ? `${item.name} — ${amount}` : item.name
    }).join('\n')
    navigator.clipboard.writeText(`Shopping List:\n${text}`)
    alert('Shopping list copied to clipboard!')
  }

  if (loading) return <div className="empty-state"><p>Loading...</p></div>

  return (
    <div className="shopping-page">
      <h1>Shopping List</h1>

      {recipes.length === 0 ? (
        <div className="empty-state">
          <h2>No recipes yet</h2>
          <p>Create some recipes first to generate a shopping list.</p>
        </div>
      ) : (
        <>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>Select recipes to generate a shopping list:</p>
          <div className="shopping-recipes">
            {recipes.map(recipe => (
              <div key={recipe.id} className="shopping-recipe-item" onClick={() => toggleRecipe(recipe.id)}>
                <input
                  type="checkbox"
                  checked={selected.has(recipe.id)}
                  onChange={() => toggleRecipe(recipe.id)}
                />
                <label>{recipe.title}</label>
              </div>
            ))}
          </div>

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <div className="recommendations-panel" style={{ marginTop: 20, marginBottom: 20 }}>
              <h3 style={{ color: 'var(--accent)', marginBottom: 12 }}>You might also like</h3>
              {recommendations.map(r => (
                <div key={r.id} className="recommendation-row">
                  <div className="recommendation-info">
                    <span className="recipe-title">{r.title}</span>
                    <span className="match-badge">{r.shared_count} shared ingredient{r.shared_count !== 1 ? 's' : ''}</span>
                  </div>
                  <button className="btn-add-rec" onClick={() => addRecommended(r.id)}>+ Add</button>
                </div>
              ))}
            </div>
          )}

          <button
            className="btn-primary"
            style={{ maxWidth: 300 }}
            onClick={generateList}
            disabled={selected.size === 0}
          >
            Generate Shopping List ({selected.size} recipe{selected.size !== 1 ? 's' : ''})
          </button>

          {shoppingList && (
            <div className="shopping-result" style={{ marginTop: 24 }}>
              <h2>Your Shopping List</h2>
              {shoppingList.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)' }}>No ingredients found for selected recipes.</p>
              ) : (
                <>
                  {shoppingList.map((item, i) => (
                    <div key={i} className="shopping-item">
                      <span>{item.name}</span>
                      <span className="amount">
                        {item.amount ? `${item.amount} ${item.unit || ''}`.trim() : '—'}
                      </span>
                    </div>
                  ))}
                  <button className="btn-export" onClick={exportAsText}>
                    Copy to Clipboard
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
