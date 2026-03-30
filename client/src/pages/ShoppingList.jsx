import { useState, useEffect } from 'react'
import api from '../api'

export default function ShoppingList() {
  const [recipes, setRecipes] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [shoppingList, setShoppingList] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/recipes').then(({ data }) => {
      setRecipes(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const toggleRecipe = (id) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
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
