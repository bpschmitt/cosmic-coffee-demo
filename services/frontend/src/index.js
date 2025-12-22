import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Instrumentation hook for observability
// Example: window.newrelic?.setCustomAttribute('app', 'cosmic-coffee-frontend');

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

