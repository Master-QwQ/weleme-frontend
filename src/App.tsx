import { useEffect } from 'react'
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'
import { useAppStore } from './store/useAppStore'
import Preload from './pages/Preload'
import Auth from './pages/Auth'
import Register from './pages/Register'
import Loading from './pages/Loading'
import Chat from './pages/Chat'

function App() {
  const theme = useAppStore((state) => state.theme)

  useEffect(() => {
    // Apply theme to document root
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(theme)
  }, [theme])

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Preload />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/register" element={<Register />} />
        <Route path="/loading" element={<Loading />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}

export default App
