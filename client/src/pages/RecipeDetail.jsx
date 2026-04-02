import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'

import api from '../api'

export default function RecipeDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [recipe, setRecipe] = useState(null)
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get(`/recipes/${id}`),
      api.get(`/recipes/${id}/recommendations`)
    ]).then(([recipeRes, recRes]) => {
      setRecipe(recipeRes.data)
      setRecommendations(recRes.data)
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })
  }, [id])

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this recipe?')) return
    await api.delete(`/recipes/${id}`)
    navigate('/recipes')
  }

  if (loading) return <div className="empty-state"><p>Loading...</p></div>
  if (!recipe) return <div className="empty-state"><h2>Recipe not found</h2></div>

  return (
    <div>
      <Link to="/recipes" className="btn-back">&larr; Back to recipes</Link>
      <div className="recipe-detail">
        <div className="recipe-main">
          {recipe.photo && (
            <img src={`/uploads/${recipe.photo}`} alt={recipe.title} className="recipe-photo" />
          )}
          <h1>{recipe.title}</h1>
          {recipe.tags && (
            <div className="recipe-tags" style={{ marginBottom: 16 }}>
              {recipe.tags.split(',').map((tag, i) => (
                <span key={i} className="tag">{tag.trim()}</span>
              ))}
            </div>
          )}
          {recipe.description && <p className="description">{recipe.description}</p>}

          {recipe.ingredients && recipe.ingredients.length > 0 && (
            <>
              <h2 className="section-title">Ingredients</h2>
              <ul className="ingredient-list">
                {recipe.ingredients.map((ing, i) => (
                  <li key={i}>
                    <span>{ing.amount ? `${ing.amount} ${ing.unit || ''}` : ''}</span>
                    {ing.name}
                  </li>
                ))}
              </ul>
            </>
          )}

          {recipe.instructions && (
            <>
              <h2 className="section-title">Instructions</h2>
              <div className="instructions">{recipe.instructions}</div>
            </>
          )}

          <div className="recipe-actions" style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <Link to={`/recipes/${id}/edit`} className="btn-secondary">✏️ Edit Recipe</Link>
            <button onClick={handleDelete} className="btn-delete">Delete Recipe</button>
          </div>
        </div>

        <div className="recipe-sidebar">
          <div className="recommendations-panel">
            <h3>Similar Recipes</h3>
            {recommendations.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>No similar recipes found</p>
            ) : (
              recommendations.map(rec => (
                <Link to={`/recipes/${rec.id}`} key={rec.id} className="rec-item">
                  {rec.title}
                  <span className="rec-shared">{rec.shared_count} shared ingredient{rec.shared_count !== 1 ? 's' : ''}</span>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
