import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'

export default function RecipeList() {
  const [recipes, setRecipes] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/recipes').then(({ data }) => {
      setRecipes(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const filtered = recipes.filter(r => {
    const q = search.toLowerCase()
    return r.title.toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q) ||
      (r.tags || '').toLowerCase().includes(q)
  })

  if (loading) return <div className="empty-state"><p>Loading...</p></div>

  return (
    <div>
      <div className="recipe-header">
        <h1>My Recipes</h1>
        <Link to="/recipes/new" className="btn-add">+ New Recipe</Link>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search recipes..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <h2>{recipes.length === 0 ? 'No recipes yet' : 'No matches'}</h2>
          <p>{recipes.length === 0 ? 'Create your first recipe to get started!' : 'Try a different search term.'}</p>
        </div>
      ) : (
        <div className="recipe-grid">
          {filtered.map(recipe => (
            <Link to={`/recipes/${recipe.id}`} key={recipe.id} className="recipe-card">
              {recipe.photo ? (
                <img src={`/uploads/${recipe.photo}`} alt={recipe.title} className="recipe-card-img" />
              ) : (
                <div className="no-photo-placeholder">🍳</div>
              )}
              <div className="recipe-card-body">
                <h3>{recipe.title}</h3>
                {recipe.description && <p>{recipe.description}</p>}
                {recipe.tags && (
                  <div className="recipe-tags">
                    {recipe.tags.split(',').map((tag, i) => (
                      <span key={i} className="tag">{tag.trim()}</span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
