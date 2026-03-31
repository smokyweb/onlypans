import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

export default function IngredientBrowser() {
  const [ingredients, setIngredients] = useState([])
  const [selected, setSelected] = useState([])
  const [matchingRecipes, setMatchingRecipes] = useState([])
  const [checkedRecipes, setCheckedRecipes] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [recipeLoading, setRecipeLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/ingredients').then(r => {
      setIngredients(r.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (selected.length === 0) {
      setMatchingRecipes([])
      return
    }
    setRecipeLoading(true)
    api.get('/recipes/by-ingredients', { params: { q: selected.join(',') } })
      .then(r => { setMatchingRecipes(r.data); setRecipeLoading(false) })
      .catch(() => setRecipeLoading(false))
  }, [selected])

  const toggle = (name) => {
    setSelected(s => s.includes(name) ? s.filter(x => x !== name) : [...s, name])
    setCheckedRecipes([])
  }

  const toggleRecipe = (id) => {
    setCheckedRecipes(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  const filtered = ingredients.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="page ingredient-browser">
      <div className="page-header">
        <h1>Shop by Ingredient</h1>
        <p className="subtitle">Find recipes based on what&apos;s on sale or what you have</p>
      </div>

      {loading ? (
        <div className="empty-state"><p>Loading ingredients...</p></div>
      ) : ingredients.length === 0 ? (
        <div className="empty-state">
          <h2>No ingredients yet</h2>
          <p>Add some recipes first and their ingredients will appear here.</p>
        </div>
      ) : (
        <>
          <div className="ingredient-search">
            <input
              className="search-input"
              placeholder="Search ingredients..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {selected.length > 0 && (
              <button className="btn-secondary" onClick={() => { setSelected([]); setCheckedRecipes([]) }}>
                Clear ({selected.length} selected)
              </button>
            )}
          </div>

          <div className="ingredient-chips">
            {filtered.map(ing => (
              <button
                key={ing.name}
                className={'chip' + (selected.includes(ing.name) ? ' chip-selected' : '')}
                onClick={() => toggle(ing.name)}
              >
                {ing.name}
                <span className="chip-count">{ing.recipeCount}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="muted">No ingredients match &quot;{search}&quot;</p>
            )}
          </div>

          {selected.length > 0 && (
            <div className="matching-recipes">
              <h2>
                Matching Recipes
                {recipeLoading ? ' ...' : ` (${matchingRecipes.length})`}
              </h2>

              {!recipeLoading && matchingRecipes.length === 0 && (
                <p className="muted">No recipes found with selected ingredients.</p>
              )}

              {matchingRecipes.map(r => (
                <div key={r.id} className="recipe-card-row" onClick={() => toggleRecipe(r.id)}>
                  <input
                    type="checkbox"
                    checked={checkedRecipes.includes(r.id)}
                    onChange={() => toggleRecipe(r.id)}
                    onClick={e => e.stopPropagation()}
                  />
                  {r.photo && (
                    <img
                      src={`/uploads/${r.photo}`}
                      alt={r.title}
                      className="recipe-thumb"
                    />
                  )}
                  <div className="recipe-card-info">
                    <span className="recipe-title">{r.title}</span>
                    <span className="match-badge">
                      {r.matchCount} ingredient{r.matchCount !== 1 ? 's' : ''} matched
                    </span>
                  </div>
                </div>
              ))}

              {checkedRecipes.length > 0 && (
                <button
                  className="btn-primary"
                  style={{ marginTop: 16 }}
                  onClick={() => navigate('/shopping-list?recipes=' + checkedRecipes.join(','))}
                >
                  Build Shopping List ({checkedRecipes.length} recipe{checkedRecipes.length !== 1 ? 's' : ''})
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
