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
import DataSources from './pages/DataSources';
import ReviewConsole from './pages/ReviewConsole';

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/topics" element={<Topics />} />
          <Route path="/graph" element={<KnowledgeGraph />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/sources" element={<DataSources />} />
          <Route path="/review" element={<ReviewConsole />} />
        </Routes>
      </Layout>
    </Router>
  );
}
