import React from 'react'
import { createRoot } from 'react-dom/client'
import { Buffer } from 'buffer'
import './appkit.js'
import App from './App.jsx'
import './styles.css'

globalThis.Buffer = globalThis.Buffer || Buffer

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
