/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Topics from './pages/Topics';
import KnowledgeGraph from './pages/KnowledgeGraph';
import Reports from './pages/Reports';
import ReviewConsole from './pages/ReviewConsole';
import Settings from './pages/Settings';
import DecisionSupport from './pages/DecisionSupport';

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/topics" element={<Topics />} />
          <Route path="/graph" element={<KnowledgeGraph />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/review" element={<ReviewConsole />} />
          <Route path="/decision" element={<DecisionSupport />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </Router>
  );
}
