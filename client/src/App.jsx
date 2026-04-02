import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import RecipeList from './pages/RecipeList.jsx'
import RecipeNew from './pages/RecipeNew.jsx'
import RecipeDetail from './pages/RecipeDetail.jsx'
import ShoppingList from './pages/ShoppingList.jsx'
import IngredientBrowser from './pages/IngredientBrowser.jsx'
import RecipeEdit from './pages/RecipeEdit.jsx'
import './App.css'

function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user')
    return saved ? JSON.parse(saved) : null
  })
  const navigate = useNavigate()

  const login = (userData, token) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
    navigate('/login')
  }

  if (!user) {
    return (
      <div className="app">
        <Routes>
          <Route path="/login" element={<Login onLogin={login} />} />
          <Route path="/register" element={<Register onLogin={login} />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </div>
    )
  }

  return (
    <div className="app">
      <nav className="navbar">
        <Link to="/recipes" className="nav-brand">
          <img src="/logo.png" alt="OnlyPans" />
          OnlyPans
        </Link>
        <div className="nav-links">
          <Link to="/recipes">Recipes</Link>
          <Link to="/shopping-list">Shopping List</Link>
          <Link to="/ingredients">🏷️ By Ingredient</Link>
          <button onClick={logout} className="btn-logout">Logout</button>
        </div>
      </nav>
      <main className="main-content">
        <Routes>
          <Route path="/recipes" element={<RecipeList />} />
          <Route path="/recipes/new" element={<RecipeNew />} />
          <Route path="/recipes/:id" element={<RecipeDetail />} />
          <Route path="/shopping-list" element={<ShoppingList />} />
          <Route path="/ingredients" element={<IngredientBrowser />} />
          <Route path="/recipes/:id/edit" element={<RecipeEdit />} />
          <Route path="*" element={<Navigate to="/recipes" />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
